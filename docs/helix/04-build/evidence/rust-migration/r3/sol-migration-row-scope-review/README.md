# Migration and row-scope independent review

Verdict: **request changes**. Initial baseline/supplement and native PostgreSQL
qualification prove their captured subsets, not the complete current TypeScript
closure. Eleven independently selected controls captured before fixes match
**0/11** in the incremental native binary. The fixture includes exact requests
and retained TypeScript expectations. The native receipt records an unchanged
binary hash and differences; this is diagnostic evidence, not a clean-source
artifact attestation. Inspected file hashes are recorded separately.

## Required corrections

1. **P1 — Share exact native SQL emission.** Migration's private native_type
   helper emits numeric(,) because precision/scale are Number values read using
   a string-only helper. varchar, timestamptz and bytea fall back to text. The
   four append controls freeze accepted exact SQL and hashes. Reuse metered
   deployment native type/literal helpers rather than maintaining this fork.
   default_literal similarly omits exact numeric/date/instant casts and
   normalization, UUID/binary cases, and changes text escaping. Backfill defaults
   must retain the TypeScript literalSql behavior for every accepted carrier.
2. **P1 — Preserve full row-scope validation and provenance.** Nonstring present
   owner_column values need ROW_SCOPE_OWNER; Rust treats them as absent. Four
   controls cover number/null/object/bool. Group command lists must call the
   same duplicate-checking parser as main command lists. Identical group grants
   require occurrence identity: Rust structurally equal tree matching maps both
   grants to each other's policy paths, while TS uses object identity. Controls
   freeze duplicate-command refusal and exact distinct sourceToOutput origins.
3. **P1 — Preserve raw UTF-16 identities.** row_scope text() replaces failed
   UTF-16-to-UTF8 conversions with empty strings in owner/group lookups and
   diagnostic pointer construction. The unknown-lone-surrogate control retains
   its exact source key and exact diagnostic path in TypeScript. Do not normalize
   diagnostic or lookup text; keep code units through pointer escaping. Apply
   the same discipline to host binding references and unknown members. The
   public raw source-copy refusal also needs DUPLICATE_KEY behavior reviewed
   against TS copyJson's catch-all model-admission refusal.
4. **P1 — Meter before all intermediate work.** Row normalization and helpers
   contain no charge_work, despite input-derived policy/source clones, origin
   maps, diagnostics, scans and recursive tree search. Its lifecycle stringify
   uses unmetered stringify_compact. Migration helpers similarly contain almost
   no direct charges before the final step loop; append helper ends `let _=ctx`.
   Raw tests that reject on the first admission callback do not establish
   mid-work controls. Add a regression that counts successful admit_json hooks,
   then refuses at the next hook during a large invalid row normalization; it
   must stop before diagnostic/policy construction completes. Add equivalent
   discovery/options/append/phase-loop controls and precharge clones/output.
5. **P1 — Finish current migration semantics and capacity.** Preserve reviewed
   drop-column/type-change/relax-not-null and dropped-column seed removal paths,
   complete review including IRREVERSIBLE_COLUMN_PURGE, and comment removal.
   The current old-seed precheck rejects changes before filtering reviewed
   dropped-column seed values, although TS explicitly permits that removal.
   Private SQL has no DROP COLUMN/type-change/DROP NOT NULL branches. Enforce
   8192 steps and 24,000,000 canonical-body bytes; neither limit is currently
   checked. Retain bounded phase seed IDs and source-order recovery barriers.
   Internal body digest/equality must use admitted canonical helpers after
   correct per-source admission; public canonical helpers reimpose the ordinary
   100k tree limit on composed previous/next/output trees.
6. **P1 — Preserve options/marker validation order and text units.** Backfill
   command.batch is an object, but Rust tests only Bool(true); TS any present
   batch refuses. TS validates reviewed markers then validations before
   backfills/concurrent selections; Rust reverses this. Marker conversion is
   bounded in UTF-16 units, not UTF-8 bytes. Retain malformed marker identity/
   digest refusal before candidate mismatch and exact source-bound comparisons.
7. **P1 — Finish query-domain inspector parity.** Shared table query output
   inspection currently requires a Field mapped by a table. TS inspectQuery
   admits any exact current-module core Field as a query input/output domain;
   it additionally applies ctx.field shape checks and extension/semantic warnings.
   Add an accepted standalone local query output Field and forbidden foreign/
   unknown-meaning counterparts. Existing table-mapped fixtures hide this branch.

These are source-completeness requirements; narrow supported inputs must not be
introduced to make the new implementation pass. Keep native PostgreSQL/Weft
support qualified to the exact executed source/driver/compiler subset. Re-run
native affected paths after SQL corrections. Shared table/deployment earlier
fixes and host admission controls remain separately qualified by their own
records; this round does not supersede unreviewed stage-one generation work.

No semantic implementation was edited. Retain all earlier and new expectations
unchanged; re-review changed closure and affected consumers after corrections.
