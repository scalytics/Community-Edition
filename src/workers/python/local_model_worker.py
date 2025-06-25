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
import signal
import sys
import time
import traceback
import threading # Added for Lock
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
        self.shutdown_requested = False 
        self.inference_lock = threading.Lock() 
        self.interrupt_flags = {} 
        self.model_family = os.environ.get("MODEL_FAMILY", "") 

        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    self.model_config = json.load(f)
            except Exception as e:
                print(f"   __init__: Error loading/parsing config from {config_path}: {e}", file=sys.stderr)
                self.model_config = None
        else:
            self.model_config = None

        # Parameters will be set during load_model using ENV VARS primarily
        self.model_params = {
             "model": model_path
        }

    def load_model(self):
        """Load the model into memory using parameters from environment variables"""
        if self.model:
             return True

        try:
            # Get parameters from Environment Variables (set by manager.js)
            env_n_ctx = os.environ.get("N_CTX")
            env_n_batch = os.environ.get("N_BATCH")
            env_n_gpu_layers = os.environ.get("N_GPU_LAYERS")
            env_kv_cache_type = os.environ.get("LLAMA_KV_CACHE_TYPE")

            # Parse each parameter with robust error handling
            try:
                if env_n_ctx: self.model_params["n_ctx"] = int(env_n_ctx)
                else: self.model_params["n_ctx"] = 4096
            except ValueError:
                print(f"Warning: Invalid N_CTX env var '{env_n_ctx}'. Using default 4096.", file=sys.stderr)
                self.model_params["n_ctx"] = 4096

            try:
                if env_n_batch: self.model_params["n_batch"] = int(env_n_batch)
                else: self.model_params["n_batch"] = 8
            except ValueError:
                print(f"Warning: Invalid N_BATCH env var '{env_n_batch}'. Using default 8.", file=sys.stderr)
                self.model_params["n_batch"] = 8

            try:
                if env_n_gpu_layers: self.model_params["n_gpu_layers"] = int(env_n_gpu_layers)
                else: self.model_params["n_gpu_layers"] = 99 # Default to full offload if not specified
            except ValueError:
                print(f"Warning: Invalid N_GPU_LAYERS env var '{env_n_gpu_layers}'. Using default 99.", file=sys.stderr)
                self.model_params["n_gpu_layers"] = 99

            self.model_params["n_threads"] = self.model_config.get("threads", 2) if self.model_config else 2

            from llama_cpp import Llama

            effective_batch_size = self.model_params.get("n_batch", 8)

            # Initialize the model using the parameters derived from ENV/defaults
            self.model = Llama(
                model_path=self.model_path,
                n_gpu_layers=self.model_params.get("n_gpu_layers", 99),
                n_ctx=self.model_params.get("n_ctx", 4096),
                n_batch=effective_batch_size,
                n_threads=self.model_params.get("n_threads", 2),
                verbose=False
            )
            self.status = STATUS_READY
            load_time = int((time.time() - self.start_time) * 1000)

            self.send_message({
                "type": "ready",
                "time": int(time.time() * 1000),
                "modelInfo": {
                    "path": self.model_path,
                    "name": os.path.basename(self.model_path),
                    "config": self.model_config
                }
            })
            self.report_memory()
            return True
        except Exception as e:
            print(f"Error loading model: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            self.send_message({"type": "error", "error": str(e)})
            self.status = STATUS_ERROR
            print("Exiting worker due to model load failure.", file=sys.stderr)
            sys.exit(1)

    def process_inference(self, request_id: str, prompt: str, parameters: Dict[str, Any]):
        """Process an inference request"""
        if request_id in self.interrupt_flags: del self.interrupt_flags[request_id]

        if not self.inference_lock.acquire(blocking=True, timeout=30):
             print(f"Request {request_id}: Failed to acquire lock within timeout. Aborting.", file=sys.stderr)
             self.send_message({"type": "error", "requestId": request_id, "error": "Worker busy, please try again shortly."})
             return

        try:
            self.send_message({"type": "processing", "requestId": request_id})

            temperature = parameters.get("temperature", 0.7)
            max_tokens = parameters.get("max_tokens", 256)
            top_p = parameters.get("top_p", 0.9)
            top_k = parameters.get("top_k", 40)
            stop = parameters.get("stop", [])
            repeat_penalty = parameters.get("repeat_penalty", 1.1)

            output = ""
            start_time = time.time()
            token_count = 0

            if not self.model: raise Exception("Model is not loaded")

            if self.interrupt_flags.get(request_id):
                print(f"Interrupt detected for {request_id} before starting generation.", file=sys.stderr)
                final_status = "cancelled"
                usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            else:
                final_status = "completed"
                first_token_sent = False # Flag to track if the first token has been processed
                try:
                    for chunk in self.model(
                        prompt, max_tokens=max_tokens, temperature=temperature, top_p=top_p,
                        top_k=top_k, repeat_penalty=repeat_penalty, stop=stop, stream=True, echo=False
                    ):
                        if self.interrupt_flags.get(request_id):
                            print(f"Interrupt detected for {request_id} during generation.", file=sys.stderr)
                            final_status = "cancelled"
                            break

                        if isinstance(chunk, dict) and 'choices' in chunk and len(chunk['choices']) > 0:
                            token_text = chunk['choices'][0]['text']
                            if token_text:
                                # Prepend <think>\n to the very first token if Deepseek and not already starting with it
                                if not first_token_sent and self.model_family == 'Deepseek' and not token_text.startswith('<think>\n'):
                                    token_text = '<think>\n' + token_text
                                elif not first_token_sent and self.model_family == 'Deepseek' and token_text.startswith('\n') and not token_text.startswith('<think>\n'):
                                    # If it starts with \n but not <think>\n, replace \n with <think>\n
                                    token_text = '<think>' + token_text
                                first_token_sent = True
                                
                                output += token_text
                                token_count += 1
                                self.send_message({"type": "token", "requestId": request_id, "token": token_text})
                        else:
                            print(f"Unexpected chunk format for {request_id}: {chunk}", file=sys.stderr)

                        if token_count >= max_tokens: break
                except Exception as stream_error:
                    print(f"Error during model streaming for {request_id}: {stream_error}", file=sys.stderr)
                    traceback.print_exc(file=sys.stderr)
                    self.send_message({"type": "error", "requestId": request_id, "error": f"Streaming failed: {str(stream_error)}"})
                    return

            estimated_prompt_tokens = len(self.model.tokenize(prompt.encode('utf-8'))) if self.model else 0
            usage = {"prompt_tokens": estimated_prompt_tokens, "completion_tokens": token_count, "total_tokens": estimated_prompt_tokens + token_count}
            final_status = "cancelled" if self.interrupt_flags.get(request_id) else "completed"

            # Ensure final output starts with <think>\n if Deepseek, even if stream was empty or first token was empty
            if self.model_family == 'Deepseek':
                if not output.startswith('<think>\n'):
                    if output.startswith('\n'): # If it somehow started with \n but not <think>\n
                        output = '<think>' + output
                    else:
                        output = '<think>\n' + output
            # If not Deepseek, but it's an empty output and we had a first_token_sent flag (meaning stream started but was empty)
            # this implies the model might have produced only an EOS or similar.
            # The original logic for non-Deepseek models to prepend \n if output is non-empty and doesn't start with \n
            # is removed as the requirement is specific to Deepseek's <think>\n.
            # For other models, we rely on their natural output or formatter settings.

            self.send_message({
                "type": "complete", "requestId": request_id, "message": output,
                "usage": usage, "status": final_status, "time": int(time.time() * 1000)
            })
            self.report_memory()
        except Exception as e:
            print(f"Error processing request {request_id}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            self.send_message({"type": "error", "requestId": request_id, "error": str(e)})
        finally:
            self.inference_lock.release()
            if request_id in self.interrupt_flags: del self.interrupt_flags[request_id]

    def report_memory(self):
        """Report memory usage to parent process"""
        try:
            import psutil
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            self.send_message({"type": "memory", "data": {"rss": memory_info.rss, "heapTotal": 0, "heapUsed": 0, "external": 0, "time": int(time.time() * 1000)}})
        except ImportError:
            self.send_message({"type": "memory", "data": {"rss": 0, "heapTotal": 0, "heapUsed": 0, "external": 0, "time": int(time.time() * 1000)}})
        except Exception as e:
            print(f"Error reporting memory: {e}", file=sys.stderr)

    def send_message(self, message: Dict[str, Any]):
        """Send a message to the parent process"""
        try:
            json_message = json.dumps(message)
            print(json_message)
            sys.stdout.flush()
        except Exception as e:
            print(f"Error sending message: {e}", file=sys.stderr)

    def handle_message(self, message: Dict[str, Any]):
        """Handle a message from the parent process"""
        try:
            message_type = message.get("type")

            if message_type == "inference":
                request_id = message.get("requestId")
                prompt = message.get("prompt")
                parameters = message.get("parameters", {})
                if self.model and self.status == STATUS_READY:
                    if self.inference_lock.locked():
                         print(f"Request {request_id}: Inference lock already held. Rejecting request.", file=sys.stderr)
                         self.send_message({"type": "error", "requestId": request_id, "error": "Worker is busy processing another request."})
                    else:
                         thread = Thread(target=self.process_inference, args=(request_id, prompt, parameters))
                         thread.daemon = True
                         thread.start()
                elif self.status == STATUS_LOADING:
                     self.send_message({"type": "error", "requestId": request_id, "error": "Model is still loading, please wait."})
                else:
                     self.send_message({"type": "error", "requestId": request_id, "error": f"Worker not ready (status: {self.status})."})

            elif message_type == "ping":
                self.send_message({"type": "pong", "time": int(time.time() * 1000)})

            elif message_type == "memory":
                self.report_memory()

            elif message_type == "tokenize":
                request_id = message.get("requestId")
                text_to_tokenize = message.get("text")
                if self.model and self.status == STATUS_READY:
                    try:
                        tokens = self.model.tokenize(text_to_tokenize.encode('utf-8'))
                        token_count = len(tokens)
                        self.send_message({"type": "tokenize_result", "requestId": request_id, "token_count": token_count})
                    except Exception as tokenize_error:
                        print(f"Error during tokenization for request {request_id}: {tokenize_error}", file=sys.stderr)
                        self.send_message({"type": "error", "requestId": request_id, "error": f"Tokenization failed: {str(tokenize_error)}"})
                elif self.status == STATUS_LOADING:
                     self.send_message({"type": "error", "requestId": request_id, "error": "Model is still loading, cannot tokenize."})
                else:
                     self.send_message({"type": "error", "requestId": request_id, "error": f"Worker not ready (status: {self.status}), cannot tokenize."})

            elif message_type == "interrupt":
                request_id = message.get("requestId")
                if request_id:
                    print(f"Received interrupt request for {request_id}", file=sys.stderr)
                    self.interrupt_flags[request_id] = True
                else:
                    print("Error: Received interrupt message without requestId", file=sys.stderr)

        except Exception as e:
            print(f"Error handling message: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)

    def cleanup(self):
        """Explicitly release resources."""
        if self.model:
            try:
                del self.model
                self.model = None
            except Exception as e:
                print(f"Error during model cleanup: {e}", file=sys.stderr)

    def handle_shutdown_signal(self, signum, frame):
        """Handle termination signals gracefully."""
        if not self.shutdown_requested:
            self.shutdown_requested = True
            self.cleanup()
            sys.exit(0)

    def run(self):
        """Main execution loop"""
        signal.signal(signal.SIGINT, self.handle_shutdown_signal)
        signal.signal(signal.SIGTERM, self.handle_shutdown_signal)

        self.load_model()

        try:
            for line in sys.stdin:
                if self.shutdown_requested: break
                try:
                    message = json.loads(line.strip())
                    self.handle_message(message)
                except json.JSONDecodeError:
                    print(f"Invalid JSON message: {line}", file=sys.stderr)
                except Exception as e:
                    print(f"Error processing message: {e}", file=sys.stderr)
        except KeyboardInterrupt: pass
        except Exception as e:
            print(f"Unexpected error in run loop: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        finally:
            if not self.shutdown_requested: self.cleanup()

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Persistent Model Worker")
    parser.add_argument("--model", type=str, required=True, help="Path to the model file")
    parser.add_argument("--config", type=str, help="Path to the model configuration file")
    args = parser.parse_args()
    worker = PersistentModelWorker(args.model, args.config)
    worker.run()

if __name__ == "__main__":
    if len(sys.argv) == 1 and "MODEL_PATH" in os.environ:
        model_path = os.environ["MODEL_PATH"]
        config_path = os.environ.get("CONFIG_PATH", "")
        sys.argv.extend(["--model", model_path])
        if config_path: sys.argv.extend(["--config", config_path])
    main()
