@echo off
REM Setup script for Hugging Face model management on Windows

echo Setting up Hugging Face model management...

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Python is required but not installed. Please install Python and try again.
    exit /b 1
)

REM Install required Python packages
echo Installing required Python packages...
python -m pip install -r requirements.txt

REM Check if HUGGINGFACE_API_KEY is set in environment
set | findstr HUGGINGFACE_API_KEY >nul
if %ERRORLEVEL% NEQ 0 (
    echo Note: HUGGINGFACE_API_KEY environment variable is not set.
    echo While not required, setting this variable will allow access to gated models.
    echo You can get an API key from https://huggingface.co/settings/tokens
    echo Then add it to your environment variables:
    echo setx HUGGINGFACE_API_KEY your_key_here
)

REM Create models directory if it doesn't exist
if not exist "..\models" (
    echo Creating models directory...
    mkdir ..\models
)

echo Setup complete! You can now use the Hugging Face model management features.
pause
