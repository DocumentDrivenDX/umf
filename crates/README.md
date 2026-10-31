# Rust crates

UMF’s Rust implementation is a source-based workspace today. Workspace packages set `publish = false`, so Cargo dependencies must point to a complete UMF checkout; these crates are not available from crates.io. The checkout includes sibling path dependencies, vendored parser sources and pinned schemas loaded at compile time. Use a Git tag once a Rust release tag is published, or a local path while developing:

```toml
[dependencies]
umf-core = { git = "https://github.com/DocumentDrivenDX/umf.git", tag = "<release-tag>" }
# Or: umf-core = { path = "../umf/crates/umf-core" }
```

Add `umf-core-wire` when using the tagged transport. `umf-cli` is a binary-only package, so run it from the checkout (for example, `cargo run --locked -p umf-cli -- graphql --capabilities`) rather than adding it as a Rust library dependency. Use the same repository tag for every UMF Git dependency. The tag above is a placeholder; select a published Rust release tag when one exists.

The workspace’s default Cargo selection includes `umf-core`, `umf-core-wire`, `umf-tagged-wire`, `umf-codegen`, `umf-metamodel`, `umf-metamodel-cli`, `umf-cli` and `umf-graphql`. With Rust 1.90.0 installed, build and test that current selection using the workspace test profile, which uses optimization level 1 while keeping debug assertions and overflow checks enabled:

```sh
cargo build --locked
cargo test --locked
```

The equivalent explicit test selection is:

```sh
cargo test --locked -p umf-core -p umf-core-wire -p umf-tagged-wire \
  -p umf-codegen -p umf-metamodel -p umf-metamodel-cli -p umf-cli -p umf-graphql
```

`umf-core` provides shared Rust semantics and the native adapters currently implemented in the workspace. `umf-core-wire` exposes selected operations through the tagged UTF-16 transport; `umf-cli` provides the native `umf` executable. The current default CLI includes `graphql`, `rdf`, `json-schema`, `protobuf`, `avro`, `avro-cardinality`, `iceberg`, `arrow`, `parquet-capture`, `dbt`, `cardinality`, `csv-boolean-lexical`, `facets`, `reference`, `access rrf`, `metamodel`, and `domain-pack`. Where provided, inspect a family’s operation list with `umf <family> --capabilities`, for example `cargo run --locked -p umf-cli -- graphql --capabilities`.

The Rust crates and CLI run natively without V8, Node.js or Bun. This is the current Rust library surface, not a port of every TypeScript adapter API; only operations present in these crates are available to Rust consumers.

A small example using the current RDF API:

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

The core and CLI are developed against Rust 1.90.0. See the root README for the broader Bun, browser, and native binding workflows.
