# Complete core and PostgreSQL local Linux test gate

This operator derives from accepted operator004 on exactly its unchanged source
fingerprints. The sole execution delta is restoring the original full command
`cargo test --locked --offline -p weft-core -p weft-postgresql`, then omitting the
wheel build. Attempt002 failed its query fixture; scoped004 passed all27 integration
tests and produced a separately reviewed held wheel. This new run must complete
the full command; prior partial passing counts do not substitute for it.

All runtime, source, locked provisioning, network detachment, bounds, cleanup
and before/after source checks remain as004: pinned Linux amd64 image1f983,
installed Rust1.90.0,4CPUs/8GiB,3600total/1800test/60reserve/10grace,
1MiB logs/16MiB evidence. Existing hash-pinned Maturin provisioning is retained
unchanged for operator continuity, although no build uses it. No new wheel,
GitHub Actions, macOS CI, database, push or publication occurs. Installed probes,
full G03 campaign, broader workspace/platform/browser and release gates remain
separate. Source inputs are read-only; only owned volumes/container are removed.
