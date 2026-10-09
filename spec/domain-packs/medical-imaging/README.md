# medical-imaging 1.0.0

One authored 4x4 Secondary Capture instance with fixed synthetic study/series/SOP UIDs, private tags and nested private sequence.

Native metadata and original binary retention only. No public patient images, pixel decoding, full IOD conformance, DICOMweb or live PACS operations. TCIA remains a collection-specific rights/access candidate; no TCIA bytes are bundled.

Use the shared `export-domain-pack.ts --include-sources` command with this pack, then TableSpec `sample-data ingest`. Sources and schemas are local and checksum-pinned. Remote/licensed references remain metadata.

See `licenses/NOTICE.txt`, source provenance and [governed evidence](../../../docs/helix/04-build/evidence/medical-subpacks.md).
