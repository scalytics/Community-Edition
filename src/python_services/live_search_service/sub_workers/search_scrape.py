"""
Search Scrape Module
Handles direct interactions with web search engines and webpage/document scraping.
Uses Scrapy for robust HTML/XML fetching and parsing, and pdfminer for PDFs.
Performs source vetting.
"""
import asyncio
import time
import os
import re
import json
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import urlparse, urljoin
from datetime import datetime, timedelta
import sqlite3
import traceback
import random
import sys

import pyalex
from pyalex import Works
from duckduckgo_search import DDGS
from googleapiclient.discovery import build as build_google_service
import requests
import wikipediaapi
from io import StringIO, BytesIO
from readability import Document
from pdfminer.high_level import extract_text_to_fp
from pdfminer.layout import LAParams
import whois
import tldextract # Added import
import scrapy
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from scrapy_playwright.page import PageMethod
from scrapy.http import HtmlResponse, Response as ScrapyResponse
from scrapy_playwright.handler import ScrapyPlaywrightDownloadHandler

from .. import models # Import models for ExtractedLinkItem
from .. import config as app_config
from ..utils import setup_logger
from ..utils.rate_limit_manager import get_rate_limit_manager, RateLimitManager # Import the getter and class for type hint
from .academic_site_handler import AcademicSiteHandler # Import AcademicSiteHandler
import logging
# from urllib.parse import urlparse # Already imported above

# Import the new Brave parser
from ..utils.brave_search_parser import BraveResponseParser, BraveAPIResult, BraveResponseType

logger = setup_logger(__name__, level=app_config.settings.LOG_LEVEL)
logging.getLogger('wikipediaapi').setLevel(logging.WARNING)
logging.getLogger('scrapy').setLevel(logging.WARNING) # Quieten Scrapy logs a bit more

def validate_url_accessibility(url: str, timeout: int = 5) -> bool:
    """
    Check if URL is accessible (optional verification)
    """
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return False
        
        response = requests.head(url, timeout=timeout, allow_redirects=True, headers={'User-Agent': random.choice(COMMON_USER_AGENTS)})
        return response.status_code < 400
    except requests.RequestException: 
        return False
    except Exception: 
        return False

COMMON_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
]

LEGAL_KEYWORDS = [
    "case", "court", "legal", "law", "statute", "plaintiff", "defendant", 
    "litigation", "judgment", "opinion", "docket", "appeal", "hearing",
    "attorney", "counsel", "legislation", "regulation", "precedent", "suit",
    "act", "bill", "ordinance", "compliance", "subpoena", "testimony"
]

CRYPTO_KEYWORDS = [
    "bitcoin", "ethereum", "crypto", "cryptocurrency", "blockchain", "usdc", 
    "xrp", "ripple", "stablecoin", "digital asset", "ledger", "coin", "token"
]

STOP_WORDS = set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
    'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
    'between', 'both', 'but', 'by', 'can', 'did', 'do', 'does', 'doing', 'down',
    'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
    'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
    'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me',
    'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on',
    'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over',
    'own', 's', 'same', 'she', 'should', 'so', 'some', 'such', 't', 'than',
    'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
    'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
    'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while',
    'who', 'whom', 'why', 'will', 'with', 'you', 'your', 'yours', 'yourself',
    'yourselves'
])

class SearchProviderFatalError(Exception):
    pass

