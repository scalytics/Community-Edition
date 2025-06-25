#!/usr/bin/env python3
"""
Persistent Model Worker in Python

This script loads a model into memory and keeps it loaded to provide fast inference
without cold-start penalties. It communicates with the Node.js process through
stdin/stdout using a simple JSON protocol.
"""

import argparse
import json
import os
import signal # Added for graceful shutdown
import sys
import time
import traceback
from threading import Thread
from typing import Dict, List, Optional, Union, Any

# Configure environment for optimal performance
os.environ['GGML_VERBOSE'] = os.environ.get('GGML_VERBOSE', '0')
os.environ['LLAMA_CPP_DEBUG'] = os.environ.get('LLAMA_CPP_DEBUG', '0')
os.environ['LLAMA_KV_CACHE_TYPE'] = os.environ.get('LLAMA_KV_CACHE_TYPE', 'f16')
os.environ['GGML_MMAP'] = os.environ.get('GGML_MMAP', '1')
os.environ['LLAMA_PREFER_LEGACY_FORMAT'] = os.environ.get('LLAMA_PREFER_LEGACY_FORMAT', '1')
os.environ['LLAMA_LOG_STDERR_OUTPUT'] = os.environ.get('LLAMA_LOG_STDERR_OUTPUT', '0')

# Status constants
STATUS_LOADING = "loading"
STATUS_READY = "ready"
STATUS_ERROR = "error"


