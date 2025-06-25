from typing import List, Dict, Optional, Any, Set, Tuple, Literal, Union
from pydantic import BaseModel, Field, HttpUrl
import asyncio # For asyncio.Event
import uuid # Added for ContentChunk.chunk_id

# --- Request and Response Models for API ---

class DeepSearchRequestParams(BaseModel):
    initial_query: str
    search_providers: Optional[List[str]] = None
    reasoning_model_info: Optional[Dict[str, Any]] = None # Includes name, provider, temp, max_tokens
    synthesis_model_info: Optional[Dict[str, Any]] = None # Includes name, provider, temp, max_tokens
    max_hops: Optional[int] = None
    max_total_urls_per_task: Optional[int] = None
    max_distinct_search_queries: Optional[int] = None # Added
    max_results_per_provider_query: Optional[int] = None # Added
    top_k_retrieval_per_hop: Optional[int] = None
    chunk_size_words: Optional[int] = None
    chunk_overlap_words: Optional[int] = None
    max_url_exploration_depth: Optional[int] = None
    is_document_focused_query: bool = False
    document_references: Optional[List[Dict[str, Any]]] = None # e.g., [{"file_id": "xyz", "original_filename": "doc.pdf"}]
    task_date_context: Optional[str] = None # e.g., "June 2023" or "Q4 2022"

class DeepSearchRequest(BaseModel):
    user_id: str
    request_params: DeepSearchRequestParams
    api_config: Optional[Dict[str, Any]] = None # Pre-resolved API keys if available

class TaskCreationResponse(BaseModel):
    task_id: str
    status: str
    stream_url: str
    cancel_url: str

class CancellationResponse(BaseModel):
    task_id: str
    status: str
    message: Optional[str] = None

class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress_message: Optional[str] = None
    # Potentially add more details like current_hop, etc.

# --- SSE Event Models ---
class SSEProgressData(BaseModel):
    stage: str
    message: str
    details: Optional[Dict[str, Any]] = None
    is_key_summary: Optional[bool] = None # Added for frontend to persist this message

class SSEErrorData(BaseModel):
    error_message: str
    stage: Optional[str] = None
    is_fatal: bool = False

class SSECancelledData(BaseModel):
    message: str

class SSEMarkdownChunkData(BaseModel):
    chunk_id: int
    content: str
    is_final_chunk: bool = False

class SSEFollowUpSuggestionsData(BaseModel):
    suggestions: List[str]

class ReportSourceItem(BaseModel):
    url: str
    title: Optional[str] = None
    citation_marker: str
    trust_score: Optional[float] = None
    provider_name: Optional[str] = None
    retrieved_at: Optional[str] = None

class ModelUsageData(BaseModel):
    model_id: Optional[int] = None
    model_name: Optional[str] = None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class SSECompleteData(BaseModel):
    message: str
    detailed_token_usage: List[ModelUsageData]
    report_sources: List[ReportSourceItem]
    total_hops_executed: int
    final_reasoning_steps_coverage: Dict[str, bool]
    count_total_urls_scraped: int
    count_total_chunks_indexed: int
    stat_total_web_queries_executed: int
    stat_duration_display: str
    suggested_follow_ups: List[str]
    pre_flight_llm_answer: Optional[str] = None

class SSEEvent(BaseModel):
    task_id: str
    event_type: Literal["progress", "markdown_chunk", "error", "complete", "cancelled", "heartbeat", "follow_up_suggestions"]
    payload: Union[SSEProgressData, SSEMarkdownChunkData, SSEErrorData, SSECompleteData, SSECancelledData, SSEFollowUpSuggestionsData, Dict[str, Any]] # Allow Dict for heartbeat

# --- Internal Data Models for Graph State and Operations ---

class SearchResultItem(BaseModel):
    url: str
    title: Optional[str] = None
    snippet: Optional[str] = None
    provider_name: str
    query_phrase_used: str
    position: int # Rank from the search provider

class ContentChunk(BaseModel):
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    original_url: str
    page_title: Optional[str] = None
    text_content: str
    chunk_index_in_page: int
    depth: int # Hop depth at which this chunk was processed
    vector_metadata: Dict[str, Any] = Field(default_factory=dict) # For LanceDB metadata

class CandidateLinkToExplore(BaseModel):
    url: str
    source_page_url: str
    calculated_depth: int # Hop depth of the source page
    anchor_text: Optional[str] = None
    context_around_link: Optional[str] = None
    priority_score: float = 0.5 # Default, can be updated by LLM

    def __lt__(self, other: 'CandidateLinkToExplore') -> bool:
        # For heapq, which is a min-heap, we store negative priority
        # So, higher positive priority means "smaller" in min-heap terms
        if self.priority_score == other.priority_score:
            return self.calculated_depth < other.calculated_depth # Lower depth is better for tie-breaking
        return self.priority_score > other.priority_score # Higher score is better

