#!/usr/bin/env python3
"""
run_model.py - Script to run local AI models using Hugging Face Transformers

This script loads and runs local AI models in PyTorch/SafeTensor format,
handling the input prompt and returning the generated text. It is designed
to be called from the main Node.js application.

Usage:
  python run_model.py --model /path/to/model_dir --prompt "Your prompt here" [options]
"""

import argparse
import json
import os
import sys
import time
import traceback

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

def parse_arguments():
    parser = argparse.ArgumentParser(description="Run a local AI model with Transformers")
    
    parser.add_argument("--model", type=str, required=True, help="Path to the model directory")
    parser.add_argument("--prompt", type=str, required=True, help="Text prompt for the model")
    parser.add_argument("--temperature", type=float, default=0.7, help="Temperature for generation (0.0-1.0)")
    parser.add_argument("--max_tokens", type=int, default=1024, help="Maximum new tokens to generate")
    parser.add_argument("--max_model_len", type=int, help="Maximum model context length (for compatibility)")
    parser.add_argument("--repetition_penalty", type=float, default=1.1, help="Repetition penalty (>1.0)")
    parser.add_argument("--top_p", type=float, default=0.9, help="Top-p sampling parameter (0.0-1.0)")
    parser.add_argument("--top_k", type=int, default=40, help="Top-k sampling parameter (1-100)")
    
    return parser.parse_args()

def run_huggingface_model(model_path, prompt, temp, max_tokens, rep_penalty, top_p, top_k):
    """Run a model using Hugging Face Transformers."""
    try:
        # Load tokenizer and model
        # Using device_map="auto" will automatically use GPU if available
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            torch_dtype=torch.float16,
            device_map="auto"
        )
        
        # Tokenize input
        input_ids = tokenizer.encode(prompt, return_tensors="pt").to(model.device)
        
        # Generate
        with torch.no_grad():
            output = model.generate(
                input_ids,
                max_new_tokens=max_tokens,
                temperature=temp,
                top_p=top_p,
                top_k=top_k,
                repetition_penalty=rep_penalty,
                do_sample=temp > 0,
                pad_token_id=tokenizer.eos_token_id
            )
        
        # Decode and return only the newly generated text
        generated_text = tokenizer.decode(output[0][len(input_ids[0]):], skip_special_tokens=True)
        return generated_text.strip()
        
    except Exception as e:
        return json.dumps({
            "error": f"Error running Hugging Face model: {str(e)}",
            "traceback": traceback.format_exc()
        })

def main():
    """Main function to run the model with the given arguments."""
    args = parse_arguments()
    
    try:
        model_path = args.model
        
        if not os.path.isdir(model_path):
            return json.dumps({
                "error": f"Model path not found or is not a directory: {model_path}"
            })
        
        start_time = time.time()
        
        result = run_huggingface_model(
            model_path, 
            args.prompt, 
            args.temperature, 
            args.max_tokens, 
            args.repetition_penalty,
            args.top_p,
            args.top_k
        )
        
        end_time = time.time()
        
        # Check if the result is an error JSON
        try:
            # If it's a JSON string and has an 'error' key, it's an error from the runner
            error_check = json.loads(result)
            if 'error' in error_check:
                return result
        except (json.JSONDecodeError, TypeError):
            # Not a JSON string, so it's a valid text result
            pass

        return json.dumps({
            "message": result,
            "model": os.path.basename(model_path),
            "tokens_generated": len(result.split()),
            "generation_time": end_time - start_time
        })
        
    except Exception as e:
        # Catch any unhandled exceptions and return as JSON error
        return json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        })

if __name__ == "__main__":
    output = main()
    print(output)
