import sys
import json
import asyncio 
from typing import List, Dict, Any

# This code is intended to be self-contained for subprocess execution.
# It defines its own minimal Scrapy spider and does not import from the parent project
# to avoid issues with PYTHONPATH, relative imports in subprocesses, and unintended side effects
# like re-running config initializations.

import random # Added
import signal # Add signal import
import scrapy
from scrapy.http import HtmlResponse, Response as ScrapyResponse
from urllib.parse import urlparse, urljoin
from io import StringIO, BytesIO
from pdfminer.high_level import extract_text_to_fp
from pdfminer.layout import LAParams
from readability import Document
import re 

class MinimalGenericScraperSpider(scrapy.Spider):
    name = "minimal_generic_scraper"

    # List of common user agents for rotation
    COMMON_USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/114.0",
    ]

    # Domains known to be JS-heavy where poor extraction might indicate JS issues
    JS_HEAVY_DOMAINS = ["axios.com", "bloomberg.com"] # Add more as identified

    BLOG_CONTENT_SELECTORS = [
        'article .entry-content',
        '.post-content',
        '.content-area .site-main', 
        '#primary .site-content',
        '.single-post .content',
        'article', # More generic
        'main',    # More generic
        '.content', '#content', '.post', '.entry', '[role="main"]' # Existing selectors from fallback
    ]
    
    def __init__(self, start_url=None, results_list_ref=None, *args, **kwargs):
        super(MinimalGenericScraperSpider, self).__init__(*args, **kwargs)
        if start_url:
            self.start_urls = [start_url]
        self.results_list_ref = results_list_ref if results_list_ref is not None else []

    def parse(self, response: ScrapyResponse): 
        item = {'url': response.url, 'content': None, 'links': [], 'metadata': {}}
        content_type = response.headers.get('Content-Type', b'').decode('utf-8').lower()
        item['metadata']['content_type'] = content_type
        
        if 'application/pdf' in content_type:
            try:
                pdf_bytes = BytesIO(response.body)
                output_string = StringIO()
                extract_text_to_fp(pdf_bytes, output_string, laparams=LAParams(), output_type='text', codec='utf-8')
                item['content'] = output_string.getvalue().strip()
            except Exception as e_pdf_extract: 
                item['content'] = None
        elif isinstance(response, HtmlResponse):
            try:
                doc = Document(response.text)
                item['metadata']['title'] = doc.title()
                content_html = doc.summary()
                
                selector = scrapy.Selector(text=content_html)
                cleaned_text = " ".join(selector.css('body *::text').getall())
                cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()

                if cleaned_text:
                    item['content'] = cleaned_text
                else:
                    selector = scrapy.Selector(text=response.text)
                    all_text = " ".join(selector.css('body *::text').getall())
                    cleaned_text = re.sub(r'\s+', ' ', all_text).strip()
                    if cleaned_text:
                        item['content'] = cleaned_text
                    else:
                        item['content'] = None
                
                parsed_url = urlparse(response.url)
                domain = parsed_url.netloc.replace("www.", "")
                if domain in self.JS_HEAVY_DOMAINS and (not item['content'] or len(item['content']) < 200):
                    print(f"ScrapyCallerWarning: Low content extracted from known JS-heavy site {response.url}. JavaScript rendering might be required.", file=sys.stderr)

            except Exception as e_extract: 
                print(f"ScrapyCallerError: Overall content extraction error for {response.url}: {e_extract}", file=sys.stderr) 
                item['content'] = None 
        
            try:
                extracted_link_data = []
                for a_tag in response.css('a'):
                    href = a_tag.css('::attr(href)').get()
                    if not href:
                        continue

                    try:
                        abs_link = response.urljoin(href)
                        if urlparse(abs_link).scheme not in ['http', 'https']:
                            continue
                        
                        anchor_text = " ".join(a_tag.css('::text').getall()).strip()
                        if not anchor_text: 
                            img_alt = a_tag.css('img::attr(alt)').get()
                            if img_alt:
                                anchor_text = img_alt.strip()
                        if not anchor_text: 
                            anchor_text = "N/A"

                        parent_text = ""
                        parent_node = a_tag.xpath('./parent::*')
                        if parent_node:
                            parent_text = " ".join(parent_node.css('::text').getall()).strip()
                            parent_text = re.sub(r'\s+', ' ', parent_text) 
                            if len(parent_text) > 200: 
                                try:
                                    anchor_idx = parent_text.lower().find(anchor_text.lower()[:20]) 
                                    if anchor_idx != -1:
                                        start = max(0, anchor_idx - 80)
                                        end = min(len(parent_text), anchor_idx + len(anchor_text) + 80)
                                        parent_text = parent_text[start:end]
                                    else:
                                        parent_text = parent_text[:150] + "..." 
                                except Exception:
                                     parent_text = parent_text[:150] + "..."
                        
                        if not parent_text:
                            parent_text = "Context N/A"

                        extracted_link_data.append({
                            "url": abs_link,
                            "anchor_text": anchor_text[:150], 
                            "context_around_link": parent_text[:250] 
                        })
                    except ValueError: 
                        pass 
                    except Exception as e_link_detail:
                        pass
                item['links'] = extracted_link_data
            except Exception as e_link_extract_final: 
                pass 
            
            try:
                item['metadata']['title'] = response.css('title::text').get() or response.xpath('//title/text()').get()
            except Exception as e_title_extract:
                item['metadata']['title'] = None
        else: 
            try: 
                item['content'] = response.body.decode('utf-8', errors='ignore').strip()
            except Exception as e_decode_final:
                item['content'] = None
        
        if self.results_list_ref is not None: 
            self.results_list_ref.append(item)

