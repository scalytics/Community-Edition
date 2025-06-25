#!/bin/bash
# Scalytics Community Edition Startup Script

# --- Configuration ---
FRONTEND_DIR="frontend"
VENV_DIR="venv"
REQUIREMENTS_FILE="scripts/requirements.txt"

# --- Text Formatting ---
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
BLUE="\033[34m"
CYAN="\033[36m"

# --- Helper Functions ---
print_header() {
    echo -e "${BOLD}=============================================================${RESET}"
    echo -e "${BOLD}  $1${RESET}"
    echo -e "${BOLD}=============================================================${RESET}"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed. Please install it and try again.${RESET}"
        exit 1
    fi
}

# --- Cleanup Function ---
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${RESET}"
    # Kill all child processes of this script
    pkill -P $$
    echo -e "${BOLD}All services stopped.${RESET}"
    exit 0
}

trap cleanup SIGINT

# --- Main Script ---
print_header "🚀 Starting Scalytics Community Edition"

# 1. Dependency Checks
print_header "🔎 Checking Dependencies"
check_command node
check_command npm
check_command python3
echo -e "${GREEN}All required commands (node, npm, python3) are available.${RESET}"

# 2. Python Virtual Environment Setup
print_header "🐍 Setting up Python Virtual Environment"
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}Python virtual environment not found. Creating one at './$VENV_DIR'...${RESET}"
    python3 -m venv $VENV_DIR
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create Python virtual environment.${RESET}"
        exit 1
    fi
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to activate Python virtual environment.${RESET}"
    exit 1
fi
echo -e "${GREEN}Python virtual environment activated.${RESET}"

# 3. Install/Update Python Dependencies
echo -e "${CYAN}Checking and installing Python dependencies from $REQUIREMENTS_FILE...${RESET}"
python3 -m pip install -r "$REQUIREMENTS_FILE"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install Python dependencies.${RESET}"
    exit 1
fi
echo -e "${GREEN}Python dependencies are up to date.${RESET}"

# 4. Install/Update Node.js Dependencies
print_header "📦 Setting up Node.js Dependencies"
echo -e "${CYAN}Checking and installing backend Node.js dependencies...${RESET}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install backend Node.js dependencies.${RESET}"
    exit 1
fi
echo -e "${GREEN}Backend dependencies are up to date.${RESET}"

echo -e "${CYAN}Checking and installing frontend Node.js dependencies...${RESET}"
npm install --prefix "$FRONTEND_DIR"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to install frontend Node.js dependencies.${RESET}"
    exit 1
fi
echo -e "${GREEN}Frontend dependencies are up to date.${RESET}"

# 5. Start Services
print_header "🚀 Launching Services"

# Start Backend Server
echo -e "${BLUE}Starting backend server...${RESET}"
npm start &
BACKEND_PID=$!
sleep 3
if ! ps -p $BACKEND_PID > /dev/null; then
  echo -e "${RED}Failed to start backend server. Check logs for details.${RESET}"
  exit 1
fi
echo -e "${GREEN}Backend server started successfully (PID: $BACKEND_PID).${RESET}"

# Start Python Service
echo -e "${CYAN}Starting Python Live Search service...${RESET}"
python -m uvicorn src.python_services.live_search_service.main:app --host 0.0.0.0 --port 8001 --reload --log-level debug &
PYTHON_PID=$!
sleep 15
if ! ps -p $PYTHON_PID > /dev/null; then
  echo -e "${RED}Failed to start Python service. Check logs for details.${RESET}"
  kill $BACKEND_PID
  exit 1
fi
echo -e "${GREEN}Python service started successfully (PID: $PYTHON_PID).${RESET}"

# Start Frontend Server
echo -e "${GREEN}Starting frontend server...${RESET}"
npm start --prefix "$FRONTEND_DIR" &
FRONTEND_PID=$!
sleep 3
if ! ps -p $FRONTEND_PID > /dev/null; then
  echo -e "${RED}Failed to start frontend server. Check logs for details.${RESET}"
  kill $BACKEND_PID
  kill $PYTHON_PID
  exit 1
fi
echo -e "${GREEN}Frontend server started successfully (PID: $FRONTEND_PID).${RESET}"

print_header "✅ All Services Running"
echo -e "${BOLD}Access the application at: http://localhost:3001${RESET}"
echo -e "${YELLOW}Press Ctrl+C to stop all services.${RESET}"

# Wait for all background processes to finish
wait
