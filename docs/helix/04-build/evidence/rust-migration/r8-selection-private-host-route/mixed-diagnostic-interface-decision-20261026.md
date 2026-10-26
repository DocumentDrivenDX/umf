---
ddx:
  id: umf.evidence.rust-migration.r8-selection-private-host-route.mixed-diagnostic-interface-decision-20261026
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-selection-private-host-route
      kind: continues
    - id: umf.evidence.rust-migration.r8-selection-reference-host-baseline
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Selection mixed-diagnostic interface decision

The private host Selection route already reads nonempty caller-owned
`structure.errors` in iterator order, including each `instancePath` before its
`message`. It deliberately stops before returning a result. The current
`HostRegistrationStage` can report only an enum outcome. The constraint
interpreter appends ordinary Rust `Diagnostic` values at its `extension-errors`
evaluation site, `Engine` returns `Validation { diagnostics: Vec<Diagnostic> }`,
and Selection converts that static vector before checking validity and forming
`CORE_SELECTION_SOURCE`. Those interfaces cannot carry an opaque host message
at its exact position among ordinary diagnostics.

The next implementation must introduce an invocation-local, ordered mixed
diagnostic carrier at the constraint emission site and preserve it through the
private host validation path to Selection. An entry must distinguish a static
Rust diagnostic from a generated structure diagnostic with static code, path,
and severity plus the original opaque host message, and from a future
callback-returned opaque diagnostic. The existing static `Validation` API and
default package routes must retain their current results. The carrier's
transport through the constraint interpreter and Engine is unresolved: a
sentinel inside `Vec<Diagnostic>` risks collision or reordering, while a
separate journal needs a proven insertion index through generated constraint
operations. No marker encoding is authorized by this note.

On invalid source, Selection must run the predecessor's ordered validity
accesses, then request **one** host `JSON.stringify` of the whole mixed
diagnostic array. Per-entry stringification, eager `String(message)`, or a Rust
`Value` copy would change unknown fields, accessor timing, object identity,
undefined handling, and thrown-value behavior. On successful source
validation, the same ordered entries must survive into `sourceValidation`
without premature host copying. Existing native host events and the staged
`SelectionDiagnosticMaterialization` are partial building blocks, not a
complete route.

The implementation gate is a focused Node, Bun, and real Chromium matrix for
multiple structure errors interleaved with static diagnostics, message
getters and proxies, severity short-circuit, one aggregate stringify,
iterator closure, native thrown identity, and the final result prototype.
Rust unit tests must demonstrate the carrier's exact insertion point and
static-route nonregression. Semantic callback invocation adds a separate
two-pass diagnostic protocol and remains outside this structure-only gate.
Native host work also needs resource accounting before default selection.
This decision makes no parity, default-route, retirement, or release claim.
