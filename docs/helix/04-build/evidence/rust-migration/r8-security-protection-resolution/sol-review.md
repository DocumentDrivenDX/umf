---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-resolution.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-security-protection-resolution
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
---

# Independent Sol review: protection resolution candidate

Sol inspected the 14-case current Bun packet and the Rust snapshot candidate.
The candidate copies policy, catalog, then closure through the metered context,
retains tagged unknown members and refuses authority. Sol independently reran
the read-only packet check and the focused Rust test (1/1). The packet SHA-256
is `aa18f54725f113082dbc02af64fdf739640bd0bcb301ad4d82b3c2ec9f371386`;
the Rust source SHA-256 at review is
`a867c3b0b109f1ae4cfb33febd4af5c930cad0338a145fdc58ff6af7b0a2fecc`.

This is a preservation and refusal scaffold, not a parity implementation of
either TypeScript resolver. It returns a generic unimplemented diagnostic and
does not reproduce the packet's schema, pin, reference, Field or domain
results. No wire or default route is selected; all six disclosure exports
remain TypeScript executable gaps.

## Source-stage resolver and opt-in wire — 2026-10-25

The successor candidate now implements exact source-stage schema diagnostics,
catalog pins and transform references for ten tagged cases. Sol found a
cross-input diagnostic ordering bug: a policy schema error suppressed a valid
catalog's unknown-member warning. The correction gates catalog inspection on
catalog-local errors. A new frozen case proves the warning survives, and
another proves duplicate transform identities are refused during catalog
inspection before a reference can select either duplicate. Sol independently
verified the 16-case Bun packet byte-for-byte, then reran the Rust core (1/1)
and tagged wire (2/2) source-stage suites. The capture and packet SHA-256
values are `750746a5d1dadaa4436d53e9ee11ef00687b2a3a9fdfcbb358a22c82bb0662ca`
and `e05218e5b98cf2fe1b2c3b95f62d2559a85b0346e71fe933f796aa9bc26b000e`.
The reviewed core and wire source hashes are
`aa046f7bc773443f08e1328751b9b17fa121db738352b60c1bdc1e854f5783aa`
and `4c319bbf08a963d04d9708e1889bb2fa642ac346e3f12cec03dc553de0fba7d3`.

This accepts only the tagged source-stage subset. Five domain-stage cases and
one raw-host accessor case in the packet remain unported. Nested unknown
catalog members beyond the tested root/transform paths, full policy/catalog
interpretation, Field/domain closure, authority, Node/WASM host boundaries and
default-route retirement remain open. The result explicitly retains
`complete:false` and `authority:false`.

## Domain-stage resolver and opt-in wire — 2026-10-25

Sol compared the next candidate with `src/extensions/security/protection/domains.ts`
and independently reran the 16-case Bun capture in read-only `--check` mode.
The Rust core replayed all five tagged domain cases (1/1 test), and the tagged
wire replayed those five cases and its closed-request controls (2/2 tests)
after the shared Delta source stabilized. The packet SHA-256 remains
`e05218e5b98cf2fe1b2c3b95f62d2559a85b0346e71fe933f796aa9bc26b000e`.
The reviewed domain core and wire source SHA-256 values are
`514613b25c07e4681b21223b76001ada6f87e18687c572442a5aeb50ce3a4405`
and `f8d3adce3c6855450c7dba17053d71c155f0625a8c1dc90b2d27bcb7ffc1e558`.
Targeted `rustfmt --check` and integrated `git diff --check` passed.

The candidate retains the closure and unknown content, resolves exact
revision-pinned Field locations, preserves occurrence order and diagnostics
for this packet, and returns `complete:false` and `authority:false`. The
one raw-host accessor case cannot be represented by the tagged JSON wire.
The current `0.10.0` core profile and selected semantic-types advisory are
embedded assumptions; other profiles, malformed UTF-16 identities, duplicate
field identifiers, broader closure/error shapes, policy interpretation,
literal compatibility, and Node/WASM/default-root retirement are unqualified.
The five-case proof does not establish authorization or native custody.

## UTF-16 diagnostic preservation — 2026-10-25

Sol found that the source and domain candidates converted several validator
paths and messages with `to_utf8().unwrap_or_default()`, silently erasing an
isolated surrogate that the tagged value transport can retain. The correction
now constructs diagnostic values directly from `Utf16` and joins path prefixes
by UTF-16 units. Sol independently reran the focused malformed-surrogate core
tests (source 1/1, domain 2/2 including the five-case replay), the source and
domain wire suites (2/2 each), and the 16-case Bun packet check. The corrected
source and domain core SHA-256 values are
`d3c17047a73890d269dfca3c0d5ba9527fe2ab1b4a4b3be23b08f705ab864b6d`
and `7160b3604785354911e4315bbe40b6f7727bd63aaf19686cc7e95e9f8b96cc7c`.
Targeted `rustfmt --check` and integrated `git diff --check` pass. This fixes
diagnostic transport preservation; it does not extend the qualified semantic
case set, host routes, or authority.

## Catalog literal-bound stage and diagnostic order — 2026-10-25

Sol found that checking the 4096-unit catalog literal bound only after domain
resolution produced a later `PROTECTION_DOMAIN_ONLY` warning absent from the
TypeScript predecessor. The bound now runs during catalog source inspection,
interleaved with each transform's unknown-member diagnostics. The supplemental
crossing packet puts a bound in transform 0 and an unknown member in transform 1;
the Rust wire asserts the complete TypeScript diagnostic order. Sol independently
reran the 16-case source/domain packet check, the crossing packet check, the
focused security core suite (12/12), and security wire suite (12/12). The
crossing packet SHA-256 is
`5ceddb95e2d5d702c2b7d720c928b78155ddf6331eed18761c3a370927770730`;
the revised source core SHA-256 is
`fdad3e0387fa590a1dfbe9f694a06e81b7e906975c9316acae3448aae42c2130`.
This supersedes the earlier source hash above. The candidate remains opt-in,
data-only, incomplete and non-authoritative.
