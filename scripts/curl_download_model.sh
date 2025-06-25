#!/bin/bash

# Script to download Hugging Face models directly using curl
# This bypasses Python's SSL issues entirely by using the system's curl command

set -e  # Exit immediately if a command fails

# Text formatting
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

# Display help
function show_help {
  echo -e "${BOLD}Hugging Face Model Downloader using curl${RESET}"
  echo ""
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  -m, --model MODEL_ID     Model ID (e.g., 'mistralai/Mistral-7B-v0.1')"
  echo "  -o, --output DIR         Output directory"
  echo "  -t, --token TOKEN        Hugging Face API token (optional)"
  echo "  -h, --help               Show this help message"
  echo ""
  echo "Example:"
  echo "  $0 --model meta-llama/Llama-2-7b-chat-hf --output ~/models/llama2"
  echo ""
  exit 0
}

# Parse command line arguments
MODEL_ID=""
OUTPUT_DIR=""
API_TOKEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model)
      MODEL_ID="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    -t|--token)
      API_TOKEN="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      ;;
  esac
done

# Check required parameters
if [[ -z "$MODEL_ID" ]]; then
  echo -e "${RED}Error: Model ID is required${RESET}"
  show_help
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  echo -e "${RED}Error: Output directory is required${RESET}"
  show_help
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Try to get token from environment if not provided
if [[ -z "$API_TOKEN" ]]; then
  API_TOKEN="${HUGGINGFACE_API_KEY}"
fi

echo -e "${BOLD}Downloading model: ${MODEL_ID}${RESET}"
echo -e "Output directory: ${OUTPUT_DIR}"

# Construct the base URL for the Hugging Face model
BASE_URL="https://huggingface.co/${MODEL_ID}/resolve/main"

# Build the curl headers for authentication
HEADERS=""
if [[ -n "$API_TOKEN" ]]; then
  HEADERS="-H 'Authorization: Bearer ${API_TOKEN}'"
  echo -e "${GREEN}Using Hugging Face API token${RESET}"
fi

# Function to download with progress
function download_file {
  local url=$1
  local file=$2
  local relative_path=$3
  
  echo -e "\n${BOLD}Downloading: ${relative_path}${RESET}"
  
  # Create directory for the file if needed
  mkdir -p "$(dirname "$file")"
  
  # Use curl with authentication and progress bar
  if [[ -n "$API_TOKEN" ]]; then
    curl -L --progress-bar -H "Authorization: Bearer ${API_TOKEN}" -o "$file" "$url"
  else
    curl -L --progress-bar -o "$file" "$url"
  fi
  
  # Check if download was successful
  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Successfully downloaded: ${relative_path}${RESET}"
    return 0
  else
    echo -e "${RED}Failed to download: ${relative_path}${RESET}"
    return 1
  fi
}

# First, retrieve the config.json which contains model information
CONFIG_URL="${BASE_URL}/config.json"
CONFIG_FILE="${OUTPUT_DIR}/config.json"

echo -e "\n${BOLD}Checking model configuration...${RESET}"
if download_file "$CONFIG_URL" "$CONFIG_FILE" "config.json"; then
  echo -e "${GREEN}Retrieved model configuration${RESET}"
else
  echo -e "${RED}Failed to retrieve model configuration. Check the model ID and try again.${RESET}"
  exit 1
fi

# Check if model is a safetensors model
SAFETENSORS_URL="${BASE_URL}/model.safetensors"
SAFETENSORS_FILE="${OUTPUT_DIR}/model.safetensors"

echo -e "\n${BOLD}Checking for safetensors format...${RESET}"
if download_file "$SAFETENSORS_URL" "$SAFETENSORS_FILE" "model.safetensors"; then
  echo -e "${GREEN}Model is in safetensors format${RESET}"
  MODEL_FORMAT="safetensors"
