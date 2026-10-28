---
ddx:
  id: umf.evidence.rust-migration.r8-access-temporal
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
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
    - id: CONTRACT-075
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-access-temporal
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
---

# R8 access-temporal Rust operation candidate

This packet qualifies a bounded opt-in Rust operation candidate for the two
logical TypeScript exports `ACCESS_TEMPORAL_PROFILE` and `parseAccessTemporal`.
The Rust constant is `umf_core::access_temporal::ACCESS_TEMPORAL_PROFILE`;
the pure operation is `umf_core::access_temporal::parse_access_temporal` and
the opt-in tagged boundary is
`umf_core_wire::access_temporal_binding::execute_access_temporal_wire`.
The implementation already existed from the R5/R6 temporal slice; this R8
packet adds a current TypeScript reference capture and a direct Rust wire replay.

[`reference-packet.json`](reference-packet.json) freezes the 48 tagged cases
from the 56-case R5 TypeScript predecessor. The eight JavaScript raw-host
cases are excluded because `umf.core-wire/1` carries tagged JSON values and
cannot represent `Date`, boxed strings, accessors, or proxy traps. The packet
pins the selected profile, operation name, predecessor digest, TypeScript
parser/dependency/contract source hashes, all successful result fields, and
the exact error class and message for refusals. It retains original token text,
UTC offset spelling, six-digit precision rules, epoch arithmetic, range checks,
and the captured refusal precedence.

## Focused qualification

On the captured worktree source, Bun 1.4.3 replayed the TypeScript reference
packet 48/48. The Rust integration candidate replayed all 48 cases through the
tagged wire and compared every output member, error code, and UTF-16 error
message. A direct core assertion also checked the exact version string and the
pre-epoch `-1` UTC-second result. The focused Rust candidate passed 2/2 tests.

Reproduce the packet and checks with:

```sh
bun scripts/rust-migration/r8/access-temporal/freeze.ts
bun scripts/rust-migration/r8/access-temporal/replay.ts
RUSTC=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/rustc \
  CARGO_TARGET_DIR=/private/tmp/umf-access-temporal-r8-target \
  /Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
  test -p umf-core-wire --test access_temporal_r8_candidate --offline
```

The R8 packet tests the selected token parser only. It does not admit raw host
objects, choose temporal meaning for a core scalar, validate a Python carrier,
preserve arbitrary UMF document extensions, call a native adapter, or alter any
default package route. The six R8 ledger rows remain unchanged and open pending
route integration, installed Node/Bun and browser/WASM qualification, and
review of the complete current source cohort. This evidence is an opt-in
operation candidate, not route retirement or a release claim.
