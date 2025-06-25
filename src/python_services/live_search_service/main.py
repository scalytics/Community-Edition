import sys
sys.setrecursionlimit(2000) 
print(f"[main.py] System recursion limit set to: {sys.getrecursionlimit()}")

import multiprocessing
import os

os.environ['TOKENIZERS_PARALLELISM'] = 'false' 

try:
    current_method = multiprocessing.get_start_method(allow_none=True)
    if current_method != 'spawn':
        multiprocessing.set_start_method('spawn', force=True)
        print(f"[main.py] Multiprocessing start method forced to 'spawn' (was {current_method}).")
    else:
        print("[main.py] Multiprocessing start method already 'spawn'.")
except RuntimeError as e_mp_set:
    print(f"[main.py] Warning: Could not force multiprocessing start method to 'spawn': {e_mp_set}. Context might already be set and frozen.")
except Exception as e_mp_unknown:
    print(f"[main.py] Unknown error setting multiprocessing start method: {e_mp_unknown}")

import warnings
warnings.filterwarnings("ignore", message="lance is not fork-safe.*", category=UserWarning, module="lancedb")

import logging
import asyncio
import uuid
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from typing import Dict, Optional, List, Any
from contextlib import asynccontextmanager
import json # Ensure json is imported

from . import models
from . import config
from .sub_workers.content_vector import ContentVector
from .sub_workers.llm_reasoning import LLMReasoning
from .sub_workers.search_scrape import SearchScrape
from .sub_workers.document_processor import analyze_document_content 
from .utils import setup_logger
from .utils.rate_limit_manager import RateLimitManager
from .research_graph import create_research_graph

try:
    import PyPDF2
except ImportError:
    PyPDF2 = None
try:
    import pdfplumber 
except ImportError:
    pdfplumber = None
    print("[main.py] Warning: pdfplumber not installed. Advanced PDF text and table extraction will not be available.")
try:
    import docx
except ImportError:
    docx = None
    print("[main.py] Warning: python-docx not installed. DOCX text extraction will not be available for uploaded files.")
try:
    import pandas as pd
except ImportError:
    pd = None
    print("[main.py] Warning: pandas not installed. Excel text extraction will not be available for uploaded files.")

class HealthCheckFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Exclude logs for the /health endpoint
        return record.getMessage().find("/health") == -1

# Get the Uvicorn access logger and add the filter
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.addFilter(HealthCheckFilter())

logger = setup_logger(__name__, level=config.settings.LOG_LEVEL)

content_vector_service_instance: Optional[ContentVector] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global content_vector_service_instance
    logger.info("FastAPI application startup: Initializing ContentVector service...")
    if not config.settings.DEFAULT_EMBEDDING_MODEL_ID_OR_PATH:
        logger.error("No default embedding model configured. Vector operations will be unavailable.")
    content_vector_service_instance = ContentVector(settings=config.settings)
    initialized = await content_vector_service_instance.initialize_resources()
    if initialized:
        logger.info("ContentVector service initialized successfully during startup.")
    else:
        logger.error("Failed to initialize ContentVector service during startup. Vector operations may fail or be unavailable.")
    yield
    logger.info("FastAPI application shutdown.")

