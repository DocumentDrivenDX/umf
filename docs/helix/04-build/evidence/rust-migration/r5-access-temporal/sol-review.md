---
ddx:
  id: umf.evidence.rust-migration.r5-access-temporal.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-access-temporal
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
---

# Independent Sol review: Access temporal token parser

Sol independently replayed the 56-case Bun predecessor packet and reran the
Rust core (6/6) and tagged wire (3/3) suites. The wire test compares all 48
tagged-representable cases by full result fields or exact error class/message;
the eight raw JavaScript host cases remain predecessor-only. Review requested
additional signed offset, UTC year-edge, leap/calendar and six-digit fraction
cases and verification that downstream RFC3339 failures are not collapsed into
an accepted branch. The final source validates those branches before the
defensive parser fallback. Rust core SHA-256 is
`e505c1ec88c08b0796ac098da0881bbb0e7d010a0973d50d8034af9b604c419a`,
wire SHA-256 is
`be0e4f2188061ecd4811421959696e69d46b5dadff63de7ccd430cb8132c5faf`,
and predecessor SHA-256 is
`79e1b5e13322cf2fc9324570be6ae6d9964fc58df748480c23f987978a62b993`.

This accepts the explicit `umf-access-temporal/0.1.0` opt-in tagged-token
subset. It does not bind raw JS objects, Python carrier classes, Node/Bun or
Chromium packages, choose a profile for a bare core scalar, or retire the
TypeScript default route.
