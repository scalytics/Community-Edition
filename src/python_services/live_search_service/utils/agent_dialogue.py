# Agent Dialogue Templates

# For ResearchController (accessed as attributes)
CONTROLLER_TASK_START = "**[Research Strategist]** Initializing Live Search task. I will break down the query and plan the research."
SYSTEM_CANCELLED_BY_USER = "**[System]** Research task cancelled by user."
CONTROLLER_MAX_HOPS_REACHED = "**[Research Strategist]** Maximum research depth of {max_hops} hops reached. Concluding research phase."
CONTROLLER_ALL_COVERED = "**[Research Strategist]** All key aspects of the query appear to be covered. Concluding research phase."
CONTROLLER_STAGNATION_STOP = "**[Research Strategist]** Research has stagnated after multiple attempts to find new information. Concluding research phase."
CONTROLLER_MAX_URLS_REACHED = "**[Research Strategist]** Maximum number of URLs ({max_total_urls_per_task}) processed. Concluding research phase to manage resources."
CONTROLLER_NO_FURTHER_ACTIONS = "**[Research Strategist]** No further actions or leads found. Concluding research."
CONTROLLER_HOP_START = "**[Research Strategist]** Starting Hop {current_hop}/{max_hops}. Focusing on: {focus_topics_str}."
CONTROLLER_HOP_START_NO_FOCUS = "**[Research Strategist]** Starting Hop {current_hop}/{max_hops} for general exploration."
CONTROLLER_STAGNATION_WARNING = "**[Research Strategist]** Warning: Current research direction is yielding limited new information. Will try a few more times before concluding if no progress."
CONTROLLER_SIMILARITY_STOP_EARLY = "**[Research Strategist]** Recently gathered information is becoming highly similar to previous findings. Will narrow focus or conclude if no diverse leads emerge."
CONTROLLER_FINALIZING = "**[Research Strategist]** Research phase complete. Moving to synthesize the final report."

# For SearchAgent messages (used by MultiHopDeepSearchRunner via function call)
# This function might be called by the runner directly.
def get_search_agent_message(event_key: str, **kwargs) -> str:
    """
    Returns a formatted message string for search agent events.
    """
    if event_key == "starting_web_search":
        num_queries = kwargs.get('num_queries', 'multiple')
        return f"**[Search Agent]** Starting web search for {num_queries} queries..."
    elif event_key == "searching_provider_for_query":
        provider_name = kwargs.get('provider_name', 'a provider')
        query_snippet = kwargs.get('query', '...')[:30]
        return f"**[Search Agent]** Using {provider_name} for query: \"{query_snippet}...\""
    elif event_key == "web_search_hop_complete":
        num_results = kwargs.get('num_results', 0)
        return f"**[Search Agent]** Web search for this hop complete. Found {num_results} results."
    
    # Fallback for any other search agent keys if added later
    return f"**[Search Agent]** Event: {event_key} - Details: {kwargs}"

# --- Standard Persona Message Prefixes (can be used by functions or directly) ---
RESEARCH_STRATEGIST_PREFIX = "**[Research Strategist]**"
SEARCH_AGENT_PREFIX = "**[Search Agent]**"
DATA_COLLECTOR_PREFIX = "**[Data Collector]**" # Formerly Scraper Agent
LIBRARIAN_PREFIX = "**[Librarian]**"
LINK_EXTRACTOR_PREFIX = "**[Link Extractor]**"
KNOWLEDGE_ARCHITECT_PREFIX = "**[Knowledge Architect]**" # Formerly Insight Synthesizer / Synthesizer
DOCUMENT_ANALYST_PREFIX = "**[Document Analyst]**"
SYSTEM_PREFIX = "**[System]**"

# --- Message Templates (can be expanded) ---

# Data Collector (Scraper Agent)
DATA_COLLECTOR_PROCESSING_START = f"{DATA_COLLECTOR_PREFIX} Starting to process {{num_results}} search results..."
DATA_COLLECTOR_READING_URL = f"{DATA_COLLECTOR_PREFIX} Reading content from: {{url}}" # New template
DATA_COLLECTOR_PROCESSING_SKIPPED_NO_RESULTS = f"{DATA_COLLECTOR_PREFIX} No search results to process for this hop."
DATA_COLLECTOR_CONTENT_CHUNKED = f"{DATA_COLLECTOR_PREFIX} Processed and chunked content from: {{url_snippet}}"
DATA_COLLECTOR_CONTENT_EMPTY = f"{DATA_COLLECTOR_PREFIX} No text content found at: {{url_snippet}}"
DATA_COLLECTOR_INDEXED = f"{DATA_COLLECTOR_PREFIX} Successfully indexed {{num_chunks}} new content chunks from {{num_sources}} sources."
DATA_COLLECTOR_PROCESSING_NO_NEW_CHUNKS = f"{DATA_COLLECTOR_PREFIX} Content processing complete. No new chunks were added to the knowledge base this round."

