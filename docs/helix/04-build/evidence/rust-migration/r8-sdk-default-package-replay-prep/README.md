---
ddx:
  id: umf.evidence.rust-migration.r8-sdk-default-package-replay-prep
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r7-sdk-default-route
      kind: informed_by
    - id: CONTRACT-076
      kind: informed_by
---

# R8 installed SDK package replay preparation

The installed replay harness now checks the extracted package's Node, browser,
and `./reference` export conditions before replay. It resolves the Node package
root through `import.meta.resolve`, derives Chromium's root entry from the
package's `browser` condition, and records the archive SHA-256 alongside the
condition map. Three negative controls tamper with the Node root, browser root,
and TypeScript reference route; each must be refused. Existing selected-family
replay remains in place for generator, cardinality, facets, Core Keys, compact
Dataset validation, and the 11 Bit128/UUID functions. The receipt continues to
hash every packaged asset and compare the exact archive member set.

The original preparation harness SHA-256 was
`69122097596e2aa309cfe457afa7a7383d37bb9b8a528cce1b6fa95c6fd0f13a`.
`bun run typecheck` and `git diff --check -- scripts/test-sdk-rust-default.ts`
pass. Running the route controls against the extracted historical R7 archive
prints `tamperRefusals: 3`, then correctly refuses that archive because its
package manifest has no `./reference` export. The run exited before Node/Bun or
Chromium replay and wrote no receipt. This is a compatibility finding about
using that archived package as the current replay input; it does not replace or
rewrite its historical receipt.

The first fixed-point R8 private build captured source tree
`d3de6880d8d004a841a4671bb7c1727b99c225af008c2fe782317709f20baedf`
with zero generated-input changes. Its archive SHA-256 is
`f59fb58427849761c7295bfa7f8b24e64a807889f136cb47398504073a2b7244`.
The installed run passed the three route tamper controls and completed Node
26.12.1 and Bun 1.4.3 frozen parity replays: 31 codegen cases, 66 cardinality
outcomes, 19 facets, 14 Keys, 11 Bit128/UUID functions, and 19 compact Dataset
validation cases per host. The aggregate then failed because the harness
expected 65 cardinality outcomes, despite both hosts and the frozen packet
agreeing on 66. Browser replay was not reached and no passing receipt was
written. The moving harness now asserts 66 for Node, Bun, and browser and has
SHA-256 `4fd3eade6bc0c4db4fffe9453769befaa6958ecf6942dcaeb72901e75f46478f`.
A new archive built from that corrected source, followed by full installed
replay, is required for a passing cohort. This failed run also exposed repeated
per-call schema compilation and multi-minute codegen replays; resource-lifetime
and budget behavior are under separate review.

The historical archive SHA-256 is
`892f121b9e53262d86120e236b9ae60704c932653b9cf39d01621b825b3aec93`; its
extracted `package.json` SHA-256 is
`4c4f755bb06735c6400282dfe6c4967726a03d86603fbd7f51378809e2401939`. Its
prior package receipt records source tree
`aeb984f39a2930d0f3af178f4b421850d569fbee1972faf3df793d1d2352cff0`, captured
live tree `ee2b708ff45655bb4138007dcb0b90af8fb9b5dde963c9603ac4b812929a04a5`,
and 11 generated-input changes. The separate historical installed receipt
records Node 26.12.1, Bun 1.4.3, Chromium 153.0.8010.12, 31 R3 cases, 1,771
asset hashes and 1,777 archive members. These values remain limited to that
private, non-fixed-point R7 cohort.

Once the shared source cohort is frozen, build and replay with:

```sh
UMF_RUST_DEFAULT_BUILD_ONLY=1 bun scripts/package-sdk-rust-default.ts &&
bun scripts/package-sdk.ts &&
bun scripts/test-sdk-rust-default.ts .cache/sdk-distribution/umf-sdk.tgz
```

The worktree is still moving, so neither the fixed-point archive above nor this
preparation record establishes a passing R8 installed package or release
qualification.
