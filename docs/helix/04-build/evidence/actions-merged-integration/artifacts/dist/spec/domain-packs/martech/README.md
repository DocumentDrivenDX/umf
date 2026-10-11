# martech reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| profiles | 1 | id, name |
| source_identities | 2 | id, profile_id@profiles, publisher, native_id |
| campaigns | 1 | id, name |
| channels | 1 | id, name |
| consents | 1 | id, profile_id@profiles, channel_id@channels, status, valid_from, valid_to, purpose, source_identity_id@source_identities |
| sessions | 1 | id, profile_id@profiles, source_identity_id@source_identities, started_at |
| identity_assertions | 1 | id, left_id@source_identities, right_id@source_identities, evidence, status |
| touchpoints | 2 | id, profile_id@profiles, campaign_id@campaigns, channel_id@channels, event_day:INTEGER |
| consent_events | 1 | id, consent_id@consents, status, event_time, purpose |
| conversions | 2 | id, profile_id@profiles, event_day:INTEGER, amount:DECIMAL, currency |
| attribution_rules | 1 | id, window_days:INTEGER, algorithm |
| attributions | 2 | id, conversion_id@conversions, touchpoint_id?@touchpoints, rule_id@attribution_rules |

## Scenario checks

- last-touch: Attribution selects the latest eligible preceding touch
- withdrawal: Two campaign touches precede purpose withdrawal and later conversion
- consent-origin: Consent purpose links to source identity, session and attributed merge evidence
- window: Find conversions outside the selected window
- unattributed: Outside-window conversion stays unattributed
- consent: Consent includes channel and validity interval

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
