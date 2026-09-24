---
ddx:
  id: US-013
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
    - id: FEAT-003
      kind: informed_by
---

# US-013: Preserve and compile TypeSpec source models

As a schema author, I want TypeSpec models preserved with their supplied imports,
and edits checked by the native compiler in both development and the browser.

- **US-013-AC1:** Exact multi-file sources survive JSON/YAML round trip, including
  comments, Unicode, imports, templates, operations, unions and large numeric literals.
  Syntax locations and native compiler reports follow complete JSON Schema contracts.
- **US-013-AC2:** Candidate edits preserve the original and receive fresh semantic
  compilation. A type/default mismatch is rejected by in-memory and native CLI hosts.
  Missing imports, invalid syntax and traversal paths cannot masquerade as valid models.
- **US-013-AC3:** Unknown representation fields survive UMF serialization and block
  native export; unsupported JavaScript imports produce explicit compiler diagnostics.
- **US-013-AC4:** Chromium imports and compiles a supplied multi-file bundle and
  rejects an invalid semantic edit through the public API.

The criteria below extend the original source-only cycle. Complete compiler-state
interchange and audited cross-system projections remain required later work.

- **US-013-AC5:** Selected compiled types expose snapshot-local references for models,
  inheritance, recursive properties, operations, templates, unions, enums and literals.
  Exact numeric values/defaults and source locations survive JSON/YAML source round trips.
- **US-013-AC6:** Failed compilation or unresolved selections produce blocked results.
  Unexpanded type kinds and omitted compiler state remain explicit, with source retained.

- **US-013-AC7:** Archive every file in a pinned upstream samples/specs subtree with
  hashes/license. Account for every sample entrypoint, preserving source round trips
  and native diagnostic outcomes without treating missing-library errors as support.
- **US-013-AC8:** Extract native string-template values from the pinned sample before
  and after source round trip, including browser execution.

- **US-013-AC9:** Exact library selections survive native-bundle and UMF JSON/YAML
  round trips. Only selected registered versions load; unavailable versions remain
  preserved and fail compilation explicitly. Browser compilation uses the same selection.
- **US-013-AC10:** Re-run the entire upstream corpus with a declared library set and
  compare native filesystem-host outcomes and diagnostic-code multisets. Remaining
  errors remain recorded as gaps rather than silently enabling more libraries.

- **US-013-AC11:** Select all registered official libraries and compile 29 pinned
  upstream entrypoints, retaining exact selectors/source/diagnostic round trips and
  native filesystem-host agreement. Preserve each library's own configuration so
  library-scoped compiler features also work in Chromium. Custom JS and the intentional
  syntax-error fixture remain explicit exclusions.

- **US-013-AC12:** Explicitly selected native JSON Schema emission returns every output
  file unchanged after source round trip, with a schema-valid result and retained source.
  Compare the official three-model sample against native filesystem emission and validate
  bounds, required fields, uniqueness and external references with an independent validator.
  The public API must also emit in Chromium.
- **US-013-AC13:** Require an explicit integer wire policy and the pinned emitter library.
  Distinguish successful empty selections from compiler failures; failed emission returns
  no partial files. Reject output-location overrides and invalid native emitter options.
  Every result states that native emission does not establish lossless projection.

- **US-013-AC14:** Exercise both native integer strategies with exact unsafe-integer
  literals, signed/unsigned 64-bit fields and an edited numeric constraint. Preserve
  exact source and round-trip output; expose known emitter losses in every result.
  Independent arbitrary-precision validation must distinguish the exact source literal
  from the rounded target literal and demonstrate missing scalar constraints. Native
  filesystem emission must agree before and after the constraint edit.

- **US-013-AC15:** Materialize selected native JSON emission as a UMF JSON Schema
  document with all emitted dependency resources. Preserve original source, emission
  options and resource-to-retrieval-URI mappings in a schema-valid projection result.
  Target YAML round trip and independent validation must preserve emitted behavior.
- **US-013-AC16:** Require explicit native-emission usage and allow-reported-loss policy
  before exposing a target; strict mode exposes no target. Report unreviewed semantics,
  numeric precision and missing scalar constraints even when native compilation passes.
  Missing root files and invalid retrieval/format choices cannot produce usable targets.