app = FastAPI(
    title="Live Search Orchestrator Service",
    description="Manages deep research tasks and generic vector operations.",
    version="0.1.0",
    lifespan=lifespan,
    debug=True  # FastAPI debug mode enabled
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    error_details = exc.errors()
    logger.error(f"FastAPI Request Validation Error: {error_details}")
    raw_body_for_log = "Could not retrieve body for logging in exception handler."
    try:
        # Attempt to read body if not already read by our endpoint's initial logging
        # This is tricky because the body stream can only be read once.
        # If our endpoint's logging already read it and stored it on `request._body`, use that.
        if hasattr(request, '_body_for_error_handler'):
             raw_body_for_log = request._body_for_error_handler.decode('utf-8', errors='replace') # type: ignore
        else:
            # If not, try to read it now. This might fail if already consumed by FastAPI's internal processing.
            try:
                raw_body_bytes = await request.body() # This might be an empty byte string if already consumed
                if raw_body_bytes:
                    raw_body_for_log = raw_body_bytes.decode('utf-8', errors='replace')
                else:
                    raw_body_for_log = "[Request body already consumed or empty when exception handler was called]"
            except Exception as e_read_body_in_handler:
                raw_body_for_log = f"[Error reading body in exception handler: {e_read_body_in_handler}]"
        logger.error(f"Raw request body that potentially caused validation error: {raw_body_for_log}")
    except Exception as e_body_log_outer:
        logger.error(f"Outer error logging raw body during validation_exception_handler: {e_body_log_outer}")
    
    return JSONResponse(
        status_code=422,
        content={"detail": error_details}, # Standard FastAPI error response structure
    )

@app.get("/health", status_code=200)
async def health_check():
    # This endpoint is for the proxy's health checks.
    return {"status": "ok"}

active_tasks: Dict[str, asyncio.Task] = {}
task_output_queues: Dict[str, asyncio.Queue] = {}

async def get_content_vector_service() -> ContentVector:
    global content_vector_service_instance
    if content_vector_service_instance is None or content_vector_service_instance.status != "ready":
        logger.warning("ContentVector service not ready or None, attempting re-initialization in get_content_vector_service.")
        content_vector_service_instance = ContentVector(settings=config.settings)
        initialized = await content_vector_service_instance.initialize_resources()
        if not initialized or content_vector_service_instance.status != "ready":
            raise HTTPException(status_code=503, detail="Vector service failed to initialize/become ready.")
    return content_vector_service_instance

def get_task_urls(task_id: str, request: Request) -> Dict[str, str]:
    base_url = str(request.base_url)
    return {
        "stream_url": f"{base_url}research_tasks/{task_id}/stream",
        "cancel_url": f"{base_url}research_tasks/{task_id}/cancel",
        "status_url": f"{base_url}research_tasks/{task_id}/status" 
    }

def _extract_text_and_tables_from_pdf_with_pdfplumber(file_path: str) -> tuple[str, List[List[List[Optional[str]]]]]:
    if not pdfplumber: return "", []
    full_text, extracted_tables_data = [], []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text: full_text.append(page_text)
                tables_on_page = page.extract_tables()
                if tables_on_page: extracted_tables_data.extend(tables_on_page)
    except Exception as e: logger.error(f"Error pdfplumber PDF {file_path}: {e}", exc_info=True)
    return "\n".join(full_text), extracted_tables_data

def _extract_text_from_docx(file_path: str) -> str:
    if not docx: return ""
    text = ""
    try:
        doc = docx.Document(file_path)
        for para in doc.paragraphs: text += para.text + "\n"
    except Exception as e: logger.error(f"Error DOCX {file_path}: {e}")
    return text

def _extract_text_from_excel(file_path: str) -> str:
    if not pd: return ""
    text = ""
    try:
        excel_file = pd.ExcelFile(file_path)
        for sheet_name in excel_file.sheet_names:
            df = excel_file.parse(sheet_name)
            text += f"Sheet: {sheet_name}\n{df.to_string(index=False, header=True)}\n\n"
    except Exception as e: logger.error(f"Error Excel {file_path}: {e}")
    return text.strip()

@app.post("/research_tasks", response_model=models.TaskCreationResponse, status_code=202)
async def create_research_task(request_params: models.DeepSearchRequest, http_request: Request): # Restored Pydantic model
    raw_body_bytes_for_parsing = b'' # This variable will not be used if Pydantic validation passes
    try:
        # This logging will now only be hit if Pydantic validation by FastAPI passes.
        # The custom RequestValidationError handler will catch errors before this if validation fails.
        logger.info(f"[/research_tasks] Request Headers: {dict(http_request.headers)}")
        logger.info(f"[/research_tasks] Request Query Params: {dict(http_request.query_params)}")
        
        raw_body_bytes_for_parsing = await http_request.body()
        # The raw_body_bytes_for_parsing and manual parsing logic is no longer needed here,
        # as FastAPI will handle validation using the `request_params: models.DeepSearchRequest` type hint.
        # The custom RequestValidationError handler will catch validation failures.
        # If validation passes, request_params will be a valid DeepSearchRequest object.
        
        # The following logging for raw body might not be reliable if Pydantic validation fails early,
        # as the body stream might be consumed. The custom exception handler is better for this.
        # However, if Pydantic validation *passes*, this log can show the successfully validated body.
        try:
            # Attempt to log the body that Pydantic successfully parsed.
            # This assumes request_params is now a Pydantic model instance.
            # logger.info(f"[/research_tasks] Pydantic validated request body: {request_params.model_dump_json(exclude_none=True)}") # Removed to prevent logging API keys
            logger.info(f"[/research_tasks] Request body successfully validated by Pydantic for user_id: {request_params.user_id}.") # Log confirmation without sensitive data
        except Exception as e_log_body_after_pydantic:
            logger.error(f"[/research_tasks] Error logging Pydantic validated body: {e_log_body_after_pydantic}")

    except Exception as e_req_info: # This initial try-except for logging headers/query_params
        logger.error(f"[/research_tasks] Error logging request info: {e_req_info}")
        # Do not raise here, let the main logic proceed or fail with Pydantic validation.

    # If Pydantic validation passed, request_params is a valid models.DeepSearchRequest object.
    # The checks for parsed_request_data are no longer needed.

    task_id = str(uuid.uuid4())
    output_queue = asyncio.Queue()
    task_output_queues[task_id] = output_queue

    llm_reasoner = LLMReasoning(settings=config.settings)
    search_scraper = await SearchScrape.create(settings=config.settings)
    services_dict = {
        "llm_reasoner": llm_reasoner, "search_scraper": search_scraper,
        "content_vector": content_vector_service_instance, "settings": config.settings,
        "rate_limit_manager": search_scraper.rate_limit_manager, 
    }

    initial_graph_state_dict = models.OverallState(
        task_id=task_id,
        user_id=request_params.user_id, # Populate user_id here
        original_query=request_params.request_params.initial_query, # Use directly from Pydantic model
        request_params=request_params.request_params, 
        api_config=request_params.api_config or {},
    ).model_dump()

    research_graph_compiled = create_research_graph(services=services_dict, output_queue=output_queue)
    graph_config = {"recursion_limit": 150, "configurable": {"thread_id": task_id}}

    async def run_graph_and_process_events():
        logger.info(f"[{task_id}] run_graph_and_process_events: Task starting.")
        try:
            logger.info(f"[{task_id}] run_graph_and_process_events: About to call research_graph_compiled.astream_log.")
            async for _event_chunk in research_graph_compiled.astream_log(initial_graph_state_dict, config=graph_config, include_types=["llm", "chain", "tool", "retriever"]):
                pass # We are processing events via the output_queue now
            logger.info(f"[{task_id}] run_graph_and_process_events: research_graph_compiled.astream_log finished normally.")
        except asyncio.CancelledError:
            logger.warning(f"[{task_id}] run_graph_and_process_events: Graph task was EXPLICITLY CANCELLED (asyncio.CancelledError).")
            if not output_queue.full():
                logger.info(f"[{task_id}] run_graph_and_process_events: Queuing 'cancelled' event due to explicit graph cancellation.")
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="cancelled", payload=models.SSECancelledData(message="Task explicitly cancelled during graph execution.")))
            # No re-raise here, let finally block handle cleanup
        except Exception as e_graph:
            logger.error(f"[{task_id}] run_graph_and_process_events: UNHANDLED EXCEPTION during graph execution: {type(e_graph).__name__} - {e_graph}", exc_info=True)
            if not output_queue.full():
                logger.info(f"[{task_id}] run_graph_and_process_events: Queuing 'error' event due to unhandled graph exception.")
                # Make the error message more user-friendly
                user_friendly_error = "The research process encountered an unexpected issue and had to stop. This could be due to a problem with an external service or an internal error. Please try your query again later."
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="error", payload=models.SSEErrorData(error_message=user_friendly_error, stage="graph_runtime_error", is_fatal=True)))
            # No re-raise here, let finally block handle cleanup
        finally:
            logger.info(f"[{task_id}] run_graph_and_process_events: FINALLY block reached. Task finished, errored, or cancelled.")
            # Signal that the graph is done, which will allow the event_generator to terminate.
            if task_id in task_output_queues:
                await task_output_queues[task_id].put(None)


    research_task = asyncio.create_task(run_graph_and_process_events())
    active_tasks[task_id] = research_task
    
    async def _task_done_callback_async(current_task_id: str, task_future: asyncio.Task):
        try:
            await task_future # Await the task to ensure exceptions are propagated if not handled
        except asyncio.CancelledError:
            logger.info(f"Task {current_task_id} (in done_callback) was properly cancelled.")
        except Exception as e_task_done:
            logger.error(f"Task {current_task_id} (in done_callback) completed with an unhandled exception: {e_task_done}", exc_info=True)
        finally:
            await asyncio.sleep(getattr(config.settings, "TASK_CLEANUP_DELAY_SECONDS", 2.0)) # Give SSE stream time to close
            active_tasks.pop(current_task_id, None)
            # task_output_queues.pop(current_task_id, None) # Queue should be removed by SSE generator when it ends
            logger.debug(f"Task {current_task_id} removed from active_tasks.")

    research_task.add_done_callback(lambda fut: asyncio.create_task(_task_done_callback_async(task_id, fut)))
    
    urls = get_task_urls(task_id, http_request)
    return models.TaskCreationResponse(task_id=task_id, status="pending", stream_url=urls["stream_url"], cancel_url=urls["cancel_url"])

