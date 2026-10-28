---
ddx:
  id: umf.evidence.rust-migration.r8-security-not-current-darwin-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-062
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-security-not-direct-binding
      kind: extends
---

# Current-source Darwin `securityNot` installed replay

This packet records the exact CONTRACT-062 14-case `securityNot` acceptance
profile on a fixed-point SDK archive built from commit
`e9ace728d2e8c0758b4723e3d1eef90b330ebe0d`, on Darwin arm64. The package-root
Node route passed on Node 26.12.1 and Bun 1.4.3; the package-root browser route
passed in Chromium 153.0.8010.12. Each host also passed the unchanged
TypeScript `./reference` route.

The source closure SHA-256 is
`a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25`, covering
3,595 inputs with zero generated-input transforms. The deterministic SDK archive
SHA-256 is
`accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c`; its
verified member map contains 1,807 members. The frozen packet SHA-256 is
`10ac8874de655a4896dfd63b0de1dbd884a3049bba5118843beb35fd04bc46e6`.
[Archive provenance](cohort.json), the full [member map](archive-members.json),
[package manifest](archive-package.json), and [source closure](archive-source-cohort.json)
bind all three receipts to those exact bytes.

The ordered cases are T, F, U; null, number, boolean, and an unknown string;
array, ordinary object, null-prototype object, and accessor object; then Proxies
trapping `ownKeys`, `getPrototypeOf`, and property `get`. T/F/U returned
F/T/U respectively. Each invalid case threw `UmfError` with code
`SECURITY_TRUTH`, message `Invalid security truth`, and empty path. All
traces were empty, so no getter or Proxy trap ran. Each valid default-route
call dispatched to Rust once; invalid values were rejected before Rust.
Reference-route Rust dispatch was zero for every case. Chromium loaded the
packaged WASM member, asserted no Node globals, and recorded matching outcomes.

Raw per-case receipts: [Node](node.json), [Bun](bun.json), [Chromium](chromium.json).
This is one Darwin arm64 cohort for the bounded `securityNot` profile. The
[matching Linux cohort](../r8-security-not-current-linux-20261027/README.md)
and its two-cohort `/3` validator result record a conditional retirement of
the exact Node and browser `securityNot` rows. Broader semantic parity,
hosted CI, and release suitability remain open. This packet makes no claim
about `securityAnd`, `securityOr`, policy evaluation, or general security
support. The SDK archive is retained in ignored
`.cache/sdk-distribution/` only when built through the canonical repository
path; this isolated archive is in `/private/tmp` and is not included here.
