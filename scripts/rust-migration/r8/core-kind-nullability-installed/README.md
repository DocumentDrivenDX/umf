# Private installed Kind/Nullability replay draft

This is a bounded semantic replay for the six public Kind/Nullability operations. It does not claim factory-control coverage, retirement readiness, or release eligibility. The installed runner consumes an already dependency-resolved npm consumer and the exact `.tgz`; it does not install packages, access the network, build, or modify repository source.

Run the TypeScript source preflight and runner self-controls first:

```sh
UMF_ROOT=/path/to/umf bun scripts/rust-migration/r8/core-kind-nullability-installed/source-preflight.mjs
node scripts/rust-migration/r8/core-kind-nullability-installed/runner-controls.test.mjs
```

Then run the installed artifact replay with its exact pins:

```sh
UMF_ROOT=/path/to/umf node scripts/rust-migration/r8/core-kind-nullability-installed/run.mjs \
  /path/to/umf-sdk.tgz /path/to/offline-consumer \
  <archive-sha256> <source-closure-sha256> /private/tmp/kind-nullability-replay.json
```

The runner checks the lockfile and package exports, verifies that each installed manifest asset matches both its archive member and manifest digest, validates the live source closure before and after execution, and pins harness and frozen fixture bytes. Node and Bun must load the installed `.node` addon; Chromium runs the installed browser bundle, requests its WASM, matches Node outcome data/shape after removing only elapsed-time fields, and has zero cross-origin requests. HTTP responses use explicit MIME types. The browser budget is 600 seconds and is not a performance threshold.

Cases include the 11 frozen successes, 13 frozen refusals, 7 trace/order controls, depth-limit inspection, 100,001-value refusal, 50,000-item inspection success and declaration refusal at the frozen `/target/modules/0/elements/0/extensions/future/opaque/49950` path, plus a 4,000,001-unit unknown scalar preservation check. Kind and Nullability controls must match each other and the TypeScript predecessor exactly, including error code, message, and path.