@app.post("/tasks/{task_id}/ingest_documents", response_model=models.GeneralVectorResponse, tags=["Research Tasks"])
async def ingest_documents_for_task(task_id: str, request_body: models.IngestDocumentsRequest, cv_service: ContentVector = Depends(get_content_vector_service)):
    processed_docs_for_vector_store: List[models.GenericDocumentItem] = []
    base_upload_path = config.settings.UPLOAD_DIR_PYTHON_CAN_ACCESS
    if not base_upload_path or not os.path.isdir(base_upload_path):
        raise HTTPException(status_code=500, detail="Upload directory not configured.")
    files_processed, files_failed = 0, 0
    for item in request_body.documents:
        try:
            full_file_path = os.path.abspath(os.path.join(base_upload_path, item.file_path))
            if not full_file_path.startswith(os.path.abspath(base_upload_path)):
                files_failed += 1; continue
            if not os.path.exists(full_file_path) or not os.path.isfile(full_file_path):
                files_failed += 1; continue
            text_content, raw_tables = "", []
            file_type = (item.file_type or "").lower(); name_lower = item.original_name.lower()
            if file_type == 'text/plain' or name_lower.endswith('.txt'):
                with open(full_file_path, 'r', encoding='utf-8', errors='replace') as f: text_content = f.read()
            elif file_type == 'application/pdf' or name_lower.endswith('.pdf'):
                text_content, raw_tables = _extract_text_and_tables_from_pdf_with_pdfplumber(full_file_path)
            elif name_lower.endswith('.docx'): text_content = _extract_text_from_docx(full_file_path)
            elif name_lower.endswith(('.xls', '.xlsx')): text_content = _extract_text_from_excel(full_file_path)
            else:
                try: 
                    with open(full_file_path, 'r', encoding='utf-8', errors='replace') as f: text_content = f.read()
                except: files_failed += 1; continue
            if text_content and text_content.strip():
                doc_metadata_base = {"original_name": item.original_name, "source_type": "uploaded_file", "original_file_id_from_node": str(item.file_id_from_node), "file_type_provided": item.file_type, "is_from_uploaded_doc": True, "original_document_id": str(item.file_id_from_node), "original_document_name": item.original_name, **(item.metadata or {})}
                if request_body.reasoning_model_info and request_body.api_config:
                    try:
                        per_chunk_results = await analyze_document_content(text_content, raw_tables, item.original_name, str(item.file_id_from_node), task_id, request_body.reasoning_model_info, request_body.api_config, config.settings)
                        if not per_chunk_results:
                            processed_docs_for_vector_store.append(models.GenericDocumentItem(id=f"file_{item.file_id_from_node}_full", text_content=text_content.strip(), metadata={**doc_metadata_base, "llm_analysis_status": "skipped_no_chunks"}))
                        else:
                            for chunk_res in per_chunk_results:
                                content, c_idx, c_type = (chunk_res.get("original_text_chunk","") or chunk_res.get("original_table_markdown","")).strip(), \
                                                         chunk_res.get("chunk_index", uuid.uuid4().hex[:6]) or chunk_res.get("table_index", uuid.uuid4().hex[:6]), \
                                                         chunk_res.get("content_type","unknown")
                                if not content: continue
                                chunk_meta = {**doc_metadata_base, "item_index_in_doc": c_idx, "llm_analysis_status": "completed", "source_type": f"uploaded_file_{c_type}"}
                                if c_type == "text_chunk": chunk_meta.update({k:v for k,v in chunk_res.items() if k in ["extracted_summary","extracted_entities","extracted_relationships","llm_analysis_error_summary","llm_analysis_error_entities","llm_analysis_error_relationships"] and v is not None})
                                elif c_type == "table_analysis": chunk_meta.update({k:v for k,v in chunk_res.items() if k in ["table_summary","key_insights_from_table","potential_entities_in_table","llm_analysis_error_table"] and v is not None})
                                processed_docs_for_vector_store.append(models.GenericDocumentItem(id=f"file_{item.file_id_from_node}_{c_type}_{c_idx}", text_content=content, metadata=chunk_meta))
                    except Exception as e_llm_doc: 
                        logger.error(f"Error during LLM analysis for document {item.original_name}: {e_llm_doc}", exc_info=True)
                        processed_docs_for_vector_store.append(models.GenericDocumentItem(id=f"file_{item.file_id_from_node}_error", text_content=text_content.strip(), metadata={**doc_metadata_base, "llm_analysis_status": "error_processing", "llm_analysis_error": str(e_llm_doc)}))
                else: 
                    processed_docs_for_vector_store.append(models.GenericDocumentItem(id=f"file_{item.file_id_from_node}_raw", text_content=text_content.strip(), metadata={**doc_metadata_base, "llm_analysis_status": "skipped_no_config"}))
                files_processed += 1
            else: files_failed += 1
        except Exception as e_file_proc: 
            logger.error(f"Error processing file item {item.original_name}: {e_file_proc}", exc_info=True)
            files_failed += 1
    if processed_docs_for_vector_store:
        try: await cv_service.add_documents(group_id=task_id, documents=processed_docs_for_vector_store)
        except Exception as e_vec: raise HTTPException(status_code=500, detail=f"Vector store add failed: {e_vec}")
    return models.GeneralVectorResponse(success=True, message=f"Ingestion complete. Processed: {files_processed}, Failed/Skipped: {files_failed}.", details={"files_processed": files_processed, "files_failed_or_skipped": files_failed, "items_added_to_vector_store": len(processed_docs_for_vector_store)})

