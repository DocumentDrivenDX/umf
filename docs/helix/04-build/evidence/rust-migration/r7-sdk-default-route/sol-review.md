---
ddx:
  id: umf.evidence.rust-migration.r7-sdk-default-route.sol-review
  type: evidence
  activity: build
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-sdk-default-route
      kind: references
---

# Independent Sol review: private SDK Rust generator route

I reviewed the source-built private SDK packer, Node/browser V4 root entries,
the installed test harness and its source-bound receipts. The authoring Luna
agent did not perform this review. The packer snapshots live inputs before
building, compiles a fresh Rust addon and WASM, records every generated-input
transform, and hashes the exact derived inputs and packaged assets. My review
found an initial provenance defect: the packer replaced the live input hash map
after regeneration while describing the result as the live source closure. The
revised manifest retains both live and derived tree hashes and names all 11
changed generated inputs. Because those inputs differ, it marks the archive
`derived-private-snapshot-not-release-fixed-point` and nonpublishable.

I independently verified the archive SHA-256
`892f121b9e53262d86120e236b9ae60704c932653b9cf39d01621b825b3aec93`,
all 1,777 exact archive members, all 1,771 asset SHA-256 values, and zero
unexpected members. I recomputed every hash in the retained 3,226-file source
snapshot and its tree digest
`aeb984f39a2930d0f3af178f4b421850d569fbee1972faf3df793d1d2352cff0`,
matching the package receipt. I also checked that the archive root manifest
selects `umf-node.js` for Node and `umf-browser.js` for browser/import while
the repository development manifest still selects TypeScript. The agent's
durable installed receipt records exit 0 for Node 26.12.1, Bun 1.4.3 and real
Chromium 153.0.8010.12, all 31 frozen R3 generator cases, synchronous calls,
resource controls, and native/WASM asset refusals. I did not rerun that
four-minute installed matrix independently. The agent's `bun run typecheck`
passed; I independently reran `git diff --check` and the recaptured R8
symbol-inventory `--check`.

No P1/P2 remains in this bounded private archive qualification. The live
metamodel check still reports `METAMODEL_STALE_OUTPUT spec/core/schema.json`;
the archive is not a final source-coherent release candidate. The source
package and its ordinary build remain TypeScript default, the other root
exports have not undergone semantic retirement, and Linux hosted, Python
release-pair, full R7/R8 and publication gates remain open.
