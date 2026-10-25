---
ddx:
  id: umf.evidence.rust-migration.r8-integrated-private-sdk
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R8 integrated private SDK source cohort

The paused local worktree at Git HEAD
`23bf095b768b6e391da1967339cd559e22ff2eff` was regenerated to a
metamodel/action-resource/WASM-mirror fixed point. All corresponding
check-only commands passed, as did `bun run typecheck`,
`bun run check:rust-boundaries` (V8 production debt zero),
`bun run check:core-authority`, and `git diff --check`. The repository was
locally modified: the captured live input closure, not the HEAD alone,
identifies this build.

`UMF_RUST_DEFAULT_BUILD_ONLY=1 bun scripts/package-sdk-rust-default.ts`
produced the private `dist/` source build with `sourceTransformCount: 0` and
identical captured-live and build input tree SHA-256
`46de2468d8ce7d2c34f970e40fbb86f7514443cb935ae2b735f91e68ae04c7b5`.
The built `dist/rust-default-manifest.json` SHA-256 is
`81bfaca5f1b24f561027808d81b93f3d9e73ff9fc07c509488806bd9f81701b7`;
it records 1,780 assets. The canonical private packer then produced
`.cache/sdk-distribution/umf-sdk.tgz` (SHA-256
`79ffc587b335533c4db308eec15665dacb3202b466aeb902fd507d0ca607d489`),
1,787 archive members, and manifest SHA-256
`a3bd7d46c49d2bcb66d33f899c52cc1bef0c87673c7dee64c2946a577fba3a1d`.
The archive is explicitly `private-r7-default-route-qualification-not-publishable`.

`bun scripts/test-sdk-rust-default.ts .cache/sdk-distribution/umf-sdk.tgz`
passed on macOS arm64 with Node v26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12. It exercised the installed root conditions, synchronous
seven-file generator and 31 R3 cases, 66 cardinality, 19 facets, 14 Keys,
11 Bit128/UUID and 19 compact Dataset cases, Node/Bun/browser route parity,
and missing/corrupt native/WASM asset refusals. The Node R3 and Bun R3
checkpoints appeared at 509,372 ms and 790,015 ms elapsed, respectively;
total replay took 1,067,537 ms.
The test harness SHA-256 is
`4fd3eade6bc0c4db4fffe9453769befaa6958ecf6942dcaeb72901e75f46478f`.
`python3 scripts/test-sdk-package.py` passed 9/9 and the offline extracted
Python sdist closure suite passed 12/12. These tests do not add supported
operations beyond the listed installed replay scope.

The coordinated Python release receipt/matrix verifier tests passed 24/24
under the project's offline development environment. This validates local
gate logic, not hosted execution of the six configured cohorts.

The current condition-aware inventory and ledger passed their `--check`
commands and the ledger suite passed 10/10. Their SHA-256 values are
`e679c1c018b18d43967d6ef6fc72e2ebddf7bd037722ff3e4cec373cc71cc186`
and `a7db866ece535698e41084a6f8a01a2b248ca2e7712077ca977d292567b18b97`.
Each default root still inherits 893 TypeScript executable declarations and
selects only 29 Rust operations; `./reference` retains 922 TypeScript
operations. All 922 logical retirement gaps remain under the plan's release
definition. The six hosted Python wheel/sdist cohorts have not run here;
publisher, registry verification, remaining resource authorities and broader
native/adapter support are open. This is a successful *private integrated
checkpoint*, not a Rust-port completion or release receipt.
