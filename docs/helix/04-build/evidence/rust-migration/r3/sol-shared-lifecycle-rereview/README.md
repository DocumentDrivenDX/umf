# Shared/lifecycle independent rereview

Verdict: **request changes**. Earlier 129/129 baseline and 13/13 review-control
passes do not close the current TypeScript semantic closure. Six additional
immutable predecessor controls captured here match **0/6** in the incremental
native binary. `native.json` binds the binary hash, input hash and differences;
the binary remained unchanged during execution. This diagnostic comparison is
not an attested clean-source build. Inspected-source hashes are recorded
separately in `review-source-sha256.json`.

## Required fixes

1. **P1: Complete operation value/domain admission.**
   `inspect_operation_value` still immediately returns for kind=literal; parameter
   values only establish existence/use, with no exact logical/null/native domain
   comparison. SourceField copies omit allowed-membership and target-refinement
   proof. CurrentPrincipal tests string scalar without text/varchar storage.
   `inspect_predicate` omits startsWith string and ordered-carrier checks.
   `sol2_operation_literal_domain` and `sol2_parameter_domain` are refused by
   TypeScript but compile in Rust; `sol2_prefix_integer` loses a diagnostic.
   Port the complete operations.ts value/predicate functions rather than adding
   cases solely for these inputs. Preserve diagnostics and original source proof.
2. **P1: Restore semantic phase/order and per-module limits.** Rust runs unknowns,
   declaration/policies/seeds/operations, check expressions, then native literals.
   TS runs unknowns, per-table column/literal/check semantics, policies, seeds,
   operations. The module-wide 4096 node counter is therefore consumed in a
   different order. `sol2_diagnostic_order` expects TABLES_LOGICAL_DEFAULT before
   TABLES_CHECK_TYPE and receives the reverse. Final global diagnostic truncation
   is also incompatible with TS's per-module TableContext cap during insertion:
   two modules can legitimately produce more than 257 total diagnostics, and
   excess diagnostics must carry the actual originating module path. Centralize
   the original phase/counter/cap behavior; do not sort diagnostics afterward.
3. **P1: Meter/precharge the complete reached loops and copies.** Operation
   predicates/values still have no Context parameter, policy graph traversal and
   seed metadata traversal remain unmetered, and the inspector performs many
   input-derived clones/path/diagnostic allocations without a preceding charge.
   Deployment inner literal/domain/expression/policy SQL helpers and add_step
   lack Context; a poll at the outer table loop does not bound inner work.
   Carry Context through these helpers and charge before input-derived output
   allocations and comparisons, retaining cancellation/deadline origin.
4. **P1: Preserve extension diagnostics and native refusal guards.**
   `sol2_record_extension` and `sol2_field_extension` expect one UNKNOWN_EXTENSION
   diagnostic but get two. Tables are now inspected after core validation with
   an unknown-extension status already present, duplicating interpretation
   results. Deployment's Record/Field extension guards still use array_items on
   object-valued extensions; use object semantics. Qualify both unknown packages
   and explicitly registered packages without granting native interpretation.

## Host/wire disposition

Additive dispatch retains explicit resources, denies artifact-selected callbacks,
propagates control-origin failures outside semantic outcomes and keeps error
paths/pointers separate. These ownership choices remain approved. Final host
qualification must cover complete generated outputs larger than ordinary source
limits, wrapper overhead and raw-value invalid/duplicate/nonfinite/Unicode
admission; baseline installed equality alone is insufficient.

The new Python and JS engine constructors snapshot explicit resources before
Rust controls run; Python uses sys.maxsize for host value counts and JS uses
MAX_SAFE_INTEGER. Include host-side snapshot/admission work in cooperative
resource accounting or bound it explicitly, and test cancelled/max_work=0
construction plus large source/result conversion. Preserve independently
admitted catalog resources and operation limits rather than imposing the
ordinary source ceiling on aggregate output. Existing R2 host transport code is
not requalified by these new codegen wrappers.

No semantic implementation was edited by this reviewer. Re-review changed
material and affected dependencies after fixes, retaining all expected fixtures
unchanged. Stage-one and migration-options work remain outside this rereview.
