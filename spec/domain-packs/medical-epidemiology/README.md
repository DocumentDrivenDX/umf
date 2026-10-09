# medical-epidemiology 1.0.0

12 CDC/NCHS leading-causes-of-death aggregate records and two separate fabricated zero/suppression cases.

Observed deaths and age-adjusted rates use native international ICD-10 cause groups, not ICD-10-CM billing diagnoses. Source rows omit denominators and uncertainty. No rate recomputation, inference of patients, epidemiological comparability or current-year surveillance is claimed.

Use the shared `export-domain-pack.ts --include-sources` command with this pack, then TableSpec `sample-data ingest`. Sources and schemas are local and checksum-pinned. Remote/licensed references remain metadata.

See `licenses/NOTICE.txt`, source provenance and [governed evidence](../../../docs/helix/04-build/evidence/medical-subpacks.md).
