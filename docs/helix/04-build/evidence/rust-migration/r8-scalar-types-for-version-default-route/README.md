---
ddx:
  id: umf.evidence.rust-migration.r8-scalar-types-for-version-default-route
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-scalar-types-for-version
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# R8 `scalarTypesForVersion` V4 default-route host evidence

## Scope and result

This packet qualifies the current V4 Node and browser root exports after the
`scalarTypesForVersion` route was switched to the shared Rust Core Model engine.
The operation remains a pure version lookup. On exact `0.10.0`, Node, Bun and
Chromium return the same frozen eleven-label `SCALAR_TYPES` value by identity.
For unsupported strings, lone surrogates and runtime-invalid inputs, results
match the explicit TypeScript `./reference` root and each call returns a fresh
empty array. This does not qualify other scalar operations or versions.

The focused Rust Core and Core Wire integration tests passed 4/4. Existing
predecessor/default-route Bun tests passed 5/5 tests and 45 expectations. A
freshly built native addon, freshly built WASM and matching wasm-bindgen package
were exercised through private V4 bundles on Node 26.12.1, Bun 1.4.3 and real
Headless Chromium 153.0.8010.12. Node and Bun each matched the explicit
reference for 12 cases; Chromium matched it for 11 cases. The machine-readable
[host receipt](host-replay.json) records cases and artifact hashes, and
[source pins](source-pins.json) identify the exact Rust, binding, facade, test
and resource inputs.
The reviewed source is committed at `0288e3d2ba715c9b3c594dd07bcd596b619b17f1`;
all 28 recorded source hashes were independently rechecked against that commit's
worktree with zero mismatches.

The current-source SDK builder compiled its source snapshot but failed at its
temporary package staging step with Bun `EPERM` (`clonefile` of the builder's
temporary `package/dist`). Per package-integrity policy, this packet does not
claim installed-package qualification. The private source bundles used for
the host replays are not a replacement package archive.

## Reproduction record

Rust qualification used Rust/Cargo 1.90.0, offline and locked:

```sh
CARGO_TARGET_DIR=/private/tmp/umf-scalar-route-rust-tests-target \
  cargo test --locked --offline -p umf-core -p umf-core-wire \
  --test r8_scalar_types_for_version
bun test tests/core-scalar-types-for-version.test.ts \
  tests/rust-migration/r8-scalar-types-for-version-default-route.test.ts
```

The fresh host artifacts were built from this source cut with release Cargo
builds for `bindings/core/node` and `bindings/core/wasm` (`wasm32-unknown-unknown`),
then wasm-bindgen 0.2.100 `--target web`. Cargo used `--locked --offline`, Rust
1.90.0, and separate target directories under `/private/tmp`. Fresh V4 Node,
reference and browser bundles were built with Bun 1.4.3. A loopback fixture
served the browser bundle and paired wasm-bindgen output to real Chromium. The
specific private artifact hashes and source commands are recorded in
[host-replay.json](host-replay.json).

## Limits

The installed SDK package and package archive remain unqualified because the
canonical current-source builder could not finish staging under this sandbox.
Linux, other Node/Bun/Chromium versions, other UMF core versions, and other
scalar operations are outside this evidence.
