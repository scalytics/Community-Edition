#!/usr/bin/env python3
"""
Standalone test script for llama-cpp-python streaming.
"""
import sys
import os
import time

# --- Configuration ---
# !!! IMPORTANT: Set the correct model path before running !!!
MODEL_PATH = "/var/www/connect/models/Llama-3-8B-Instruct-32k-v0.1-GGUF/Llama-3-8B-Instruct-32k-v0.1.Q6_K.gguf"
# MODEL_PATH = "/var/www/connect/models/Mistral-Small-3.1-24B-Instruct-2503-GGUF/mistralai_Mistral-Small-3.1-24B-Instruct-2503-GGUF.Q4_K_M.gguf" # Example for other model

N_GPU_LAYERS = -1  # -1 for full offload, 0 for CPU
N_CTX = 4096       # Context size
VERBOSE_LLAMA = True # Enable llama.cpp internal logging

TEST_PROMPT = "Human: Write a short story about a brave knight.\n\nAssistant:"
MAX_TOKENS = 150

# --- Script Logic ---
def run_test():
    if not os.path.exists(MODEL_PATH):
        print(f"Error: Model file not found at {MODEL_PATH}", file=sys.stderr)
        print("Please edit MODEL_PATH in this script.", file=sys.stderr)
        sys.exit(1)

    try:
        from llama_cpp import Llama
    except ImportError:
        print("Error: llama-cpp-python not found.", file=sys.stderr)
        print("Please ensure you are running this script within the correct virtual environment.", file=sys.stderr)
        print("Try: source /var/www/connect/venv/bin/activate", file=sys.stderr)
        sys.exit(1)

    print(f"Attempting to load model: {MODEL_PATH}", file=sys.stderr)
    print(f"Parameters: n_gpu_layers={N_GPU_LAYERS}, n_ctx={N_CTX}, verbose={VERBOSE_LLAMA}", file=sys.stderr)
    print(f"Using CUDA_VISIBLE_DEVICES='{os.environ.get('CUDA_VISIBLE_DEVICES', 'Not Set')}'", file=sys.stderr)

    try:
        start_load = time.time()
        llm = Llama(
            model_path=MODEL_PATH,
            n_gpu_layers=N_GPU_LAYERS,
            n_ctx=N_CTX,
            verbose=VERBOSE_LLAMA,
            seed=42
        )
        load_time = time.time() - start_load
        print(f"\n--- Model loaded successfully in {load_time:.2f} seconds ---", file=sys.stderr)

    except Exception as e:
        print(f"\n--- Error loading model ---", file=sys.stderr)
        print(f"{e}", file=sys.stderr)
        sys.exit(1)

    print(f"\n--- Starting streaming inference (max_tokens={MAX_TOKENS}) ---", file=sys.stderr)
    print(f"Prompt: {TEST_PROMPT}\n", file=sys.stderr)
    print("--- Output Stream ---") # Header for stdout

    try:
        start_stream = time.time()
        token_count = 0
        output_stream = llm(
            TEST_PROMPT,
            max_tokens=MAX_TOKENS,
            stream=True,
            temperature=0.7,
            stop=["Human:", "\n\n"] # Example stop sequences
        )

        for output_chunk in output_stream:
            token = output_chunk["choices"][0]["text"]
            print(token, end='', flush=True) # Print token directly to stdout
            token_count += 1

        stream_time = time.time() - start_stream
        print("\n--- Stream finished ---") # Footer for stdout
        print(f"\n--- Streaming completed successfully ---", file=sys.stderr)
        print(f"Generated {token_count} tokens in {stream_time:.2f} seconds.", file=sys.stderr)

    except Exception as e:
        print(f"\n--- Error during streaming inference ---", file=sys.stderr)
        print(f"{e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    run_test()
