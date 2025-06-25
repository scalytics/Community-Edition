#!/usr/bin/env python3
"""
start_vllm.py - Start vLLM API server with proper configuration

This script starts a vLLM API server with the specified model and configuration.
"""

import argparse
import json
import os
import sys
import subprocess

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Start vLLM API server")
    
    parser.add_argument("--model", type=str, required=True, help="Path to the model directory")
    parser.add_argument("--port", type=int, default=8003, help="Port to run the server on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--max-model-len", type=int, help="Maximum model context length")
    parser.add_argument("--tensor-parallel-size", type=int, default=1, help="Tensor parallel size")
    parser.add_argument("--dtype", type=str, default="auto", help="Model data type")
    parser.add_argument("--quantization", type=str, default="none", help="Quantization method")
    parser.add_argument("--served-model-name", type=str, help="Name of the model to be served")
    
    # Performance optimization arguments
    parser.add_argument("--gpu-memory-utilization", type=float, default=0.95, help="GPU memory utilization fraction")
    parser.add_argument("--max-num-batched-tokens", type=int, help="Maximum number of batched tokens")
    parser.add_argument("--enable-prefix-caching", action="store_true", help="Enable prefix caching (disabled by default)")
    parser.add_argument("--block-size", type=int, default=16, help="Token block size for memory management")
    parser.add_argument("--swap-space", type=int, default=4, help="CPU swap space in GiB")
    parser.add_argument("--disable-custom-all-reduce", action="store_true", help="Disable custom all-reduce for multi-GPU")
    
    # vLLM 0.9.1+ Optimizations
    parser.add_argument("--enforce-eager", action="store_true", help="Always use eager-mode PyTorch. Disables CUDA graph.")
    parser.add_argument("--use-v2-block-manager", action="store_true", help="Use BlockManagerV2 (default in 0.9.1+).")
    parser.add_argument("--max-num-seqs", type=int, help="Maximum number of simultaneous sequences.")
    parser.add_argument("--max-num-prefill-tokens", type=int, help="Maximum number of prefill tokens.")
    parser.add_argument("--serializer-workers", type=int, help="Number of off-thread JSON serializer workers.")
    parser.add_argument("--download-dir", type=str, help="Directory to cache HuggingFace model downloads.")
    parser.add_argument("--trust-remote-code", action="store_true", help="Trust remote code for models with custom layers.")
    
    return parser.parse_args()

def build_vllm_command(args):
    """Build the vLLM command line arguments."""
    cmd = [
        sys.executable, "-m", "vllm.entrypoints.openai.api_server",
        "--model", args.model,
        "--host", args.host,
        "--port", str(args.port),
        "--tensor-parallel-size", str(args.tensor_parallel_size),
        "--disable-log-stats",
        "--disable-log-requests"
    ]
    
    # Basic model configuration
    if args.max_model_len:
        cmd.extend(["--max-model-len", str(args.max_model_len)])
        
    if args.dtype and args.dtype != 'auto':
        cmd.extend(["--dtype", args.dtype])
        
    if args.quantization and args.quantization != 'none':
        cmd.extend(["--quantization", args.quantization])
        
    if args.served_model_name:
        cmd.extend(["--served-model-name", args.served_model_name])
    
    # Performance optimizations
    cmd.extend(["--gpu-memory-utilization", str(args.gpu_memory_utilization)])
    
    if args.max_num_batched_tokens:
        cmd.extend(["--max-num-batched-tokens", str(args.max_num_batched_tokens)])
    
    if args.enable_prefix_caching:
        cmd.append("--enable-prefix-caching")
    
    cmd.extend(["--block-size", str(args.block_size)])
    cmd.extend(["--swap-space", str(args.swap_space)])
    
    if args.disable_custom_all_reduce:
        cmd.append("--disable-custom-all-reduce")
        
    # Add vLLM 0.9.1+ optimizations
    if args.enforce_eager:
        cmd.append("--enforce-eager")
    # V2 is default, so only add if explicitly false (though vLLM doesn't support disabling it via flag)
    # This is more for future-proofing if they add a --no-use-v2-block-manager
    if args.use_v2_block_manager is False:
        pass # No-op, as there's no flag to disable it.

    if args.max_num_seqs:
        cmd.extend(["--max-num-seqs", str(args.max_num_seqs)])
    if args.max_num_prefill_tokens:
        cmd.extend(["--max-num-prefill-tokens", str(args.max_num_prefill_tokens)])
    if args.serializer_workers:
        cmd.extend(["--serializer-workers", str(args.serializer_workers)])
    if args.download_dir:
        cmd.extend(["--download-dir", args.download_dir])
    if args.trust_remote_code:
        cmd.append("--trust-remote-code")
        
    return cmd

def main():
    """Main function to start vLLM server."""
    args = parse_arguments()
    
    if not os.path.isdir(args.model):
        print(json.dumps({"error": f"Model path not found: {args.model}", "success": False}))
        return 1
        
    cmd = build_vllm_command(args)
    
    print(json.dumps({
        "message": "Starting vLLM server",
        "command": " ".join(cmd),
        "success": True
    }))
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=sys.stdout,
            stderr=sys.stderr
        )
        process.wait()
        
    except KeyboardInterrupt:
        print(json.dumps({"message": "vLLM server stopped by user.", "success": True}))
        if 'process' in locals():
            process.terminate()
        return 0
    except Exception as e:
        print(json.dumps({"error": f"Failed to start vLLM server: {str(e)}", "success": False}))
        return 1

if __name__ == "__main__":
    sys.exit(main())
