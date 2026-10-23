---
artifact_id: R5-PROTOBUF-DESCRIPTOR-CODEC-NORMATIVE-CORRECTIONS
artifact_type: evidence
status: captured
---

# R5 Protobuf descriptor codec normative corrections

This supplement is separate from the immutable TypeScript predecessor capture.
The authoritative 93-operation baseline remains `predecessor.json`, SHA-256
`0fd7b1250644a07946f78c48bce88c4c77e5b3e314a691ca2dfba877a84362d4`; its runner
remains `capture.ts`, SHA-256
`e540b83f2f54233d9f7701e6243435543e589c7b32359e3de8380d5d8806249b`.
Rust behavior follows CONTRACT-003 where the baseline has defects.

## Normative divergences

| Probe | Frozen predecessor | Contract/native control | Rust target |
| --- | --- | --- | --- |
| 4,000,000-byte valid unknown length-delimited input | Buf reads the field and produces `7,999,994` lowercase hex characters; predecessor writer then refuses with `PROTOBUF_BYTES` | CONTRACT-003 caps binary input/output at 4 MB and requires unknown fields to remain exportable. Input hex SHA-256: `0c5fff0e208b13ac995ea9feb2328fea59ab18abfb4c443e21b7b63c42a2670d` | Read, retain, and write exact wire value bytes within 4 MB binary bounds; accept bounded 8 MB expanded hex. |
| Eleven-byte unknown varint `80b5188080808080808080808000` | Buf accepts and retains the 11-byte raw value | `libprotoc 36.2 --decode_raw` rejects it. Input SHA-256: `b02496cca95a00b78bc97009c6a7937c6929de602660d206b4b7b7152a03d12d` | Reject on binary read and unknown-tree write; valid non-minimal varints up to 10 bytes remain byte-exact. |
| Closed enum 99, overlong encoding `0a05420348e300` | Buf exposes unknown #9 data as `63` and writes canonical bytes `0a0442024863` | CONTRACT-003 requires exact unknown wire bytes. Python protobuf 7.36.2 preserves the full input byte-for-byte (`0a05420348e300`; SHA-256 `9aa5992ac5aa130381f63a03957b8a04308801f83e4b66f4dd2be1446eccb8fe`). The canonical minimal control `0a0442024863` remains canonical. | Preserve nested unknown #9 data `e300` and reproduce exact bytes. |
| Closed repeated enum values in packed `FieldOptions.targets` | Buf direct reflection keeps invalid values in the enum list and writes known fields unpacked; the UMF TypeScript projection refuses invalid enum values during projection. | Python protobuf 7.36.2 moves invalid closed-enum members to unknown wire type 0 and keeps valid members. Its mixed overlong/multiple-invalid control canonicalizes unknown varint `e300` to `63`, while preserving `64`. | Keep recognized values in `targets`, retain each invalid member's exact varint bytes as ordered unknown wire type 0, and accept that packed framing normalizes to unpacked output. Thus Rust keeps `e300` and emits `0a132211120f420d9801019801029801e300980164`, while Python emits `0a122210120e420c980101980102980163980164`. Reject malformed trailing packed bytes. The writer refuses an explicit out-of-domain enum value. |
| Known-field writer ordering, authored input order #10/#4/#11 | Buf outputs #4/#10/#11 (`0a0922030a014d50075808`) | CONTRACT-003 does not guarantee binary field order; this matches Buf's ascending field-number writer. | Emit known fields in ascending field number, then unknown fields in preserved array order. |

The 4 MB and eleven-byte cases are already represented in the predecessor capture;
their correction is an explicit interpretation decision, not a rewritten baseline.
The overlong closed-enum case is a supplemental control because the original
capture only records the minimal `63` encoding. Reproduce its predecessor result
with `bun docs/helix/04-build/evidence/rust-migration/r5-protobuf-descriptor-codec/overlong-enum-supplement.ts`;
its frozen output is in `overlong-enum-supplement.json`. Python protobuf 7.36.2
preservation is recorded from the checked-in authored behavior report. The
predecessor JSON and runner hashes above must remain unchanged.

The packed closed-enum controls were run against direct Buf reflection and
cached Python protobuf 7.36.2. The test payloads all target
`FieldOptions.targets` (field 19), nested under a `FieldDescriptorProto`:

