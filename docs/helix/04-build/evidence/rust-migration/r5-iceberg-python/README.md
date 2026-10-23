---
ddx:
  id: umf.evidence.rust-migration.r5-iceberg-python
  type: execution-evidence
  activity: build
  status: captured
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: CONTRACT-020
      kind: verifies
    - id: CONTRACT-001
      kind: informed_by
    - id: TD-020
      kind: informed_by
    - id: US-020
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-iceberg-schema
      kind: informed_by
---

# R5 standalone Iceberg schema Python binding

This receipt qualifies the opt-in Python 3.11 binding for the frozen
`umf-r5-iceberg-schema/0.1.0` profile. It exposes `import_schema`,
`export_schema`, `inspect`, `get_node`, and `propose_node_edit` through the
shared `umf.core-wire/1` dispatcher. The native profile handshake is checked
before each operation. Every operation dispatch creates its own ordinary Rust
`Context`; optional host metering, cancellation, clock, deadline, and work
budget controls are scoped to that call. Tagged strings and object keys cross
the Python boundary as UTF-16 units with surrogate-pass decoding, retaining
lone surrogates and unknown Iceberg properties.

The installed CPython 3.11 wheel replay compared all five available operations
for each successful frozen case and checked exact import refusals for the
remaining inputs:

- Authored baseline: 26 imports passed, with exact inspection diagnostics,
  native JSON export, copied node values, missing-pointer error code/message,
  edit validation, edited export, and unchanged source export; all nine
  authored import refusals matched the frozen error code and message.
- Upstream baseline: 20 imports passed with exact inspection, export, copied
  node, edit export, and unchanged-source outcomes; the one missing-root-type
  occurrence was rejected with its frozen error code and message.
- Controls: a lone U+D800 value survived import, `get_node`, and export;
  proposals returned independent edited documents; positive metering,
  `RESOURCE_LIMIT`, `CANCELLED`, and `DEADLINE` outcomes passed. Callback
  failures retain capability identity (`METER_FAILURE`,
  `CANCELLATION_CHECK_FAILURE`, and `CLOCK_CAPABILITY_REQUIRED`); NaN and both
  infinities are rejected as clock results. Refusal-order checks confirm
  budget before meter, meter before cancellation, and cancellation before clock.
  A succeeding operation after control failures confirmed per-operation state.

The committed dependency-free replay harness is
`python/tests/replay_r5_iceberg_standalone.py`. It passed from the installed
CPython 3.11 wheel with `--namespace-shim`, and from the installed CPython
3.12.15 wheel through the normal package import. Focused pytest coverage is in
`python/tests/test_rust_iceberg_schema.py`.

## Build and installation

Environment: macOS Darwin 27.0.0 arm64, CPython 3.11.17 and CPython 3.12.15,
Pydantic 2.14.1 in the latter, Cargo/Rust 1.90.0, and PyO3 0.23.5. Cargo
output used the isolated target directory
`/private/tmp/umf-r5-iceberg-python-target`. Hatchling 1.27.0 was loaded from an
existing local build cache because package index access was unavailable. The
wheel was installed into a new venv at
`/private/tmp/umf-r5-iceberg-python-venv` using `pip install --no-deps`.

The CPython 3.11 venv installed the wheel with `--no-deps` because package
index access was unavailable and Pydantic was absent there. The harness's
`--namespace-shim` loads `_rust` and the binding module from the installed
wheel without executing `umf.__init__`. The CPython 3.12.15 environment had
Pydantic 2.14.1; both `import umf` and `import umf.rust_iceberg_schema`
passed before its full replay.

Reproduce the two installed replays from the repository root after installing
the wheel as above (the second environment is
`/private/tmp/umf-r5-iceberg-native`):

