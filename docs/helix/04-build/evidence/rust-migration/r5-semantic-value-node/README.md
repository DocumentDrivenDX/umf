---
ddx:
  id: umf.evidence.rust-migration.r5-semantic-value-node
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# R5 trusted semantic validator Node binding

This is an additive, opt-in Node/Bun binding for the Rust semantic value core
slice. `createSemanticTypeRegistry()` exposes caller-owned `register`, `lookup`,
and `check`; the same registry also exposes
`validateCoreSemanticTypeValue(resources, source, identity, value)`. Rust
admits each registration before the host retains it. It copies definitions and
references, uses exact triple identity, and never loads callback code from a
document. The aggregate operation accepts the ordinary schema resources for
that invocation.

Validators are synchronous, trusted, and cooperative. Node passes copies of
the value and definition plus an additive third `{reportWork(units)}` argument.
Current TypeScript validators receive only two arguments, so the frozen
predecessor outcomes ignore this additive argument. Node accepts only
nonnegative safe-integer reports and sums repeated calls; Rust charges the sum
to the same operation `Context`. Invalid reports become `HOST_CONTROL` engine
errors. Callback result/exception framing is capped at 1,048,576 host work
units before the tagged response is returned to native code; oversized callback
data becomes `RESOURCE_LIMIT`. Meter, cancellation, and deadline controls are
kept as engine failures. Synchronous host callbacks cannot be preempted while
running; no hard-time guarantee is claimed.

The frozen TypeScript v3 packet records the direct, aggregate, registration
ordering, non-Error throw, and additive report-work probes. Registration
ordering is exact: Rust validates reference and definition, then host callable
type, then duplicate identity. The callable crosses the wire only as two
booleans and an opaque token; function objects never enter tagged data.

To preserve refusal order without serializing a later argument early, the
wrapper uses bounded ordering preflights for registration references, checks,
and aggregate source/identity. The check preflight sends copied reference
triples and validator-token presence only; Rust resolves exact identity and
qualifier rules. These calls omit the host control bridge and are not included
in the final operation's Context meter. The actual check/aggregate call creates
the controlled Context and performs authoritative work. Aggregate preflight
validates the document before value serialization, and the final call
validates it again; this is a bounded but measurable duplicate-validation
cost. Cumulative cross-stage host-control parity is not claimed.

The callback result, its decode copy, and returned tagged envelope share one
1,048,576-unit frame accumulator. A 1,048,577th unit is rejected before the
result frame is returned to native code. Validator tokens are exact JavaScript
safe integers only (through 9,007,199,254,740,991).

The callback bridge serializes the Rust core's already metered value and
definition snapshots through a borrowed encoder, avoiding another semantic
deep copy. Rust charges `reportedWork` before branching on callback status, so
a callback that reports work and then throws cannot evade the Context budget.

Each final operation currently reconstructs the invocation registry by
replaying all admitted entries into Rust. The 12-entry order test is a focused
case, not qualification of large-registry capacity or Map-like scaling; a
persistent native registry handle remains open for broader parity.

Focused results:

- `cargo check --locked --offline -p umf-core-wire` passed with Rust 1.90.0.
- `cargo build --locked --offline -p umf-core-node` passed with Rust 1.90.0.
- `bun test ./bindings/core/node/tests/semantic-value-registry.test.js`: 9 passed, 53 expectations at the final reviewed source.
- `bun test tests/semantic-types/core.test.ts tests/semantic-types/semantic-types.test.ts`: 16 passed, 98 expectations.
- `bun run typecheck` passed with Bun 1.4.3.
- A clean npm tarball was installed under `/private/tmp/umf-semantic-final-install` and imported by package name from an external replay script. Node v26.12.1 and Bun 1.4.3 both passed registry, aggregation, repeated work, invalid report, callable-admission, and forged-control checks. The rebuilt addon, tarball and source hashes are pinned in `receipt.json`.
- `cargo test --locked --offline -p umf-core-wire semantic_value::tests::validator_tokens_are_exact_javascript_safe_integers`: 1 passed.
- `cargo test --locked --offline -p umf-core --test r5_core_semantic_types`: 10 passed.

This evidence does not qualify browser/WASM callback transport; Python has a
separate opt-in CPython 3.11 binding receipt. It does
not claim hard callback preemption, does not route package defaults through
Rust, and does not claim the full `SemanticTypeRegistry` facade beyond the
listed methods and cases. Extension package callbacks and the legacy/transition
semantic APIs remain separate work.
