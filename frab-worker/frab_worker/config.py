"""Scoring configuration loader.

Loads config/scoring.yaml. All feature thresholds and score weights live there
so the risk score stays explainable and tunable without code changes.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import yaml


def _default_config_path() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "config", "scoring.yaml"))


def load_config(path: str | None = None) -> dict[str, Any]:
    with open(path or _default_config_path(), encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)
    _validate(cfg)
    return cfg


def _validate(cfg: dict[str, Any]) -> None:
    weights = cfg.get("weights", {})
    total = sum(weights.values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(
            f"Risk-score weights must sum to 1.0, got {total:.6f}. "
            f"Check config/scoring.yaml."
        )
    missing = set(cfg.get("features", {})) - set(weights)
    # features without a weight are allowed (informational), but every weighted
    # feature must have a normalization block.
    unweighted = set(weights) - set(cfg.get("features", {}))
    if unweighted:
        raise ValueError(
            f"These weighted features have no normalization config: {unweighted}"
        )
    _ = missing  # informational only


@lru_cache(maxsize=1)
def default_config() -> dict[str, Any]:
    return load_config()
