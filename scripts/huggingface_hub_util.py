
# Simple script to verify huggingface_hub installation
try:
    import huggingface_hub
    print(f"✅ huggingface_hub is installed")
except ImportError:
    print(f"❌ huggingface_hub is not installed")
    print(f"To install: pip install huggingface_hub")
