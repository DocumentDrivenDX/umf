---
ddx:
  id: umf.evidence.r5-json-schema-bindings.successor-real-hosts-35bf199d
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-002
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.predecessor
      kind: informed_by
    - id: umf.evidence.r5-json-schema-bindings.real-hosts
      kind: informed_by
---

# R5 JSON Schema successor real-host replay

This separate receipt binds the replay to source commit
`35bf199d7ca7caa7bdf798a120850913ba75b58f`, including the successor inspector
source hash `9373c81e48660b0848109279d708b78bb23936934ba916d41d66dde6756a12bc`.
It preserves the earlier pre-repair receipt and result bundle unchanged. The
full expected and actual envelopes for every host are in
[successor-real-hosts-35bf199d-results.json](successor-real-hosts-35bf199d-results.json).

## Replay outcome

The frozen predecessor packet hash is
`06d1772cd53dd7d7660e9bd6e665cf4bb51a7c7439396dbd7f8e6dd8e91e1ee8`. The
replay compares complete returned/refused outcomes using ordered
`JSON.stringify`, retaining envelope field order, UTF-16 strings, refusal
name/code/message, and copied-output snapshots. Error path is absent from the
frozen predecessor packet and replay harness, so path parity is unqualified.

| Host path | Runtime | Frozen cases matched | Controls matched |
| --- | --- | ---: | ---: |
| Native addon | Node v26.12.1 | 27 / 30 | 5 / 5 |
| Native addon | Bun 1.4.3 (Node v26.3.0) | 27 / 30 | 5 / 5 |
| Freshly packed/extracted WASM package | Bun 1.4.3 (Node v26.3.0) | 27 / 30 | 5 / 5 |
| Freshly packed/extracted WASM package | Chromium 156 | 27 / 30 | 5 / 5 |

Each host produced the same ordered 30-case result array, SHA-256
`92ff58d7895b7c9b6423a27ebcf1e5dd8c8cea5abf4c36525a7b3c735998e8cf`, and the
same ordered control array, SHA-256
`20d41a72e82981cb2d0ebddb8593a2a75daa7b9ec5bd05ea5c24621787cb4985`. Chromium
reported user agent
`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36`.

The same three predecessor mismatches remain on every host:

| Case | Difference |
| --- | --- |
| `inspect.success` | Predecessor returns `complete: true`; successor returns `complete: false` with `JSON_SCHEMA_VALIDATOR_LIMIT`. |
| `export.bundle` | Successor bundle includes the validator-limit diagnostic and incomplete result. |
| `copy-isolation-get-bundle-walk` | The bundle in the copied-output snapshot carries the same validator-limit diagnostic. |

The two diagnostic wording mismatches from the prior cohort are absent after
the inspector repair. The three remaining mismatches express one incomplete
validator capability delta. Their exact predecessor and successor envelopes
are retained in the result JSON; no expected packet or core semantics were
changed. The adapter remains opt-in and `complete: false`; this replay does
not establish predecessor parity or complete Draft 2020-12 support.

All five public-engine control probes passed on all four paths: work-budget,
cancellation and deadline preflight refusals, first meter-hook failure, and a
late meter-hook failure on call 4 during bundle export. These checks do not
claim exhaustive timing or mid-operation cancellation coverage.

## Build and artifact identity

Both builds were offline with pinned Rust 1.90.0 and isolated target
directories. The WASM package used pinned `wasm-bindgen-cli 0.2.100`; generated
source checks passed. The package was packed with Bun 1.4.3 and the tarball was
freshly extracted before Bun and Chromium execution.

| Artifact | SHA-256 |
| --- | --- |
| Native addon dylib | `91d9f785183714a2a2a1f75adbe41e096d4d3322b2a7698bd3ccbaac196c40e8` |
| WASM bindgen input | `1de810d87324246bfddae2233a1f4a17464e5e9b9888cf774dcfe10becafd478` |
| Generated web JS module | `ad0754c693090652ea14af07b32426eb85eb7a1e51aa9bb3322f84d8876f85fb` |
| Generated web WASM binary | `ac7117a2235a2ca5d1566b2731b9c9e26fb748985b80589b0d625c2738286faf` |
| Fresh package tarball | `c2760baa8308b9b24dee541e1efd61055a3e9b5c23a265c78d608f4c12d391d6` |

An initial Chromium navigation preceded placement of the package and frozen
packet at the harness's expected static paths and produced no result. The
static root was corrected and the replay rerun; the source-bound browser POST
receipt then contained all 30 outcomes and all five controls. Only the latter
run is counted in the table.

This is successor-cohort local host evidence, not an installed-package
matrix, release, upstream corpus result, independent native-oracle agreement,
or parity claim. This receipt remains draft pending Sol's independent review;
do not treat it as an approved qualification or default-cutover gate.
