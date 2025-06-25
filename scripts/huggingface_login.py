#!/usr/bin/env python3
import sys
import argparse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("hf_login")

try:
    from huggingface_hub import login, logout
except ImportError:
    logger.error("huggingface_hub package not available. Please install it.")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Log in to Hugging Face Hub.")
    parser.add_argument("--token", type=str, required=True, help="Hugging Face API token.")
    args = parser.parse_args()

    if not args.token:
        logger.error("No token provided.")
        sys.exit(1)

    try:
        # The `login` function will save the token to the standard cache location
        # e.g., ~/.cache/huggingface/token
        login(token=args.token, add_to_git_credential=False)
        logger.info("Successfully logged in to Hugging Face Hub.")
        print("Login successful.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Failed to log in: {e}")
        print(f"Login failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
