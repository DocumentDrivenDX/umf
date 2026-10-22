# Current generator compilation suite — 2026-10-17

Temporal qualification remains **HELD**. Bun1.4.2 executes all875 compilation
suite tests across17 files, with4965 assertions and zero failures (r2,52.36s).
Source/test commit is `20c13c607fd3f76929d1ab088c7473d677193fc6`.
The complete test inputs and access fixtures are retained; shared source/spec
fingerprints are in the separately retained current browser packet. This is a
generator/component suite, not native backend, temporal or deployment acceptance.

Coverage includes census, selected unknown-meaning refusals in both modes,
complete allow-table controls, deterministic bytes and digests, naming/literals,
raw ColumnSets, search metadata, joins/projections, original directed Keys,
golden Core oracles, drift and transactional host-writer fault/recovery cases.
A passing Core temporal oracle here does not qualify Typed SDK temporal codecs.

R1 records873 passing tests and two stale assertions expecting pre-navigation
Join descriptors. The implementation already emits source/target selected Keys,
the relationship Key and the original inverse Key; static and native evidence
qualify that new behavior separately. The test correction now requires the exact
six-slot Optional/RequiredNavigation signature and original inverse-Key target,
while retaining multiplicity and nullable-projection checks. Three focused tests
pass with17 assertions, followed by the complete875-test passing rerun. No
production generator behavior or timeout was changed to make the suite pass.

R1 elapsed53.50s; elapsed times are test observations, not performance claims.
`inventory.json` hashes all files except itself. Final installed value matrix,
refactor regeneration and release checks remain separate evidence.
