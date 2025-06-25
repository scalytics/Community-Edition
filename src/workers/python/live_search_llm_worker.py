#!/usr/bin/env python3
"""
Live Search LLM Worker

Handles the Reasoning and Synthesis steps of the Live Search process
using litellm to call external LLMs.
Communicates via stdin/stdout JSON protocol.
"""

import os
os.environ['LITELLM_DISABLE_TELEMETRY'] = '1'

import argparse
import json
import signal
import sys
import time
import traceback
import threading
import asyncio
import litellm
litellm.suppress_debug_info = True 
import logging
import contextlib
from typing import Dict, List, Optional, Union, Any

try:
    litellm_logger = logging.getLogger("litellm")
    litellm_logger.setLevel(logging.ERROR) 
    print("Configured litellm logger level to ERROR.", file=sys.stderr) 
except Exception as log_err:
     print(f"Warning: Could not configure litellm logger - {log_err}", file=sys.stderr) 

os.environ['TOKENIZERS_PARALLELISM'] = 'false'

STATUS_READY = "ready"
STATUS_ERROR = "error"

class DeepSearchLLMWorker:
    """
    Worker class for handling LLM calls via litellm for Live Search.
    """
    def __init__(self):
        self.status = STATUS_READY 
        self.start_time = time.time()
        self.shutdown_requested = False
        self.processing_lock = threading.Lock() 

    def send_message(self, message: Dict[str, Any]):
        """Send a message to the parent process via stdout."""
        try:
            json_message = json.dumps(message)
            sys.stdout.write(json_message + '\n')
            sys.stdout.flush()
        except Exception as e:
            print(f"Error sending message: {e}", file=sys.stderr)

    async def handle_message_async(self, message: Dict[str, Any]):
         """Asynchronous handler for messages."""
         try:
             message_type = message.get("type")

             if message_type == "reasoning_step":
                 if self.status == STATUS_READY:
                     await self.process_reasoning_request(
                         message.get("requestId"),
                         message.get("prompt"),
                         message.get("modelInfo"),
                         message.get("apiConfig")
                     )
                 else:
                     self.send_message({"type": "error", "requestId": message.get("requestId"), "error": f"Worker not ready (status: {self.status})."})
             elif message_type == "synthesis_step":
                 if self.status == STATUS_READY:
                     await self.process_synthesis_request(
                         message.get("requestId"),
                         message.get("prompt"),
                         message.get("modelInfo"),
                         message.get("apiConfig")
                     )
                 else:
                     self.send_message({"type": "error", "requestId": message.get("requestId"), "error": f"Worker not ready (status: {self.status})."})
             elif message_type == "summarize_text": 
                 if self.status == STATUS_READY:
                     await self.process_summarize_request(
                         message.get("requestId"),
                         message.get("text"),
                         message.get("modelInfo"),
                         message.get("apiConfig")
                     )
                 else:
                     self.send_message({"type": "error", "requestId": message.get("requestId"), "error": f"Worker not ready (status: {self.status})."})
             elif message_type == "ping":
                 self.send_message({"type": "pong", "time": int(time.time() * 1000)})

         except Exception as e:
             print(f"Error handling message async: {e}", file=sys.stderr)
             traceback.print_exc(file=sys.stderr)
             request_id = message.get("requestId")
             if request_id:
                  self.send_message({
                       "type": "error",
                       "requestId": request_id,
                       "error": f"Internal worker error handling message type '{message.get('type')}': {str(e)}"
                  })

    def cleanup(self):
        """Clean up resources (if any needed in the future)."""
        print("Live Search LLM worker cleaning up.", file=sys.stderr)

    def handle_shutdown_signal(self, signum, frame):
        """Handle termination signals."""
        if not self.shutdown_requested:
            print(f"Received signal {signum}, shutting down Live Search LLM worker...", file=sys.stderr)
            self.shutdown_requested = True
            try:
                loop = asyncio.get_running_loop()
                loop.stop()
            except RuntimeError: 
                pass
            self.cleanup()
            sys.exit(0)

    def run(self):
        """Main execution loop."""
        signal.signal(signal.SIGINT, self.handle_shutdown_signal)
        signal.signal(signal.SIGTERM, self.handle_shutdown_signal)

        self.send_message({
            "type": "ready",
            "time": int(time.time() * 1000),
            "workerType": "DeepSearchLLM" 
        })
        print("Live Search LLM worker ready.", file=sys.stderr)
        print("Live Search LLM worker entering main loop...", file=sys.stderr)
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            async def read_stdin():
                reader = asyncio.StreamReader()
                protocol = asyncio.StreamReaderProtocol(reader)
                await loop.connect_read_pipe(lambda: protocol, sys.stdin)

                while not self.shutdown_requested:
                    line_bytes = await reader.readline()
                    if not line_bytes: 
                        break
                    line = line_bytes.decode('utf-8').strip()
                    if line:
                        try:
                            message = json.loads(line)
                            loop.create_task(self.handle_message_async(message))
                        except json.JSONDecodeError:
                            print(f"Invalid JSON message: {line}", file=sys.stderr)
                        except Exception as e:
                            print(f"Error processing message line: {e}", file=sys.stderr)
                    await asyncio.sleep(0)

            loop.run_until_complete(read_stdin())

        except KeyboardInterrupt:
            print("KeyboardInterrupt received.", file=sys.stderr)
        except Exception as e:
            print(f"Unexpected error in run loop: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        finally:
            if not self.shutdown_requested:
                self.cleanup()
            if 'loop' in locals() and loop.is_running():
                loop.close()
            print("Live Search LLM worker finished.", file=sys.stderr)


    async def process_reasoning_request(self, request_id: str, prompt: str, model_info: Dict, api_config: Dict):
        """Handle reasoning step LLM call using litellm."""
        with self.processing_lock:
            try:
                if not prompt or not model_info:
                    raise ValueError("Prompt and modelInfo are required for reasoning step.")

                model_name = model_info.get('external_model_id') or model_info.get('name')
                if not model_name:
                    raise ValueError("Could not determine model name/ID from modelInfo.")

                provider_name = model_info.get('provider_name', '').lower()
                api_base_url = api_config.get("apiBase")
                api_key = api_config.get("apiKey")

                model_arg_for_litellm = model_name 
                if provider_name == 'google':
                    if not model_name.startswith('gemini/'):
                        model_arg_for_litellm = f"gemini/{model_name}"
                elif provider_name == 'mistral':
                     if not model_name.startswith('mistral/'):
                          model_arg_for_litellm = f"mistral/{model_name}"
                
                print(f"Performing reasoning step for request {request_id} using model: {model_arg_for_litellm}", file=sys.stderr)

                litellm_args = {
                    "model": model_arg_for_litellm,
                    "messages": [{"role": "user", "content": prompt}],
                    "api_key": api_key,
                    "temperature": 0.5, 
                }

                if provider_name != 'google' and api_base_url:
                    litellm_args["api_base"] = api_base_url
                    print(f"Using api_base: {api_base_url}", file=sys.stderr)
                elif provider_name == 'google':
                     print("Provider is Google, omitting api_base for litellm standard endpoint.", file=sys.stderr)

                litellm_args = {k: v for k, v in litellm_args.items() if v is not None}
                output = None
                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        response = await litellm.acompletion(**litellm_args)
                    if response and response.choices and len(response.choices) > 0 and response.choices[0].message:
                         output = response.choices[0].message.content
                    else:
                         print(f"Warning: Unexpected litellm response structure for request {request_id}. Response: {response}", file=sys.stderr)
                         raise ValueError("Received unexpected response structure from litellm.")

                    if model_info.get('model_family') == 'Deepseek' and output and isinstance(output, str) and not output.startswith('<think>\n'):
                        output = '<think>\n' + output

                except Exception as llm_call_err:
                     print(f"Error during litellm.acompletion call for request {request_id}: {llm_call_err}", file=sys.stderr)
                     raise 

                if output is None:
                    raise ValueError("LLM response content was empty or could not be extracted.")

                usage_data = getattr(response, 'usage', None)
                prompt_tokens = getattr(usage_data, 'prompt_tokens', 0) if usage_data else 0
                completion_tokens = getattr(usage_data, 'completion_tokens', 0) if usage_data else 0
                total_tokens = getattr(usage_data, 'total_tokens', 0) if usage_data else (prompt_tokens + completion_tokens) 

                self.send_message({
                    "type": "reasoning_result",
                    "requestId": request_id,
                    "success": True,
                    "output": output,
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens
                    }
                })
                print(f"Reasoning step completed for request {request_id}. Usage: {prompt_tokens}/{completion_tokens}", file=sys.stderr)

            except Exception as e:
                error_message_detail = f"{type(e).__name__}: {str(e)}"
                print(f"Error during reasoning step for request {request_id}: {error_message_detail}", file=sys.stderr)
                # traceback.print_exc(file=sys.stderr) # Keep this commented unless deep debugging specific worker issue
                self.send_message({
                    "type": "reasoning_result",
                    "requestId": request_id,
                    "success": False,
                    "error": f"Reasoning step failed: {error_message_detail}"
                })

    async def process_synthesis_request(self, request_id: str, prompt: str, model_info: Dict, api_config: Dict):
        """Handle synthesis step LLM call using litellm."""
        with self.processing_lock:
            try:
                if not prompt or not model_info:
                    raise ValueError("Prompt and modelInfo are required for synthesis step.")

                model_name = model_info.get('external_model_id') or model_info.get('name')
                if not model_name:
                    raise ValueError("Could not determine model name/ID from modelInfo.")

                provider_name = model_info.get('provider_name', '').lower()
                api_base_url = api_config.get("apiBase")
                api_key = api_config.get("apiKey")

                model_arg_for_litellm = model_name 
                if provider_name == 'google':
                    if not model_name.startswith('gemini/'):
                        model_arg_for_litellm = f"gemini/{model_name}"
                elif provider_name == 'mistral':
                     if not model_name.startswith('mistral/'):
                          model_arg_for_litellm = f"mistral/{model_name}"

                print(f"Performing synthesis step for request {request_id} using model: {model_arg_for_litellm}", file=sys.stderr)

                litellm_args = {
                    "model": model_arg_for_litellm,
                    "messages": [{"role": "user", "content": prompt}],
                    "api_key": api_key,
                    "temperature": 0.5, 
                }

                if provider_name != 'google' and api_base_url:
                    litellm_args["api_base"] = api_base_url
                    print(f"Using api_base: {api_base_url}", file=sys.stderr)
                elif provider_name == 'google':
                     print("Provider is Google, omitting api_base for litellm standard endpoint.", file=sys.stderr)

                litellm_args = {k: v for k, v in litellm_args.items() if v is not None}
                output = None
                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        response = await litellm.acompletion(**litellm_args)
                    if response and response.choices and len(response.choices) > 0 and response.choices[0].message:
                         output = response.choices[0].message.content
                    else:
                         print(f"Warning: Unexpected litellm response structure for request {request_id}. Response: {response}", file=sys.stderr)
                         raise ValueError("Received unexpected response structure from litellm.")

                    if model_info.get('model_family') == 'Deepseek' and output and isinstance(output, str) and not output.startswith('<think>\n'):
                        output = '<think>\n' + output

                except Exception as llm_call_err:
                     print(f"Error during litellm.acompletion call for request {request_id}: {llm_call_err}", file=sys.stderr)
                     raise 

                if output is None:
                    raise ValueError("LLM response content was empty or could not be extracted.")

                usage_data = getattr(response, 'usage', None)
                prompt_tokens = getattr(usage_data, 'prompt_tokens', 0) if usage_data else 0
                completion_tokens = getattr(usage_data, 'completion_tokens', 0) if usage_data else 0
                total_tokens = getattr(usage_data, 'total_tokens', 0) if usage_data else (prompt_tokens + completion_tokens) 

                self.send_message({
                    "type": "synthesis_result",
                    "requestId": request_id,
                    "success": True,
                    "output": output,
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens
                    }
                })
                print(f"Synthesis step completed for request {request_id}. Usage: {prompt_tokens}/{completion_tokens}", file=sys.stderr)

            except Exception as e:
                error_message_detail = f"{type(e).__name__}: {str(e)}"
                print(f"Error during synthesis step for request {request_id}: {error_message_detail}", file=sys.stderr)
                # traceback.print_exc(file=sys.stderr)
                self.send_message({
                    "type": "synthesis_result",
                    "requestId": request_id,
                    "success": False,
                    "error": f"Synthesis step failed: {error_message_detail}"
                })

    async def process_summarize_request(self, request_id: str, text_to_summarize: str, model_info: Dict, api_config: Dict):
        """Handle summarization LLM call using litellm."""
        with self.processing_lock:
            try:
                if not text_to_summarize or not model_info:
                    raise ValueError("Text and modelInfo are required for summarization step.")

                max_summary_input_length = 10000 
                if len(text_to_summarize) > max_summary_input_length:
                    print(f"Warning: Truncating text for summarization (request {request_id}). Original length: {len(text_to_summarize)}", file=sys.stderr)
                    text_to_summarize = text_to_summarize[:max_summary_input_length] + "\n[... text truncated ...]"


                model_name = model_info.get('external_model_id') or model_info.get('name')
                if not model_name:
                    raise ValueError("Could not determine model name/ID from modelInfo.")

                provider_name = model_info.get('provider_name', '').lower()
                api_base_url = api_config.get("apiBase")
                api_key = api_config.get("apiKey")

                model_arg_for_litellm = model_name
                if provider_name == 'google' and not model_name.startswith('gemini/'):
                    model_arg_for_litellm = f"gemini/{model_name}"
                elif provider_name == 'mistral' and not model_name.startswith('mistral/'):
                    model_arg_for_litellm = f"mistral/{model_name}"

                print(f"Performing summarization for request {request_id} using model: {model_arg_for_litellm}", file=sys.stderr)

                prompt = f"Provide a concise summary of the following text:\n\n---\n{text_to_summarize}\n---\n\nSummary:"

                litellm_args = {
                    "model": model_arg_for_litellm,
                    "messages": [{"role": "user", "content": prompt}],
                    "api_key": api_key,
                    "temperature": 0.5,
                }

                if provider_name != 'google' and api_base_url:
                    litellm_args["api_base"] = api_base_url
                elif provider_name == 'google':
                     pass 

                litellm_args = {k: v for k, v in litellm_args.items() if v is not None}

                output = None
                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        response = await litellm.acompletion(**litellm_args)
                    if response and response.choices and len(response.choices) > 0 and response.choices[0].message:
                         output = response.choices[0].message.content
                    else:
                         print(f"Warning: Unexpected litellm response structure for summarization request {request_id}. Response: {response}", file=sys.stderr)
                         raise ValueError("Received unexpected response structure from litellm during summarization.")

                    if model_info.get('model_family') == 'Deepseek' and output and isinstance(output, str) and not output.startswith('<think>\n'):
                        output = '<think>\n' + output

                except Exception as llm_call_err:
                     print(f"Error during litellm.acompletion call for summarization request {request_id}: {llm_call_err}", file=sys.stderr)
                     raise

                if output is None:
                    raise ValueError("LLM summarization response content was empty or could not be extracted.")

                usage_data = getattr(response, 'usage', None)
                prompt_tokens = getattr(usage_data, 'prompt_tokens', 0) if usage_data else 0
                completion_tokens = getattr(usage_data, 'completion_tokens', 0) if usage_data else 0
                total_tokens = getattr(usage_data, 'total_tokens', 0) if usage_data else (prompt_tokens + completion_tokens)

                self.send_message({
                    "type": "summarize_result",
                    "requestId": request_id,
                    "success": True,
                    "summary": output.strip(), 
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": completion_tokens,
                        "total_tokens": total_tokens
                    }
                })
                print(f"Summarization completed for request {request_id}. Usage: {prompt_tokens}/{completion_tokens}", file=sys.stderr)

            except Exception as e:
                error_message_detail = f"{type(e).__name__}: {str(e)}"
                print(f"Error during summarization step for request {request_id}: {error_message_detail}", file=sys.stderr)
                # traceback.print_exc(file=sys.stderr)
                self.send_message({
                    "type": "summarize_result",
                    "requestId": request_id,
                    "success": False,
                    "error": f"Summarization step failed: {error_message_detail}"
                })

def main():
    """Main entry point."""
    worker = DeepSearchLLMWorker()
    worker.run()

if __name__ == "__main__":
    main()
