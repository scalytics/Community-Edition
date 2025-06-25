
# Simple script to verify tqdm installation
try:
    import tqdm
    print(f"✅ tqdm is installed")
except ImportError:
    print(f"❌ tqdm is not installed")
    print(f"To install: pip install tqdm")