class GenericScraperSpider(scrapy.Spider):
    name = "generic_scraper"
    custom_settings = {
        'USER_AGENT': random.choice(COMMON_USER_AGENTS),
        'PLAYWRIGHT_LAUNCH_OPTIONS': {
            'headless': True,
            'timeout': 90000,
        },
        'PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT': 90000,
        'DOWNLOAD_HANDLERS': {
            'http': 'scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler',
            'https': 'scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler',
        },
        'TWISTED_REACTOR': 'twisted.internet.asyncioreactor.AsyncioSelectorReactor',
    }

    def __init__(self, start_url=None, results_list_ref=None, *args, **kwargs):
        super(GenericScraperSpider, self).__init__(*args, **kwargs)
        self.start_url = start_url
        self.results_list_ref = results_list_ref if results_list_ref is not None else []

    def start_requests(self):
        yield scrapy.Request(
            self.start_url,
            meta=dict(
                playwright=True,
                playwright_include_page=True,
                playwright_page_methods=[
                    PageMethod("wait_for_load_state", "networkidle"),
                    PageMethod("wait_for_timeout", 3000)
                ],
            ),
            callback=self.parse,
            errback=self.errback,
        )

    async def errback(self, failure):
        page = failure.request.meta["playwright_page"]
        await page.close()

    async def parse(self, response: ScrapyResponse):
        page = response.meta["playwright_page"]
        html_content = await page.content()
        await page.close()

        item = {'url': response.url, 'content': None, 'links': [], 'metadata': {}, 'content_html_for_parsing': html_content}
        content_type = response.headers.get('Content-Type', b'').decode('utf-8').lower()

        if 'application/pdf' in content_type:
            try:
                pdf_bytes = BytesIO(response.body)
                output_string = StringIO()
                extract_text_to_fp(pdf_bytes, output_string, laparams=LAParams(), output_type='text', codec='utf-8')
                item['content'] = output_string.getvalue().strip()
                item['metadata']['is_pdf'] = True
            except Exception as e_pdf:
                pass
        elif 'text/html' in content_type:
            try:
                doc = Document(html_content)
                
                item['metadata']['title'] = doc.title()
                content_html = doc.summary()
                
                selector = scrapy.Selector(text=content_html)
                cleaned_text = " ".join(selector.css('body *::text').getall())
                cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()

                if cleaned_text:
                    item['content'] = cleaned_text
                else:
                    selector = scrapy.Selector(text=html_content)
                    all_text = " ".join(selector.css('body *::text').getall())
                    cleaned_text = re.sub(r'\s+', ' ', all_text).strip()
                    if cleaned_text:
                        item['content'] = cleaned_text
                    else:
                        pass

            except Exception as e_extraction:
                item['content'] = None

            try:
                for a_tag in response.css('a'):
                    href = a_tag.css('::attr(href)').get()
                    text = "".join(a_tag.css('::text').getall()).strip()
                    if href:
                        try:
                            abs_link = response.urljoin(href)
                            if urlparse(abs_link).scheme in ['http', 'https']:
                                item['links'].append(models.ExtractedLinkItem(url=abs_link, anchor_text=text if text else None).model_dump())
                        except ValueError: pass
            except Exception as e_link_extract: 
                pass
            
            if not item['metadata'].get('title'):
                item['metadata']['title'] = response.css('title::text').get() or response.xpath('//title/text()').get()
        else:
            try: 
                item['content'] = response.body.decode('utf-8', errors='ignore').strip()
            except Exception as e_decode: 
                pass
        
        if self.results_list_ref is not None: 
            self.results_list_ref.append(item)


