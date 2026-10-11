# medical-imaging 1.2.0

One authored 4x4 Secondary Capture instance with fixed synthetic study/series/SOP UIDs, private tags and nested private sequence; one unchanged public TCIA LIDC-IDRI CT slice with publisher-deidentified source identity.

Native metadata and original binary retention only. The public CT slice is an incomplete 1/133-series selection, not a full study. Its source DICOM edition is unknown; pydicom 3.0.2 JSON inspection is the tested profile. No independent deidentification certification, pixel decoding, full IOD conformance, DICOMweb or live PACS operations.

Use the shared `export-domain-pack.ts --include-sources` command with this pack, then TableSpec `sample-data ingest`. Sources and schemas are local and checksum-pinned. Remote/licensed references remain metadata.

See `licenses/NOTICE.txt`, source provenance and [governed evidence](../../../docs/helix/04-build/evidence/medical-subpacks.md).