class LibrarianAnalysisResult(BaseModel):
    # New fields from the focused prompt
    answered_questions: List[str] = Field(default_factory=list)
    key_facts: Dict[str, str] = Field(default_factory=dict) # Maps question to specific answer/evidence
    missing_info: str = "No specific missing information identified."
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    # Old fields kept for potential backward compatibility / robust access in graph_nodes
    covered_reasoning_steps: List[str] = Field(default_factory=list)
    key_information_for_covered_steps: Dict[str, str] = Field(default_factory=dict)
    newly_identified_keywords_or_entities: List[str] = Field(default_factory=list)
    suggested_new_sub_queries: List[str] = Field(default_factory=list)
    remaining_gaps_summary: str = "Analysis pending or no significant gaps identified." # Default from old model
    verification_outcome: Literal["CONFIRMED", "CONTRADICTED", "INCONCLUSIVE", "NOT_APPLICABLE"] = "NOT_APPLICABLE"
    verification_reasoning: Optional[str] = None
    confirmed_value: Optional[str] = None
    verified_query_phrase_if_any: Optional[str] = None

class ChunkSummary(BaseModel):
    chunk_id: str
    source_url: str
    title: Optional[str] = None
    brief_snippet: str
    relevance_score: Optional[float] = None
    depth: int

class MultiHopProgressData(BaseModel):
    current_hop: int
    max_hops: int
    hop_stage_name: str
    hop_stage_message: str
    initial_reasoning_steps: List[str]
    covered_reasoning_steps: List[str]
    uncovered_reasoning_steps: List[str]
    newly_covered_this_hop: Optional[List[str]] = None
    new_queries_for_next_hop: Optional[List[str]] = None
    top_chunks_summary: Optional[List[ChunkSummary]] = None

class TypedEntity(BaseModel):
    text: str
    type: str # e.g., PER, ORG, LOC, PRODUCT, CONCEPT, EVENT, MISC

class TypedRelationship(BaseModel):
    subject: TypedEntity
    predicate: str # Textual description
    object: TypedEntity
    predicate_type: str # Normalized type, e.g., "PRODUCED_BY", "LOCATED_IN"
    confidence_score: float = Field(ge=0.0, le=1.0)
    context_snippet: Optional[str] = None

class ExtractedLinkItem(BaseModel):
    url: str
    anchor_text: Optional[str] = None
    context_around_link: Optional[str] = None

class TargetedSiteExplorationDirective(BaseModel):
    target_domain: str
    prioritized_internal_urls: List[str]
    max_pages_for_this_exploration: int
    reasoning: str

# --- Vector Store Related Models ---
class GenericDocumentItem(BaseModel):
    id: str
    text_content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

class AddDocumentsRequest(BaseModel):
    group_id: str
    documents: List[GenericDocumentItem]

class VectorSearchRequest(BaseModel):
    query_text: str
    top_k: int = 10
    group_id: Optional[str] = None # If None, searches across all groups (or default table)

class VectorSearchResultItem(BaseModel):
    id: str
    text_content: Optional[str] = None # May not always be returned by vector store directly
    metadata: Dict[str, Any] = Field(default_factory=dict)
    similarity: Optional[float] = None # Cosine similarity or other distance metric

class VectorSearchResponse(BaseModel):
    success: bool
    message: str
    results: List[VectorSearchResultItem]

class DeleteByGroupIdRequest(BaseModel):
    group_id: str

class GeneralVectorResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None

class EmbedTextsRequest(BaseModel):
    texts: List[str]
    model_identifier: Optional[str] = None # Currently ignored, uses service default

class EmbedTextsResponse(BaseModel):
    embeddings: List[List[float]]
    model_used: str
    dimension: int

class IngestDocumentsRequest(BaseModel):
    documents: List[Dict[str, Any]] # [{"file_id_from_node": "...", "file_path": "...", "original_name": "...", "file_type": "...", "metadata": {}}]
    reasoning_model_info: Optional[Dict[str, Any]] = None
    api_config: Optional[Dict[str, Any]] = None