# Librarian
LIBRARIAN_CONSULTATION_START = f"{LIBRARIAN_PREFIX} Consulting internal knowledge base..."
LIBRARIAN_CONSULTATION_NO_RESULTS = f"{LIBRARIAN_PREFIX} Internal knowledge base consultation found no highly relevant existing documents."
LIBRARIAN_CONSULTATION_FOUND_RESULTS = f"{LIBRARIAN_PREFIX} Knowledge base consultation complete, found relevant documents. Now re-ranking and analyzing these findings..."
LIBRARIAN_ANALYSIS_START = "**[Librarian]** Analyzing retrieved content against research objectives..."
LIBRARIAN_RERANKING_START = f"{LIBRARIAN_PREFIX} Re-ranking {{num_candidates}} candidate chunks for relevance..."
LIBRARIAN_ENTITY_EXTRACTION_START = f"{LIBRARIAN_PREFIX} Extracting entities from {{num_primary_chunks}} primary chunks for expansion search..."
LIBRARIAN_FTS_EXPANSION_START = f"{LIBRARIAN_PREFIX} Searching for expansion chunks using {{num_entities}} entities..."
LIBRARIAN_EXPANSION_RELEVANCE_CHECK_START = f"{LIBRARIAN_PREFIX} Checking relevance of {{num_expansion_chunks}} potential expansion snippets..."
LIBRARIAN_FINAL_ANALYSIS_START = f"{LIBRARIAN_PREFIX} Performing final analysis on {{num_top_chunks}} top chunks and {{num_expansion_snippets}} expansion snippets..."
LIBRARIAN_ANALYSIS_NO_CANDIDATES = f"{LIBRARIAN_PREFIX} No relevant content found or retrieved for analysis this hop."
LIBRARIAN_ANALYSIS_COMPLETE_HOP = "**[Librarian]** Hop {current_hop} analysis: {summary_of_findings}. Remaining focus: {gaps_or_next_steps}."
LIBRARIAN_VECTOR_WEB_COMPARISON_NO_ADDITIONAL = f"{LIBRARIAN_PREFIX} No additional relevant documents found in existing knowledge base beyond shallow search."
LIBRARIAN_VECTOR_WEB_COMPARISON_FOUND_ADDITIONAL = f"{LIBRARIAN_PREFIX} Found {{num_docs}} potentially relevant documents from existing knowledge. Re-ranking and analyzing for gaps..."
LIBRARIAN_VECTOR_WEB_COMPARISON_COMPLETE = f"{LIBRARIAN_PREFIX} Vector vs. Web comparison complete. Newly covered ToC sections: {{num_newly_covered}}. Total covered: {{total_covered}}/{{total_steps}}."


# Link Extractor
LINK_EXTRACTOR_SKIPPED = f"{LINK_EXTRACTOR_PREFIX} No new links extracted in this hop to prioritize."
LINK_EXTRACTOR_START = f"{LINK_EXTRACTOR_PREFIX} Prioritizing {{num_links}} newly extracted links..."
LINK_EXTRACTOR_NO_VALID_NEW = f"{LINK_EXTRACTOR_PREFIX} All newly extracted links were already visited or known to be problematic."
LINK_EXTRACTOR_COMPLETE = f"{LINK_EXTRACTOR_PREFIX} Added {{num_added}} new links to the exploration queue. Total queue size: {{queue_size}}."

# Knowledge Architect (Synthesizer) / Editor
SYNTHESIS_START = "**[Editor]** Synthesizing comprehensive report from research findings..." # User suggested format
SYNTHESIS_NO_CONTENT_FALLBACK = "**[Editor]** Insufficient content was gathered to provide a comprehensive analysis. The research may need to be expanded with different search strategies or additional sources." # User suggested format
SYNTHESIS_DRAFT_ERROR_FALLBACK = "**[Editor]** Error during draft synthesis. Please try again or contact support." # User suggested format

# Old aliases, can be removed or kept for backward compatibility if other parts of code use them.
# For now, keeping them commented out.
# KNOWLEDGE_ARCHITECT_START = SYNTHESIS_START 
# KNOWLEDGE_ARCHITECT_NO_CONTENT = SYNTHESIS_NO_CONTENT_FALLBACK
# KNOWLEDGE_ARCHITECT_DRAFTING = f"{KNOWLEDGE_ARCHITECT_PREFIX} Generating initial draft of the report..." # This one is distinct, might be used elsewhere
KNOWLEDGE_ARCHITECT_DRAFTING = f"**[Editor]** Generating initial draft of the report..." # Aligning prefix
KNOWLEDGE_ARCHITECT_COMPLETE = f"**[Editor]** Final report generation complete."


# Document Analyst
DOCUMENT_ANALYST_CONTEXT_RETRIEVAL = f"{DOCUMENT_ANALYST_PREFIX} Retrieving context from uploaded documents for planning..."
DOCUMENT_ANALYST_CONTEXT_RETRIEVED = f"{DOCUMENT_ANALYST_PREFIX} Retrieved context from {{num_docs}} uploaded document sections."
DOCUMENT_ANALYST_CONTEXT_EMPTY = f"{DOCUMENT_ANALYST_PREFIX} Uploaded documents found, but no extracted summaries available for planning."
DOCUMENT_ANALYST_CONTEXT_NOT_FOUND = f"{DOCUMENT_ANALYST_PREFIX} No uploaded document context found for planning."
DOCUMENT_ANALYST_INGESTION_START = f"{DOCUMENT_ANALYST_PREFIX} Starting detailed analysis of uploaded documents..." # From deepSearchTool.js
DOCUMENT_ANALYST_INGESTION_COMPLETE = f"{DOCUMENT_ANALYST_PREFIX} Document analysis completed." # From deepSearchTool.js, can be enhanced by Python

# System (already has some, can add more if needed)
SYSTEM_PROGRESS_UPDATE = f"{SYSTEM_PREFIX} {{message}}" # Generic system update

# Ensure all keys used by ResearchController's get_formatted_controller_message
# and MultiHopDeepSearchRunner's calls to get_search_agent_message are defined above
# or handled in the get_search_agent_message function.
# Also, ensure MultiHopDeepSearchRunner uses these constants/functions.

# Alternative fallback if the template is missing
def format_librarian_message(current_hop: int, summary_of_findings: str, gaps_or_next_steps: str) -> str:
    """Fallback function to format librarian messages if template is missing."""
    return f"**[Librarian]** Hop {current_hop} analysis: {summary_of_findings}. Remaining focus: {gaps_or_next_steps}."
