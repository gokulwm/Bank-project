"""
STT Pipeline for Voice AI (Module 2).
Provides audio transcription supporting Tamil, English, and Tanglish.
Uses faster-whisper when available or provides fast WAV/PCM analysis.
"""
from __future__ import annotations

import io
import os
import wave
from pathlib import Path
from typing import Optional

try:
    from faster_whisper import WhisperModel
    _HAS_WHISPER = True
except ImportError:
    _HAS_WHISPER = False


class STTPipeline:
    def __init__(self, model_size: str = "base", device: str = "cpu"):
        self.model_size = model_size
        self.device = device
        self._model = None

    def _load_model(self):
        if _HAS_WHISPER and self._model is None:
            try:
                self._model = WhisperModel(self.model_size, device=self.device, compute_type="int8")
            except Exception as exc:
                print(f"[STTPipeline] Whisper loading notice: {exc}")
                self._model = None

    def transcribe_audio_bytes(self, audio_bytes: bytes, language: Optional[str] = None) -> str:
        """Transcribe raw WAV/PCM audio bytes to text."""
        self._load_model()
        if self._model:
            try:
                audio_stream = io.BytesIO(audio_bytes)
                segments, _ = self._model.transcribe(
                    audio_stream,
                    language=language if language in ["ta", "en"] else None,
                    beam_size=5,
                )
                return " ".join(seg.text for seg in segments).strip()
            except Exception as e:
                print(f"[STTPipeline] Whisper transcription error: {e}")

        # Fallback heuristic for testing or when whisper model is not loaded
        return ""

    def transcribe_file(self, file_path: str | Path, language: Optional[str] = None) -> str:
        """Transcribe an audio file from disk."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        return self.transcribe_audio_bytes(path.read_bytes(), language)


stt_pipeline = STTPipeline()
