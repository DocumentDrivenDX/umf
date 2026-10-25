---
ddx:
  id: umf.evidence.rust-migration.r8-semantic-reference-python
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-semantic-reference-parity-candidate
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-semantic-types
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-semantic-type-accessors
      kind: informed_by
---

# R8 opt-in Python semantic-reference operations

This slice adds Python functions for the six meanings selected in the R8
candidate packet: `inspect_core_semantic_types`, `get_core_semantic_types`,
`declare_core_semantic_types`, `verify_core_semantic_type_declaration`,
`get_semantic_types`, and `set_semantic_types`. They call direct Rust core
operations through the cached, retained Python `NativeEngine`; no default root
route or TypeScript retirement is claimed.

Each call gets one fresh `Context` shared by preflight, Python-value admission,
the Rust semantic operation, and Python result construction. The retained
`Engine` uses the fixed generated core resources. A per-operation
`Engine::registry` is required: it constructs the engine-derived kind policy
used by document validation, while `Registry::default()` would change
diagnostics. Registry construction is charged to the same invocation context.
No arbitrary resource replacement or callback registry is exposed.

The Python binding stages predecessor-sensitive arguments. Core declaration
copies and validates `types` before it admits the source and identity. Receipt
verification validates and recomputes the receipt before admitting `current`.
The interim extension setter copies the document and checks profile and target
before admitting the annotation. Focused Rust tests assert that the later-stage
closures are not invoked when those earlier checks refuse. Zero-work preflight
rejects before the first caller value is converted. Python cycles, unsafe
numbers, copy isolation, and control refusals are covered by the Python
operation test module.

The current TypeScript predecessor was re-run with Bun 1.4.3 against current
source and resource files. Core and accessor outcomes were byte-structure equal
to their previously frozen packets; their source closures had changed elsewhere
in the concurrent authority/resource update, so the fresh capture hashes are
recorded here rather than treating the older closure pins as current:

- Core current predecessor packet SHA-256: `e69af06d0a462a2923f68c8a5069c5249ad9963ea2f313ccb66f7c496d705abe`;
  canonical source-closure digest: `16bf3dc21387e4ea8d02d15ef57b1d73d71a229afc6c5aacc9ea27c52f002a7d`.
- Accessor current predecessor packet SHA-256: `3f60e369b1e2dc74ab58eb5ab52f420a87b3d6076d686ad8572320efdcccac88`;
  canonical source-closure digest: `f21e3a24363f24c805aaed0fe087e468fe967ed2220d4222074aef1821a62016`.
- Both fresh captures retained the prior outcome maps exactly (16 core cases;
  16 accessor cases). The current `set_malformed_vocabulary_container`
  predecessor result remains native `TypeError`, empty `code` and `path`, with
  message `null is not an object (evaluating 'candidate.vocabularies[SEMANTIC_TYPES_EXTENSION]')`.

Focused core verification passed with Rust 1.90.0:

- `cargo test -p umf-core --test r5_core_semantic_types --offline`: 11 passed.
- `cargo test -p umf-core --test r5_semantic_type_accessors --offline`: 5 passed.
- `cargo check -p umf-core-python --offline`: passed.
- The six Python test functions passed against a freshly installed isolated
  test wheel under CPython 3.14. The wheel contains the freshly compiled
  `_rust_core` artifact and the package/resource files; its SHA-256 is
  `bb11b5a55b7b0c7f56d8c301fb677653abdd189ce1b9ea601fa25805fdf461b4`, and
  the embedded native extension SHA-256 is
  `ee0422caaee6b8f009538f104574c96d4bed511b71c19e1fcb330a3930449842`.
- The regular Hatchling wheel build could not resolve `hatchling>=1.27,<2`
  because PyPI DNS was unavailable. The isolated test wheel was assembled from
  the exact compiled extension and package source, then installed with
  `python3.14 -m pip install --no-deps --target ...`; it is not evidence of the
  project build hook or release artifact.
- `pytest` is not installed in the offline host interpreter. The focused test
  module's six functions were invoked directly with a small `pytest.raises`
  context-manager shim; the assertions and exception classes were unchanged.
- `bun run typecheck`, Python bytecode compilation, and scoped `git diff --check`
  passed.

The Rust outcome for `vocabularies: null` remains `SEMANTIC_TYPE_PROFILE` with
`Expected umf.semantic-types 0.1.0`; the current TypeScript predecessor throws
the native `TypeError` described above. This is an explicit parity blocker.
The Python API is opt-in, and this packet does not approve selector changes,
default routing, or retirement claims. Node/Bun/browser replay and independent
Sol review remain separate gates.

## Source hashes

The final implementation/test cohort is pinned below. `bindings/core/python/src/lib.rs`
also contains concurrent Python binding work; its hash pins the complete file
used to build this isolated artifact.

| Source | SHA-256 |
| --- | --- |
| `crates/umf-core/src/core_semantic_types.rs` | `de4dd6a48aa2c73ba918e1929ecbfd15d98970c25aecc584ddba40749e826076` |
| `crates/umf-core/src/semantic_type_accessors.rs` | `896dd809d034f468094ce9b675e6ed3597f218c1e3376eda35bdebbe5961226b` |
| `crates/umf-core/tests/r5_core_semantic_types.rs` | `8fc1fd2238d93aed6e4c267505ddea75dce97dae1c77201fc13f15af28138e52` |
| `crates/umf-core/tests/r5_semantic_type_accessors.rs` | `e98051d31bf0cebf6ea7d25c7fc95292b40697555f24390f5599f9c0f8afe900` |
| `bindings/core/python/src/lib.rs` | `6782b1e95bf216bb81445827fbc56b88a16627be744b90a9cfb3d56159527940` |
| `python/src/umf/semantic_types.py` | `7e9144ef88b4297706143fd38570e2717c476d95b18bbd92f995aa54046f12e3` |
| `python/src/umf/__init__.py` | `41d1cc40297f3e976799751bdafd0cf88fabbfad9a308b635e840882765c6aae` |
| `python/tests/test_rust_semantic_document_operations.py` | `7494716cd38327cb1129734e32905cc5d9f92f5130dd0aa20fae28ce0cfde114` |
