# PostgreSQL facet discovery checkpoint

## Scope

2026-09-22. PostgreSQL 17.4 with UTF8, using the existing pinned catalog
image/query and a new native fixture. This checkpoint establishes native
counterexamples and an internal browser-compatible type-modifier decoder. It does
not qualify core facet classification, authored projection or native equivalence.

`fixtures/postgresql/facets.sql` covers signed integer carriers and narrow CHECKs,
constrained/unconstrained numerics, negative and over-precision scales, finite and
exact-value checks, varchar/char/bpchar, text and byte-length checks, floats,
domains, arrays, unvalidated constraints and native declaration limits.
The native oracle executes 74 cases, including 32 expected rejections, and captures
28 columns with their original modifiers, constraints and schema reconstruction.
Both JSON/YAML envelope forms recover the canonical native catalog tree. Exact
original capture whitespace is not claimed by this discovery operation.

## Findings

- `numeric(2,-3)` stores a signed scale of -3, but the captured 17.4
  information_schema value is 2045. The internal decoder uses the signed modifier
  layout; it does not copy that field into core.
- `numeric(5,2)` accepts NaN and rounds 1.235 to 1.24. A finite CHECK rejects NaN
  but still permits rounding. Unconstrained numeric plus finite bounds and a
  truncation-equality CHECK rejects 1.235 while preserving the value 1.2300.
- A NOT VALID finite CHECK leaves an old NaN readable but rejects a new one.
- Varchar truncates excess trailing spaces and explicit casts can truncate other
  over-length input. Char padding and trailing-space equality remain distinct.
  Text length checks reject over-length spaces and can express zero length.
- Character types reject NUL; bounded bytea accepts NUL bytes. Supplementary
  Unicode and combining sequences exercise native character counts.
- Integer range checks, float narrowing, array element rounding and domain
  constraints stay independent of native carrier names.

