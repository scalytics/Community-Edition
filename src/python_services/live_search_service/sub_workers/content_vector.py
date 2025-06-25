"""
Content Vector Module (formerly Knowledge Librarian Worker)
Handles text chunking, embedding generation, and vector database operations.
"""
import json
import asyncio
import os
import traceback
from typing import Dict, List, Optional, Any

from sentence_transformers import SentenceTransformer
import lancedb
from langchain.text_splitter import RecursiveCharacterTextSplitter

from .. import config as app_config
from .. import models # Import new Pydantic models
from ..utils import setup_logger, FileLock
from pydantic import BaseModel as PydanticBaseModel 
from typing import List as PyList
import pyarrow as pa 
from lancedb.pydantic import pydantic_to_schema # Correct import

logger = setup_logger(__name__, level=app_config.settings.LOG_LEVEL)

# Define Pydantic schema for LanceDB table
class LanceDbRowSchema(PydanticBaseModel):
    vector: PyList[float]
    chatId: str
    source: str  
    chunkIndex: int
    textContent: str
    is_from_uploaded_doc: Optional[bool] = None 
    original_document_id: Optional[str] = None 

class ContentVector:
    def __init__(self, settings: app_config.Settings, model_id_or_path_override: Optional[str] = None):
        self.settings = settings
        self.model_id_or_path = model_id_or_path_override if model_id_or_path_override is not None else self.settings.DEFAULT_EMBEDDING_MODEL_ID_OR_PATH
        
        self.vector_db_uri = self.settings.LANCEDB_BASE_URI
        self.table_name = self.settings.LANCEDB_DEFAULT_TABLE_NAME
        
        self.model: Optional[SentenceTransformer] = None
        self.embedding_dim: Optional[int] = None
        self.db_connection: Optional[lancedb.DBConnection] = None
        self.db_table: Optional[lancedb.table.Table] = None 
        
        self.status = "uninitialized"
        if not self.model_id_or_path:
            self.status = "error_no_model_configured"
            logger.error("ContentVector: No embedding model configured (model_id_or_path is None). Vector operations will fail.")

        self.processing_lock = asyncio.Lock() 
        self._init_lock = asyncio.Lock() 

    async def initialize_resources(self) -> bool:
        if self.status == "ready":
            return True
        if self.status == "error_no_model_configured":
            logger.error("ContentVector: Cannot initialize resources, no embedding model configured.")
            return False
        
        async with self._init_lock:
            if self.status == "ready":
                return True
            if self.status == "initializing": 
                await asyncio.sleep(0.1) 
                return self.status == "ready"

            self.status = "initializing"
            try:
                if not self.model_id_or_path:
                    raise ValueError("Cannot initialize: model_id_or_path is None.")
                
                # Force offline mode for Hugging Face Hub to prevent downloads
                os.environ['HF_HUB_OFFLINE'] = '1'
                
                self.model = SentenceTransformer(self.model_id_or_path, device='cpu')
                
                # Unset the environment variable after use
                del os.environ['HF_HUB_OFFLINE']

                self.embedding_dim = self.model.get_sentence_embedding_dimension()
                if not self.embedding_dim:
                    raise ValueError("Could not determine embedding dimension from the model.")

                os.makedirs(self.vector_db_uri, exist_ok=True)
                self.db_connection = lancedb.connect(self.vector_db_uri)
                
                try:
                    # Try to open the table first
                    self.db_table = self.db_connection.open_table(self.table_name)
                    logger.info(f"Successfully opened existing table '{self.table_name}'.")
                    # Ensure FTS index on existing table
                    lock_file = os.path.join(self.vector_db_uri, ".fts_index.lock")
                    try:
                        with FileLock(lock_file):
                            logger.info(f"Process {os.getpid()} acquired lock for FTS indexing.")
                            logger.info(f"Attempting to create/update FTS index on 'textContent' for existing table '{self.table_name}'...")
                            self.db_table.create_fts_index("textContent", replace=True)
                            logger.info(f"FTS index on 'textContent' for table '{self.table_name}' ensured (replace=True).")
                    except (IOError, BlockingIOError):
                        logger.warning(f"Process {os.getpid()} could not acquire lock, FTS indexing is likely being handled by another process.")
                    except Exception as e_fts_existing:
                        logger.error(f"Failed to ensure FTS index on 'textContent' for existing table '{self.table_name}': {e_fts_existing}", exc_info=True)
                
                except ValueError as e_open_table: # LanceDB raises ValueError if table not found
                    if "was not found" in str(e_open_table).lower():
                        logger.info(f"Table '{self.table_name}' does not exist. Creating with explicit PyArrow schema.")
                        # Manually define the PyArrow schema
                    arrow_schema = pa.schema([
                        pa.field("vector", pa.list_(pa.float32(), list_size=self.embedding_dim)), # Explicit vector type
                        pa.field("chatId", pa.string()),
                        pa.field("source", pa.string()), # JSON string
                        pa.field("chunkIndex", pa.int32()),
                        pa.field("textContent", pa.string()),
                        pa.field("is_from_uploaded_doc", pa.bool_()), # Explicitly boolean
                        pa.field("original_document_id", pa.string()) # Explicitly string
                    ])
                    
                    self.db_table = self.db_connection.create_table(
                        self.table_name, 
                        schema=arrow_schema 
                    )
                    # Add dummy data to ensure FTS index creation works, then delete it.
                    # The dummy data must conform to the schema.
                    dummy_data_conforming = [
                        LanceDbRowSchema(
                            vector=[0.0] * self.embedding_dim, 
                            chatId='dummy_init_schema', 
                            source='{}', 
                            chunkIndex=0, 
                            textContent='initialization text for schema',
                            is_from_uploaded_doc=False,           # Explicit non-None
                            original_document_id="dummy_doc_id" # Explicit non-None string
                        ).model_dump() 
                    ]
                    self.db_table.add(dummy_data_conforming)
                    
                    lock_file = os.path.join(self.vector_db_uri, ".fts_index.lock")
                    try:
                        with FileLock(lock_file):
                            logger.info(f"Process {os.getpid()} acquired lock for FTS indexing on new table.")
                            logger.info(f"Attempting to create FTS index on 'textContent' for new table '{self.table_name}' with schema...")
                            self.db_table.create_fts_index("textContent", replace=True)
                            logger.info(f"FTS index on 'textContent' for table '{self.table_name}' with schema created successfully.")
                    except (IOError, BlockingIOError):
                        logger.warning(f"Process {os.getpid()} could not acquire lock for new table, FTS indexing is likely being handled by another process.")
                    except Exception as e_fts:
                        logger.error(f"Failed to create FTS index on 'textContent' for new table '{self.table_name}' with schema: {e_fts}", exc_info=True)
                    
                    self.db_table.delete("\"chatId\" = 'dummy_init_schema'")
                
                self.status = "ready"
                return True
            except Exception as e:
                self.status = "error"
                logger.error(f"Error initializing ContentVector resources: {e}", exc_info=True)
                return False

    async def _ensure_ready(self):
        if self.status != "ready":
            logger.warning("ContentVector resources not ready. Attempting to initialize.")
            if not await self.initialize_resources():
                raise RuntimeError(f"ContentVector failed to initialize resources and is not ready. Current status: {self.status}")

    async def chunk_text(self, text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
        if not text:
            return []
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, 
            chunk_overlap=chunk_overlap, 
            length_function=len, 
            is_separator_regex=False
        )
        return text_splitter.split_text(text)

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        await self._ensure_ready()
        if not self.model: 
            raise RuntimeError("Embedding model is not loaded.")
        if not texts:
            return []
        
        async with self.processing_lock: 
            loop = asyncio.get_event_loop()
            embeddings_np = await loop.run_in_executor(None, lambda: self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False))
            return [e.tolist() for e in embeddings_np]

    async def add_documents(self, group_id: str, documents: List[models.GenericDocumentItem]) -> Dict[str, Any]: 
        await self._ensure_ready()
        if not self.db_table: 
            raise RuntimeError("LanceDB table is not available.")
        if not documents:
            return {"success": True, "message": "No documents to add."}
        
        docs_to_add_to_lancedb = []
        for doc_item in documents:
            if not doc_item.text_content:
                logger.warning(f"Document ID {doc_item.id} in group {group_id} missing text_content, skipping.")
                continue
            
            chunks = await self.chunk_text(doc_item.text_content) 
            if not chunks:
                logger.warning(f"Document ID {doc_item.id} in group {group_id} resulted in no chunks, skipping.")
                continue
            
            embeddings = await self.generate_embeddings(chunks)
            
            metadata_to_store = doc_item.metadata.copy()
            metadata_to_store['_doc_id'] = doc_item.id 
            source_json_str = json.dumps(metadata_to_store)

            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                if not isinstance(emb, list) or not self.embedding_dim or len(emb) != self.embedding_dim:
                    logger.error(
                        f"Document ID {doc_item.id}, chunk {i} for group {group_id} has an invalid embedding. "
                        f"Expected dim: {self.embedding_dim}, got: {type(emb)} with len {len(emb) if isinstance(emb, list) else 'N/A'}. "
                        f"Skipping this chunk."
                    )
                    continue

                vector_doc = {
                    "vector": emb,
                    "chatId": group_id,
                    "source": source_json_str,
                    "chunkIndex": i,
                    "textContent": chunk,
                    "is_from_uploaded_doc": metadata_to_store.get("is_from_uploaded_doc", False),
                    "original_document_id": str(metadata_to_store.get("original_document_id")) if metadata_to_store.get("original_document_id") is not None else None,
                }
                for field_name in LanceDbRowSchema.model_fields.keys():
                    if field_name not in vector_doc:
                        vector_doc[field_name] = None
                
                docs_to_add_to_lancedb.append(vector_doc)
        
        if docs_to_add_to_lancedb:
            async with self.processing_lock: 
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, lambda: self.db_table.add(docs_to_add_to_lancedb))
        return {"success": True, "message": f"{len(documents)} processed, {len(docs_to_add_to_lancedb)} chunks added."}

    async def search_vectors(
        self, 
        query_vector: Optional[List[float]] = None, 
        limit: int = 5, 
        group_id: Optional[str] = None, 
        fts_query: Optional[str] = None,
        metadata_filter: Optional[Dict[str, Any]] = None
    ) -> List[models.VectorSearchResultItem]:
        await self._ensure_ready()
        if not self.db_table:
            raise RuntimeError("LanceDB table is not available.")

        if not query_vector and not (fts_query and fts_query.strip()) and not metadata_filter:
            logger.error("Search_vectors called without a query_vector, fts_query, or metadata_filter.")
            return []

        effective_fts_query_string: Optional[str] = None
        if fts_query and fts_query.strip():
            effective_fts_query_string = str(fts_query.strip())
            logger.debug(f"LanceDB FTS component of query: {effective_fts_query_string}")
        else:
            effective_fts_query_string = None

        search_args = {}
        if query_vector:
            search_args['vector'] = query_vector
        
        if effective_fts_query_string:
            search_args['query'] = effective_fts_query_string
            
        if query_vector:
            search_query_builder = self.db_table.search(
                query_vector, 
                vector_column_name="vector",
                **{k:v for k,v in search_args.items() if k != 'vector'}
            )
        elif effective_fts_query_string:
             search_query_builder = self.db_table.search(query=effective_fts_query_string)
        else:
            search_query_builder = self.db_table.search()


        if query_vector and effective_fts_query_string:
            logger.debug(f"LanceDB Hybrid Search: Vector + FTS ('{effective_fts_query_string}')")
        elif query_vector:
            logger.debug("LanceDB Vector-Only Search")
        elif effective_fts_query_string:
            logger.debug(f"LanceDB FTS-Only Search: '{effective_fts_query_string}'")

        where_conditions = []
        if group_id:
            where_conditions.append(f"\"chatId\" = '{group_id}'")
        
        if metadata_filter:
            for key, value in metadata_filter.items():
                if isinstance(value, str):
                    escaped_value = value.replace("'", "''")
                    where_conditions.append(f"\"{key}\" = '{escaped_value}'")
                elif isinstance(value, bool):
                    where_conditions.append(f"\"{key}\" = {str(value).lower()}")
                elif isinstance(value, (int, float)):
                    where_conditions.append(f"\"{key}\" = {value}")
                else:
                    logger.warning(f"Unsupported value type for metadata filter key '{key}': {type(value)}. Skipping this filter condition.")
        
        if where_conditions:
            final_where_clause = " AND ".join(where_conditions)
            logger.debug(f"LanceDB search with WHERE clause: {final_where_clause}")
            search_query_builder = search_query_builder.where(final_where_clause)
        
        search_query_builder = search_query_builder.limit(limit)

        async with self.processing_lock: 
            loop = asyncio.get_event_loop()
            results_lancedb = await loop.run_in_executor(
                None, 
                lambda: search_query_builder.to_list() 
            )
        
        mapped_results: List[models.VectorSearchResultItem] = []
        for r in results_lancedb:
            source_content = r.get('source', '{}') 
            if not isinstance(source_content, str): 
                source_content = json.dumps(source_content)
            try:
                parsed_metadata = json.loads(source_content) if source_content.startswith('{') or source_content.startswith('[') else {"original_source_str": source_content}
            except json.JSONDecodeError:
                parsed_metadata = {"error": "Failed to decode source JSON", "original_source_str": source_content}
            
            doc_id = parsed_metadata.pop('_doc_id', None) 

            distance = r.get('_distance', -1.0)
            similarity = 1.0 - distance if distance != -1.0 else None 

            mapped_results.append(models.VectorSearchResultItem(
                id=doc_id,
                text_content=r.get('textContent',''), 
                metadata=parsed_metadata, 
                distance=distance,
                similarity=similarity
            ))
        return mapped_results

    async def search_content_by_keywords(
        self, 
        keywords: List[str], 
        group_id: Optional[str] = None, 
        limit: int = 5
    ) -> List[models.ContentChunk]:
        if not keywords:
            return []
        
        processed_keywords = []
        for kw in keywords:
            kw_stripped = kw.strip()
            if not kw_stripped:
                continue
            
            escaped_kw = kw_stripped.replace("\"", "\\\"")

            if " " in kw_stripped or ":" in kw_stripped or "," in kw_stripped or kw_stripped.isnumeric():
                processed_keywords.append(f'"{escaped_kw}"')
            else:
                processed_keywords.append(escaped_kw)
        
        if not processed_keywords:
            logger.warning("No valid keywords left after processing for FTS.")
            return []

        fts_query_str = " OR ".join(processed_keywords)
        logger.info(f"Constructed FTS query: {fts_query_str}")
        
        vector_search_results: List[models.VectorSearchResultItem] = await self.search_vectors(
            query_vector=None,
            limit=limit,
            group_id=group_id,
            fts_query=fts_query_str,
            metadata_filter=None
        )
        
        content_chunks_from_fts: List[models.ContentChunk] = []
        for vs_item in vector_search_results:
            metadata = vs_item.metadata or {}
            chunk_obj = models.ContentChunk(
                chunk_id=vs_item.id or str(uuid.uuid4()),
                original_url=metadata.get("original_url", "unknown_fts_source"),
                page_title=metadata.get("page_title"),
                text_content=vs_item.text_content,
                chunk_index_in_page=metadata.get("chunk_index_in_page", 0),
                depth=metadata.get("depth", 0),
                query_phrase_that_led_to_page=metadata.get("source_search_query"),
                vector_metadata=metadata
            )
            content_chunks_from_fts.append(chunk_obj)
            
        logger.info(f"FTS search for keywords '{fts_query_str[:50]}...' yielded {len(content_chunks_from_fts)} chunks.")
        return content_chunks_from_fts

    async def delete_vectors_by_group_id(self, group_id: str) -> Dict[str, Any]:
        await self._ensure_ready()
        if not self.db_table:
            raise RuntimeError("LanceDB table is not available.")
        async with self.processing_lock:
            loop = asyncio.get_event_loop()
            try:
                await loop.run_in_executor(None, lambda: self.db_table.delete(f"\"chatId\" = '{str(group_id)}'")) 
                return {"success": True, "message": f"Vectors for group ID {group_id} deleted."}
            except Exception as e:
                logger.error(f"Error deleting vectors for group ID {group_id}: {e}", exc_info=True)
                return {"success": False, "message": f"Error deleting vectors: {str(e)}"}
