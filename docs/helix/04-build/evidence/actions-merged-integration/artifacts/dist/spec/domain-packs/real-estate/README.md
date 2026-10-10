# real-estate reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| parties | 1 | id, name |
| parcels | 1 | id, native_code, geometry_crs |
| properties | 1 | id, parcel_id@parcels, address |
| buildings | 1 | id, property_id@properties, floor_area:DECIMAL, area_unit |
| units | 1 | id, building_id@buildings, unit_label |
| listings | 2 | id, property_id@properties, status, valid_from, valid_to, asking_price:DECIMAL, currency |
| listing_events | 2 | id, listing_id@listings, event_time, status, previous_price?:DECIMAL, price?:DECIMAL |
| transactions | 1 | id, listing_id@listings, amount:DECIMAL, currency |
| leases | 1 | id, unit_id@units, party_id@parties, starts, ends |
| offices | 1 | id, name |
| agents | 1 | id, party_id@parties, office_id@offices, native_member_id |
| listing_agents | 2 | id, listing_id@listings, agent_id@agents |
| media | 1 | id, property_id@properties, reference, availability |
| maintenance_requests | 1 | id, unit_id@units, party_id@parties, status |
| valuations | 1 | id, property_id@properties, amount:DECIMAL, currency, basis |

## Scenario checks

- listing-history: Sequential listings and price change retain one property
- operations: Brokerage, listing media and unit maintenance retain actual identities
- withdrawn: Withdrawn listing has no inferred sale
- distinction: Parcel, property, building and unit retain distinct identities
- valuation: Valuation does not become transaction price

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
