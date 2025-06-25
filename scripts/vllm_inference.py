#!/usr/bin/env python3
"""
vllm_inference.py - Use vLLM as a Python library for local inference

This script uses vLLM directly as a library for offline batched inference,
avoiding the broken API server on Apple Silicon.

Usage:
  python vllm_inference.py --model /path/to/model --prompt "Your prompt" [options]
"""

import argparse
import json
import os
import sys
import platform

def parse_arguments():
    parser = argparse.ArgumentParser(description="Run vLLM inference")
    
    parser.add_argument("--model", type=str, required=True, help="Path to the model directory")
    parser.add_argument("--prompt", type=str, required=True, help="Input prompt")
    parser.add_argument("--max-tokens", type=int, default=512, help="Maximum tokens to generate")
    parser.add_argument("--temperature", type=float, default=0.7, help="Sampling temperature")
    parser.add_argument("--top-p", type=float, default=0.9, help="Top-p sampling")
    parser.add_argument("--max-model-len", type=int, help="Maximum model context length")
    
    return parser.parse_args()

def is_apple_silicon():
    """Check if running on Apple Silicon."""
    return platform.system() == "Darwin" and platform.machine() == "arm64"

def run_vllm_inference(args):
    """Run vLLM inference using the library directly."""
    try:
        from vllm import LLM, SamplingParams
        
        # Configure vLLM for Apple Silicon
        llm_kwargs = {
            "model": args.model,
            "trust_remote_code": False,
            "max_model_len": args.max_model_len,
        }
        
        # Apple Silicon specific settings
        if is_apple_silicon():
            llm_kwargs.update({
                "device": "cpu",
                "enforce_eager": True,
                "disable_custom_all_reduce": True,
            })
        
        print(json.dumps({
            "status": "loading_model",
            "model": args.model,
            "apple_silicon": is_apple_silicon(),
            "max_model_len": args.max_model_len
        }))
        
        # Initialize vLLM
        llm = LLM(**llm_kwargs)
        
        print(json.dumps({
            "status": "model_loaded",
            "success": True
        }))
        
        # Configure sampling
        sampling_params = SamplingParams(
            temperature=args.temperature,
            top_p=args.top_p,
            max_tokens=args.max_tokens
        )
        
        # Generate response
        outputs = llm.generate([args.prompt], sampling_params)
        
        # Extract generated text
        generated_text = outputs[0].outputs[0].text.strip()
        
        result = {
            "success": True,
            "prompt": args.prompt,
            "generated_text": generated_text,
            "finish_reason": outputs[0].outputs[0].finish_reason,
            "tokens_generated": len(outputs[0].outputs[0].token_ids)
        }
        
        print(json.dumps(result))
        return 0
        
    except ImportError as e:
        error_msg = {
            "error": f"vLLM import failed: {str(e)}",
            "success": False
        }
        print(json.dumps(error_msg))
        return 1
    
    except Exception as e:
        error_msg = {
            "error": f"vLLM inference failed: {str(e)}",
            "success": False
        }
        print(json.dumps(error_msg))
        return 1

def main():
    """Main function."""
    args = parse_arguments()
    
    # Check if model path exists
    if not os.path.isdir(args.model):
        error_msg = {
            "error": f"Model path not found: {args.model}",
            "success": False
        }
        print(json.dumps(error_msg))
        return 1
    
    return run_vllm_inference(args)

if __name__ == "__main__":
    sys.exit(main())
