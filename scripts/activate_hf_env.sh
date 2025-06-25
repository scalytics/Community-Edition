#!/bin/bash
# Activate the SaaS Python virtual environment for Hugging Face

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Find the SaaS Python virtual environment
find_saas_venv() {
    # First check environment variable
    if [ -n "$PYTHON_VENV_DIR" ] && [ -d "$PYTHON_VENV_DIR" ]; then
        echo "Using PYTHON_VENV_DIR environment variable: $PYTHON_VENV_DIR" >&2
        echo "$PYTHON_VENV_DIR"
        return 0
    fi
    
    # Check standard locations
    local venv_paths=(
        "$APP_DIR/venv"                     # Standard path
        "$SCRIPT_DIR/../venv"               # Relative to scripts
        "$SCRIPT_DIR/../../venv"            # One level up
        "$SCRIPT_DIR/venv"                  # Fallback to local venv
    )
    
    for venv_path in "${venv_paths[@]}"; do
        if [ -d "$venv_path" ]; then
            echo "Found virtual environment at: $venv_path" >&2
            
            # Set environment variable for other processes and scripts
            export PYTHON_VENV_DIR="$venv_path"
            
            echo "$venv_path"
            return 0
        fi
    done
    
    echo "SaaS Python virtual environment not found" >&2
    return 1
}

# Set up robust pip environment
configure_pip_environment() {
    local venv_dir="$1"
    
    # Explicitly prevent user installs
    export PIP_USER=0
    export PIP_REQUIRE_VIRTUALENV=0
    export PIP_NO_USER_CONFIG=1
    export PYTHONNOUSERSITE=1
    
    # Configure pip.conf location if available
    local pip_conf="$venv_dir/pip/pip.conf"
    local pip_dir="$venv_dir/pip"
    
    if [ -f "$pip_conf" ]; then
        echo "Using pip configuration at $pip_conf" >&2
        export PIP_CONFIG_FILE="$pip_conf"
    else
        # Create pip directory and config if it doesn't exist
        mkdir -p "$pip_dir" 2>/dev/null || true
        
        if [ -w "$pip_dir" ]; then
            cat > "$pip_conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
            export PIP_CONFIG_FILE="$pip_conf"
            echo "Created pip configuration at $pip_conf" >&2
        else
            echo "Cannot create pip.conf (permission denied). Using null config." >&2
            export PIP_CONFIG_FILE=/dev/null
        fi
    fi
}

# Find the venv
VENV_DIR=$(find_saas_venv)
if [ -z "$VENV_DIR" ]; then
    echo "ERROR: Could not find the SaaS Python virtual environment."
    echo "Run setup_huggingface.sh first to create the environment."
    return 1
fi

# Check if activation script exists
if [ ! -f "$VENV_DIR/bin/activate" ]; then
    echo "ERROR: Python virtual environment activation script not found."
    echo "The environment may be corrupted or incomplete."
    return 1
fi

# Configure pip environment
configure_pip_environment "$VENV_DIR"

# Activate the virtual environment
source "$VENV_DIR/bin/activate"

echo "SaaS Python virtual environment activated for Hugging Face."
echo "Environment location: $VENV_DIR"
echo "Use 'deactivate' to exit the environment"
echo "All pip commands will use the isolated configuration"
