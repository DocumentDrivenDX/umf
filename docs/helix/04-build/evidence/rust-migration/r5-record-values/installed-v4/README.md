---
ddx:
  id: umf.evidence.rust-migration.r5-record-values-installed-v4
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-record-values
      kind: extends
    - id: CONTRACT-049
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Installed V4 record-values replay

This receipt qualifies the default `validateCoreRecordValues` route in the
private `@umf/core` 0.5.6 SDK archive at
`.cache/sdk-distribution/cohorts/4547d877/umf-sdk.tgz`. The harness verifies
the archive SHA-256 and packaged Rust source-closure digest before testing.
The pinned archive SHA-256 is
`5f3dccf215b0c1d631d2534946f8305ce6e1bef2d6a10477992a3aa4b4faf599`; the
source-closure SHA-256 is
`4547d877ea7ac3b5e7bfb2101ae80833257c19ae7ba825cf884bc05c666a49b3`.

Run from the repository root with:

```sh
node scripts/rust-migration/r5/replay-installed-record-values-v4.mjs
```

The replay installs the archive into an isolated temporary `node_modules`,
loads the package by its installed name, and confirms that the root default
and explicit `./reference` selectors resolve to distinct functions. It replays
all 24 frozen vectors through both selectors in Node and Chromium. In Node, a
wrapped native addon entry counts calls to the Rust host-JSON operation. In
Chromium, Playwright serves the installed browser bundle after inserting a
counter at the installed wasm-bindgen bridge entry; the receipt records the
resulting transformed glue hash. The WASM asset is still fetched and executed
by Chromium. This counts entry into the bridge whose body calls the Rust WASM
export; it is not independent instrumentation of the internal WASM function.

Both environments also exercise the frozen host-admission cases: source,
identity, and values accessors are refused without invoking getters, and the
two semantic refusal cases retain the expected refusal order. Chromium checks
that Node globals are absent. The Node and browser default routes each enter
their Rust operation for all 24 frozen cases and five host-admission cases;
the reference selector produces matching outcomes without entering that
operation.

The machine-readable results are in `node.json`, `chromium.json`, and
`receipt.json`. This is bounded installed-artifact route evidence for the
pinned archive, frozen vectors, and tested runtimes only. It does not establish
full V4 coverage, a complete port, release readiness, or publishability; the
archive manifest marks this qualification private and non-publishable.