```sh
/private/tmp/umf-r5-iceberg-python-venv/bin/python \
  python/tests/replay_r5_iceberg_standalone.py --namespace-shim
/private/tmp/umf-r5-iceberg-native/bin/python \
  python/tests/replay_r5_iceberg_standalone.py
```

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
  RUSTUP_TOOLCHAIN=1.90.0 CARGO_BUILD_JOBS=2 \
  CARGO_TARGET_DIR=/private/tmp/umf-r5-iceberg-python-target \
  PYTHONPATH=/Users/erik/.cache/uv/builds-v0/.tmpHCrvTb/lib/python3.11/site-packages \
  /Users/erik/.local/bin/python3.11 -m hatchling build -t wheel \
  -d /private/tmp/umf-r5-iceberg-python-dist

/Users/erik/.local/bin/python3.11 -m venv /private/tmp/umf-r5-iceberg-python-venv
/private/tmp/umf-r5-iceberg-python-venv/bin/python -m pip install --no-deps \
  /private/tmp/umf-r5-iceberg-python-dist/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl
```

`cargo check --locked -p umf-core-python` passed. The committed installed-wheel
harness reported 26 authored imports, nine authored refusals, 20 upstream
imports, and one upstream refusal in both environments. Python syntax parsing
and `git diff --check` passed for the binding, tests, harness, and receipt.

## Scope and limitations

This is an opt-in installed-wheel qualification against the frozen TypeScript
predecessor packet, not a default adapter cutover. The separate fresh Java
oracle receipt covers upstream native comparisons. This Python receipt does
not establish broader Iceberg table metadata, table-format evolution, defaults
execution, data-reader support, or behavior outside the recorded corpus and
controls. CPython 3.11 package dependencies were unavailable offline; full
package import was verified in CPython 3.12.15 with Pydantic 2.14.1.

## Captured hashes

| Artifact | SHA-256 |
| --- | --- |
| Frozen R5 schema `baseline.json` | `22b7654f7e05cbf3290da46db3dab887e62f419b4973eb1ee25e64a4bbef68ef` |
| `bindings/core/python/src/lib.rs` | `44c2aa4c358244e0dbfc03547b1570ae47330d46aed7fbe3e856b804cd26317c` |
| `python/src/umf/rust_iceberg_schema.py` | `beb7a8a337a50740f2531c9a0700377ab5e07f651bbb578a6c179ae3abbc693f` |
| `python/tests/test_rust_iceberg_schema.py` | `452ba9d5b91b7c90c35778725dfcda8a64523330a1616d332b90e4f545f2f013` |
| `python/tests/replay_r5_iceberg_standalone.py` | `96f43db2cd242822ec2784c279c406b985bc4d7c583c6f2d8438c0f6f4d87f67` |
| Installed wheel `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `73fad0296c9aeca302e32596373f363253f22c1ffd31dd6ef78dd9cda0cf69c5` |

## Successor combined wheel after the Protobuf inspector repair

The table above remains the historical Iceberg-only cohort. A later combined
`umf-core` 0.11.0 cp311-abi3 wheel was built after the Protobuf inspector
UTF-16 path repair. Its SHA-256 is
`02b6b8fe766993c615902b2a7b90e75505657fc6f74fe0a4d3adccf7146c8335`.
The installed extension hashes identically under CPython 3.11.17 and 3.12.15:
`8ae1a6a40462a3a081dcc1a8316d2163f29afb9725d87b2bbe0e72e7a5dd8ed8`.
Both environments now import the full `umf` package without a namespace shim
and pass this standalone replay: 26 authored imports, nine authored refusals,
20 upstream imports, one upstream refusal and all controls. Independent Sol
repeated both replays and verified the wheel's packaged sources/resources
against the current checkout. The exact wheel, interpreter and source closure
is in the separate [CPython 3.11 final receipt](../r6-outcome-values/installed-wheel-python311-final.json)
and [CPython 3.12 final receipt](../r6-outcome-values/installed-wheel-python312-final.json).
This successor closes the earlier 3.11 top-level-import gap for this bounded
Iceberg binding; table metadata, evolution and default cutover remain open.