```sh
bun -e 'import {fromBinary,toBinary} from "@bufbuild/protobuf"; import {FileDescriptorSetSchema} from "@bufbuild/protobuf/wkt"; for(const h of ["0a0b2209120742059a01020102","0a0a2208120642049a010163","0a0c220a120842069a0103016302","0a0b2209120742059a01026380"]){try{const x=fromBinary(FileDescriptorSetSchema,Uint8Array.from(Buffer.from(h,"hex"))); console.log(h,JSON.stringify(x.file[0]?.messageType[0]?.field[0]?.options?.targets),Buffer.from(toBinary(FileDescriptorSetSchema,x)).toString("hex"))}catch(e){console.log(h,"READ_ERR",String(e))}}'
PYTHONPATH=/Users/erik/.cache/uv/archive-v0/vYZgOwHqigbMLfIA python/.venv/bin/python - <<'PY'
from google.protobuf.descriptor_pb2 import FileDescriptorSet
for h in ["0a0b2209120742059a01020102","0a0a2208120642049a010163","0a0c220a120842069a0103016302","0a0b2209120742059a01026380"]:
 try:
  x=FileDescriptorSet.FromString(bytes.fromhex(h))
  print(h,list(x.file[0].message_type[0].field[0].options.targets),x.SerializeToString().hex())
 except Exception as e: print(h,"READ_ERR",type(e).__name__,str(e))
PY
```

Buf direct reflection reports `[1,2]`, `[99]`, and `[1,99,2]`, and writes
those as unpacked wire-0 values in ascending known-field order. The UMF wrapper
currently rejects invalid enum values while projecting its Buf result. Python
protobuf 7.36.2 reports `[1,2]`, `[]`, and `[1,2]`; for invalid values it
preserves the invalid varint in unknown fields and emits valid targets followed
by unknown #19. Both parsers reject the malformed trailing-varint case. Rust
uses the Python/contract representation because it preserves recognized values
and exact unknown varint payloads in the fixed UMF tree; packed framing itself
is intentionally normalized. This supplement does not change the immutable
93-case predecessor capture.

The writer-order control constructs a `FileDescriptorProto` object with fields
inserted in order `public_dependency` (#10), `message_type` (#4),
`weak_dependency` (#11). Buf emits `0a0922030a014d50075808` (#4, #10, #11).
This agrees with `to-binary.js` sorting descriptor fields by number. The
current TypeScript wrapper's `writeDescriptorSet(readDescriptorSet(authored.pb))`
output equals the immutable `authored.pb-roundtrip-bytes` operation in
`predecessor.json`: 83,233 bytes, SHA-256
`78ce5e414d52e36f6dab8cf01e9dd58ff6ed230d2a2abc486b7275096d05d5a8`.

The Rust representation correction is intentional: an invalid member in a
packed closed enum is retained as its exact varint bytes in an unknown wire-0
entry, while valid members remain in the repeated enum list. Consequently,
wire-2 packed input may be emitted as wire-0 repeated values plus unknown
wire-0 entries. This preserves contract-significant semantic members and
unknown value bytes, not the original packed framing. The fixed UMF tree has no
carrier for a mixture of valid enum members and invalid members in one packed
occurrence while preserving that framing.

The extended packed control `0a0e220c120a42089a010501e3006402` contains valid
1, overlong invalid 99, invalid 100, and valid 2. Python protobuf 7.36.2
reports targets `[1,2]`, unknown values `(19,0,63)` and `(19,0,64)`, and
serializes `0a122210120e420c980101980102980163980164`. Rust preserves the raw
unknown values `(19,0,e300)` and `(19,0,64)` and serializes
`0a132211120f420d9801019801029801e300980164`. This verifies ordered
multiple-invalid extraction and records the native canonicalization divergence
for the non-minimal enum varint.

## Independent native behavior oracle

The checked-in authored native behavior report is
`fixtures/protobuf/behavior-results.json`, SHA-256
`9ec17920e9e5cd107cbb4c9d81822781a88d854eb8c14b8536a8235a806900b1`. It was
reproduced with cached Python protobuf 7.36.2, without network access or package
installation:

```sh
UMF_BEHAVIOR_REPORT=/private/tmp/umf-protobuf-behavior-oracle-full.json \
PYTHONPATH=/Users/erik/.cache/uv/archive-v0/vYZgOwHqigbMLfIA \
UMF_PYTHON_PATH=python/.venv/bin/python \
bun test tests/protobuf/behavior.test.ts
```

The Bun test passed (one test, two assertions). Its Python oracle reported 42
before/after cases and detected both default-value and explicit-presence mutations.
The generated report was byte-identical to the checked-in fixture. This supports
the authored descriptor behavior corpus; it is not Rust codec parity or a claim
of universal protobuf conformance.

## Rust schema source boundary

The generated Rust metadata table covers all 34 message types and 20 enums in the
installed `@bufbuild/protobuf` 2.15.0 descriptor graph. It pins the vendored
`descriptor.proto` hash and all 344 Buf package files against the frozen receipt.
Five runtime message types are absent from CONTRACT-003's 30 `$defs` schema:
`FeatureSet.VisibilityFeature`, `FeatureSetDefaults`,
`FeatureSetDefaults.FeatureSetEditionDefault`, `GeneratedCodeInfo`, and
`GeneratedCodeInfo.Annotation`. The codec table does not silently extend that
schema; this discrepancy remains an open contract/schema gate. No full adapter
support claim follows from this source-level implementation.
