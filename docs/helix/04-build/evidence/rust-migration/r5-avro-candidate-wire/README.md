---
ddx:
  id: umf.evidence.rust-migration.r5-avro-candidate-wire
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-007
      kind: implements
    - id: umf.evidence.rust-migration.r5-avro-candidate-edit
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-avro-semantic-inspection-wire
      kind: informed_by
---

# R5 Avro candidate-edit wire and CLI design checkpoint

This packet records the opt-in transport and host binding slice for the
`umf-r5-avro-candidate/0.1.0` profile. The core operation and its focused tests live in
[`avro_document.rs`](../../../../../../crates/umf-core/src/avro_document.rs)
and [`r5_avro_candidate_edit.rs`](../../../../../../crates/umf-core/tests/r5_avro_candidate_edit.rs).

## Frozen request contract

The operation name is `avro.schema.proposeNodeEdit`. Its request value contains
`op`, `document`, `path`, and `replacementJson`, plus optional `dependencyId`.
The request value is encoded with the existing `umf.core-wire/1` tagged
transport before calling the future wire entry point. `document` is a complete
UMF document; `path` and `dependencyId` are UTF-16 strings. `replacementJson` is
the exact JSON source text in a string: hosts must not parse or stringify it,
especially when it contains an integer such as
`9223372036854775807`. The core operation, not the host, parses that text.

Success uses the ordinary closed core-wire result envelope. Its decoded `wire`
value is the exact core report described by
[`rust-candidate-edit-report.schema.json`](../../../../../../spec/extensions/avro/rust-candidate-edit-report.schema.json):
profile, candidate status, detached source/document, exact tagged replacement,
admission, and separate bounded native inspection. It has no predecessor
`validation` member. An inspector error is data in a successful candidate
report; malformed requests, admission/refusal errors, resource exhaustion, and
host-control failures use the ordinary error envelope. The wire route does not
change the default Avro adapter.

The frozen case matrix is
[`candidate-wire-cases.json`](candidate-wire-cases.json). It references the
existing committed TypeScript candidate fixture by file hash and JSON Pointer,
then specifies request values, optional document patches, and the first expected
envelope/report outcome. A harness resolves each `sourceRef` and installs that
UMF value as `requestValue.document` before calling the wire encoder. The
TypeScript/native fixture is test input, not Rust wire parity evidence. The JSON
currently contains 16 wire scenarios and 5 CLI scenarios; the integrity test
pins both counts. The cases preserve core refusal order: source admission
and stale projection; unknown envelope/tagged representation content anywhere;
pointer syntax; replacement parsing; dependency selection/target resolution;
field metadata guard; candidate admission; separate inspection; report limits.

## Opt-in implementation checkpoint

The transport now exposes `AVRO_CANDIDATE_PROFILE`,
`execute_avro_candidate_wire`, and its `_with_control` form in
`crates/umf-core-wire/src/lib.rs`. It uses one ordinary context for transport,
core candidate editing, and result encoding; dispatches only the frozen
operation; validates required request value types; passes `replacementJson`
without parsing or re-stringifying in the host; and returns the core report
unchanged.

`crates/umf-core-wire/tests/r5_avro_candidate_wire.rs` materializes all 16
frozen wire cases, including source references, JSON Pointer patches, refusal
codes, the exact int64 replacement token, and host control refusal. The CLI
exposes `umf avro candidate-edit --version|--capabilities|--stdin-wire
[--max-work N] [--timeout-ms N]` behind `embedded-adapters`, with a separate
32 MiB candidate request bound and cooperative work/deadline control.
`crates/umf-cli/tests/avro_candidate_cli.rs` covers version, capabilities,
success, malformed input, resource/deadline refusal, and unsupported flags.
This command remains opt-in and does not change adapter selection.

Opt-in Python and Node/Bun bindings expose the same profile through
`rust_avro_candidate.propose_node_edit` and
`createAvroCandidateEditor().proposeNodeEdit(...)`. Both pass the replacement
JSON as text, retain the core report shape, and forward host work controls.
The Node/Bun focused native test passes 3/3 tests (16 assertions) against the
current-source N-API extension. Python focused tests pass 3/3 under CPython
3.13 against the current-source PyO3 extension. The official Python wheel
payload also passes 3/3 under each of CPython 3.11.17 and 3.14.8, as detailed
below.

## Refusal and control checklist

The fixture freezes core-operation first-error outcomes for invalid source,
stale field projection, tagged representation extras, malformed pointer,
malformed replacement JSON, unknown dependency ID, absent target, attached field
metadata, and an admitted candidate whose native inspection reports an error.
The wire tests also freeze unknown operation/missing or wrongly typed request
members, standard success/error envelopes, UTF-16 replacement preservation,
and cooperative host refusal. The CLI tests show that
`--max-work 0` and `--timeout-ms 0` remain operation failures and that an empty
`PATH` does not affect execution.

## Current gates

The core operation is recorded in the adjacent `r5-avro-candidate-edit`
evidence packet. Focused Rust tests pass: wire 4/4 (including all 16 frozen
scenarios) and CLI 3/3, using the pinned macOS arm64 Rust 1.90 toolchain and an
isolated Cargo target directory. Core-wire and CLI no-default-feature checks
pass; the CLI candidate test target also compiles without default features with
its feature-specific body disabled. The Bun fixture integrity test
`bun test tests/rust-migration/r5-avro-candidate-wire-fixture.test.ts` passes
4/4 with 28 assertions; it verifies the frozen source hash, fixture pointers,
replacement text, profile/report identity, refusal matrix, and opt-in CLI
controls. The official Python wheel build and focused wheel-payload tests
passed as detailed below. WASM, browser, and default-routing qualification
remain open. Native Avro
oracle parity and installed native-inspector comparison also remain open;
passing tests qualify the Rust core-wire/CLI route and host wrappers only
against the stated fixtures and artifacts.