@app.get("/research_tasks/{task_id}/stream")
async def stream_task_updates(task_id: str, request: Request): # Renamed req to request
    output_queue = task_output_queues.get(task_id)
    task_instance = active_tasks.get(task_id)
    if not output_queue:
        if not task_instance or task_instance.done(): 
            logger.info(f"Stream request for task {task_id}: Not found or completed.")
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found or completed.")
        logger.error(f"Inconsistent state for task {task_id}: output queue missing but task active.")
        raise HTTPException(status_code=500, detail=f"Inconsistent state for task {task_id}.")
    if not task_instance: # Should be caught by above, but as a safeguard
        task_output_queues.pop(task_id, None) 
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found (inconsistent state).")

    async def event_generator():
        logger.info(f"[{task_id}] event_generator: SSE Stream event_generator starting.")
        queue_getter = None
        heartbeat_waiter = None
        try:
            # Send an initial set of events
            yield {"event": "heartbeat", "data": json.dumps({"message": "SSE stream initializing", "timestamp": asyncio.get_event_loop().time()}), "id": str(uuid.uuid4())}
            yield {"event": "progress", "data": models.SSEProgressData(stage="stream_start", message="SSE stream connected.").model_dump_json(), "id": str(uuid.uuid4())}
            
            logger.info(f"[{task_id}] event_generator: Entering main event loop with 2s heartbeat.")

            queue_getter = asyncio.create_task(output_queue.get())
            heartbeat_waiter = asyncio.create_task(asyncio.sleep(2.0))

            while True:
                done, pending = await asyncio.wait(
                    [queue_getter, heartbeat_waiter],
                    return_when=asyncio.FIRST_COMPLETED
                )

                if queue_getter in done:
                    sse_event = queue_getter.result()
                    if sse_event is None:
                        logger.info(f"[{task_id}] event_generator: Received None sentinel, signaling end of stream.")
                        break

                    yield {"event": sse_event.event_type, "data": sse_event.payload.model_dump_json() if sse_event.payload else "{}", "id": str(uuid.uuid4())}
                    
                    if sse_event.event_type in ["complete", "error", "cancelled"]:
                        logger.info(f"[{task_id}] event_generator: Received terminal event '{sse_event.event_type}', exiting loop.")
                        break
                    
                    # Reset the queue_getter for the next event
                    queue_getter = asyncio.create_task(output_queue.get())

                if heartbeat_waiter in done:
                    logger.debug(f"[{task_id}] event_generator: Sending 2s heartbeat.")
                    yield {"event": "heartbeat", "data": json.dumps({"timestamp": asyncio.get_event_loop().time()}), "id": str(uuid.uuid4())}
                    # Reset the heartbeat_waiter
                    heartbeat_waiter = asyncio.create_task(asyncio.sleep(2.0))

        except asyncio.CancelledError:
            logger.warning(f"[{task_id}] event_generator: EXPLICITLY CANCELLED (asyncio.CancelledError caught). This usually means client disconnected or server shut down stream response.")
        except Exception as e_sse_gen:
            logger.error(f"[{task_id}] event_generator: UNHANDLED EXCEPTION in SSE event_generator: {type(e_sse_gen).__name__} - {e_sse_gen}", exc_info=True)
            try:
                error_payload = models.SSEErrorData(error_message=f"SSE stream error: {type(e_sse_gen).__name__} - {str(e_sse_gen)}", is_fatal=True, stage="sse_generator_exception")
                yield {"event": "error", "data": error_payload.model_dump_json(), "id": str(uuid.uuid4())}
            except Exception as e_report_err:
                logger.error(f"[{task_id}] event_generator: Failed to send error event during exception handling: {e_report_err}", exc_info=True)
        finally:
            if queue_getter and not queue_getter.done():
                queue_getter.cancel()
            if heartbeat_waiter and not heartbeat_waiter.done():
                heartbeat_waiter.cancel()
            task_output_queues.pop(task_id, None)
            logger.info(f"[{task_id}] event_generator: FINALLY block. SSE event_generator for task {task_id} finished/cancelled and queue removed.")
            
    return EventSourceResponse(event_generator())

