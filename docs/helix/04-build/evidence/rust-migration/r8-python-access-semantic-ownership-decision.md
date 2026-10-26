---
ddx:
  id: umf.evidence.rust-migration.r8-python-access-semantic-ownership-decision
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.implementation-plan
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-runtime-dependency-audit
      kind: extends
    - id: umf.evidence.rust-migration.r8-python-logical-render-v02-interface
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: CONTRACT-074
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
    - id: CONTRACT-081
      kind: informed_by
---

# R8 Python access semantic ownership decision

This source-current classification separates UMF-owned reusable decisions from
Python host integration. It does not claim that every listed rule is unported
in every route: several scalar and transport operations already delegate to
`umf-core`. No production code, bindings, generated resource, workflow, ledger,
or archive was changed for this audit.

## Current boundary

`umf-codegen`'s seven public operations in
`python/umf_codegen/src/umf_codegen/__init__.py` dispatch to the Rust CLI through
`_native.execute` (`_native.py`). Rust owns generation and deployment/migration
compile, verify, discovery, and normalization semantics. Python owns the
versioned process/JSON boundary in `_native.py` and filesystem publication in
`_writer.py` (`check_package`, `write_package`, `_write_locked`). The latter
performs path/symlink checks, inventory and drift validation, locking, staging,
atomic replacement, rollback, and recovery reporting. These file-system effects
remain host work; the package inventory and atomicity rules remain observable
contract behavior and need continued Python tests or a separately reviewed
shared-core split. This agrees with the R4 plan to preserve the public wrapper,
CLI and writer while porting compiler semantics.

In `umf_access`, Python is not just a thin database adapter. The V8-free audit
already inventories executable behavior; this note classifies the major
remaining clusters:

| Python surface | UMF-owned semantics to single-source in Rust | Python ownership to retain | Governing authority and current boundary |
|---|---|---|---|
| DSL construction and capture: `dsl/_nodes.py` (`literal`, `key_identity`), `dsl/_expressions.py` (predicate operators, `if_present`, relationships/aliases, aggregates), `dsl/_query.py` (query/group/join/page/update terminals), `dsl/navigation.py`, `capture.py` (`_parameters`, `_validate_node`, `capture`) | Query graph admissibility: owner membership, legal terminal/step combinations, parameter and Key identity, optional-filter placement, navigation roots, join bounds, aggregate restrictions, and stable refusal behavior. `dsl/render.py` is separately being expanded under the opt-in v0.2 profile; see linked interface note. | Execute the explicitly selected trusted Python declaration, inspect Python annotations/signatures, construct ergonomic typed objects and preserve published Python generic/protocol APIs. Rust can validate the captured closed graph after invocation; it cannot replace invocation of arbitrary Python declarations. | CONTRACT-071/072 define the DSL and build/runtime boundary; CONTRACT-070 supplies authored names and relationship facts. Current graph logic is in `capture._validate_node` and DSL builders. |
| Search declarations: `dsl/search.py` (`rrf`, `hybrid`, `KeywordIndex.matches`, `VectorIndex.near/near_vector`, `RankedQuery.top/_into`), `build/search.py` | Portable bounds and meaning of fusion/legs, selected model and parameter carriers, projection ownership and declaration admission. Keep Weft's search lowering and each target's execution/approximation behavior outside UMF Rust. | Typed Python declaration surface and Weft invocation/build orchestration. | CONTRACT-074 with CONTRACT-070/071/072; focused tests include `python/umf_access/tests/test_term_configuration_custody.py` and `test_postgres_search_projection_values.py`. |
| Stage-two catalog build: `build/catalog.py` (`resolve_configuration`, `_compile_catalog_owned`, `publish_catalog`, `_publish_catalog_owned`, `main`), `reviewed.py` (`parameter_signature`, `_fields`, `_check_source`, `captured_source`, `build_query`, `catalog_fence`) | Closed target/binding admission, source-generation and parameter invariants, optional-variant construction, catalog manifest/fence identity, and portable refusal precedence are UMF-owned decision logic. Reuse Rust custody/render operations already present instead of adding a second checker. | Read files, import explicitly selected trusted declaration modules, call Weft, access environment/paths, and publish files. Weft owns logical lowering acceptance and native artifacts; the access package must not absorb Weft semantics. | CONTRACT-067/070/071/072; existing Rust boundaries are `rust_catalog_custody.py` and `rust_catalog_render.py`; focused source custody and writer tests exist. |
| Runtime catalog and codecs: `catalog.py` (`ReadPlan.bind`, `_row`, `_finish`, `_page`, `run_query`/`run_stream` paths), `codec_support.py` (`validate_graph`, `checked_row`, `encode_model`, `decode_model`), `related_keys.py` (`validate_decoder`, `decode_related_keys`), `pages.py` | Target-pin matching, exact argument/presence admission, continuation identity and ordering checks, terminal cardinality, output inventory/canonical carrier checks and related-Key decoder profile are shared contract rules. `values.py` already routes several scalar constraints, temporal operations and exact value families through Rust; residual wrappers must be reviewed per function, not counted wholesale. | Pydantic model construction, Python exception/API shape, driver result iteration, async generators and target calls. | CONTRACT-068/071/072/074/075. Existing installed tests cover catalog, related-Key, page, codec and native-value boundaries; they are not proof that all of these algorithms are already Rust-owned. |
| Unified operations: `unified/_binding.py` (`_source_index`, `_wire_value`, `_digest_source`), `operation_values.py` (`native_arguments`, `native_batch_arguments`, `value_from_native`, `key_literal`, `result_frame`), `outcome_values.py` (`outcome_slot`, `outcome_record`, `outcome_from_record`), `table_reads.py`, `table_writes.py` (`_effect_frames`) | Source-index/descriptor checks, native argument/result mapping, effect-frame validation, bounded outcome-record shape and recovery/fingerprint policy are portable UMF semantics. `operation_values` already delegates canonical JSON, frame sizing, hashing, cursor tokens and native classification to Rust, and `outcome_values` delegates cryptographic primitives; Python-owned surrounding rules remain. | Session leases, transactions, cancellation, driver calls, connection/pool handling, sync/async protocol adaptation and host lifecycle. | CONTRACT-079, CONTRACT-072 and ADR-006; R6 explicitly moves shared request/codec/planner/checking logic while retaining drivers/session/async/transport glue. |
| Table lifecycle: `lifecycle/ledger.py` (`_verified_plan`, `_authorize_new_effects`, `apply_table_migration`, `inspect_table_history`), `host.py` (`apply_migration_on_host`, phase state), plus `progress.py`, `mixed.py`, `approval.py`, `head.py` | Plan/effect authorization, phase/predecessor rules, receipt binding, recovery state transitions, and portable lifecycle integrity checks should have one Rust owner. Rust codegen already owns table deployment/migration compilation and verification; this does not by itself port runtime lifecycle state machines. | PostgreSQL connection/transaction, locks, catalog probes, role checks, native statement execution and driver-specific recovery calls. | CONTRACT-081 and R6; CONTRACT-072/073 define host/native obligations. Keep database observation and mutations in the host adapter. |

