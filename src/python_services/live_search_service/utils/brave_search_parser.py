import logging
import json
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass, field
from enum import Enum

# Initialize logger for this module
logger = logging.getLogger(__name__)

class BraveResponseType(Enum):
    SUCCESS = "success"
    ERROR = "error"
    RATE_LIMIT = "rate_limit"
    AUTH_ERROR = "auth_error"
    UNEXPECTED = "unexpected"

@dataclass
class BraveAPIResult:
    response_type: BraveResponseType
    success: bool
    results: List[Dict[str, Any]] = field(default_factory=list)
    error_message: Optional[str] = None
    raw_response: Optional[Dict] = None
    metadata: Optional[Dict] = None

class BraveResponseParser:
    """
    Robust parser for Brave Search API responses that handles various response structures
    """
    
    def __init__(self):
        self.expected_top_level_keys = {
            'web', 'news', 'videos', 'images', 'discussions', 
            'query', 'mixed', 'locations', 'faq', 'infobox'
        }
        self.error_indicators = {
            'error', 'errors', 'message', 'detail', 'status', 
            'error_code', 'error_message', 'status_code'
        }
    
    def parse_response(self, response_data: Union[Dict, str], status_code: int = 200) -> BraveAPIResult:
        """
        Parse Brave API response and handle various structures
        """
        try:
            # Handle string responses
            if isinstance(response_data, str):
                try:
                    response_data = json.loads(response_data)
                except json.JSONDecodeError:
                    return self._create_error_result(
                        BraveResponseType.UNEXPECTED,
                        f"Invalid JSON response: {response_data[:200]}...",
                        response_data
                    )
            
            # Handle None or empty responses
            if not response_data or not isinstance(response_data, dict): # Ensure response_data is a dict after potential json.loads
                return self._create_error_result(
                    BraveResponseType.UNEXPECTED,
                    "Empty, None, or non-dict response received",
                    response_data
                )
            
            # Check for HTTP error status codes first
            if status_code >= 400:
                return self._handle_http_error(response_data, status_code)
            
            # Detect response type
            response_type = self._detect_response_type(response_data)
            
            if response_type == BraveResponseType.ERROR:
                return self._handle_error_response(response_data)
            elif response_type == BraveResponseType.RATE_LIMIT:
                return self._handle_rate_limit_response(response_data)
            elif response_type == BraveResponseType.AUTH_ERROR:
                return self._handle_auth_error_response(response_data)
            elif response_type == BraveResponseType.SUCCESS:
                return self._handle_success_response(response_data)
            else: # UNEXPECTED
                return self._handle_unexpected_response(response_data)
                
        except Exception as e:
            logger.error(f"Exception while parsing Brave response: {e}", exc_info=True)
            return self._create_error_result(
                BraveResponseType.UNEXPECTED,
                f"Parser exception: {str(e)}",
                response_data
            )
    
    def _detect_response_type(self, data: Dict) -> BraveResponseType:
        """
        Detect the type of response based on structure and content
        """
        # Check for explicit error indicators
        for key in self.error_indicators:
            if key in data:
                error_content = str(data.get(key, '')).lower()
                if any(term in error_content for term in ['rate limit', 'too many requests', '429']):
                    return BraveResponseType.RATE_LIMIT
                if any(term in error_content for term in ['unauthorized', 'invalid key', 'authentication', '401', '403']):
                    return BraveResponseType.AUTH_ERROR
                return BraveResponseType.ERROR
        
        if any(key in data for key in self.expected_top_level_keys):
            return BraveResponseType.SUCCESS
        
        if 'type' in data:
            type_value = data.get('type', '').lower()
            if type_value == 'search':
                return BraveResponseType.SUCCESS
            elif 'error' in type_value:
                return BraveResponseType.ERROR
        
        return BraveResponseType.UNEXPECTED
    
    def _handle_http_error(self, data: Dict, status_code: int) -> BraveAPIResult:
        """
        Handle HTTP error status codes
        """
        error_message = self._extract_error_message(data)
        if status_code == 429:
            return self._create_error_result(
                BraveResponseType.RATE_LIMIT,
                error_message or f"Rate limit exceeded (HTTP {status_code})",
                data
            )
        elif status_code in [401, 403]:
            return self._create_error_result(
                BraveResponseType.AUTH_ERROR,
                error_message or f"Authentication error (HTTP {status_code})",
                data
            )
        else:
            return self._create_error_result(
                BraveResponseType.ERROR,
                error_message or f"HTTP error {status_code}",
                data
            )
    
    def _handle_success_response(self, data: Dict) -> BraveAPIResult:
        """
        Handle successful Brave API responses with various structures
        """
        results = []
        metadata = {}
        
        try:
            result_types_to_check = ['web', 'news', 'videos', 'discussions', 'faq']
            for res_type in result_types_to_check:
                if res_type in data and isinstance(data[res_type], dict):
                    type_results = data[res_type].get('results', [])
                    if isinstance(type_results, list):
                        results.extend(self._normalize_results(type_results, res_type))
            
            if 'results' in data and isinstance(data['results'], list): # Direct results array
                results.extend(self._normalize_results(data['results'], 'generic'))
            
            if 'query' in data: metadata['query'] = data['query']
            if 'mixed' in data: metadata['mixed'] = data['mixed']
            
            logger.info(f"Successfully parsed Brave response: {len(results)} results extracted")
            
            return BraveAPIResult(
                response_type=BraveResponseType.SUCCESS,
                success=True,
                results=results,
                metadata=metadata,
                raw_response=data
            )
            
        except Exception as e:
            logger.error(f"Error processing success response: {e}", exc_info=True)
            return self._create_error_result(
                BraveResponseType.UNEXPECTED,
                f"Error processing success response: {str(e)}",
                data
            )
    
    def _normalize_results(self, results_list: List[Dict], result_type_category: str) -> List[Dict]:
        """
        Normalize results from different sections into a consistent format
        """
        normalized_list = []
        for item in results_list:
            if not isinstance(item, dict): continue
                
            normalized_item = {
                'title': item.get('title', '').strip(),
                'url': self._extract_url(item), # Uses the enhanced URL extraction
                'description': item.get('description', '').strip(),
                'result_type': item.get('type', result_type_category), # Prefer specific type if available
                'provider': 'brave', # Standardized provider name
                'raw_data': item # Keep original for debugging or further processing
            }
            
            # Add type-specific fields if relevant
            if result_type_category == 'news':
                normalized_item['published'] = item.get('age', item.get('date_published'))
                normalized_item['source'] = item.get('source', '')
            elif result_type_category == 'videos':
                if 'video' in item and isinstance(item['video'], dict):
                    video_data = item['video']
                    normalized_item['duration'] = video_data.get('duration', '')
                    normalized_item['views'] = str(video_data.get('views', '')) # Ensure views are string
            
            if normalized_item['title'] or normalized_item['url']: # Only add if there's something to use
                normalized_list.append(normalized_item)
        
        return normalized_list
    
    def _extract_url(self, result_item: Dict) -> Optional[str]:
        """
        Extract URL using multiple fallback strategies, similar to the standalone function.
        """
        if result_item.get('url') and isinstance(result_item['url'], str) and result_item['url'].strip():
            return result_item['url'].strip()
        
        if 'meta_url' in result_item and isinstance(result_item['meta_url'], dict):
            meta = result_item['meta_url']
            if meta.get('scheme') and meta.get('netloc'):
                path = meta.get('path', '')
                return f"{meta['scheme']}://{meta['netloc']}{path}"
        
        if 'data_providers' in result_item and isinstance(result_item['data_providers'], list):
            for provider_dp in result_item['data_providers']:
                if isinstance(provider_dp, dict) and provider_dp.get('url') and isinstance(provider_dp['url'], str):
                    return provider_dp['url']
        
        for _, value_field in result_item.items():
            if isinstance(value_field, dict) and 'url' in value_field:
                candidate_url = value_field.get('url')
                if candidate_url and isinstance(candidate_url, str) and candidate_url.strip():
                    return candidate_url.strip()
        
        if 'profile' in result_item and isinstance(result_item['profile'], dict) and \
           result_item['profile'].get('url') and isinstance(result_item['profile']['url'], str):
            return result_item['profile']['url']
        
        return None # Return None if no URL found
    
    def _handle_error_response(self, data: Dict) -> BraveAPIResult:
        error_message = self._extract_error_message(data)
        return self._create_error_result(BraveResponseType.ERROR, error_message, data)
    
    def _handle_rate_limit_response(self, data: Dict) -> BraveAPIResult:
        error_message = self._extract_error_message(data) or "Rate limit exceeded"
        return self._create_error_result(BraveResponseType.RATE_LIMIT, error_message, data)
    
    def _handle_auth_error_response(self, data: Dict) -> BraveAPIResult:
        error_message = self._extract_error_message(data) or "Authentication failed"
        return self._create_error_result(BraveResponseType.AUTH_ERROR, error_message, data)
    
    def _handle_unexpected_response(self, data: Dict) -> BraveAPIResult:
        logger.warning(f"Unexpected Brave API response structure: {list(data.keys())}")
        results = []
        for _, value in data.items():
            if isinstance(value, list) and value and isinstance(value[0], dict) and \
               ('title' in value[0] or 'url' in value[0]):
                results.extend(self._normalize_results(value, 'unknown_list_source'))
        
        return BraveAPIResult(
            response_type=BraveResponseType.UNEXPECTED,
            success=len(results) > 0, # Success if we managed to extract something
            results=results,
            error_message=f"Unexpected response structure. Keys: {list(data.keys())}",
            raw_response=data
        )
    
    def _extract_error_message(self, data: Dict) -> str:
        error_fields = ['error_message', 'message', 'detail', 'error', 'errors', 'title']
        for field in error_fields:
            if field in data:
                error_value = data[field]
                if isinstance(error_value, str): return error_value
                if isinstance(error_value, list) and error_value: return str(error_value[0])
                if isinstance(error_value, dict): return json.dumps(error_value)
        if 'status' in data and isinstance(data['status'], dict):
            return data['status'].get('error_message', str(data['status']))
        return f"Unknown error. Response keys: {list(data.keys())}"

    def _create_error_result(self, response_type: BraveResponseType, 
                           error_message: str, raw_response: Any) -> BraveAPIResult:
        return BraveAPIResult(
            response_type=response_type,
            success=False,
            results=[],
            error_message=error_message,
            raw_response=raw_response if isinstance(raw_response, dict) else {"raw_string_response": str(raw_response)}
        )
