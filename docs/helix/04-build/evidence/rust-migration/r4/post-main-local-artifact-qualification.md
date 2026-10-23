---
ddx:
  id: umf.evidence.rust-migration.r4-post-main-local-artifact-qualification
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r4-delivery
      kind: references
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
---

# Post-main local R4 artifact supplement

This is additive installed-artifact evidence for the historical R4 wheels on
one macOS 27.0.1 arm64 host. It does not qualify the hosted matrix or bind these
artifacts to the current checkout's source closure.

## Source and artifact identity

The checkout HEAD was `7832e4e7f0699173c265a9eabb41207f09dcb072`. The working
tree contained in-progress R5/native changes. The codegen resource manifest at
this commit and in the extracted codegen sdist had SHA-256
`5f3f40addd8a611a681e99f7856075ab4bd5cd798eaf09a9036ba97cb1bbf214`. Later
resource or source changes are outside this capture.

The exact installed artifacts were the existing R4 cohort:

| Artifact | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `804a526259dfd3e111ffbcc4b33ad4f0ca778a5fc62941f2dc950f7842d34e0c` |
| `umf_codegen-0.2.0-py3-none-any.whl` | `260cd1855f70a0b1a686363e2fd996184205ffad9d7bef2580751d43c8de300c` |
| `umf_core-0.11.0.tar.gz` | `bb9f3efb10c75f2be7eaa0bf41f8a50d8f6aec8875497be2f0f361ff67f11e22` |
| `umf_codegen-0.2.0.tar.gz` | `eb4388161d94daeefb53c4ec0e7bf313269345d615afa776653d427ecfbd2a49` |

Filesystem timestamps place the sdists around 09:14 and wheels around 09:15
local host time on 2026-10-23. The prior R4 packet records its captured
relevant-source closure hash as
`3409f8aaed558d3af4d783922e96550455887e8a83f7e38bb31fc47bed38ee72`,
while explicitly not claiming it as the exact source digest used to build the
wheels. These wheel and sdist hashes likewise identify artifacts, not a fresh
source-to-wheel binding for commit `7832e4e7` or the dirty working tree.

The core wheel has 30 members, one Mach-O extension (`umf/_rust_core.abi3.so`)
and no JavaScript assets. The codegen wheel has 24 members, no native binaries,
and no JavaScript assets. Its metadata requires exactly `umf-core==0.11.0` and
declares no MiniRacer or V8 dependency. Each clean venv contained seven
distributions; `uv pip check` passed for both.

The 496-member core sdist contains Rust Node/WASM adapter source files ending
in `.js`; these are binding sources, not a Python generator payload or runtime
dependency. The 25-member codegen sdist contains no JavaScript payload files.

`otool -L` and `otool -l` were checked on the installed extension and bundled
CLI. The extension's absolute `/private/tmp/umf-r4-final-core-target/release/deps/lib_rust_core.dylib`
string is `LC_ID_DYLIB`, its own install identity; it is not an `LC_LOAD_DYLIB`.
The extension's only load commands are `/usr/lib/libiconv.2.dylib` and
`/usr/lib/libSystem.B.dylib`. The CLI loads only `/usr/lib/libSystem.B.dylib`.
With `DYLD_ROOT_PATH=/private/tmp/umf-r4-isolated-root`, imports and native
protocol smoke checks passed on both Python versions, without the recorded
build-target directory being available through that dyld root. The absolute
install identity leaks a build path and should be normalized in a future build;
it is not evidence of a runtime dependency on that path.

## Local installed runs

Host interpreters were CPython 3.11.17 and 3.14.8. Both clean venvs were
installed offline from the recorded wheel files plus the local dependency
wheelhouse at `/private/tmp/umf-embedder-dependency-wheelhouse`. The core wheel
uses the `cp311-abi3` tag and loaded on both interpreters.

The venvs were created and populated with these commands (using the matching
interpreter and venv path for each version):

```sh
UV_CACHE_DIR=/private/tmp/umf-r4-post-main-uv-cache uv venv --python python3.11 /private/tmp/umf-r4-post-main-py311
UV_CACHE_DIR=/private/tmp/umf-r4-post-main-uv-cache uv pip install \
  --python /private/tmp/umf-r4-post-main-py311/bin/python --no-index \
  --find-links /private/tmp/umf-embedder-dependency-wheelhouse pydantic==2.14.1 \
  /private/tmp/umf-r4-final-core-dist/umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl \
  /private/tmp/umf-r4-final-codegen-dist/umf_codegen-0.2.0-py3-none-any.whl
```

