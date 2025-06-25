import pytest
from python_services.deep_search_service.utils.citations import (
    resolve_urls,
    insert_citation_markers,
    get_citations,
)


def test_citation_flow():
    urls = ["https://example.com/a", "https://example.com/b"]
    mapping = resolve_urls(urls)
    text = "Info at https://example.com/a and more at https://example.com/b." \
        " Another mention https://example.com/a."
    processed = insert_citation_markers(text, mapping)
    assert "[A]" in processed and "[B]" in processed
    citations = get_citations(processed, mapping)
    assert citations == {"A": "https://example.com/a", "B": "https://example.com/b"}
