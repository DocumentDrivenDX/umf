---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-functions
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
    - id: umf.evidence.rust-migration.r8-security-protection-parameters
      kind: informed_by
---

# V2 security protection reference-function candidate

[`predecessor.json`](predecessor.json) freezes 29 current TypeScript outcomes
from `inspectProtectionFunction` and `evaluateProtectionValue`. Its capture
script is
[`security-protection-functions-predecessor.ts`](../../../../../../scripts/rust-migration/r8/security-protection-functions-predecessor.ts);
`--check` regenerates in memory and compares the packet byte-for-byte.

The packet covers inspect/evaluate for `mask/constant` and `mask/null-out`, plus
the exact `mask/partial`, `mask/fixed-length-redact`, and
`generalize/prefix-only` string recipes. The added cases cover Unicode-scalar
counts and emoji, partial-prefix/suffix non-overlap, one-scalar emoji padding,
zero and 4096 count boundaries, count 4097 refusal before input admission,
nullable null propagation versus required-null refusal, output UTF-16 bound
refusal, isolated-surrogate refusal in parameter and input literals, and
function-parameter family/qualified-field refusal. Existing cases retain an
unsupported regex recipe, source and selection refusal ordering, unknown
catalog content, raw accessors, input literal resource bounds, a domain
mismatch, and an `itemType` field. Rust tagged-wire tests replay 25 source-backed
cases. The malformed
integer-token case is retained but excluded from exact diagnostic-array parity
because the native JSON Schema engine collapses nested `oneOf` diagnostics.
The `itemType` case is also excluded from exact array parity because native
schema validation orders its accumulated `allErrors` differently; both sides
refuse it. The two accessor cases are raw-host observations and are not
representable at this tagged JSON boundary.

The opt-in core candidate is in
`crates/umf-core/src/security_functions.rs` and extends string-parameter literal
admission in `crates/umf-core/src/security_parameters.rs`, with profile
`umf.security-functions/1` in
`crates/umf-core-wire/src/security_functions_binding.rs`. It composes the
source, domain, and parameter candidates and supports only the exact
`mask/constant`, `mask/null-out`, `mask/partial`, `mask/fixed-length-redact`,
and `generalize/prefix-only` reference recipes. The three string recipes require
explicit string input/output Fields and exact integer/string parameter Fields;
they use Unicode scalar counting while preserving UTF-16 source values, and
refuse unpaired surrogates through the pinned core literal checker. Counts are
bounded to 0..4096. Partial/fixed-redaction results are size-checked before
padding repetition against the current canonical UTF-16 literal ceiling.
Unsupported recipes, unsupported field shapes, and native/keyed/vault execution
fail closed. Candidate results remain `complete: false` and `authority: false`;
this opt-in tagged adapter does not provide a policy authorization decision or
a default host route.

Validation: packet `--check`, repository `bun run typecheck`, and focused offline
`umf-core-wire` tagged predecessor replay pass (25/25 cases). A
caller-supplied smaller host budget preserves its actual engine diagnostic
instead of being mislabeled as the function's 100000-unit limit. The candidate does not establish
raw-host parity, full malformed-native-schema diagnostic ordering, temporal or
float value profiles, native/cryptographic protection behavior, or a default
Node/WASM route. The two raw accessor observations are preserved in the packet
but cannot be represented by tagged JSON. Two schema diagnostic-array cases
remain excluded from exact diagnostic order parity as noted above.

Pinned SHA-256 digests:

- Current TypeScript predecessor implementation: `812cc514b453f519c19c256401f3bc71b7e63c1cc962ec2907e25debc528098c`
- Capture script: `cdeac0612025236863e531298b2b726b4451dfa24466ce8012e7a408bb79f955`
- Predecessor packet: `65b35493ec93e5e01df50e7923f23f4918afea819715f79a9ee637155fb04b08`
- Rust core candidate: `03cf1e2c54610b7b22a46ab5bea5c6c4f79068fdd3e2221248c4c16efaa3c470`
- Parameter literal candidate: `dcb99c2db816d015bb7a169e4d5a2e6fa056bc6e68571e56cb48fe671a8ba79c`
- Rust tagged wire: `107e7aea9425b2f89a4e0268853f335655a101e4edfc1cb73585b08b759f1a13`
