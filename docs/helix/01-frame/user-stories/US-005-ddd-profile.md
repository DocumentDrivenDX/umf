---
ddx:
  id: US-005
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-004
      kind: informed_by
---

# US-005: Preserve and validate domain declarations

As a domain-model author, I want portable declarations of identity, ownership and
context boundaries so that physical systems can consume the model independently.

## Acceptance Criteria

- **US-005-AC1:** The complete authored sales corpus survives JSON/YAML with Order,
  OrderLine, ShippingAddress, Money, OrderPlaced, services/repositories, separate
  customers and a billing account holder. Context mapping direction and limitations
  remain explicit; opaque invariants remain incomplete interpretation.
- **US-005-AC2:** Invalid identities/equality, dangling references, self/cross-context
  membership, conflicting entity ownership, wrong repository/event targets, out-of-
  boundary invariants, invalid mappings/ACLs and nonlocal terms fail semantic checks.
- **US-005-AC3:** Unknown fields and asserted equivalence remain recoverable and
  prevent conservative edits; no structure comparison establishes semantic identity.
- **US-005-AC4:** Fully interpreted model edits are atomic and reject invalid results.
  Metadata access returns copies, and no physical table/graph/API meaning is added.
- **US-005-AC5:** Actual Chromium executes DDD round-trip and semantic-edit checks.

## Evidence and Limits

`tests/ddd/profile.test.ts` contains authored expectations and meaningful mutations;
`scripts/browser.ts` covers AC5. This is a UMF-authored semantic profile, not a
native external-tool corpus. CONTRACT-005 governs rule scope. No invariant language
is executed by this version. Physical projections and runtime enforcement remain
separate work; completing this story cannot complete the overall UMF goal.
