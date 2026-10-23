---
artifact_id: R5-PROTOBUF-DESCRIPTOR-CODEC-PREDECESSOR
artifact_type: evidence
status: captured
---

# R5 Protobuf descriptor codec predecessor freeze

This evidence freezes behavior from the current TypeScript descriptor codec as a historical predecessor observation. It is not a Rust parity claim, and mismatches below are known predecessor defects where CONTRACT-003 governs the Rust behavior.

## Reproduction and frozen cohort

From the repository root, run `bun docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/capture.ts`. The capture uses Bun 1.4.3 and `@bufbuild/protobuf` 2.15.0. It records 93 observed operations, the SHA-256 of each of 37 source/contract/fixture inputs, and a per-file hash map for all 344 files in the installed Buf package (closure digest `f8af62dda87923b9d6cf785bcd18843fd38aaa87ddac1922990a5b37a7f5b943`). Independent wire controls use `libprotoc 36.2` via `protoc --decode_raw`.

Frozen report: [`predecessor.json`](predecessor.json), SHA-256 `0fd7b1250644a07946f78c48bce88c4c77e5b3e314a691ca2dfba877a84362d4`. Capture program: [`capture.ts`](capture.ts), SHA-256 `e540b83f2f54233d9f7701e6243435543e589c7b32359e3de8380d5d8806249b`. Key source hashes include `src/adapters/protobuf/descriptor.ts` `be1d0450873a9b4dd0ff0e914ea1a282fe535e5ebde6f317c5f035c5f875dc8a`, CONTRACT-003 `ee0b2a00d7b4a2b22fef4e4edb119db743d167d9cb60b6706726b822ecae4f52`, and TD-003 `a93b94d31ab555ac85c9e496ad5b48c51e7151eca1c0307d060366b37bf3cd99`. The JSON report is authoritative for the complete closure.

## Contract-significant discrepancy controls

**Four-megabyte unknown field export.** The contract's descriptor binary limit is 4,000,000 bytes and unknown fields must remain exportable. The TypeScript predecessor accepts a valid 4,000,000-byte top-level unknown length-delimited field (#50000) and converts its exact wire value to 7,999,994 lowercase hex characters, but `writeDescriptorSet` rejects that returned tree with `PROTOBUF_BYTES: Expected lowercase hexadecimal bytes`. A 2,000,003-byte input (4,000,000 hex characters) still round-trips. This is a predecessor defect: the Rust codec should preserve and export valid unknown wire values throughout the 4 MB binary limit rather than inheriting the predecessor's expanded-hex regex failure. The 4,000,000-byte input has hex SHA-256 `0c5fff0e208b13ac995ea9feb2328fea59ab18abfb4c443e21b7b63c42a2670d`.

**Malformed eleven-byte unknown varint.** Input bytes `80b5188080808080808080808000` (tag for field 50000 followed by an eleven-byte varint) are accepted by Buf 2.15.0 and retained as unknown data `8080808080808080808000`; `protoc 36.2 --decode_raw` rejects the same bytes with exit 1 and `Failed to parse input.` This is malformed binary and CONTRACT-003 requires malformed binary to fail. The Rust decoder should reject it; do not treat Buf acceptance as the expected result. Input SHA-256 is `b02496cca95a00b78bc97009c6a7937c6929de602660d206b4b7b7152a03d12d`.

The frozen minimal closed-enum value 99 under `FileOptions.optimize_for` is preserved as unknown field #9 with exact bytes `63`, and re-encodes exactly to `0a0442024863`. A separate normative supplement covers the overlong **unpacked singular** closed-enum encoding `e300` in `FileOptions.optimize_for`: Buf normalizes it to `63`, while the independent Python protobuf 7.36.2 control preserves the full input. The **packed repeated** `FieldOptions.targets` control is distinct: Python protobuf moves invalid enum members to unknown wire type 0 and canonicalizes overlong `e300` to `63`, while the Rust target preserves the exact raw varint bytes; both cases are detailed in [`normative-corrections.md`](normative-corrections.md). CONTRACT-003 requires exact raw unknown wire bytes, so Rust follows that contract. An overlong known length varint `0a8000` is accepted by both Buf and `protoc`, while Buf canonicalizes it to `0a00` on write. The corresponding overlong unknown varint remains byte-exact. The report records malformed tags, lengths, groups, wire types, duplicate singular values, writer validation, depth, and binary-size controls.

