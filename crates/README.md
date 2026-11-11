# Rust crates

UMF's Rust workspace is the implementation behind the native library, CLI, Python extension, Node/Bun addon and browser WASM host. It owns shared document and registry semantics, compiler operations, and the native adapter operations exposed by those hosts. The current UMF document/core version is 0.10.0.

The workspace packages are not published to crates.io. Use the `umf-v0.10.10` release ref for the Rust library and CLI. For local development, use the workspace or a path dependency:

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

The public support boundary is expressed by each operation's API and capability checks. Callers provide explicit external parser/compiler callbacks where required; Rust owns UMF validation, admission, projection, receipt and recovery decisions. See the [host binding guide](../bindings/core/README.md) for Python, Node/Bun, WASM and CLI entry points.
