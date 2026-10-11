# payments reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| parties | 1 | id, name |
| accounts | 1 | id, party_id@parties, currency |
| payment_instructions | 1 | id, account_id@accounts, amount:DECIMAL, currency |
| status_events | 1 | id, payment_id@payment_instructions, status, event_time |
| settlements | 1 | id, payment_id@payment_instructions, amount:DECIMAL, settled_at |
| returns | 1 | id, payment_id@payment_instructions, amount:DECIMAL, currency, reason |
| statements | 1 | id, account_id@accounts, period_start, period_end |
| journals | 2 | id, native_id |
| ledger_entries | 4 | id, journal@journals, account_id@accounts, side, amount:DECIMAL, currency |

## Scenario checks

- net-settlement: 100.00 settlement less 25.00 return leaves 75.00
- balance: Find unbalanced journals without rounding into balance
- settled: A status event is distinct from settlement evidence
- currency: Journal amounts remain qualified by currency

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
