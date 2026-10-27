---
ddx:
  id: umf.evidence.rust-migration.r4-arrow-sdist-local-20261027
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-016
      kind: informed_by
---

# Local R4 Arrow source-distribution repair and Python probes

The core Python sdist now contains the two Arrow `include_str!` authorities,
`spec/extensions/arrow/package.json` and
`spec/extensions/arrow/integration-schema.json`, and successfully rebuilds a
wheel with Rust 1.90.0. The core sdist SHA-256 is
`fd7f9cc3598837412f24ceac6f722448c688b776f06f7cfc548dd298073ba428`;
its rebuilt macOS arm64 wheel SHA-256 is
`a1c9fc57c0ca1a1d194601a7087f0a67069d7c9c392c3ab082cf17ec97684030`.
Codegen and access sdists also rebuilt wheels. The
[`final-qualification.json`](final-qualification.json) capture records their
hashes, installed distributions, a 491-file source audit snapshot, and the
exact package limitations. The archive bytes remain private build artifacts.

CPython 3.11.17 and 3.13.16 locally passed the selected installed probes:
21 codegen unit tests, 30 generator parity cases and writer controls, six
row-scope cases, three reviewed-change cases and eight refusals, 15 deployment
cases and 30 tamper controls, 17 migration cases with 99 tamper and four
deadline controls, six access count-frame cases, and 48 sdist/resource tests
in each environment. The six `final-*-{codegen,deployment,migration}.json`
receipts retain the detailed codegen/deployment/migration outcomes. The
installed no-JavaScript probes ran with an empty `PATH`; the 48 packaging
tests used `/usr/bin:/bin` for Git and had Hatchling installed, with no
Node/Bun executable on `PATH`. The core full suite was not rerun after the fix.

The 491-file audit snapshot was captured while other Arrow wire and Python
wrapper edits were in progress. It is **not** an immutable source-to-artifact
build identity: the captured `arrow_schema.rs` SHA differs from the Rust
source in the earlier core sdist. These receipts establish the named local
packaging and installed behaviors only. A final source-coherent rebuild,
hosted Python matrix, complete core suite, broader Python access semantics,
and release qualification remain open. No macOS CI ran.

[`SHA256SUMS`](SHA256SUMS) pins every checked-in receipt and this README.
