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
