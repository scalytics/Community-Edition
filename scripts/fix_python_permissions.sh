#!/bin/bash
# Script to fix Python package permissions for APP_USER
# This script detects and fixes permission issues with Python packages
# that may prevent pip from working correctly

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Default APP_USER
APP_USER="${APP_USER:-sconnect}"

# Print colored status messages
print_status() {
  local color=$1
  local message=$2
  
  # ANSI color codes
  local RED='\033[0;31m'
  local GREEN='\033[0;32m'
  local YELLOW='\033[0;33m'
  local BLUE='\033[0;34m'
  local NC='\033[0m' # No Color
  
  local color_code
  
  case "$color" in
    "red") color_code=$RED ;;
    "green") color_code=$GREEN ;;
    "yellow") color_code=$YELLOW ;;
    "blue") color_code=$BLUE ;;
    *) color_code=$NC ;;
  esac
  
  echo -e "${color_code}$message${NC}"
}

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
  print_status "red" "This script must be run as root or with sudo"
  exit 1
fi

print_status "blue" "=== Python Package Permission Fixer ==="
print_status "blue" "This script will fix permissions on system and user Python packages"
print_status "blue" "to ensure they are accessible to the $APP_USER user."

# Detect Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
if [ -z "$PYTHON_VERSION" ]; then
  PYTHON_VERSION="3.10"  # Default fallback
  print_status "yellow" "Warning: Could not detect Python version, using default: $PYTHON_VERSION"
else
  print_status "green" "Detected Python version: $PYTHON_VERSION"
fi

# Paths to check
SYSTEM_SITE_PACKAGES="/usr/local/lib/python$PYTHON_VERSION/dist-packages"
SYSTEM_SITE_PACKAGES_ALT="/usr/lib/python$PYTHON_VERSION/dist-packages"
USER_SITE_PACKAGES="/var/opt/$APP_USER/.local/lib/python$PYTHON_VERSION/site-packages"

# Function to fix permissions for a directory
fix_permissions() {
  local dir=$1
  local issue_found=false
  
  if [ -d "$dir" ]; then
    print_status "blue" "Checking permissions in $dir..."
    
    # Find directories with incorrect permissions
    problem_dirs=$(find "$dir" -type d ! -perm -a=rx 2>/dev/null || echo "")
    
    if [ -n "$problem_dirs" ]; then
      print_status "yellow" "Found directories with incorrect permissions. Fixing..."
      find "$dir" -type d -exec chmod 755 {} \; 2>/dev/null
      issue_found=true
    fi
    
    # Find files with incorrect permissions
    problem_files=$(find "$dir" -type f ! -perm -a=r 2>/dev/null || echo "")
    
    if [ -n "$problem_files" ]; then
      print_status "yellow" "Found files with incorrect permissions. Fixing..."
      find "$dir" -type f -exec chmod 644 {} \; 2>/dev/null
      issue_found=true
    fi
    
    # Change ownership of user site-packages to APP_USER
    if [[ "$dir" == *"$APP_USER"* ]]; then
      print_status "blue" "Setting ownership of $dir to $APP_USER..."
      chown -R "$APP_USER:$APP_USER" "$dir" 2>/dev/null
      issue_found=true
    fi
    
    if [ "$issue_found" = true ]; then
      print_status "green" "Fixed permissions in $dir"
    else
      print_status "green" "No permission issues found in $dir"
    fi
  else
    print_status "yellow" "Directory $dir does not exist, skipping"
  fi
}

# Fix permissions for each directory
fix_permissions "$SYSTEM_SITE_PACKAGES"
fix_permissions "$SYSTEM_SITE_PACKAGES_ALT"
fix_permissions "$USER_SITE_PACKAGES"

# Create the .local directory for the APP_USER if it doesn't exist
if [ ! -d "/var/opt/$APP_USER/.local" ]; then
  print_status "blue" "Creating Python user directory for $APP_USER..."
  mkdir -p "/var/opt/$APP_USER/.local/lib/python$PYTHON_VERSION/site-packages"
  chown -R "$APP_USER:$APP_USER" "/var/opt/$APP_USER/.local"
  print_status "green" "Created Python user directory"
fi

# Test pip installation as APP_USER
print_status "blue" "Testing pip as $APP_USER..."
su - "$APP_USER" -c "python3 -m pip --version" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  print_status "green" "✅ pip is working correctly for $APP_USER"
else
  print_status "yellow" "pip test failed, attempting to install/upgrade pip for $APP_USER..."
  su - "$APP_USER" -c "curl https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py && python3 /tmp/get-pip.py --user"
  rm -f /tmp/get-pip.py
  
  # Test again
  su - "$APP_USER" -c "python3 -m pip --version" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    print_status "green" "✅ pip is now working correctly for $APP_USER"
  else
    print_status "red" "⚠️ Still having issues with pip for $APP_USER. Manual intervention may be required."
  fi
fi

print_status "green" "Python package permission check and fix completed"
