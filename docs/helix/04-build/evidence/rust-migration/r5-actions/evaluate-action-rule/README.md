---
ddx:
  id: umf.evidence.rust-migration.r5-actions.evaluate-action-rule
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
---

# R5 `evaluateActionRule` predecessor packet

This Gate0 packet freezes the current TypeScript predecessor for one bounded,
pure `umf.actions.rules/1` evaluation operation. It is input material for a
later opt-in Rust port and independent review. It does not claim Rust
implementation, action-family parity, authorization, transaction execution,
or default cutover.

The fixture inputs are authored in
[`tests/actions/evaluate-rule-predecessor.ts`](../../../../../../../tests/actions/evaluate-rule-predecessor.ts)
and materialized as [`predecessor-cases.json`](predecessor-cases.json). The
checked-in [`predecessor-results.json`](predecessor-results.json) records each
exact boolean or refusal `{code,message,path}` from the current TypeScript
implementation, plus whether caller-owned state remained unchanged. The test
[`tests/actions/evaluate-rule-gate0.test.ts`](../../../../../../../tests/actions/evaluate-rule-gate0.test.ts)
replays the harness, compares exact authored input cases, verifies every bound
source/resource hash, and requires exact ordered result equality. The corpus
contains 49 cases: 23 boolean results and 26 refusals.

## Frozen semantics

- Optional absence is distinct from explicit `null`. `present(absent)` is false;
  `present(null)` is true; equality accepts null only when the compiler admits
  the nullable family. An absent value used as an operand refuses.
- `and`/`or` short-circuit at evaluation after complete compile-time syntax,
  dependency, type, phase, and frame checks.
- Integer values use exact integer tokens and arbitrary-precision arithmetic;
  no IEEE-754 coercion is used. Typed literal/domain admission can refuse before
  evaluation. The corpus covers `lt`, `le`, `ge`, exact depth 32, node count 512,
  text length 65,536, a 4,000,000-character arithmetic result, and refusal when
  arithmetic exceeds that result bound.
- A missing frame identity refuses unless an `exists` guard short-circuits the
  field read. A present entity with a missing field yields absence, which can be
  tested with `present`; an unguarded use refuses. Stored field wrappers and
  domains are validated before comparison.
- Outputs and post-state are postcondition-only. A relationship lookup requires
  an explicit snapshot; unavailable or malformed snapshots refuse, while an
  available snapshot with no matching link evaluates false. Every entry in a
  supplied relationship snapshot is validated even after a matching entry.
- Evaluation recompiles the original expression before copying/admitting
  runtime state. Unknown expression members/operators and undeclared
  dependencies refuse; invalid syntax in a short-circuited branch still
  refuses. A compile-time dependency failure precedes malformed runtime input;
  after a valid compile, unknown input IDs and accessor-bearing state refuse.
- Runtime state is read-only from the caller's perspective. Every captured case
  verifies that its caller-owned state equals its pre-evaluation snapshot,
  including refusal cases.

The exact case order and exact refusal envelopes are in the result JSON. The
packet intentionally does not define executor failure receipts or host-side
transaction behavior. A separate [numeric grammar and arithmetic predecessor capture](numeric-source-review-cases.json) freezes 92 current-source controls, including exact numeric token refusals, signed-width boundaries, cancellation/carry/borrow, and deterministic small arithmetic cases; see [captured outcomes](numeric-source-review-results.json) and its [interim moving-tree closure receipt](numeric-source-review-hashes.json). Historical Gate0 remains unchanged.

## Source and runtime binding

`source-hashes.json` binds 47 files across the TypeScript evaluator/compiler,
selector and input admission, key tuple codecs, validators, action schemas and
package, generated core model and resources, helper closure, source fixtures,
case harness, test, captured results, package manifest and Bun lockfile. The
test actively verifies every listed SHA-256 and the running Bun version.
Capture runtime: Bun 1.4.3. Rule expression limits are 32 depth,
512 nodes, and 65,536
UTF-16 code units, as declared by the bound `expression.ts` source. The core
JSON resource limit and exact error precedence remain those of the bound source
cohort.

## Opt-in Rust port status

The Rust operation is exposed only as
`umf_codegen::actions::evaluation::evaluate_action_rule`. It recompiles before
reading runtime state, validates the current Core 0.10.0 document and action,
uses a caller-owned `Context` for per-call work/cancellation/deadline controls,
copies the runtime snapshot, and performs no action execution or authorization.
It does not change default action analysis or any binding.

Focused Rust differential tests match 48 of the 49 frozen vectors exactly,
including values and refusal `{code,message,path}`: scalar absent/null, boolean
short circuit, exact integer operations, malformed and unavailable frames,
post-state/output behavior, syntax and phase refusals, expression/text limits,
relationship snapshots, failure precedence, and invalid runtime inputs. The
only omitted vector is accessor-bearing JavaScript state, which Rust `Value`
cannot represent. Both 4,000,000-character result boundaries pass. Twelve
focused Rust action tests pass, and the core literal integration suite passes
16/16. A separate 92-case current-source numeric packet matches exact values
and refusal envelopes. Integer admission and add/sub use canonical signed
digits; arithmetic is linear in operand digits, charges work before allocation,
uses fallible reservation, and checks cancellation/deadlines in 65,536-digit
chunks. The action result-width limit is checked before public token formatting.
The separate [current-source review cases](current-source-review-cases.json)
and [captured outcomes](current-source-review-results.json) add nine exact
unknown-ID/declaration-order, malformed-wrapper/schema-diagnostic, and falsy-output checks;
their [current closure hash receipt](current-source-review-hashes.json) is
separate from the historical Gate0 snapshot and records an interim moving-tree cohort. Root must recapture a fixed-point release cohort after active Rust/source edits settle.
This remains an opt-in port, not all-49 parity, action-family support, binding
support, or native qualification. `num-bigint` is pinned to 0.4.8, already
present in the workspace lockfile through `umf-core`.

Run the focused predecessor check from the repository root:

```sh
bun test tests/actions/evaluate-rule-gate0.test.ts tests/actions/interpreter.test.ts
```

This is Gate0 predecessor evidence only. A Rust port must add a separate
source-bound differential receipt, wire/binding qualification, and independent
Sol review before support claims or cutover.

## Authority boundary

CONTRACT-900 requires unknown action meaning to remain visible and blocks safe
qualification when relevant meaning is unchecked. CONTRACT-901 defines the
rules/1 type, absence/null, frame, dependency, and evaluation boundaries used
to select these cases. Its header still names core 0.8.0, while the bound
current TypeScript compiler requires `CURRENT_CORE_VERSION` 0.10.0. This packet
records the current source predecessor only; that version drift is unresolved
here and the packet does not claim full conformance to the transactional
protocol or authorize execution.
