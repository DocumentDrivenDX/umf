---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-functions-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-security-protection-functions
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: protection reference functions

Sol inspected the current TypeScript predecessor and the opt-in Rust core/wire
composition for `mask/constant` and `mask/null-out`. Review found and closed
three admission defects: the Rust scalar check used `item` instead of
`itemType`, unsupported-recipe refusal preceded the predecessor's selected
domain comparison, and a caller-supplied low work budget was misreported as a
100,000-unit literal bound. The candidate now rejects `itemType`, preserves
the selected-domain diagnostic order, distinguishes its own 4,096-unit bounds
from host budget failures, and retains the original host error diagnostic.

Sol independently ran the 14-case predecessor `--check`, one focused core
low-budget test and three wire tests. Ten tagged cases match the full current
TypeScript outcome; malformed integer-token and `itemType` cases are excluded
from diagnostic-array parity because the native JSON Schema engine orders or
collapses errors differently. Both still refuse. Two accessor cases are
raw-host observations outside the tagged JSON boundary. The reviewed packet
SHA-256 is `95d1025e43664003770d1d2853cbb634a40071f65039388563af713ebd53eaa8`;
the reviewed Rust core and wire SHA-256 values are
`fc9ea8b085a2dba4dc89bfd7b16bb273908071431533bc8ce37906715e5838d3`
and `b0d8a53541d8c55a17562283b2f95541a2a60a54573d22a4946ac1fbec342a47`.

This accepts only a bounded opt-in reference recipe. Every result remains
`complete:false` and `authority:false`. Native custody, policy authorization,
other recipes, full malformed-schema diagnostics, Node/WASM routes, installed
packages and default retirement remain open.

## Three string-recipe follow-up

Sol reviewed the added `mask/partial`, `mask/fixed-length-redact`, and
`generalize/prefix-only` branches against the TypeScript predecessor. Rust now
resolves every parameter's qualified Field, checks its scalar family, then
performs Unicode-scalar count and padding checks before input admission. The
partial suffix is limited by the characters remaining after the prefix, and
the fixed-redaction output bound is checked before padding allocation. The
shared parameter candidate now accepts the predecessor's string parameter
literal family. Unsupported recipes still refuse.

Sol independently reran the 29-case predecessor packet `--check` and the
focused Rust wire tests: 3/3 pass with exact replay of 25 tagged cases. The
same two raw-host accessor and two schema diagnostic-order exclusions remain.
No security default route was selected. The packet
SHA-256 is
`65b35493ec93e5e01df50e7923f23f4918afea819715f79a9ee637155fb04b08`;
the reviewed core and wire SHA-256 values are
`03cf1e2c54610b7b22a46ab5bea5c6c4f79068fdd3e2221248c4c16efaa3c470`
and `107e7aea9425b2f89a4e0268853f335655a101e4edfc1cb73585b08b759f1a13`.
No host binding, authorization decision, or native protection effect is
qualified by this packet.