The same commands were run with `python3.14` and
`/private/tmp/umf-r4-post-main-py314`. Each venv then ran the 15-test unittest
suite and these installed probes; the environment used `PATH` equal to that
venv's `bin` directory:

```sh
python -I -m unittest discover -s python/umf_codegen/tests -v
python -I tests/codegen/row_scope_probe.py --corpus /private/tmp/umf-r4-row-scope-corpus.json
python -I tests/codegen/installed_probe.py --corpus /private/tmp/umf-r4-codegen-corpus.json --report /private/tmp/umf-r4-post-main-py311-codegen.json
python -I tests/codegen/deployment_probe.py --corpus /private/tmp/umf-r4-deployment-corpus.json --report /private/tmp/umf-r4-post-main-py311-deployment.json
python -I tests/codegen/migration_probe.py --corpus /private/tmp/umf-r4-migration-corpus.json --report /private/tmp/umf-r4-post-main-py311-migration.json
python -I tests/codegen/reviewed_changes_probe.py --corpus /private/tmp/umf-r4-reviewed-changes-corpus.json
```

The `py311` report filenames were replaced by `py314` for the second run. The
row-scope and reviewed-change outputs were redirected to
`/private/tmp/umf-r4-post-main-py311-row-scope.json`,
`/private/tmp/umf-r4-post-main-py311-reviewed-changes.json` and the matching
`py314` files.

For each version, the following passed with a clean environment and `PATH`
limited to that venv's `bin` directory:

- 15 `umf_codegen` unit tests;
- installed generator parity and writer/integrity controls: 30 cases;
- installed row-scope parity: 6 cases;
- deployment compilation/refusal parity: 15 cases and 30 tamper controls;
- migration compilation/refusal parity: 17 cases, 99 tamper controls and 4 deadline controls;
- reviewed-change parity: 3 cases and 8 malformed/forged refusals.

The installed probes reported 64, 102, 250 and 22 bundled native CLI launches
for generator, deployment, migration and reviewed-change probes respectively.
They forbid external JavaScript processes and executable lookup. The checks
therefore exercise Python wrapper-to-CLI dispatch and its generate/check
behavior without Node, Bun or V8 on PATH. Probe reports and unit logs from this
run were written under `/private/tmp/umf-r4-post-main-py311-*` and
`/private/tmp/umf-r4-post-main-py314-*`.

The core import, `copy_json`, protocol-version and `Document.checked_copy()`
smoke passed on CPython 3.11.17. On 3.14.8, import, `copy_json` and protocol
version passed, while `Document.model_validate()` refused with
`Python re profile 3.14 is unavailable`. That explicit refusal limits core
behavior on 3.14; the passing codegen probes do not qualify the unavailable
core regex profile. A fresh full core Python pytest suite was not run: pytest
was absent from the host interpreters and available offline wheelhouse. The
historical 206-test receipt remains in the original R4 packet and was not
repeated by this supplement.

## Offline sdist rebuild attempt and remaining gates

The local wheelhouse and installed host Python environments had no Hatchling
1.27 build backend. This command failed before source compilation, with the
offline resolver reporting that Hatchling was unavailable:

```sh
UV_CACHE_DIR=/private/tmp/umf-r4-post-main-uv-cache UV_OFFLINE=1 \
  uv build --wheel \
  /private/tmp/umf-r4-final-core-dist/umf_core-0.11.0.tar.gz \
  --out-dir /private/tmp/umf-r4-post-main-build-core311
UV_CACHE_DIR=/private/tmp/umf-r4-post-main-uv-cache UV_OFFLINE=1 \
  uv build --wheel \
  /private/tmp/umf-r4-codegen-wheel/umf_codegen-0.2.0.tar.gz \
  --out-dir /private/tmp/umf-r4-post-main-build-codegen311
```

Both builds failed during build-requirement resolution: the core build lacked
`hatchling>=1.27,<2`, and the codegen build lacked `hatchling==1.27.0`. No
network workaround was used. The existing extracted core and codegen sdists
were audited, but this turn did not rebuild fresh wheels from them. Therefore
fresh offline extracted-sdist rebuild qualification remains open. The separate
R4 historical receipt remains scoped to its captured artifact/source cohort;
the in-progress source changes require a source-bound rebuild and recapture
before claiming the current cohort. No hosted CI matrix is claimed here.
