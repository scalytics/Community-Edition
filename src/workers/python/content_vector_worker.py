#!/usr/bin/env python3
"""
Content Vector Worker (Knowledge Librarian)
Handles text chunking, embedding generation, and vector database operations.
"""
import json
import sys
import asyncio
import time
import os
import argparse 
import traceback 
from typing import Dict, List, Optional, Any

from sentence_transformers import SentenceTransformer
import lancedb
from langchain.text_splitter import RecursiveCharacterTextSplitter

# --- Environment Setup ---
project_root_cvw = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')) 
LANCEDB_BASE_DIR_CVW = os.path.abspath(os.path.join(project_root_cvw, 'data', 'mcp_tools', 'scalytics-search', 'vector_db_store'))
TABLE_NAME_CVW = 'embeddings' 

class ContentVectorWorker:
    def __init__(self, model_id_or_path: str, vector_db_uri: str = LANCEDB_BASE_DIR_CVW, table_name: str = TABLE_NAME_CVW):
        self.model_id_or_path = model_id_or_path
        self.vector_db_uri = vector_db_uri
        self.table_name = table_name
        
        self.model: Optional[SentenceTransformer] = None
        self.embedding_dim: Optional[int] = None
        self.db_connection: Optional[lancedb.DBConnection] = None
        self.db_table: Optional[lancedb.table.Table] = None 
        
        self.status = "initializing" 
        self.processing_lock = asyncio.Lock() 
        self._init_event: Optional[asyncio.Event] = None 
        self._initializing_lock = asyncio.Lock() 

    async def initialize_resources(self):
        if self.status == "ready":
            return True
        
        async with self._initializing_lock:
            if self.status == "ready": 
                return True
            
            if self.status == "initializing_resources":
                if self._init_event: 
                    await self._init_event.wait()
                return self.status == "ready"

            self.status = "initializing_resources"
            self._init_event = asyncio.Event() 

            try:
                self.model = SentenceTransformer(self.model_id_or_path, device='cpu')
                self.embedding_dim = self.model.get_sentence_embedding_dimension()
                if not self.embedding_dim:
                    raise ValueError("Could not get embedding dimension from model.")

                os.makedirs(self.vector_db_uri, exist_ok=True)
                self.db_connection = lancedb.connect(self.vector_db_uri)
                try:
                    self.db_table = self.db_connection.open_table(self.table_name)
                except FileNotFoundError: 
                    self.db_table = self.db_connection.create_table(
                        self.table_name,
                        data=[{'vector': [0.0] * self.embedding_dim, 'chatId': 'dummy', 'source': 'dummy', 'chunkIndex': 0, 'textContent': 'dummy text'}]
                    )
                    self.db_table.delete("\"chatId\" = 'dummy'") 
                
                self.status = "ready"
                self._init_event.set() 
                return True
            except Exception as e:
                self.status = "error"
                print(f"[ContentVectorWorker] Error initializing resources: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                if self._init_event: self._init_event.set() 
                return False

    async def _ensure_ready(self):
        if self.status != "ready":
            if not await self.initialize_resources(): 
                raise Exception(f"ContentVectorWorker failed to initialize resources and is not ready. Status: {self.status}")

    async def chunk_text(self, text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
        if not text: 
            return []
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap, length_function=len, is_separator_regex=False)
        chunks = text_splitter.split_text(text)
        return chunks

    async def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        await self._ensure_ready()
        if not texts: 
            return []
        
        async with self.processing_lock:
            loop = asyncio.get_event_loop()
            embeddings_np = await loop.run_in_executor(None, lambda: self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False))
            return [e.tolist() for e in embeddings_np]

    async def add_documents(self, documents: List[Dict]): 
        await self._ensure_ready()
        if not documents: 
            return {"success": True, "message": "No documents to add."}
        
        docs_to_add_to_lancedb = []
        for doc_idx, doc in enumerate(documents):
            if not doc.get('textContent'): 
                continue
            
            chunks = await self.chunk_text(doc['textContent'])
            if not chunks: 
                continue
            
            embeddings = await self.generate_embeddings(chunks)
            
            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                vector_doc = {
                    "vector": emb,
                    "chatId": str(doc.get("chatId", f"unknown_chat_{doc_idx}")), 
                    "source": json.dumps(doc.get("source", {"error": f"unknown_source_doc_idx_{doc_idx}_chunk_{i}"})), 
                    "chunkIndex": i,
                    "textContent": chunk
                }
                docs_to_add_to_lancedb.append(vector_doc)
        
        if docs_to_add_to_lancedb:
            async with self.processing_lock: 
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, lambda: self.db_table.add(docs_to_add_to_lancedb))
        return {"success": True, "message": f"{len(documents)} documents processed, {len(docs_to_add_to_lancedb)} chunks added."}

    async def search_vectors(self, query_vector: List[float], limit: int) -> List[Dict]:
        await self._ensure_ready()
        async with self.processing_lock: 
            loop = asyncio.get_event_loop()
            results_lancedb = await loop.run_in_executor(None, lambda: self.db_table.search(query_vector).limit(limit).to_list())
        
        mapped_results = [{'text_content':r.get('textContent',''), 'source':r.get('source',''), 
                           'chunk_index':r.get('chunkIndex',-1), 'distance':r.get('_distance',-1)} 
                          for r in results_lancedb]
        return mapped_results

    async def delete_vectors_for_chat(self, chat_id: str) -> Dict[str, Any]:
        await self._ensure_ready()
        async with self.processing_lock: 
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, lambda: self.db_table.delete(f"\"chatId\" = '{str(chat_id)}'"))
        return {"success": True, "message": f"Vectors for chat {chat_id} deleted."}

    def send_message(self, message: Dict[str, Any]):
        try:
            json_message = json.dumps(message)
            sys.stdout.write(json_message + '\n')
            sys.stdout.flush()
        except Exception as e:
            print(f"[ContentVectorWorker] Error sending message: {e}", file=sys.stderr)

    async def handle_message_async(self, message: Dict[str, Any]):
        message_type = message.get("type")
        request_id = message.get("requestId")
        response_payload = {}
        success = False
        error_message = "Unknown task or error."
        response_type_suffix = "_result"

        try:
            if message_type == "ping":
                self.send_message({"type": "pong", "time": int(time.time() * 1000), "worker_name": "ContentVectorWorker", "status": self.status})
                return

            if message_type == "initialize_resources":
                if not self.model_id_or_path:
                     raise ValueError("Model path not set for ContentVectorWorker before initialize_resources.")
                success = await self.initialize_resources()
                if not success: 
                    error_message = "Failed to initialize resources."
                else:
                    response_payload["status"] = self.status
                    response_payload["embedding_dim"] = self.embedding_dim
            else: 
                if not self.model_id_or_path: 
                    raise ValueError("ContentVectorWorker not configured with a model path for this operation.")
                await self._ensure_ready() 

                if message_type == "chunk_text":
                    chunks = await self.chunk_text(message.get("text"))
                    response_payload = {"chunks": chunks}; success = True
                elif message_type == "generate_embeddings":
                    embeddings = await self.generate_embeddings(message.get("texts"))
                    response_payload = {"embeddings": embeddings}; success = True
                elif message_type == "add_documents":
                    result = await self.add_documents(message.get("documents"))
                    response_payload = result; success = result.get("success", False)
                elif message_type == "search_vectors":
                    results = await self.search_vectors(message.get("query_vector"), message.get("limit", 5))
                    response_payload = {"results": results}; success = True
                elif message_type == "delete_vectors": 
                    result = await self.delete_vectors_for_chat(message.get("chat_id"))
                    response_payload = result; success = result.get("success", False)
                else:
                    error_message = f"Unknown message type: {message_type}"
                    success = False 

        except Exception as e:
            print(f"[ContentVectorWorker] Error handling {message_type}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            error_message = str(e)
            success = False
        
        final_response_type = f"{message_type}{response_type_suffix}"
        if message_type == "initialize_resources": 
             final_response_type = "initialize_resources_result"
        
        response = {"type": final_response_type, "requestId": request_id, "success": success}
        if response_payload: 
            response.update(response_payload)
        if not success and "error" not in response: 
            response["error"] = error_message
        self.send_message(response)

    def run_standalone(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def read_stdin_cvw():
            reader = asyncio.StreamReader(loop=loop)
            protocol = asyncio.StreamReaderProtocol(reader, loop=loop)
            await loop.connect_read_pipe(lambda: protocol, sys.stdin)
            while True:
                line_bytes = await reader.readline()
                if not line_bytes: break
                line = line_bytes.decode('utf-8').strip()
                if line:
                    try:
                        msg = json.loads(line)
                        loop.create_task(self.handle_message_async(msg))
                    except Exception as e:
                        print(f"[ContentVectorWorker] Error processing line: {e}", file=sys.stderr)
        try:
            loop.run_until_complete(read_stdin_cvw())
        finally:
            if not loop.is_closed(): loop.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Content Vector Worker")
    parser.add_argument("--model", type=str, help="Hugging Face model ID or local path for SentenceTransformer.")
    args = parser.parse_args()

    model_to_use = args.model
    if not model_to_use and "EMBEDDING_MODEL_CVW" in os.environ:
        model_to_use = os.environ["EMBEDDING_MODEL_CVW"]
    
    if not model_to_use: 
        model_to_use = "all-MiniLM-L6-v2"

    worker = ContentVectorWorker(model_id_or_path=model_to_use)
    worker.run_standalone()
