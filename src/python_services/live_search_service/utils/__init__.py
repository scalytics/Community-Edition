import fcntl
import logging
import os
import time

logger = logging.getLogger(__name__)

class FileLock:
    def __init__(self, lock_file_path):
        self.lock_file_path = lock_file_path
        self._lock_file = None

    def __enter__(self):
        self._lock_file = open(self.lock_file_path, 'w')
        try:
            fcntl.flock(self._lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (IOError, BlockingIOError):
            logger.warning(f"Process {os.getpid()} could not acquire lock on {self.lock_file_path}, another process is holding it.")
            raise
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._lock_file:
            fcntl.flock(self._lock_file, fcntl.LOCK_UN)
            self._lock_file.close()
            self._lock_file = None
            try:
                os.remove(self.lock_file_path)
            except OSError:
                pass

def setup_logger(name, level=logging.INFO):
    """Function to set up a logger."""
    logger = logging.getLogger(name)
    
    # Map string level to logging constants
    log_level = level
    if isinstance(level, str):
        log_level = getattr(logging, level.upper(), logging.INFO)
        
    logger.setLevel(log_level)
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    if not logger.handlers:
        logger.addHandler(handler)
    return logger