@app.post("/research_tasks/{task_id}/cancel", response_model=models.CancellationResponse)
async def cancel_research_task(task_id: str):
    task = active_tasks.get(task_id)
    if not task: raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")
    if task.done(): return models.CancellationResponse(task_id=task_id, status="already_completed", message="Task already completed/cancelled.")
    task.cancel(); return models.CancellationResponse(task_id=task_id, status="cancellation_requested")

@app.get("/research_tasks/{task_id}/status", response_model=models.TaskStatusResponse)
async def get_task_status(task_id: str):
    if task_id in active_tasks:
        task = active_tasks[task_id]
        if task.done():
            if task.cancelled(): return models.TaskStatusResponse(task_id=task_id, status="cancelled", progress_message="Task cancelled.")
            elif task.exception(): return models.TaskStatusResponse(task_id=task_id, status="error", progress_message=f"Task failed: {str(task.exception())}")
            else: return models.TaskStatusResponse(task_id=task_id, status="completing", progress_message="Task finalizing.")
        else: return models.TaskStatusResponse(task_id=task_id, status="running", progress_message="Task running.")
    raise HTTPException(status_code=404, detail=f"Task {task_id} not found.")

@app.get("/")
async def read_root(): return {"message": "Live Search Orchestrator Service is running."}

