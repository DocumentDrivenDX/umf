# Historical typed compact replay cohort

This source-built cohort was captured after the Semantic Types public typing
fix but before the canonical `plan-identity.ts` action generator was run. The
five compact verifier cases passed on Node, Bun, and Chromium; Node and Bun each
made 14 native calls, and Chromium loaded the manifest-pinned WASM. The archive
builder subsequently reported a generated-source transform for
`src/extensions/actions/plan-identity.ts` (`56b2…` to `525e…`). Therefore this
cohort is preserved for audit history and is not the current fixed-point
qualification.

Build manifest SHA-256:
`86b54d12472bb07195a89f212bf21a576b7f360725b104a820a8e8fa403c9eed`.
Source-closure SHA-256:
`9ffcc986892632df1eb0190400edfa474f9cffa04ea9d666ad44a3876ea3f5fa`.
Private build directory: `/private/tmp/compact-v4-build-semantic-typed-20261027b`.

Receipt SHA-256 values:

- Node: `5497c2adf5b26432d4a6db33c97807e2e795107c27e66c279ffa8dd7ab2bdf79`
- Bun: `6a7cfcb834491015e10223a9e3e2078b375f576e54c1c49362faf1a6ea18a744`
- Chromium: `0485c98253f8228cf8a9ae6c40c003c660025b5f7c5892daa8822b9f6789b61e`
