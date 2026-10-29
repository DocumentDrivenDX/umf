# Local PR-fast equivalent — approved execution plan

## Scope and identity

This plan covers only the three portable checks in the paused `.github/workflows/pr-fast.yml`: the three-file core Bun unit-test invocation, the browser-targeted bundle, and Python syntax compilation. It does not repeat SDK, full18, R3, or G02-D5 qualification and will not dispatch Actions.

Use the existing read-only Docker volume `umf-migration-source-267675510`, whose inspected Git identity is producer P `e4299aff8e87e9d211f9d86df2f2013ab9c95945`, tree `8b98c0d895983ba2b7637dd3aea567dab0943883`, with empty porcelain status. Do not use the current app checkout (it is a different commit). The only runtime candidate is the already-present SDK builder image `sha256:1f983eafda3fd12f069837f7e972179ec3b8d74587190751db85b555b3430c10`, pinned `linux/amd64`; read-only identity inspection confirmed Bun 1.4.3 and Python 3.11.17. The already-present runtime image `sha256:7e44ba6b5c483f84c0d630180ba4cd17a82f1bba950577bf1dc9200e7f26e556` is also `linux/amd64`, but the builder image is preferred because Bun 1.4.3 was verified there.

Source hashes from the read-only volume: workflow `pr-fast.yml` `7aab9a13445f9fcc1e3bb4a3d05a2a2edc1e06598162c1f0dec3f9392860c330`, `package.json` `c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b`, `bun.lock` `5fb58795dfe9ef5df89597c44372cf2a0739e1855f322f7622ae0c9d0ac71ce4`, and `tsconfig.json` `fb5e87db29d610bb807d2be59e8c40700d9040532d918dfb7c3d8f51ad420918`. `.npmrc` is absent at P; it will not be fabricated.

## Minimal driver behavior

The proposed local driver will create one unique owned workspace under `/private/tmp`, mount the P source volume read-only at `/source`, and copy only the workflow's sparse paths to `/work/source`: `src/`, `spec/`, `tests/core/`, `python/`, `scripts/`, `patches/`, `package.json`, `bun.lock`, and `tsconfig*.json`. The workflow's `.npmrc` sparse entry is skipped because it is absent. The inspected source payload is about 72 MB across those paths; no `.git` directory or full clone is copied. The driver will record an SHA-256/size manifest of copied regular files and symlink targets, along with P/tree/status and workflow/lock hashes, and verify the copy remains unchanged after checks (excluding installed `node_modules` and separate output/cache directories).

All checks run in pinned, disposable `--pull=never --platform=linux/amd64` containers. Source is read-only; only the owned work/output paths are writable. Run the exact `bun install --frozen-lockfile` once in an owned network-enabled disposable setup container. This is the sole network-enabled command. Tests, bundle, syntax compile, source-hash verification, and identity capture use `--network=none`. The lock and package manifests are hashed before and after install.

After dependency installation, execute exactly the workflow commands:

1. `bun test tests/core/cardinality-ideals.test.ts tests/core/nullability-ideals.test.ts tests/core/field-ideals.test.ts`
2. `bun build src/model/document.ts src/validation/document.ts --target=browser --outdir /work/output/umf-pr-fast`
3. `python3 -m compileall -q python scripts`, with `PYTHONPYCACHEPREFIX=/work/pycache` so bytecode stays outside the copied source.

The workflow asks for Python 3.12; the approved local fallback is Python 3.11.17, already present in the pinned image and identified as the actual syntax interpreter in every receipt and user-facing result. This result will be labeled a local Linux PR-fast equivalent with the Python-version limitation explicit, never as GitHub Actions or Python 3.12 evidence.

## Bounds, receipt, and cleanup

The driver will enforce the workflow's ten-minute job ceiling as one 600-second monotonic wall clock, including copy, dependency install, commands, verification, and receipt finalization; each child is also given a per-step cap and a 10-second TERM grace. Combined captured stdout/stderr is capped at 1 MiB; any timeout, truncation, nonzero exit, source-copy mutation, or cleanup uncertainty fails closed. It records command argv, exit code, elapsed time, bounded log paths/bytes/SHA-256, source manifest digest/size, runtime image digest/platform, observed Linux/Ubuntu/kernel/architecture, Bun/Python versions, lock hashes, browser output files/hashes, compile count, cleanup outcome, and the explicit Python 3.11.17 substitution. Docker containers use `--rm` and `--cidfile`; after each command the driver verifies that its own container ID is absent. No broad container cleanup is performed. The evidence folder remains under the unique `/private/tmp` run path for review.

Root and Sol reviewed and approved this bounded plan before candidate commands. The driver SHA is frozen before execution. The only Docker actions before the run were read-only image/volume inspection and a disposable read-only identity/path/hash/size probe against the source volume.
