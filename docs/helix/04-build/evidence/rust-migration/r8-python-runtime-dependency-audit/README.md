---
ddx:
  id: umf.evidence.rust-migration.r8-python-runtime-dependency-audit
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
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-v8-closure-audit
      kind: extends
    - id: umf.evidence.rust-migration.r8-python-release-readiness
      kind: informed_by
---

# R8 Python runtime dependency and semantic ownership audit

This is a source-current, read-only audit of executable Python package paths in
the dirty `codex/rust-full-port` worktree on 2026-10-26. It answers two
different questions: whether Python package execution invokes JavaScript/V8,
and whether UMF-owned executable semantics are already single-sourced in Rust.
No JS/V8 runtime path remains in the audited packages; broader semantic
ownership is incomplete. This note does not
qualify installed artifacts, all package APIs, or a release cohort.

## Python runtime dependency result

The audited production package roots are `python/src/umf/`,
`python/umf_codegen/src/umf_codegen/`, and
`python/umf_access/src/umf_access/`. A recursive Python AST scan of those roots
found one process launch: `subprocess.Popen` in
`python/umf_codegen/src/umf_codegen/_native.py:163`. That wrapper resolves the
`umf` executable packaged at `umf/_bin/umf`, validates its installed profile,
and has no PATH fallback. It invokes the Rust CLI, not JavaScript. No Python
package production path uses Node, Bun, MiniRacer, V8, a JS engine, or a
TypeScript-backed subprocess. The source audit in
[`r8-python-v8-closure-audit`](../r8-python-v8-closure-audit/README.md)
also records no JS/TS/MJS/CJS/WASM source under the three package roots and no
JS runtime package metadata.

The scan deliberately excludes build and conformance tooling from the runtime
claim. `python/hatch_build.py` invokes Cargo and performs native wheel assembly;
`python/umf_codegen/hatch_build.py` checks package resources; and
`python/rust-spike/run_conformance.py` launches test probes. These are build or
qualification operations, not installed Python API routes. Source-level
absence also does not establish every transitive dependency of every wheel.

## Rust ownership result

R8 has removed the old embedded JavaScript generator route, but that fact alone
does not fulfill the migration plan's requirement to move UMF-owned shared
executable semantics to Rust. The plan explicitly distinguishes Python's
host ergonomics/integrations from shared semantics and lists Python constraint
and literal behavior plus the access package for classification and migration.

Already Rust-backed paths include `umf`'s current core validation and
serialization wrappers, constraint/literal compatibility wrappers,
semantic-type operations, JSON Schema evaluation, and the `umf_codegen`
semantic compile/verify dispatch. The implementation evidence is visible in
`python/src/umf/validation.py`, `serialization.py`, `semantic_types.py`,
`constraint_kernel.py`, `literal_kernel.py`, and `python/src/umf/_rust.py`;
the codegen process boundary is in `python/umf_codegen/src/umf_codegen/_native.py`.
The Python public models, registries and conversion/adaptation surface remain
Python host APIs and should be assessed as such rather than counted as duplicate
semantic engines without further contract analysis.

Substantive Python-owned behavior remains in `umf_access` and requires
contract-by-contract classification before the complete-port claim:

| Surface | Executable Python behavior still present | Public/observable entrypoints and evidence |
|---|---|---|
| Query DSL and logical query representation | Constructs and validates typed query/expression nodes, joins, relationships, predicates, selections, ordering, paging and ranked-search plans. | `umf_access` re-exports query constructors and types in `python/umf_access/src/umf_access/__init__.py`; implementation is in `dsl/`. |
| Logical Weft rendering | Converts DSL nodes into logical Weft text, quotes/validates identifiers and literals, and handles predicates, joins, grouping and ordering. | `dsl/render.py`; this is UMF-owned grammar/rendering behavior, distinct from Weft's native SQL lowering/execution. |
| Access catalog generation and publication | Reads authored package/configuration inputs, derives model/query metadata, validates bindings, computes manifests, and stages/publishes generated catalog files. | `build/catalog.py` public `resolve_configuration`, `compile_catalog`, `publish_catalog`; CLI `umf-access`. Some nested semantic operations call Rust through `umf`/`umf_codegen`. |
| Read, search and result execution | Performs admission/decoding, query parameter and projection checks, cursor/page handling and host result shaping around database driver calls. | `catalog.py` (`run_query`, `run_stream`), `postgres_read.py` (`execute_read`, `execute_page`, `execute_stream`), `postgres_search.py` targets. Database I/O is necessarily host-specific; reusable query semantics inside these paths are not yet shown wholly Rust-owned by this audit. |
| Migration lifecycle | Verifies plans and approvals, orders effects, records/checks history and progress, and coordinates transactional or phased application with a database. | `lifecycle/ledger.py` (`apply_table_migration`, `inspect_table_history`) and `lifecycle/progress.py`; DB effects are host integration, while plan/effect rules need an explicit shared-core disposition. |
| Driver/action orchestration | Implements Python sync/async protocols, driver adapters, and orchestration of calls into native operations. | `unified/`, `native_program.py`, `postgres_bulk.py`, `postgres_read.py`, `postgres_search.py`; classify host glue separately from reusable decision logic. |

