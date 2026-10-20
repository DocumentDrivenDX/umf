# Forward index and declared-operation evolution

This unpublished component extends the approved source-bound migration compiler
to append ordinary btree indexes and advance declared-operation generations
without DDL. Existing columns, constraints, policies and indexes stay exact.

Native PostgreSQL18.6 passes122 assertions: existing administrative ledger
controls plus retained rows, index rollback/replay, unique-index duplicate
failure, source-only command revision/retirement, durable history and stale
person/batch references. The installed SDK wheel is the verified main-integration
candidate; its executable sources are unchanged in this component.

The embedded original compiler matches17 complete cases with88 tamper and4
deadline controls while external JavaScript, process discovery and networking
are forbidden. Actual Chromium passes54 assertions. TypeScript and package
Ruff checks,12 portable tests/75 assertions and ownership checks pass. The legacy
native test script has five pre-existing standalone Ruff findings outside the
package lint scope; no package lint rule is disabled.

[Exact source/artifact receipt](receipt.json), [native run](native.json),
[embedded run](embedded-python.json), [Chromium run](browser.json).

Seeds, broader evolution/adoption, resource consolidation, final private Praxis
and managed acceptance and immutable release publication remain open. This
packet establishes no full lifecycle release or performance readiness.
