import re
import random
from urllib.parse import urlparse
from typing import Dict, List, Any, Optional
import asyncio 

from ..utils import setup_logger 

logger = setup_logger(__name__)

class AcademicSiteHandler:
    """Specialized handler for academic and research sites"""
    
    def __init__(self):
        self.academic_domains = {
            # Major academic publishers
            'ieeexplore.ieee.org': {
                'name': 'IEEE Xplore',
                'access_type': 'subscription',
                'content_strategy': 'abstract_only',
                'trust_score': 0.9
            },
            'link.springer.com': {
                'name': 'Springer Link', 
                'access_type': 'subscription',
                'content_strategy': 'abstract_only',
                'trust_score': 0.9
            },
            'www.cambridge.org': {
                'name': 'Cambridge Core',
                'access_type': 'subscription', 
                'content_strategy': 'abstract_only',
                'trust_score': 0.9
            },
            'www.emerald.com': {
                'name': 'Emerald Insight',
                'access_type': 'subscription',
                'content_strategy': 'abstract_only', 
                'trust_score': 0.85
            },
            'onlinelibrary.wiley.com': {
                'name': 'Wiley Online Library',
                'access_type': 'subscription',
                'content_strategy': 'abstract_only',
                'trust_score': 0.9
            },
            'www.sciencedirect.com': {
                'name': 'ScienceDirect',
                'access_type': 'subscription',
                'content_strategy': 'abstract_only',
                'trust_score': 0.9
            },
            'journals.sagepub.com': {
                'name': 'SAGE Journals',
                'access_type': 'subscription',
                'content_strategy': 'abstract_only',
                'trust_score': 0.85
            },
            'www.tandfonline.com': {
                'name': 'Taylor & Francis Online',
                'access_type': 'subscription', 
                'content_strategy': 'abstract_only',
                'trust_score': 0.85
            },
            'academic.oup.com': {
                'name': 'Oxford Academic',
                'access_type': 'subscription',
                'content_strategy': 'abstract_only',
                'trust_score': 0.9
            },
            # Open access repositories
            'arxiv.org': {
                'name': 'arXiv',
                'access_type': 'open_access',
                'content_strategy': 'full_text', 
                'trust_score': 0.85
            },
            'www.ncbi.nlm.nih.gov': { 
                'name': 'PubMed/PMC',
                'access_type': 'mixed',
                'content_strategy': 'abstract_only', 
                'trust_score': 0.95
            },
            'scholar.google.com': {
                'name': 'Google Scholar',
                'access_type': 'aggregator',
                'content_strategy': 'snippet_only', 
                'trust_score': 0.7 
            },
            'doi.org': { 
                'name': 'DOI Resolver',
                'access_type': 'resolver',
                'content_strategy': 'resolve_then_scrape', 
                'trust_score': 0.8 
            }
        }
        
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0'
        ]
    
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        try:
            parsed = urlparse(url)
            netloc = parsed.netloc.lower()
            if netloc.startswith('www.'):
                return netloc[4:]
            return netloc
        except:
            return ""

    def is_academic_site(self, url: str) -> bool:
        """Check if URL is from an academic/research site"""
        domain = self._extract_domain(url)
        return domain in self.academic_domains
    
    def get_site_info(self, url: str) -> Optional[Dict[str, Any]]:
        """Get information about an academic site"""
        domain = self._extract_domain(url)
        return self.academic_domains.get(domain)
    
    async def handle_academic_url(
        self, 
        url: str, 
        search_snippet: Optional[str], 
        search_title: Optional[str],   
        scraper_instance, 
        is_cancelled_flag: asyncio.Event 
    ) -> Dict[str, Any]:
        """
        Handle academic URLs with appropriate fallback strategies
        """
        site_info = self.get_site_info(url)
        
        search_snippet = search_snippet or "N/A"
        search_title = search_title or "N/A"

        if not site_info:
            return await self._attempt_normal_scraping(url, scraper_instance, is_cancelled_flag)
        
        content_strategy = site_info.get('content_strategy', 'abstract_only')
        
        if content_strategy == 'snippet_only':
            return self._create_snippet_based_result(url, search_snippet, search_title, site_info)
        
        elif content_strategy == 'abstract_only':
            abstract_content = await self._attempt_abstract_extraction(url, scraper_instance, is_cancelled_flag)
            if abstract_content:
                return self._create_abstract_based_result(url, abstract_content, search_title, site_info)
            else:
                return self._create_snippet_based_result(url, search_snippet, search_title, site_info)
        
        elif content_strategy == 'full_text' or content_strategy == 'resolve_then_scrape': 
            result = await self._attempt_normal_scraping(url, scraper_instance, is_cancelled_flag)
            if result.get('content'):
                final_source_info = result.get('source_info', {})
                final_source_info.update({
                    "is_academic": True,
                    "access_type": site_info.get('access_type', 'unknown'),
                    "content_source": "full_text_attempt"
                })
                result['source_info'] = final_source_info
                return result
            else:
                return self._create_snippet_based_result(url, search_snippet, search_title, site_info)
        
        else: 
            return self._create_snippet_based_result(url, search_snippet, search_title, site_info)
    
    async def _attempt_normal_scraping(self, url: str, scraper_instance, is_cancelled_flag: asyncio.Event) -> Dict[str, Any]:
        """Attempt normal scraping with enhanced headers"""
        try:
            headers = {
                'User-Agent': random.choice(self.user_agents),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br', 
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none', 
                'Cache-Control': 'max-age=0'
            }
            return await scraper_instance.scrape_url_with_custom_headers(url, headers, is_cancelled_flag)
            
        except Exception as e:
            logger.warning(f"Normal scraping attempt failed for {url}: {e}")
            return {"content": None, "links": [], "source_info": {}, "title": None, "error": str(e)}
    
    async def _attempt_abstract_extraction(self, url: str, scraper_instance, is_cancelled_flag: asyncio.Event) -> Optional[str]:
        """Try to extract just the abstract from academic papers"""
        try:
            result = await self._attempt_normal_scraping(url, scraper_instance, is_cancelled_flag)
            html_content = result.get('content_html_for_parsing') 
            
            if not html_content:
                logger.warning(f"No HTML content returned from scraping {url} for abstract extraction.")
                return None
            
            abstract_patterns = [
                re.compile(r'<div[^>]*class="[^"]*(?:abstract|abstr)[^"]*"[^>]*>(.*?)</div>', re.DOTALL | re.IGNORECASE),
                re.compile(r'<section[^>]*id="[^"]*abstract[^"]*"[^>]*>(.*?)</section>', re.DOTALL | re.IGNORECASE),
                re.compile(r'<section[^>]*aria-labelledby="[^"]*abstract[^"]*"[^>]*>(.*?)</section>', re.DOTALL | re.IGNORECASE),
                re.compile(r'<p[^>]*class="[^"]*abstract[^"]*"[^>]*>(.*?)</p>', re.DOTALL | re.IGNORECASE),
                re.compile(r'<meta[^>]+name="DC.Description"[^>]+content="([^"]+)"', re.IGNORECASE),
                re.compile(r'<meta[^>]+name="description"[^>]+content="([^"]+)"', re.IGNORECASE),
                re.compile(r'<meta[^>]+property="og:description"[^>]+content="([^"]+)"', re.IGNORECASE),
                re.compile(r'(?:<h[1-3][^>]*>\s*Abstract\s*</h[1-3]>|<div[^>]*class="[^"]*section-title[^"]*"[^>]*>\s*Abstract\s*</div>)\s*<div[^>]*class="[^"]*article-section__content[^"]*"[^>]*>(.*?)</div>', re.DOTALL | re.IGNORECASE),
                re.compile(r'Abstract(?:</h3>|</h4>|</p>)\s*(?:<p>)?(.*?)(?:</p>|<h[1-3]|<div class="section">)', re.DOTALL | re.IGNORECASE),
            ]
            
            for pattern in abstract_patterns:
                match = pattern.search(html_content)
                if match:
                    abstract_html = match.group(1)
                    abstract_text = re.sub(r'<[^>]+>', ' ', abstract_html) 
                    abstract_text = re.sub(r'\s+', ' ', abstract_text).strip() 
                    
                    if len(abstract_text) > 50 and len(abstract_text) < 5000:  
                        logger.info(f"Extracted abstract for {url} using pattern: {pattern.pattern[:50]}")
                        return abstract_text
            
            logger.warning(f"Could not find a clear abstract for {url} using regex patterns.")
            return None
            
        except Exception as e:
            logger.warning(f"Abstract extraction attempt failed for {url}: {e}")
            return None
    
    def _create_snippet_based_result(
        self, 
        url: str, 
        snippet: str, 
        title: str, 
        site_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create result based on search snippet"""
        content = f"Academic Source: {site_info.get('name', 'Unknown')}\nTitle: {title}\n\nSummary (from search result snippet):\n{snippet}\n\nNote: Full text access may require subscription or direct visit. This information is based on the search provider's snippet."
        
        return {
            "content": content.strip(),
            "title": title,
            "source_info": {
                "trust_score": site_info.get('trust_score', 0.7), 
                "is_academic": True,
                "access_type": site_info.get('access_type', 'unknown'),
                "content_source": "search_snippet_fallback"
            },
            "links": [], 
            "error": None
        }
    
    def _create_abstract_based_result(
        self, 
        url: str, 
        abstract: str, 
        title: str, 
        site_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create result based on extracted abstract"""
        content = f"Academic Source: {site_info.get('name', 'Unknown')}\nTitle: {title}\n\nAbstract:\n{abstract}\n\nNote: This is the abstract from the academic paper. Full text may require subscription or direct visit."
        
        return {
            "content": content.strip(),
            "title": title,
            "source_info": {
                "trust_score": site_info.get('trust_score', 0.8), 
                "is_academic": True,
                "access_type": site_info.get('access_type', 'unknown'),
                "content_source": "extracted_abstract"
            },
            "links": [], 
            "error": None
        }