## Wrapper qualification artifacts

The R6 abi3 wheel is
`/private/tmp/r6-native-wheels/umf_core_python-0.1.0-cp311-abi3-macosx_11_0_arm64.whl`
(SHA-256 `3131168e6446c144575bb8b0860a1babad39e1736d8ef8ae6874131ba2973eb9`).
Its embedded extension SHA-256 is
`85fcadd05dd38b6dba7c6d63a87363fe051ec74b31ee3ec6fddb92edee142adb`. The
current-source Node extension SHA-256 is
`d86bfa7c7d15924fa4f28394880fce6393043f6abb2285baf5b87d0942b7f82c`; the
current-source Python extension SHA-256 is
`85fcadd05dd38b6dba7c6d63a87363fe051ec74b31ee3ec6fddb92edee142adb`.

Current source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `bindings/core/python/src/lib.rs` | `97a8ff94b866a2751911ce09181da47ff4056068bdd0ae37d1cdd9d923e14434` |
| `python/src/umf/rust_avro_candidate.py` | `35205131704509656a3b4f786e0f88287c319e282f06d5897c2894ec7ddc244d` |
| `python/tests/test_rust_avro_candidate.py` | `e61b6b271305499e0ea0961a49f66aba3590a37c00512e2d02070d813f883c48` |
| `bindings/core/node/src/lib.rs` | `10ffb28350b7a2b2ae75e7982f8366c8ad0a7782d72d4894607b91a4006091ff` |
| `bindings/core/node/index.js` | `084d95647f0df9c0f5e71b4fa00c26a03c62f8799364834f52450500c365d9ed` |
| `bindings/core/node/index.d.ts` | `a25ca7dbb9177ba95f4cc0c34e097f8354e829d37334ade8d913fc5e36a018d3` |
| `bindings/core/node/tests/avro-candidate.test.js` | `d89e3e0dd92587250c056d8eda494e9d98aa29d82d235b63a898ca0cb4c2047e` |

## Official wheel qualification update

The earlier R6 extension-only wheel overlay results above are superseded for
Avro wrapper qualification by this official Python project wheel, built from
current source with pinned Rust 1.90 and an isolated target directory:

```sh
PATH=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin:/opt/homebrew/bin:/usr/bin:/bin \
CARGO=/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin/cargo \
CARGO_TARGET_DIR=/private/tmp/umf-avro-official-wheel-target \
CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 UV_CACHE_DIR=/private/tmp/umf-uv-cache \
uv build --offline --no-build-isolation \
  --python /private/tmp/umf-hatch-build-venv/bin/python --wheel python/ \
  --out-dir /private/tmp/umf-avro-official-wheel
```

The wheel is
`/private/tmp/umf-avro-official-wheel/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl`
(SHA-256 `b6651af2d797a2589e447afff04a01e1ee0bc943b854ba6e5095c15487b79bc5`).
It contains both `umf/rust_avro_candidate.py` and `umf/_rust_core.abi3.so`; the
embedded extension SHA-256 is
`f94ff5c8c58dd53240fd5e2566f2f3300b005e674420fbf10f3c1228674a3992`. The wheel
was installed using `uv pip install --offline --no-deps` into fresh CPython
3.11.17 and 3.14.8 environments. The installed-wheel payload test suite passes
3/3 on each version. Its runner bypassed only `umf.__init__` because the
offline cache lacks the declared Pydantic dependency for Python 3.11; it
loaded the installed wheel's `umf/rust_avro_candidate.py`, `_rust.py`, and
native extension directly. This qualifies the wheel payload and wrapper
behavior; full dependency installation and normal package initialization
remain open.

## Full dependency-installed replay update

The same exact wheel was subsequently installed with all declared dependencies
into fresh environments and the tests were rerun using normal package imports;
this supersedes the preceding no-dependencies import limitation. The wheel
SHA-256 remained
`b6651af2d797a2589e447afff04a01e1ee0bc943b854ba6e5095c15487b79bc5`. CPython
3.11.17 and CPython 3.14.8 each passed all 3 focused Avro tests (13.564 s and
14.613 s). Both runs imported `umf`, `umf.rust_avro_candidate`, and
`umf._rust_core` from their fresh site-packages directories. Both used
`umf-core==0.11.0`, `pydantic==2.14.1`, `pydantic-core==2.50.1`,
`annotated-types==0.8.0`, `typing-extensions==4.16.0`, and
`typing-inspection==0.4.4`.

The wheel's `RECORD` SHA-256 entries for `umf/rust_avro_candidate.py` and
`umf/_rust_core.abi3.so` were verified against the wheel bytes. Both files in
each installed environment were byte-for-byte equal to the wheel members.
The wrapper source SHA-256 is
`35205131704509656a3b4f786e0f88287c319e282f06d5897c2894ec7ddc244d`; the
extension SHA-256 is
`f94ff5c8c58dd53240fd5e2566f2f3300b005e674420fbf10f3c1228674a3992`.

This wheel is a prior source-pin cohort: generated metamodel/resource pins
changed after it was built. These tests qualify the hashed wheel artifact and
its installed behavior, not the newer checkout state; rebuild and replay are
still required for final release qualification.
