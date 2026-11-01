# UMF

UMF is a machine-readable metamodel and schema interchange fabric for complex systems built over evolving, partly understood data shapes. Reuse metadata for transforms, visualization, generators, forms, AI context, and human documentation while preserving native meaning and making translation limits explicit.

The current document and core semantic version is **0.10.0**. The Rust workspace owns document validation, registry semantics, serialization, compiler operations and the native adapter operations exposed through the supported hosts. Rust decisions are shared by the library, CLI, Python extension, Node/Bun addon and browser WASM. Native formats and extensions retain their source and unknown content; cross-format projections report or refuse meaning they cannot preserve. Explicit host callbacks remain available where a caller supplies a compiler or parser capability.

## Use UMF

- [Rust library and CLI](crates/README.md)
- [Python distribution](python/README.md)
- [Rust-backed Python, Node/Bun and browser hosts](bindings/core/README.md)
- [Runnable Actions guide](docs/helix/04-build/guides/actions/index.md)
- [Project documentation map](docs/helix/README.md)

The TypeScript package remains the browser-compatible public API and host integration layer. Node/Bun use the native addon, Python uses PyO3, and browsers use WASM. Each host exposes the operations available to it and requires explicit capabilities for external compilers or parsers; a document cannot load code or fetch resources.

## Develop and test

Use Bun for the JavaScript development workflow and Rust 1.90.0 for the native workspace. From the repository root:

```sh
rustup toolchain install 1.90.0
cargo fetch --locked
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
```

Rust libraries and CLI:

```sh
cargo build --locked
cargo test --locked
```

Browser checks use Chromium; install the project’s Playwright browser or set `UMF_CHROMIUM_PATH` to an installed Chromium executable:

```sh
bun run test:browser
```

Python native build and tests:

```sh
pip install ./python
python -m pytest python/tests
```

Some integration suites require their documented external tools, such as Docker, `protoc`, Java, or a pinned oracle environment. Their setup and scope are described alongside the relevant [contracts](docs/helix/02-design/contracts/) and [fixtures](fixtures/).

## License

First-party software is dual-licensed under MIT OR Apache-2.0, at your option. See [LICENSE.md](LICENSE.md). Third-party materials retain their original notices.
