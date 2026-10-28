---
ddx:
  id: umf.evidence.rust-migration.r8-python-linux-bootstrap-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# R8 Python Linux wheel bootstrap evidence

This packet records a bounded, private qualification run for the direct `umf_core_python` PyO3 binding. It built and installed a CPython stable-ABI (`abi3`) AArch64 Linux wheel from the current UMF worktree source, then ran seven selected Python tests on each of three official CPython images. This is not an `umf-core` release-wheel or source-distribution result, and it makes no release or broad platform-support claim.

## Environment

The image build used these exact official Docker tags and resolved base manifest digests, on `linux/arm64`:

| CPython | Official base tag | Base manifest digest | Disposable test image ID |
| --- | --- | --- | --- |
| 3.11.17 | `python:3.11.17-slim-bookworm` | `sha256:f06d01d4ba3f8ad5af45a3ec87df19c1d317d8e8961edc0fabda61811af6f7cf` | `sha256:0e2e27b9815e105dad3e9094f81ebc2578af10acbe0514388ae923eecd6d5599` |
| 3.12.15 | `python:3.12.15-slim-bookworm` | `sha256:6a0e06f5ba0b373d051aabd3fffb9b873f27f9a2a3a14bcbe37dee6f0e3bbc70` | `sha256:52567d93ba53943c13cf7ce53f8ab0538e16c17eb72ff38215b3652dee7f6829` |
| 3.13.16 | `python:3.13.16-slim-bookworm` | `sha256:73aa5faee130c60da030e105ec971ccf57473fbd22ce73bd6fc9ba99a40b838d` | `sha256:f01aaf93b67b4f63e2f55bcdac0814a3568616fb12c5a611e4eb01dfce6bc388` |

The Dockerfile installs Rust/Cargo 1.90.0, maturin 1.9.6, and pytest 8.4.2. The test runner used Pydantic 2.11.10. Dockerfile and runner are preserved byte-for-byte from the run context in this directory. The official base tags were exact version tags; the recorded manifest digests identify the resolved bases. Apt packages and pip dependencies other than the listed pinned tools were not locked by this evidence.

## Reproduction

Run from a checkout containing the Rust Python binding and tests. Build each disposable image with the corresponding exact CPython version. The image context contains only this packet's Dockerfile; the repository is not mounted during image construction.

```sh
EVIDENCE_DIR="$PWD/docs/helix/04-build/evidence/rust-migration/r8-python-linux-bootstrap-20261028"
IMAGE_CONTEXT="$(mktemp -d)"
cp "$EVIDENCE_DIR/Dockerfile" "$IMAGE_CONTEXT/Dockerfile"
for version in 3.11.17 3.12.15 3.13.16; do
  docker build --platform linux/arm64 --build-arg "PYTHON_VERSION=$version" \
    --tag "umf-rust-python-linux:cp${version%%.*}${version#*.}" "$IMAGE_CONTEXT"
done
```

The recorded tags included the full patch version (`cp311-3.11.17`, `cp312-3.12.15`, `cp313-3.13.16`). For the test step, mount the repository source read-only at `/src`, mount a separate writable results directory at `/evidence`, set `CARGO_TARGET_DIR=/tmp/cargo-target`, and disable Python bytecode and pytest cache writes. Build with:

```sh
maturin build --locked --release \
  --manifest-path /src/bindings/core/python/Cargo.toml \
  --interpreter /usr/local/bin/python \
  --out /evidence/<runtime>/wheels
```

Then install and run the selected tests using the runner copied into the writable evidence mount:

```sh
python -m pip install --no-deps --no-compile --target /tmp/wheel-install \
  /evidence/<runtime>/wheels/umf_core_python-0.1.0-cp311-abi3-manylinux_2_34_aarch64.whl
python -u /evidence/run-wheel-tests.py \
  /evidence/<runtime>/wheels/umf_core_python-0.1.0-cp311-abi3-manylinux_2_34_aarch64.whl \
  umf-rust-python-linux:<runtime-tag> /evidence/<runtime>
```

The test-runner script is an exact record of the original commands and environment setup. The per-runtime JSON receipts below are authoritative for resulting versions, wheel hashes, test names, and outcomes; no wheel binaries or container images are included in this packet.

## Results and test scope

All seven selected tests passed on each interpreter (7/7 each; 21/21 total):

1. Copy JSON preserves ordering, raw surrogates, and positive numeric bits.
2. Python consumer snapshot preserves Python string and number origins.
3. Arrow IPC capture, export, and inspection preserve exact bytes.
4. Arrow schema profile and five operations preserve source and copies.
5. Avro inspector resolves ordered dependency and remains incomplete.
6. Opt-in Python binding runs all three cardinality operations.
7. Core semantic reference operations match the frozen predecessor.

Each run built `umf_core_python-0.1.0-cp311-abi3-manylinux_2_34_aarch64.whl`; the individual wheel digests are in `cp311/wheel-tests.json`, `cp312/wheel-tests.json`, and `cp313/wheel-tests.json`. The wheel binaries are intentionally excluded.

## Controls and limitations

The container image build had no repository mount (`sourceMountedDuringImageBuild: false`). During wheel builds and tests, the source worktree was mounted read-only at `/src`; Cargo output went to `/tmp/cargo-target`, test output to a separate writable results directory, and Python bytecode/pytest caches were disabled. The run receipt records no repository mutations and no `dist` or repository cache access. The worktree path was `/Users/erik/.codex/worktrees/rust-binding-spike/umf`. A source-tree digest or immutable Git reference was not captured, so this packet does not independently identify the precise source revision.

A broader all-file CPython 3.11 run exceeded the six-minute bound and was stopped at the Arrow IPC test area. No broad-suite outcome is claimed. The focused Arrow IPC test did pass on all three interpreters. This packet provides narrow test evidence only; it does not establish full Linux compatibility, all-platform support, or release readiness.

This evidence directory is outside the reviewed SDK archive's source closure. It did not alter the ledger, package builder, or implementation source.
