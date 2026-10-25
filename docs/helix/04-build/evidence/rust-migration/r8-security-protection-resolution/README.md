---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-resolution
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
    - id: US-079
      kind: informed_by
---

# V2 security protection resolution candidate

[`predecessor.json`](predecessor.json) freezes 16 outcomes from the current Bun
TypeScript `resolveSecurityProtectionSources` and
`resolveSecurityProtectionDomains` exports. It records exact policy/catalog
identity and revision pins, missing transform references, policy-before-catalog
schema diagnostic order, retained unknown policy/catalog members, stale domain
pins, unknown core and policy members, closure-shape-before-source-refusal
ordering, and accessor non-invocation. The capture harness
[`security-protection-resolution-predecessor.ts`](../../../../../../scripts/rust-migration/r8/security-protection-resolution-predecessor.ts)
uses `--check` to regenerate in memory and compare the packet byte-for-byte.

The Rust core candidate in `crates/umf-core/src/security_logic.rs` and the
opt-in tagged wire in
`crates/umf-core-wire/src/security_protection_source_binding.rs` replay the
ten tagged `stage: source` cases exactly, including source snapshots,
policy-before-catalog schema diagnostics, unknown-member warnings, exact
identity/revision pins, transform reference lookup, and diagnostic order.
The wire profile is `umf.security-protection-source/1` and exposes only
`resolveSecurityProtectionSources`. The focused Rust tests compare the full
summary and retained source values against those fixtures.

The separate Rust core module
`crates/umf-core/src/security_domains.rs` and opt-in wire module
`crates/umf-core-wire/src/security_domains_binding.rs` replay all five tagged
domain cases. The profile `umf.security-domains/1` exposes only
`resolveSecurityProtectionDomains`. Coverage includes qualified Field
locations in source order, retained closure snapshots, exact document
revision pins, refusal on unknown policy/core meaning, and closure schema
diagnostics before source-refusal results. Core documents are checked against
the embedded current UMF core validator; only the pinned 0.10.0 profile with
the documented experimental semantic-types advisory is accepted.

This remains a definition lookup result with `complete: false` and
`authority: false`. It does not qualify domain compatibility, literal values,
transform applicability, ontology, native custody, or policy interpretation.
The one raw-host accessor case remains outside tagged JSON and outside Rust
parity; no Node/WASM/default route is connected.

The packet includes a case where policy schema validation fails while a valid
catalog still emits its unknown-member warning. The Rust implementation gates
catalog local inspection on catalog-local schema errors, matching the
independent TypeScript inspection. It also refuses a duplicate transform
`id`/`version` pair during catalog inspection before reference lookup, so
duplicate identities cannot change which transform is selected.

Catalog source inspection also enforces the 4096 UTF-16-unit canonical literal
bound before domain resolution. Its transform walk interleaves each transform's
unknown-member warnings with that transform's literal-bound diagnostics. The
crossing parameter evidence in
[`r8-security-protection-parameters`](../r8-security-protection-parameters/README.md)
freezes a bound in an earlier transform followed by an unknown member in a
later transform.

The remaining case outside this Rust slice is the raw-host accessor case.
Tagged JSON cannot represent the accessor/proxy behavior of that host case.
The Rust results remain
`complete: false` and `authority: false`; this slice resolves source data and
references only. It does not implement policy/catalog interpretation,
protection validation, authorization, or a default Node/WASM route.

The source audit's main unresolved boundary is the V2 interpretation chain:
JSON/YAML transport, the `0.10.0` candidate core profile, exact Field
indexing, `checkProtectionParametersWithinBudget`, domain occurrence output,
and authority remain separate. The TypeScript helpers themselves return
data-only statuses with `complete: false` and `authority: false`; those
statuses are not authorization.

Validation: predecessor `--check` passed for 16 cases. The focused source core
test passed 1/1 and source wire tests passed 2/2. The domain core test
`cargo test -p umf-core replays_every_frozen_tagged_domain_case --lib` passed
1/1; domain wire tests
`cargo test -p umf-core-wire security_domains_binding --lib` passed 2/2.
`bun run typecheck` passes on the integrated source cohort. No default route
is changed.

Pinned local digests:

- Capture script SHA-256: `750746a5d1dadaa4436d53e9ee11ef00687b2a3a9fdfcbb358a22c82bb0662ca`
- Predecessor packet SHA-256: `e05218e5b98cf2fe1b2c3b95f62d2559a85b0346e71fe933f796aa9bc26b000e`
- Rust core file SHA-256: `fdad3e0387fa590a1dfbe9f694a06e81b7e906975c9316acae3448aae42c2130`
- Rust wire file SHA-256: `4c319bbf08a963d04d9708e1889bb2fa642ac346e3f12cec03dc553de0fba7d3`
- Rust domain core file SHA-256: `514613b25c07e4681b21223b76001ada6f87e18687c572442a5aeb50ce3a4405`
- Rust domain wire file SHA-256: `f8d3adce3c6855450c7dba17053d71c155f0625a8c1dc90b2d27bcb7ffc1e558`
