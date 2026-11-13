"""Deterministic risk scoring (Phase 0).

Combines normalized features into a single 0..1 risk score using the weights in
config/scoring.yaml. Returns the score, the risk level, and the full component
breakdown (each weighted contribution + the raw evidence) so the UI can render a
complete "why 0.87?" panel. The LLM is never involved in producing this number.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .features import FeatureResult


@dataclass
class RiskComponent:
    name: str
    value: float           # normalized 0..1
    weight: float
    contribution: float    # value * weight
    evidence: dict[str, Any] = field(default_factory=dict)
    note: str = ""


_LEVEL_RANK = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
_RANK_LEVEL = {v: k for k, v in _LEVEL_RANK.items()}


@dataclass
class RiskScore:
    score: float                       # 0..1 weighted density
    level: str                         # LOW | MEDIUM | HIGH (may be raised by critical signals)
    band_level: str = "LOW"            # level implied by the weighted score alone
    components: list[RiskComponent] = field(default_factory=list)
    critical_signals: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "risk_score": round(self.score, 4),
            "risk_level": self.level,
            "band_level": self.band_level,
            "critical_signals": self.critical_signals,
            "components": {
                c.name: {
                    "value": round(c.value, 4),
                    "weight": c.weight,
                    "contribution": round(c.contribution, 4),
                    "evidence": c.evidence,
                    "note": c.note,
                }
                for c in self.components
            },
        }


def _level_for(score: float, cfg: dict[str, Any]) -> str:
    bands = cfg["risk_levels"]
    if score >= bands["HIGH"]:
        return "HIGH"
    if score >= bands["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def _apply_critical_signals(
    band_level: str,
    features: dict[str, FeatureResult],
    cfg: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    """Raise the level if any single feature meets its critical threshold.

    Returns the (possibly raised) level and the list of triggered signals, so
    the decision is fully auditable — the UI can show 'escalated because velocity
    hit 1.0 (8 txns in 15 min)'.
    """
    rules = cfg.get("critical_signals", {})
    level_rank = _LEVEL_RANK[band_level]
    triggered: list[dict[str, Any]] = []

    for name, rule in rules.items():
        fr = features.get(name)
        if fr is None:
            continue
        if fr.clamped() >= rule["threshold"]:
            min_rank = _LEVEL_RANK[rule["min_level"]]
            triggered.append({
                "feature": name,
                "value": round(fr.clamped(), 4),
                "threshold": rule["threshold"],
                "raised_to": rule["min_level"],
                "note": fr.note,
            })
            level_rank = max(level_rank, min_rank)

    return _RANK_LEVEL[level_rank], triggered


def compute_risk_score(
    features: dict[str, FeatureResult],
    cfg: dict[str, Any],
    *,
    pattern: dict[str, Any] | None = None,
) -> RiskScore:
    """Deterministic risk score.

    `pattern` is the optional detect_pattern() result. A confidently detected
    named financial-crime pattern (structuring, mule collection, repeated
    cash-out, velocity burst) is itself a critical signal that escalates the
    level to HIGH — this is what lets sequence-pattern scenarios (which don't
    max any single scalar feature) reach the correct disposition.
    """
    weights = cfg["weights"]
    components: list[RiskComponent] = []
    total = 0.0

    for name, weight in weights.items():
        fr = features.get(name)
        if fr is None:
            raise KeyError(f"Weighted feature '{name}' was not computed.")
        value = fr.clamped()
        contribution = value * weight
        total += contribution
        components.append(
            RiskComponent(
                name=name,
                value=value,
                weight=weight,
                contribution=contribution,
                evidence=fr.evidence,
                note=fr.note,
            )
        )

    score = max(0.0, min(1.0, total))
    band_level = _level_for(score, cfg)
    final_level, triggered = _apply_critical_signals(band_level, features, cfg)

    # A detected named pattern is a critical signal in its own right. Its
    # escalation level is PER-PATTERN (structuring/mule -> HIGH, repeated
    # cash-out/burst -> as configured), carried on the pattern dict as
    # "severity". Falls back to the config default when absent.
    pat_cfg = cfg.get("pattern_escalation", {})
    min_conf = pat_cfg.get("min_confidence", 0.75)
    if pattern and pattern.get("detected") and pattern.get("confidence", 0.0) >= min_conf:
        pat_level = pattern.get("severity") or pat_cfg.get("raise_to", "HIGH")
        triggered.append({
            "feature": "pattern:" + pattern.get("pattern", "UNKNOWN"),
            "value": round(pattern.get("confidence", 0.0), 4),
            "threshold": min_conf,
            "raised_to": pat_level,
            "note": pattern.get("note", ""),
        })
        if _LEVEL_RANK[pat_level] > _LEVEL_RANK[final_level]:
            final_level = pat_level

    return RiskScore(
        score=score,
        level=final_level,
        band_level=band_level,
        components=components,
        critical_signals=triggered,
    )
