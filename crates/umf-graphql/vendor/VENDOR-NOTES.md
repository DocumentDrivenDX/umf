# Vendored GraphQL parser dependencies

These source copies are from the local Cargo registry cache:

- `apollo-compiler` 1.33.1, crates.io registry source
- `serde_json_bytes` 0.2.6, crates.io registry source

The original crate LICENSE-MIT and LICENSE-APACHE files are retained. The
Apollo AST, parser, schema builder, and validation algorithms are unchanged.
Only hasher selection and one diagnostic feature were adjusted for the UMF
pure Rust candidate: all `ahash::RandomState` selections use
`BuildHasherDefault<DefaultHasher>`, and Apollo's ariadne `auto-color` feature
is disabled. Apollo's terminal-color diagnostic mode also renders without ANSI
colors so output does not depend on terminal or environment state.
`serde_json_bytes` keeps its `preserve_order` behavior and uses the same
deterministic standard-library hasher for its index map.
