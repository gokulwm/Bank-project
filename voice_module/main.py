"""
Voice AI Service Entrypoint (app.main).
Allows running with:
- uvicorn app.main:app --port 8200
- uvicorn app:app --port 8200
- python app.py
"""
from app import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8200)
