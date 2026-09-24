---
ddx:
  id: US-007
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-007: Preserve Avro schema meaning

As a schema author, I want Avro schemas to retain native declarations and unknown
metadata through UMF so that tools can inspect and edit the understood subset.

- **US-007-AC1:** Recursive records, ordered unions, all primitive carriers, aliases,
  enum/fixed, arrays/maps, defaults, logical types and custom metadata survive
  JSON/YAML round trips. Unsupported interpretation remains explicit.
- **US-007-AC2:** Exact long defaults and newer union defaults survive without false
  claims that the browser validator fully understands them.
- **US-007-AC3:** Node access returns copies; valid edits are atomic; missing paths,
  incomplete interpretation and unknown representation fields cannot silently lose data.
- **US-007-AC4:** Independent native encoders/decoders compare original and exported
  schemas, test reader defaults and invalid instances, and record disagreements.
- **US-007-AC5:** Actual Chromium executes native round-trip and edit operations.

- **US-007-AC6:** All schema JSON files in the three pinned Apache fixture directories
  survive import/export and JSON/YAML serialization. Independent native parser
  outcomes remain unchanged; each accepted Apache schema gets a finite binary
  probe. Missing external names and browser interpretation limits remain visible.

Evidence includes the authored corpus and 20 pinned Apache schemas. Broader corpus
expansion and native language surface beyond schema JSON remain required.


- **US-007-AC7:** Explicit dependency artifacts resolve named types in declaration
  order, survive serialization and bundle export, and support atomic dependency edits.
  Native runtimes enforce edited types; the original document remains unchanged.
- **US-007-AC8:** Duplicate artifact IDs fail; conflicting native declarations remain
  incomplete; unknown representation fields and root-only export cannot lose dependencies.

`tests/avro/bundle.test.ts` and `scripts/avro-dependency-oracle.py` cover AC7–AC8;
Chromium also imports, edits, exports and reimports a dependency bundle.

- **US-007-AC9:** Explicit candidate edits support native logical annotations,
  unfamiliar metadata and exact numeric defaults without asserting semantic validity.
  Reports retain original and candidate documents, exact replacement and diagnostics;
  synchronized core metadata cannot discard attached field content. Native codecs and
  Chromium verify edited root/dependency recovery and observable changes in decimal
  interpretation and reader-default resolution. Conservative edits keep their existing
  completeness guard; candidates do not imply automatic row migration.

`tests/avro/candidate-edit.test.ts`, `scripts/avro-candidate-edit-oracle.py` and
`scripts/avro-metadata-browser.ts` supply the scoped AC9 evidence.
