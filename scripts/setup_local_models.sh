#!/bin/bash
# Script to set up local models for MCPServer

echo "=============================================="
echo "   Setting up local models for MCPServer"
echo "=============================================="

SCRIPT_DIR=$(dirname "$0")
cd "$SCRIPT_DIR" || exit 1

# Create models directory if it doesn't exist
if [ ! -d "../models" ]; then
    echo "Creating models directory..."
    mkdir -p "../models"
fi

# Check if any models are available
MODEL_COUNT=$(find "../models" -type f -name "*.bin" -o -name "*.pt" -o -name "*.safetensors" | wc -l)
if [ "$MODEL_COUNT" -eq 0 ]; then
    echo "Note: No model files found in the models directory."
    echo "You can download models later and place them in the 'models' directory."
    echo "Supported formats: .bin, .pt, .pth, .safetensors"
fi

# Install dependencies
echo "Installing local model dependencies..."
./install_model_dependencies.sh

echo "=============================================="
echo "   Local models setup complete! 🚀"
echo "=============================================="
echo ""
echo "Integration with the chat interface should now work properly."
echo "You can place model files in the 'models' directory, then add them"
echo "through the admin panel using the full path to the model file."
echo ""
echo "For more information, check the documentation."
echo "=============================================="