The decoder follows PostgreSQL's pinned
[numeric modifier implementation, REL_17_4](https://raw.githubusercontent.com/postgres/postgres/REL_17_4/src/backend/utils/adt/numeric.c)
for signed scale. It retains every original type metadata member, refuses unsafe
integer tokens and reserved layouts, and leaves domains/arrays unsupported.
Declared native limits are not core assertions or physical capacity guarantees.
The earlier [research note](../../00-discover/postgresql-facet-research.md)
provides the bounded source review; runtime results are in
`fixtures/validation/facets-postgresql-discovery-native.json`.

## Evidence

- Bun: 4 tests, 94 assertions, zero failures.
- Chromium 148: 28 native type cases, 26 observed and two unsupported; two catalog
  recoveries, unsafe modifier refusal, no getter execution, no external requests
  or host globals. The decoder is compiled separately; this is not a new public
  facet API. Browser evidence records both bundle fingerprints.
- Type checks passed. The public UMF bundle is unchanged from the prior TableSpec
  acceptance build; native predicate classification and authored projection remain
  unfinished. No prior acceptance proof is silently rebound to these new files.

## Implications

Implement source-bound core classification and authored projection under TD-043.
Qualify predicate meaning and stored/write-input scope before inferring facets;
retain unsupported scales, NUL restrictions and unknown constraints as residuals.

## Predicate syntax checkpoint

The internal `facet-predicate.ts` inspector recognizes closed PostgreSQL parser
AST forms for numeric bounds, character/octet length limits and truncation-equality
scale checks. Numeric literal strings remain exact, including bounds beyond the
JavaScript safe-integer range. The complete copied AST remains attached. Unknown
syntax rejects the entire expression; recognized conjuncts are not extracted from
an otherwise unsupported CHECK. Tests cover custom-function/operator names,
casts, additional query clauses, aggregates/windows, unknown AST members and
accessors. The inspector is not exported from the public library.

These are syntax candidates only. Every result explicitly requires catalog
resolution and enforcement evidence. A name such as `trunc` does not prove which
function PostgreSQL resolved, and a parsed expression does not establish CHECK
validation or stored/write-input scope. The catalog supplement and those semantic
checks remain unfinished; no core facets or enforcement claims are produced.

The combined discovery/predicate Bun run passes seven tests and 201 assertions;
typechecking passes. Chromium 148 passes twelve syntax-inspection cases (six
candidates and six refusals), preserves the ASTs and invokes no getters. No host
globals or external requests are used. SQL parsing occurs in the host with
`@libpg-query/parser@17.6.10`; this browser check qualifies inspection of supplied
ASTs, not browser SQL parsing. Source fingerprints, logs and the browser corpus
are recorded in
[the predicate checkpoint](../../../../fixtures/validation/facets-postgresql-predicate-evidence.json).
No new PostgreSQL engine run or full binding acceptance is claimed here.

## Resolved constraint discovery checkpoint

A separate repeatable-read, read-only capture now records PostgreSQL 17.4 CHECK
expressions with `search_path=pg_catalog`, their raw analyzed node trees,
referenced column numbers/types, validation/inheritance state and function/operator
OID lookups. It leaves the existing general catalog query unchanged. This is an
internal discovery supplement, not an accepted extension package or classifier.

The isolated native run captures twelve constraints. Eight deparsed expressions
produce syntax candidates; four custom or multi-column expressions are refused.
Custom functions named `char_length` and `trunc`, and a custom `<=` operator,
accept over-length text, excess decimal scale and an out-of-range value. Their
qualified identities differ from the built-ins despite similar names. The capture
also retains the unvalidated CHECK and its pre-existing NaN row.

The OID lookup extraction supplies catalog observations only. It does not validate
the complete analyzed node-tree structure, prove correspondence with a separate
capture, or authorize core facets. Those checks and stored/write-input scope
qualification remain required before classification. Domain constraints remain
outside this table-CHECK supplement and retain their earlier native evidence.

Nine Bun tests with 288 assertions pass, including the discovery and syntax
regressions; typechecking passes. Native value probes record both expected and
observed results. JSON/YAML serialization preserves the complete supplement.
This checkpoint adds no browser-library changes or browser qualification claim.
See [resolved constraint evidence](../../../../fixtures/validation/facets-postgresql-constraints-evidence.json).

## Analyzed-expression verification checkpoint

The internal resolved-predicate inspector now reads the complete analyzed CHECK
node tree for the observed PostgreSQL 17.4 subset. It checks every node field,
column reference, operator/function signature and constant, refusing unknown
nodes, extra conjuncts, duplicate lookup identities and inconsistent resolution.
It supports the observed signed-smallint range, numeric range/scale and text/bytea
length predicates. It does not generalize unobserved OIDs or arbitrary SQL.

The bounded constant decoder uses an explicit little-endian, 64-bit Datum profile.
A fresh native probe confirms that representation with an int8 anchor, then checks
thirteen constants: ten finite values decode exactly and three special values are
refused. The corpus includes both int64 limits, negative values, long-format
numeric headers and decimal values beyond JavaScript precision. Numeric layout
follows the pinned [PostgreSQL REL_17_4 implementation](https://raw.githubusercontent.com/postgres/postgres/REL_17_4/src/backend/utils/adt/numeric.c).
No host endianness or JavaScript floating-point conversion determines the value.
Unsupported datum formats and resource limits produce refusal.

Verified predicates describe non-null values only. Validated local table checks
have stored/new-value scope; unvalidated checks have new-value scope. Input
conversion is separate, and neither result asserts a core facet. The verifier
still requires correspondence with the retained schema capture and projection
scope checks. Source consistency does not establish authenticity. Domain,
partition/inheritance and broader native expression behavior remain outside this
internal subset. The public library exports remain unchanged.

Validation: fourteen Bun tests, 411 assertions, zero failures; typechecking passes.
Chromium 148 verifies sixteen predicate cases (eight accepted/eight refused) and
all thirteen native constant cases, with no getter calls, host globals or external
requests. See [the verification record](../../../../fixtures/validation/facets-postgresql-resolved-evidence.json).
This advances internal predicate qualification; the public PostgreSQL facet
classifier, authored projection, package schemas and full binding acceptance
remain required. Earlier checkpoint fingerprints qualify their recorded snapshots.

## Catalog correspondence checkpoint

The internal facet supplement now has a Draft 2020-12 JSON Schema and an
exact-token reader. Known integer fields reject rounding; unknown properties,
including numbers beyond JavaScript precision, stay in the original supplement
text and tagged tree. Interpreted convenience views contain only owned fields.

The correspondence operation requires an unmodified catalog and complete table
CHECK coverage. It compares qualified relation/constraint identities, constraint
definitions and validation state, and complete column names, positions, type
identities, modifiers and dimensions. Duplicate, missing and extra observations
fail. For a verified expression, the pinned parser also checks that the deparsed
SQL and retained CHECK definition match the analyzed tree's exact predicate
values. A matching constraint name or copied definition alone is insufficient.

The native harness now captures both catalog queries in one repeatable-read
transaction and records the original general-catalog source. The pg_dump archive
is collected separately. The library verifies overlapping observations; it does
not authenticate the capture or claim same-snapshot provenance. Returned native
catalog JSON is canonical; exact original general-catalog whitespace recovery
remains a responsibility of the later source-bound binding. Supplement text is
retained exactly. No core facet assertions or public exports are added here.

Seventeen Bun tests and 439 assertions pass; typechecking and audits of 265
schemas/43 extension packages pass. Chromium 148 executes the optional WASM SQL
parser and correlates twelve CHECKs: eight have verified predicates and four stay
unsupported. It verifies two JSON/YAML recoveries, four mismatch refusals and
unknown exact-token retention, with no host globals or external requests. The
prior resolved-expression browser matrix also passes against the refreshed native
capture. See [catalog correspondence evidence](../../../../fixtures/validation/facets-postgresql-catalog-evidence.json).

The next binding work is scoped core facet classification, source-bound recovery,
authored projection and its operation/package schemas, followed by the full
native/browser compatibility acceptance. The facet admission gate remains open.

## Experimental public facet classification

`classifyPostgresqlFacets` now classifies explicitly selected PostgreSQL 17.4,
UTF8 catalog columns in core 0.5.0. The caller selects stored/new-value scope,
value-domain or exact-input obligation, strict/report mode, and the native Datum
profile. The API uses the injected pinned parser backend; browser callers use the
optional WASM runtime. It does not migrate the envelope or author Field kind.

The new `umf.postgresql.facets` package describes retained classification metadata,
and the operation has a complete JSON Schema. Known facets are derived from the
qualified carrier and applicable verified CHECKs. Integer domains must match a
canonical signed/unsigned width. Decimal classification requires finite symmetric
coefficient bounds and matching native scale or truncation equality; numeric
precision metadata alone does not exclude NaN. Length bounds retain their unit.
Derived facets carry inferred native provenance, not author declarations.

Stored-value classification does not use NOT VALID checks to establish a bound;
new-value classification may use their qualified enforcement. NUL restrictions,
character padding, noncanonical bounds, unsupported constraints and unknown
metadata produce residuals. Exact-input requests report native rounding and the
binary64-to-binary32 counterexample; general SQL expression conversion remains
unqualified even when the stored domain is exact. Strict mode blocks on every
residual, while report mode preserves losses and emits the interpreted subset.

Existing facets require a verified author receipt. Conflicting authorship, shapes
or binding metadata block rather than overwrite. `verifyPostgresqlFacetClassification`
recomputes a retained receipt and checks the current target;
`recoverPostgresqlFacetSource` recovers exact original catalog and supplement text.
The classified Field also retains the complete supplement in its extension payload.
Receipt consistency is not source authentication. Native payloads and unknown
content remain attached, including meaning not represented by the core facets.

Authored PostgreSQL facet projection and full binding acceptance remain unfinished.
The public bundle has changed; previous concept gates still qualify their recorded
snapshots and require a fresh compatibility run before binding acceptance.

Classification validation: 21 Bun tests, 520 assertions, zero failures; typechecking
and audits of 267 schemas/44 packages pass. Chromium 148 checks 231 cases across
33 captured columns: 157 classified results, 74 blocked requests and 157 exact
native recoveries through alternating JSON/YAML receipts. Browser execution uses
the public bundle and optional WASM parser, with no host globals or external
requests. See [the classification checkpoint](../../../../fixtures/validation/facets-postgresql-classification-evidence.json).
These counts cover the PostgreSQL facet checkpoint, not the full repository or
five-system facet admission gate.
