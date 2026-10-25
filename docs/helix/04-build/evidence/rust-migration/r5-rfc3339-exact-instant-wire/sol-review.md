---
ddx:
  id: umf.evidence.rust-migration.r5-rfc3339-exact-instant-wire.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: EVIDENCE-RFC3339-WIRE-R5
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
---

# Independent Sol review: RFC3339 exact-instant tagged wire

Sol inspected the opt-in closed two-operation dispatcher, its tagged-value
transport, the current TypeScript capture and the Rust packet replay. The
capture records 12 representable cases and four host-only observations; the
Rust test skips only the explicitly marked host-only inputs. Sol independently
reran the Rust wire suite (4/4) and the existing Bun adapter suite (5/5), and
checked the source, packet, wire, test and capture SHA-256 values:

- TypeScript predecessor: `17f524ce64ea0ddca713b3d5c2e3105b3f6dfcf4bb52ae903c19b01388edd84e`
- Packet: `bf446002e3ad70a216e360e685f779e680b7efdd5258d8a0ed7e7568bab2c9e1`
- Wire implementation: `a601e5fdf48a4c34b9ff0349bdb9af3a85cdccfdecff4512ddf336f87b89d7ff`
- Rust wire test: `17002a6bfcf423c0c69c8dfc35537cc06e56f389815e7e2c0b849c0fcd2dcbef`
- Capture runner: `43a810d61d18afb9c33b1f690387a87568bebda21157f0b5e134ccd846933b5e`

The subsequent diagnostic refinement preserves branch-specific TypeScript
messages and first-fault order for the tagged cases. Sol independently reran
the revised Rust core tests (5/5) and wire tests (5/5), including the
1,048,576/1,048,577 UTF-16-unit boundary and a calendar-plus-offset collision.
The revised core, wire, test and packet SHA-256 values are
`822debe5dbcf9dceec7dd0ffb73b89d9c090265128879c629e52601ac0b046f7`,
`ea5ba69925a7b2fee8c0d5961305b74a89ab9e3e70d62572895d0599277826a9`,
`ee72f715bb3663c54d444b1b245918c2bede9c93dad779843494e347143aa98f`,
and `d92a80d04e1974f446d4a686a106cc81a34dc913abb3a2727aa9aaa472a3a07d`.
The earlier hashes above identify the initial reviewed checkpoint only. The
four raw-host cases are evidence of exclusion, not Rust parity. The candidate
has no Node/Bun/Chromium package binding, default route, or retirement claim.
