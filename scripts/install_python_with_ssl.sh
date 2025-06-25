#!/bin/bash

# Script to handle Python installation with proper SSL support
# Instead of fixing Homebrew Python, this script:
# 1. Uninstalls Homebrew Python
# 2. Installs Python directly from python.org
# 3. Ensures proper SSL support

set -e  # Exit immediately if a command fails

# Text formatting
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"

echo -e "${BOLD}Installing Python with SSL Support${RESET}\n"

# Check if this is macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo -e "${RED}This script is for macOS only. Exiting.${RESET}"
  exit 1
fi

# Detect Homebrew
if ! command -v brew &> /dev/null; then
  echo -e "${YELLOW}Homebrew not detected. Proceeding with direct Python installation.${RESET}"
else
  echo -e "${BOLD}Homebrew detected. Checking for Homebrew-managed Python...${RESET}"
  
  # Check for Homebrew-managed Python
  BREW_PYTHON=$(brew list --formula | grep -E '^python(@[0-9.]+)?$')
  
  if [[ -n "$BREW_PYTHON" ]]; then
    echo -e "${YELLOW}Found Homebrew-managed Python: $BREW_PYTHON${RESET}"
    echo -e "Uninstalling Homebrew Python to avoid conflicts..."
    
    # Uninstall all Homebrew Python versions
    for py in $BREW_PYTHON; do
      echo -e "Uninstalling $py..."
      brew uninstall --ignore-dependencies $py
    done
    
    # Also uninstall python-setuptools, pip, etc.
    for pkg in python-setuptools python-pip python-wheel pipx; do
      if brew list $pkg &>/dev/null; then
        echo -e "Uninstalling related package: $pkg..."
        brew uninstall --ignore-dependencies $pkg
      fi
    done
    
    echo -e "${GREEN}Successfully removed Homebrew Python packages.${RESET}"
  else
    echo -e "${GREEN}No Homebrew-managed Python detected.${RESET}"
  fi
fi

# Download and install Python from python.org
echo -e "\n${BOLD}Downloading Python installer from python.org...${RESET}"

# Choose Python version (using 3.11 as it's stable and widely supported)
PYTHON_VERSION="3.11.8"
DOWNLOAD_URL="https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg"
INSTALLER_PATH="/tmp/python-${PYTHON_VERSION}-installer.pkg"

# Download the installer
echo -e "Downloading from: $DOWNLOAD_URL"
curl -# -L -o "$INSTALLER_PATH" "$DOWNLOAD_URL"

# Install Python
echo -e "\n${BOLD}Installing Python ${PYTHON_VERSION}...${RESET}"
echo -e "${YELLOW}You may be prompted for your password to install Python${RESET}"
sudo installer -pkg "$INSTALLER_PATH" -target /

# Clean up
rm -f "$INSTALLER_PATH"

# Verify installation
echo -e "\n${BOLD}Verifying Python installation...${RESET}"

# Create a temporary file for the PATH update
TEMP_PROFILE=$(mktemp)
echo 'export PATH="/Library/Frameworks/Python.framework/Versions/3.11/bin:$PATH"' > "$TEMP_PROFILE"
source "$TEMP_PROFILE"

# Check Python version
if command -v python3 &> /dev/null; then
  INSTALLED_VERSION=$(python3 --version)
  echo -e "${GREEN}Successfully installed: $INSTALLED_VERSION${RESET}"
else
  echo -e "${RED}Python installation failed or not in PATH.${RESET}"
  echo -e "Please add Python to your PATH manually:"
  echo 'export PATH="/Library/Frameworks/Python.framework/Versions/3.11/bin:$PATH"'
  exit 1
fi

# Test SSL support
echo -e "\n${BOLD}Testing SSL support...${RESET}"
if python3 -c "import ssl; print('SSL is available:', ssl.OPENSSL_VERSION)" 2>/dev/null; then
  echo -e "${GREEN}SSL module is properly available!${RESET}"
else
  echo -e "${RED}SSL module is still not available. Installation may have failed.${RESET}"
  exit 1
fi

# Test pip with HTTPS
echo -e "\n${BOLD}Testing pip with HTTPS...${RESET}"
if python3 -m pip --version; then
  echo -e "${GREEN}Pip is working correctly.${RESET}"
  
  # Try fetching something from PyPI to confirm HTTPS works
  echo -e "Testing PyPI connection..."
  if python3 -m pip install --dry-run requests &>/dev/null; then
    echo -e "${GREEN}PyPI connection successful. HTTPS is working correctly.${RESET}"
  else
    echo -e "${RED}PyPI connection failed. HTTPS may not be working correctly.${RESET}"
    exit 1
  fi
else
  echo -e "${RED}Pip is not working correctly.${RESET}"
  exit 1
fi

# Add PATH to user's profile
echo -e "\n${BOLD}Adding Python to your PATH...${RESET}"
SHELL_PROFILE=""
if [[ -n "$ZSH_VERSION" ]]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [[ -n "$BASH_VERSION" ]]; then
  SHELL_PROFILE="$HOME/.bash_profile"
  if [[ ! -f "$SHELL_PROFILE" ]]; then
    SHELL_PROFILE="$HOME/.bashrc"
  fi
fi

if [[ -n "$SHELL_PROFILE" ]]; then
  if ! grep -q '/Library/Frameworks/Python.framework/Versions/3.11/bin' "$SHELL_PROFILE"; then
    echo 'export PATH="/Library/Frameworks/Python.framework/Versions/3.11/bin:$PATH"' >> "$SHELL_PROFILE"
    echo -e "${GREEN}Added Python to PATH in $SHELL_PROFILE${RESET}"
    echo -e "Please restart your terminal or run:"
    echo -e "source $SHELL_PROFILE"
  else
    echo -e "${GREEN}Python is already in your PATH in $SHELL_PROFILE${RESET}"
  fi
else
  echo -e "${YELLOW}Could not detect shell profile. Please add Python to your PATH manually:${RESET}"
  echo 'export PATH="/Library/Frameworks/Python.framework/Versions/3.11/bin:$PATH"'
fi

# Install Hugging Face Hub requirements
echo -e "\n${BOLD}Installing Hugging Face dependencies...${RESET}"
python3 -m pip install huggingface_hub tqdm requests

echo -e "\n${GREEN}${BOLD}Python installation with SSL support completed successfully!${RESET}"
echo -e "Python ${PYTHON_VERSION} has been installed with proper SSL support."
echo -e "The python.org installer places Python in /Library/Frameworks/Python.framework/"
echo -e "This installation won't conflict with macOS system Python.\n"

# Note about potential homebrew conflicts
if command -v brew &> /dev/null; then
  echo -e "${YELLOW}Note: If you reinstall Python via Homebrew in the future, it may take precedence over this installation.${RESET}"
  echo -e "If you experience SSL issues again, you may need to run this script again or adjust your PATH."
fi

echo -e "\n${BOLD}Restart your terminal or source your profile to use the new Python installation.${RESET}"
echo -e "source $SHELL_PROFILE"
