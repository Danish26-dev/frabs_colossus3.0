"""Data-access layer tests, including the answer-key isolation guarantee."""

from __future__ import annotations

import pytest

from frab_worker import data_access
from frab_worker.data_access import BankData


def test_csv_access_satisfies_interface(bank):
    from frab_worker.data_access import BankDataAccess, CSVDataAccess
    assert isinstance(bank, CSVDataAccess)
    assert isinstance(bank, BankDataAccess)  # runtime_checkable Protocol


def test_bankdata_alias_preserved():
    # backwards-compat: BankData still refers to the CSV implementation
    from frab_worker.data_access import BankData, CSVDataAccess
    assert BankData is CSVDataAccess


def test_answer_key_files_are_forbidden(data_dir):
    for forbidden in ("cases", "demo_runs", "simulator_feed"):
        with pytest.raises(PermissionError):
            data_access._read_csv(forbidden, data_dir)


def test_unknown_collection_rejected(data_dir):
    with pytest.raises(ValueError):
        data_access._read_csv("not_a_real_collection", data_dir)


def test_core_collections_load(bank: BankData):
    # spot-check a known customer from the dataset
    cust = bank.get_customer("C009000137")
    assert cust is not None
    assert cust["customer_name"] == "Priya Pillai"
    assert bank.get_account("ACC-C009000137") is not None
    assert bank.get_kyc("C009000137") is not None


def test_transaction_history_sorted_and_typed(bank: BankData):
    txns = bank.get_transaction_history("C009001507")
    assert len(txns) > 0
    # amounts parsed to float, times parsed to datetime
    assert all(isinstance(t["amount"], float) for t in txns)
    times = [t["_event_dt"] for t in txns]
    assert times == sorted(times)


def test_before_filter_excludes_future(bank: BankData):
    trigger = bank.get_transaction("TX009955")
    hist = bank.get_transaction_history(
        trigger["customer_id"], before=trigger["_event_dt"]
    )
    assert all(t["_event_dt"] <= trigger["_event_dt"] for t in hist)


def test_exclude_trigger_removes_it(bank: BankData):
    trigger = bank.get_transaction("TX009955")
    hist = bank.get_transaction_history(
        trigger["customer_id"], exclude_transaction_id="TX009955"
    )
    assert all(t["transaction_id"] != "TX009955" for t in hist)
