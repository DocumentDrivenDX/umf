# transit reference pack

Version 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.

## Inventory

| Concept/table | Fixture rows | Authored fields |
| --- | --- | --- |
| agencies | 1 | id, name, timezone |
| routes | 1 | id, agency_id@agencies, name |
| stops | 1 | id, name, latitude:DECIMAL, longitude:DECIMAL |
| service_calendars | 1 | id, start_date, end_date |
| calendar_exceptions | 1 | id, calendar_id@service_calendars, service_date, exception_type |
| trips | 2 | id, route_id@routes, calendar_id@service_calendars, service_date |
| stop_times | 1 | id, trip_id@trips, stop_id@stops, sequence:INTEGER, arrival |
| realtime_observations | 1 | id, trip_id@trips, observed_at, delay_seconds:INTEGER |
| alerts | 1 | id, route_id@routes, message |

## Scenario checks

- active-service: Canceled date does not cancel another service day
- service-day: Delayed post-midnight arrival retains original service date
- cancellation: Canceled service date is not active
- extended-time: Service-day times beyond midnight retain native spelling
- realtime: Observed delay is distinct from scheduled time

## Generation and limits

Use TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.

No third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.
