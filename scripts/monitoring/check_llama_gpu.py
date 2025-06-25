#!/usr/bin/env python3
"""
Check if llama_cpp Python module can be loaded with CUDA support
"""

import os
import sys
import subprocess

def main():
    try:
        # Set environment variables for GPU
        os.environ["CUDA_VISIBLE_DEVICES"] = "0,1"
        os.environ["GGML_CUDA"] = "1"
        os.environ["GGML_CUDA_FORCE"] = "1"
        
        # Try to import llama_cpp
        import llama_cpp
        print(f"Found llama_cpp version {llama_cpp.__version__}", file=sys.stderr)
        
        # Get script directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(script_dir, "tinyllama-1.1b-chat-v1.0.Q2_K.gguf")
        
        # Check if model exists
        if not os.path.exists(model_path):
            print(f"Model not found at {model_path}", file=sys.stderr)
            sys.exit(1)
            
        # Check for multiple GPUs
        try:
            nvidia_smi_output = subprocess.check_output(['nvidia-smi', '--list-gpus']).decode('utf-8')
            gpu_count = len(nvidia_smi_output.strip().split('\n'))
            tensor_split = None
            
            if gpu_count > 1:
                # Create even split across GPUs
                tensor_split = [1.0/gpu_count] * gpu_count
                print(f"Detected {gpu_count} GPUs, configuring tensor_split={tensor_split}", file=sys.stderr)
        except Exception as e:
            print(f"Could not determine GPU count: {e}", file=sys.stderr)
            gpu_count = 1
            tensor_split = None
        
        # Try to initialize model with all GPU layers
        print(f"Initializing model {model_path} with GPU support...", file=sys.stderr)
        
        # Prepare model parameters
        model_params = {
            "model_path": model_path,
            "n_gpu_layers": -1,  # All layers
            "verbose": True,     # Show CUDA initialization messages
            "n_ctx": 2048,       # Smaller context for faster initialization
            "main_gpu": 0        # Main GPU device
        }
        
        # Add tensor_split for multi-GPU if available
        if tensor_split:
            model_params["tensor_split"] = tensor_split
        
        print(f"Model parameters: {model_params}", file=sys.stderr)
        model = llama_cpp.Llama(**model_params)
        
        # If we get here, it worked
        print("Successfully initialized llama_cpp with GPU support", file=sys.stderr)
        sys.exit(0)
        
    except ImportError as e:
        print(f"Error importing llama_cpp: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
