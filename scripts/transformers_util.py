
# Simple script to verify transformers installation
try:
    import transformers
    print(f"✅ transformers is installed")
except ImportError:
    print(f"❌ transformers is not installed")
    print(f"To install: pip install transformers")
