# NYC TLC yellow taxi trips and zone lookup

Authored TableSpec 1.0 schema profile, not a native data parser or source-instance validator. Unlisted fields and future source content must remain in the original input; do not silently discard them.

Profile: {
  "subset": "Yellow taxis only; green, FHV and HVFHV are excluded.",
  "nullability": "Permissive admission, not producer guarantees.",
  "physical_types": "Authored numeric carriers; actual Parquet types and schema drift require a pinned-file inspection."
}

## Source and reproducibility

[Official documentation](https://www.nyc.gov/assets/tlc/downloads/pdf/data_dictionary_trip_records_yellow.pdf), revision 2025-03-18. Its SHA-256 is recorded separately from row sources. Dataset bytes remain external references; no download, row pin, redistribution clearance or generator is implied.

## Schemas

- [yellow_trips](umf/yellow_trips.json): Yellow-trip dictionary field profile including the 2025 CBD fee. All columns permit source nulls; this is not a month-specific Parquet physical schema. No trip identity is supplied upstream.
- [taxi_zones](umf/taxi_zones.json): TLC zone lookup CSV field profile.

## Verification

Regenerate with `bun scripts/public-dataset-packs.ts`; check with `--check`. Pack tests verify metadata, references and exact TableSpec adapter recovery; browser checks inspect the same artifacts. Source parsers and data validation belong to consumers.
