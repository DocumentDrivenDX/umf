---
ddx:
  id: umf.evidence.rust-migration.r8-protobuf-descriptor-read-cli.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-protobuf-descriptor-read-cli
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
---

# Sol review of the Protobuf descriptor-read CLI

I reviewed the CLI's file/read bound, operation routing and focused tests,
verified the final source/test/release-binary SHA-256 values in the packet, and
ran the release binary with an empty descriptor and an empty `PATH`. The binary
returned a valid `umf.core-wire/1` success envelope; its capability response
advertises only `protobuf.descriptor.read` and the 4,000,000-byte input bound.
The implementing Luna agent's clean locked/offline CLI suite passed 46 tests,
including all four focused descriptor-read tests. Those tests pin three frozen
success-wire hashes, malformed wire, exact-size and over-size input, control
refusals and path-error precedence. CLI source SHA-256:
`8e9115a2e8bd2a08e8ee8a2c419cc1800cc82545c980d646ce176faaea714499`;
release binary SHA-256:
`9a0e138e06265f815f5fd17dbb1310f23f9467a7924d30779e9f497662e824db`.

I accept this additive, opt-in CLI read operation for the recorded local Darwin
arm64/Rust 1.90 artifact. The filesystem read is bounded before the core
operation's cooperative work/deadline context starts; it is not an isolated
wall-clock deadline on filesystem I/O. This packet does not cover source
compilation, the other descriptor/document operations through the CLI,
installed SDK conditions, the hosted release matrix or full R8 retirement.
The current 93-operation predecessor capture is still a `/private/tmp` file.
The checked-in vector manifest preserves the six selected cases, and the
current 37-file source-hash closure is now checked in separately. I compared
the capture with the older checked-in full packet: operation outcomes and all
other non-source sections are identical; only source hashes differ. A release
cohort must check in or reproducibly recapture its full source-bound
predecessor evidence.
