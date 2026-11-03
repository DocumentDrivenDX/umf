# Access runtime identity reconciliation — 2026-11-02

The main package declared `0.1.0.dev8` while its runtime identity advertised
`0.1.0.dev0`. The preserved identity branch fixes the mismatch through one inert
`_version.py` authority shared by Hatch metadata and the runtime ABI tuple.
This integration retains its contributor history and `dev9` candidate version,
current Core dependency and newer Rust facades. It reconciles the Python module
ownership map and strict nullable guards in the generated-fixture tool.

[The receipt](receipt.json) records a fresh actual wheel installation on Mac
CPython 3.11.17, exact verification of 129 wheel members, matching metadata/runtime
identity, 19 passing packaging/read-admission controls and 125 module boundaries
with no violations. The 13 PostgreSQL cases are unrun; this is not database or
native-target qualification. TypeScript checks pass.

The dedicated Actions job repeats actual wheel build/install/identity controls
on Linux. It publishes no registry package. Older Linux311/G03 proof inputs remain
historical: their source and dependency cohort differs from this integrated
Core-dependent closure, so no acceptance is transferred. The package remains a
local prerelease with target qualification pending.
