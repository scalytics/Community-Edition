import asyncio
from typing import Dict, List, Any, Optional, Set, Tuple
import uuid
from datetime import datetime, timezone
import re

from . import models
from . import config as app_config
from .sub_workers.llm_reasoning import LLMReasoning
from .sub_workers.content_vector import ContentVector
from .sub_workers.search_scrape import SearchScrape
from .utils import setup_logger, agent_dialogue, citations

logger = setup_logger(__name__, level="WARNING")

def _format_duration_for_finalize(seconds: float) -> str:
    seconds_int = int(seconds)
    if seconds_int < 0: return "0s"
    hours, remainder = divmod(seconds_int, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours > 0: return f"{hours}h {minutes}m {secs}s"
    if minutes > 0: return f"{minutes}m {secs}s"
    return f"{secs}s"

async def initialize_task_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    request_params = state.request_params
    api_config = state.api_config
    settings: app_config.Settings = services["settings"]

    effective_task_date_context = request_params.task_date_context
    if not effective_task_date_context:
        current_utc_datetime = datetime.now(timezone.utc)
        effective_task_date_context = current_utc_datetime.strftime("%B %d, %Y")

    initial_state_updates: Dict[str, Any] = {
        "task_id": task_id, "original_query": request_params.initial_query,
        "request_params": request_params, "api_config": api_config,
        "start_time_monotonic": asyncio.get_event_loop().time(),
        "aggregated_token_usage": [], "current_queries_for_hop": [],
        "executed_search_queries": set(), "is_cancelled_flag": asyncio.Event(),
        "search_results_this_hop": [], "processed_chunks_this_hop": [],
        "final_report_md": None, "report_sources": [],
        "task_date_context": effective_task_date_context,
        "all_processed_chunks_this_task": {},
        "visited_urls": set(),
    }
    
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="graph_initialization", message="Research graph initialized.")))
    
    content_vector: ContentVector = services["content_vector"]
    if content_vector.status != "ready":
        if not await content_vector.initialize_resources():
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="error", payload=models.SSEErrorData(error_message="Vector store critical failure.", stage="pre_flight_vector_store", is_fatal=True)))
            initial_state_updates["is_cancelled_flag"].set()
            return initial_state_updates
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_flight_vector_store_ready", message="Vector store ready.")))
    
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_flight_search_engines_complete", message="Search engine pre-flight checks complete.")))

    return initial_state_updates

async def generate_search_queries_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    llm_reasoner: LLMReasoning = services["llm_reasoner"]
    settings: app_config.Settings = services["settings"]
    api_config = state.api_config
    request_params = state.request_params
    
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="generate_search_queries", message="Generating search queries...")))

    model_info = request_params.reasoning_model_info or {}
    if not model_info.get("name"):
        model_info["name"] = settings.DEFAULT_REASONING_MODEL

    query_generation_result = await llm_reasoner.generate_search_queries(
        original_query=state.original_query,
        model_info=model_info,
        api_config=api_config,
        user_id=state.user_id,
        request_id=f"{task_id}_generate_queries",
        is_cancelled_flag=state.is_cancelled_flag
    )

    if query_generation_result.get("usage"):
        state.aggregated_token_usage.append(models.ModelUsageData(model_id=model_info.get("id", 0), model_name=model_info.get("name"), **query_generation_result["usage"]))

    if query_generation_result.get("error"):
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="error", payload=models.SSEErrorData(error_message=f"Failed to generate search queries: {query_generation_result.get('error')}", stage="query_generation", is_fatal=True)))
        state.is_cancelled_flag.set()
        return {"current_queries_for_hop": []}

    queries = query_generation_result.get("queries", [])
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="query_generation_complete", message=f"Generated {len(queries)} search queries.")))

    return {"current_queries_for_hop": queries}

