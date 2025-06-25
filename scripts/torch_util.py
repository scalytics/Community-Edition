
# Simple script to verify torch installation
try:
    import torch
    print(f"✅ torch is installed")
except ImportError:
    print(f"❌ torch is not installed")
    print(f"To install: pip install torch")
