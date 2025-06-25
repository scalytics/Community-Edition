import re
import string
from typing import Dict, Iterable, Tuple, List


def _next_identifier(index: int) -> str:
    letters = string.ascii_uppercase
    result = ""
    index += 1
    while index > 0:
        index, rem = divmod(index - 1, 26)
        result = letters[rem] + result
    return result


def resolve_urls(urls: Iterable[str], existing_map: Dict[str, str] | None = None) -> Dict[str, str]:
    """Map each unique URL to a short alphabetic identifier.

    Parameters
    ----------
    urls: Iterable[str]
        URLs that should receive a short identifier.
    existing_map: Dict[str, str] | None
        Optional existing mapping of identifiers to URLs. New URLs will be
        assigned identifiers that don't conflict with existing ones.

    Returns
    -------
    Dict[str, str]
        Updated mapping including identifiers for any new URLs.
    """
    mapping = dict(existing_map) if existing_map else {}
    reverse = {v: k for k, v in mapping.items()}
    idx = len(mapping)
    for url in urls:
        if url in reverse:
            continue
        identifier = _next_identifier(idx)
        mapping[identifier] = url
        reverse[url] = identifier
        idx += 1
    return mapping


def extract_and_map_llm_citations(text_with_llm_markers: str) -> Tuple[str, Dict[str, str]]:
    """
    Finds [source: URL] markers in text, assigns short identifiers to unique URLs,
    replaces markers with short identifiers, and returns the modified text
    and a map of {identifier: URL}.
    """
    if not text_with_llm_markers:
        return "", {}

    # Regex to find [ref: URL] markers. Handles various URL characters.
    # It captures the URL part.
    llm_marker_pattern = re.compile(r"\[ref:\s*([^\]]+?)\]", re.IGNORECASE) # Changed from source: to ref:, added IGNORECASE
    
    found_urls: List[str] = []
    # Find all URLs specified in the [source: ...] markers
    for match in llm_marker_pattern.finditer(text_with_llm_markers):
        url = match.group(1).strip()
        if url:
            found_urls.append(url)
    
    if not found_urls:
        # If no [ref:URL] markers, return text as is, and an empty map.
        # This means the LLM didn't produce any citations in the expected format.
        return text_with_llm_markers, {}

    # Get a map of {identifier: URL} for unique URLs
    # resolve_urls ensures unique URLs get unique identifiers
    identifier_to_url_map = resolve_urls(found_urls) # existing_map can be None

    # Create a reverse map for easy lookup: {URL: identifier}
    url_to_identifier_map = {url: ident for ident, url in identifier_to_url_map.items()}

    modified_text = text_with_llm_markers
    # Iterate in reverse to handle string modifications correctly without affecting subsequent match indices
    for match in reversed(list(llm_marker_pattern.finditer(text_with_llm_markers))):
        url_in_marker = match.group(1).strip()
        if url_in_marker in url_to_identifier_map:
            identifier = url_to_identifier_map[url_in_marker]
            # Replace the whole "[ref: URL]" with "[identifier]"
            modified_text = modified_text[:match.start()] + f"[{identifier}]" + modified_text[match.end():]
            
    return modified_text, identifier_to_url_map


def insert_citation_markers(text: str, url_map: Dict[str, str]) -> str:
    """Replace URLs in text with their short citation markers."""
    if not text:
        return text
    processed = text
    # Replace longer URLs first to avoid partial replacements
    for ident, url in sorted(url_map.items(), key=lambda x: len(x[1]), reverse=True):
        pattern = re.escape(url)
        processed = re.sub(pattern, f"[{ident}]", processed)
    return processed


def get_citations(text: str, url_map: Dict[str, str]) -> Dict[str, str]:
    """Return mapping of citation identifiers actually used in the text."""
    used = {}
    for ident, url in url_map.items():
        if f"[{ident}]" in text:
            used[ident] = url
    return used
