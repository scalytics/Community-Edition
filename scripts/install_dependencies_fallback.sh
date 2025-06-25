#!/bin/bash
# Fallback script for installing Hugging Face dependencies
echo "Installing Hugging Face dependencies..."

# Try different methods
echo "Method 1: Using pip directly"
python3 -m pip install huggingface_hub tqdm requests

echo "Method 2: Using pip with --user flag"
python3 -m pip install huggingface_hub tqdm requests --user

echo "Method 3: Using pipx"
if command -v pipx &> /dev/null; then
    pipx install huggingface_hub
    pipx install tqdm
    pipx install requests
fi

echo "Installation attempts completed. Please check if the packages are installed."
