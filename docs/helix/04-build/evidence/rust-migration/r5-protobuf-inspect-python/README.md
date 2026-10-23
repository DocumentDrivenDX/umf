---
artifact_id: R5-PROTOBUF-INSPECT-PYTHON
artifact_type: evidence
status: captured
---

# R5 Protobuf inspector Python binding

This additive packet records the opt-in CPython wire bridge for the Rust
`protobuf.descriptor.inspect` operation under
`umf-r5-protobuf-inspect/0.1.0`. The PyO3 bridge receives the exact tagged
`umf.core-wire/1` request and invokes the reviewed Rust core-wire route. The
Python facade uses the existing lossless UTF-16 tagged conversion and returns
the decoded inspector result or reconstructs the exact native error code,
message and path envelope. No default execution route changed.

## Installed-wheel replay

The source-bound harness replays all ten observations in the frozen TypeScript
inspector packet, including authored descriptor warnings/presence, empty
descriptors, ordered unknown-wire warnings and retained unknown bytes. It also
checks a lone-surrogate path produced by a real `PROTOBUF_REPRESENTATION`
diagnostic and injects resource limit, cancellation, deadline and a meter
callback failure after Python request admission inside the Rust hook. It also
checks malformed document rejection and explicit empty-field presence. The static
descriptor graph observation is checked from its frozen schema/core source
hashes; the historical files are not rewritten. The installed result remains
`complete: false` and includes `PROTOBUF_COMPILER_REQUIRED`.

The harness also checks the exact `umf.core-wire/1` success envelope and the
error envelope's closed key set, error code and UTF-16 `messageUnits` /
`pathUnits`, then confirms the Python facade reconstructs that native error.

Recorded artifacts are [the replay receipt](receipt.json) and its
[source and wheel hashes](source-hashes.json). The wheel SHA-256 is
`daf234c9eef122ab1c0c001ac071f62bc2e81ec5b8701879bcdce80d6f5b7611`; the
embedded and installed `_rust_core.abi3.so` SHA-256 is
`e4c5f32ce1b880d53772a37e1f2e0d5d8c0d1d137a21b22d1e28840a3028fc38`.

Build and replay commands on the recorded Darwin arm64 host:

```sh
PATH=/opt/homebrew/opt/rustup/bin:/opt/homebrew/bin:/usr/bin:/bin \
RUSTUP_TOOLCHAIN=1.90.0 CARGO_BUILD_JOBS=2 \
CARGO_TARGET_DIR=/private/tmp/umf-r5-protobuf-inspect-python-target \
PYTHONPATH=/Users/erik/.cache/uv/builds-v0/.tmpHCrvTb/lib/python3.11/site-packages \
/Users/erik/.local/bin/python3.11 -m hatchling build -t wheel \
  -d /private/tmp/umf-r5-protobuf-inspect-python-dist

# Install into the captured CPython 3.12.15 environment with the pinned Pydantic runtime.
/private/tmp/umf-r5-iceberg-native/bin/python -m pip install --force-reinstall --no-deps \
  /private/tmp/umf-r5-protobuf-inspect-python-dist/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl
/private/tmp/umf-r5-iceberg-native/bin/python \
  scripts/rust-migration/r5/protobuf-inspect-python-replay.py
```

The wheel was built by CPython 3.11.17 with Rust/Cargo 1.90.0 and installed and
replayed by CPython 3.12.15. The executable reported ten frozen observations,
8,794 charged work units on the metered sample, all four cooperative controls,
and preserved the lone UTF-16 surrogate. These are one local macOS arm64 wheel
cohort. Control callbacks are cooperative and cannot preempt an active Rust
operation; hard isolation, complete registry interpretation, native compiler
validation, broader Protobuf semantics, source operations, Node/browser parity
and default cutover remain outside this evidence.

## CPython 3.11 installed replay supplement

Independent Sol review installed the same wheel into the full-package
`/private/tmp/umf-rust-py311-qual` environment and reran the harness under
CPython 3.11.17. Root repeated the replay and saved its direct output as
[`receipt-python311.json`](receipt-python311.json), SHA-256
`5b801272c49c45d41d536a8292554bb4dcd5307f7c1d9ea111f941479f3870e2`.
The same ten frozen observations, four post-admission Rust-hook controls,
UTF-16 path, exact envelopes and 8,794 metered work pass. The installed
extension SHA-256 remains
`e4c5f32ce1b880d53772a37e1f2e0d5d8c0d1d137a21b22d1e28840a3028fc38`.
This extends the local abi3 binding check to both CPython 3.11.17 and 3.12.15;
the named limitations above remain.