SpiderToRun = MinimalGenericScraperSpider

# Global variable to hold the Scrapy process instance
scrapy_process_global = None

from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings 

def main_scrape(url_to_scrape: str) -> List[Dict[str, Any]]:
    global scrapy_process_global # Declare usage of global
    results_list: List[Dict[str, Any]] = []
    
    settings = get_project_settings() 
    
    selected_user_agent = random.choice(MinimalGenericScraperSpider.COMMON_USER_AGENTS)
    settings.set("USER_AGENT", selected_user_agent)
    settings.set("DEFAULT_REQUEST_HEADERS", {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1', 
        'Upgrade-Insecure-Requests': '1'
    })
    
    settings.set("LOG_ENABLED", False) 
    settings.set("LOG_LEVEL", "ERROR") 
    settings.set("ROBOTSTXT_OBEY", False)
    
    settings.set("DOWNLOAD_TIMEOUT", 60)        
    settings.set("DOWNLOAD_DELAY", 1)
    settings.set("CONCURRENT_REQUESTS", 1)      
    settings.set("CONCURRENT_REQUESTS_PER_DOMAIN", 1) 
    settings.set("RETRY_TIMES", 3) 
    settings.set("DOWNLOAD_FAIL_ON_DATALOSS", False) 

    settings.set("EXTENSIONS", {
        'scrapy.extensions.logstats.LogStats': None,
        'scrapy.extensions.telnet.TelnetConsole': None,
    })
    settings.set("STATS_DUMP", False) 
    settings.set("COOKIES_ENABLED", True) 
    settings.set("REQUEST_FINGERPRINTER_IMPLEMENTATION", "2.7")
    settings.set("TELNETCONSOLE_ENABLED", False) 
    settings.set("TWISTED_REACTOR", None) 

    scrapy_process_global = CrawlerProcess(settings) # Assign to global variable
    
    try:
        scrapy_process_global.crawl(SpiderToRun, start_url=url_to_scrape, results_list_ref=results_list)
        scrapy_process_global.start() # This is blocking
    except Exception as e:
        print(f"ScrapyCallerError: Exception during crawl for {url_to_scrape}: {e}", file=sys.stderr)
        results_list.append({'url': url_to_scrape, 'content': None, 'links': [], 'metadata': {'error': str(e)}})
    finally:
        scrapy_process_global = None # Reset global variable
        
    return results_list

