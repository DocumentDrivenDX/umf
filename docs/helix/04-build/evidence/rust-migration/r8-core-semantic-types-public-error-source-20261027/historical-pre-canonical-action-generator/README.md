# Historical Semantic Types typed cohort

These bounded Node, Bun, and Chromium R5 replay outputs were captured against
the private build at `/private/tmp/compact-v4-build-semantic-typed-20261027b`.
All three matched the 16 frozen outcomes; the Node/Bun public-error identity
probes and the Chromium assertion confirmed `instanceof UmfError`. Unknown
qualifier content was preserved and browser Node globals were absent.

Build manifest SHA-256:
`86b54d12472bb07195a89f212bf21a576b7f360725b104a820a8e8fa403c9eed`.
Source-closure SHA-256:
`9ffcc986892632df1eb0190400edfa474f9cffa04ea9d666ad44a3876ea3f5fa`.
The archive builder later reported a transform of generated
`src/extensions/actions/plan-identity.ts` (`56b2…` to `525e…`). This evidence is
historical and does not qualify the final fixed-point cohort.

The R5 replay scripts are pinned by SHA-256: Node/Bun
`d233fa3751e272ea64343e1517480ea1f883407d92c9af09fe5430ca73386900`, Chromium
`f3b9ecc9bddaf1ed715867aea45b20ee0ad1fdd998be5a1c150ca6184abd69ab`. The
public-error identity probe is pinned at
`984bcead2f3bd88e28c715462c75018766c6c278284db40e7132937ee1a9a593`.

Node 26.12.1 emitted an experimental `localStorage` warning but exited 0; Bun
1.4.3 exited 0. The replay logs and direct identity probe results are retained
here as JSON files.
