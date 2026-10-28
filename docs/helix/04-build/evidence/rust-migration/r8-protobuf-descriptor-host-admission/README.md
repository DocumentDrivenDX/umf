---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-host-admission
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
---

# R8 Protobuf descriptor host admission boundary

This evidence records a bounded extension to the opt-in Rust-backed
`readDescriptorSet` candidate. CONTRACT-003 declares binary descriptor input and
a 4 MB limit. The TypeScript predecessor performs `binary.length > limit` before
entering its parser catch; it does not normalize arbitrary views into bytes.

Source inspection and the frozen Bun controls establish the predecessor's
runtime behavior for the two host-view families outside the candidate profile:

- A zero-length `DataView` happens to succeed as an empty descriptor set.
- A non-empty `DataView` is indexed by the pinned Buf parser as though it were a
  byte array. The first indexed value is absent, so both a zero byte and a byte
  sequence that would be valid as a `Uint8Array` fail as
  `UmfError(PROTOBUF_BINARY, "Error: illegal tag: field no 0 wire type 0")`.
- Other typed arrays are also read through element indexing by the predecessor,
  rather than through their underlying byte windows. A `Uint16Array([10])`
  produces `RangeError: premature EOF`; zero-valued `Uint16Array`, `Int16Array`,
  and `Float32Array` produce the illegal-tag diagnostic above.

The candidate explicitly snapshots only `Uint8Array`-family windows (including
Node `Buffer`) and permits empty `DataView`. It rejects non-empty `DataView` and
non-`Uint8Array` typed arrays with `PROTOBUF_BINARY` diagnostics that name the
unsupported admission profile. The new regression controls freeze both sides'
exact results for six cases, so a future expansion must deliberately reproduce
the predecessor's host behavior or document an explicit compatibility change.

This is a negative-control boundary, not parity for those inputs. In particular,
non-empty DataView byte extraction would change predecessor behavior and must not
be treated as a safe Rust admission improvement. The candidate remains opt-in;
this evidence does not establish installed Node/Bun/Chromium replay of the new
host controls, default-route selection, or retirement of the TypeScript path.
