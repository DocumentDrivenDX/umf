# Roadmap

Open work, one line each. Items are intent, not commitments; nothing here is claimed to work until a test in CI
exercises it.

## Tests and CI

- Triage `scripts/known-failures.txt`: each entry is a failing Bun test with a reason; fix the behaviour or the
  test and remove the line.
- Bring the 191 files in `scripts/slow-tests.txt` (WASM package, `protoc`, owned PostgreSQL fixture, long
  conformance suites) into the nightly job and keep that job green.
- Run the `umf-access` suites that need generated client packages, a pgserver profile, or the downstream `weft`
  package (see `python/umf_access/tests/conftest.py`).
- Fix the Rust `rdf_parity` blank-node numbering case that is excluded from nextest.
- Shorten the Bun shards below 15 minutes.

## Release and packaging

- Tag `umf-v0.10.12` after the owner configures PyPI trusted publishers (see AGENTS.md).
- Consider npm publication for `@umf/core` (today a release tarball) and crates.io for the Rust crates.
- Drop the compiler digest from generated headers so documentation and Cargo edits stop changing generated files.

## Product

- Rust parity and retirement of the remaining TypeScript compatibility paths (`docs/helix/04-build/rust-migration-plan.md`).
- Schema migrations: field additions, requiredness, defaults, backfill, removals and type changes
  (`docs/helix/02-design/solution-designs/SD-007-schema-migrations.md`).
- Saga and Actions: native execution conformance stays with the consumers; the vocabularies and assessment are here
  (`docs/helix/05-deploy/sagas.md`).
- Domain packs and the Pack Tools generator: more pack inputs and targets (`docs/helix/01-frame/domain-pack-roadmap.md`).
- Praxis lifecycle asks (`docs/helix/01-frame/praxis-lifecycle-roadmap.md`).
