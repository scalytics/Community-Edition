import os
import sqlite3
import sys 
import json 
from dotenv import load_dotenv
from pydantic import Field 
from pydantic_settings import BaseSettings
from typing import Optional, Dict, List, Any 

project_root_config = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
dotenv_path = os.path.join(project_root_config, '.env')
SQLITE_DB_PATH = os.path.join(project_root_config, 'data', 'community.db')

load_dotenv(dotenv_path=dotenv_path)

def _get_active_embedding_model_from_db(db_path: str) -> Optional[str]:
    """
    Retrieves the path or ID of the active embedding model from the database.
    Returns None if not found or an error occurs.
    """
    model_identifier: Optional[str] = None
    try:
        if not os.path.exists(db_path):
            print(f"[Config] Warning: SQLite DB not found at {db_path}. No embedding model configured.", file=sys.stderr)
            return None

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT huggingface_repo, model_path 
            FROM models 
            WHERE is_embedding_model = 1 AND is_active = 1 
    ORDER BY is_default DESC, id DESC 
    LIMIT 1
""")
        row_fallback = cursor.fetchone()
        
        preferred_model_id_str: Optional[str] = None
        cursor.execute("SELECT value FROM system_settings WHERE key = 'preferred_local_embedding_model_id'")
        pref_row = cursor.fetchone()
        if pref_row and pref_row[0]:
            preferred_model_id_str = str(pref_row[0])
            print(f"[Config] Found preferred_local_embedding_model_id: {preferred_model_id_str}", file=sys.stderr)
            
            if preferred_model_id_str.isdigit():
                cursor.execute("""
                    SELECT huggingface_repo, model_path 
                    FROM models 
                    WHERE id = ? AND is_embedding_model = 1 AND is_active = 1
                    LIMIT 1
                """, (int(preferred_model_id_str),))
                row_preferred = cursor.fetchone()
                if row_preferred:
                    hf_repo = row_preferred[0]
                    model_p = row_preferred[1]
                    if hf_repo and hf_repo.strip():
                        model_identifier = hf_repo.strip()
                    elif model_p and model_p.strip():
                        model_identifier = model_p.strip()
                    print(f"[Config] Loaded preferred active embedding model (ID: {preferred_model_id_str}) from DB: {model_identifier}", file=sys.stderr)
                else:
                    print(f"[Config] Warning: Preferred embedding model ID {preferred_model_id_str} not found, not active, or not an embedding model. Checking fallback.", file=sys.stderr)
            else:
                print(f"[Config] Warning: preferred_local_embedding_model_id '{preferred_model_id_str}' is not a valid ID. Checking fallback.", file=sys.stderr)

        conn.close() 

        if model_identifier: 
            pass
        elif row_fallback: 
            hf_repo = row_fallback[0]
            model_p = row_fallback[1]
            if hf_repo and hf_repo.strip():
                model_identifier = hf_repo.strip()
            elif model_p and model_p.strip():
                model_identifier = model_p.strip()
            print(f"[Config] Loaded fallback active embedding model from DB: {model_identifier}", file=sys.stderr)
        else:
            print(f"[Config] Warning: No active embedding model found in DB (neither preferred nor fallback). Embedding model not configured.", file=sys.stderr)
            
    except sqlite3.Error as e:
        print(f"[Config] SQLite error fetching embedding model: {e}. Embedding model not configured.", file=sys.stderr)
        if 'conn' in locals() and conn: conn.close() 
    except Exception as e_global: 
        print(f"[Config] Unexpected error fetching embedding model: {e_global}. Embedding model not configured.", file=sys.stderr)
    
    return model_identifier

def _get_global_provider_config_from_db(db_path: str, provider_name_in_db: str) -> Dict[str, Any]:
    """
    Retrieves global API key and endpoints config for a given provider from the database.
    Returns an empty dict if not found or an error occurs.
    """
    config_data = {}
    conn = None
    try:
        if not os.path.exists(db_path):
            print(f"[Config] Warning: SQLite DB not found at {db_path} for provider config.", file=sys.stderr)
            return {}

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Step 1: Get provider_id and endpoints from api_providers table
        cursor.execute("""
            SELECT id, endpoints 
            FROM api_providers 
            WHERE name = ? AND is_active = 1
            LIMIT 1
        """, (provider_name_in_db,))
        provider_row = cursor.fetchone()

        if not provider_row:
            print(f"[Config] No active provider found in DB for name: {provider_name_in_db}", file=sys.stderr)
            return {} 

        provider_id, endpoints_json_str = provider_row
        
        if endpoints_json_str:
            try:
                endpoints_data = json.loads(endpoints_json_str)
                if isinstance(endpoints_data, dict):
                    config_data.update(endpoints_data) 
            except json.JSONDecodeError:
                print(f"[Config] Warning: Could not parse endpoints JSON for {provider_name_in_db}: {endpoints_json_str}", file=sys.stderr)

        # Step 2: Get the global API key from api_keys table using provider_id
        cursor.execute("""
            SELECT key_value 
            FROM api_keys
            WHERE provider_id = ? AND is_global = 1 AND is_active = 1
            LIMIT 1
        """, (provider_id,))
        key_row = cursor.fetchone()

        if key_row and key_row[0]:
            config_data['api_key'] = key_row[0]
        else:
            print(f"[Config] No active global API key found in DB for provider: {provider_name_in_db} (ID: {provider_id})", file=sys.stderr)
        
        if config_data: 
             print(f"[Config] Loaded global config for {provider_name_in_db} from DB", file=sys.stderr)
            
    except sqlite3.Error as e:
        print(f"[Config] SQLite error fetching config for {provider_name_in_db}: {e}", file=sys.stderr)
    except Exception as e_global:
        print(f"[Config] Unexpected error fetching config for {provider_name_in_db}: {e_global}", file=sys.stderr)
    finally:
        if conn:
            conn.close()
    return config_data

class Settings(BaseSettings):
    LIVE_SEARCH_SERVER_HOST: str = "0.0.0.0"
    LIVE_SEARCH_SERVER_PORT: int = 8001

    DEFAULT_EMBEDDING_MODEL_ID_OR_PATH: Optional[str] = Field(default_factory=lambda: _get_active_embedding_model_from_db(SQLITE_DB_PATH))
    LOCAL_LLM_API_BASE: Optional[str] = os.getenv("LOCAL_LLM_API_BASE", "http://localhost:3000/api/v1") 

    # Vector DB Configuration
    LANCEDB_BASE_URI: str = os.path.abspath(os.path.join(project_root_config, 'data', 'mcp_tools', 'deep_search_vector_store'))
    LANCEDB_DEFAULT_TABLE_NAME: str = "research_embeddings"
    UPLOAD_DIR_PYTHON_CAN_ACCESS: str = os.getenv("UPLOAD_DIR_PYTHON_CAN_ACCESS", os.path.abspath(os.path.join(project_root_config, 'uploads')))
    LIVE_SEARCH_GLOBAL_VECTOR_STORE_GROUP_ID: Optional[str] = os.getenv("LIVE_SEARCH_GLOBAL_VECTOR_STORE_GROUP_ID", None)

    global_google_config_data: Dict[str, Any] = Field(default_factory=lambda: _get_global_provider_config_from_db(SQLITE_DB_PATH, "Google Search"), exclude=True)
    global_brave_config_data: Dict[str, Any] = Field(default_factory=lambda: _get_global_provider_config_from_db(SQLITE_DB_PATH, "Brave Search"), exclude=True)
    global_bing_config_data: Dict[str, Any] = Field(default_factory=lambda: _get_global_provider_config_from_db(SQLITE_DB_PATH, "Bing Search"), exclude=True)
    global_courtlistener_config_data: Dict[str, Any] = Field(default_factory=lambda: _get_global_provider_config_from_db(SQLITE_DB_PATH, "CourtListener"), exclude=True)

    @property
    def GOOGLE_API_KEY(self) -> Optional[str]:
        return self.global_google_config_data.get('api_key') or os.getenv("GOOGLE_API_KEY")

    @property
    def GOOGLE_CX(self) -> Optional[str]:
        return self.global_google_config_data.get('cx') or os.getenv("GOOGLE_CX")

    @property
    def BRAVE_SEARCH_API_KEY(self) -> Optional[str]:
        return self.global_brave_config_data.get('api_key') or os.getenv("BRAVE_SEARCH_API_KEY")

    @property
    def BING_API_KEY(self) -> Optional[str]:
        return self.global_bing_config_data.get('api_key') or os.getenv("BING_API_KEY")

    @property
    def COURTLISTENER_API_KEY(self) -> Optional[str]:
        return self.global_courtlistener_config_data.get('api_key') or os.getenv("COURTLISTENER_API_KEY")

    # Default Research Parameters (can be overridden by request)
    DEFAULT_MAX_DISTINCT_SEARCH_QUERIES: int = 10 # Max overall unique search engine queries
    DEFAULT_MAX_RESULTS_PER_PROVIDER_QUERY: int = 5 # Results per query per provider
    DEFAULT_MAX_URL_EXPLORATION_DEPTH: int = 5 # Max depth PER SITE from an initial result/link
    DEFAULT_STAGNATION_LIMIT: int = 3 # Hops without new coverage before stopping

    # New Multi-Hop Specific Defaults
    DEFAULT_MAX_HOPS: int = 6 # Max research iterations/hops
    DEFAULT_CHUNK_SIZE_WORDS: int = 500
    DEFAULT_CHUNK_OVERLAP_WORDS: int = 100
    DEFAULT_TOP_K_RETRIEVAL_PER_HOP: int = 30 # Chunks to retrieve from vector store for analysis each hop (Suggested: 30)
    MAX_LINKS_FROM_PQ_PER_HOP: int = 3 # Max links to explore from priority queue each hop
    LIVE_SEARCH_PLACEHOLDER_RESOLUTION_DEPTH: int = Field(default=5, ge=1, le=10, description="Maximum recursion depth for resolving placeholders in queries.")

    # Hop Tuning Parameters
    LIVE_SEARCH_HIGH_FAILURE_RATE_THRESHOLD: float = Field(default=0.8, ge=0.0, le=1.0, description="Threshold for search failure rate in a hop to trigger a warning.")
    LIVE_SEARCH_MAX_QUERIES_PER_HOP: int = Field(default=5, ge=1, description="Maximum number of distinct search queries to generate and execute per hop.") 
    LIVE_SEARCH_URLS_PER_HOP_INITIAL: int = Field(default=15, description="Number of new URLs to process in the first hop.")
    LIVE_SEARCH_URLS_PER_HOP_SUBSEQUENT: int = Field(default=12, description="Number of new URLs to process in subsequent hops.")
    LIVE_SEARCH_MAX_TOTAL_URLS_PER_TASK: int = Field(default=100, description="Maximum total unique URLs to process across all hops for a single task.")
    LIVE_SEARCH_ENABLE_SIMILARITY_STOPPING: bool = Field(default=True, description="Enable dynamic stopping of a hop if new content similarity is below threshold.")
    LIVE_SEARCH_SIMILARITY_STOPPING_THRESHOLD: float = Field(default=0.7, ge=0.0, le=1.0, description="Similarity threshold for dynamic stopping. If top-K new chunks relevant to current query are below this, consider stopping.")
    LIVE_SEARCH_SIMILARITY_STOPPING_TOP_K: int = Field(default=3, ge=1, description="Number of top-K newly added chunks (relevant to current query) to check against the similarity stopping threshold.")

    # Settings for Initial Librarian Consultation Retrieval
    LIVE_SEARCH_INITIAL_CONSULT_EXTRA_CANDIDATES: int = Field(default=5, ge=0, description="Number of extra candidates to fetch beyond top_k_retrieval_per_hop for initial consultation.")
    LIVE_SEARCH_INITIAL_CONSULT_MAX_CANDIDATES: int = Field(default=35, ge=1, description="Absolute maximum number of candidates to fetch for the 'fetch extra' part of initial consultation.")

    # Settings for Shallow Kick-off Search
    LIVE_SEARCH_SHALLOW_KICKOFF_RESULTS_PER_QUERY: int = Field(default=5, ge=1, le=10, description="Number of search results per query for the shallow kick-off search phase.")
    LIVE_SEARCH_SHALLOW_KICKOFF_MAX_URLS_TO_PROCESS: int = Field(default=10, ge=1, le=30, description="Maximum number of unique URLs to actually process (scrape & index) during the shallow kick-off phase, after gathering initial search results.")

    # Performance Tuning Parameters
    PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY: int = Field(default=10, ge=1, le=50, description="Number of URLs to scrape concurrently within a hop. Set via ENV var for different environments.")
    LIVE_SEARCH_SCRAPY_SUBPROCESS_TIMEOUT: int = Field(default=25, ge=5, le=120, description="Timeout in seconds for the Scrapy subprocess when fetching a single URL.")
    LIVE_SEARCH_EMBEDDING_BATCH_SIZE: int = Field(default=64, ge=1, le=256, description="Number of text chunks to batch together for embedding calls.")
    LIVE_SEARCH_MAX_PDFS_TO_PROCESS_PER_HOP: int = Field(default=0, ge=0, description="Maximum number of PDFs to process in a single hop. 0 means no limit other than general URL limits.")
    LIVE_SEARCH_PDF_PROCESSING_MIN_RELEVANCE_SCORE: Optional[float] = Field(default=0.75, ge=0.0, le=1.0, description="Minimum relevance score (from search/link priority) for a PDF to be processed. None means no score-based skipping.")

    # LLM Defaults (can be overridden by model_info in request)
    DEFAULT_LLM_TEMPERATURE: float = 0.3
    DEFAULT_LLM_MAX_TOKENS: int = 3072 
    DEFAULT_MAX_SUMMARIZATION_INPUT_LENGTH: int = 12000 
    LLM_CALL_MAX_RETRIES: int = Field(default=2, description="Maximum number of retries for an LLM call if it fails or returns empty/invalid content (total attempts = 1 + retries).")

    # Prompt-based length control targets
    LIVE_SEARCH_SYNTHESIS_TARGET_WORD_COUNT: int = Field(default=1500, description="Target word count for initial synthesis methods like synthesize_with_vector_focus.")
    LIVE_SEARCH_REFINEMENT_TARGET_WORD_COUNT: int = Field(default=2000, description="Target word count for report refinement methods like refine_report_with_fact_check_results.")
    LIVE_SEARCH_SUMMARY_TARGET_SENTENCE_COUNT: str = Field(default="2-4 sentences", description="Target sentence count for general text summarization in summarize_text.")
    LIVE_SEARCH_HYDE_TARGET_WORD_COUNT: str = Field(default="150-200 words", description="Target word count for HyDE document generation (non-Gemini). Gemini uses a fixed 'max 160 words' in its specific prompt.")
    LIVE_SEARCH_PREFLIGHT_TARGET_WORD_COUNT: int = Field(default=300, description="Target word count for the pre-flight holistic LLM answer.")

    LOG_LEVEL: str = "INFO" # Changed to INFO for more verbose logging

    SEARCH_PROVIDERS_DEFAULT: List[str] = ["duckduckgo", "wikipedia", "courtlistener"]
    SEARCH_PROVIDERS_FALLBACK: List[str] = Field(default_factory=lambda: ["brave", "google_custom_search", "bing"]) 
    TASK_CLEANUP_DELAY_SECONDS: float = 2.0

    # DuckDuckGo Specific Rate Limit Handling
    DDG_EXCLUSION_SECONDS: int = 1800 
    DDG_MAX_BACKOFF_EXPONENT: int = 3 

    LIVE_SEARCH_DOMAIN_BLOCKLIST: List[str] = Field(
        default_factory=lambda: [
            "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com",
            "pinterest.com", "reddit.com", "tumblr.com", "snapchat.com",
            "t.me", 
        ]
    )

    LIVE_SEARCH_TRUST_WEIGHT_FACTOR: float = Field(default=0.3, description="Factor to weigh trust scores in relevance re-ranking. Ranges typically 0.1-0.5.")
    LIVE_SEARCH_SUMMARY_WORD_THRESHOLD: int = Field(default=2000, description="Word count threshold above which page content will be summarized.")

    LIVE_SEARCH_MIN_CHUNKS_FOR_CLUSTER_SUMMARY: int = Field(default=3, description="Minimum number of chunks from the same source to be considered a cluster for focused summarization.")
    LIVE_SEARCH_MAX_CHUNKS_IN_CLUSTER_INPUT: int = Field(default=10, description="Maximum number of chunks from a cluster to feed into the focused summarization LLM call.")

    LIVE_SEARCH_CROSS_DOC_SIMILARITY_THRESHOLD: float = Field(default=0.80, ge=0.0, le=1.0, description="Cosine similarity threshold for grouping chunks into cross-document clusters.")
    LIVE_SEARCH_CROSS_DOC_MIN_CLUSTER_SIZE: int = Field(default=2, ge=2, description="Minimum number of chunks (from different docs) to form a cross-document cluster.")
    LIVE_SEARCH_CROSS_DOC_MAX_CHUNKS_INPUT: int = Field(default=10, ge=1, description="Maximum number of chunks from a cross-document cluster to feed into its summarizer.")

    LIVE_SEARCH_ENABLE_COREFERENCE_RESOLUTION: bool = Field(default=True, description="Enable LLM-based coreference resolution before entity/relationship extraction.")

    INTERNAL_NODE_API_BASE_URL: str = Field(default="http://localhost:3000", description="Base URL for the internal Node.js API.")
    INTERNAL_NODE_API_ENDPOINT_PATH: str = Field(default="/api/internal/v1/local_completion", description="Endpoint path for local model completions via internal Node.js API.")

    LIVE_SEARCH_SMART_QUERY_EXPANSION_FILTER_ENABLED: bool = Field(default=True, description="Enable LLM-based filtering of generated queries for relevance and novelty.") 
    LIVE_SEARCH_QUERY_FILTER_TEMP: float = Field(default=0.1, ge=0.0, le=1.0, description="Temperature for the LLM call that filters queries.") 

    LIVE_SEARCH_ENABLE_SMART_EXPANSION_FILTER: bool = Field(default=True, description="Enable LLM-based relevance check on expansion chunk snippets before including them for librarian analysis.")
    LIVE_SEARCH_SMART_EXPANSION_FILTER_MODEL_NAME: Optional[str] = Field(default=None, description="Model name (e.g., 'gemini-1.5-flash-latest') to use for the smart expansion filter. If None, defaults to a fast model or main reasoning model.") 
    LIVE_SEARCH_SMART_EXPANSION_FILTER_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0, description="Relevance score threshold for the smart expansion filter. Snippets below this are discarded.")

    LIVE_SEARCH_ENABLE_DYNAMIC_TOP_K: bool = Field(default=False, description="Enable dynamic adjustment of top_k_retrieval_per_hop.")
    LIVE_SEARCH_TOP_K_INITIAL_HOPS_VALUE: Optional[int] = Field(default=None, ge=1, description="Specific top_k value to use for initial hops if dynamic top_k is enabled. If None, uses default/request top_k.")
    LIVE_SEARCH_INITIAL_HOPS_COUNT_FOR_DYNAMIC_TOP_K: int = Field(default=1, ge=1, description="Number of initial hops for which LIVE_SEARCH_TOP_K_INITIAL_HOPS_VALUE applies.")

    LIVE_SEARCH_QUALITY_FILTER_ENABLED: bool = Field(default=True, description="Enable filtering of search results by relevance before processing.")
    LIVE_SEARCH_QUALITY_FILTER_TOP_N_PER_HOP: int = Field(default=10, ge=1, description="Number of top relevant search results to process per hop after quality filtering.") 
    LIVE_SEARCH_QUALITY_FILTER_CANDIDATE_POOL_SIZE: int = Field(default=50, ge=1, description="Number of search results to fetch per query to create a candidate pool for quality filtering.") 
    
    LIVE_SEARCH_ADAPTIVE_DEPTH_MAX_IF_COVERED: int = Field(default=1, ge=0, description="Maximum depth to explore links if all reasoning steps are already covered. 0 means no further link exploration from current pages if covered.")

    LIVE_SEARCH_SMARTER_LINK_SELECTION_ENABLED: bool = Field(default=True, description="Enable semantic scoring of extracted links against uncovered reasoning steps.")
    LIVE_SEARCH_SMARTER_LINK_TOP_N_TO_FOLLOW: int = Field(default=3, ge=1, description="Number of top-scoring links to add to the exploration queue per hop.")
    
    LIVE_SEARCH_RERANK_CANDIDATE_POOL_SIZE: int = Field(default=75, ge=10, le=200, description="Max number of candidate chunks to pass to LLM re-ranking after initial heuristic filtering.")
    LIVE_SEARCH_RERANK_LLM_BATCH_SIZE: int = Field(default=10, ge=2, le=25, description="Number of chunks to send in a single batch to the LLM for re-ranking.")
    
    LIVE_SEARCH_ENABLE_FACT_CHECKING_REFINE_STEP: bool = Field(default=True, description="Enable the LLM-driven fact-checking and report refinement step after initial synthesis.")
    LIVE_SEARCH_MAX_FACT_CHECK_QUERIES: int = Field(default=5, ge=0, description="Maximum number of claims/queries to fact-check during the refinement step. 0 to disable if LIVE_SEARCH_ENABLE_FACT_CHECKING_REFINE_STEP is true but want to skip actual queries for a run.") 
    LIVE_SEARCH_SYNTHESIS_MAX_CHUNKS: int = Field(default=150, ge=10, description="Maximum number of chunks to use for the final synthesis step, after vector pre-filtering.")
    LIVE_SEARCH_ENABLE_HYDE: bool = Field(default=True, description="Enable Hypothetical Document Embeddings (HyDE) for vector search queries.")
    
    LIVE_SEARCH_ENABLE_DYNAMIC_TEMPERATURE: bool = Field(default=True, description="Enable dynamic adjustment of LLM temperature for certain calls.")
    LIVE_SEARCH_STAGNATION_TEMP_INCREASE_THRESHOLD: int = Field(default=2, ge=1, description="Number of consecutive hops with stagnation before trying to increase temperature.") 
    LIVE_SEARCH_INITIAL_DECOMPOSITION_TEMP: Optional[float] = Field(default=0.4, ge=0.0, le=1.0, description="Specific temperature for initial query decomposition. If None, uses reasoning_model_info or DEFAULT_LLM_TEMPERATURE.")
    LIVE_SEARCH_REASONING_DEFAULT_TEMP: float = Field(default=0.2, ge=0.0, le=1.0, description="Default/baseline temperature for most reasoning LLM calls (e.g., query generation, librarian).")
    LIVE_SEARCH_SYNTHESIS_DEFAULT_TEMP: float = Field(default=0.1, ge=0.0, le=1.0, description="Default temperature for synthesis and refinement LLM calls.")
    LIVE_SEARCH_DYNAMIC_TEMP_STUCK_INCREMENT: float = Field(default=0.15, ge=0.01, le=0.5, description="Increment value for temperature when agent is stuck.")
    LIVE_SEARCH_DYNAMIC_TEMP_STUCK_MAX: float = Field(default=0.7, ge=0.0, le=1.0, description="Maximum temperature to reach when agent is stuck.")
    LIVE_SEARCH_MIN_HOPS_BETWEEN_TEMP_INCREASE: int = Field(default=1, ge=0, description="Minimum number of hops to wait before another temperature increase, even if stagnation persists.") 
    LIVE_SEARCH_DYNAMIC_TEMP_INCREMENT: float = Field(default=0.1, ge=0.01, le=0.3, description="Amount to increment temperature by when stagnation occurs.") 
    LIVE_SEARCH_REASONING_MAX_TEMP: float = Field(default=0.7, ge=0.1, le=1.0, description="Absolute maximum temperature for reasoning calls.") 
    LIVE_SEARCH_DYNAMIC_TEMP_COOLDOWN_HOPS: int = Field(default=1, ge=0, description="Number of hops to wait before attempting another temperature increase if the last one didn't yield significant progress.")
    LIVE_SEARCH_DYNAMIC_TEMP_RESET_ON_PROGRESS: bool = Field(default=True, description="Reset temperature to LIVE_SEARCH_REASONING_DEFAULT_TEMP if significant progress is made after a temperature increase.")

    LIVE_SEARCH_ENABLE_DIVERSITY_CHECK_TEMP_ADJUST: bool = Field(default=True, description="Enable temperature adjustment based on low information diversity.")
    LIVE_SEARCH_DIVERSITY_MAX_SIMILARITY_THRESHOLD: float = Field(default=0.9, ge=0.0, le=1.0, description="Average similarity threshold for top chunks. If avg similarity is above this, diversity is considered low (triggers counter).") 
    LIVE_SEARCH_DIVERSITY_SIMILARITY_THRESHOLD: float = Field(default=0.85, ge=0.0, le=1.0, description="Average similarity threshold for top chunks. If avg similarity is above this, diversity is considered low.")
    LIVE_SEARCH_DIVERSITY_TOP_K_CHUNKS: int = Field(default=5, ge=2, description="Number of top chunks to analyze for diversity.")
    LIVE_SEARCH_DIVERSITY_LOW_STREAK_TRIGGER: int = Field(default=1, ge=1, description="Number of consecutive hops with low diversity to trigger a temperature increase attempt.")

    LIVE_SEARCH_ENABLE_PREFLIGHT_LLM_ANSWER: bool = Field(default=True, description="Enable the pre-flight holistic LLM answer generation.") 
    LIVE_SEARCH_PREFLIGHT_LLM_ANSWER_TEMP: float = Field(default=0.4, ge=0.0, le=1.0, description="Temperature for the pre-flight holistic LLM answer.")
    LIVE_SEARCH_PREFLIGHT_LLM_ANSWER_MAX_TOKENS: int = Field(default=1000, ge=50, description="Max tokens for the pre-flight holistic LLM answer.")

    # Comptroller / Strategic Pivot Related Settings
    LIVE_SEARCH_ENABLE_FOCUSED_SITE_EXPLORATION: bool = Field(default=True, description="Enable the Comptroller to recommend targeted re-investigation of promising sites.")
    LIVE_SEARCH_FOCUSED_SITE_MAX_PAGES_PER_TRIGGER: int = Field(default=3, ge=1, description="Maximum number of internal pages the Comptroller can suggest exploring from a single trigger page during focused site reinvestigation.")
    LIVE_SEARCH_MAX_CONSECUTIVE_LOW_DIVERSITY_HOPS_FOR_PIVOT: int = Field(default=3, ge=1, description="Number of consecutive hops with low diversity before signaling a strategic pivot.")
    LIVE_SEARCH_TOKEN_BUDGET_WARNING_THRESHOLD_PER_TASK: int = Field(default=50000, description="Token budget warning threshold for a task, used in pivot logic.") 
    LIVE_SEARCH_LOW_CONFIDENCE_THRESHOLD_PERCENTAGE: float = Field(default=0.4, ge=0.0, le=1.0, description="Proportion of unverified/low-confidence DPs to trigger low confidence synthesis mode.")
    LIVE_SEARCH_ENABLE_COMPTROLLER_FINAL_REVIEW: bool = Field(default=True, description="Enable the Comptroller's final review of the synthesized report.")
    LIVE_SEARCH_PLANNING_MAX_TOKENS: int = Field(default=4000, ge=500, description="Maximum tokens for the LLM call that generates the initial research plan (decomposition).") 
    LIVE_SEARCH_COMPTROLLER_INITIAL_CREDITS: int = Field(default=3, ge=0, description="Initial number of 'credits' or retries the Comptroller allows for research refinement cycles.") 
    LIVE_SEARCH_COMPTROLLER_RESYNTHESIS_RECENT_CHUNKS_COUNT: int = Field(default=10, ge=0, description="Number of most recent chunks to include in re-synthesis context after Comptroller feedback.")
    LIVE_SEARCH_COMPTROLLER_RESYNTHESIS_ORIGINAL_CHUNKS_COUNT: int = Field(default=3, ge=0, description="Number of earliest (original) chunks to include in re-synthesis context after Comptroller feedback.")
    LIVE_SEARCH_SSE_HEARTBEAT_INTERVAL_SECONDS: int = Field(default=2, ge=1, description="Interval in seconds for sending SSE heartbeats if no other data is sent.")

    @property
    def LIVE_SEARCH_SCRAPE_CONCURRENCY(self) -> int:
        return self.PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY

    class Config:
        env_file = dotenv_path 
        env_file_encoding = 'utf-8'
        extra = 'ignore' 

settings = Settings()
if os.getenv("PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY"):
    try:
        settings.PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY = int(os.getenv("PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY"))
    except ValueError:
        print(f"[Config] Warning: Invalid value for PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY env var. Using default: {settings.PYTHON_LIVE_SEARCH_SCRAPE_CONCURRENCY}", file=sys.stderr)

print(f"[Config] Effective LIVE_SEARCH_SCRAPE_CONCURRENCY: {settings.LIVE_SEARCH_SCRAPE_CONCURRENCY}", file=sys.stderr)
