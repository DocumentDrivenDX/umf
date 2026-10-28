# UMF bounded offline Linux package qualification

## Scope and source cut

All cohorts ran `docker run --network none` with the source snapshot mounted read-only at `/src`, the host Cargo registry mounted read-only at `/host-registry`, a prepared runner mounted read-only, and a cohort-specific disposable `/out` directory. The runner copied source into container-local `/worktree`, redirected Cargo target output and artifacts to `/out`, and set `CARGO_NET_OFFLINE=true`. No repository path was writable or changed by these runs.

The exact selected source archive is `/private/tmp/umf-linux-qualification/current-source-cut.tar`, SHA-256 `7fb19d2d4c815cb6dde615be2526a4606838411a0bd2687efd6424d215bab1ed`. The extracted source was made read-only. `crates/umf-core/src/target_pin.rs` in that cut has SHA-256 `45309fb10bc0f696b9e0332dde38d1335bf91dc34fc14b5313ecf8f1d8c9d854`. The archive predates both the later opt-in PyO3 candidate files and the final generated-resource recapture (the repository resource manifest was modified at 12:15 UTC; archive created at 12:09 UTC). Therefore these outcomes qualify only this archived cut, and do not qualify the later generated resources, opt-in candidate, or commit `2607447fe`.

Runner SHA-256: `bf9f251e55de596205f73d1da8e27ca05a0163813f25cefb1dccc9f244be54f3`.

## Runtime cohorts

Disposable bootstrap records and exact Dockerfile/build details are in `/private/tmp/umf-linux-bootstrap/record.md`. Dockerfile SHA-256: `036a39d96a320c5f593511c19b751bbae19eb2249764648add98a6493a7aed29`. It restricted CPython to 3.11.17, 3.12.15, and 3.13.16 on linux/amd64, installed `build==1.3.0`, `hatchling==1.27.0`, `twine==6.2.0`, `pydantic==2.11.9`, `pytest==8.4.2`, and build-essential, and copied the exact cached Rust/Cargo 1.90.0 toolchain. The source repository was not mounted during image construction. No auto-review rejection occurred.

| CPython | Base image digest | Built image ID |
|---|---|---|
| 3.11.17 | `sha256:b7a9e5f6a93d6d4a31f129bbd4bdee69efccb6ded0fb230d78aafaf37af98377` | `sha256:fad36b0df9856ade955676b0d29e0e18084707178415f805514e07717ff38198` |
| 3.12.15 | `sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704` | `sha256:fe23ffd59c7d254e2fb798dc332cc96324f7330880da3a15ed7e46b55e726093` |
| 3.13.16 | `sha256:cf50a4f6ac4f026458b08d5222023d700ac806410dff5e9ca8728fa44f2b850f` | `sha256:7b1f0a6eaaee47b2cf1ff7ce516301f0295aec193e4bddaccdfdc27282a87e3e` |

Cached Rust source image: `umf-r8-sdk-linux-x64:latest`, resolved `sha256:fca0948c034dbc1cb150a041113c120bfbf577262dfc1c88727f732e46c426f7`; toolchain `rustc 1.90.0 (1159e78c4 2025-09-14)`, Cargo `1.90.0 (840b83a10 2025-07-30)`.

## Qualification command

The same command ran for each cohort, with `<version>` set to the row's CPython value and matching image/output/log names:

```sh
docker run --rm --platform linux/amd64 --network none \
  --env EXPECTED_PYTHON=<version> \
  --mount type=bind,source=/private/tmp/umf-linux-qualification/source,target=/src,readonly \
  --mount type=bind,source=/Users/erik/.cargo/registry,target=/host-registry,readonly \
  --mount type=bind,source=/private/tmp/umf-linux-qualification/output-<version>,target=/out \
  --mount type=bind,source=/private/tmp/umf-linux-qualification/run-qualification.sh,target=/run.sh,readonly \
  umf-linux-bootstrap:<version> sh /run.sh
```

The command was piped through `tee` to `/private/tmp/umf-linux-qualification/run-3.12.15.log` and `run-3.13.16.log`; 3.11.17 log is `run-console.log`.

The host cache check found the locked `regress` crate and all required package sources available. A read-only registry mount allowed `cargo metadata --locked --offline` to resolve the workspace. The first isolated-image build attempt without that registry mount could not resolve `regress`; no downloads were made. Subsequent runs used the read-only cache with network disabled.

## Results

Each of the three cohorts passed:

- CPython version, linux/x86_64 architecture and `pip check`.
- Core and codegen wheel/sdist builds.
- `twine check` on all four artifacts.
- `tools/verify_python_artifacts.py` core source-payload/sdist verification.
- Codegen sdist-to-wheel byte identity: both direct and rebuilt wheel SHA-256 were `4a4bd4bc561484a068a13a6fdbe49e83cb2399db6e9e6c44cf7b956ca2a5da29`.
- Offline installed-pair smoke (`umf-core==0.11.0`, `umf-codegen==0.2.0`), fixture generation, and CLI help.
- Focused pytest set: `python/umf_codegen/tests`, `python/tests/test_core.py`, and `python/tests/test_rust_core.py`.

| CPython | Focused tests |
|---|---|
| 3.11.17 | 217 passed in 61.44s |
| 3.12.15 | 217 passed in 66.77s |
| 3.13.16 | 217 passed in 68.57s |

The coordinated release-pair verifier was deliberately not run: it creates a fresh virtual environment and downloads pinned dependencies, which would require network access beyond the approved bootstrap. The manual installed-pair smoke and focused tests above ran fully offline. The core artifact verifier reports native binary byte identity as false across independent rebuilds; metadata, source payload, tag/version, and non-native package payload checks passed. This qualification does not claim reproducible native binary bytes.

Per-cohort console logs and output receipts/artifacts are under `/private/tmp/umf-linux-qualification/`; nothing was committed or published.
