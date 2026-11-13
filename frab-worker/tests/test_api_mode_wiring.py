"""Verify alert_id threads through to the data source's load_alert() in API mode,
and that CSV/offline paths are unaffected (no load_alert call)."""

from __future__ import annotations

from frab_worker.supervisor import Supervisor


class FakeAPIBank:
    """Stands in for APIDataAccess: records load_alert calls, serves one txn."""

    def __init__(self, bank):
        self._csv = bank  # delegate real lookups to the CSV bank
        self.loaded = []

    def load_alert(self, alert_id):
        self.loaded.append(alert_id)

    # delegate everything else to the underlying CSV bank
    def __getattr__(self, name):
        return getattr(self._csv, name)


def test_alert_id_primes_bundle_in_api_mode(bank, cfg, oracle):
    fake = FakeAPIBank(bank)
    sup = Supervisor(bank=fake, cfg=cfg)  # offline llm -> fixed pipeline
    tx = oracle["SCN07"]["trigger_transaction_id"]

    sup.investigate("WIRE-1", tx, alert_id="ALT0007")

    # load_alert was called with the alert id (bundle primed)
    assert fake.loaded == ["ALT0007"]


def test_no_load_alert_for_csv(bank, cfg, oracle):
    # a plain CSV bank has no load_alert; investigate must not error
    sup = Supervisor(bank=bank, cfg=cfg)
    tx = oracle["SCN07"]["trigger_transaction_id"]
    res = sup.investigate("WIRE-2", tx, alert_id="ALT0007")  # alert_id ignored safely
    assert res.status == "COMPLETE"
