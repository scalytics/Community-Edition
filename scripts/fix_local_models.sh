#!/bin/bash
# One-stop script to fix common issues with local models

echo "========================================================"
echo "    Local Model Issue Fixer for WMCP                    "
echo "========================================================"

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR" || exit 1

# Make sure all scripts are executable
echo "Making scripts executable..."
chmod +x *.sh

# First, ensure Python has SSL support
echo "Step 1: Checking Python SSL support..."
if python3 -c "import ssl" 2>/dev/null; then
    echo "✅ Python SSL module is available!"
else
    echo "❌ Python SSL module is not available. Installing dependencies..."
    
    # Try to install dependencies based on OS
    if [ "$(uname)" == "Darwin" ]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install openssl python
        else
            echo "Homebrew not found. Please install from https://brew.sh/"
        fi
    elif [ "$(uname)" == "Linux" ]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y python3-dev libssl-dev libffi-dev
        elif command -v yum &> /dev/null; then
            sudo yum install -y python3-devel openssl-devel
        fi
    fi
fi

# Install any missing dependencies
echo "Step 2: Installing model dependencies..."
./install_model_dependencies.sh

# Step 3: Removed llama-cli checks as it's being phased out.
# The system now relies on llama-cpp-python.
echo "Step 3: Checking Python dependencies (llama-cli checks removed)..."
# (install_model_dependencies.sh handles Python checks)

# Create symlinks to our Python wrapper in the models directory
echo "Step 4: Setting up model directory with Python symlinks..."
MODELS_DIR="../models"

# Make sure we can create the directory with proper permissions
echo "Creating models bin directory..."
if [ -d "$MODELS_DIR" ]; then
    # Models directory exists
    if [ ! -w "$MODELS_DIR" ]; then
        echo "Models directory exists but is not writable. Using sudo to create bin directory..."
        sudo mkdir -p "$MODELS_DIR/bin"
        sudo chmod 755 "$MODELS_DIR/bin"
    else
        mkdir -p "$MODELS_DIR/bin"
    fi
else
    # Create full path with sudo if needed
    echo "Creating models directory structure..."
    if ! mkdir -p "$MODELS_DIR" 2>/dev/null; then
        sudo mkdir -p "$MODELS_DIR"
        sudo chmod 755 "$MODELS_DIR"
    fi
    
    mkdir -p "$MODELS_DIR/bin"
fi

# Create Python wrapper symlinks, using sudo if necessary
echo "Creating symlinks to Python wrappers..."
if [ -w "$MODELS_DIR/bin" ]; then
    # No sudo needed
    ln -sf "$(which python3)" "$MODELS_DIR/bin/python"
    ln -sf "$(which pip3)" "$MODELS_DIR/bin/pip"
    echo "✅ Created symlinks to system python3 without sudo"
else
    # Need sudo
    echo "Using sudo to create symlinks (directory not writable)..."
    sudo ln -sf "$(which python3)" "$MODELS_DIR/bin/python"
    sudo ln -sf "$(which pip3)" "$MODELS_DIR/bin/pip"
    echo "✅ Created symlinks to system python3 with sudo"
fi

# Removed logic for linking/copying llama-cli binary to models/bin.

# Add this bin directory to PATH in .bashrc or .zshrc if it's not there
echo "Step 5: Updating shell configuration..."

SHELL_CONFIG=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
fi

if [ -n "$SHELL_CONFIG" ]; then
    MODELS_BIN_PATH="$MODELS_DIR/bin"
    if ! grep -q "$MODELS_BIN_PATH" "$SHELL_CONFIG"; then
        echo "Adding model bin directory to PATH in $SHELL_CONFIG"
        echo "" >> "$SHELL_CONFIG"
        echo "# Add WMCP Python with SSL wrappers and llama binaries to PATH" >> "$SHELL_CONFIG"
        echo "export PATH=\"$MODELS_BIN_PATH:\$PATH\"" >> "$SHELL_CONFIG"
        echo "Added to shell config. Changes will take effect in new shell sessions."
    else
        echo "Model bin directory already in PATH in $SHELL_CONFIG"
    fi
    
    # Also add the app user's bin directory to PATH if not already there
    if [ -d "$APP_HOME/bin" ] && ! grep -q "$APP_HOME/bin" "$SHELL_CONFIG"; then
        echo "Adding application user's bin directory to PATH in $SHELL_CONFIG"
        echo "" >> "$SHELL_CONFIG"
        echo "# Add application user's bin directory to PATH for llama binaries" >> "$SHELL_CONFIG"
        echo "export PATH=\"$APP_HOME/bin:\$PATH\"" >> "$SHELL_CONFIG"
        echo "Added app user's bin directory to shell config. Changes will take effect in new shell sessions."
    fi
fi

# Make sure run_model.py uses the correct Python version
echo "Step 6: Ensuring run_model.py uses the correct Python version..."
if grep -q "#!/usr/bin/env python-with-ssl" run_model.py; then
    # Replace with standard python3 path
    sed -i.bak '1s|^#!/usr/bin/env python-with-ssl|#!/usr/bin/env python3|' run_model.py
    echo "Updated run_model.py to use python3 directly"
fi
fi

echo "========================================================"
echo "✅ Local model fixes complete!"
echo "========================================================"
echo ""
echo "If you still have issues running local models:"
echo "1. Try logging out and back in to apply PATH changes"
echo "2. Run: sudo ./setup_local_models.sh"
echo "3. Check the logs for specific error messages"
echo ""
echo "To test if a local model works, you can try:"
echo "./scripts/run_model.py --model /path/to/your/model_directory \\"
echo "                       --prompt \"Hello, how are you?\" \\"
echo "                       --max_tokens 100"
echo ""
