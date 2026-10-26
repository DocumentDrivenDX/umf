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

The private host Selection route reads nonempty caller-owned `structure.errors`
in iterator order, including each `instancePath` before its `message`. The
first typed carrier slice now passes the original host string token through
`extension-errors` and the actual constraint `emit` operation as
`ConstraintDiagnostic::HostStructure`. Static diagnostics use a separate typed
variant, and the public static `Validation` path refuses a host variant with
`HOST_JSON_UNSUPPORTED`. A nonstring structure message refuses at `emit` as
`CONSTRAINT_DIAGNOSTIC`. The provider receives the exact extension path.
The private Engine packet now retains that ordered carrier through Selection.
It repeats Engine's existing second source copy and model-admission conversion
before structure and constraint checks. On invalid source, Selection asks the
Node host to construct the mixed diagnostic objects and call one aggregate
`JSON.stringify`; the original host string token is resolved only inside that
call. Selection then reads the native Error carrier's message and returns
`CORE_SELECTION_SOURCE`. These claims are limited to the private Node route.

The public Engine API still returns `Validation { diagnostics: Vec<Diagnostic> }`
and is unchanged. The private packet uses typed entries, with no sentinel
encoding. The callback-returned opaque diagnostic variant has an internal
materializer but is not yet connected to Selection's semantic callback flow.
Successful host-warning `sourceValidation` results are also unqualified; the
current generated structure policy emits errors. Default package routes remain
unchanged.

On invalid source, Selection must run the predecessor's ordered validity
accesses, then request **one** host `JSON.stringify` of the whole mixed
diagnostic array. Per-entry stringification, eager `String(message)`, or a Rust
`Value` copy would change accessor timing, host string handling, and
thrown-value behavior. Future callback-returned diagnostic objects additionally
require preserving unknown fields and object identity. On successful source
validation, the same ordered entries must survive into `sourceValidation`
without premature host copying. That successful-result branch remains a gate.

The implementation gate is a focused Node, Bun, and real Chromium matrix for
multiple structure errors interleaved with static diagnostics, message
getters and proxies, nonstring message refusal, severity short-circuit, one
aggregate stringify,
iterator closure, native thrown identity, and the final result prototype.
Rust unit tests prove the insertion at `emit` and static-route nonregression.
The fresh Node addon binding suite passes 9/9, including two structure errors
followed by two static warnings, exact serialized refusal, proxy getter throw
identity and a nonstring-message early stop. The Node 26.12.1 private probe
passes, the frozen R5 Selection suite passes 10/10, and the WASM target check
passes. These tests establish only this invalid-source Node/Bun subset, not
browser parity or complete Selection behavior. Semantic callback invocation
adds a separate
two-pass diagnostic protocol and remains outside this structure-only gate.
Native host work also needs resource accounting before default selection.
This decision makes no parity, default-route, retirement, or release claim.