@app.post("/vector/documents", response_model=models.GeneralVectorResponse, tags=["Vector Service"])
async def add_vector_documents(req_data: models.AddDocumentsRequest, cv: ContentVector = Depends(get_content_vector_service)):
    try:
        res = await cv.add_documents(group_id=req_data.group_id, documents=req_data.documents)
        if res.get("success"): return models.GeneralVectorResponse(success=True, message=res.get("message","Docs processed."), details=res)
        raise HTTPException(status_code=500, detail=res.get("message", "Failed to add docs."))
    except Exception as e: 
        logger.error(f"Error in add_vector_documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/vector/search", response_model=models.VectorSearchResponse, tags=["Vector Service"])
async def search_vector_documents(req_data: models.VectorSearchRequest, cv: ContentVector = Depends(get_content_vector_service)):
    try:
        if not req_data.query_text: raise HTTPException(status_code=400, detail="query_text empty.")
        q_emb_list = await cv.generate_embeddings([req_data.query_text]) # Renamed for clarity
        if not q_emb_list or not q_emb_list[0]: raise HTTPException(status_code=500, detail="Query embedding failed.")
        results = await cv.search_vectors(query_vector=q_emb_list[0], limit=req_data.top_k, group_id=req_data.group_id)
        return models.VectorSearchResponse(success=True, message=f"Found {len(results)} results.", results=results)
    except Exception as e: 
        logger.error(f"Error in search_vector_documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/vector/delete_by_group", response_model=models.GeneralVectorResponse, tags=["Vector Service"])
