#!/bin/bash
# Setup script for Hugging Face model management using the SaaS Python environment

# Make the download script executable
chmod +x download_hf_model.py

# Source the environment setup script if it exists
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Functions to find environment variables and python venv
find_env_file() {
    local env_paths=(
        "$APP_DIR/.connect-env"
        "$APP_DIR/.env"
        "$SCRIPT_DIR/../.env"
        "$SCRIPT_DIR/.env"
    )
    
    for env_path in "${env_paths[@]}"; do
        if [ -f "$env_path" ]; then
            echo "$env_path"
            return 0
        fi
    done
    
    return 1
}

# Try to source the environment file if it exists
ENV_FILE=$(find_env_file)
if [ -n "$ENV_FILE" ]; then
    echo "Sourcing environment from $ENV_FILE"
    source "$ENV_FILE"
fi

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
        "$APP_DIR/venv"                    # Standard path
        "$SCRIPT_DIR/../venv"              # Relative to scripts
        "$SCRIPT_DIR/../../venv"           # One level up
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
    
    # Create and configure pip.conf
    local pip_conf="$venv_dir/pip/pip.conf"
    local pip_dir="$venv_dir/pip"
    
    if [ -f "$pip_conf" ]; then
        echo "Using existing pip configuration at $pip_conf" >&2
        export PIP_CONFIG_FILE="$pip_conf"
    else
        # Create pip directory and config if it doesn't exist
        mkdir -p "$pip_dir"
        
        cat > "$pip_conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
        
        export PIP_CONFIG_FILE="$pip_conf"
        echo "Created pip configuration at $pip_conf" >&2
    fi
}

# Find the venv
VENV_DIR=$(find_saas_venv)
if [ -z "$VENV_DIR" ]; then
    echo "ERROR: Could not find the SaaS Python virtual environment."
    echo "The environment should be set up by the saas/modules/python.sh script."
    exit 1
fi

echo "Found SaaS Python virtual environment at: $VENV_DIR"

# Check if Python activation script exists
if [ ! -f "$VENV_DIR/bin/activate" ]; then
    echo "ERROR: Python virtual environment activation script not found."
    echo "The environment may be corrupted or incomplete."
    exit 1
fi

# Activate the virtual environment
echo "Activating Python virtual environment..."
source "$VENV_DIR/bin/activate"

# Verify Python is working
if ! python -c "import sys; print(f'Python {sys.version} is active')" 2>/dev/null; then
    echo "ERROR: Failed to activate Python virtual environment."
    exit 1
fi

# Set up robust pip environment 
configure_pip_environment "$VENV_DIR"

# Install required packages using the venv pip
echo "Installing required Python packages to SaaS virtual environment..."
if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    python -m pip install --no-user --isolated --no-cache-dir --disable-pip-version-check -r "$SCRIPT_DIR/requirements.txt"
else
    # Install essential packages if requirements.txt doesn't exist
    python -m pip install --no-user --isolated --no-cache-dir --disable-pip-version-check huggingface_hub tqdm requests
fi

# Check if HUGGINGFACE_API_KEY is set in environment
if [ -z "$HUGGINGFACE_API_KEY" ]; then
    echo "Note: HUGGINGFACE_API_KEY environment variable is not set."
    echo "While not required, setting this variable will allow access to gated models."
    echo "You can get an API key from https://huggingface.co/settings/tokens"
    echo "Then add it to your environment or .env file:"
    echo "export HUGGINGFACE_API_KEY=your_key_here"
fi

# Create models directory if it doesn't exist
if [ ! -d "$APP_DIR/models" ]; then
    echo "Creating models directory..."
    mkdir -p "$APP_DIR/models"
fi

# Create activation helper script in scripts directory
cat > "$SCRIPT_DIR/activate_hf_env.sh" << EOL
#!/bin/bash
# Activate the SaaS Python virtual environment for Hugging Face
source "$VENV_DIR/bin/activate"
echo "SaaS Python virtual environment activated for Hugging Face. Run 'deactivate' to exit."
EOL
chmod +x "$SCRIPT_DIR/activate_hf_env.sh"

echo
echo "Setup complete! You can now use the Hugging Face model management features."
echo "The scripts will now use the SaaS Python environment at: $VENV_DIR"
echo
echo "To manually activate this environment, run:"
echo "source $SCRIPT_DIR/activate_hf_env.sh"

# Deactivate the virtual environment
deactivate