This list is a route inventory, not a finding that every Python function must
move. The governing completion criterion is a single-sourced Rust executable
core. For each Python-owned rule, the remaining decision is whether it is
portable UMF semantics (Rust obligation), host I/O/ergonomics (Python adapter),
or an explicitly supported compatibility API. Current evidence does not close
all those classifications, nor demonstrate every public `umf_access` route
against a Rust-owned equivalent. Avoid replacing Python implementations
speculatively until the governing contract and supported profile are identified.

## Evidence limits and next gate

The prior installed capture in
[`current-source-installed-20261025.md`](../r8-python-v8-closure-audit/current-source-installed-20261025.md)
proved a bounded installed Python pair on macOS arm64 CPython 3.11.17 with
Node/Bun/Cargo absent from PATH. It was tied to its captured source, tested
selected imports/generation/CLI behavior, and does not establish current dirty
source, all Python public APIs, or the six hosted Python cohorts. The local
CPython 3.12/3.13 qualification in
[`r8-python-release-readiness`](../r8-python-release-readiness/README.md) is
also explicitly tied to a dirty historical source snapshot and does not close
the full API ownership gap.

Next, preserve this runtime-closure result, complete and review the Python API
ownership inventory against the Rust migration plan/contracts, identify the
shared semantics that must move, and add focused parity tests before claiming
complete single-source ownership. Separately, freeze one source closure and
finish the six-cohort Python release gate. This audit ran no builds or tests,
edited no production files, and did not alter package resources, workflows,
the ledger, or archives.

## Inspected source hashes

These identify the inspected dirty worktree bytes only:

| File | SHA-256 |
|---|---|
| `python/src/umf/__init__.py` | `41d1cc40297f3e976799751bdafd0cf88fabbfad9a308b635e840882765c6aae` |
| `python/src/umf/constraint_kernel.py` | `4e93b3f9ef520cd6a1e3778fc41ad6e5494713313c420e017188632a4ee20598` |
| `python/src/umf/literal_kernel.py` | `908eaa7d47ab6de89ca3493f0637ba19606936f3db756d984c5e3c6aaae0076f` |
| `python/src/umf/semantic_types.py` | `7e9144ef88b4297706143fd38570e2717c476d95b18bbd92f995aa54046f12e3` |
| `python/umf_access/src/umf_access/dsl/_nodes.py` | `2791cb533f42521ca6f807eb51230a2b1fc72f1e046ebd3877df36550d4953e5` |
| `python/umf_access/src/umf_access/dsl/render.py` | `8e57926de9cb62d499e549e5edf575d93220c5e0f460fb376a475e774d9c845b` |
| `python/umf_access/src/umf_access/build/catalog.py` | `cb2bd0b998cd151ef513acb040b2431b33976bc1d44902479e83b9f7f6154471` |
| `python/umf_access/src/umf_access/postgres_read.py` | `51002e22de961cec878a85370aecd9458dce9d30e9bf279c5789567dcf3246ab` |
| `python/umf_access/src/umf_access/lifecycle/ledger.py` | `f3b3fc1e1696ce43b888ba32d9776f424d1766db05e6e46289ea63beaaa92b19` |
| `python/umf_codegen/src/umf_codegen/_native.py` | `6dffae8dc59d720713be61957d08fe53dcfb4ebcef4358e911a3e4ecb7648b67` |
