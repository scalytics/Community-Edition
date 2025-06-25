#!/usr/bin/env python3
"""
Search Scrape Worker (Field Scout)
Handles direct interactions with web search engines and webpage/document scraping.
Performs source vetting.
"""
import json
import sys
import asyncio
import time
from typing import Dict, List, Optional, Any
from fake_useragent import UserAgent
import re 

from duckduckgo_search import DDGS 
from googleapiclient.discovery import build as build_google_service
import requests
import trafilatura
from brave import Brave
from scholarly import scholarly
import wikipediaapi
from io import StringIO, BytesIO
from pdfminer.high_level import extract_text_to_fp
from pdfminer.layout import LAParams
from urllib.parse import urlparse
import whois
from datetime import datetime, timedelta
import sqlite3 
import os
import traceback

# --- Environment Setup ---
project_root_ssw = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')) 
DB_PATH_SSW = os.path.join(project_root_ssw, 'data', 'community.db')
WHOIS_CACHE_SSW = {} 
WHOIS_CACHE_EXPIRY_SECONDS_SSW = 3600 * 24

class SearchScrapeWorker:
    def __init__(self, db_path: Optional[str] = None):
        self.ua = UserAgent()
        self.db_path = db_path if db_path else DB_PATH_SSW
        if not hasattr(self, 'whois_cache_ssw'):
            self.whois_cache_ssw = {}

    def _get_sqlite_connection_ssw(self):
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row 
            return conn
        except sqlite3.Error as e:
            print(f"[SearchScrapeWorker] Error connecting to SQLite: {e}", file=sys.stderr)
            return None

    def _get_domain_from_url_ssw(self, url_string: Any) -> Optional[str]:
        url_str = url_string
        if hasattr(url_string, '__str__'): url_str = str(url_string)
        if not url_str or not isinstance(url_str, str) or not url_str.startswith(('http://', 'https://')): return None
        try: return urlparse(url_str).netloc.replace('www.', '')
        except Exception: return None

    def _is_https_ssw(self, url_string: Any) -> bool:
        url_str = url_string
        if hasattr(url_string, '__str__'): url_str = str(url_string)
        if not url_str or not isinstance(url_str, str): return False
        try: return urlparse(url_str).scheme == 'https'
        except Exception: return False

    def _get_domain_age_days_ssw(self, domain: str) -> Optional[int]:
        if not domain: return None
        cached = self.whois_cache_ssw.get(domain)
        if cached and (datetime.now() - cached['timestamp']) < timedelta(seconds=WHOIS_CACHE_EXPIRY_SECONDS_SSW):
            return cached['age_days']
        try:
            info = whois.whois(domain)
            cd = info.creation_date
            if isinstance(cd, list): cd = cd[0] if cd else None
            if cd:
                age = (datetime.now() - cd).days
                self.whois_cache_ssw[domain] = {'age_days': age, 'timestamp': datetime.now()}
                return age
        except Exception as e:
            pass
        self.whois_cache_ssw[domain] = {'age_days': None, 'timestamp': datetime.now()}
        return None

    def _get_domain_trust_profile_ssw(self, domain: str) -> Optional[Dict]:
        conn = self._get_sqlite_connection_ssw()
        if not conn: return None
        try:
            cur = conn.cursor()
            cur.execute("SELECT * FROM domain_trust_profiles WHERE domain = ?", (domain,))
            row = cur.fetchone()
            if row: return dict(row)
            parts = domain.split('.')
            for i in range(len(parts)):
                pattern = '*.' + '.'.join(parts[i:])
                cur.execute("SELECT * FROM domain_trust_profiles WHERE domain = ? AND tld_type_bonus > 0", (pattern,))
                row = cur.fetchone()
                if row: return dict(row)
        except sqlite3.Error as e:
            print(f"[SearchScrapeWorker] SQLite error for {domain}: {e}", file=sys.stderr)
        finally:
            if conn: conn.close()
        return None

    def _ensure_domain_profile_ssw(self, domain: str, url_string: str) -> Dict:
        profile = self._get_domain_trust_profile_ssw(domain)
        signals = {
            'domain': domain, 'trust_score': 0.5, 'is_https': self._is_https_ssw(url_string),
            'domain_age_days': self._get_domain_age_days_ssw(domain) 
        }
        source_trust_type_for_object = 'provisional'

        if profile:
            for key in signals:
                if key in profile:
                    signals[key] = profile[key]
            
            source_trust_type_for_object = 'tld_pattern' if profile.get('domain','').startswith('*.') else 'specific_manual'
            if profile.get('domain','').startswith('*.'): 
                 signals['is_https'] = self._is_https_ssw(url_string)
                 signals['domain_age_days'] = self._get_domain_age_days_ssw(domain)
            signals['source_trust_type'] = source_trust_type_for_object 
            return signals
        
        conn = self._get_sqlite_connection_ssw()
        if not conn: 
            signals['source_trust_type'] = source_trust_type_for_object 
            return signals
        try:
            score = 0.4
            if signals['is_https']: score += 0.05
            if signals['domain_age_days'] is not None:
                if signals['domain_age_days'] > 730: score += 0.1
                elif signals['domain_age_days'] < 180: score -= 0.05
            if domain and any(domain.endswith(tld) for tld in (".gov", ".edu", ".org")): score += 0.1
            signals['trust_score'] = max(0, min(1, score))
            cur = conn.cursor()
            cur.execute("""
                INSERT OR IGNORE INTO domain_trust_profiles 
                (domain, trust_score, is_https, domain_age_days, tld_type_bonus, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (domain, signals['trust_score'], signals['is_https'], signals['domain_age_days'], 0, datetime.now().isoformat(), datetime.now().isoformat()))
            conn.commit()
        except sqlite3.Error as e:
            print(f"[SearchScrapeWorker] SQLite error ensuring profile for {domain}: {e}", file=sys.stderr)
        finally: 
            if conn: conn.close()
        
        signals['source_trust_type'] = source_trust_type_for_object 
        return signals

    async def _scrape_url_content_internal(self, target_url: str, source_info: Dict) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        scraped_content_text = None 
        def sync_scrape(): 
            nonlocal scraped_content_text
            try:
                downloaded = trafilatura.fetch_url(target_url, user_agent=self.ua.random, timeout=20)
                if downloaded:
                    content_extracted = trafilatura.extract(downloaded, include_comments=False, include_tables=True, no_fallback=True, favor_precision=True)
                    if content_extracted: scraped_content_text = content_extracted.strip()
            except Exception: pass
        try: await loop.run_in_executor(None, sync_scrape)
        except Exception: pass
        
        final_content = scraped_content_text if scraped_content_text else source_info.get("description")
        return {"content": final_content, "source_info": source_info}


    async def _scrape_pdf_url_internal(self, target_url: str, source_info: Dict) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        pdf_content_text = None
        def sync_scrape_pdf(): 
            nonlocal pdf_content_text
            try:
                r = requests.get(target_url, headers={"User-Agent": self.ua.random}, timeout=20, stream=True)
                r.raise_for_status()
                content_type_header = r.headers.get('Content-Type', '')
                if not isinstance(content_type_header, str) or 'application/pdf' not in content_type_header.lower(): return
                bio = BytesIO(r.content); sio = StringIO()
                extract_text_to_fp(bio, sio, laparams=LAParams(), output_type='text', codec='utf-8')
                content = sio.getvalue(); sio.close(); bio.close()
                if content: pdf_content_text = content.strip()
            except Exception: pass
        try: await loop.run_in_executor(None, sync_scrape_pdf)
        except Exception: pass
        return {"content": pdf_content_text, "source_info": source_info}

    def _get_scholar_pub_url_ssw(self, pub: Dict) -> Optional[str]:
        return pub.get('eprint_url') or pub.get('pub_url')

    async def execute_search_pass(self, query: str, search_providers: List[str], 
                                  api_config: Dict[str, str], max_results: int) -> List[Dict[str, Any]]:
        all_search_metadata = []
        loop = asyncio.get_event_loop()
        any_selected_provider_success = False

        brave_key = api_config.get("BRAVE_SEARCH_API_KEY")
        google_key = api_config.get("GOOGLE_API_KEY")
        google_cx = api_config.get("GOOGLE_CX")
        bing_key = api_config.get("BING_API_KEY")

        def _sync_brave():
            if not brave_key: return []
            raw_res = Brave(brave_key).search(q=query, count=max_results) 
            return [{"url": r.url, "title": r.title, "description": r.description} for r in raw_res.web.results] if raw_res and hasattr(raw_res, 'web') and hasattr(raw_res.web, 'results') else []
        
        def _sync_google():
            if not google_key or not google_cx: return []
            service = build_google_service("customsearch", "v1", developerKey=google_key, cache_discovery=False)
            res = service.cse().list(q=query, cx=google_cx, num=max_results).execute()
            return [{"url": i.get('link'), "title": i.get('title'), "description": i.get('snippet')} for i in res.get('items', [])] if res else []

        def _sync_bing():
            if not bing_key: return []
            headers = {"Ocp-Apim-Subscription-Key": bing_key, "User-Agent": self.ua.random}
            params = {"q": query, "count": max_results, "mkt": "en-US"}
            r = requests.get("https://api.bing.microsoft.com/v7.0/search", headers=headers, params=params, timeout=10)
            r.raise_for_status(); res = r.json()
            return [{"url": i.get('url'), "title": i.get('name'), "description": i.get('snippet')} for i in res.get('webPages', {}).get('value', [])] if res else []

        def _sync_ddgs(ddg_query_keywords): 
            with DDGS(headers={'User-Agent': self.ua.random}) as ddgs:
                return list(ddgs.text(keywords=ddg_query_keywords, region='us-en', safesearch='moderate', max_results=max_results))

        def _sync_scholar():
            results = []
            # For scholarly, the query is typically a string. The quote_from_bytes error might be internal
            # to how it handles certain characters or if it tries to re-quote parts of the query.
            # One common cause is if the query string itself contains byte-like escape sequences
            # that are misinterpreted. For now, pass query as is.
            try:
                search_gen = scholarly.search_pubs(query) 
                for _ in range(max_results):
                    item = next(search_gen, None)
                    if item is None: break
                    results.append(item)
            except Exception as e_scholarly_detail:
                print(f"[SearchScrapeWorker] DETAILED Scholarly search error for query '{query}': {type(e_scholarly_detail).__name__} - {e_scholarly_detail}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr) 
            return results
            
        def _sync_wiki():
            wiki = wikipediaapi.Wikipedia(f'ScoutBot/1.0 ({self.ua.random})', 'en')
            page = wiki.page(query)
            if page and page.exists():
                return [{"url": page.fullurl, "title": page.title, "description": page.summary[:3000]}]
            return []

        async def _process_results(provider_results: List[Dict], provider_name: str):
            nonlocal any_selected_provider_success
            if provider_results: any_selected_provider_success = True
            for r_item in provider_results:
                url_obj, title, desc = r_item.get('url'), r_item.get("title"), r_item.get("description")
                url_str = str(url_obj) if url_obj else None

                domain = self._get_domain_from_url_ssw(url_str)
                trust = self._ensure_domain_profile_ssw(domain, url_str) if domain else {}
                
                meta = {"url": url_str, "title": str(title) if title else None, "description": str(desc) if desc else None, "provider": provider_name, **trust}
                if provider_name == "Google Scholar":
                    meta.update({
                        "authors": [str(a) for a in r_item.get("bib",{}).get('author',[])], # Ensure authors are strings
                        "venue": str(r_item.get("bib",{}).get('venue')) if r_item.get("bib",{}).get('venue') else None,
                        "year": str(r_item.get("bib",{}).get('pub_year')) if r_item.get("bib",{}).get('pub_year') else None
                    })
                all_search_metadata.append(meta)

        provider_map = {
            "brave": _sync_brave, "google": _sync_google, "bing": _sync_bing, 
            "openalex": _sync_scholar, "wikipedia": _sync_wiki
        }
        
        providers_to_run_set = set(search_providers)
        if not providers_to_run_set: 
            providers_to_run_set.update(["duckduckgo", "openalex", "wikipedia"]) 

        # Run specified providers first
        SCHOLARLY_TIMEOUT_SECONDS = 30.0 

        for provider_key in list(providers_to_run_set): 
            if provider_key == "duckduckgo": continue 
            if provider_key in provider_map:
                try:
                    if provider_key == "openalex":
                        future = loop.run_in_executor(None, provider_map[provider_key])
                        results = await asyncio.wait_for(future, timeout=SCHOLARLY_TIMEOUT_SECONDS)
                    else:
                        results = await loop.run_in_executor(None, provider_map[provider_key])
                    
                    await _process_results(results, provider_key.replace("_", " ").title())
                except asyncio.TimeoutError:
                    print(f"[SearchScrapeWorker] Timeout for {provider_key} with query '{query}' after {SCHOLARLY_TIMEOUT_SECONDS}s. Will attempt DDG fallback.", file=sys.stderr)
                    if "duckduckgo" not in providers_to_run_set:
                         providers_to_run_set.add(f"duckduckgo_fallback_{provider_key}")
                except Exception as e:
                    print(f"[SearchScrapeWorker] Error with {provider_key} for query '{query}': {e}. Will attempt DDG fallback if DDG is not already primary.", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr) 
                    if "duckduckgo" not in providers_to_run_set: 
                         providers_to_run_set.add(f"duckduckgo_fallback_{provider_key}")


        run_ddg_main = "duckduckgo" in providers_to_run_set
        run_ddg_fallback = any(p.startswith("duckduckgo_fallback_") for p in providers_to_run_set) and not any_selected_provider_success

        if run_ddg_main or run_ddg_fallback:
            ddg_label = "DuckDuckGo"
            if run_ddg_fallback and not run_ddg_main : 
                failed_provider_keys = [p.split("duckduckgo_fallback_")[1] for p in providers_to_run_set if p.startswith("duckduckgo_fallback_")]
                if failed_provider_keys:
                    ddg_label = f"DuckDuckGo ({failed_provider_keys[0].replace('_',' ').title()} Fallback)"
                else: 
                    ddg_label = "DuckDuckGo (General Fallback)"
            elif run_ddg_main and run_ddg_fallback and not any_selected_provider_success: 
                 ddg_label = "DuckDuckGo (Primary/Fallback)"


            try:
                results = await loop.run_in_executor(None, _sync_ddgs, query) 
                await _process_results(results, ddg_label)
            except Exception as e:
                print(f"[SearchScrapeWorker] DDG search error ({ddg_label}) for query '{query}': {e}", file=sys.stderr)
        
        return all_search_metadata

    async def scrape_url_with_vetting(self, url: str, original_source_info: Optional[Dict] = None) -> Dict[str, Any]:
        source_info_to_use = original_source_info.copy() if original_source_info else {}
        
        if 'url' not in source_info_to_use: source_info_to_use['url'] = url
        if 'provider' not in source_info_to_use: source_info_to_use['provider'] = 'direct_scrape'

        if not source_info_to_use.get('domain'): 
            domain = self._get_domain_from_url_ssw(url)
            if domain:
                trust_signals = self._ensure_domain_profile_ssw(domain, url)
                source_info_to_use.update(trust_signals)
            else: 
                source_info_to_use.setdefault('trust_score', 0.3) 
                source_info_to_use.setdefault('is_https', self._is_https_ssw(url))
                source_info_to_use.setdefault('source_trust_type', 'unparseable_domain')


        url_str = str(url) if url else ""
        if url_str.lower().endswith('.pdf'):
            return await self._scrape_pdf_url_internal(url_str, source_info_to_use)
        else:
            return await self._scrape_url_content_internal(url_str, source_info_to_use)