## Dependencies and evidence

`umf_access` declares Pydantic `>=2.13,<3`, `typing-extensions >=4.16,<5`,
and `umf-core==0.11.0`; its optional `sql-containment` extra pins `pglast==7.20`.
`umf-codegen` depends on `umf-core==0.11.0`. These are package facts, not proof
that every optional driver or build-time Weft profile is installed in a given
host. The public operation inventory and existing tests are under
`python/umf_access/tests/` and `python/umf_codegen/tests/`; the prior runtime
audit records the no-JS/V8 result and its source-bound limits.

R6's completion criterion is a Rust-owned shared request/codec/planner/checking
core with thin Python session and transport adapters. It is not met by the
absence of V8, by native calls for selected scalar helpers, or by a growing list
of opt-in mappings. Every route needs a contract-linked semantic/host/data
disposition and source-bound parity evidence before the Python implementation
can be removed or excluded from the retirement census.

## Smallest next opt-in slice

After the frozen logical-render v0.2 checkpoint, the smallest useful next
Rust-owned operation is a post-invocation validator for the closed captured DSL
graph corresponding to `capture._validate_node` in
`python/umf_access/src/umf_access/capture.py`. Keep Python responsible for
`capture()`'s trusted callable invocation, signature/annotation inspection, and
building the existing dataclasses. Pass the resulting closed variant DTO to an
explicit Rust validator and compare acceptance and exact refusal code/message
against the current Python predecessor. Start with owner membership and
parameter/Key identity closure; extend terminal, navigation, aggregate and
optional-filter rules only as separately tested increments. Do not switch the
default or delete Python validation until ordered error behavior and all
captured inputs match. This avoids mixing database I/O, Weft behavior, schema
work, or the frozen Compact/Selection Rust files into the first slice.
