# Reviewed current-core corrections

These corrections are explicit deltas from the frozen original observations.
They do not rewrite `baseline/` or `baseline-current/`. Root reviewed the
initial generated implementation against all139 current cases before accepting
C002: zero ordered diagnostic differences or exceptions, with real Registry and
structural admission. See `initial-parity/receipt.json` for the scoped proof.
Final corrected TS/Python/browser and consumer qualification remains required.

## C001 — Current UUID literal entry point

Original direct `checkSchemaLiteral` rejects UUID/bits128 unless the document
marker is exactly0.9, although core0.10 declares these domains and whole-document
validation accepts them through a private0.9 view. The model's current domain
policy must make intrinsic UUID/bits128 mechanics available directly for0.10;
remove the historical guard and private-view dependency. Preserve exact codecs,
facets, unknown-content refusal and literal equality.

Before vector: `domains/uuid-literal-version-boundary` in both frozen corpora
records direct rejection, private inherited acceptance and whole-document
acceptance for the same current UUID meaning. After: direct current literal
accepts; current whole-document acceptance remains unchanged. Historical envelope
markers still reject at current document admission; this is not legacy support.
Review: Root and Sol,2026-10-18, current declaration/entry-point consistency.

## C002 — Completeness describes interpreted meaning

Original core0.10 emits `EXPERIMENTAL_CORE_SEMANTIC_TYPES` unconditionally. Because
complete requires no diagnostics, even an otherwise fully understood Document
without semantic references is always incomplete. Migrating existing security
and compiler consumers to current core would permanently block their strict
`complete` guards. A maturity label does not identify unchecked document meaning.

Remove only the unconditional maturity emit from authored model data. Preserve
strict consumer completeness checks and every actual external-reference,
unknown-property, unknown-label, missing-registration and competing-meaning
warning. A simple valid understood current Document becomes complete. A Document
with unresolved semantic references or unknown content remains incomplete.
Before/after vectors must compare all139 cases: remove precisely this diagnostic
and recompute complete from the remaining diagnostics; valid is unchanged.
Review: Root proposed, Sol concurred,2026-10-18. No consumer gate is weakened.

## C003 — Current property/default operations

Original `resolveCoreDefault` and related authoring entry points are restricted
to earlier envelopes even though current whole-document validation understands
the same schema properties. Migrate useful APIs to current core and generated
domain policy rather than hiding them from the workbench. Preserve explicit
missing versus present-null state, on-policy behavior, copied values, supplied
Field constraints, unknown semantics refusal and resource metering. The frozen
`defaults/*` vectors preserve original current-entry refusal. Qualify corrected
results separately; do not relabel old default observations as current success.
Review: requested current-consumer migration under US-089-AC21; final explicit
before/after default vectors remain required before completion.

C001/C003 supplemental qualification: `api-corrections/receipt.json` records
20 exact original-snapshot/current observations, including all default policy
and missing/null/value states, absent declaration, supplied allowed-values,
unknown qualifiers, copy custody, UUID/bits128 rejection/acceptance, and unchanged
bounded JSON admission. `current-api-corrections.test.ts` asserts these outcomes
(21 tests,123 assertions). Original source hashes and both outcomes remain
separate; the captured current result does not overwrite frozen baseline data.
