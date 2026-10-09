# GTFS Schedule basic fixed-stop transit profile

Authored TableSpec 1.0 schema profile, not a native data parser or source-instance validator. Unlisted fields and future source content must remain in the original input; do not silently discard them.

Profile: {
  "subset": "Selected basic Schedule fields; no Realtime, fares, shapes, frequencies, transfers, translations or flexible service.",
  "feed": "Unresolved; specification profile only, no agency snapshot is claimed.",
  "member_bindings": {
    "agency": "agency.txt",
    "stops": "stops.txt",
    "routes": "routes.txt",
    "trips": "trips.txt",
    "stop_times": "stop_times.txt",
    "calendar": "calendar.txt",
    "calendar_dates": "calendar_dates.txt"
  },
  "conditional_rules": [
    "agency_id required for multiple agencies; agency association remains conditional.",
    "At least one route name is required.",
    "stop name/coordinates depend on location_type.",
    "Service IDs resolve over the union of calendar and calendar_dates.",
    "Calendar requirements depend on dates-only service; exceptions can introduce service IDs.",
    "Arrival/departure requirements depend on timing and stop position."
  ],
  "blank_values": "Optional and conditional CSV blanks need explicit consumer handling; no blanket null/default coercion.",
  "relationships": "Only unconditional in-profile references are TableSpec foreign keys; conditional and union references remain stated here."
}

## Source and reproducibility

[Official documentation](https://raw.githubusercontent.com/google/transit/3c9e7b904b5035349622f03e11851e25c16d1d99/gtfs/spec/en/reference.md), revision 3c9e7b904b5035349622f03e11851e25c16d1d99. Its SHA-256 is recorded separately from row sources. Dataset bytes remain external references; no download, row pin, redistribution clearance or generator is implied.

## Schemas

- [agency](umf/agency.json): Basic agency.txt fields; conditional ID prevents unconditional key declaration.
- [stops](umf/stops.json): Selected stops.txt fields.
- [routes](umf/routes.json): Selected routes.txt fields; at least one route name required by source rules.
- [trips](umf/trips.json): Selected trips.txt fields. service_id resolves against calendar OR calendar_dates.
- [stop_times](umf/stop_times.json): Fixed-stop stop_times.txt subset; flexible location groups/windows are excluded.
- [calendar](umf/calendar.json): Weekly service calendar; optional when dates alone define service.
- [calendar_dates](umf/calendar_dates.json): Service additions/removals; do not force every service into calendar.

## Verification

Regenerate with `bun scripts/public-dataset-packs.ts`; check with `--check`. Pack tests verify metadata, references and exact TableSpec adapter recovery; browser checks inspect the same artifacts. Source parsers and data validation belong to consumers.
