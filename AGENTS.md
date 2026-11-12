# Working in UMF

UMF is a metamodel and schema interchange fabric. The Rust workspace (`crates/`) owns document validation,
registry semantics and adapters; `bindings/` expose it to Python (PyO3), Node/Bun (native addon) and browsers (WASM);
`src/` is the TypeScript host layer; `python/` holds `umf-core`, `umf_codegen` and `umf_access`; `spec/` and
`fixtures/` are the specification data; `docs/helix/` has the requirements, design (ADRs, contracts) and guides.

- Never silently lose meaning: preserve native semantics and unknown content, and make cross-system loss explicit.
- Tests: `cargo test --locked`; `python -m pytest python/tests`; Bun tests need the native addon, so build it first
  (`cargo build -p umf-core-node --features native-postgresql`, copy the library to
  `bindings/core/node/umf_core_node.node`) and run `bun scripts/run-tests.ts --exclude-file scripts/slow-tests.txt`.
- CI is `.github/workflows/ci.yml` (Linux only; slow suites run nightly). Keep it green; do not skip tests to make
  it green without a one-line reason in `scripts/known-failures.txt`.
- Do not commit run output, receipts, evidence, screenshots-as-proof or built artifacts; CI keeps run output as
  workflow artifacts. A size guard fails the build for large tracked files.
- Versions: `python scripts/set-version.py X.Y.Z` edits every manifest and regenerates derived files; then
  `python scripts/check-release-versions.py --access`.
- Releases: push tag `umf-vX.Y.Z` from main; `.github/workflows/release.yml` does the rest. Never publish from a laptop.
- Docs: edit sources under `docs/helix/` and `site/`; `pages.yml` builds the site. Keep claims to what CI tests.