def signal_handler(signum, frame):
    global scrapy_process_global
    print(f"ScrapyCallerInfo: Received signal {signum}. Attempting graceful shutdown.", file=sys.stderr)
    if scrapy_process_global and scrapy_process_global.running:
        print(f"ScrapyCallerInfo: Scrapy process active. Calling stop().", file=sys.stderr)
        # The stop() method initiates the shutdown of the Twisted reactor
        # if Scrapy started it. This should allow for cleanup.
        scrapy_process_global.stop()
        # The process will exit once the reactor stops.
    else:
        print(f"ScrapyCallerInfo: Scrapy process not active, not initialized, or already stopping. Exiting.", file=sys.stderr)
    # Python's default behavior after the handler (if no exception is raised) 
    # is to re-raise the signal for terminating signals like SIGTERM/SIGINT, leading to termination.

if __name__ == '__main__':
    import logging
    import os
    
    log_level_env = os.getenv('SCRAPY_LOG_LEVEL', 'ERROR')
    log_enabled_env = os.getenv('SCRAPY_LOG_ENABLED', '0') == '1' 
    
    if not log_enabled_env:
        logging.getLogger('scrapy').disabled = True
        logging.getLogger('scrapy').propagate = False
        logging.getLogger('twisted').disabled = True
        logging.getLogger('pdfminer').disabled = True
        logging.basicConfig(level=logging.CRITICAL, force=True)
    else:
        log_level_int = getattr(logging, log_level_env.upper(), logging.ERROR)
        logging.basicConfig(level=log_level_int, force=True) 
        
        scrapy_loggers_to_configure = [
            'scrapy', 'scrapy.utils', 'scrapy.utils.log', 'scrapy.crawler',
            'scrapy.addons', 'scrapy.middleware', 'scrapy.spidermiddlewares',
            'scrapy.downloadermiddlewares', 'scrapy.downloadermiddlewares.redirect',
            'scrapy.core.engine', 'scrapy.extensions', 'scrapy.extensions.logstats',
            'scrapy.extensions.telnet', 'scrapy.statscollectors'
        ]
        for logger_name in scrapy_loggers_to_configure:
            logger_instance = logging.getLogger(logger_name)
            logger_instance.setLevel(log_level_int)
            logger_instance.disabled = False 
            logger_instance.propagate = False 

        logging.getLogger('twisted').setLevel(log_level_int) 
        logging.getLogger('twisted').disabled = False

    pdfminer_loggers = [
        'pdfminer', 'pdfminer.pdfparser', 'pdfminer.pdfdocument', 
        'pdfminer.pdfpage', 'pdfminer.pdfinterp', 'pdfminer.cmapdb', 
        'pdfminer.layout', 'pdfminer.utils', 'pdfminer.psparser'
    ]
    for logger_name in pdfminer_loggers:
        logging.getLogger(logger_name).setLevel(logging.WARNING)

    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler) # For Ctrl+C during direct testing

    if len(sys.argv) < 2:
        print("Usage: python -m src.python_services.deep_search_service.sub_workers.scrapy_caller <URL_TO_SCRAPE>", file=sys.stderr)
        sys.exit(1)
    
    url = sys.argv[1]
    scraped_data = main_scrape(url)
    
    try:
        print(json.dumps(scraped_data))
    except Exception as e_json_dump:
        error_output = [{"url": url, "content": None, "links": [], "metadata": {"error": f"Failed to dump JSON: {str(e_json_dump)}", "raw_results_preview": str(scraped_data)[:500]}}]
        print(json.dumps(error_output)) 
        sys.exit(1)
