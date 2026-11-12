# Rust crates

UMF's Rust workspace is the implementation behind the native library, CLI, Python extension, Node/Bun addon and browser WASM host. It owns shared document and registry semantics, compiler operations, and the native adapter operations exposed by those hosts. The current UMF document/core version is 0.10.0.

The workspace packages are not published to crates.io. Use a release tag (`umf-v<version>`) for the Rust library and CLI. For local development, use the workspace or a path dependency:

```toml
[dependencies]
umf-core = { path = "../umf/crates/umf-core" }
```

The workspace contains `umf-core`, `umf-core-wire`, `umf-tagged-wire`, `umf-codegen`, `umf-metamodel`, `umf-metamodel-cli`, `umf-cli` and `umf-graphql`. `umf-core-wire` exposes selected operations over the tagged UTF-16 transport. `umf-cli` is a binary package; run it from the checkout. For example:

```sh
cargo run --locked -p umf-cli -- graphql --capabilities
```

With Rust 1.90.0 installed, build and test the workspace's default package selection:

```sh
cargo build --locked
cargo test --locked
```

Build the CLI with the native PostgreSQL parser when using its SQL capability:

```sh
cargo build --release --locked -p umf-cli --features native-postgresql
cargo run --locked -p umf-cli --features native-postgresql -- postgresql sql --capabilities
```

The optional native PostgreSQL feature also requires a C toolchain and libclang at build time.

The equivalent explicit test selection is:

```sh
cargo test --locked -p umf-core -p umf-core-wire -p umf-tagged-wire \
  -p umf-codegen -p umf-metamodel -p umf-metamodel-cli -p umf-cli -p umf-graphql
```

A compact example using the RDF API:

```rust
use umf_core::{rdf::{export_rdf_nquads, import_rdf_nquads, RdfRuntime}, Context, Utf16};

let mut context = Context::ordinary();
let runtime = RdfRuntime::new(&mut context).expect("load embedded RDF resources");
let source = "<urn:subject> <urn:predicate> \"value\" .\n";
let document = import_rdf_nquads(
    &runtime,
    &source.encode_utf16().collect::<Vec<_>>(),
    &Utf16::from("example"),
    None,
    &mut context,
).expect("import N-Quads");
let exported = export_rdf_nquads(&runtime, &document, Some(true), &mut context)
    .expect("export N-Quads");
assert_eq!(exported.to_utf8().expect("UTF-8 source"), source);
```

## Using the codegen engine from another crate

`umf-codegen` is not published to crates.io. Depend on it by release tag rather than a branch. Release `umf-v0.10.11` includes the fixed-resource accessor:

```toml
[dependencies]
umf-core = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
umf-codegen = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
```

Depending on `umf-codegen` enables `umf-core`'s default features, including `embedded-adapters` (the JSON-LD/RDF stack), because `umf-codegen` depends on `umf-core` with default features and Cargo unifies features. A downstream `default-features = false` on `umf-core` therefore has no effect once `umf-codegen` is in the graph. That is why the vendored-crate patch table below is required.

UMF owns the fixed resource cohort the engine compiles against, so the caller supplies no resource files. `CodegenResources::release` builds the nine-resource baseline (what `CodegenResources::new` receives from callers that do not use sagas) from the exact bytes embedded in this UMF source; `CodegenResources::release_with_sagas` additionally opts into the saga package, as `umf codegen` does:

```rust
use umf_codegen::{release_manifest_sha256, release_resource_digests, CodegenEngine, CodegenResources};
use umf_core::Context;

let mut ctx = Context::catalog();
let resources = CodegenResources::release(&mut ctx).expect("UMF's fixed resources");
let engine = CodegenEngine::new(&resources);
// Record exactly which cohort this build compiled with.
let cohort = release_manifest_sha256();
let files = release_resource_digests(); // (name, sha256) for all ten resources
```

The cohort is ten resources: nine source resources (`core.schema.json`, `core.reference-schema.json`, `core.package-schema.json`, `core.constraints.json`, `core.domain-policy.json`, and the `tables`, `actions`, `binding` and `stable-binding` `*.package.json` files) plus `saga.package.json`. `umf_codegen::release_resources()` returns all ten as named raw bytes (`ReleaseResource { name, source_path, bytes }`, with `sha256()`), and `release_manifest_json()` is the canonical manifest whose SHA-256 is `release_manifest_sha256()`; both cover all ten whichever constructor is used. These names and digests are the same ones reported by `umf codegen --version` and the Python `umf_codegen` wheel manifest. The accessor uses no filesystem, clock or thread.

UMF builds against patched copies of `hashbrown` 0.12 and 0.13, `json-ld-core`, `json-ld-syntax`, `json-syntax` and `xsd-types`, applied through the `[patch.crates-io]` table in the repository's root `Cargo.toml` (sources under `crates/umf-core/vendor`; see `VENDOR-NOTES.md` there). Cargo does not apply a dependency's `[patch]` table transitively, so a downstream workspace must repeat that table, pointing at the same UMF release tag:

```toml
[patch.crates-io]
hashbrown-012 = { package = "hashbrown", version = "=0.12.3", git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
hashbrown-013 = { package = "hashbrown", version = "=0.13.2", git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
json-ld-core = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
json-ld-syntax = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
json-syntax = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
xsd-types = { git = "https://github.com/DocumentDrivenDX/umf", tag = "umf-v0.10.11" }
```

The two `hashbrown` entries need their exact `version` pins: the UMF repository holds both 0.12.3 and 0.13.2, and Cargo rejects a git patch that matches more than one version. (Checked by resolving a scratch crate with these dependencies and this patch table against a UMF commit.)

The public support boundary is expressed by each operation's API and capability checks. Callers provide explicit external parser/compiler callbacks where required; Rust owns UMF validation, admission, projection, receipt and recovery decisions. See the [host binding guide](../bindings/core/README.md) for Python, Node/Bun, WASM and CLI entry points.
