# Exact installed runtime snapshot

This wheel and interpreter are frozen to the source manifest in this directory.
Local version 0.1.0.dev0 is not a published release or native support claim.

Interpreter: `/private/tmp/umf-access-installed-e4c780c7bfa9b268/bin/python`

The snapshot wheel SHA256 is e4c780c7bfa9b2686c2e6f84da30eff7ad3fdbe324cb601b383481f580153899.
`snapshot.json` provides exact absolute wheel, interpreter, generated-manifest,
checker-interpreter and source-manifest paths. `installation-commands.json`
retains environment creation, exact offline installation and isolated byte/ABI
import verification. `source-manifest.json` records the captured build source;
its matchesCurrentCheckout values were observations at snapshot creation only.
Later source edits require a new wheel, not mutation of this environment.

All 50 frozen DSL/capture/render tests pass against the installed wheel. Run:

```
/private/tmp/umf-access-installed-e4c780c7bfa9b268/bin/python -I -B -m unittest discover -s SNAPSHOT_DIRECTORY/test-sources
```

Replace SNAPSHOT_DIRECTORY with this exact directory. `-I` excludes development
PYTHONPATH and cwd module resolution. Tests import the installed package and do
not insert a source checkout. Frozen test-file hashes and actual command outcomes
are in installed-checks.json. This does not close STP-081/082 or qualify native
execution. The actual-generated minimal Order fixture passes mypy; strict
pyright retains six emitter diagnostics in generated-pyright.stdout. No internal
runtime ActionRef interface mismatch remains in these 50 tests. The older f2d45059
snapshot retains its real id/action mismatch and failing result.
