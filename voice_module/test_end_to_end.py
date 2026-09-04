"""
Unit and Integration tests for Voice AI (Module 2).
Tests intent detection, amount extraction in Tamil/English/Tanglish,
and contract adherence.
"""
from __future__ import annotations

import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).parent))

from intent_parser import (
    CONFIDENCE_THRESHOLD,
    detect_intent,
    extract_amount,
    parse_utterance,
)


def test_confidence_threshold_is_0_7():
    assert CONFIDENCE_THRESHOLD == 0.7


def test_withdraw_intent_english():
    text = "I want to withdraw 5000 rupees"
    intent, conf = detect_intent(text)
    amount = extract_amount(text)
    assert intent == "withdraw"
    assert conf >= 0.7
    assert amount == 5000


def test_withdraw_intent_tamil_words():
    text = "ஐந்தாயிரம் ரூபாய் எடுக்க வேண்டும்"
    intent, conf = detect_intent(text)
    amount = extract_amount(text)
    assert intent == "withdraw"
    assert conf >= 0.7
    assert amount == 5000


def test_deposit_intent_tanglish():
    text = "Enakku 10000 rupees deposit pannanum"
    intent, conf = detect_intent(text)
    amount = extract_amount(text)
    assert intent == "deposit"
    assert conf >= 0.7
    assert amount == 10000


def test_balance_check_intent():
    text = "Check my account balance"
    intent, conf = detect_intent(text)
    assert intent == "balance_check"
    assert conf >= 0.7


def test_parse_utterance_matches_contract():
    session_id = "test-session-uuid-1234"
    res = parse_utterance(session_id, "Withdraw 5000 rupees", "en")
    assert res["session_id"] == session_id
    assert res["status"] == "ok"
    assert res["intent"] == "withdraw"
    assert res["requires_auth"] is True
    assert res["entities"]["amount"] == 5000
    assert res["confidence"] >= 0.7


def test_unknown_intent_drops_below_threshold():
    res = parse_utterance("test-session", "What is the weather today?")
    assert res["intent"] == "unknown"
    assert res["confidence"] < 0.7
