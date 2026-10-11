# NOAA GHCN Daily stations and monthly observations

Authored TableSpec 1.0 schema profile, not a native data parser or source-instance validator. Unlisted fields and future source content must remain in the original input; do not silently discard them.

Profile: {
  "subset": "GHCN-Daily 3.35 documented stations, inventory and monthly .dly fields.",
  "missing": "Retain -9999 values, -999.9 elevation and blank flags; no null conversion.",
  "layout": "Source fixed-width field positions are defined by the fingerprinted README. Parser and raw-line retention belong to consumers.",
  "revision": "Documentation is pinned; live station/inventory/archive bytes are not a reproducible data snapshot."
}

## Source and reproducibility

[Official documentation](https://www.ncei.noaa.gov/pub/data/ghcn/daily/readme.txt), revision GHCN-Daily 3.35. Its SHA-256 is recorded separately from row sources. Dataset bytes remain external references; no download, row pin, redistribution clearance or generator is implied.

## Schemas

- [stations](umf/stations.json): ghcnd-stations.txt fixed-width field projection; flags use authored underscore names.
- [daily_monthly](umf/daily_monthly.json): .dly monthly record field projection. Preserve all 31 slots, including nonexistent calendar days marked missing; no daily-row normalization.
- [inventory](umf/inventory.json): ghcnd-inventory.txt fixed-width field projection.

## Verification

Regenerate with `bun scripts/public-dataset-packs.ts`; check with `--check`. Pack tests verify metadata, references and exact TableSpec adapter recovery; browser checks inspect the same artifacts. Source parsers and data validation belong to consumers.
