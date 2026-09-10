import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pytest
from app.face_service import FaceAuthEngine


def test_empty_gallery_fails():
    engine = FaceAuthEngine()
    probe = np.ones(352, dtype=np.float32)
    probe /= np.linalg.norm(probe)
    result = engine.match_gallery(probe, [])
    assert result.passed is False
    assert result.customer_id is None
    assert result.score == 0.0


def test_unmatched_face_fails():
    engine = FaceAuthEngine()
    # probe vector orthogonal to enrolled vector
    probe = np.zeros(352, dtype=np.float32)
    probe[0] = 1.0

    enrolled = np.zeros(352, dtype=np.float32)
    enrolled[1] = 1.0

    gallery = [{"customer_id": "acc_00981234", "embedding": enrolled.tolist()}]
    result = engine.match_gallery(probe, gallery)
    assert result.passed is False
    assert result.customer_id is None
    assert result.score < 0.6


def test_matched_face_passes():
    engine = FaceAuthEngine()
    enrolled = np.random.randn(352).astype(np.float32)
    enrolled /= np.linalg.norm(enrolled)

    # Identical or near-identical face embedding
    probe = enrolled.copy()

    gallery = [
        {"customer_id": "acc_00981234", "embedding": enrolled.tolist()},
        {"customer_id": "acc_00981235", "embedding": (-enrolled).tolist()},
    ]
    result = engine.match_gallery(probe, gallery)
    assert result.passed is True
    assert result.customer_id == "acc_00981234"
    assert result.score > 0.99
