# energy reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| sites | 1 | id, name |
| utility_assets | 2 | id, site_id@sites, parent_id?@utility_assets, kind |
| meters | 2 | id, asset_id@utility_assets, name, valid_from, valid_to |
| channels | 2 | id, meter_id@meters, property, unit, reading_kind |
| interval_readings | 31 | id, channel_id@channels, event_time, value?:DECIMAL |
| interval_gaps | 1 | id, reading_id@interval_readings, outage_id@outages, reason |
| tariffs | 1 | id, unit, price:DECIMAL, currency |
| outages | 1 | id, asset_id@utility_assets, starts, ends |
| service_relationships | 1 | id, site_id@sites, tariff_id@tariffs, valid_from, valid_to? |

## Scenario checks

- replacement-gap: A 30-day series retains meter replacement and outage-labeled gaps
- reset: Cumulative register decrease is exposed
- unit: Cumulative reading kind and energy unit remain explicit
- topology: Feeder retains parent asset and outage

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
