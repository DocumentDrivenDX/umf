---
ddx:
  id: TD-092
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-082
      kind: informed_by
    - id: US-093
      kind: informed_by
    - id: TD-077
      kind: informed_by
    - id: ADR-006
      kind: informed_by
---

# TD-092: Lakeview dashboard interchange

## Approach

The owner requested applying CONTRACT-906 to PR42, reusing core Records/Fields
and comparing reconstruction directly against original input bytes. CONTRACT-082
0.2 replaces compact rendering as the recovery criterion. Raw UTF-8 source and
split native fragments coexist deliberately: raw text preserves lexical facts;
fragments and core declarations provide inspectable identities and semantic
consistency checks. They must agree before untouched export succeeds.

## Module Boundaries

- `crates/umf-core/src/serialization.rs`: lossless native builder over the existing
  bounded JSON scanner; duplicate keys, UTF-16 and numeric lexemes share one grammar.
- `crates/umf-core/src/lakeview.rs`: native admission, partition, explicit core
  declaration derivation, preservation issues and unchanged-source consistency.
- `umf-core-wire`: explicitly registered built-in validator capability and operation
  dispatch. Package content never selects code. The Lakeview root validator stays
  in Rust; ordinary generic catalog checks remain in their existing owner.
- `src/adapters/lakeview/index.ts`: typed API and strict UTF-8 boundary only.
- `src/adapters/lakeview/project.ts`: PR42's unchanged legacy dashboard 0.1 helper,
  explicitly named and independent from the 0.2 native representation.

No new dependency or physical-table/core-dashboard semantic is introduced.
Dataset records describe only explicit native column declarations, including
calculations; query-result records describe explicitly named query outputs.
They retain distinct contexts rather than equating aggregation outputs with
base-table columns. Source types and SQL are not inferred.

The existing shared interpreter uses immutable runtime snapshots for lexical
scopes. This Lakeview change reuses that implementation without modifying
generic constraint evaluation.

## Verification Plan

Native Rust tests cover original-file byte recovery, malformed/duplicate input,
escaped surrogates, cooperative limits and refusal of changed representations.
Bun tests compare original bytes directly, then repeat through UMF JSON and YAML;
generic discovery and selection prove Record/Field reuse. Negative controls
change core members, names, types, references, native fragments, kinds and wrapper
content. A real Chromium WASM harness verifies all three committed files against
original bytes and SHA-256 digests, plus generic discovery and selection.

Schema audits, generated authority, type checking, kind regression and boundary
controls remain gates. Execution receipts and limits belong under
`docs/helix/04-build/evidence/lakeview/`; the usage guide states runtime loading
and the explicit legacy projection boundary. No private fixture, native workspace
or edited-export evidence is inferred from the committed corpus.
