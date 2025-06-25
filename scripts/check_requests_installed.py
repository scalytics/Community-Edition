
# Simple script to verify requests installation
# Renamed from requests.py to check_requests_installed.py to avoid import conflicts.
try:
    import requests
    print(f"✅ requests is installed")
except ImportError:
    print(f"❌ requests is not installed")
    print(f"To install: pip install requests")