async def delete_vectors_by_group(req_data: models.DeleteByGroupIdRequest, cv: ContentVector = Depends(get_content_vector_service)):
    try:
        res = await cv.delete_vectors_by_group_id(group_id=req_data.group_id)
        if res.get("success"): return models.GeneralVectorResponse(success=True, message=res.get("message", f"Docs for group {req_data.group_id} deleted."))
        raise HTTPException(status_code=500, detail=res.get("message", "Failed to delete by group."))
    except Exception as e: 
        logger.error(f"Error in delete_vectors_by_group: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/vector/embed-texts", response_model=models.EmbedTextsResponse, tags=["Vector Service"])
async def embed_texts_endpoint(req_data: models.EmbedTextsRequest, cv: ContentVector = Depends(get_content_vector_service)):
    try:
        if not req_data.texts: 
            model_name = cv.model_id_or_path or "unknown_model_not_loaded"
            dimension = cv.embedding_dim or 0
            return models.EmbedTextsResponse(embeddings=[], model_used=model_name, dimension=dimension)
        if not cv.model or not cv.embedding_dim or not cv.model_id_or_path: 
            raise HTTPException(status_code=503, detail="Embedding model not loaded.")
        embs = await cv.generate_embeddings(req_data.texts)
        if not isinstance(embs, list) or (req_data.texts and not embs): 
            raise HTTPException(status_code=500, detail="Embedding generation failed or returned unexpected format.")
        return models.EmbedTextsResponse(embeddings=embs, model_used=cv.model_id_or_path, dimension=cv.embedding_dim)
    except Exception as e: 
        logger.error(f"Error in embed_texts_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Ensure log_level from settings is used for uvicorn if it's a valid string
    uvicorn_log_level = config.settings.LOG_LEVEL.lower() if isinstance(config.settings.LOG_LEVEL, str) else "info"
    uvicorn.run(
        "src.python_services.deep_search_service.main:app", 
        host=config.settings.LIVE_SEARCH_SERVER_HOST, 
        port=config.settings.LIVE_SEARCH_SERVER_PORT, 
        log_level=uvicorn_log_level,
        reload=True # Added reload for development convenience
    )