else
  echo -e "${YELLOW}Safetensors model not found, checking for PyTorch format...${RESET}"
  
  # Try PyTorch format
  PYTORCH_URL="${BASE_URL}/pytorch_model.bin"
  PYTORCH_FILE="${OUTPUT_DIR}/pytorch_model.bin"
  
  if download_file "$PYTORCH_URL" "$PYTORCH_FILE" "pytorch_model.bin"; then
    echo -e "${GREEN}Model is in PyTorch format${RESET}"
    MODEL_FORMAT="pytorch"
  else
    echo -e "${YELLOW}Checking for sharded model files...${RESET}"
    
    # Check for index file which indicates sharded model
    INDEX_URL="${BASE_URL}/pytorch_model.bin.index.json"
    INDEX_FILE="${OUTPUT_DIR}/pytorch_model.bin.index.json"
    
    if download_file "$INDEX_URL" "$INDEX_FILE" "pytorch_model.bin.index.json"; then
      MODEL_FORMAT="sharded"
      
      # Parse the index file to get shard information
      # This is a simple extract of shard filenames using grep and cut
      echo -e "${YELLOW}Model is sharded. Downloading individual shards...${RESET}"
      
      # Use a simple approach to extract shard names
      SHARD_FILES=$(grep -o '"[^"]*pytorch_model-[0-9]*-of-[0-9]*.bin"' "$INDEX_FILE" | tr -d '"')
      
      if [[ -z "$SHARD_FILES" ]]; then
        # Try safetensors shards
        SHARD_FILES=$(grep -o '"[^"]*model-[0-9]*-of-[0-9]*.safetensors"' "$INDEX_FILE" | tr -d '"')
      fi
      
      if [[ -n "$SHARD_FILES" ]]; then
        # Download each shard
        for shard in $SHARD_FILES; do
          SHARD_URL="${BASE_URL}/${shard}"
          SHARD_FILE="${OUTPUT_DIR}/${shard}"
          
          download_file "$SHARD_URL" "$SHARD_FILE" "$shard"
        done
      else
        echo -e "${RED}Could not determine shard filenames from index${RESET}"
        exit 1
      fi
    else
      echo -e "${RED}Could not find model files in common formats${RESET}"
      exit 1
    fi
  fi
fi

# Download tokenizer files
echo -e "\n${BOLD}Downloading tokenizer files...${RESET}"

# Common tokenizer files
TOKENIZER_FILES=(
  "tokenizer.json"
  "tokenizer_config.json"
  "special_tokens_map.json"
  "tokenizer.model"
  "vocab.json"
  "merges.txt"
)

# Try to download each tokenizer file
for tokenizer_file in "${TOKENIZER_FILES[@]}"; do
  TOKENIZER_URL="${BASE_URL}/${tokenizer_file}"
  TOKENIZER_PATH="${OUTPUT_DIR}/${tokenizer_file}"
  
  # Don't exit on failure since not all models have all tokenizer files
  download_file "$TOKENIZER_URL" "$TOKENIZER_PATH" "$tokenizer_file" || true
done

# Create a metadata file with download information
echo -e "\n${BOLD}Creating metadata...${RESET}"
METADATA_FILE="${OUTPUT_DIR}/download_metadata.json"
cat > "$METADATA_FILE" << EOL
{
  "model_id": "${MODEL_ID}",
  "download_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "huggingface_repo": "${MODEL_ID}",
  "model_format": "${MODEL_FORMAT}",
  "downloader": "curl_download_model.sh"
}
EOL

echo -e "\n${GREEN}${BOLD}Model download completed successfully!${RESET}"
echo -e "Model files are saved in: ${OUTPUT_DIR}"
echo ""

# Create a simple model config file for WMCP
WMCP_CONFIG_FILE="${OUTPUT_DIR}/config.json"
if [[ ! -f "$WMCP_CONFIG_FILE" ]]; then
  MODEL_NAME=$(basename "$MODEL_ID")
  cat > "$WMCP_CONFIG_FILE" << EOL
{
  "id": "${MODEL_ID}",
  "name": "${MODEL_NAME}",
  "description": "Hugging Face model: ${MODEL_ID}",
  "context_window": 4096,
  "huggingface_repo": "${MODEL_ID}"
}
EOL
  echo -e "${GREEN}Created WMCP model configuration file${RESET}"
fi

exit 0
