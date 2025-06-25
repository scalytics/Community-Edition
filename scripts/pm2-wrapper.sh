#!/bin/bash
# PM2 wrapper script to ensure correct environment setup
# This fixes the "spawn bash ENOENT" and "invalid PID" errors

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"

# Set absolute paths to essential binaries
BASH_BIN="/bin/bash"
NODE_BIN="$(which node)"

# Force standard path in app directory regardless of what's in environment variable
# This is needed to override any old paths that might be in PM2 configuration
if [[ "$APP_DIR" == "/var/www/connect" ]]; then
  # In production, always use app directory
  VENV_DIR="$APP_DIR/venv"
  # Override the environment variable too to ensure consistency
  export PYTHON_VENV_DIR="$APP_DIR/venv"
else
  # In development, use environment variable with fallback to app directory
  VENV_DIR="${PYTHON_VENV_DIR:-$APP_DIR/venv}"
fi

echo "Starting app with PM2 wrapper from $(pwd)" >&2
echo "APP_DIR: $APP_DIR" >&2
echo "VENV_DIR: $VENV_DIR" >&2
echo "NODE_BIN: $NODE_BIN" >&2

  # Check if we need to create the Python virtual environment
  if [ ! -d "$VENV_DIR" ]; then
    # Check if we can create it
    VENV_BASE_DIR="$(dirname "$VENV_DIR")"
    
    if [ -w "$VENV_BASE_DIR" ]; then
      echo "Creating Python virtual environment at $VENV_DIR..." >&2
      
      # Check if python3-venv or equivalent is available
      if command -v python3 -m venv > /dev/null 2>&1; then
        python3 -m venv "$VENV_DIR"
        
        if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/python" ]; then
          echo "Successfully created Python virtual environment" >&2
          
          # Now install basic packages using python -m pip instead of direct pip call
          # This ensures the correct interpreter is used for pip
          "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel > /dev/null 2>&1 || echo "Warning: Failed to install basic packages" >&2
        else
          echo "WARNING: Failed to create Python virtual environment" >&2
        fi
      else
        echo "WARNING: python3-venv not available, cannot create virtual environment" >&2
      fi
    else
      echo "WARNING: Cannot create Python virtual environment, no write permission to $VENV_BASE_DIR" >&2
    fi
  fi

# Validate the Python environment - enforce standard path only
if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/python" ]; then
  echo "Found Python virtual environment at $VENV_DIR" >&2
  # Export the Python environment for the app
  export PYTHON_VENV_DIR="$VENV_DIR"
  export PATH="$VENV_DIR/bin:$PATH"
  export PYTHONPATH="$VENV_DIR:$PYTHONPATH"
else
  echo "WARNING: Python virtual environment not found at $VENV_DIR" >&2
  
  # Create if possible - standard location only, no alternatives
  if [ ! -d "$VENV_DIR" ] && command -v python3 &> /dev/null; then
    echo "Creating standard Python virtual environment..." >&2
    mkdir -p "$(dirname "$VENV_DIR")" 2>/dev/null || true
    python3 -m venv "$VENV_DIR" 2>/dev/null
    
    if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/python" ]; then
      echo "Created Python virtual environment at $VENV_DIR" >&2
      export PYTHON_VENV_DIR="$VENV_DIR"
      export PATH="$VENV_DIR/bin:$PATH"
      export PYTHONPATH="$VENV_DIR:$PYTHONPATH"
    fi
  fi
  
  # Continue anyway, as the app might not need Python
  echo "Note: The application will continue but Python functionality may be limited" >&2
fi

# Validate the Node.js environment
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js binary not found in PATH" >&2
  exit 1
fi

# Make sure server.js exists
SERVER_JS="$APP_DIR/server.js"
if [ ! -f "$SERVER_JS" ]; then
  echo "ERROR: server.js not found at $SERVER_JS" >&2
  exit 1
fi

# Export essential environment variables
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH:$APP_DIR/bin:$APP_DIR/scripts:$VENV_DIR/bin"
export LD_LIBRARY_PATH="$APP_DIR/bin/llama:$APP_DIR/bin/llama/lib:${LD_LIBRARY_PATH}"

# Execute the application's main file
cd "$APP_DIR"
echo "Starting server with Node.js..." >&2
exec "$NODE_BIN" "$SERVER_JS"