# --- Overall Graph State ---
class OverallState(BaseModel):
    task_id: str
    user_id: str # Added user_id here
    original_query: str
    request_params: DeepSearchRequestParams
    api_config: Dict[str, Any]
    
    start_time_monotonic: Optional[float] = None
    max_hops: int = 3  # Community Edition default
    max_total_urls_per_task: int = 50  # Community Edition default
    max_stagnation_limit: int = 2  # Community Edition default
    current_reasoning_dynamic_temperature: float = 0.7  # Community Edition default
    
    aggregated_token_usage: List[ModelUsageData] = Field(default_factory=list)
    current_hop: int = 0
    
    full_research_plan_data_points: List[Dict[str, Any]] = Field(default_factory=list)
    all_reasoning_steps: List[str] = Field(default_factory=list)
    covered_reasoning_steps: Set[str] = Field(default_factory=set)
    
    current_queries_for_hop: List[str] = Field(default_factory=list)
    executed_search_queries: Set[str] = Field(default_factory=set)
    failed_search_queries: List[str] = Field(default_factory=list) # Added
    successful_search_queries: List[str] = Field(default_factory=list) # Added
    
    links_to_explore_pq: List[Tuple[float, int, CandidateLinkToExplore]] = Field(default_factory=list) # (neg_priority, tie_breaker, item)
    pq_tie_breaker: int = 0
    
    stagnation_counter: int = 0
    is_cancelled_flag: asyncio.Event = Field(default_factory=asyncio.Event, exclude=True) # Exclude from serialization

    # Fact-centric strategy fields
    fact_centric_strategy_active: bool = False
    core_entity: Optional[str] = None
    target_attributes: List[str] = Field(default_factory=list)
    fact_centric_proposed_attributes: Dict[str, Any] = Field(default_factory=dict) # {attr_name: proposed_value}
    fact_centric_verified_attributes: Dict[str, Any] = Field(default_factory=dict) # {attr_name: verified_value}
    fact_centric_verification_query_map: Dict[str, str] = Field(default_factory=dict) # {verification_query: attribute_name}
    ask_llm_verification_map: Dict[str, Dict[str, str]] = Field(default_factory=dict) # {verification_query: {"original_question": ..., "proposed_answer": ..., "original_dp_name": ...}}

    # Synthesis related
    accumulated_top_chunks_for_synthesis: List[ContentChunk] = Field(default_factory=list)
    all_processed_chunks_this_task: Dict[str, ContentChunk] = Field(default_factory=dict) # chunk_id -> ContentChunk
    
    # URL and Content Tracking
    visited_urls: Set[str] = Field(default_factory=set)
    site_exploration_depth_tracker: Dict[str, int] = Field(default_factory=dict) # site_key -> depth
    permanently_failed_urls_this_task: Set[str] = Field(default_factory=set)
    page_link_details_map: Dict[str, List[ExtractedLinkItem]] = Field(default_factory=dict) # source_url -> List[ExtractedLinkItem]

    # Intermediate results per hop
    search_results_this_hop: List[SearchResultItem] = Field(default_factory=list)
    processed_chunks_this_hop: List[ContentChunk] = Field(default_factory=list)
    newly_extracted_links_this_hop: List[CandidateLinkToExplore] = Field(default_factory=list)
    librarian_analysis_result: Optional[LibrarianAnalysisResult] = None
    
    # Document context
    document_context_summary: Optional[str] = None

    # Final outputs
    final_report_md: Optional[str] = None
    report_sources: List[ReportSourceItem] = Field(default_factory=list)
    suggested_follow_ups: List[str] = Field(default_factory=list)
    pre_flight_llm_answer: Optional[str] = None
    url_citation_map: Dict[str, str] = Field(default_factory=dict) # short_marker -> full_url
    citations_used_map: Dict[str, str] = Field(default_factory=dict) # short_marker -> full_url (only those used in final report)

    # Stats
    total_urls_scraped_count: int = 0
    total_chunks_indexed_count: int = 0
    
    # Dynamic behavior flags
    similarity_stop_triggered_this_hop: bool = False
    hops_since_last_temp_increase: int = 0
    significant_progress_after_temp_increase: bool = False
    consecutive_low_diversity_hops: int = 0
    newly_covered_in_hop_check: List[str] = Field(default_factory=list) # Tracks steps covered in the current hop's librarian check
    task_date_context: Optional[str] = None # Added for temporal context

    # Comptroller related state
    comptroller_hop_credits: int = 1 # Default, will be set by settings in initialize_task_node
    is_comptroller_review_failed: bool = False
    comptroller_feedback_for_retake: List[str] = Field(default_factory=list)
    force_reexecute_queries_this_hop: Set[str] = Field(default_factory=set)
    low_confidence_synthesis_mode: bool = False
    comptroller_strategy_re_evaluation_needed: bool = False
    previous_comptroller_feedback: List[List[str]] = Field(default_factory=list) # History of feedback lists
    comptroller_feedback_retry_count: int = 0 # Count of consecutive similar feedback
    claims_previously_fact_checked_in_cycle: Set[str] = Field(default_factory=set) # Tracks claims fact-checked in current synthesis/refine cycle
    active_comptroller_feedback_items: Optional[List[str]] = None # Stores the specific feedback that triggered the current re-research/re-synthesis cycle
    previous_librarian_summary: Optional[str] = None
    consecutive_stagnation_hops: int = 0

    class Config:
        arbitrary_types_allowed = True # For asyncio.Event
        # If using Pydantic v2, you might need json_encoders for asyncio.Event if it's not excluded
        # json_encoders = {
        #     asyncio.Event: lambda v: None # Or some other serializable representation
        # }