async def web_search_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    current_queries = state.current_queries_for_hop 
    api_config = state.api_config
    search_scraper: SearchScrape = services["search_scraper"]
    settings: app_config.Settings = services["settings"]
    
    results_this_node: List[models.SearchResultItem] = []
    executed_this_pass: Set[str] = set() 
    
    async def _cb(pk, cq): 
        await output_queue.put(models.SSEEvent(task_id=task_id,event_type="progress",payload=models.SSEProgressData(stage=f"web_search_{pk}",message=f"Searching {pk}: '{cq[:30]}...'")))
    
    max_res = state.request_params.max_results_per_provider_query or settings.DEFAULT_MAX_RESULTS_PER_PROVIDER_QUERY

    if not current_queries:
        return {"search_results_this_hop": []}

    if current_queries:
        for query in current_queries:
            if state.is_cancelled_flag.is_set():
                break
            
            if query in state.executed_search_queries:
                continue
            
            providers_for_this_search_pass = list(state.request_params.search_providers or settings.SEARCH_PROVIDERS_DEFAULT)

            s_list, errors = await search_scraper.execute_search_pass(
                query=query, 
                search_providers=providers_for_this_search_pass, 
                api_config=api_config, 
                max_results_per_query=max_res, 
                progress_callback=_cb,
                is_fact_checking_pass=False, 
                is_cancelled_flag=state.is_cancelled_flag 
            )

            for item_dict in s_list:
                if item_dict.get('url') and isinstance(item_dict.get('url'), str) and item_dict.get('url').strip():
                    try: results_this_node.append(models.SearchResultItem(**item_dict))
                    except Exception as e_model: pass
                else: pass

            for p, e in errors.items(): 
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"web_search_provider_error_{p}", message=f"Warning: Provider {p} error: {e}")))
            executed_this_pass.add(query) 

    updated_executed_queries = state.executed_search_queries.copy()
    updated_executed_queries.update(executed_this_pass)
    
    await output_queue.put(models.SSEEvent(task_id=task_id,event_type="progress",payload=models.SSEProgressData(stage=f"search_done", message=f"Web search phase complete. Found {len(results_this_node)} items for processing.")))
    
    return {
        "search_results_this_hop": results_this_node, 
        "executed_search_queries": updated_executed_queries, 
    }

async def process_content_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    search_results: List[models.SearchResultItem] = state.search_results_this_hop
    search_scraper: SearchScrape = services["search_scraper"]
    content_vector: ContentVector = services["content_vector"]
    settings: app_config.Settings = services["settings"]

    if not search_results:
        return {"processed_chunks_this_hop": []}

    processed_chunks_for_node: List[models.ContentChunk] = []
    
    visited_urls_updated = state.visited_urls.copy()
    all_processed_chunks_this_task_updated = state.all_processed_chunks_this_task.copy()
    
    unique_search_results_map: Dict[str, models.SearchResultItem] = {}
    for sr in search_results:
        if sr.url and sr.url not in unique_search_results_map:
            unique_search_results_map[sr.url] = sr
    
    urls_to_process_this_pass: List[str] = []
    for url, sr_item in unique_search_results_map.items():
        if url in visited_urls_updated: continue
        urls_to_process_this_pass.append(url)

    scrape_tasks = []
    urls_being_scraped = []
    for url_to_scrape in urls_to_process_this_pass[:settings.LIVE_SEARCH_SCRAPE_CONCURRENCY]:
        search_result_item = unique_search_results_map[url_to_scrape]
        original_source_info_for_scrape = {"title": search_result_item.title, "snippet": search_result_item.snippet, "provider": search_result_item.provider_name, "source_query": search_result_item.query_phrase_used, "task_id": task_id}
        scrape_tasks.append(search_scraper.scrape_url_with_vetting_enhanced(url=url_to_scrape, original_source_info=original_source_info_for_scrape, is_cancelled_flag=state.is_cancelled_flag))
        urls_being_scraped.append(url_to_scrape)
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"scraping_{url_to_scrape[:30]}", message=f"Scraping: {url_to_scrape}")))
    
    scrape_results_outputs = await asyncio.gather(*scrape_tasks, return_exceptions=True)

    for i, scrape_result_item_or_exc in enumerate(scrape_results_outputs):
        if state.is_cancelled_flag.is_set():
            break
        url = urls_being_scraped[i]
        visited_urls_updated.add(url)

        if isinstance(scrape_result_item_or_exc, Exception):
            continue
        else: scrape_output = scrape_result_item_or_exc

        if not scrape_output.get("content"): continue
        
        content_text = scrape_output.get("content")
        
        page_title = scrape_output.get("title") or "Web Source"

        chunk_texts = await content_vector.chunk_text(text=content_text, chunk_size=state.request_params.chunk_size_words or settings.DEFAULT_CHUNK_SIZE_WORDS, chunk_overlap=state.request_params.chunk_overlap_words or settings.DEFAULT_CHUNK_OVERLAP_WORDS)
        for idx, chunk_text_content in enumerate(chunk_texts):
            if state.is_cancelled_flag.is_set():
                break
            chunk_id = str(uuid.uuid4())
            chunk_metadata = {
                "original_url": url, 
                "page_title": page_title, 
            }
            chunk_obj = models.ContentChunk(chunk_id=chunk_id, original_url=url, page_title=page_title, text_content=chunk_text_content, chunk_index_in_page=idx, depth=0, vector_metadata=chunk_metadata)
            processed_chunks_for_node.append(chunk_obj)
            all_processed_chunks_this_task_updated[chunk_id] = chunk_obj
    
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"content_processing_complete", message=f"Content processing complete. {len(processed_chunks_for_node)} new chunks processed.")))
    return {"processed_chunks_this_hop": processed_chunks_for_node, "all_processed_chunks_this_task": all_processed_chunks_this_task_updated, "visited_urls": visited_urls_updated}

