# Core replay image (unfinished)

Goal: run the native/browser replay from `docs/helix/04-build/evidence/core-check-repair.md`
in a reproducible pinned container (Ubuntu 24.04, Bun 1.3.14, Python 3.12, OpenJDK 21,
Go 1.27.1, flatc 23.5.26, Playwright 1.63.0 Chromium, Docker CLI for sibling oracle containers).

Status: **not working yet, nothing here has been run to completion.**
- Image build gets through apt, Bun, Go, Docker CLI and the Python venv, then fails at the
  Playwright step: `bunx: not found`. Bun's installer here does not create the `bunx` link; use
  `bun x playwright@1.63.0 install --with-deps chromium` or symlink `bunx` to `bun`.
- `oracle-requirements.txt` and `shacl-requirements.txt` are copies of `scripts/oracle-requirements.txt`
  and `native/shacl/requirements.txt` (Docker build context). Note `oracle-requirements.txt` pins
  jsonschema 4.26.0 while the repair evidence says 4.25.1 for the TableSpec probes; the Dockerfile
  installs 4.25.1 last. Confirm which the native scripts expect.
- The `JAVA_HOME` path and the symlink step assume arm64; check on amd64.
- Not yet decided: how to run the replay. Suggested: clone the committed repo inside the
  container (so evidence reflects committed code), mount the host Docker socket for the
  PostgreSQL 17.4 / SQL Server 2022 sibling containers (SQL Server is amd64 under emulation on
  Apple silicon), run the steps listed in `core-check-repair.md`, then copy `fixtures/` and `docs/`
  changes back out.
- The replay does not need `.venv/bin/python` on the host; scripts hardcode `.venv/bin/python`,
  so symlink `/work/.venv` to `/opt/venv` inside the container.

Nothing from this has been recorded in the acceptance evidence; the acceptance record still states
that the native replay and retained gates were not re-run.
