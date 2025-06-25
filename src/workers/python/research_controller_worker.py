#!/usr/bin/env python3
"""
Research Controller Worker
Orchestrates the iterative deep research process.
"""
import json
import sys
import asyncio
import time
import os
import re
from urllib.parse import urljoin, urlparse
from typing import Dict, List, Optional, Set, Any, Tuple
import collections 
import traceback 
import heapq
from datetime import datetime

try:
    from search_scrape_worker import SearchScrapeWorker
    from content_vector_worker import ContentVectorWorker 
except ImportError:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path: 
        sys.path.append(current_dir)
    from search_scrape_worker import SearchScrapeWorker
    from content_vector_worker import ContentVectorWorker

project_root_rcw = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
LANCEDB_BASE_DIR_CVW_DEFAULT = os.path.abspath(os.path.join(project_root_rcw, 'data', 'mcp_tools', 'scalytics-search', 'vector_db_store'))
TABLE_NAME_CVW_DEFAULT = 'embeddings'


class ResearchControllerWorker:
    def __init__(self):
        self.status = "initializing"
        self.scout = SearchScrapeWorker() 
        self.librarian: Optional[ContentVectorWorker] = None 
        self.librarian_model_path: Optional[str] = None
        

    async def _initialize_librarian_if_needed(self, model_id_or_path: str, request_id: str):
        if self.librarian and self.librarian.status == "ready" and self.librarian_model_path == model_id_or_path:
            return True
        
        if self.librarian and self.librarian_model_path != model_id_or_path:
            self.librarian = None 

        if not self.librarian:
            self.librarian_model_path = model_id_or_path
            self.librarian = ContentVectorWorker(
                model_id_or_path=model_id_or_path,
            )
        
        if self.librarian.status != "ready":
            initialized = await self.librarian.initialize_resources()
            if not initialized:
                print(f"[ResearchControllerWorker {request_id}] Knowledge Librarian FAILED to initialize.", file=sys.stderr)
                self.librarian = None 
                return False
        return True

    async def _add_to_librarian(self, items_to_add: List[Dict], request_id: str, current_depth: int, 
                                parent_query: Optional[str] = None, parent_url: Optional[str] = None):
        """
        Adds processed content items to the ContentVectorWorker (Librarian).
        Enhances items with metadata before sending.
        """
        if not self.librarian or self.librarian.status != "ready":
            print(f"[ResearchControllerWorker {request_id}] Librarian not ready. Cannot add documents.", file=sys.stderr)
            return

        docs_for_librarian = []
        for item_data in items_to_add:
            if not item_data.get("content"): 
                continue

            source_info = item_data.get("source_info", {})
            if not isinstance(source_info, dict):
                source_info = {"url": str(source_info)} 

            # Populate metadata
            source_info["depth"] = current_depth
            source_info["timestamp"] = datetime.utcnow().isoformat()
            if parent_query:
                source_info["parent_query"] = parent_query
            if parent_url:
                source_info["parent_url"] = parent_url
            
            if "url" not in source_info:
                 source_info["url"] = f"generated_content_{request_id}_{time.time()}"

            doc_to_store = {
                "textContent": item_data["content"],
                "chatId": f"live_search_{request_id}",
                "source": json.dumps(source_info) 
            }
            docs_for_librarian.append(doc_to_store)
        
        if docs_for_librarian:
            try:
                self.send_message({"type": "research_progress", "requestId": request_id, "payload": {"status": "Librarian: Indexing content", "count": len(docs_for_librarian)}})
                await self.librarian.add_documents(docs_for_librarian)
            except Exception as e_lib_add:
                print(f"[ResearchControllerWorker {request_id}] Error adding documents to Librarian: {e_lib_add}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)

    async def _extract_and_score_urls(self, content_items: List[Dict], 
                                      base_url_override: Optional[str], 
                                      current_item_depth: int, 
                                      uncovered_steps: Set[str]) -> List[Tuple[float, int, str, Dict]]:
        """
        Extracts URLs from content, scores them based on relevance to uncovered steps and other heuristics,
        and prepares them for the priority queue.
        Returns a list of tuples: (priority_score, depth, url, source_info_dict)
        Lower score = higher priority.
        """
        extracted_links_for_pq = []
        url_pattern = re.compile(r'https?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', re.IGNORECASE)

        for item in content_items:
            item_content = item.get("content", "")
            item_source_info = item.get("source_info", {})
            
            current_base_url = base_url_override if base_url_override else item_source_info.get("url")
            if not item_content or not current_base_url:
                continue

            found_urls_in_content = url_pattern.findall(item_content)
            
            for rel_url in found_urls_in_content:
                try:
                    cleaned_rel_url = rel_url.strip().rstrip('.,;"\')')
                    abs_url = urljoin(current_base_url, cleaned_rel_url)
                    parsed_abs_url = urlparse(abs_url)

                    if parsed_abs_url.scheme not in ['http', 'https'] or not parsed_abs_url.netloc or abs_url == current_base_url:
                        continue
                    
                    priority_score = 0.5 
                    new_depth = current_item_depth + 1

                    link_source_info = {
                        "type": "extracted_link",
                        "url": abs_url,
                        "title": f"Link from: {item_source_info.get('title', current_base_url)}",
                        "discovery_method": "content_extraction",
                        "parent_url": current_base_url,
                        "parent_query": item_source_info.get("parent_query"), 
                        "timestamp": datetime.utcnow().isoformat(),
                        "depth": new_depth 
                    }
                    extracted_links_for_pq.append((priority_score, new_depth, abs_url, link_source_info))
                except ValueError:
                    pass 
        
        return extracted_links_for_pq

    async def perform_iterative_deep_search(self, request_id: str, initial_query: str, 
                                            reasoning_steps: List[str], api_config: Dict[str, str], 
                                            search_providers: List[str], 
                                            max_distinct_search_queries: int, 
                                            max_results_per_provider_query: int,
                                            max_url_exploration_depth: int,
                                            embedding_model_id_or_path: str):

        
        try:
            librarian_ready = await self._initialize_librarian_if_needed(embedding_model_id_or_path, request_id)
            if not librarian_ready:
                raise Exception("Knowledge Librarian (ContentVectorWorker) could not be initialized.")
        except Exception as e_lib_init:
            print(f"[ResearchControllerWorker {request_id}] Error initializing librarian: {e_lib_init}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            self.send_message({"type": "research_complete", "requestId": request_id, "success": False, "error": str(e_lib_init), "processed_items": [], "iterations_used": 0})
            return

        accumulated_processed_items_for_synthesis = [] 
        visited_urls = set()
        urls_to_explore_pq = [] 
        pq_tie_breaker_count = 0 
        
        uncovered_reasoning_steps = set(s.lower().strip() for s in reasoning_steps if s.strip()) if reasoning_steps else {initial_query.strip().lower()}
        executed_web_search_queries = set() 
        stagnation_counter = 0 
        MAX_STAGNATION_LIMIT = 3
        VECTOR_SEARCH_TOP_K = 5
        
        current_active_query = initial_query.strip()
        web_query_count = 0
        total_hops = 0
        MAX_TOTAL_HOPS = max_distinct_search_queries * (1 + max_url_exploration_depth * 2)

        initial_directive_source_info = {
            "type": "initial_directive",
            "query": initial_query,
            "reasoning_steps": reasoning_steps,
            "timestamp": datetime.utcnow().isoformat()
        }
        pq_tie_breaker_count += 1
        heapq.heappush(urls_to_explore_pq, (-1.0, pq_tie_breaker_count, 0, None, initial_directive_source_info))
        
        while urls_to_explore_pq and total_hops < MAX_TOTAL_HOPS and web_query_count < max_distinct_search_queries:
            if not urls_to_explore_pq:
                break

            priority_score, _, current_depth, current_url_to_explore, current_source_info = heapq.heappop(urls_to_explore_pq)
            total_hops += 1
            action_taken_this_hop = False
            if current_url_to_explore is None: 
                query_from_directive = current_source_info.get("query", current_active_query)
                if query_from_directive and query_from_directive not in executed_web_search_queries and web_query_count < max_distinct_search_queries:
                    current_active_query = query_from_directive
                    executed_web_search_queries.add(current_active_query)
                    self.send_message({"type": "research_progress", "requestId": request_id, "payload": {"status": "Scout: Performing web search", "query": current_active_query, "web_query_num": web_query_count + 1}})
                    try:
                        search_results_metadata = await self.scout.execute_search_pass(current_active_query, search_providers, api_config, max_results_per_provider_query)
                        web_query_count += 1 
                        action_taken_this_hop = True
                        for meta_item in search_results_metadata:
                            url = meta_item.get('url')
                            if url and url not in visited_urls:
                                new_item_depth = 1 
                                search_result_source_info = {"type": "web_search_result", "url": url, "title": meta_item.get("title"), "description": meta_item.get("description"), "provider": meta_item.get("provider"), "parent_query": current_active_query, "timestamp": datetime.utcnow().isoformat(), "depth": new_item_depth}
                                pq_tie_breaker_count += 1
                                heapq.heappush(urls_to_explore_pq, (-0.8, pq_tie_breaker_count, new_item_depth, url, search_result_source_info))
                    except Exception as e_search:
                        print(f"[ResearchControllerWorker {request_id}] Error during web search for '{current_active_query}': {e_search}", file=sys.stderr)
                        traceback.print_exc(file=sys.stderr)
                else: 
                    if query_from_directive in executed_web_search_queries: pass 
                    elif web_query_count >= max_distinct_search_queries: pass 

            elif current_url_to_explore and current_url_to_explore not in visited_urls and current_depth <= max_url_exploration_depth: 
                visited_urls.add(current_url_to_explore)
                self.send_message({"type": "research_progress", "requestId": request_id, "payload": {"status": "Scout: Scraping URL", "url": current_url_to_explore, "depth": current_depth}})
                scraped_content_items = []
                try:
                    scraped_data = await self.scout.scrape_url_with_vetting(current_url_to_explore, current_source_info)
                    action_taken_this_hop = True
                    if scraped_data and scraped_data.get("content"):
                        scraped_data_source_info = scraped_data.get("source_info", {})
                        scraped_data_source_info["depth"] = current_depth
                        scraped_data_source_info["parent_query"] = current_source_info.get("parent_query", current_active_query)
                        scraped_data_source_info["parent_url"] = current_source_info.get("url")
                        scraped_data_source_info["timestamp"] = datetime.utcnow().isoformat()
                        scraped_data["source_info"] = scraped_data_source_info
                        scraped_content_items.append(scraped_data)
                        accumulated_processed_items_for_synthesis.append(scraped_data)
                    elif scraped_data: accumulated_processed_items_for_synthesis.append(scraped_data)
                except Exception as e_scrape:
                    print(f"[ResearchControllerWorker {request_id}] Error scraping {current_url_to_explore}: {e_scrape}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
                    error_item = {"source_info": {**current_source_info, "url": current_url_to_explore, "error": str(e_scrape), "status": "scrape_error", "depth": current_depth}, "content": f"Error scraping {current_url_to_explore}: {str(e_scrape)}"}
                    accumulated_processed_items_for_synthesis.append(error_item)

                if scraped_content_items and self.librarian:
                    await self._add_to_librarian(scraped_content_items, request_id, current_depth, parent_query=current_source_info.get("parent_query", current_active_query), parent_url=current_source_info.get("url"))
                
                if scraped_content_items:
                    newly_extracted_links = await self._extract_and_score_urls(scraped_content_items, base_url_override=current_url_to_explore, current_item_depth=current_depth, uncovered_steps=uncovered_reasoning_steps)
                    for scored_link_tuple in newly_extracted_links: 
                        link_url, link_depth = scored_link_tuple[2], scored_link_tuple[1]
                        if link_url not in visited_urls and link_depth <= max_url_exploration_depth:
                            is_in_pq = any(pq_item[2] == link_depth and pq_item[3] == link_url for pq_item in urls_to_explore_pq) 
                            if not is_in_pq:
                                pq_tie_breaker_count += 1
                                heapq.heappush(urls_to_explore_pq, (scored_link_tuple[0], pq_tie_breaker_count, link_depth, link_url, scored_link_tuple[3]))
            context_for_next_query = []
            if self.librarian and self.librarian.status == "ready" and (action_taken_this_hop or total_hops % 3 == 0):
                self.send_message({"type": "research_progress", "requestId": request_id, "payload": {"status": "Librarian: Searching existing knowledge", "query": current_active_query}})
                try:
                    action_taken_this_hop = True 
                    vector_search_query_text = current_active_query
                    if uncovered_reasoning_steps: first_uncovered = sorted(list(uncovered_reasoning_steps), key=len, reverse=True)[0]; vector_search_query_text = f"{current_active_query} {first_uncovered}"
                    query_embedding_list = await self.librarian.generate_embeddings(texts=[vector_search_query_text])
                    vector_search_results_list = []
                    if query_embedding_list and query_embedding_list[0]:
                        query_emb = query_embedding_list[0]
                        vector_search_results_list = await self.librarian.search_vectors(query_vector=query_emb, limit=VECTOR_SEARCH_TOP_K)

                    if vector_search_results_list:
                        for chunk_info in vector_search_results_list:
                            chunk_content, original_source_info_str = chunk_info.get("text_content"), chunk_info.get("source")
                            distance, similarity_score = chunk_info.get("distance", 1.0), 1.0 - chunk_info.get("distance", 1.0)
                            if chunk_content: context_for_next_query.append(chunk_content[:250])
                            if original_source_info_str:
                                try:
                                    original_doc_source_info = json.loads(original_source_info_str)
                                    vs_url, vs_depth = original_doc_source_info.get("url"), original_doc_source_info.get("depth", current_depth)
                                    if vs_url and vs_url not in visited_urls and vs_depth <= max_url_exploration_depth:
                                        vs_priority_score = -similarity_score
                                        new_pq_item_source_info = {"type": "vector_search_discovery", "url": vs_url, "title": original_doc_source_info.get("title", f"From Vector Search: {vs_url}"), "discovery_method": "vector_search", "similarity_score": similarity_score, "original_chunk_content_preview": chunk_content[:100], "parent_query": original_doc_source_info.get("parent_query", current_active_query), "original_depth_of_source": original_doc_source_info.get("depth"), "timestamp": datetime.utcnow().isoformat(), "depth": vs_depth}
                                        is_in_pq = any(pq_item[2] == vs_depth and pq_item[3] == vs_url for pq_item in urls_to_explore_pq) 
                                        if not is_in_pq:
                                            pq_tie_breaker_count += 1
                                            heapq.heappush(urls_to_explore_pq, (vs_priority_score, pq_tie_breaker_count, vs_depth, vs_url, new_pq_item_source_info))
                                except json.JSONDecodeError: print(f"[ResearchControllerWorker {request_id}] Error decoding original_source_info_str from vector search result: '{original_source_info_str}'", file=sys.stderr)                    
                except Exception as e_vec_search: print(f"[ResearchControllerWorker {request_id}] Error during vector search: {e_vec_search}", file=sys.stderr); traceback.print_exc(file=sys.stderr)
            
            try:
                accumulated_processed_items_for_synthesis = self._deduplicate_items(accumulated_processed_items_for_synthesis)
            except Exception as e_dedup:
                print(f"[ResearchControllerWorker {request_id}] CRITICAL ERROR during _deduplicate_items: {e_dedup}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                self.send_message({"type": "research_complete", "requestId": request_id, "success": False, "error": f"Error in _deduplicate_items: {str(e_dedup)}", "processed_items": [], "iterations_used": total_hops})
                return 

            try:
                newly_covered_steps_this_iteration = self._check_coverage(accumulated_processed_items_for_synthesis, uncovered_reasoning_steps)
            except Exception as e_coverage:
                print(f"[ResearchControllerWorker {request_id}] CRITICAL ERROR during _check_coverage: {e_coverage}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                self.send_message({"type": "research_complete", "requestId": request_id, "success": False, "error": f"Error in _check_coverage: {str(e_coverage)}", "processed_items": accumulated_processed_items_for_synthesis, "iterations_used": total_hops})
                return

            if newly_covered_steps_this_iteration:
                uncovered_reasoning_steps -= newly_covered_steps_this_iteration
                stagnation_counter = 0
            elif action_taken_this_hop: stagnation_counter +=1
            
            if not uncovered_reasoning_steps: 
                break
            if stagnation_counter >= MAX_STAGNATION_LIMIT: 
                break
            
            if uncovered_reasoning_steps and web_query_count < max_distinct_search_queries :
                potential_next_query = self._generate_next_search_query(initial_query, uncovered_reasoning_steps, executed_web_search_queries, context_for_next_query)
                if potential_next_query and potential_next_query not in executed_web_search_queries:
                    new_directive_source_info = {"type": "generated_directive", "query": potential_next_query, "timestamp": datetime.utcnow().isoformat(), "parent_hop": total_hops}
                    pq_tie_breaker_count += 1
                    heapq.heappush(urls_to_explore_pq, (-0.9, pq_tie_breaker_count, 0, None, new_directive_source_info))
        
        final_items_for_node = []
        try:
            deduped_items = self._deduplicate_items(accumulated_processed_items_for_synthesis)
            for item in deduped_items:
                simplified_source_info = {}
                original_si = item.get("source_info", {})
                if isinstance(original_si, dict):
                    for k, v in original_si.items():
                        if isinstance(v, (str, int, float, bool, list, dict)) or v is None:
                            simplified_source_info[k] = v
                        else:
                            simplified_source_info[k] = str(v) 
                else: 
                    simplified_source_info = {"original_source_info": str(original_si)}

                final_items_for_node.append({
                    "content": item.get("content"),
                    "source_info": simplified_source_info
                })
            
            final_message = {
                "type": "research_complete", 
                "requestId": request_id, 
                "success": True, 
                "processed_items": final_items_for_node, 
                "iterations_used": total_hops, 
                "web_queries_executed": web_query_count, 
                "remaining_uncovered_steps": list(uncovered_reasoning_steps)
            }
            self.send_message(final_message)
        except Exception as e_final_send:
            print(f"[ResearchControllerWorker {request_id}] CRITICAL ERROR sending final research_complete message: {e_final_send}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            try:
                self.send_message({"type": "research_complete", "requestId": request_id, "success": False, "error": f"Error preparing/sending final results: {str(e_final_send)}", "processed_items": [], "iterations_used": total_hops})
            except Exception as e_emergency_send:
                 print(f"[ResearchControllerWorker {request_id}] CRITICAL ERROR sending emergency error message: {e_emergency_send}", file=sys.stderr)


    def _generate_next_search_query(self, initial_query: str, uncovered_steps: Set[str], 
                                   executed_queries: Set[str], context_snippets: List[str]) -> Optional[str]:
        if not uncovered_steps:
            return None
        
        sorted_uncovered_steps = sorted(list(uncovered_steps), key=len, reverse=True) 
        for step in sorted_uncovered_steps:
            potential_query = step.strip()
            if potential_query and potential_query not in executed_queries:
                return potential_query
        
        if sorted_uncovered_steps:
            first_uncovered = sorted_uncovered_steps[0].strip()
            potential_query_v1 = f"{initial_query} {first_uncovered}".strip()
            if potential_query_v1 not in executed_queries: return potential_query_v1
            potential_query_v2 = f"{first_uncovered} {initial_query}".strip()
            if potential_query_v2 not in executed_queries and potential_query_v2 != potential_query_v1: return potential_query_v2
            initial_query_essence = " ".join(initial_query.split()[:3])
            potential_query_short = f"{initial_query_essence} {first_uncovered}".strip()
            if potential_query_short not in executed_queries and len(potential_query_short) > len(first_uncovered) + 3 : return potential_query_short
        
        if context_snippets:
            first_uncovered = sorted_uncovered_steps[0].strip() if sorted_uncovered_steps else ""
            if first_uncovered:
                context_based_query = f"{first_uncovered} {context_snippets[0]}".strip()
                if context_based_query not in executed_queries: return context_based_query

        return None

    def _check_coverage(self, processed_content_items: List[Dict], reasoning_steps_to_check: Set[str]) -> Set[str]:
        newly_covered = set()
        if not reasoning_steps_to_check or not processed_content_items: return newly_covered
        for step in reasoning_steps_to_check:
            step_lower = step.lower()
            for item in processed_content_items:
                content_to_check = ""
                if item.get("content"): content_to_check += item["content"].lower() + " "
                source_info = item.get("source_info")
                if isinstance(source_info, dict):
                    if source_info.get("title"): content_to_check += source_info["title"].lower() + " "
                    if source_info.get("description"): content_to_check += source_info["description"].lower() + " "
                step_keywords = [word for word in step_lower.split() if len(word) > 2]
                if not step_keywords: 
                    if step_lower in content_to_check: newly_covered.add(step); break 
                elif all(keyword in content_to_check for keyword in step_keywords): newly_covered.add(step); break 
        return newly_covered

    def _extract_urls_from_content(self, content_items: List[Dict], max_depth_from_config: int, current_item_depth: int) -> List[Dict]:
        all_new_urls_with_source_info = []
        url_pattern = re.compile(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+')
        for item in content_items:
            item_content, item_source_info = item.get("content", ""), item.get("source_info", {}) 
            base_url = item_source_info.get("url")
            if not item_content or not base_url: continue
            found_urls = url_pattern.findall(item_content)
            for rel_url in found_urls:
                try:
                    cleaned_rel_url = rel_url.strip().rstrip('.,;"\')')
                    abs_url = urljoin(base_url, cleaned_rel_url)
                    parsed_abs_url = urlparse(abs_url)
                    if parsed_abs_url.scheme not in ['http', 'https'] or not parsed_abs_url.netloc or abs_url == base_url: continue
                    new_depth = item_source_info.get("depth", current_item_depth) + 1
                    if new_depth > max_depth_from_config: continue
                    new_link_source_info = {"type": "extracted_link_legacy", "url": abs_url, "title": f"Link from: {item_source_info.get('title', base_url)}", "discovery_method": "legacy_content_extraction", "depth": new_depth, "parent_url": base_url, "parent_query": item_source_info.get("parent_query"), "timestamp": datetime.utcnow().isoformat()}
                    all_new_urls_with_source_info.append({"url": abs_url, "source_info": new_link_source_info})
                except ValueError: pass 
        return all_new_urls_with_source_info
        
    def _deduplicate_items(self, items: List[Dict]) -> List[Dict]:
        final_deduped_items, seen_item_keys_for_dedup = [], set()
        for item in items:
            item_url, content_preview = item.get("source_info", {}).get("url"), (item.get("content") or "")[:100] 
            key = (item_url, content_preview) 
            if item_url and key not in seen_item_keys_for_dedup: final_deduped_items.append(item); seen_item_keys_for_dedup.add(key)
            elif not item_url: final_deduped_items.append(item)
        return final_deduped_items

    def send_message(self, message: Dict[str, Any]):
        try:
            for key, value in message.items():
                if hasattr(value, '__dict__') and not isinstance(value, (str, int, float, bool, list, dict, type(None))): message[key] = str(value) 
            sys.stdout.write(json.dumps(message) + '\n'); sys.stdout.flush()
        except Exception as e: print(f"[ResearchControllerWorker] Error sending message: {e}", file=sys.stderr)

    async def handle_message_async(self, message: Dict[str, Any]):
        message_type, request_id = message.get("type"), message.get("requestId")
        try:
            if message_type == "start_deep_research":
                await self.perform_iterative_deep_search(request_id, message.get("initial_query"), message.get("reasoning_steps", []), message.get("api_config", {}), message.get("search_providers", []), message.get("max_distinct_search_queries", 7), message.get("max_results_per_provider_query", 5), message.get("max_url_exploration_depth", 1), message.get("embedding_model_id_or_path", "all-MiniLM-L6-v2"))
            elif message_type == "ping": self.send_message({"type": "pong", "requestId": request_id, "time": int(time.time() * 1000)})
            else: 
                print(f"[ResearchControllerWorker] Unknown message type: {message_type}", file=sys.stderr)
                if request_id: 
                    self.send_message({"type":"error", "requestId": request_id, "error": f"Unknown message type: {message_type}"})
        except Exception as e:
            print(f"[ResearchControllerWorker {request_id}] Error in handle_message_async for type {message_type}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            if request_id and message_type == "start_deep_research": 
                self.send_message({"type": "research_complete", "requestId": request_id, "success": False, "error": f"Unhandled error in handle_message_async: {str(e)}", "processed_items": [], "iterations_used": 0})
            elif request_id: 
                 self.send_message({"type": f"{message_type}_error", "requestId": request_id, "success": False, "error": f"Unhandled error in handle_message_async for {message_type}: {str(e)}"})
    
    def run(self):
        loop = asyncio.new_event_loop(); asyncio.set_event_loop(loop)
        self.status = "ready"; self.send_message({"type":"ready", "worker_name": "ResearchControllerWorker"})
        async def read_stdin():
            reader = asyncio.StreamReader(loop=loop); protocol = asyncio.StreamReaderProtocol(reader, loop=loop)
            await loop.connect_read_pipe(lambda: protocol, sys.stdin)
            while True:
                try:
                    line_bytes = await reader.readline()
                    if not line_bytes: print("[ResearchControllerWorker] STDIN closed. Exiting.", file=sys.stderr); break
                    line = line_bytes.decode('utf-8').strip()
                    if line:
                        try: msg = json.loads(line); loop.create_task(self.handle_message_async(msg))
                        except json.JSONDecodeError: print(f"[ResearchControllerWorker] Invalid JSON: {line}", file=sys.stderr)
                        except Exception as e: print(f"[ResearchControllerWorker] Error processing line: {e}", file=sys.stderr)
                except asyncio.CancelledError: print("[ResearchControllerWorker] Stdin reader task cancelled.", file=sys.stderr); break
                except Exception as e: print(f"[ResearchControllerWorker] Stdin loop error: {e}", file=sys.stderr); break 
        try: loop.run_until_complete(read_stdin())
        except KeyboardInterrupt: print("[ResearchControllerWorker] KeyboardInterrupt, exiting.", file=sys.stderr)
        finally:
            tasks = [t for t in asyncio.all_tasks(loop=loop) if t is not asyncio.current_task(loop=loop)]
            if tasks:
                for task in tasks: task.cancel()
                try: loop.run_until_complete(asyncio.gather(*tasks, return_exceptions=True))
                except Exception as gather_exc: print(f"[ResearchControllerWorker] Exception during task gathering/cancellation: {gather_exc}", file=sys.stderr)
            
            try:
                loop.run_until_complete(asyncio.sleep(0.25)) 
            except Exception as sleep_exc:
                print(f"[ResearchControllerWorker] Exception during final sleep: {sleep_exc}", file=sys.stderr)
            
            if not loop.is_closed():
                loop.close()

if __name__ == "__main__":
    from datetime import datetime 
    worker = ResearchControllerWorker()
    worker.run()