async def synthesize_report_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    llm_reasoner: LLMReasoning = services["llm_reasoner"]
    settings: app_config.Settings = services["settings"]
    current_aggregated_tokens = list(state.aggregated_token_usage)
    
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="synthesis_start", message=agent_dialogue.SYNTHESIS_START)))

    chunks_for_synthesis = state.processed_chunks_this_hop

    if not chunks_for_synthesis:
        final_report_md = agent_dialogue.SYNTHESIS_NO_CONTENT_FALLBACK
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="markdown_chunk", payload=models.SSEMarkdownChunkData(chunk_id=0, content=final_report_md, is_final_chunk=True)))
        return {"final_report_md": final_report_md, "report_sources": [], "aggregated_token_usage": current_aggregated_tokens}
    
    synthesis_model_info = state.request_params.synthesis_model_info or state.request_params.reasoning_model_info or {}
    if not synthesis_model_info.get("name"):
        synthesis_model_info["name"] = settings.DEFAULT_REASONING_MODEL
    
    draft_synthesis_response = await llm_reasoner.synthesize_initial_draft(
        original_user_query=state.original_query, 
        accumulated_top_chunks_text=chunks_for_synthesis,
        model_info=synthesis_model_info, 
        api_config=state.api_config, 
        user_id=state.user_id, 
        request_id=f"{task_id}_synthesis_draft_graph", 
        is_cancelled_flag=state.is_cancelled_flag
    )
    if draft_synthesis_response.get("usage"):
        current_aggregated_tokens.append(models.ModelUsageData(model_id=synthesis_model_info.get("id",0), model_name=synthesis_model_info.get("name"), **draft_synthesis_response["usage"]))
    
    final_report_md = draft_synthesis_response.get("draft_text", agent_dialogue.SYNTHESIS_DRAFT_ERROR_FALLBACK)
    
    report_with_short_markers, llm_generated_citation_map = citations.extract_and_map_llm_citations(final_report_md)
    
    report_sources_list_for_payload: List[models.ReportSourceItem] = []
    sources_md_lines = ["\n\n---\n\n## Sources\n"]
    
    all_contributing_urls = set(chunk.original_url for chunk in chunks_for_synthesis if chunk.original_url)

    if all_contributing_urls:
        source_items = []
        for url in all_contributing_urls:
            source_chunk_info = next((chunk for chunk in chunks_for_synthesis if chunk.original_url == url), None)
            title = source_chunk_info.page_title if source_chunk_info else "Web Source"
            source_items.append(models.ReportSourceItem(url=url, title=title))

        source_items.sort(key=lambda x: x.url)
        
        next_s_marker = 1
        for item in source_items:
            item.citation_marker = f"[S{next_s_marker}]"
            next_s_marker += 1

        for item in source_items:
            md_line = f"- {item.citation_marker} [{item.title}]({item.url})"
            sources_md_lines.append(md_line)
        
        report_sources_list_for_payload = source_items
    else:
        sources_md_lines.append("No primary web sources cited.")
        
    sources_md_section = "\n".join(sources_md_lines)
    report_date_line = f"\n\n---\n*Report generated based on information available up to or relevant to: {state.task_date_context}*" if state.task_date_context else ""
    final_report_md_with_sources_and_date = report_with_short_markers + report_date_line + sources_md_section

    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="markdown_chunk", payload=models.SSEMarkdownChunkData(chunk_id=0, content=final_report_md_with_sources_and_date, is_final_chunk=True)))

    return {
        "final_report_md": final_report_md_with_sources_and_date,
        "report_sources": report_sources_list_for_payload, 
        "aggregated_token_usage": current_aggregated_tokens, 
    }

async def finalize_task_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    duration_display = "N/A"
    if state.start_time_monotonic:
        duration_display = _format_duration_for_finalize(asyncio.get_event_loop().time() - state.start_time_monotonic)
    
    complete_payload = models.SSECompleteData(
        message="Research completed successfully.", 
        detailed_token_usage=state.aggregated_token_usage, 
        report_sources=state.report_sources, 
        stat_duration_display=duration_display, 
    )
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="complete", payload=complete_payload))
    return {}
