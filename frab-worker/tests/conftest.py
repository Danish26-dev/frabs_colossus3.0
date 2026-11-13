"""Shared test fixtures and oracle loader.

The oracle (demo_runs.csv) is read DIRECTLY here, deliberately bypassing the
data-access layer (which forbids it). Tests may compare against the oracle;
the worker never sees it.
"""

from __future__ import annotations

import csv
import os

import pytest

from frab_worker.config import load_config
from frab_worker.data_access import BankData, _default_data_dir


@pytest.fixture(autouse=True)
def _hermetic_llm_env(monkeypatch):
    """Tests must not depend on the developer's inference settings.

    Clears the provider selection so every test starts from the offline default
    (and can never reach a metered provider), regardless of LLM_PROVIDER /
    LLM_MOCK_MODE / ZG_* in the shell. Tests that need a provider set it
    explicitly via monkeypatch.
    """
    for name in ("LLM_PROVIDER", "FRAB_LLM", "LLM_MOCK_MODE", "ZG_API_KEY",
                 "ZG_MODEL", "ZG_BASE_URL", "ZG_TRUST_MODE"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(scope="session")
def data_dir() -> str:
    return _default_data_dir()


@pytest.fixture(scope="session")
def bank(data_dir: str) -> BankData:
    return BankData(data_dir)


@pytest.fixture(scope="session")
def cfg() -> dict:
    return load_config()


@pytest.fixture(scope="session")
def oracle(data_dir: str) -> dict[str, dict[str, str]]:
    """demo_runs.csv keyed by scenario_id — TEST-ORACLE ONLY."""
    path = os.path.join(data_dir, "demo_runs.csv")
    with open(path, newline="", encoding="utf-8") as fh:
        return {r["scenario_id"]: r for r in csv.DictReader(fh)}
