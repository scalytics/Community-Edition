#!/bin/bash

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
MODEL_FILE="$SCRIPT_DIR/tinyllama-1.1b-chat-v1.0.Q2_K.gguf"
# Determine venv path relative to this script's parent directory
APP_DIR="$( cd "$SCRIPT_DIR/../../" &> /dev/null && pwd )"
VENV_DIR="$APP_DIR/venv"

# Download a small test model if it doesn't exist
if [ ! -f "$MODEL_FILE" ]; then
    echo "Downloading test model..." >&2
    wget -q https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q2_K.gguf -O "$MODEL_FILE"
fi

# Activate the virtual environment directly
if [ -f "$VENV_DIR/bin/activate" ]; then
  echo "Activating venv: $VENV_DIR/bin/activate" >&2
  source "$VENV_DIR/bin/activate"
else
  echo "Error: Virtual environment activation script not found at $VENV_DIR/bin/activate" >&2
  exit 1
fi

# Set environment variables for GPU AFTER activating venv
export CUDA_VISIBLE_DEVICES="0,1"
export GGML_CUDA=1
export GGML_CUDA_FORCE=1

# Run the check script directly using python from activated venv
# Capture output AND potentially standard error
output=$(python "$SCRIPT_DIR/check_llama_gpu.py" 2>&1)
exit_code=$?

# Check for CUDA initialization and multi-GPU usage based on output
# Use original logic for checking output
if [ $exit_code -eq 0 ] && echo "$output" | grep -q "ggml_cuda_init: found"; then
    echo "CUDA backend operational" >&2

    # Get current GPU stats to verify both are being used (optional, keep original logic if needed)
    if command -v nvidia-smi &> /dev/null; then
        gpu_temps=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits)
        gpu_utils=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits)
        gpu_mems=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)

        gpu_count=$(echo "$gpu_temps" | wc -l)
        all_active=true
        for util in $gpu_utils; do
            # Allow for some idle utilization
            if [ "$util" -lt 1 ]; then
                all_active=false
            fi
        done

        echo "Detected $gpu_count GPUs" >&2
        # echo "GPU temperatures: $gpu_temps" >&2 # Can be noisy
        # echo "GPU utilization: $gpu_utils" >&2 # Can be noisy
        # echo "GPU memory used: $gpu_mems MB" >&2 # Can be noisy

        # Check tensor split in output
        if echo "$output" | grep -q "tensor_split="; then
            echo "Multi-GPU tensor splitting configured correctly" >&2
            echo "CUDA:TRUE:MULTI"
        else
            # If only one GPU detected, single is correct
            if [ "$gpu_count" -eq 1 ]; then
                 echo "Single GPU detected and configured correctly" >&2
                 echo "CUDA:TRUE:SINGLE"
            else
                 echo "Tensor split not detected in model configuration for multi-GPU setup" >&2
                 echo "CUDA:TRUE:SINGLE" # Report as single even if multiple GPUs detected but not split
            fi
        fi

        if [ "$all_active" = true ] && [ "$gpu_count" -gt 1 ]; then
            echo "All GPUs appear to be active or ready" >&2
        elif [ "$gpu_count" -le 1 ]; then
             echo "Single GPU detected." >&2 # Not a warning for single GPU
        else
            echo "Warning: Not all GPUs seem active - check tensor_split configuration or load" >&2
        fi
    else
        echo "nvidia-smi not available, cannot check multi-GPU utilization" >&2
        echo "CUDA:TRUE:UNKNOWN"
    fi
    exit 0
else
    echo "CUDA backend not detected (script exit code: $exit_code)" >&2
    echo "--- Python Script Output ---" >&2
    echo "$output" >&2
    echo "--- End Python Script Output ---" >&2
    echo "CUDA:FALSE"
    exit 1
fi
