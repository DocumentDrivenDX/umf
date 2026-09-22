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
