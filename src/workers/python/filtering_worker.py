#!/usr/bin/env python3
"""
Filtering Worker

Loads a spaCy model and performs NER detection on request.
Communicates via stdin/stdout JSON protocol.
Forces CPU execution.
"""

import json
import os
import signal
import sys
import time
import traceback
import threading
from typing import Dict, List, Any

# --- Environment Setup ---
# Force CPU execution if needed (spaCy usually respects this well)
os.environ['CUDA_VISIBLE_DEVICES'] = ''
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

# Status constants
STATUS_LOADING = "loading"
STATUS_READY = "ready"
STATUS_ERROR = "error"

# --- spaCy Model Loading ---
# Dictionary to hold loaded models, keyed by language code (e.g., 'en', 'de')
loaded_nlp_models: Dict[str, Any] = {}
loaded_nlp_models: Dict[str, Any] = {}
ALL_AVAILABLE_MODELS = {
    "en": "en_core_web_sm",
    "de": "de_core_news_sm",
    "fr": "fr_core_news_sm",
    "es": "es_core_news_sm",
}

def load_spacy_models(languages_to_load: List[str]):
    """Load the spaCy models specified in languages_to_load."""
    global loaded_nlp_models
    models_loaded_count = 0
    models_failed = []
    loaded_nlp_models = {} 

    if not languages_to_load:
        print("No languages specified to load.", file=sys.stderr)
        return False, []

    try:
        import spacy
        for lang_code in languages_to_load:
            model_name = ALL_AVAILABLE_MODELS.get(lang_code)
            if not model_name:
                print(f"WARNING: Unknown language code '{lang_code}' specified for loading.", file=sys.stderr)
                models_failed.append(f"{lang_code} (unknown)")
                continue

            print(f"Attempting to load spaCy model: {model_name} for language '{lang_code}' (CPU)...", file=sys.stderr)
            try:
                if not spacy.util.is_package(model_name):
                    print(f"Model '{model_name}' not found locally. Attempting download (best effort)...", file=sys.stderr)
                    try:
                        spacy.cli.download(model_name)
                        print(f"Model '{model_name}' downloaded.", file=sys.stderr)
                    except Exception as download_err:
                         print(f"WARNING: Failed to auto-download '{model_name}': {download_err}", file=sys.stderr)
                # Load the model
                nlp_instance = spacy.load(model_name, disable=["parser", "tagger"])
                loaded_nlp_models[lang_code] = nlp_instance
                print(f"spaCy model {model_name} for '{lang_code}' loaded successfully.", file=sys.stderr)
                models_loaded_count += 1
            except Exception as load_err:
                 print(f"ERROR: Failed to load spaCy model {model_name} for '{lang_code}': {load_err}", file=sys.stderr)
                 models_failed.append(model_name)

        return models_loaded_count > 0, models_failed 

    except ImportError:
        print("Error: spaCy library not found. Please install it (`pip install spacy`).", file=sys.stderr)
        return False, list(MODELS_TO_LOAD.values()) 
    except Exception as e:
        print(f"Unexpected error during spaCy model loading: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False, list(MODELS_TO_LOAD.values())

class FilteringWorker:
    """
    Worker class for NER-based filtering using spaCy.
    """
    def __init__(self):
        self.status = STATUS_LOADING
        self.start_time = time.time()
        self.shutdown_requested = False
        self.processing_lock = threading.Lock() 
        self.active_languages = [] 

    def initialize_models(self, languages_to_load: List[str]):
        """Initialize the specified spaCy models."""
        self.active_languages = languages_to_load
        success, failed_models = load_spacy_models(languages_to_load)
        if success:
            self.status = STATUS_READY
            load_time = int((time.time() - self.start_time) * 1000)
            loaded_model_names = [MODELS_TO_LOAD[lc] for lc in loaded_nlp_models.keys()]
            self.send_message({
                "type": "ready",
                "time": int(time.time() * 1000),
                "modelInfo": {
                    "loaded": loaded_model_names,
                    "failed": failed_models,
                    "type": "spacy_ner_multi"
                 }
            })
            print(f"Filtering worker ready ({len(loaded_model_names)} models loaded) in {load_time}ms.", file=sys.stderr)
            if failed_models:
                 print(f"WARNING: Failed to load models: {', '.join(failed_models)}", file=sys.stderr)
            return True
        else:
            self.status = STATUS_ERROR
            error_msg = f"Failed to load any spaCy models. Failed: {', '.join(failed_models)}"
            self.send_message({"type": "error", "error": error_msg})
            sys.exit(1) 

    def process_ner_request(self, request_id: str, text: str, entity_types: List[str], language: str):
        """Detect specified NER entity types in the text for a given language."""
        if not self.processing_lock.acquire(blocking=False):
            self.send_message({"type": "error", "requestId": request_id, "error": "Worker is busy."})
            return

        # Default to 'en' if language not provided or invalid
        lang_code = language if language in loaded_nlp_models else 'en'
        nlp_model = loaded_nlp_models.get(lang_code)

        try:
            if not nlp_model or self.status != STATUS_READY:
                 # Attempt to load the specific language model if it failed initially but exists now
                 if lang_code not in loaded_nlp_models:
                     print(f"Attempting lazy load for language '{lang_code}'...", file=sys.stderr)
                     success, _ = load_spacy_models() 
                     nlp_model = loaded_nlp_models.get(lang_code) 

                 if not nlp_model:
                     raise Exception(f"spaCy model for language '{lang_code}' not ready (status: {self.status})")

            if not isinstance(text, str):
                raise ValueError("'text' must be a string.")
            if not isinstance(entity_types, list):
                 raise ValueError("'entity_types' must be a list of strings.")

            doc = nlp_model(text)
            found_entities = []
            target_entities = set(et.upper() for et in entity_types) 

            for ent in doc.ents:
                if ent.label_ in target_entities:
                    found_entities.append({
                        "text": ent.text,
                        "label": ent.label_,
                        "start_char": ent.start_char,
                        "end_char": ent.end_char
                    })

            self.send_message({
                "type": "ner_result",
                "requestId": request_id,
                "entities": found_entities
            })
        except Exception as e:
            print(f"Error during NER processing for request {request_id}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            self.send_message({
                "type": "error",
                "requestId": request_id,
                "error": f"NER processing failed: {str(e)}"
            })
        finally:
            self.processing_lock.release()

    def send_message(self, message: Dict[str, Any]):
        """Send a message to the parent process."""
        try:
            json_message = json.dumps(message)
            print(json_message)
            sys.stdout.flush()
        except Exception as e:
            print(f"Error sending message: {e}", file=sys.stderr)

    def handle_message(self, message: Dict[str, Any]):
        """Handle incoming messages."""
        try:
            message_type = message.get("type")

            if message_type == "config": 
                langs = message.get("active_languages", ["en"])
                if not self.initialize_models(langs):
                    print("Worker initialization failed after config.", file=sys.stderr)
                    self.shutdown_requested = True 

            elif message_type == "ner_detect":
                request_id = message.get("requestId")
                text_to_process = message.get("text")
                entities_to_find = message.get("entities", []) 
                language_code = message.get("language", "en") 

                if self.status == STATUS_READY:
                     if language_code in loaded_nlp_models:
                         self.process_ner_request(request_id, text_to_process, entities_to_find, language_code)
                     else:
                         self.send_message({"type": "error", "requestId": request_id, "error": f"Language model '{language_code}' not loaded or inactive."})
                else:
                     self.send_message({"type": "error", "requestId": request_id, "error": f"Worker not ready (status: {self.status})."})

            elif message_type == "ping":
                self.send_message({"type": "pong", "time": int(time.time() * 1000)})

        except Exception as e:
            print(f"Error handling message: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)

    def cleanup(self):
        """Clean up resources."""
        global loaded_nlp_models
        if loaded_nlp_models:
            try:
                loaded_nlp_models = {}
                print("spaCy model resources released (dictionary cleared).", file=sys.stderr)
            except Exception as e:
                print(f"Error during spaCy model cleanup: {e}", file=sys.stderr)

    def handle_shutdown_signal(self, signum, frame):
        """Handle termination signals."""
        if not self.shutdown_requested:
            print(f"Received signal {signum}, shutting down filtering worker...", file=sys.stderr)
            self.shutdown_requested = True
            self.cleanup()
            sys.exit(0)

    def run(self):
        """Main execution loop."""
        signal.signal(signal.SIGINT, self.handle_shutdown_signal)
        signal.signal(signal.SIGTERM, self.handle_shutdown_signal)

        print("Filtering worker started. Waiting for config message...", file=sys.stderr)

        try:
            for line in sys.stdin:
                if self.shutdown_requested:
                    break
                try:
                    message = json.loads(line.strip())
                    self.handle_message(message)
                except json.JSONDecodeError:
                    print(f"Invalid JSON message: {line}", file=sys.stderr)
                except Exception as e:
                    print(f"Error processing message: {e}", file=sys.stderr)
        except KeyboardInterrupt:
            print("KeyboardInterrupt received.", file=sys.stderr)
        except Exception as e:
            print(f"Unexpected error in run loop: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
        finally:
            if not self.shutdown_requested:
                self.cleanup()

def main():
    """Main entry point."""
    # No arguments needed for now, model is hardcoded
    worker = FilteringWorker()
    worker.run()

if __name__ == "__main__":
    main()
