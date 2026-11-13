"""Feature-calculation tests: known inputs -> known outputs, plus the two
critical integrity guarantees (trigger-exclusion and fan-in detection)."""

from __future__ import annotations

from frab_worker.features import extract_features


def test_trigger_excluded_from_baseline(bank, cfg):
    """SCN01: the ₹781k trigger must NOT be in the average it is compared to.
    Historical avg should be in the tens-of-thousands, not pulled up by 781k."""
    feats = extract_features("TX009955", bank, cfg)
    ad = feats["amount_deviation"]
    avg = ad.evidence["historical_avg_outgoing"]
    assert avg < 100_000, f"baseline looks contaminated by the trigger: avg={avg}"
    assert ad.evidence["ratio"] >= 10  # ~12x
    assert ad.value == 1.0


def test_amount_deviation_normalization(bank, cfg):
    feats = extract_features("TX009955", bank, cfg)
    ad = feats["amount_deviation"]
    # ratio ~12 with max_ratio 10 => clamped to 1.0
    assert ad.value == 1.0


def test_beneficiary_novelty_new(bank, cfg):
    """SCN01 destination is a brand-new beneficiary."""
    feats = extract_features("TX009955", bank, cfg)
    bn = feats["beneficiary_novelty"]
    assert bn.value == 1.0
    assert bn.evidence["prior_transactions_to_dest"] == 0


def test_beneficiary_novelty_established_scn10(bank, cfg):
    """SCN10 flagship: destination is an ESTABLISHED beneficiary (5 priors).
    This is what makes the false-positive case resolve correctly."""
    feats = extract_features("TX009991", bank, cfg)
    bn = feats["beneficiary_novelty"]
    assert bn.value == 0.0
    assert bn.evidence["prior_transactions_to_dest"] >= 1


def test_velocity_burst_scn02(bank, cfg):
    """SCN02: 8 outgoing transfers in a short window -> velocity maxes."""
    feats = extract_features("TX009963", bank, cfg)
    v = feats["velocity"]
    assert v.evidence["outgoing_count_in_window"] >= 8
    assert v.value == 1.0


def test_network_fan_in_mule_scn07(bank, cfg):
    """SCN07: 5 distinct customers converge on one destination (mule)."""
    feats = extract_features("TX009971", bank, cfg)
    nr = feats["network_risk"]
    assert nr.evidence["distinct_senders"] == 5
    assert nr.value == 1.0


def test_network_fan_in_burst_scn09(bank, cfg):
    """SCN09: cross-account burst -> multiple senders to one destination."""
    feats = extract_features("TX009982", bank, cfg)
    nr = feats["network_risk"]
    assert nr.evidence["distinct_senders"] >= 4


def test_no_false_fan_in_on_normal_case(bank, cfg):
    """SCN10 destination should NOT look like a mule (single legitimate sender)."""
    feats = extract_features("TX009991", bank, cfg)
    nr = feats["network_risk"]
    assert nr.evidence["distinct_senders"] == 1
    assert nr.value == 0.0


def test_all_features_normalized(bank, cfg):
    """Every feature value must be within [0, 1]."""
    for tx in ("TX009955", "TX009963", "TX009971", "TX009991"):
        feats = extract_features(tx, bank, cfg)
        for name, fr in feats.items():
            assert 0.0 <= fr.clamped() <= 1.0, f"{name} out of range for {tx}"