See [`normative-corrections.md`](normative-corrections.md) for supplement probes that intentionally correct predecessor behavior without changing the immutable 93-operation report.

The [installed-wheel replay](harness.md) validates the frozen inputs and replays
all 93 operations through opt-in `umf-core` 0.11.0 on CPython 3.11.17/Darwin
arm64. It reports 32 exact matches, seven contract-directed divergences, and 54
contract-expected rejections, with no generic mismatches or unreplayable inputs.
The five initial nested-depth `value_mismatch` results were harness observation
shape errors; the corrected byte summaries match exactly. The 51 newly
classified both-error cases and three over-bound rejections were reviewed
against CONTRACT-003. Supplemental
singular and packed `e300` controls match their expected contract trees and
bytes. The [compact replay receipt](installed-wheel-replay-summary.json)
preserves hashes and scope. This does not qualify full adapter support, other
bindings, browser behavior, the complete descriptor graph, or universal
Protobuf conformance.

## Limits and open qualification

`protoc --version` is `libprotoc 36.2`. In the predecessor capture, the local
`python/.venv/bin/python` could not import `google.protobuf`, so no dependency
installation or Python oracle run was attempted there. Separately, the
installed-wheel replay used CPython 3.11.17 on Darwin arm64; the `umf-core`
0.11.0 extension and full report hashes are in the replay receipt. This is not
independent complete semantic qualification. The predecessor freeze remains a
historical TypeScript observation, not Rust evidence.

The Buf wrapper's effective nesting acceptance is also stricter than the nominal core depth: depth 40 succeeds and depth 41 fails the JSON structural limit; at depth 98 Buf's own default recursion limit 100 is reached. These limits are recorded for migration decisions and are not a substitute for the contract's declared limits.

The installed Rust codec follows CONTRACT-003 for the predecessor divergences:
it exports valid unknown values within the binary bound, rejects malformed
eleven-byte unknown varints, and retains exact overlong closed-enum unknown
bytes. Keep native oracle failures and support exclusions visible rather than
silently adopting predecessor behavior.

## Descriptor schema graph closure

The immutable predecessor capture above records the then-current schema gap and
is retained as historical evidence. A follow-up closes the generated TypeScript
JSON Schema graph for the pinned `@bufbuild/protobuf` 2.15.0 descriptor runtime:
`spec/extensions/protobuf/schema.json` now contains exactly the runtime's 34
message definitions plus the shared `unknown` definition. Generation enumerates
the descriptor file's top-level and nested message descriptors in addition to
walking the `FileDescriptorSet` root, which also includes otherwise-unreachable
messages such as `FeatureSetDefaults` and `GeneratedCodeInfo`.

`tests/protobuf/schema.test.ts` compares the exact sorted runtime type set with
the schema definitions, pins that 34-name cohort, checks each definition's type
discriminator and representation envelope, and compares all 176 native field
names. It verifies the exact schema `$ref` target and singular/repeated
placement for each of the 53 message-valued fields, with no stray message refs
on scalar or enum fields. The focused suite passes under Bun 1.4.3 (2 tests,
470 assertions); `bun scripts/protobuf-schema.ts --check` also
passes. `bun run typecheck` passes both project TypeScript configurations.
Inputs and generated output at this evidence cut have these SHA-256 values:

