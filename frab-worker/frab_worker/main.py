"""Phase-0 CLI: run the deterministic investigation for one demo scenario.

Usage:
    python -m frab_worker.main SCN01

This resolves the scenario's trigger transaction id, computes features and the
risk score deterministically, and prints the auditable breakdown. The scenario's
expected_action is shown ONLY as an oracle for comparison — it is never fed into
the computation.
"""

from __future__ import annotations

import csv
import json
import os
import sys

from .data_access import BankData, _default_data_dir
from .supervisor import Supervisor


def _load_scenarios(data_dir: str) -> dict[str, dict[str, str]]:
    """Read demo_runs.csv directly as an ORACLE (not via the data-access layer,
    which forbids it as an investigation input)."""
    path = os.path.join(data_dir, "demo_runs.csv")
    with open(path, newline="", encoding="utf-8") as fh:
        return {r["scenario_id"]: r for r in csv.DictReader(fh)}


def run_scenario(scenario_id: str) -> dict:
    data_dir = _default_data_dir()
    scenarios = _load_scenarios(data_dir)
    if scenario_id not in scenarios:
        raise SystemExit(f"Unknown scenario '{scenario_id}'. Known: {sorted(scenarios)}")

    scn = scenarios[scenario_id]
    trigger_id = scn["trigger_transaction_id"]

    bank = BankData(data_dir)
    sup = Supervisor(bank=bank)
    result = sup.investigate(scn["case_id"], trigger_id)

    out = result.to_dict()
    # oracle-only fields, for human comparison — NOT used in computation:
    out["_oracle_expected_action"] = scn["expected_action"]
    out["_oracle_severity"] = scn["severity"]
    return out


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python -m frab_worker.main <SCENARIO_ID>", file=sys.stderr)
        return 2
    result = run_scenario(argv[1])
    print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
