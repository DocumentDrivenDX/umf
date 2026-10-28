---
ddx:
  id: umf.evidence.rust-migration.r8-python-v8-closure-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
---

# R8 Python V8 closure and remaining Python ownership audit

Audit scope at the pre-cutover source snapshot: production Python source under `python/src/umf`,
`python/umf_codegen/src/umf_codegen`, and
`python/umf_access/src/umf_access`, with the current R4 package evidence and
R8 migration-plan entries read as supporting evidence. This is a source review,
not a fresh wheel or release qualification. The inventory counts below are
file counts from that worktree snapshot; string-marker counts are only a map of
bridge surfaces, not an operation-level retirement census.

## V8 dependency closure

No current production Python package declares MiniRacer or embeds the generator
JavaScript runtime. `python/umf_codegen/pyproject.toml` pins only `umf-core==0.11.0`
for runtime dependency; `umf_codegen._native` resolves `umf/_bin/umf`, checks
core/protocol/resource identity, then starts that bundled Rust CLI with bounded
pipes and a deadline. Its public API dispatches all seven documented operations:
generation, deployment compile/verify, migration compile/verify, change discovery,
and row-scope normalization. There is no TypeScript-to-Python or V8 fallback in
this closure. The CLI subprocess is an intentional Rust execution boundary, not a
JavaScript runtime.

The R4 installed packet records a macOS arm64 CPython 3.11.17 cohort with both
wheels installed and MiniRacer absent. It exercises seven operations plus CLI,
writer, tamper, and deadline controls; JavaScript processes were forbidden. This
packet is bounded to its archived artifact/source cohort. The later R4 plan
records that fresh source-cohort wheels, extracted-sdist qualification, the hosted
platform/interpreter matrix, and final source-to-artifact proof were still open.
See [R4 installed evidence](../r4/README.md) and the
[R4–R8 continuation gates](../../../rust-migration-plan.md#r4r8-continuation-gates--2026-10-23).

Historical MiniRacer references remain in the locked embedder-wheel template and
historical inventory/evidence. They are not active dependencies of the two
production packages in scope; retaining those records does not reintroduce V8.
The Python codegen migration has therefore achieved the narrow R4 V8-removal
milestone, while R8 release qualification remains incomplete.

## Remaining production Python surfaces

The current source inventory contains 37 Python files in `python/src/umf`, 96 in
`python/umf_access/src/umf_access`, and 8 in `python/umf_codegen/src/umf_codegen`.
The 37-file core package exposes its Rust extension through `_rust.py`; 34 files
contain a Rust bridge/import marker, while the other three are generated resource,
model-shape, or manifest modules. This does not mean every callable in the 34
files has Rust ownership: compatibility, host admission, Pydantic construction,
registries, resource loading, and orchestration remain Python boundaries, and
some family operations are only opt-in Rust bridges.

In `umf_access`, 15 of 96 files contain an explicit `rust_`/`_rust` marker. Rust
is already selected for bounded shared kernels and observations including value
and temporal rules, operation/outcome frames, target-pin candidate comparison,
related-key parsing, catalog rendering/custody, capture observation, and selected
search logic. Much of the 96-file package remains Python: DSL construction and
rendering, catalog/build orchestration, codecs and projections, PostgreSQL and
Delta drivers, async/sync session glue, lifecycle orchestration, authorization,
transaction and cancellation handling. Many of these are legitimate host
responsibilities; the audit does not classify the whole file as a semantic fork
from its imports alone. A symbol-level census is still needed before R8 retirement.

Across the three packages, current production execution is V8-free. No in-scope
Python path bridges to TypeScript at runtime. The remaining work is duplicated or
Python-owned UMF semantics and R5/R6/R8 family selection, not removal of a
transitive JavaScript engine. This distinction follows ADR-006: host operations
and generated client ergonomics can remain Python, while shared semantic
algorithms need one Rust or authored-data owner.

## Recommended next tranche

Complete the scoped `TargetPin.matches` and `ReadPlan.bind` ownership slice.
The Rust matcher and PyO3 candidate existed at this audit point, while public
`TargetPin.matches` selected Python and `ReadPlan.bind` performed Python
orchestration. The subsequent [public-route cutover](../r8-target-pin-default-python-20261028/README.md)
selects the Rust matcher; `ReadPlan.bind` remains open.
The frozen predecessor packets cover 13 matcher outcomes and six bind outcomes
with ordered host observations. The dynamic candidate tests additionally exercise
Python equality, length, iteration, set/dict, membership, truth, and exception
behavior. See the [predecessor and seam review](../../../rust-migration-plan.md#r4r8-continuation-gates--2026-10-23) and the
[dynamic host controls](../r8-target-pin-host-dynamic-controls-20261028/README.md).

A reviewable implementation tranche should:

- select the Rust matcher on the public Python route while preserving the resolved
  unique-platform-name rule in CONTRACT-072;
- move `ReadPlan.bind` decisions to Rust through ordered, lazy host callbacks for
  artifact, identity, platform, validation, selected artifact, and model
  construction, preserving callback exception identity and timing;
- compare the full 13-case matcher and six-case bind corpus, including adverse
  protocol objects and injected exceptions, on supported CPython hosts;
- build and install the actual wheel before claiming Python release support, then
  retire only the two exact default-route symbols in the R8 ledger.

The source-built Darwin CPython 3.13 candidate tests are useful implementation
evidence, but do not establish installed-wheel behavior, other supported Python
versions/platforms, or full `ReadPlan.bind` semantics. Mutating/pathological Python
protocol behavior also remains open. CONTRACT-072's duplicate-name correction
must stay explicit; historical predecessor evidence records a formerly accepted
duplicate case and cannot be represented as current support.

## R8 release blockers

This audit does not close any release gate. The documented blockers include the
fresh current-source Rust/Python/Node/Bun/WASM artifact cohort; required hosted
Linux/macOS and CPython 3.11–3.13 qualification; complete symbol-level ownership
and old-implementation retirement; current native corpus and family-specific
independent-oracle replays; installed package and CLI checks; real browser
journeys; and the integrated source-to-artifact, documentation, review, and
release hash record. R4's one historical installed cohort is not evidence for the
current moving R8 branch. Keep unsupported subsets and held qualifications
separate from the bounded Rust candidates.

No implementation or package files were changed for this audit. The only new
artifact is this source-bound evidence note; it records no new runtime test result.