| File | SHA-256 |
|---|---|
| `scripts/protobuf-schema.ts` | `ba9ce819e34d6ab3010eeb0deac3ebeaa0a1266a6b85797de4ebd34e58b5a200` |
| `tests/protobuf/schema.test.ts` | `1b7c2e45f9cd2ef86417acfaff79afa0238d4aec252d8968a6c9d8955af111a7` |
| `spec/extensions/protobuf/schema.json` | `34f3bbdd80a6c666eb24bf05200a516c4cc5b8c1ef1aff44f93e73ea786dc74c` |
| `spec/extensions/protobuf/package.json` | `98e148ae4664a3ad42b1ff94cd0e939fbfe1dab17fa83956fe5e676191af9a96` |
| `fixtures/protobuf/upstream/google/protobuf/descriptor.proto` | `c96db5406336ebcc82523c1dfb122721986a1f43c4aaed45a4a4ad6996efacc2` |
| `fixtures/protobuf/upstream/manifest.json` | `3281392401493ec361b4400e5c3a4fe8e7e90c7fe02a6767e1fcd72fe757d695` |
| `node_modules/@bufbuild/protobuf/package.json` | `280a5efd4ee9a4bbdc3d6096b37fede38982734fe781e846f5c0022f90cf0899` |

The historical inspector predecessor packet records the frozen 344-file Buf
package closure. The generator uses the installed Buf reflection graph but does
not itself rehash every package file before generation; that source-closure
check remains a separate qualification gate. The exact 34-type schema test does
not independently establish Node or
browser JSON Schema evaluation. Existing Chromium evidence concerns the packaged
descriptor APIs; a targeted browser schema-validator run remains open. The schema
closure does not change the binary codec limits, source compiler support, Edition
2024 source exclusions, or interpretation of unknown options.

## Additive Document inspector baseline and Rust slice

[`inspector-predecessor.json`](inspector-predecessor.json) freezes the current
TypeScript `inspectProtobuf` Document behavior separately from the immutable
93-operation codec packet above. Its 41 source hashes include the original
codec source closure, the TypeScript source adapter and source operations, the
governing contract/design, fixtures, tests, and the current Rust descriptor
schema source; the package closure remains pinned to all 344 Buf package files
with digest `f8af62dda87923b9d6cf785bcd18843fd38aaa87ddac1922990a5b37a7f5b943`.
The packet records diagnostic ordering, exact unknown wire bytes, explicit
empty-string presence, source operation exports, all 34 runtime descriptor
message types, and the five runtime message types absent from the JSON Schema.
Its SHA-256 is `167e93475127d86606f7611f63ef6b050e11558c0faf71b367ec696c8ef284ff`.

The bounded Rust addition is `umf_core::protobuf_inspect::inspect_protobuf_document`.
It validates the pinned payload/profile and source archive shape, validates and
re-encodes the descriptor tree through the existing codec, reports retained
unknown-wire content in traversal order, and checks duplicate/missing file
names. A compiler-required warning is always last; valid remains true for a
structurally readable descriptor even when a registry-name warning is present,
while complete is always false. Host control failures propagate as errors. Native
source compilation/emission, compiler acceptance, custom-option interpretation,
and full dependency-registry equivalence remain outside this inspector slice.
Diagnostic paths concatenate UTF-16 code units directly, preserving lone
surrogates in unknown payload, source-archive, and descriptor-field keys. Three
focused regressions assert those paths by exact code-unit sequence.

The dedicated normative tests are `crates/umf-core/tests/r5_protobuf_inspect.rs`.
Run them with `PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:$PATH
CARGO_TARGET_DIR=/private/tmp/umf-r5-protobuf-inspect-target cargo test
--locked --offline -p umf-core --test r5_protobuf_inspect`; the descriptor
codec unit corpus is run with the same command and `--lib protobuf_descriptor`.

At this capture, source hashes are: Rust inspector `ea9304c1ee65f1685e9efff93f1172aa3aea344fccc2a6337f9aec263862367b`,
dedicated tests `78d25c31f7569d115e91858cc979fa0760513059b0d1588705e66b2b9428ea39`,
`lib.rs` module registration `fa51ba30e3a9ed4e46095a17574f6a4141e9348990ce433522e378b3519a9e92`,
and capture/check script `b64293d4e9976bff8a9fe93879be7473f872cc6e4b6b9c3edc21a3acfe964c6d`.
