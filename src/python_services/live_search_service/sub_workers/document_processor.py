import asyncio
import re
from typing import Dict, List, Optional, Any

from .llm_reasoning import LLMReasoning
from .. import models
from .. import config as app_config
from ..utils import setup_logger

logger = setup_logger(__name__, level=app_config.settings.LOG_LEVEL)

def _chunk_text_content(
    text: str, 
    chunk_size_words: int = 300, # Default chunk size for document processing
    max_chunk_size_words: int = 450 # Max words for a chunk
    ) -> List[str]:
    if not text or not text.strip():
        return []

    # Simplified sentence splitting, can be enhanced
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    sentences = [s.strip() for s in sentences if s and s.strip()]

    if not sentences:
        # Fallback if sentence splitting yields nothing (e.g., text without standard punctuation)
        # or if text is very short
        if len(text.split()) <= max_chunk_size_words:
            return [text.strip()]
        else: # Word-based chunking for very long unpunctuated text
            words = text.split()
            return [" ".join(words[i : i + chunk_size_words]) for i in range(0, len(words), chunk_size_words)]

    chunks: List[str] = []
    current_chunk_sentences: List[str] = []
    current_chunk_word_count: int = 0
    
    for sentence in sentences:
        sentence_word_count = len(sentence.split())
        if sentence_word_count == 0:
            continue

        # If a single sentence is too long, it becomes its own chunk (or could be further split)
        if not current_chunk_sentences and sentence_word_count > max_chunk_size_words:
            chunks.append(sentence)
            continue # Reset for next sentence

        # If adding this sentence exceeds max size, finalize current chunk
        if current_chunk_sentences and (current_chunk_word_count + sentence_word_count > max_chunk_size_words):
            chunks.append(" ".join(current_chunk_sentences))
            current_chunk_sentences = []
            current_chunk_word_count = 0
        
        # Add sentence to current chunk
        current_chunk_sentences.append(sentence)
        current_chunk_word_count += sentence_word_count

        # If current chunk is reasonably full, finalize it
        if current_chunk_word_count >= chunk_size_words:
            chunks.append(" ".join(current_chunk_sentences))
            current_chunk_sentences = []
            current_chunk_word_count = 0

    # Add any remaining sentences as the last chunk
    if current_chunk_sentences:
        chunks.append(" ".join(current_chunk_sentences))
    
    return [chunk for chunk in chunks if chunk and chunk.strip()]


def _format_table_to_markdown(table_data: List[List[Optional[str]]]) -> str:
    """Converts a list of lists (table) into a Markdown string."""
    if not table_data:
        return ""
    
    markdown_table = []
    # Header
    header = table_data[0]
    markdown_table.append("| " + " | ".join(str(cell) if cell is not None else "" for cell in header) + " |")
    markdown_table.append("| " + " | ".join(["---"] * len(header)) + " |")
    # Rows
    for row in table_data[1:]:
        markdown_table.append("| " + " | ".join(str(cell) if cell is not None else "" for cell in row) + " |")
    
    return "\n".join(markdown_table)

