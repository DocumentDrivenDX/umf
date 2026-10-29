---
ddx:
  id: umf.evidence.rust-migration.r8-avro-document-installed-current-20261028
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-007
      kind: informed_by
---

# Avro document inspector installed opt-in gate

The [Darwin arm64 receipt](darwin-arm64-receipt.json) (SHA-256
`3ce40048f412aafc9664a2a489d2303f0105b15e68b0827fe0884c1aa5f8195b`)
passes the opt-in `umf-r5-avro-document-inspect/0.1.0` operation on Node
26.12.1, Bun 1.4.3, and real Chromium 153.0.8010.12. It uses fresh native
and WASM binaries from the same private SDK archive. The archive SHA-256 is
`0788cff4279ac0d42e59c83575933004eaa0706b6cab2b02076903b07d946300`;
its fixed-point live source closure SHA-256 is
`3e58c335b72cd5ea6c1c261e140fcc9fc1c3d035627cd8d0903b0b669f210e56`
over 3,744 inputs and zero source transforms. The 1,820 archive members were
checked against the package manifest. The [private archive build receipt](private-archive-receipt.json)
has SHA-256 `469bf34292484d317bbac5b9fc5206b178915d0d51e458226f0005ddfe8e68f1`.
The archive is retained at `/private/tmp/umf-r8-current-avro-facets/umf-sdk.tgz`.

The gate packed and installed `@umf/core-rust-native` and
`@umf/core-rust-wasm` offline with package scripts disabled. It checked each
lock entry's exact tarball resolution, SHA-512 integrity, and version; the
native add-on and browser WASM came from the archived SDK assets. Each host
inspected an admitted Avro document, kept the authored source and unknown
extension/vocabulary content intact, and separated invalid and non-Avro
admission from native inspection. A valid encoded document reached the native
and WASM hooks, where an intentional `RESOURCE_LIMIT` refusal was observed.
Chromium fetched the installed WASM and made no external requests or page
errors. The gate rechecked all repository and external source-input hashes
after replay.

This is an opt-in structural-inspection subset. It does not establish parity
with the TypeScript `inspectAvro` default, broader Avro semantics, Linux
package behavior, declaration retirement, or release qualification. The
source-level [candidate packet](../r8-avro-document-inspect-candidate-20261028/README.md)
records the narrower predecessor comparison and its semantic differences.
