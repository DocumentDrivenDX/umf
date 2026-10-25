---
ddx:
  id: umf.evidence.rust-migration.r5-record-members-inspection-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r5-record-members-inspection
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent Sol review: Core Record members

Sol reviewed the current Rust core implementation, its tagged wire dispatch,
the Node/WASM wrapper request shape, the updated 11-case TypeScript packet and
the focused wire test. The original Rust code reconstructed the caller's
identity object in module/element order and decoded a diagnostic string with
`unwrap_or_default()`. The repair retains the copied identity member order and
propagates UTF-16 diagnostic message/path units; the packet now covers reversed
identity order and an isolated surrogate in a qualifier warning path.

Both host wrappers send `registry: []` on this route. The operation-specific
wire gate accepts that exact empty registry with the five named resources and
the required request members, and refuses extra/missing members and a nonempty
registry. This is a tagged per-call test adapter, not a retained production
Engine/Registry or callback qualification. The operation preserves the complete
source and distinguishes absent members from explicit empty members.

Sol independently reran the predecessor packet `--check` and
`cargo test --locked --offline -p umf-core-wire --test r5_record_members_inspection`
against the shared tree. The packet check passed; the wire suite passed 2/2,
covering all 11 frozen cases and the closed-request negatives. The prior real
Chromium receipt covers nine older cases only. Fresh isolated Node 26.12.1,
Bun 1.4.3, and Chromium 153.0.8010.12 packages each matched all 11 current
cases; Sol reran Node/Bun and Chromium independently against the fresh private
packages. The Chromium run found no Node globals, and Sol compared its receipt
byte-for-byte with the Luna receipt. The separate Node and Bun receipts carry
runtime identities and 11 actual outcomes each. Their source and package
hashes are pinned in the checkpoint README. These are scoped source-slice
packages; full transitive-build, retained-resource lifecycle, raw-host
admission and installed release qualification remain open. The known internal
result-schema diagnostic boundary documented in the checkpoint README remains
outside the frozen cases.

## Retained runtime and host follow-up

The later retained Rust runtime owns the exact five resources, an empty
Registry, and one compiled result schema. Sol independently reran its focused
unit tests (3/3, including the 11-case packet, resource boundaries, and
callback refusal) and the tagged wire suite (2/2). This adds a retained
resource lifetime to the earlier per-call adapter; it does not change the
earlier receipt's scope.

Sol also reran the opt-in WASM wrapper suite (3/3) and its real Chromium
153.0.8010.12 replay (11/11) on the combined optimized package. Node 26.12.1
and Bun 1.4.3 each matched the same 11 frozen cases through a combined private
addon. The focused Node suite passed 5/5 (25 assertions). Its resource
snapshot rejects missing, extra, accessor, and non-plain entries before native
construction while preserving host TypeErrors; each call has a fresh control
bridge, and disposal refuses later inspection. The combined addon also reran
the Record Type Node/Bun packet and its 8/8 focused suite. These are scoped,
opt-in retained bindings, not a default or installed-package qualification.
Arbitrary Proxy trap order, extension callbacks, and complete transitive build
closure remain open. See [Node](node-retained.md) and
[WASM](wasm-retained.md) receipts for the exact source and binary pins.