class SearchScrape:
    def __init__(self, settings: app_config.Settings):
        self.settings = settings
        self.generic_user_agent = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Scalytics-User/1.0; +https://scalytics.io/deepsearch)"
        self.db_path = self.settings.LANCEDB_BASE_URI
        project_root_ss = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
        self.domain_trust_db_path = os.path.join(project_root_ss, 'data', 'community.db')
        self.whois_cache: Dict[str, Dict[str, Any]] = {}
        self.whois_cache_expiry_seconds: int = 3600 * 24
        self.rate_limit_manager: Optional[RateLimitManager] = None
        self.academic_handler = AcademicSiteHandler()
        self.brave_short_term_cooldown_until: Optional[datetime] = None
        self.brave_consecutive_short_term_fails: int = 0
        self.BRAVE_SHORT_TERM_COOLDOWN_SECONDS: int = getattr(settings, "BRAVE_SHORT_TERM_COOLDOWN_SECONDS", 15)
        self.BRAVE_MAX_CONSECUTIVE_SHORT_FAILS: int = getattr(settings, "BRAVE_MAX_CONSECUTIVE_SHORT_FAILS", 2)
        self.brave_parser = BraveResponseParser()

    def _is_harmless_blog_stderr(self, stderr_content: str) -> bool:
        if not stderr_content:
            return True
            
        harmless_patterns = [
            'JavaScript error',
            'Failed to load external resource', 
            'SSL certificate verification failed',
            'Resource timeout',
            'CORS error',
            '[Config]',
            'DeprecationWarning:',
            'SyntaxWarning:',
            'UserWarning:'
        ]
        
        lines = [line.strip() for line in stderr_content.split('\n') if line.strip()]
        if not lines: 
            return True

        for line in lines:
            if not any(pattern in line for pattern in harmless_patterns):
                if "scrapy" in line.lower() and "error" not in line.lower() and "traceback" not in line.lower() and "failed" not in line.lower():
                    continue 
                return False 
        return True 

    async def _initialize_rate_limit_manager(self):
        if self.rate_limit_manager is None:
            self.rate_limit_manager = await get_rate_limit_manager()

    def _simplify_query_for_specialized_search(self, query_text: str, max_keywords: int = 3) -> str:
        if not query_text:
            return ""
        
        clean_query = re.sub(r'[^\w\s]', '', query_text.lower())
        
        words = clean_query.split()
        if not words:
            return ""

        keywords = [word for word in words if word not in STOP_WORDS]
        
        if not keywords:
            return " ".join(words[:max_keywords])

        return " ".join(keywords[:max_keywords])


    def _is_legal_query(self, query_text: str) -> bool:
        if not query_text:
            return False
        query_lower = query_text.lower()
        
        has_legal_keyword = any(keyword in query_lower for keyword in LEGAL_KEYWORDS)
        has_crypto_keyword = any(keyword in query_lower for keyword in CRYPTO_KEYWORDS)

        # It's a legal query if it has legal keywords and is not clearly a crypto query.
        return has_legal_keyword and not has_crypto_keyword

    @classmethod
    async def create(cls, settings: app_config.Settings):
        instance = cls(settings)
        await instance._initialize_rate_limit_manager()
        return instance

    def _get_sqlite_connection(self):
        try:
            conn = sqlite3.connect(self.domain_trust_db_path); conn.row_factory = sqlite3.Row; return conn
        except sqlite3.Error as e: return None

    def _get_domain_from_url(self, url_string: Any) -> Optional[str]:
        url_str = str(url_string) if hasattr(url_string, '__str__') else url_string
        if not url_str or not isinstance(url_str, str) or not url_str.startswith(('http://', 'https://')): return None
        try: return urlparse(url_str).netloc.replace('www.', '')
        except Exception: return None

    def _extract_registered_domain(self, domain_or_url: str) -> Optional[str]:
        if not domain_or_url: return None
        try:
            parsed_url = urlparse(domain_or_url); netloc_to_extract = parsed_url.netloc if parsed_url.netloc else domain_or_url
            extracted = tldextract.extract(netloc_to_extract)
            return extracted.registered_domain or (extracted.domain if extracted.domain else netloc_to_extract)
        except Exception as e: return domain_or_url

    def _is_https(self, url_string: Any) -> bool:
        url_str = str(url_string) if hasattr(url_string, '__str__') else url_string
        if not url_str or not isinstance(url_str, str): return False
        try: return urlparse(url_str).scheme == 'https'
        except Exception: return False

    def _get_domain_age_days(self, domain: str) -> Optional[int]:
        if not domain: return None
        cached = self.whois_cache.get(domain)
        if cached and (datetime.now() - cached['timestamp']) < timedelta(seconds=self.whois_cache_expiry_seconds): return cached['age_days']
        try:
            info = whois.whois(domain); cd = info.creation_date
            if isinstance(cd, list): cd = cd[0] if cd else None
            if cd: age = (datetime.now() - cd).days; self.whois_cache[domain] = {'age_days': age, 'timestamp': datetime.now()}; return age
        except Exception as e:
            pass
        self.whois_cache[domain] = {'age_days': None, 'timestamp': datetime.now()}; return None

    def _get_domain_trust_profile(self, domain: str) -> Optional[Dict]:
        conn = self._get_sqlite_connection()
        if not conn: return None
        try:
            cur = conn.cursor(); cur.execute("SELECT * FROM domain_trust_profiles WHERE domain = ?", (domain,)); row = cur.fetchone()
            if row: return dict(row)
            parts = domain.split('.')
            for i in range(len(parts)):
                pattern = '*.' + '.'.join(parts[i:]); cur.execute("SELECT * FROM domain_trust_profiles WHERE domain = ? AND tld_type_bonus > 0", (pattern,)); row = cur.fetchone()
                if row: return dict(row)
        except sqlite3.Error as e: pass
        finally:
            if conn: conn.close()
        return None

    def _ensure_domain_profile(self, domain: str, url_string: str) -> Dict:
        profile_from_db = self._get_domain_trust_profile(domain); current_is_https = self._is_https(url_string); current_domain_age_days = self._get_domain_age_days(domain); current_reference_count = 0; conn = None
        try:
            conn = self._get_sqlite_connection()
            if not conn:
                provisional_score = round(max(0.05, min(0.95, 0.4 + (0.05 if current_is_https else 0) + (0.1 if current_domain_age_days and current_domain_age_days > 730 else -0.05 if current_domain_age_days and current_domain_age_days < 180 else 0) + (0.1 if domain and any(domain.endswith(tld) for tld in (".gov", ".edu", ".org")) else 0))), 3)
                return {'domain': domain, 'trust_score': provisional_score, 'is_https': current_is_https, 'domain_age_days': current_domain_age_days, 'source_trust_type': 'provisional_no_db_conn', 'reference_count': 0}
            cur = conn.cursor()
            if profile_from_db:
                db_reference_count = profile_from_db.get('reference_count', 0); current_reference_count = db_reference_count + 1
                try: cur.execute("UPDATE domain_trust_profiles SET reference_count = ?, updated_at = CURRENT_TIMESTAMP WHERE domain = ?", (current_reference_count, profile_from_db.get('domain'))); conn.commit()
                except sqlite3.Error as e_update: current_reference_count = db_reference_count
                signals_to_return = {'domain': domain, 'trust_score': profile_from_db.get('trust_score', 0.5), 'is_https': profile_from_db.get('is_https'), 'domain_age_days': profile_from_db.get('domain_age_days'), 'source_trust_type': 'tld_pattern' if profile_from_db.get('domain','').startswith('*.') else 'specific_db_entry', 'reference_count': current_reference_count, 'tld_type_bonus': profile_from_db.get('tld_type_bonus', 0.0)}
                if profile_from_db.get('domain','').startswith('*.') or signals_to_return['is_https'] is None: signals_to_return['is_https'] = current_is_https
                if profile_from_db.get('domain','').startswith('*.') or signals_to_return['domain_age_days'] is None: signals_to_return['domain_age_days'] = current_domain_age_days
                return signals_to_return
            else:
                initial_trust_score = round(max(0.05, min(0.95, 0.4 + (0.05 if current_is_https else 0) + (0.1 if current_domain_age_days and current_domain_age_days > 730 else -0.05 if current_domain_age_days and current_domain_age_days < 180 else 0) + (0.1 if domain and any(domain.endswith(tld) for tld in (".gov", ".edu", ".org")) else 0))), 3); current_reference_count = 1
                try: cur.execute("INSERT INTO domain_trust_profiles (domain, trust_score, is_https, domain_age_days, last_scanned_date, reference_count, tld_type_bonus, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 0.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", (domain, initial_trust_score, current_is_https, current_domain_age_days, current_reference_count)); conn.commit()
                except sqlite3.Error as e_insert: return {'domain': domain, 'trust_score': initial_trust_score, 'is_https': current_is_https, 'domain_age_days': current_domain_age_days, 'source_trust_type': 'provisional_insert_failed', 'reference_count': current_reference_count, 'tld_type_bonus': 0.0}
                return {'domain': domain, 'trust_score': initial_trust_score, 'is_https': current_is_https, 'domain_age_days': current_domain_age_days, 'source_trust_type': 'newly_discovered', 'reference_count': current_reference_count, 'tld_type_bonus': 0.0}
        except Exception as e_general:
            provisional_score = round(max(0.05, min(0.95, 0.4 + (0.05 if current_is_https else 0) + (0.1 if current_domain_age_days and current_domain_age_days > 730 else -0.05 if current_domain_age_days and current_domain_age_days < 180 else 0) + (0.1 if domain and any(domain.endswith(tld) for tld in (".gov", ".edu", ".org")) else 0))), 3)
            return {'domain': domain, 'trust_score': provisional_score, 'is_https': current_is_https, 'domain_age_days': current_domain_age_days, 'source_trust_type': 'provisional_exception', 'reference_count': 0, 'tld_type_bonus': 0.0}
        finally:
            if conn: conn.close()

    async def _run_scrapy_spider(self, target_url: str, is_cancelled_flag: asyncio.Event) -> List[Dict[str, Any]]:
        if is_cancelled_flag.is_set():
            return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': 'Cancelled'}}]
        
        caller_module_path = "src.python_services.deep_search_service.sub_workers.scrapy_caller"
        cmd = [sys.executable, "-m", caller_module_path, target_url]
        env = os.environ.copy()
        env.update({'SCRAPY_LOG_LEVEL': 'CRITICAL', 'SCRAPY_LOG_ENABLED': '0', 'SCRAPY_STATS_DUMP': '0', 'PYTHONWARNINGS': 'ignore', 'SCRAPY_TELNETCONSOLE_ENABLED': '0'})
        
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd, 
                stdout=asyncio.subprocess.PIPE, 
                stderr=asyncio.subprocess.PIPE, 
                env=env
            )
            scrapy_timeout_seconds = self.settings.LIVE_SEARCH_SCRAPY_SUBPROCESS_TIMEOUT
            
            try:
                communicate_task = asyncio.create_task(process.communicate())
                while not communicate_task.done():
                    if is_cancelled_flag.is_set():
                        process.terminate()
                        await process.wait()
                        return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': 'Cancelled'}}]
                    await asyncio.sleep(0.1)
                stdout, stderr = await asyncio.wait_for(communicate_task, timeout=scrapy_timeout_seconds)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': f'Scrapy subprocess timed out after {scrapy_timeout_seconds}s'}}]

            stdout_str = stdout.decode('utf-8', errors='ignore').strip()
            stderr_str = stderr.decode('utf-8', errors='ignore').strip()
            
            if stderr_str:
                if self._is_harmless_blog_stderr(stderr_str):
                    pass
                else:
                    pass

            if process.returncode != 0:
                error_detail_for_meta = stderr_str if stderr_str else "Unknown Scrapy subprocess error"
                return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': f"Scrapy subprocess error (code {process.returncode}): {error_detail_for_meta}"}}]
            
            if not stdout_str:
                return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': 'Scrapy subprocess produced no stdout but exited cleanly', 'stderr_if_any': stderr_str if stderr_str else None}}]
            
            try:
                scraped_items = json.loads(stdout_str)
                if not isinstance(scraped_items, list):
                    return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': 'Scrapy output not a list'}}]
                return scraped_items
            except json.JSONDecodeError as e_json:
                return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': f"JSON decode error: {e_json}", "raw_output": stdout_str[:200]}}]
        
        except Exception as e_subprocess_general:
            return [{'url': target_url, 'content': None, 'links': [], 'metadata': {'error': str(e_subprocess_general)}}]

    async def _scrape_url_content_internal(self, target_url: str, source_info: Dict, is_cancelled_flag: asyncio.Event) -> Dict[str, Any]:
        final_url_to_scrape = target_url
        if "doi.org" in urlparse(target_url).netloc:
            try:
                loop = asyncio.get_event_loop()
                def resolve_doi_sync():
                    try: headers = {'User-Agent': self.generic_user_agent}; response = requests.head(target_url, headers=headers, allow_redirects=True, timeout=15); return response.url
                    except requests.RequestException as e: return None
                resolved_url = await loop.run_in_executor(None, resolve_doi_sync)
                if resolved_url and resolved_url != target_url:
                    final_url_to_scrape = resolved_url
                else: pass
            except Exception as e_resolve: pass
        scraped_data_list = await self._run_scrapy_spider(final_url_to_scrape, is_cancelled_flag)
        if scraped_data_list:
            scraped_item = scraped_data_list[0]; final_source_info = {**source_info, **scraped_item.get('metadata', {})}; raw_links_from_spider = scraped_item.get('links', []); parsed_links_for_output: List[models.ExtractedLinkItem] = []
            if isinstance(raw_links_from_spider, list):
                for link_data_dict in raw_links_from_spider:
                    if isinstance(link_data_dict, dict):
                        try: parsed_links_for_output.append(models.ExtractedLinkItem(**link_data_dict))
                        except Exception as e_link_model: pass
                    elif isinstance(link_data_dict, str): parsed_links_for_output.append(models.ExtractedLinkItem(url=link_data_dict))
            return {"content": scraped_item.get('content'), "links": parsed_links_for_output, "source_info": final_source_info, "title": final_source_info.get('title')}
        else: return {"content": None, "links": [], "source_info": source_info, "title": source_info.get("title")}

    async def _scrape_pdf_url_internal(self, target_url: str, source_info: Dict) -> Dict[str, Any]:
        loop = asyncio.get_event_loop(); pdf_content_text: Optional[str] = None
        def sync_scrape_pdf():
            nonlocal pdf_content_text
            try:
                headers = {"User-Agent": self.generic_user_agent}
                with requests.get(target_url, headers=headers, timeout=30, stream=True) as r:
                    r.raise_for_status(); content_type_header = r.headers.get('Content-Type', '')
                    if not isinstance(content_type_header, str) or 'application/pdf' not in content_type_header.lower(): return
                    pdf_bytes = BytesIO(r.content); output_string = StringIO(); extract_text_to_fp(pdf_bytes, output_string, laparams=LAParams(), output_type='text', codec='utf-8'); content = output_string.getvalue()
                    if content: pdf_content_text = content.strip()
            except Exception as e_sync_pdf: pass
        try: await loop.run_in_executor(None, sync_scrape_pdf)
        except Exception as e_pdf_executor: pass
        return {"content": pdf_content_text, "source_info": source_info, "links": []}

    def _sync_openalex_search(self, single_keyword_query: str, max_results: int) -> List[Dict[str, Any]]:
        openalex_results = []; 
        if not single_keyword_query:
            return []
        try:
            retrieved_count = 0; effective_per_page = min(max(1, max_results), 50)
            # Using .search(single_keyword_query)
            for work_data in Works().search(single_keyword_query).get(page=1, per_page=effective_per_page):
                if retrieved_count >= max_results: break
                abstract = None 
                if work_data.get('abstract_inverted_index'):
                    try:
                        inverted_index = work_data['abstract_inverted_index']
                        if inverted_index: sorted_words = sorted(inverted_index.items(), key=lambda item: item[1][0]); abstract = " ".join([word for word, positions in sorted_words])
                    except Exception as e_abs: abstract = "[Abstract not available or failed to reconstruct]"
                primary_location = work_data.get('primary_location'); source_info_oa = primary_location.get('source') if primary_location else None; venue_name = source_info_oa.get('display_name') if source_info_oa else None
                best_url = primary_location.get('landing_page_url') if primary_location else None
                if not best_url and primary_location and primary_location.get('is_oa', False): best_url = primary_location.get('pdf_url')
                if not best_url: best_url = work_data.get('id')
                authors = [authorship.get('author', {}).get('display_name') for authorship in work_data.get('authorships', []) if authorship.get('author', {}).get('display_name')]
                openalex_results.append({'title': work_data.get('title'), 'authors': authors[:5], 'venue': venue_name, 'year': work_data.get('publication_year'), 'description': abstract, 'doi': work_data.get('doi'), 'url': best_url, 'openalex_id': work_data.get('id'), 'type': work_data.get('type_crossref') or work_data.get('type')}); retrieved_count += 1
        except Exception as e_oa: pass
        return openalex_results

    async def execute_search_pass(self, query: str, search_providers: List[str], api_config: Dict[str, str], max_results_per_query: int, progress_callback: Optional[callable] = None, is_fact_checking_pass: bool = False, is_cancelled_flag: Optional[asyncio.Event] = None) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
        all_search_metadata: List[Dict[str, Any]] = []
        provider_errors: Dict[str, str] = {}
        loop = asyncio.get_event_loop()
        any_selected_provider_success = False
        
        available_providers_input = list(search_providers) if search_providers else list(self.settings.SEARCH_PROVIDERS_DEFAULT)
        if not available_providers_input:
            return [], {"internal_error": "No search providers configured."}

        task_id_for_log = api_config.get("task_id", "N/A") if isinstance(api_config, dict) else "N/A"
        
        if is_cancelled_flag and is_cancelled_flag.is_set():
            return [], {"cancelled": "Operation cancelled before starting search pass."}

        # Provider selection logic
        if is_fact_checking_pass:
            general_web_providers_set = {"duckduckgo", "google", "google_custom_search", "bing", "brave"}
            available_providers = [p for p in available_providers_input if p.lower() in general_web_providers_set]
            if not available_providers:
                fallback_providers = [p for p in self.settings.SEARCH_PROVIDERS_FALLBACK if p.lower() in general_web_providers_set]
                if not fallback_providers:
                    provider_errors["fact_check_provider_unavailable"] = "No suitable general web search providers available."
                    return [], provider_errors
                available_providers = fallback_providers
        else:
            available_providers = available_providers_input
            if not self._is_legal_query(query):
                available_providers = [p for p in available_providers if p != 'courtlistener']

        # API Key setup
        brave_key = api_config.get("BRAVE_SEARCH_API_KEY", self.settings.BRAVE_SEARCH_API_KEY)
        google_key = api_config.get("GOOGLE_API_KEY", self.settings.GOOGLE_API_KEY)
        google_cx = api_config.get("GOOGLE_CX", self.settings.GOOGLE_CX)
        bing_key = api_config.get("BING_API_KEY", self.settings.BING_API_KEY)
        courtlistener_key = api_config.get("COURTLISTENER_API_KEY", self.settings.COURTLISTENER_API_KEY)

        # Synchronous search functions
        def _sync_brave_search(current_query: str, current_max_results: int):
            if not brave_key:
                return {"error": "config_error", "details": "Brave API key missing."}
            try:
                params = {'q': current_query, 'count': current_max_results, 'search_lang': 'en', 'country': 'us', 'safesearch': 'moderate', 'spellcheck': 1, 'result_filter': 'web,news'}
                headers = {'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': brave_key, 'User-Agent': self.generic_user_agent}
                response = requests.get('https://api.search.brave.com/res/v1/web/search', params=params, headers=headers, timeout=15)
                response_json = response.json()
                api_result = self.brave_parser.parse_response(response_json, response.status_code)
                if api_result.success:
                    return {"processed_results": [item for item in api_result.results if item.get('url')], "titles_for_fallback": [item['title'] for item in api_result.results if not item.get('url') and item.get('title')]}
                else:
                    return {"error": api_result.response_type.value, "details": api_result.error_message, "provider_key": "brave"}
            except requests.RequestException as e:
                return {"error": "request_exception", "details": str(e)}
            except json.JSONDecodeError as e:
                return {"error": "json_decode_error", "details": str(e)}
            except Exception as e:
                return {"error": "unknown_error", "details": str(e)}

        def _sync_google_custom_search(current_query: str, current_max_results: int):
            if not google_key or not google_cx:
                return []
            try:
                service = build_google_service("customsearch", "v1", developerKey=google_key, cache_discovery=False)
                res = service.cse().list(q=current_query, cx=google_cx, num=current_max_results).execute()
                return [{"url": i.get('link'), "title": i.get('title'), "description": i.get('snippet')} for i in res.get('items', [])]
            except Exception as e:
                raise SearchProviderFatalError(f"Google Custom Search failed: {e}")

        def _sync_bing_search(current_query: str, current_max_results: int):
            if not bing_key:
                return []
            try:
                headers = {"Ocp-Apim-Subscription-Key": bing_key, "User-Agent": self.generic_user_agent}
                params = {"q": current_query, "count": current_max_results, "mkt": "en-US"}
                response = requests.get("https://api.bing.microsoft.com/v7.0/search", headers=headers, params=params, timeout=10)
                response.raise_for_status()
                res_json = response.json()
                return [{"url": i.get('url'), "title": i.get('name'), "description": i.get('snippet')} for i in res_json.get('webPages', {}).get('value', [])]
            except Exception as e:
                raise SearchProviderFatalError(f"Bing Search failed: {e}")

        def _sync_ddgs_search(current_query: str, current_max_results: int):
            try:
                with DDGS(headers={'User-Agent': random.choice(COMMON_USER_AGENTS)}, timeout=20) as ddgs:
                    results = ddgs.text(keywords=current_query, region='us-en', safesearch='moderate', max_results=current_max_results)
                    return [{"url": r.get('href'), "title": r.get('title'), "description": r.get('body')} for r in results]
            except Exception as e:
                return {"error": "general_error", "details": str(e), "provider_key": "duckduckgo"}

        def _sync_wikipedia_search(single_keyword_query: str):
            if not single_keyword_query: return []
            try:
                wiki_api = wikipediaapi.Wikipedia(f'ResearchTool/1.0 ({self.generic_user_agent})', 'en')
                page = wiki_api.page(single_keyword_query)
                if page and page.exists():
                    return [{"url": page.fullurl, "title": page.title, "description": page.summary[:3000]}]
                return []
            except Exception as e:
                return []

        def _sync_courtlistener_search(single_keyword_query: str, current_max_results: int):
            if not courtlistener_key: return []
            try:
                headers = {'Authorization': f'Token {courtlistener_key}'}
                params = {'q': single_keyword_query, 'type': 'o', 'count': current_max_results}
                response = requests.get("https://www.courtlistener.com/api/rest/v4/search/", headers=headers, params=params, timeout=15)
                response.raise_for_status()
                res_json = response.json()
                results_cl = []
                if res_json and 'results' in res_json:
                    for i in res_json['results']:
                        url = i.get('absolute_url')
                        if url and not url.startswith(('http://', 'https://')):
                            url = urljoin("https://www.courtlistener.com", url)
                        results_cl.append({"url": url, "title": i.get('caseName'), "description": i.get('snippet', '')})
                return results_cl
            except Exception as e:
                return []

        async def _process_and_add_results(provider_results, provider_name, query_used):
            nonlocal any_selected_provider_success
            if provider_results:
                any_selected_provider_success = True
                for idx, item in enumerate(provider_results):
                    if not isinstance(item, dict) or not item.get('url'):
                        continue
                    domain = self._get_domain_from_url(item['url'])
                    trust_info = self._ensure_domain_profile(domain, item['url']) if domain else {}
                    meta = {
                        "url": item.get('url'), "title": item.get("title"), "snippet": item.get("description"),
                        "provider_name": provider_name, "query_phrase_used": query_used, "position": idx + 1, **trust_info
                    }
                    all_search_metadata.append(meta)

        provider_fn_map = {
            "brave": _sync_brave_search, "google_custom_search": _sync_google_custom_search,
            "google": _sync_google_custom_search, # Add mapping for 'google'
            "bing": _sync_bing_search, "openalex": self._sync_openalex_search, 
            "wikipedia": _sync_wikipedia_search, "duckduckgo": _sync_ddgs_search, 
            "courtlistener": _sync_courtlistener_search
        }

        active_providers = [p for p in available_providers if not await self.rate_limit_manager.is_provider_ignored(p)]
        if not active_providers:
            active_providers = [p for p in self.settings.SEARCH_PROVIDERS_FALLBACK if not await self.rate_limit_manager.is_provider_ignored(p)]
            if not active_providers:
                return [], {"error": "All providers rate-limited."}
        
        random.shuffle(active_providers)

        for provider_key in active_providers:
            if is_cancelled_flag and is_cancelled_flag.is_set():
                provider_errors["cancelled"] = "Operation cancelled."
                break

            search_fn = provider_fn_map.get(provider_key)
            if not search_fn:
                continue

            current_query = query
            # Query adjustments for specific providers
            if provider_key in ["wikipedia", "openalex", "courtlistener"]:
                current_query = self._simplify_query_for_specialized_search(query)
                if not current_query:
                    continue
            
            if progress_callback:
                await progress_callback(provider_key, current_query)

            try:

                # Argument mapping for different search functions
                if provider_key in ["openalex", "courtlistener", "google_custom_search", "google", "bing", "brave", "duckduckgo"]:
                    search_task = loop.run_in_executor(None, search_fn, current_query, max_results_per_query)
                else: # wikipedia
                    search_task = loop.run_in_executor(None, search_fn, current_query)

                # Create a task to listen for cancellation
                cancel_waiter = asyncio.create_task(is_cancelled_flag.wait())
                
                done, pending = await asyncio.wait(
                    {search_task, cancel_waiter},
                    timeout=20.0,
                    return_when=asyncio.FIRST_COMPLETED
                )

                if search_task in pending:
                    # This means either timeout or cancellation happened
                    search_task.cancel()
                    if cancel_waiter.done():
                        # Explicit cancellation
                        raise asyncio.CancelledError
                    else:
                        # Timeout
                        raise asyncio.TimeoutError
                
                # If we are here, search_task is in 'done'
                cancel_waiter.cancel() # We don't need to wait for cancellation anymore
                results_data = await search_task # Get result or exception

                if isinstance(results_data, dict) and "error" in results_data:
                    error_detail = results_data.get('details', 'Unknown error')
                    provider_errors[provider_key] = f"API Error: {error_detail}"
                    if results_data.get("provider_key"):
                        await self.rate_limit_manager.add_or_update_provider(results_data["provider_key"])
                    continue
                
                provider_results = results_data.get("processed_results") if isinstance(results_data, dict) else results_data
                await _process_and_add_results(provider_results, provider_key.replace("_", " ").title(), current_query)

            except asyncio.CancelledError:
                provider_errors[provider_key] = "Cancelled"
                # The main loop will break due to the is_cancelled_flag check
                break
            except asyncio.TimeoutError:
                provider_errors[provider_key] = "Timeout"
                await self.rate_limit_manager.add_or_update_provider(provider_key, duration_seconds=300)
            except SearchProviderFatalError as e:
                provider_errors[provider_key] = f"Fatal Error: {e}"
                await self.rate_limit_manager.add_or_update_provider(provider_key, duration_seconds=3600) # Longer timeout for fatal errors
            except Exception as e:
                provider_errors[provider_key] = f"Generic Error: {str(e)}"

        return all_search_metadata, provider_errors

    async def scrape_url_with_vetting(self, url: str, original_source_info: Optional[Dict] = None, is_cancelled_flag: asyncio.Event = None) -> Dict[str, Any]:
        source_info_to_use = original_source_info.copy() if original_source_info else {}; 
        if 'url' not in source_info_to_use: source_info_to_use['url'] = url
        if 'provider' not in source_info_to_use: source_info_to_use['provider'] = 'direct_scrape'
        domain = self._get_domain_from_url(url)
        if domain: source_info_to_use.update(self._ensure_domain_profile(domain, url))
        else: source_info_to_use.setdefault('trust_score', 0.3); source_info_to_use.setdefault('is_https', self._is_https(url)); source_info_to_use.setdefault('source_trust_type', 'unparseable_domain')
        return await self._scrape_url_content_internal(url, source_info_to_use, is_cancelled_flag)

    async def scrape_url_with_custom_headers(self, url: str, headers: Dict[str, str], is_cancelled_flag: asyncio.Event) -> Dict[str, Any]:
        if is_cancelled_flag.is_set(): return {'url': url, 'content': None, 'links': [], 'metadata': {'error': 'Cancelled'}, 'content_html_for_parsing': None}
        loop = asyncio.get_event_loop()
        def sync_request():
            try: response = requests.get(url, headers=headers, timeout=20, allow_redirects=True); response.raise_for_status(); return response
            except requests.RequestException as e: return {"error": str(e)}
        response_or_error = await loop.run_in_executor(None, sync_request)
        if isinstance(response_or_error, dict) and "error" in response_or_error: return {'url': url, 'content': None, 'links': [], 'metadata': response_or_error, 'content_html_for_parsing': None}
        response: requests.Response = response_or_error; html_content = response.text; item = {'url': response.url, 'content': None, 'links': [], 'metadata': {}, 'content_html_for_parsing': html_content}
        try:
            doc = Document(html_content)
            item['metadata']['title'] = doc.title()
            content_html = doc.summary()
            selector = scrapy.Selector(text=content_html)
            cleaned_text = " ".join(selector.css('body *::text').getall())
            item['content'] = re.sub(r'\s+', ' ', cleaned_text).strip()
        except Exception as e_readability: 
            # Fallback to raw text
            item['content'] = re.sub(r'<[^>]+>', ' ', html_content)
            item['content'] = re.sub(r'\s+', ' ', item['content']).strip() if item['content'] else None
        return item
    async def scrape_url_with_vetting_enhanced(self, url: str, original_source_info: Dict[str, Any], is_cancelled_flag: asyncio.Event) -> Dict[str, Any]:
        search_snippet = original_source_info.get('snippet', ''); search_title = original_source_info.get('title', ''); task_id = original_source_info.get('task_id', 'N/A')
        domain = self._get_domain_from_url(url); source_info_for_handler = original_source_info.copy()
        if domain: source_info_for_handler.update(self._ensure_domain_profile(domain, url))
        else: source_info_for_handler.setdefault('trust_score', 0.3); source_info_for_handler.setdefault('is_https', self._is_https(url)); source_info_for_handler.setdefault('source_trust_type', 'unparseable_domain_in_enhanced_vetting')
        if self.academic_handler.is_academic_site(url):
            try:
                result = await self.academic_handler.handle_academic_url(url, search_snippet, search_title, self, is_cancelled_flag)
                result['source_info'] = {**source_info_for_handler, **(result.get('source_info', {}))}; return result
            except Exception as e:
                site_info = self.academic_handler.get_site_info(url) or {}
                fallback_result = self.academic_handler._create_snippet_based_result(url, search_snippet, search_title, {**site_info, **source_info_for_handler}); fallback_result["error"] = f"Academic handler exception: {str(e)}"; return fallback_result
        return await self._scrape_url_content_internal(url, source_info_for_handler, is_cancelled_flag)
