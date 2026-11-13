"""LLM abstraction tests: offline determinism, JSON extraction, repair loop."""

from __future__ import annotations

import pytest

from frab_worker.llm import (
    LLMError,
    OfflineLLMClient,
    extract_json,
    generate_json,
    get_client,
)


def test_default_client_is_offline(monkeypatch):
    monkeypatch.delenv("FRAB_LLM", raising=False)
    assert get_client().name == "offline"


def test_attested_without_config_falls_back_to_offline(monkeypatch):
    # requesting attested mode without URL/hash (or SDK) must not crash —
    # it degrades to offline so the worker stays functional.
    monkeypatch.setenv("FRAB_LLM", "attested")
    monkeypatch.delenv("FRAB_ATTESTED_URL", raising=False)
    monkeypatch.delenv("FRAB_ATTESTED_IMAGE_HASH", raising=False)
    assert get_client().name == "offline"


def test_offline_echoes_facts_block():
    client = OfflineLLMClient()
    prompt = 'Narrate this.\n<<FACTS>>{"a": 1, "b": "x"}<<END>>'
    out = client.complete(prompt)
    assert extract_json(out) == {"a": 1, "b": "x"}


def test_offline_no_facts_returns_empty_object():
    client = OfflineLLMClient()
    assert extract_json(client.complete("no facts here")) == {}


def test_offline_is_deterministic():
    client = OfflineLLMClient()
    p = '<<FACTS>>{"x": 42}<<END>>'
    assert client.complete(p) == client.complete(p)


def test_extract_json_from_surrounding_text():
    txt = 'Here is the result: {"k": "v"} thanks'
    assert extract_json(txt) == {"k": "v"}


def test_generate_json_validates():
    client = OfflineLLMClient()

    def validate(obj):
        if "risk" not in obj:
            raise ValueError("missing risk")

    good = generate_json(client, '<<FACTS>>{"risk": "HIGH"}<<END>>', validate=validate)
    assert good["risk"] == "HIGH"


def test_generate_json_repair_then_fail():
    client = OfflineLLMClient()

    def always_bad(obj):
        raise ValueError("never valid")

    with pytest.raises(LLMError):
        generate_json(
            client, '<<FACTS>>{"x": 1}<<END>>', validate=always_bad, max_retries=1
        )
