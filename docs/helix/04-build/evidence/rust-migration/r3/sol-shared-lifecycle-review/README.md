# Independent shared/lifecycle review

Verdict: **request changes**. This is the initial R3 shared resource,
canonicalization, table-inspector and deployment review, not final R3 approval.
The inspected TypeScript/Rust file hashes are in `review-source-sha256.json`.
Semantic ports under active implementation outside this scope are not reviewed.

`inputs.json` contains 13 independently selected deployment mutations;
`predecessor.json` captures the retained TypeScript results before fixes;
`frozen.json` binds each input to that unchanged expected result. The incremental
native driver matched **0 of 13**. `native.json` records the executable hash and
typed first differences; stdout, stderr and parsed actual results are retained.
This diagnostic binary comparison does not establish a clean built-source cohort.
Do not rewrite expected outputs to match fixes. Original baseline captures remain
unchanged; these are additional independently selected controls.

## Required fixes

1. **P1 — Meter the complete reached semantic closure.** TableCapabilities runs
   the private table/operation/policy/seed/unknown passes without Context. Many
   deployment inner SQL/literal/policy loops and clones similarly lack it.
   Introduce an invocation-scoped helper that meters before allocations/copies,
   diagnostics, source/path construction, comparisons and SQL emission and polls
   during loops. Trusted callbacks running without this helper do not supply
   cooperative cancellation. Preserve terminal provenance and budget refusal.
2. **P1 — Restore complete literal/native-capacity admission.** Rust native-column
   and seed passes omit `inspectStoredLiteral`/`ctx.literal`. Port logical literal
   validation, allowed/default/seed membership and facets, integer signed widths,
   decimal precision/scale, varchar scalar length, NUL and finite temporal rules.
   Reject generated-always seed overrides. Controls `sol_date_invalid`,
   `sol_timestamp_rounding`, `sol_integer_capacity`, `sol_varchar_capacity` all
   refuse in TypeScript and compiled in Rust. Add seed and allowedValues controls.
3. **P1 — Restore expression and operation admission.** Rust check inspection
   omits `inspectExpression`: nonboolean checks compile, field-scope/type/literal
   diagnostics disappear. Controls `sol_check_nonboolean` and
   `sol_check_foreign_field` freeze these differences. Operation inspection also
   lacks the separate operation-schema admission and merged-def unknown pass;
   the tables schema deliberately leaves commands open. Port the full current
   operations.ts path: read batch-object refusal, result/order uniqueness, page
   required ordering/projection and nonpage cursor checks, insertFrom source.where,
   generated/immutable assignments and upsert conflict/update-field checks.
   Object-valued field.extensions must not be checked with array_items.
4. **P1 — Preserve source-bound literal emission.** Rust SQL omits accepted
   CoreLiteral boolean, binaryHex and bits128Hex branches; timestamp emission
   omits exact UTC/microsecond normalization; numeric normalization narrows the
   exponent to i64 before the zero shortcut. `sol_boolean_default`,
   `sol_binary_default`, `sol_timestamp_default` and
   `sol_numeric_zero_huge_exponent` freeze accepted outputs/digests. Restore all
   source-pinned bytes and replay verifier/derived migration identities afterward.
5. **P1 — Restore unknowns, complexity and diagnostic sequencing.** TS inspects
   unknown content before declaration semantics, with root commands blanked only.
   Rust runs unknowns afterward, skips commands at any location and silently
   stops at depth64. `sol_unknown_nested_commands` freezes a silent acceptance.
   Share the original module-wide 4096 expression/rule node counter/depth16 and
   256 diagnostic cap plus final TABLES_DIAGNOSTIC_LIMIT; do not truncate silently.
   Add counter, cap, ordering, deep unknown and nested-command controls.
6. **P1 — Compare typed domains canonically.** TS domain equality canonicalizes
   facet objects; Rust compares raw insertion-ordered Value objects. Canonical
   typed equality must ignore object-key insertion order while retaining ordered
   arrays and exact carrier meaning. Logical/native defaults require
   literalIdentity, not raw spelling equality, and a logical default without a
   native literal must warn. `sol_logical_default_missing_native` freezes this;
   add equivalent exponent/default spellings and permuted nested facet keys.
7. **P1 — Restore complete FK and policy semantics.** FK inspection omits duplicate
   fields, external deployment dependency warning and original relationship
   endpoint/target-Key agreement. memberOf SQL sorts role values instead of sorted
   alias keys mapped to roles; use aliases `z: group_a, aa: group_z`. Preserve
   related/via audience SELECT checks and all current forward/reverse path cases.
8. **P1 — Preserve source capacity and first-error order.** Deployment must enforce
   4,000,000 UTF-8 source bytes independently of the core parser's UTF-16 ceiling.
   Restore source-hash admission before configuration validation. Non-null
   nonstring formats must refuse (`sol_format_number`); invalid group aliases,
   schema/principal collisions and source/config multi-fault precedence must
   preserve original codes/paths/messages. Recompile exact sources/configuration
   for all verifier paths and reject self-consistently rehashed tampering.

## Shared foundation disposition

The immutable explicit CodegenResources/borrowed CodegenEngine API remains sound
for thin bindings. Static compiler-owned Python templates remain approved by the
plan. Canonical UTF-16 threshold polling now fixes the previously reported odd
ASCII prefix plus astral-pair gap and includes direct loop controls. Public
canonical entry points perform core admission before private admitted helpers.

The small core EngineError control-origin extension is approved in this source
review: the flag is private, public wire fields remain unchanged, from_host
clears deferred-schema provenance and sets trusted control origin, native
cancel/clock failures set it, and both engine admission catch sites preserve it.
Code/message lookalikes cannot cause controlled errors to become invalid models.
Root reports eight resource and seven Context tests passing; this review does
not relabel those runs as new independently executed tests. Retain NUMBER,
VALUE_INVALID, LIMIT and parser/refusal lookalikes through installed bindings.

Re-review the changed closure and these immutable controls after fixes. Extend
with independent native/domain/unknown/complexity/resource cases, then capture a
coherent source-bound artifact cohort. A passing initial baseline alone cannot
close the missing accepted/refused branches identified above.
