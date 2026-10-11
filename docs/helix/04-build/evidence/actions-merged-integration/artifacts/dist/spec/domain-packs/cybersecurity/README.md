# cybersecurity reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| identities | 2 | id, publisher, native_id |
| accounts | 1 | id, identity_id@identities, name |
| devices | 2 | id, publisher, native_id |
| sessions | 2 | id, account_id@accounts, device_id@devices, started_at |
| scenarios | 1 | id, label |
| authentication_events | 6 | id, session_id@sessions, scenario_id@scenarios, outcome, event_time |
| network_activity | 1 | id, session_id@sessions, destination, bytes:INTEGER |
| findings | 1 | id, device_id@devices, evidence_id@authentication_events, severity |
| incidents | 1 | id, status |
| event_incident_links | 1 | id, event_id@authentication_events, incident_id@incidents |

## Scenario checks

- failed-then-success: Five failures precede success from another device
- collision: Same native device ID remains two publisher-qualified identities
- evidence: Trace finding to account and failure evidence
- association: Event-to-incident link is attributable data

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
