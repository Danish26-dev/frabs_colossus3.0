"""Risk-score tests: determinism, weight integrity, band + critical-signal logic."""

from __future__ import annotations

import pytest

from frab_worker.config import load_config
from frab_worker.features import FeatureResult
from frab_worker.scoring import compute_risk_score


def _fake_features(values: dict[str, float]) -> dict[str, FeatureResult]:
    return {name: FeatureResult(name, v) for name, v in values.items()}


def test_weights_sum_to_one():
    cfg = load_config()
    assert abs(sum(cfg["weights"].values()) - 1.0) < 1e-9


def test_all_zero_features_score_zero(cfg):
    feats = _fake_features({k: 0.0 for k in cfg["weights"]})
    rs = compute_risk_score(feats, cfg)
    assert rs.score == 0.0
    assert rs.level == "LOW"
    assert rs.critical_signals == []


def test_all_max_features_score_one_high(cfg):
    feats = _fake_features({k: 1.0 for k in cfg["weights"]})
    rs = compute_risk_score(feats, cfg)
    assert rs.score == pytest.approx(1.0)
    assert rs.level == "HIGH"


def test_known_weighted_sum(cfg):
    """Deterministic: known feature values -> exact known score."""
    feats = _fake_features({
        "amount_deviation": 1.0,      # 0.25
        "velocity": 0.0,              # 0.0
        "beneficiary_novelty": 1.0,   # 0.15
        "behaviour_deviation": 1.0,   # 0.15
        "network_risk": 0.0,          # 0.0
        "previous_alerts": 0.0,       # 0.0
    })
    rs = compute_risk_score(feats, cfg)
    assert rs.score == pytest.approx(0.55)


def test_critical_signal_raises_level(cfg):
    """A single maxed critical feature escalates to HIGH even when the weighted
    band is only MEDIUM/LOW."""
    feats = _fake_features({
        "amount_deviation": 0.0,
        "velocity": 1.0,             # critical -> HIGH
        "beneficiary_novelty": 0.0,
        "behaviour_deviation": 0.0,
        "network_risk": 0.0,
        "previous_alerts": 0.0,
    })
    rs = compute_risk_score(feats, cfg)
    assert rs.band_level == "LOW"        # weighted score alone is low
    assert rs.level == "HIGH"            # but velocity is a critical signal
    assert any(c["feature"] == "velocity" for c in rs.critical_signals)


def test_score_is_deterministic(cfg):
    feats = _fake_features({k: 0.5 for k in cfg["weights"]})
    a = compute_risk_score(feats, cfg).score
    b = compute_risk_score(feats, cfg).score
    assert a == b


def test_missing_feature_raises(cfg):
    feats = _fake_features({"amount_deviation": 1.0})  # incomplete
    with pytest.raises(KeyError):
        compute_risk_score(feats, cfg)
