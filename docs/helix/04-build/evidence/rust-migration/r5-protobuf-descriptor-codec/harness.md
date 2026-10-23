---
artifact_id: R5-PROTOBUF-DESCRIPTOR-CODEC-RUST-REPLAY-HARNESS
artifact_type: evidence
status: captured
---

# R5 replay harness and installed-wheel result

`scripts/rust-migration/r5_protobuf_predecessor_harness.py` validates and
reconstructs the frozen operations before invoking the opt-in Python bridge
`umf.rust_protobuf_descriptor`. It does not invoke Cargo, rustc, or the default
TypeScript/Python adapters. Run it in an environment with the intended installed
wheel; do not put `python/src` ahead of the installed package on `sys.path`:

```sh
python3 scripts/rust-migration/r5_protobuf_predecessor_harness.py \
  --output /tmp/r5-protobuf-rust-replay.json
```

Before importing the bridge, the harness checks SHA-256 for the frozen
`predecessor.json` (`0fd7b1250644a07946f78c48bce88c4c77e5b3e314a691ca2dfba877a84362d4`)
and `capture.ts` (`e540b83f2f54233d9f7701e6243435543e589c7b32359e3de8380d5d8806249b`).
It also validates `fixtures/protobuf/authored.pb` against the packet's frozen
length of 83,233 bytes and SHA-256
`6d64e6f8cc8eb240d181b2715b455e62a933a19bd18112620a892ea3ae285bf6`.
It takes expected observations from the immutable 93-operation packet and
constructs reproducible binary inputs from the capture program. It does not
regenerate or modify either frozen file.

The harness reconstructs all 93 packet operation inputs: authored input,
wire controls, malformed inputs, nested depth probes, large unknown values,
writer-only trees, and round-trip operations. Each executed case stores the exact
predecessor observation next to the Rust tree, output digest, and round-trip
result. It classifies exact tree/byte/summary matches, status mismatches, and
error outcomes separately. The 4 MB and eleven-byte cases receive explicit
contract-divergence classifications so predecessor/native disagreement is never
silently reported as an ordinary mismatch.

The 2026-10-23 installed-wheel replay used `umf-core` 0.11.0, CPython 3.11.17,
Darwin arm64 and `_rust_core.abi3.so` SHA-256
`7a66e3382daf656697e2f75982e30df77a2534676cd8b11c634203e44bf800a1`. All 93
operations were reconstructed and replayed. The initial report marked five
nested-depth cases as `value_mismatch` because their baseline contains a byte
summary while the harness omitted Rust's `inputBytes`; it then compared that
summary to the complete Rust tree. The returned trees were already byte-exact
round trips. The harness now records `inputBytes`, distinguishes summary records
from full descriptor trees, and includes controls for both comparison paths and
for missing summary fields. The corrected replay classifies 32 operations as
exact, seven as contract-expected divergence, and 54 as contract-expected
rejection. This includes 51 newly classified both-error cases—malformed binary,
trees invalid under CONTRACT-003, and descriptors beyond the inherited core
tree-depth limit—plus three already classified over-bound rejections. Error wording and implementation-specific codes
are outside parity. No operation is unreplayable. Both supplemental overlong-enum
cases match their expected contract trees and bytes. The compact receipt is
[`installed-wheel-replay-summary.json`](installed-wheel-replay-summary.json);
the 102,529,901-byte full report was written to `/private/tmp/umf-protobuf-rust-replay-corrected.json`,
SHA-256 `3f5e98c6de61dada2036d4be6078717e41678a24c5640316b4b9121e8c538202`.

Six predecessor expanded-hex writer failures are exempted by explicit
contract-aware comparison: the read-write and writer-only operations at payload
sizes 3,999,990, 3,999,991, and 3,999,993. Each must produce the expected binary
length and SHA-256; read-write cases must also round-trip exactly. The 3,999,994
cases remain expected rejections because their binary input/output exceeds the
4,000,000-byte contract limit. Built-in source-only comparison controls exercise
these classifications, nested summary comparison, and the three
`bytesHex`/`outputHex` round-trip aliases before bridge import.

Known divergences are named in the emitted JSON. In particular, the 4,000,000-byte
unknown field is expected to round-trip under CONTRACT-003 despite the predecessor
writer's expanded-hex failure; the eleven-byte unknown varint must be rejected
despite Buf's acceptance. A separate supplemental cohort now replays the
overlong `e300` singular `FileOptions.optimize_for` and packed
`FieldOptions.targets` cases from `normative-corrections.md`; these remain outside
the frozen 93 operations. The report records expected contract trees and bytes
beside Python protobuf 7.36.2's behavior. For packed targets Python canonicalizes
`e300` to `63`, while the contract target retains `e300` exactly.

The supplemental singular input/output has SHA-256
`9aa5992ac5aa130381f63a03957b8a04308801f83e4b66f4dd2be1446eccb8fe`. The packed
input has SHA-256 `86121a985752b6603f217a66d21a5f6779d94419934ed734997aa501d99ed243`;
the contract output hashes to `fb285e344e7365080cfae7146c3a2dc1ae3906ee4649784278042a59ac1ee91a`,
while Python protobuf's canonicalized output hashes to
`04e6d5c3e5d3291bb38901de4f7198c399b880004f5fd4202ff81f0024b74222`.

## Gates

- **Current:** installed-wheel replay is captured for the stated Python 3.11
  Darwin arm64 cohort; 25 source comparison controls and 10 supplemental source
  controls pass.
- **Open:** qualify the codec through the other bindings and browser/runtime
  cohorts. This replay does not establish full adapter support, the complete
  descriptor graph, or universal Protobuf conformance.
