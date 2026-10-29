# Full14 operator source proposal

This is a source-only, **PREPARED_NOT_EXECUTED** adapter proposal for the bounded local Linux G03 Full14 campaign. It has not run Docker, the candidate, tests, CI, or a release workflow. Do not treat it as evidence of a campaign result.

`run_operator.py` is the host-side CLI. `full14_guest.py` provides separate exact-lock setup and source-owned campaign phases. `snapshot_runner.py` runs the sealed installed-cohort snapshot only inside the exact-lock virtualenv after wheel-member verification; the base-Python guest parses and compares its bounded canonical JSON output without importing the campaign runner. `scenario_child.py` invokes one already-sealed source scenario per process. `verify_installed_weft.py` compares the installed Weft package members and distribution version to the exact selected immutable wheel. `PLAN.md` defines the clocks, custody, packet contract, and truthful status.

The source seal and final wheel/cohort are not hardcoded. Before any run, a separate reviewed packet must name their actual immutable roots and hashes, exact client and PostgreSQL image digests/platforms, fixture digest, installed snapshot and PostgreSQL runtime. The candidate package is installed only from the selected aggregate's existing hash-locked offline mirror; no resolver update, acquisition retry, source build, or lock mutation is performed here.

Sealed source rows use the exact four-field schema `{path, sizeBytes, sha256, sourcePath}`. The absolute `sourcePath` is retained as provenance only; validators hash the mounted seal at its reviewed root and never dereference that provenance path.

To invoke after separate source review and explicit root execution authorization:

```sh
G03_FULL14_EXECUTE=1 python3 /private/tmp/g03-full14-bounded-operator-007/run_operator.py \
  --inputs /absolute/path/to/frozen-full14-inputs.json \
  --inputs-sha256 <packet-sha256>
```

The default output directory is `/private/tmp/g03-full14-bounded-operator-007-output`; the CLI refuses any alternate output root so only that dedicated directory is bind-mounted writable. Each run gets a new UUID subdirectory. The frozen input packet remains an external immutable input; the guest reads its byte-identical copy at `/input-packet.json`, mounted read-only as a sibling to `/operator`.


Operator006 is preserved as a failed setup attempt: its locked install, pip check and physical wheel-member comparison passed, then the base-Python parent imported the campaign runner without installed `psycopg`. Operator007 replaces only that setup snapshot operation with the byte-pinned helper at `/operator/snapshot_runner.py`, invoked as `/venv/bin/python -I` after wheel-member verification. The helper writes a canonical bounded snapshot and emits a closed receipt captured through the existing setup command/log budget. The parent validates the physical snapshot bytes and compares the parsed value/digest with the unchanged packet. The campaign phase already runs under `/venv/bin/python` and is unchanged.