class PersistentModelWorker:
    """
    Worker class that maintains a loaded model in memory and processes
    inference requests from the parent Node.js process.
    """
    def __init__(self, model_path: str, config_path: Optional[str] = None):
        self.model_path = model_path
        self.config_path = config_path
        self.model = None
        self.model_config = None
        self.status = STATUS_LOADING
        self.start_time = time.time()
        self.shutdown_requested = False # Flag for graceful shutdown

        # Try to load model config if provided
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    self.model_config = json.load(f)
                print(f"Loaded model config: {config_path}", file=sys.stderr)
            except Exception as e:
                print(f"Error loading model config: {e}", file=sys.stderr)
                self.model_config = None
        
        # Configure model parameters
        self.model_params = {
            "model": model_path,
            "n_ctx": self.model_config.get("n_ctx", 4096) if self.model_config else 4096,
            "n_gpu_layers": self.model_config.get("n_gpu_layers", -1) if self.model_config else -1,
            "batch_size": self.model_config.get("batch_size", 512) if self.model_config else 512,
            "n_threads": self.model_config.get("n_threads", 8) if self.model_config else 8
        }
        
        # Add tensor_split for multi-GPU support if specified in config
        if self.model_config and "tensor_split" in self.model_config:
            self.model_params["tensor_split"] = self.model_config["tensor_split"]
    
    def load_model(self):
        """Load the model into memory"""
        try:
            # Send status to parent process
            self.send_message({
                "type": "status",
                "status": STATUS_LOADING
            })
            
            print(f"Loading model: {self.model_path}", file=sys.stderr)
            print(f"Using parameters: {self.model_params}", file=sys.stderr)
            
            # Import llama_cpp here to ensure environment variables take effect
            from llama_cpp import Llama
            
            # Get model name to detect special cases (though not used for batch size anymore)
            model_name = os.path.basename(self.model_path).lower()

            # Use the batch size from the loaded parameters (optimized config)
            # Removed the hardcoded override for DeepSeek
            effective_batch_size = self.model_params.get("batch_size", 512)
            print(f"Using effective batch size: {effective_batch_size}", file=sys.stderr)

            # Initialize the model with optimized parameters
            self.model = Llama(
                model_path=self.model_path,
                n_ctx=self.model_params.get("n_ctx", 4096),
                n_batch=effective_batch_size, # Use batch size from config
                n_threads=self.model_params.get("n_threads", 8),
                n_gpu_layers=self.model_params.get("n_gpu_layers", -1),
                tensor_split=self.model_params.get("tensor_split", None),
                verbose=False,
                seed=42
            )
            
            # Update status
            self.status = STATUS_READY
            load_time = int((time.time() - self.start_time) * 1000)  # in milliseconds
            
            # Send ready message to parent process
            self.send_message({
                "type": "ready",
                "time": int(time.time() * 1000),
                "modelInfo": {
                    "path": self.model_path,
                    "name": os.path.basename(self.model_path),
                    "config": self.model_config
                }
            })
            
            # Send initial memory report
            self.report_memory()
            
            return True
        except Exception as e:
            print(f"Error loading model: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            
            # Send error message to parent process
            self.send_message({
                "type": "error",
                "error": str(e)
            })
            
            self.status = STATUS_ERROR
            return False
    
    def process_inference(self, request_id: str, prompt: str, parameters: Dict[str, Any]):
        """Process an inference request"""
        try:
            # Send processing status
            self.send_message({
                "type": "processing",
                "requestId": request_id
            })
            
            # Configure generation parameters
            temperature = parameters.get("temperature", 0.7)
            max_tokens = parameters.get("max_tokens", 256) # Total tokens requested for the response
            top_p = parameters.get("top_p", 1.0)
            top_k = parameters.get("top_k", 40)
            stop = parameters.get("stop", [])
            repeat_penalty = parameters.get("repeat_penalty", 1.1)
            
            # Track generated output
            output = ""
            start_time = time.time()
            token_count = 0 # Tokens generated so far in this response
            
            # Get the model's context window size from parameters
            model_n_ctx = self.model_params.get("n_ctx", 4096)
            
            # Keep generating until we've produced the requested number of tokens
            while token_count < max_tokens:
                # Calculate tokens used by the current prompt + generated output
                current_prompt_text = prompt + output
                # Ensure the model object exists before tokenizing
                if not self.model:
                    raise Exception("Model is not loaded")
                prompt_tokens = self.model.tokenize(current_prompt_text.encode('utf-8'))
                prompt_token_count = len(prompt_tokens)
                
                # Calculate remaining tokens available in the context window
                # Add a small buffer (e.g., 10 tokens) to avoid hitting the exact limit
                buffer = 10
                available_context_tokens = max(0, model_n_ctx - prompt_token_count - buffer)
                
                # Determine max tokens to generate in this iteration:
                # Minimum of: remaining requested tokens for this response, available context, 
                # and a reasonable chunk size (e.g., 512) to avoid asking for too much at once.
                remaining_requested_tokens = max_tokens - token_count
                tokens_to_generate_this_iteration = min(remaining_requested_tokens, available_context_tokens, 512)
                
                # If no more tokens can be generated within the context or request limit, break
                if tokens_to_generate_this_iteration <= 0:
                    if available_context_tokens <= 0:
                        print(f"Warning: Context window limit reached. Prompt tokens: {prompt_token_count}, Context: {model_n_ctx}", file=sys.stderr)
                    break # Exit the while loop
                    
                # Generate a chunk of tokens
                chunk_generated = False
                for output_chunk in self.model(
                    current_prompt_text, # Pass the updated prompt text
                    temperature=temperature,
                    top_p=top_p,
                    top_k=top_k,
                    repeat_penalty=repeat_penalty,
                    max_tokens=tokens_to_generate_this_iteration, # Use calculated max tokens for this iteration
                    stop=stop,
                    stream=True
                ):
                    chunk_generated = True
                    # Extract token
                    token = output_chunk["choices"][0]["text"]
                    output += token
                    token_count += 1
                    
                    # Send token to parent process and flush immediately
                    self.send_message({
                        "type": "token",
                        "requestId": request_id,
                        "token": token
                    })
                    sys.stdout.flush()  # Force immediate transmission
                
                    # Check if we've generated enough tokens within the inner loop (should match max_tokens for this iteration)
                    # Also check against the total requested max_tokens
                    if token_count >= max_tokens:
                        break # Exit the inner for loop

                # If the inner loop finished without generating anything (e.g., hit stop sequence immediately)
                # or if we've hit the total max_tokens, break the outer loop.
                if not chunk_generated or token_count >= max_tokens:
                    break

                # Check for stop sequences in the generated output
                if stop and any(s in output for s in stop):
                    break # Exit the while loop if a stop sequence is found
            
            # Get usage statistics (using estimated prompt tokens for now)
            # TODO: Get accurate prompt token count from initial tokenization if possible
            estimated_prompt_tokens = len(prompt.split()) # Simple estimation
            usage = {
                "prompt_tokens": estimated_prompt_tokens, 
                "completion_tokens": token_count,
                "total_tokens": estimated_prompt_tokens + token_count
            }
            
            # Send completion message
            self.send_message({
                "type": "complete",
                "requestId": request_id,
                "message": output,
                "usage": usage,
                "time": int(time.time() * 1000)
            })
            
            # Update memory usage after completion
            self.report_memory()
            
        except Exception as e:
            print(f"Error processing request {request_id}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            
            # Send error message to parent process
            self.send_message({
                "type": "error",
                "requestId": request_id,
                "error": str(e)
            })
    
    def report_memory(self):
        """Report memory usage to parent process"""
        try:
            import psutil
            
            # Get process memory usage
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            
            # Send memory info to parent process
            self.send_message({
                "type": "memory",
                "data": {
                    "rss": memory_info.rss,
                    "heapTotal": 0,  # Not available in Python
                    "heapUsed": 0,   # Not available in Python
                    "external": 0,   # Not available in Python
                    "time": int(time.time() * 1000)
                }
            })
        except ImportError:
            # psutil not available, send minimal memory info
            self.send_message({
                "type": "memory",
                "data": {
                    "rss": 0,
                    "heapTotal": 0,
                    "heapUsed": 0,
                    "external": 0,
                    "time": int(time.time() * 1000)
                }
            })
        except Exception as e:
            print(f"Error reporting memory: {e}", file=sys.stderr)
    
    def send_message(self, message: Dict[str, Any]):
        """Send a message to the parent process"""
        try:
            # Convert message to JSON and print to stdout
            json_message = json.dumps(message)
            print(json_message, flush=True)
        except Exception as e:
            print(f"Error sending message: {e}", file=sys.stderr)
    
    def handle_message(self, message: Dict[str, Any]):
        """Handle a message from the parent process"""
        try:
            message_type = message.get("type")
            
            if message_type == "inference":
                # Handle inference request
                request_id = message.get("requestId")
                prompt = message.get("prompt")
                parameters = message.get("parameters", {})
                
                # Process in a separate thread to avoid blocking
                thread = Thread(target=self.process_inference, args=(request_id, prompt, parameters))
                thread.daemon = True
                thread.start()
            
            elif message_type == "ping":
                # Respond to ping
                self.send_message({
                    "type": "pong",
                    "time": int(time.time() * 1000)
                })
            
            elif message_type == "memory":
                # Report memory usage
                self.report_memory()

        except Exception as e:
            print(f"Error handling message: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)

    def cleanup(self):
        """Explicitly release resources."""
        if self.model:
            print("Releasing model resources...", file=sys.stderr)
            try:
                # Explicitly delete the model object to trigger __del__ if available
                # and help Python's garbage collector.
                del self.model
                self.model = None
                print("Model resources released.", file=sys.stderr)
            except Exception as e:
                print(f"Error during model cleanup: {e}", file=sys.stderr)
        else:
            print("No model loaded, nothing to release.", file=sys.stderr)

    def handle_shutdown_signal(self, signum, frame):
        """Handle termination signals gracefully."""
        if not self.shutdown_requested:
            print(f"Received signal {signum}, initiating graceful shutdown...", file=sys.stderr)
            self.shutdown_requested = True
            # Optionally send a status message if needed
            # self.send_message({"type": "status", "status": "shutting_down"})
            self.cleanup()
            print("Shutdown complete. Exiting.", file=sys.stderr)
            sys.exit(0) # Exit cleanly after cleanup
        else:
            print("Shutdown already in progress.", file=sys.stderr)

    def run(self):
        """Main execution loop"""
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.handle_shutdown_signal)
        signal.signal(signal.SIGTERM, self.handle_shutdown_signal)

        # Load model first
        if not self.load_model():
            print("Failed to load model, exiting.", file=sys.stderr)
            sys.exit(1)
        
        # Start message handling loop
        try:
            for line in sys.stdin:
                try:
                    # Parse JSON message
                    message = json.loads(line.strip())
                    self.handle_message(message)
                except json.JSONDecodeError:
                    print(f"Invalid JSON message: {line}", file=sys.stderr)
                except Exception as e:
                    print(f"Error processing message: {e}", file=sys.stderr)
        except KeyboardInterrupt:
            print("Received interrupt, shutting down.", file=sys.stderr)
        except Exception as e:
            print(f"Unexpected error in run loop: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        finally:
            # Ensure cleanup runs even if loop exits unexpectedly
            if not self.shutdown_requested:
                print("Run loop exited unexpectedly, performing cleanup...", file=sys.stderr)
                self.cleanup()
            print("Worker stopped.", file=sys.stderr)

def main():
    """Main entry point"""
    # Parse arguments
    parser = argparse.ArgumentParser(description="Persistent Model Worker")
    parser.add_argument("--model", type=str, required=True, help="Path to the model file")
    parser.add_argument("--config", type=str, help="Path to the model configuration file")
    
    args = parser.parse_args()
    
    # Create and run worker
    worker = PersistentModelWorker(args.model, args.config)
    worker.run()

if __name__ == "__main__":
    # Get model path from environment variable if not provided
    if len(sys.argv) == 1 and "MODEL_PATH" in os.environ:
        model_path = os.environ["MODEL_PATH"]
        config_path = os.environ.get("CONFIG_PATH", "")
        
        # Use environment variables directly
        sys.argv.extend(["--model", model_path])
        if config_path:
            sys.argv.extend(["--config", config_path])
    
    main()
