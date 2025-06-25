#!/bin/bash
# Advanced PM2 Reset Script
# Fixes common PM2 errors including "spawn bash ENOENT" and "invalid PID" errors

# Set up colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Connect App PM2 Reset Tool ===${NC}"
echo 

# Ensure we're in the right directory
cd "$(dirname "$0")/.."
CURR_DIR="$(pwd)"
echo -e "${YELLOW}Working from directory:${NC} $CURR_DIR"
echo

# Function to check if PM2 is installed
check_pm2() {
  if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}PM2 is not installed. Installing globally...${NC}"
    npm install -g pm2
    if [ $? -ne 0 ]; then
      echo -e "${RED}Failed to install PM2. Please install it manually.${NC}"
      exit 1
    fi
  fi
}

# Function to check if an app is running in PM2
is_app_running() {
  local app_name=$1
  pm2 list | grep -q "$app_name"
  return $?
}

# Check PM2 status
check_pm2

# Check if ecosystem.config.js exists
if [ ! -f "$CURR_DIR/ecosystem.config.js" ]; then
  echo -e "${RED}ecosystem.config.js not found. Creating from template...${NC}"
  
  # Check if we have a pm2.sh module to create the config
  if [ -f "$CURR_DIR/saas/modules/pm2.sh" ]; then
    echo -e "${YELLOW}Using pm2.sh module to create ecosystem.config.js${NC}"
    source "$CURR_DIR/saas/modules/pm2.sh"
    source "$CURR_DIR/saas/modules/utils.sh" 2>/dev/null || true
    source "$CURR_DIR/saas/modules/env.sh" 2>/dev/null || true
    
    # Create the ecosystem config
    create_ecosystem_config "$CURR_DIR" "connect" "3000" "$CURR_DIR/venv"
  else
    # Create a basic ecosystem.config.js file
    echo -e "${YELLOW}Creating basic ecosystem.config.js${NC}"
    cat > "$CURR_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'connect',
    script: '$CURR_DIR/scripts/pm2-wrapper.sh',
    interpreter: 'bash',
    cwd: '$CURR_DIR',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_file: '.env',
    kill_timeout: 3000,
    wait_ready: true,
    listen_timeout: 10000,
    max_restarts: 10,
    restart_delay: 3000,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      PYTHON_CMD: '$CURR_DIR/scripts/python-wrapper.sh',
      LD_LIBRARY_PATH: '$CURR_DIR/bin/llama:$CURR_DIR/bin/llama/lib:\${LD_LIBRARY_PATH}',
      PYTHON_VENV_DIR: '$CURR_DIR/venv',
      PATH: '/usr/local/bin:/usr/bin:/bin:$CURR_DIR/bin:$CURR_DIR/scripts:$CURR_DIR/venv/bin:\${PATH}'
    }
  }]
};
EOF
  fi
fi

# Check if pm2-wrapper.sh exists and is executable
if [ ! -f "$CURR_DIR/scripts/pm2-wrapper.sh" ]; then
  echo -e "${RED}pm2-wrapper.sh not found. Creating it...${NC}"
  
  # Create the wrapper script
  cat > "$CURR_DIR/scripts/pm2-wrapper.sh" << EOF
#!/bin/bash
# PM2 wrapper script to ensure correct environment setup

# Get the directory where this script is located
SCRIPT_DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_DIR="\$( cd "\$SCRIPT_DIR/.." &> /dev/null && pwd )"

# Set absolute paths to essential binaries
BASH_BIN="/bin/bash"
NODE_BIN="\$(which node)"

# Default Python virtual environment path
VENV_DIR="\${PYTHON_VENV_DIR:-\$APP_DIR/venv}"

echo "Starting app with PM2 wrapper from \$(pwd)" >&2
echo "APP_DIR: \$APP_DIR" >&2
echo "VENV_DIR: \$VENV_DIR" >&2
echo "NODE_BIN: \$NODE_BIN" >&2

# Validate the Python environment
if [ -d "\$VENV_DIR" ] && [ -f "\$VENV_DIR/bin/python" ]; then
  echo "Found Python virtual environment at \$VENV_DIR" >&2
  # Export the Python environment for the app
  export PYTHON_VENV_DIR="\$VENV_DIR"
  export PATH="\$VENV_DIR/bin:\$PATH"
  export PYTHONPATH="\$VENV_DIR:\$PYTHONPATH"
else
  echo "WARNING: Python virtual environment not found at \$VENV_DIR" >&2
  # Continue anyway, as the app might not need Python
fi

# Validate the Node.js environment
if [ -z "\$NODE_BIN" ]; then
  echo "ERROR: Node.js binary not found in PATH" >&2
  exit 1
fi

# Make sure server.js exists
SERVER_JS="\$APP_DIR/server.js"
if [ ! -f "\$SERVER_JS" ]; then
  echo "ERROR: server.js not found at \$SERVER_JS" >&2
  exit 1
fi

# Export essential environment variables
export PATH="/usr/local/bin:/usr/bin:/bin:\$PATH:\$APP_DIR/bin:\$APP_DIR/scripts:\$VENV_DIR/bin"
export LD_LIBRARY_PATH="\$APP_DIR/bin/llama:\$APP_DIR/bin/llama/lib:\${LD_LIBRARY_PATH}"

# Execute the application's main file
cd "\$APP_DIR"
echo "Starting server with Node.js..." >&2
exec "\$NODE_BIN" "\$SERVER_JS"
EOF
  
  # Make the wrapper script executable
  chmod +x "$CURR_DIR/scripts/pm2-wrapper.sh"
  echo -e "${GREEN}Created and made pm2-wrapper.sh executable${NC}"
fi

# Stop any running PM2 processes
echo -e "${YELLOW}Stopping all PM2 processes...${NC}"
pm2 stop all

# Check for and kill zombie PM2 processes
echo -e "${YELLOW}Checking for zombie PM2 processes...${NC}"
for pid in $(pgrep -f "pm2" 2>/dev/null); do
  if [ "$pid" != "$$" ]; then
    echo -e "Found PM2 process with PID ${RED}$pid${NC}, killing it..."
    kill -9 $pid 2>/dev/null || true
  fi
done

# Clear PM2 saved configuration
echo -e "${YELLOW}Clearing PM2 saved configuration...${NC}"
pm2 delete all
pm2 save --force

# Reset PM2 daemon
echo -e "${YELLOW}Resetting PM2 daemon...${NC}"
pm2 kill
sleep 2

# Start PM2 daemon
echo -e "${YELLOW}Starting PM2 daemon...${NC}"
pm2 ping > /dev/null || pm2 resurrect

# Ensure the logs directory exists
mkdir -p logs

# Start the app using the ecosystem file
echo -e "${YELLOW}Starting application with correct configuration...${NC}"
echo -e "Using ecosystem.config.js with app name: ${BLUE}connect${NC}"
pm2 start ecosystem.config.js

# Save new PM2 configuration
echo -e "${YELLOW}Saving new PM2 configuration...${NC}"
pm2 save

echo
echo -e "${GREEN}PM2 configuration reset completed successfully!${NC}"
echo
echo -e "You can check the application status with: ${BLUE}pm2 status${NC}"
echo -e "You can view the application logs with: ${BLUE}pm2 logs connect${NC}"
echo

# Check if the app is running
if is_app_running "connect"; then
  echo -e "${GREEN}Application is running!${NC}"
else
  echo -e "${RED}Application failed to start. Check logs with: ${BLUE}pm2 logs connect${NC}${NC}"
fi

echo
echo -e "${YELLOW}NOTE:${NC} If you had other applications managed by PM2, you'll need to restart them manually."
