# Browser pack tools

[The live workbench](https://documentdrivendx.github.io/umf/pack-tools.html) is
published and verified. [Publication evidence](publication.json) records the
merged revision, successful signed deployment, seven matching public asset
hashes, valid build signature and actual public Chromium generation.

The [execution plan](../../browser-pack-tools-plan.md) delivers a browser workbench
for PostgreSQL DDL, SQLAlchemy 2.0 models and parameterized Python CRUD generation.
Rust owns generation. The focused WASM host ships the same compiler in 1,034,632
bytes. The existing schema inspector uses its unchanged released 2.0.0 package.

[Local acceptance](receipt.json) records 28 catalog packs and exact correspondence
with their 277 authored schema sources. Twenty-six packs generate table code;
the two loader-only manifests return blocked reports and exact source companions.
Six unkeyed tables get DDL without invented ORM keys or keyed CRUD. Original
ontology and unsupported declarations remain in the companion and diagnostics.

All 188 files, including 78 Python files, passed hash/source coverage checks.
SQLAlchemy 2.0.44 on Python 3.14 imported all 26 model modules and compiled their
PostgreSQL dialect DDL. Single-key archaeology and composite-key GTFS CRUD passed
create/read/list/update/delete and invalid-input checks against SQLite. These
checks do not claim native PostgreSQL execution. The preserved company/source
snapshot FK cycle produces a SQLAlchemy sorting warning; raw DDL creates tables
before emitting foreign-key ALTERs.

Chromium 153 verified real Rust/WASM generation for all 28 packs, byte/hash and
diagnostic parity with native Rust, previews, file/ZIP contents, cancellation,
option invalidation, mobile containment and visible missing-runtime refusal.
The inspector remained available. Four host tests and a focused Chromium
blocked-download/unblock/retry check also verify recovery using a fresh worker. [Desktop](desktop.png) and [mobile](mobile.png)
captures record the rendered UI.

Reproduction from the repository root:

```sh
cargo test --locked -p umf-codegen --lib pack_tools
cargo test --locked -p umf-core-wire --test pack_tools_wire
bun test tests/domain-packs/pack-tools-browser-host.test.ts
python3 scripts/pack-tools/check_catalog.py
bun scripts/pack-tools/requests.ts docs/helix/05-deploy/microsite/dist/schema-catalog.json > /tmp/pack-requests.ndjson
cargo run --locked -p umf-codegen --example pack_tools < /tmp/pack-requests.ndjson > /tmp/pack-results.ndjson
python3 scripts/pack-tools/validate_results.py /tmp/pack-requests.ndjson /tmp/pack-results.ndjson /tmp/pack-generated --require-sqlalchemy
CARGO_PROFILE_RELEASE_OPT_LEVEL=1 CARGO_PROFILE_RELEASE_DEBUG=0 CARGO_PROFILE_RELEASE_STRIP=debuginfo cargo build --locked --release -p umf-pack-tools-wasm --target wasm32-unknown-unknown
wasm-bindgen --target web --out-name umf_core_wasm --out-dir /tmp/pack-wasm target/wasm32-unknown-unknown/release/umf_pack_tools_wasm.wasm
bun docs/helix/05-deploy/microsite/build-pack-tools.ts --wasm-dir /tmp/pack-wasm
UMF_PACK_TOOLS_WASM_DIR=/tmp/pack-wasm bun test ./bindings/pack-tools/wasm/tests/pack-tools-wasm.test.js
bun scripts/pack-tools/install-renderer.ts
bun scripts/pack-tools-browser.ts
python3 scripts/pack-tools/verify_site.py
bun scripts/generated-page-seals.ts --inventory
```

All compilation and behavioral checks run locally. Deployment assembles only the
lockfile-verified released inspector artifact, verifies the locally built assets,
signs 22 pages with the existing build signer, and publishes via Pages. The
[publication receipt](publication.json) closes the public asset and browser checks.

Verify the deployed site with `bun scripts/pack-tools/verify_public.ts <site-url>
<path-to-trusted-innsigle-cli.mjs>` and `bun scripts/pack-tools/public-smoke.ts`.
