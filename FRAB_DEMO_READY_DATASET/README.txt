======================================================
FRAB DEMO-READY DATASET
Fraud / Risk / Financial investigation system (demo dataset)
======================================================

This dataset is the FINAL, demo-ready synthetic banking dataset for FRAB.
It is fully synthetic (no real PII) and deterministic (regenerating it
reproduces identical data), so the 10 demo scenarios are 100% repeatable.

------------------------------------------------------
WHY THIS DATASET WAS REBUILT
------------------------------------------------------
The originally uploaded dataset (FRAB_synthetic_bank_dataset) contained
~9,998 transactions but had exactly ONE transaction per customer. FRAB's
entire value is CONTEXTUAL investigation ("customer normally transacts
around X, but this is Y"), which is impossible when every customer has a
single transaction.

This package regenerates the data with realistic MULTI-transaction
histories (20-46 transactions per customer) while PRESERVING the existing
schemas and PaySim-compatible field names, so any Firestore importer / API
built around the original structure continues to work.

------------------------------------------------------
FILES
------------------------------------------------------
customers.csv          - customer identity layer
accounts.csv           - one account per customer
transactions.csv       - ~10,000 txns, PaySim-compatible + FRAB fields
beneficiaries.csv      - beneficiary relationships derived from transactions
kyc_profiles.csv       - one synthetic KYC/CDD profile per customer
behaviour_baseline.csv - per-customer stats derived from transactions
alerts.csv             - 10 deterministic alerts (one per scenario)
cases.csv              - 10 investigation cases (one per scenario)
demo_runs.csv          - MASTER guide: 10 demo scenarios (SCN01..SCN10)
simulator_feed.csv     - deterministic stream for the transaction simulator
merchants.csv          - merchants referenced by transactions
README.txt             - this file

------------------------------------------------------
1. CSV -> FIRESTORE COLLECTION MAPPING & DOCUMENT IDs
------------------------------------------------------
CSV file               Firestore collection   Document ID field
---------------------  ---------------------  -----------------------
customers.csv          customers              customer_id
accounts.csv           accounts               account_id
transactions.csv       transactions           transaction_id
beneficiaries.csv      beneficiaries          customer_id + "_" + beneficiary_id
kyc_profiles.csv       kyc_profiles           customer_id
behaviour_baseline.csv behaviour_baseline     customer_id
alerts.csv             alerts                 alert_id
cases.csv              cases                  case_id
merchants.csv          merchants              merchant_id

demo_runs.csv and simulator_feed.csv are demo-orchestration artifacts and
do not need to be Firestore collections (they can be, keyed by scenario_id
and transaction_id respectively).

------------------------------------------------------
2. RELATIONSHIPS BETWEEN COLLECTIONS
------------------------------------------------------
- customers.account_id            -> accounts.account_id (1:1)
- accounts.customer_id            -> customers.customer_id
- transactions.customer_id        -> customers.customer_id (many:1)
- transactions.account_id         -> accounts.account_id
- transactions.nameOrig           == customer_id (PaySim origin)
- transactions.nameDest           -> merchant_id (MERCHANT) or account id (ACCOUNT)
- beneficiaries.customer_id        -> customers.customer_id
- beneficiaries.beneficiary_id     appears as transactions.nameDest
- kyc_profiles.customer_id         -> customers.customer_id
- behaviour_baseline.customer_id   -> customers.customer_id
- alerts.transaction_id            -> transactions.transaction_id
- alerts.customer_id               -> customers.customer_id
- cases.alert_id                   -> alerts.alert_id
- cases.customer_id                -> customers.customer_id
- demo_runs.{alert_id,case_id,customer_id,trigger_transaction_id} -> respective records

------------------------------------------------------
3. REQUIRED IMPORT ORDER (respects foreign keys)
------------------------------------------------------
1) customers
2) accounts
3) merchants
4) kyc_profiles
5) transactions
6) beneficiaries
7) behaviour_baseline
8) alerts
9) cases
(demo_runs / simulator_feed last, if imported at all)

A simple Python/Node seeding script can loop each CSV in this order and
write each row as a document using the Document ID field above. No manual
data entry is required.

