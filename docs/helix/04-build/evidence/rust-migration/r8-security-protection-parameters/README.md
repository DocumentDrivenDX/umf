---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-parameters
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
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-protection-resolution
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-literal
      kind: informed_by
---

# V2 security protection parameter candidate

[`predecessor.json`](predecessor.json) freezes 11 current Bun outcomes for
`validateProtectionParameters` and its internal composition helper
`checkProtectionParametersWithinBudget`. The harness
[`security-protection-parameters-predecessor.ts`](../../../../../../scripts/rust-migration/r8/security-protection-parameters-predecessor.ts)
supports `--check`, which regenerates in memory and compares the packet
byte-for-byte.

The packet covers a valid integer parameter and range bucket, literal-family
mismatch, malformed integer token, large numeric expansion, a 4097 UTF-16-unit
string, 33 parameters, unknown catalog/policy/core content, refusal ordering,
an internally pre-spent literal budget, and a raw policy accessor whose getter
must not run. The internal budget case is a TypeScript-object boundary that
cannot be represented by the tagged JSON request. The accessor case documents
raw-host behavior and is also outside tagged JSON.

The Rust core candidate in `crates/umf-core/src/security_parameters.rs` composes
the source and domain candidates documented in
[`r8-security-protection-resolution`](../r8-security-protection-resolution/README.md)
with exact Field selection and `checkSchemaLiteral` admission. It uses a shared
work/text budget across parameter values and range buckets, preserves UTF-16
diagnostic path/message units. The catalog's 4096-unit canonical literal bound
is enforced during source inspection in `security_logic.rs`, before domain
resolution can add its domain-only warning. The opt-in tagged wire in
`crates/umf-core-wire/src/security_parameters_binding.rs` uses profile
`umf.security-parameters/1` and exposes only `validateProtectionParameters`.
Repeated/container and non-integer/non-decimal Fields are refused as
unimplemented.

Rust wire replay passes eight tagged cases from the frozen 11-case packet:
valid parameter plus range bucket, wrong literal family, numeric expansion
bound, canonical literal-size bound, excessive parameter count, unknown
catalog member, unknown policy member, and unknown core member. The malformed
integer-token case is excluded from diagnostic-array parity: the native JSON
Schema engine collapses nested `oneOf` diagnostics while the TypeScript
predecessor returns all branch diagnostics. The pre-spent JS budget and raw
accessor cases are outside tagged JSON.

[`budget-boundary.json`](budget-boundary.json) adds a supplemental current
source case with two individually admitted integer tokens whose normalized
coefficient text totals 100002 units. Rust refuses the second literal at
`/transforms/0/parameters/1` with the same `PROTECTION_LITERAL_BOUND` message.
[`diagnostic-order.json`](diagnostic-order.json) freezes a crossing case where
an over-limit literal in the first transform precedes an unknown member in a
later transform; Rust preserves the TypeScript diagnostic order.
Focused Rust tests cover cumulative work/text accounting, zero-coefficient
charging, UTF-16 diagnostic preservation, bounded definition indices, closed
request shape, and host-control refusal. Candidate results remain
`complete: false` and `authority: false`; the operation does not establish
function arity, domain compatibility, transform applicability, interpretation,
or authorization. There is no default Node/WASM route.

Validation: all three Bun packets pass read-only `--check`; `bun run typecheck`
passes; focused Rust parameter wire tests pass 5/5, domain wire tests pass
2/2, and source wire tests pass 2/2. Existing source/domain UTF-16 tests also
pass.

Pinned capture digests:

- Capture script SHA-256: `d267d1de48cbfb5c6b4cf82ef370f2bb822a5fb771857361f72221ff85ecb7a2`
- Predecessor packet SHA-256: `f2c5196475f8101d8f833079a2e679c62601ec6655aa8e8ed6be6c57784e0c60`
- Cumulative-budget packet SHA-256: `66d47a0f922a89ef3e738bc1aa759a449048316ce4c4ecf9bb2b71784f84651a`
- Cumulative-budget capture script SHA-256: `b19abd765fb1ede695b150bb2bb1d712793d641186249394c91e7d4eba234f13`
- Diagnostic-order capture script SHA-256: `f56d7a63b73075736cd71cf50b895c9628c3e05ff7bc3a07fcddac82ccabc160`
- Diagnostic-order packet SHA-256: `5ceddb95e2d5d702c2b7d720c928b78155ddf6331eed18761c3a370927770730`
- Rust parameter core SHA-256: `cd590b013a7c2debf3910c42500a9ab9698d217c27bcee3b19e59714e3a4be5e`
- Rust source core SHA-256: `fdad3e0387fa590a1dfbe9f694a06e81b7e906975c9316acae3448aae42c2130`
- Rust parameter wire SHA-256: `adf9f843d6d65423ecf2ee013e5850b25ba8fb31897787b53d00377175685272`
