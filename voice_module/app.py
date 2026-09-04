"""
Voice AI Service Module Exporter
Allows both `uvicorn app:app` and `uvicorn app.main:app` to work seamlessly.
"""
import sys
from pathlib import Path

MODULE_ROOT = str(Path(__file__).resolve().parent)
if MODULE_ROOT not in sys.path:
    sys.path.insert(0, MODULE_ROOT)

from app.main import app

__all__ = ["app"]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8200, reload=True)