------------------------------------------------------
4. TRANSACTIONS SCHEMA
------------------------------------------------------
PaySim-compatible fields:
  transaction_id, step, type, amount, nameOrig, oldbalanceOrg,
  newbalanceOrig, nameDest, oldbalanceDest, newbalanceDest,
  isFraud, isFlaggedFraud
FRAB fields:
  customer_id, account_id, event_time, destination_type

- type is one of: PAYMENT, TRANSFER, CASH_OUT, DEBIT, CASH_IN
- destination_type is one of: MERCHANT, ACCOUNT
- step   = minute offset on a synthetic 90-day timeline (2026-08-01 start)
- event_time = ISO timestamp derived from step
- isFlaggedFraud = 1 on the transactions that trigger a demo scenario rule

From this history FRAB can compute: historical average / median / max
transaction amount, transaction frequency & velocity, beneficiary history,
transfer vs cash-out behaviour, and unusual transaction size.

------------------------------------------------------
5. HOW TO USE simulator_feed.csv
------------------------------------------------------
simulator_feed.csv is an ordered replay stream:
  transaction_id, stream_order, emit_delay_ms, type, amount, customer_id,
  account_id, nameDest, destination_type, event_time, is_scenario_trigger

Demo flow:
  simulator_feed.csv
        -> for each row (ordered by stream_order):
             wait emit_delay_ms
             POST /transactions  (send the transaction fields)
        -> Synthetic Bank API -> Firestore -> rule engine -> alert
        -> FRAB investigation -> recommendation -> dashboard

The feed contains a warm-up slice of recent baseline transactions plus ALL
10 scenario trigger transactions (is_scenario_trigger = TRUE) and their
supporting burst/context transactions, so every rule can fire live.

Seed the 9 core collections FIRST (import order above) so FRAB has full
history to investigate, THEN run the simulator for the live demo.

------------------------------------------------------
6. HOW TO REPRODUCE THE 10 SCENARIOS
------------------------------------------------------
demo_runs.csv is the master guide. Each row:
  scenario_id, alert_id, case_id, customer_id, scenario_type, severity,
  expected_reason, trigger_transaction_id, expected_action

The scenarios:
  SCN01 HIGH_VALUE_NEW_BENEFICIARY  -> HIGH  / ESCALATE
  SCN02 VELOCITY_SPIKE              -> HIGH  / ESCALATE
  SCN03 STRUCTURING_PATTERN         -> HIGH  / ESCALATE
  SCN04 BEHAVIOUR_DEVIATION         -> HIGH  / ESCALATE
  SCN05 NEW_BENEFICIARY             -> MEDIUM/ MONITOR
  SCN06 KYC_MISMATCH                -> HIGH  / ESCALATE
  SCN07 MULE_PATTERN                -> HIGH  / ESCALATE
  SCN08 REPEATED_CASHOUT            -> MEDIUM/ MONITOR
  SCN09 CROSS_ACCOUNT_BURST         -> HIGH  / ESCALATE
  SCN10 FALSE_POSITIVE_HISTORY      -> CLOSE_FALSE_POSITIVE  (CRITICAL)

To run a scenario:
  1. Look up the scenario row in demo_runs.csv.
  2. The trigger_transaction_id is the transaction that fires the rule.
  3. Pull the customer's history (transactions + behaviour_baseline +
     kyc_profiles + beneficiaries + prior cases) to investigate.
  4. Compare against expected_reason / expected_action.

SCN10 is the flagship: the customer has FIVE prior legitimate ~480k-495k
transfers to the SAME beneficiary (C999000010). The trigger is another
similar transfer that a blind rule engine flags on size alone. FRAB should
inspect the history, find the established pattern, and recommend CLOSE as a
false positive. This demonstrates that FRAB investigates context rather
than acting as another blind fraud classifier.

------------------------------------------------------
7. NOTES
------------------------------------------------------
- All data synthetic. All amounts in INR.
- Regenerate with:  node generate_frab_dataset.js
- Re-validate with: node validate_frab_dataset.js
  (see DATASET_VALIDATION_REPORT.txt for the latest results)