async def analyze_document_content(
    text_content: str,
    original_document_name: str,
    document_id: str, 
    task_id_for_logging: str,
    reasoning_model_info: Dict[str, Any],
    api_config: Dict[str, Any],
    settings: app_config.Settings,
    raw_tables: Optional[List[List[List[Optional[str]]]]] = None # New parameter
) -> List[Dict[str, Any]]:
    """
    Performs LLM-based analysis on document text (chunked) and extracted tables.
    Returns a list of dictionaries, each containing metadata for a processed item (text chunk or table).
    """
    all_processed_items_metadata: List[Dict[str, Any]] = []
    
    # Initialize LLM Reasoner
    llm_reasoner = LLMReasoning(settings=settings)

    # Process Text Content (Chunked)
    if text_content and text_content.strip():
        chunk_size = settings.DEFAULT_CHUNK_SIZE_WORDS if hasattr(settings, 'DEFAULT_CHUNK_SIZE_WORDS') else 300
        max_chunk_size = int(chunk_size * 1.5)
        text_chunks = _chunk_text_content(text_content, chunk_size_words=chunk_size, max_chunk_size_words=max_chunk_size)
        
        if not text_chunks:
            logger.warning(f"Document {original_document_name} (ID: {document_id}) produced no text chunks after chunking, though text_content was present.")
        
        for idx, chunk_text in enumerate(text_chunks):
            chunk_metadata: Dict[str, Any] = {
                "original_text_chunk": chunk_text, # Store original chunk text
                "chunk_index": idx,
                "content_type": "text_chunk" # Identify type
            }
            analysis_request_id_base = f"ingest_{task_id_for_logging}_{document_id}_textchunk{idx}"
            log_prefix = f"[DocumentProcessor:{analysis_request_id_base}]"

            try:
                logger.debug(f"{log_prefix} Starting summarization for chunk {idx} of {original_document_name}")
                summary_result = await llm_reasoner.summarize_text(
                    text_to_summarize=chunk_text,
                    model_info=reasoning_model_info,
                    api_config=api_config,
                    request_id=f"{analysis_request_id_base}_sum",
                    document_name=original_document_name, # Pass context
                    doc_id=document_id
                )
                if not summary_result.get("error") and summary_result.get("summary"):
                    chunk_metadata["extracted_summary"] = summary_result.get("summary")
                else:
                    if summary_result.get("error"):
                        logger.error(f"{log_prefix} Summarization failed: {summary_result.get('error')}")
                        chunk_metadata["llm_analysis_error_summary"] = str(summary_result.get("error"))
                    else:
                        logger.warning(f"{log_prefix} Summarization returned no summary text.")
                        chunk_metadata["llm_analysis_warn_summary"] = "LLM returned no summary."
                    # Fallback shallow summary for text chunk
                    fallback_summary_words = chunk_text.split()[:50] # First 50 words
                    chunk_metadata["extracted_summary"] = " ".join(fallback_summary_words) + "..." if len(fallback_summary_words) >= 50 else " ".join(fallback_summary_words)
                    chunk_metadata["summary_type"] = "fallback_shallow"
                    logger.info(f"{log_prefix} Using fallback shallow summary for text chunk {idx}.")

                text_for_entities = chunk_metadata.get("extracted_summary", chunk_text) # Use LLM summary if available, else original chunk for entities
                logger.debug(f"{log_prefix} Starting entity extraction for chunk {idx}")
                entity_result = await llm_reasoner.extract_entities_from_text(
                    text_content=text_for_entities,
                    model_info=reasoning_model_info,
                    api_config=api_config,
                    request_id=f"{analysis_request_id_base}_ent",
                    document_name=original_document_name, 
                    doc_id=document_id
                )
                extracted_entities_for_relationships: Optional[List[Dict[str, Any]]] = None
                if not entity_result.get("error") and isinstance(entity_result.get("entities"), list):
                    chunk_metadata["extracted_entities"] = entity_result.get("entities")
                    extracted_entities_for_relationships = entity_result.get("entities")
                elif entity_result.get("error"):
                    logger.error(f"{log_prefix} Entity extraction failed: {entity_result.get('error')}")
                    chunk_metadata["llm_analysis_error_entities"] = str(entity_result.get("error"))

                text_for_relationships = chunk_metadata.get("extracted_summary", chunk_text)
                logger.debug(f"{log_prefix} Starting relationship extraction for chunk {idx}")
                relationship_result = await llm_reasoner.extract_relationships_from_text(
                    text_content=text_for_relationships,
                    model_info=reasoning_model_info,
                    api_config=api_config,
                    existing_typed_entities=extracted_entities_for_relationships,
                    request_id=f"{analysis_request_id_base}_rel",
                    document_name=original_document_name,
                    doc_id=document_id
                )
                if not relationship_result.get("error") and isinstance(relationship_result.get("relationships"), list):
                    chunk_metadata["extracted_relationships"] = relationship_result.get("relationships")
                elif relationship_result.get("error"):
                    logger.error(f"{log_prefix} Relationship extraction failed: {relationship_result.get('error')}")
                    chunk_metadata["llm_analysis_error_relationships"] = str(relationship_result.get("error"))
                
                all_processed_items_metadata.append(chunk_metadata)

            except Exception as e:
                logger.error(f"{log_prefix} Unexpected error during LLM analysis for chunk {idx}: {e}", exc_info=True)
                chunk_metadata["llm_analysis_error"] = f"Unexpected error in document_processor text chunk analysis: {str(e)}"
                all_processed_items_metadata.append(chunk_metadata) # Still append chunk with error
    elif not text_content or not text_content.strip():
         logger.warning(f"Document {original_document_name} (ID: {document_id}) has no text content to analyze for text chunks.")


    # Process Extracted Tables
    if raw_tables:
        logger.info(f"Processing {len(raw_tables)} raw tables found in {original_document_name}")
        for table_idx, table_data in enumerate(raw_tables):
            table_markdown = _format_table_to_markdown(table_data)
            if not table_markdown.strip():
                logger.warning(f"Skipping empty or unformattable table {table_idx} from {original_document_name}")
                continue

            table_metadata: Dict[str, Any] = {
                "original_table_markdown": table_markdown,
                "table_index": table_idx, # Relative to tables in this document
                "content_type": "table_analysis" # Identify type
            }
            analysis_request_id_base_table = f"ingest_{task_id_for_logging}_{document_id}_table{table_idx}"
            log_prefix_table = f"[DocumentProcessor:{analysis_request_id_base_table}]"

            try:
                logger.debug(f"{log_prefix_table} Starting analysis for table {table_idx} of {original_document_name}")
                
                # Call the new method for table analysis
                table_analysis_response = await llm_reasoner.analyze_table_data(
                    table_markdown=table_markdown,
                    model_info=reasoning_model_info,
                    api_config=api_config,
                    request_id=f"{analysis_request_id_base_table}_analysis",
                    document_name=original_document_name,
                    doc_id=document_id,
                    table_index=table_idx
                )
                
                if not table_analysis_response.get("error") and table_analysis_response.get("analysis"):
                    analysis_content = table_analysis_response["analysis"]
                    table_metadata["table_summary"] = analysis_content.get("table_summary")
                    table_metadata["key_insights_from_table"] = analysis_content.get("key_insights")
                    table_metadata["potential_entities_in_table"] = analysis_content.get("potential_entities")
                    if not analysis_content.get("table_summary"): # If LLM returned empty summary for table
                        table_metadata["table_summary"] = f"Table {table_idx+1} data (unable to generate LLM summary)."
                        table_metadata["summary_type"] = "fallback_placeholder"
                    logger.info(f"{log_prefix_table} Table analysis successful.")
                else:
                    if table_analysis_response.get("error"):
                        logger.error(f"{log_prefix_table} Table analysis LLM call failed: {table_analysis_response.get('error')}")
                        table_metadata["llm_analysis_error_table"] = str(table_analysis_response.get("error"))
                    else: # No error but also no analysis content
                        logger.warning(f"{log_prefix_table} Table analysis did not return expected 'analysis' data.")
                        table_metadata["llm_analysis_warn_table"] = "No analysis data returned from LLM."
                    # Fallback for table summary
                    table_metadata["table_summary"] = f"Table {table_idx+1} data (LLM analysis failed or incomplete)."
                    table_metadata["summary_type"] = "fallback_error"
                    logger.info(f"{log_prefix_table} Using fallback summary for table {table_idx}.")

                all_processed_items_metadata.append(table_metadata)

            except Exception as e:
                logger.error(f"{log_prefix_table} Unexpected error during LLM analysis for table {table_idx}: {e}", exc_info=True)
                table_metadata["llm_analysis_error"] = f"Unexpected error in document_processor table analysis: {str(e)}"
                all_processed_items_metadata.append(table_metadata) # Still append table with error
    
    if not text_content and not raw_tables:
        logger.warning(f"Document {original_document_name} (ID: {document_id}) has no text content or tables to process.")

    return all_processed_items_metadata
