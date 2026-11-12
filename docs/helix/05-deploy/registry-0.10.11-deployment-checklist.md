---
ddx:
  id: umf.deploy.registry.0.10.11
  type: deployment-checklist
  activity: deploy
  authoring:
    home: repo
  links:
    - id: umf.release.0.10.11
      kind: references
---

# UMF 0.10.11 registry publication

## Release

The registry candidates use source commit `09bbf7c447d5749fcf07010ea736d133f96264ff`
from the [UMF 0.10.11 release](release-0.10.11.md). The npm identity is
`@documentdrivendx/umf-core@0.10.11`. The two prebuilt native addons retain
the verified GitHub archive bytes. npm selects the addon for macOS ARM64 or
Linux x86-64 at runtime. The Rust library identity is `umf-core@0.10.11`.

## Before deploy

- Merge the manual [registry publishing workflow](../../../.github/workflows/publish-registry-01011.yml)
  and exact archive admissions to `main`. Configure the `npm-core` and
  `crates-io` GitHub environments to allow only `main`.
- An npm member who can create a package in `@documentdrivendx` creates a
  short-lived granular token with **Read and write** access to that package
  scope and **Bypass 2FA** enabled. Store it as `NPM_TOKEN` in the
  `npm-core` environment. After public byte verification, revoke the token on
  npm and remove the GitHub environment secret.
- For the next SDK version, attach the qualified npm tarball before publishing
  its immutable GitHub release. Record the exact source, version, package
  name, filename, size, and SHA-256 in
  `.github/release-admissions/umf-sdk-npm-<version>.json` using the
  [0.10.11 npm admission](../../../scripts/registry/admit-01011-npm.json) format.
  Configure GitHub Actions Trusted Publishing on `@documentdrivendx/umf-core`
  for organization `DocumentDrivenDX`, repository `umf`, workflow filename
  `publish-npm-sdk-trusted.yml`, environment `npm-core`, with **Allow npm publish**.
  Create the binding when the next archive is ready. npm expires unvalidated
  bindings after two days. Dispatch the
  [trusted publisher](../../../.github/workflows/publish-npm-sdk-trusted.yml)
  from `main`. It uses read-only release access and a short-lived npm identity.
  [npm access tokens](https://docs.npmjs.com/about-access-tokens/)
  [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)
- A crates.io user with a verified email creates a short-lived token with
  **publish-new** permission and the exact crate names in the
  [Rust admission](../../../scripts/registry/admit-01011-crates.json).
  Store it as `CARGO_REGISTRY_TOKEN` in the `crates-io` environment. After
  first publication, revoke it and configure trusted publishing on the new
  crates. [crates.io token scopes](https://rust-lang.github.io/rfcs/2947-crates-io-token-scopes.html)
  [crates.io trusted publishing](https://crates.io/docs/trusted-publishing)
- The Rust lane creates 17 crate names. Expect to resume after the registry's
  new-crate rate limit resets, or arrange capacity for the full set before
  dispatch. The job checks the registry before each upload and reuses matching
  published archives on resumption. [crates.io rate limiter](https://github.com/rust-lang/crates.io/blob/main/src/rate_limiter.rs)

## Validation gates

| Gate | Check |
|---|---|
| npm candidate | The pack metadata check passes. Node and Bun resolve the new package identity and load the matching native addon on macOS ARM64 and Linux x86-64. |
| Rust candidate | An isolated Cargo consumer check passed using the release-locked dependency graph with the default feature set and with `native-postgresql`. All 17 archive checksums and upload payloads matched the admission. |
| Publish | GitHub's draft asset metadata and the downloaded archive match the reviewed size and SHA-256. A public version with different bytes stops the lane. |
| Public verification | The registry index identifies each version, and the fetched public archive matches the admitted SHA-256. |

## Rollout

1. Create a GitHub release draft with tag `umf-v0.10.11-registry-candidates`
   and target `09bbf7c447d5749fcf07010ea736d133f96264ff`. Attach the admitted
   archives and use the draft's numeric release ID for dispatch. The workflow
   uses GitHub's ephemeral contents-write token to read the draft.
2. Dispatch the selected registry from `main`. The job downloads and
   verifies the admitted archives, publishes them, and checks public bytes.
   The Rust lane publishes prerequisites in admission order. Hosted work
   contains no compilation or test suites.
3. If a registry is still indexing a successful upload, use Python 3.11 or
   later to run `python3 scripts/registry/publish_01011.py verify npm` or
   `python3 scripts/registry/publish_01011.py verify crates` locally.
   Public verification uses no publishing credential. Wait for the npm scan
   to finish before considering another dispatch.

## Rollback

A published version is immutable. If publication stalls after a partial
Rust upload, verify the published prerequisites and resume the same admitted
archives. If a published artifact is broken, use the registry's
deprecation or yank controls and publish a corrected successor. The GitHub
release remains available throughout.
