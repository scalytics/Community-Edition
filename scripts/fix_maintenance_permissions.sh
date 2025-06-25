#!/bin/bash
# Fix permissions for maintenance-related directories
# Sets proper ownership and permissions for backups and models directories
# This script should be run as root or with sudo

# Get script location for relative paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"

# Determine environment
if [ -f "/etc/nginx/sites-enabled/default" ]; then
  ENVIRONMENT="production"
  # Default production values
  APP_USER="${APP_USER:-sconnect}"
  WEB_GROUP="www-data"
else
  ENVIRONMENT="development"
  # For development, use current user
  APP_USER="$(whoami)"
  WEB_GROUP="$(id -gn)"
fi

# Color and log setup
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

log() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_error() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR:${NC} $*"; }
log_success() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}SUCCESS:${NC} $*"; }
log_warning() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARNING:${NC} $*"; }

# Run command with sudo if not already root
run_sudo() {
  if [ "$(id -u)" == "0" ]; then
    "$@"
  else
    sudo "$@"
  fi
}

# Fix permissions for the data/backups directory
fix_backups_permissions() {
  log "Fixing permissions for backups directory..."
  
  local data_dir="$APP_ROOT/data"
  local backups_dir="$data_dir/backups"
  
  # Make sure directories exist
  if [ ! -d "$data_dir" ]; then
    log_warning "Data directory does not exist, creating: $data_dir"
    run_sudo mkdir -p "$data_dir"
  fi
  
  if [ ! -d "$backups_dir" ]; then
    log_warning "Backups directory does not exist, creating: $backups_dir"
    run_sudo mkdir -p "$backups_dir"
  fi
  
  # Set ownership
  log "Setting ownership to $APP_USER:$WEB_GROUP for $backups_dir"
  run_sudo chown -R "$APP_USER:$WEB_GROUP" "$backups_dir"
  
  # Set permissions - group writable, sticky bit to maintain group ownership
  log "Setting directory permissions to 2775 (rwxrwsr-x) for $backups_dir"
  run_sudo chmod 2775 "$backups_dir"
  
  # Set permissions for files (664 = rw-rw-r--)
  log "Setting file permissions to 664 (rw-rw-r--) for files in $backups_dir"
  if [ -n "$(ls -A "$backups_dir" 2>/dev/null)" ]; then
    run_sudo find "$backups_dir" -type f -exec chmod 664 {} \;
  else
    log "No files found in $backups_dir"
  fi
  
  # Verify permissions
  local result=$(ls -ld "$backups_dir" | awk '{print $1}')
  log "Backups directory permissions are now: $result"
  
  # Show a sample file permission if any exist
  if [ -n "$(ls -A "$backups_dir" 2>/dev/null)" ]; then
    local sample_file=$(ls -1 "$backups_dir" | head -1)
    if [ -n "$sample_file" ]; then
      log "Sample file permissions ($(ls -l "$backups_dir/$sample_file" | awk '{print $9}')): $(ls -l "$backups_dir/$sample_file" | awk '{print $1}')"
    fi
  fi
  
  log_success "Backups directory permissions fixed"
}

# Fix permissions for the models directory
fix_models_permissions() {
  log "Fixing permissions for models directory..."
  
  local models_dir="$APP_ROOT/models"
  
  # Make sure directory exists
  if [ ! -d "$models_dir" ]; then
    log_warning "Models directory does not exist, creating: $models_dir"
    run_sudo mkdir -p "$models_dir"
  fi
  
  # Set ownership
  log "Setting ownership to $APP_USER:$WEB_GROUP for $models_dir"
  run_sudo chown -R "$APP_USER:$WEB_GROUP" "$models_dir"
  
  # Set permissions - group writable, sticky bit to maintain group ownership
  log "Setting directory permissions to 2775 (rwxrwsr-x) for $models_dir"
  run_sudo chmod 2775 "$models_dir"
  
  # Set permissions for subdirectories (2775 = drwxrwsr-x)
  log "Setting permissions to 2775 (rwxrwsr-x) for subdirectories in $models_dir"
  if [ -n "$(find "$models_dir" -type d 2>/dev/null)" ]; then
    run_sudo find "$models_dir" -type d -exec chmod 2775 {} \;
  fi
  
  # Set permissions for files (664 = rw-rw-r--)
  log "Setting file permissions to 664 (rw-rw-r--) for files in $models_dir"
  if [ -n "$(find "$models_dir" -type f 2>/dev/null)" ]; then
    run_sudo find "$models_dir" -type f -exec chmod 664 {} \;
  else
    log "No files found in $models_dir"
  fi
  
  # Verify permissions
  local result=$(ls -ld "$models_dir" | awk '{print $1}')
  log "Models directory permissions are now: $result"
  
  # Show a sample file permission if any exist
  if [ -n "$(find "$models_dir" -type f 2>/dev/null | head -1)" ]; then
    local sample_file=$(find "$models_dir" -type f | head -1)
    if [ -n "$sample_file" ]; then
      log "Sample file permissions ($(basename "$sample_file")): $(ls -l "$sample_file" | awk '{print $1}')"
    fi
  fi
  
  log_success "Models directory permissions fixed"
}

# Main script execution
log "Running maintenance permissions fix script in $ENVIRONMENT environment"
log "Application root: $APP_ROOT"
log "User: $APP_USER, Web group: $WEB_GROUP"

# Check if we need to get sudo rights
if [ "$(id -u)" != "0" ]; then
  log_warning "This script needs administrative privileges to set permissions"
  log_warning "You may be prompted for your password"
fi

# Fix permissions for specific directories
fix_backups_permissions
fix_models_permissions

log_success "All maintenance-related permissions have been fixed"
log "If you're still seeing permission issues in the maintenance tab:"
log "1. Ensure the web server is running as the expected user/group (default: www-data)"
log "2. Verify there are no SELinux or AppArmor restrictions in place"
log "3. Check that the web server has execute permission on all parent directories"

if [ "$ENVIRONMENT" == "production" ]; then
  # Restart services in production to apply changes
  log "Consider restarting the web server to apply changes:"
  log "sudo systemctl restart nginx"
fi
