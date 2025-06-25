#!/bin/bash
# Script to forcefully delete a model directory
# Usage: ./force_delete_model_dir.sh <directory_path>

if [ $# -ne 1 ]; then
  echo "Usage: $0 <directory_path>"
  exit 1
fi

TARGET_DIR="$1"
MODELS_DIR="$(pwd)/models"

# Safety check: ensure the path starts with the models directory
if [[ "$TARGET_DIR" != "$MODELS_DIR"* ]]; then
  echo "Safety check failed: Directory must be within the models directory"
  exit 2
fi

# Safety check: don't delete the models directory itself
if [ "$TARGET_DIR" = "$MODELS_DIR" ]; then
  echo "Safety check failed: Cannot delete the models directory itself"
  exit 3
fi

echo "Forcefully deleting directory: $TARGET_DIR"

# Extra aggressive approach - use a combination of techniques

# 1. First try to change ownership if needed (in case of root-owned files)
sudo chown -R $(whoami) "$TARGET_DIR" 2>/dev/null || true

# 2. Make sure all files are writable
find "$TARGET_DIR" -type f -exec chmod 666 {} \; 2>/dev/null || true

# 3. Make sure all directories are writable
find "$TARGET_DIR" -type d -exec chmod 777 {} \; 2>/dev/null || true

# 4. Remove specifically the config.json file which seems to cause issues
if [ -f "$TARGET_DIR/config.json" ]; then
  echo "Found config.json, removing it specifically"
  rm -f "$TARGET_DIR/config.json"
fi

# 5. Now try to remove the directory with force
rm -rf "$TARGET_DIR"

# 6. Check if directory still exists
if [ -d "$TARGET_DIR" ]; then
  echo "Directory still exists, trying with sudo"
  sudo rm -rf "$TARGET_DIR"
else
  echo "Directory successfully deleted"
  exit 0
fi

# Final check
if [ -d "$TARGET_DIR" ]; then
  echo "FAILED: Directory still exists after all attempts"
  exit 4
else
  echo "Directory successfully deleted with sudo"
  exit 0
fi
