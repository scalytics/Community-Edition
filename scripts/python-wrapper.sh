#!/bin/bash
# Python wrapper script that ensures virtual environment is activated
# before running any Python commands

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"

# In production, enforce standard path
if [[ "$APP_DIR" == "/var/www/connect" ]]; then
  # Force the standard path
  VENV_DIR="$APP_DIR/venv"
  # Override any existing environment variable
  export PYTHON_VENV_DIR="$VENV_DIR"
  
  
  if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/activate" ]; then
    : # Found venv
  else
    
    mkdir -p "$VENV_DIR" 2>/dev/null
    
    if command -v python3 -m venv &> /dev/null; then
      python3 -m venv "$VENV_DIR" 2>/dev/null
      
      if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/activate" ]; then
        : # Successfully created
      else
        : # Failed to create
      fi
    fi
  fi
else
  VENV_DIR="${PYTHON_VENV_DIR:-$APP_DIR/venv}"
  
  if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/activate" ]; then
    : # Found venv
  else
    
    mkdir -p "$VENV_DIR" 2>/dev/null
    
    if command -v python3 -m venv &> /dev/null; then
      python3 -m venv "$VENV_DIR" 2>/dev/null
    else
      : # Failed to create
    fi
  fi
fi


if [ ! -d "$VENV_DIR" ] || [ ! -f "$VENV_DIR/bin/activate" ]; then
  echo "Error: No valid Python virtual environment found or could be created at: $VENV_DIR" >&2
  echo "Please create a Python virtual environment with: python3 -m venv $VENV_DIR" >&2
  exit 1
fi

# Activate the virtual environment
source "$VENV_DIR/bin/activate"
# Explicitly capture and export LD_LIBRARY_PATH potentially set by activate
ACTIVATED_LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" # Capture current value after source
export LD_LIBRARY_PATH="$ACTIVATED_LD_LIBRARY_PATH" # Ensure it's exported

# Debugging information
PYTHON_EXEC="$VENV_DIR/bin/python"




if [ "$1" = "pip" ] || [[ "$1" == *"/pip" ]]; then
  
  shift  
  "$PYTHON_EXEC" -m pip "$@"
elif [ "$#" -eq 0 ]; then
  "$PYTHON_EXEC"
else
  "$PYTHON_EXEC" "$@"
fi
