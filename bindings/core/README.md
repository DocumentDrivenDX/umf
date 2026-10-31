# Rust-backed UMF core hosts

Rust owns the shared core, compiler and native adapter operations exposed by
these host packages. Python calls Rust through PyO3; Node and Bun use the native
addon; browser hosts use WASM. The codegen CLI uses the Rust executable bundled
with the matching `umf-core` wheel.

`crates/umf-core` owns document/schema validation, literal and constraint kernels,
registry admission, JSON/YAML serialization and diagnostics.
`crates/umf-metamodel` owns metamodel parsing, grammar checks and the nine portable
compiler outputs. The Bun build assembler adds the explicit Ajv standalone output
and manifest. Ajv is a build backend, never a Python or native runtime dependency.

## Native Python

Build with `pip install ./python` using Rust 1.90.0. The resulting native abi3 wheel
supports the declared CPython 3.11–3.14 versions.
An installed wheel executes Rust through PyO3 without JavaScript or Cargo.
Pydantic provides access models. Schemas and inert constraint/domain programs
are packaged explicitly; the library does not discover resources from the working
directory. See [the Python API](../../python/README.md).

## Node and Bun

Build `cargo build --locked --release -p umf-core-node` and copy the resulting
platform library to `bindings/core/node/umf_core_node.node`. The private
`@umf/core-rust-native` package contains that addon and its synchronous wrapper.
`createEngine(resources, options)` takes explicit `coreSchema`, `referenceSchema`,
`packageSchema`, `constraints` and `domainPolicy` resources. The engine provides
`validateDocument`, `readDocument`, `writeDocument`, `readValue` and `writeValue`.
Explicit extension registrations supply exact identity, scopes, schema and optional
host callbacks. Documents cannot select or load callbacks.

## Browser WASM

Build `umf-core-wasm` for `wasm32-unknown-unknown`, then run wasm-bindgen 0.2.100 with
`--target web` into `bindings/core/wasm/pkg`. Call `initializeWasm(loader, globalThis,
resources, options)` once asynchronously; returned engine operations are
synchronous. The default loader reads the packaged module from `pkg`.
Initialization refuses missing WASM capabilities or exports. Browser tests run the
actual module in Chromium, separately from native addon tests.

## Native CLI

`cargo build --locked --release -p umf-cli` produces the `umf` executable.
`umf metamodel parse|compile|shape|outputs` is the native compiler interface.
`umf core --stdin-wire` processes line-separated requests using the closed private
`umf-core-wire` protocol. Resources accompany each request. The test-only baseline
callback requires an explicit startup flag and is never enabled by document data.
The CLI executes without Node, Bun or V8.

## Rust compilation API

Node/Bun exports `createCodegenEngine(resources, options)`. WASM exports
`createCodegenEngine(module, resources, options)` and `initializeCodegenWasm`; Python exposes
`umf.rust_codegen.CodegenEngine`. In addition to the five core resources above,
provide `tablesPackage`, `actionsPackage`, `bindingPackage` (0.1.0) and
`stableBindingPackage` (0.2.0), using the matching trusted package manifests.
Each resource has its own catalog admission budget. The engine snapshots these
resources; input documents cannot install schemas or callbacks.

`call(operation, request)` returns the complete `{ok, result}` or `{ok, error}`
semantic envelope. The nine operations are `generatePythonClient`,
`generateAccessPackage`, `diffAccessPackages`, `compileTableDeployment`,
`verifyTableDeployment`, `compileTableMigration`, `verifyTableMigration`,
`discoverTableMigrationChanges` and `normalizeRowScope`. Host convenience methods
return the operation result and raise semantic errors. Cooperative control
failures remain terminal host errors. The CLI uses the same operations with a
`codegen/` prefix in its wire request's `op` field.

The generated files, diagnostics and source archives retain their existing
contracts. Stage-one resolved IR stays private. Compiler source text retains the
ordinary 4M limit; compiler aggregate result text has a separate 32Mi UTF-16
budget, so a valid multi-file package can exceed 4M units. The current
`umf_codegen` package routes its public CLI through the bundled Rust executable
in the matching core wheel.

## Values and resource controls

Ordinary values preserve raw UTF-16 units, including isolated surrogates, and
finite safe-number semantics. Source and serialized-output limits are 4,000,000
UTF-16 units; ordinary trees allow 100,000 values and depth 128. Catalog resources
allow 1,000,000 values independently per resource. Copied strings have no aggregate
4M text ceiling. Native Python consumer schemas also retain Python code-point
origin, integer identity and IEEE float bits through their distinct value carrier.

The supported `cooperative` profile meters Rust work and polls explicitly supplied
cancellation and clock capabilities. Node/WASM `controls` accepts `maxWork`,
`meter`, `isCancelled`, `now` and `deadlineMs`; Python `validate_document` exposes
equivalent keyword controls. Work budgets apply per operation. Callbacks receive isolated
copies and may reenter the engine. The profile does not promise a process memory
ceiling or preemption of a host callback. `hard-isolated` refuses before execution.

Run `cargo test --locked` or `bun run test:rust-core` for the current Rust
libraries, wire protocols and native CLI. Foreign-host bindings have separate
Python, Node/Bun and browser tests.
