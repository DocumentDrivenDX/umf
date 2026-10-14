# Shared exact instant helper — 2026-10-14

CONTRACT-065 defines the explicitly selected `umf-rfc3339-exact-instant/1.0.0`
operation. The public `src/index.ts` exports its pure parser, equality helper,
result type and profile/token-bound constants. Existing core versions, temporal
facets and temporal Key semantics remain unchanged.

Basic evidence on Bun1.4.2: five tests with25 assertions pass, including offset
equivalence, a difference after microseconds, a pre-epoch fractional instant,
unknown local offset retention, leap-year/calendar refusal and exact year-boundary
normalization. A bounded long fraction checks retention, including a zero run
ending in a nonzero digit. There is no performance or broad conformance claim.

`bun node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict
--noUncheckedIndexedAccess --target ES2022 --module ESNext --moduleResolution
bundler src/adapters/rfc3339-exact-instant.ts` passes for the helper.
`bun scripts/rfc3339-exact-instant-browser.ts` builds the actual public entry
point and passes11 checks in Chromium153.0.8010.12. Browser code needs no Bun,
Node, host clock or datetime globals. The first sandboxed local-server attempt
could not listen; the authorized local-browser run passed.

Astra Ultra approved the separate operation profile and identified a finite
backtracking risk in regex fraction trimming. The implementation now uses a
backward index scan and one slice; the final basic checks above pass after that
correction. Truss/Weft native equality and Ashlar adapter adoption are subsequent
deliverables. This does not claim released consumer query support.
