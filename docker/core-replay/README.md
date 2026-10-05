# Core acceptance replay

Build from the repository root:

```sh
docker build -t umf-core-replay docker/core-replay
```

Use a disposable clone with its full Git history. The replay reads historical
command inventories from Git and writes generated evidence into that checkout.
Do not mount the working repository or host dependency directories as `/work`.

```sh
git clone --no-hardlinks /path/to/umf /tmp/umf-replay
cd /tmp/umf-replay
git checkout <source-commit>
docker run --name umf-core-replay-run --shm-size=1g \
  -v "$PWD:/work" -v /var/run/docker.sock:/var/run/docker.sock \
  -e UMF_REPLAY_IMAGE_ID="$(docker image inspect --format '{{.Id}}' umf-core-replay)" \
  umf-core-replay all
```

The entrypoint installs the frozen Bun dependencies, prepares the vendored Python
namespaces and Protobuf WASM compiler, runs the retained native/browser inventory,
auxiliary checks and disjoint regression shards, then publishes fingerprints and
runs all admission gates plus proof-integrity checks, then seals the semantic acceptance and final replay records. Failed regression shards receive one serial retry, preserving the failed logs and existing test limits. Other failures stop execution. Logs
and command hashes are written under `fixtures/validation/core-check-refresh/`.
Review and copy generated artifacts back to the source checkout after success.

Stages can also run individually: `prepare`, `native`, `auxiliary`, `regression`,
`publish`, `gates`, `seal`. Use `native --resume` or `regression --resume` to retain completed
runs and archive failed attempts. Resume only within the same checkout and source
revision. Publication requires successful logs; it cannot substitute for execution.

The image installs Bun 1.3.14, Go 1.27.1, protoc 36.2, uv 0.12.23, Playwright 1.63.0 with
Chromium 153.0.8010.12, Python 3.12 and OpenJDK 21. Ubuntu package patch versions
are recorded by the execution environment rather than claimed as immutable.
Python oracle versions are pinned in the requirements and Dockerfile; jsonschema
4.25.1 is the explicit TableSpec probe override. The Java path works on ARM64 and
AMD64. The Docker socket is used to launch the pinned disposable PostgreSQL and
SQL Server oracle containers; those scripts use `--network none`. SQL Server uses
AMD64 emulation on ARM64. The runner image needs network access during dependency
installation. Browser probes enforce their own zero-external-request controls.
