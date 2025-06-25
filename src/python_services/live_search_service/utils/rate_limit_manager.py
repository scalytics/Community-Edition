import json
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
import asyncio

from ..utils import setup_logger

logger = setup_logger(__name__)

# Define the path to the ignore list file relative to this file's directory
# Assuming this file is in 'utils', and 'data' is a sibling of 'utils'
# Adjust if the project structure is different or if a more robust path mechanism is needed.
# For this specific case, the file will be in deep_search_service/data/
# So, from utils, go up one level to deep_search_service, then into data.
IGNORE_LIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
IGNORE_LIST_FILE = os.path.join(IGNORE_LIST_DIR, "rate_limit_ignore_list.json")
DEFAULT_IGNORE_DURATION_SECONDS = 30 * 60  # 30 minutes

class RateLimitManager:
    def __init__(self, ignore_file_path: str = IGNORE_LIST_FILE, default_duration_seconds: int = DEFAULT_IGNORE_DURATION_SECONDS):
        self.ignore_file_path = ignore_file_path
        self.default_duration_seconds = default_duration_seconds
        self._lock = asyncio.Lock()
        self._ensure_directory()

    def _ensure_directory(self):
        """Ensures the directory for the ignore list file exists."""
        dir_name = os.path.dirname(self.ignore_file_path)
        if not os.path.exists(dir_name):
            try:
                os.makedirs(dir_name, exist_ok=True)
                logger.info(f"Created directory for rate limit ignore list: {dir_name}")
            except Exception as e:
                logger.error(f"Failed to create directory {dir_name}: {e}", exc_info=True)

    async def _load_ignore_list(self) -> Dict[str, str]:
        """Loads the ignore list from the JSON file."""
        async with self._lock:
            if not os.path.exists(self.ignore_file_path):
                return {}
            try:
                with open(self.ignore_file_path, 'r') as f:
                    data = json.load(f)
                    if not isinstance(data, dict):
                        logger.warning(f"Ignore list file {self.ignore_file_path} does not contain a valid dictionary. Returning empty list.")
                        return {}
                    return data
            except json.JSONDecodeError:
                logger.error(f"Error decoding JSON from {self.ignore_file_path}. Returning empty list.", exc_info=True)
                return {}
            except Exception as e:
                logger.error(f"Error loading ignore list from {self.ignore_file_path}: {e}", exc_info=True)
                return {}

    async def _save_ignore_list(self, ignore_list: Dict[str, str]):
        """Saves the ignore list to the JSON file."""
        async with self._lock:
            try:
                with open(self.ignore_file_path, 'w') as f:
                    json.dump(ignore_list, f, indent=4)
            except Exception as e:
                logger.error(f"Error saving ignore list to {self.ignore_file_path}: {e}", exc_info=True)

    async def add_or_update_provider(self, provider_name: str, duration_seconds: Optional[int] = None):
        """Adds or updates a provider in the ignore list with an expiry timestamp."""
        if not provider_name:
            logger.warning("Attempted to add provider with no name to ignore list.")
            return

        effective_duration = duration_seconds if duration_seconds is not None else self.default_duration_seconds
        expiry_time = datetime.now(timezone.utc) + timedelta(seconds=effective_duration)
        expiry_iso = expiry_time.isoformat()

        ignore_list = await self._load_ignore_list()
        ignore_list[provider_name] = expiry_iso
        await self._save_ignore_list(ignore_list)
        logger.info(f"Provider '{provider_name}' added/updated in ignore list. Expires at: {expiry_iso}")

    async def get_ignored_providers(self) -> Dict[str, datetime]:
        """Returns a dictionary of currently ignored providers and their expiry times (UTC)."""
        ignore_list_raw = await self._load_ignore_list()
        ignored_providers: Dict[str, datetime] = {}
        now_utc = datetime.now(timezone.utc)
        
        needs_resave = False
        providers_to_remove = []

        for provider, expiry_iso in ignore_list_raw.items():
            try:
                expiry_dt = datetime.fromisoformat(expiry_iso)
                # Ensure expiry_dt is timezone-aware (UTC) if it's naive fromisoformat
                if expiry_dt.tzinfo is None:
                    expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)
                
                if expiry_dt > now_utc:
                    ignored_providers[provider] = expiry_dt
                else:
                    # Entry has expired, mark for removal
                    providers_to_remove.append(provider)
                    needs_resave = True
            except ValueError:
                logger.warning(f"Invalid ISO format for provider '{provider}' expiry '{expiry_iso}'. Marking for removal.")
                providers_to_remove.append(provider)
                needs_resave = True
        
        if needs_resave:
            for provider_to_remove in providers_to_remove:
                if provider_to_remove in ignore_list_raw:
                    del ignore_list_raw[provider_to_remove]
            await self._save_ignore_list(ignore_list_raw)
            logger.info(f"Cleaned up expired/invalid entries from ignore list: {providers_to_remove}")
            
        return ignored_providers

    async def is_provider_ignored(self, provider_name: str) -> bool:
        """Checks if a specific provider is currently ignored (not expired)."""
        ignored_providers = await self.get_ignored_providers()
        return provider_name in ignored_providers

    async def remove_provider(self, provider_name: str):
        """Removes a provider from the ignore list."""
        ignore_list = await self._load_ignore_list()
        if provider_name in ignore_list:
            del ignore_list[provider_name]
            await self._save_ignore_list(ignore_list)
            logger.info(f"Provider '{provider_name}' removed from ignore list.")
        else:
            logger.info(f"Provider '{provider_name}' not found in ignore list for removal.")

    async def clear_all_ignored_providers(self):
        """Clears all providers from the ignore list."""
        await self._save_ignore_list({})
        logger.info("All providers cleared from the ignore list.")

# --- Singleton Instance ---
_global_rate_limit_manager_instance: Optional[RateLimitManager] = None
_manager_lock = asyncio.Lock()

async def get_rate_limit_manager() -> RateLimitManager:
    """
    Returns the global singleton instance of RateLimitManager.
    Initializes it on first call.
    """
    global _global_rate_limit_manager_instance
    if _global_rate_limit_manager_instance is None:
        async with _manager_lock:
            if _global_rate_limit_manager_instance is None: # Double check after acquiring lock
                logger.info("Initializing global RateLimitManager instance.")
                _global_rate_limit_manager_instance = RateLimitManager()
    return _global_rate_limit_manager_instance

if __name__ == '__main__':
    # Example Usage (for testing the module directly)
    async def test_manager():
        # manager = RateLimitManager() # Old way
        manager = await get_rate_limit_manager() # New way
        
        print("Initial ignored:", await manager.get_ignored_providers())
        
        await manager.add_or_update_provider("duckduckgo", duration_seconds=5)
        await manager.add_or_update_provider("brave") # Default duration
        
        print("After adding:", await manager.get_ignored_providers())
        print("Is duckduckgo ignored?", await manager.is_provider_ignored("duckduckgo"))
        print("Is google ignored?", await manager.is_provider_ignored("google"))
        
        print("Waiting for 6 seconds for duckduckgo to expire...")
        await asyncio.sleep(6)
        
        print("After DDG expiry attempt:", await manager.get_ignored_providers())
        print("Is duckduckgo ignored now?", await manager.is_provider_ignored("duckduckgo"))
        print("Is brave still ignored?", await manager.is_provider_ignored("brave"))

        await manager.remove_provider("brave")
        print("After removing brave:", await manager.get_ignored_providers())

        await manager.add_or_update_provider("bing_test", 10)
        await manager.clear_all_ignored_providers()
        print("After clearing all:", await manager.get_ignored_providers())

    asyncio.run(test_manager())
