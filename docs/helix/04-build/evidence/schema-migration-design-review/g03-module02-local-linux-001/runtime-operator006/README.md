# Local inherited truss runtime regression

Derives from reviewed operator005 with unchanged exact source, builder/toolchain,
locked provisioning, network detachment, limits and owned cleanup. It replaces
only the core/PostgreSQL test command with the exact existing truss-facts.yml
weft-runtime feature command, and sets CARGO_PROFILE_TEST_OPT_LEVEL=1 as that
workflow does. Full exact features are retained in run.py. No database/backend
service or wheel build is added. This is a new local bounded command profile,
not a claim that hosted CI ran or that all workflow stages are covered.

Limits remain 3600 aggregate/1800 test/600 setup/60 terminal reserve/10 grace,
4CPUs/8GiB/8192PIDs,1MiB logs/16MiB metadata. Source/operator mounts RO;
only owned resources removed. No GitHub Actions or macOS CI. Browser/installed,
workspace candidate/qualified conformance and final platforms remain separate.
Maturin provisioning remains unchanged but unused; it is not a target dependency.
