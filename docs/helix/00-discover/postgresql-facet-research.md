# PostgreSQL facet research

## Scope

2026-09-22. Prepare the PostgreSQL 17.4 facet binding while TableSpec's
compatibility refresh runs. This bounded review uses two official PostgreSQL 17
manual pages and the existing local column metadata accessor. The online 17
manual currently follows later 17.x maintenance releases; all behavior still
requires pinned 17.4 native evidence before implementation claims.

## Findings

PostgreSQL documents signed 16-, 32- and 64-bit integer ranges. Explicit numeric
precision is limited to 1000; numeric scale may be negative or exceed precision.
Declared scale rounds inputs before overflow checking. Unconstrained numeric
has no declared scale. Numeric permits NaN; infinities require unconstrained
numeric. NaN compares equal to NaN and above non-NaN values. Floating types are
inexact. Source: PostgreSQL Global Development Group,
[Numeric Types, version 17](https://www.postgresql.org/docs/17/datatype-numeric.html).
Confidence: high for documented 17-series behavior; pending local 17.4 tests.

Character limits count characters rather than bytes. Bounded varchar/char can
truncate excess trailing spaces, and explicit casts truncate over-length values.
Char pads and ignores trailing spaces for equality. Declared length is positive
and at most 10,485,760. Database encoding restricts values; NUL cannot be stored.
Source: PostgreSQL Global Development Group,
[Character Types, version 17](https://www.postgresql.org/docs/17/datatype-character.html).
Confidence: high for documented 17-series behavior; pending local 17.4 tests.

Local fact: `src/adapters/postgresql/column-metadata.ts` exposes each original
native column and derives scalar families only for supported pg_catalog base
types with zero dimensions. It does not derive facets or erase native metadata.

## Recommendation

Qualify integer widths independently of arbitrary native type names. Probe
negative/over-precision scales, NaN, rounding before overflow, character padding,
casts, supplementary Unicode, combining sequences and NUL. Preserve domains,
collations, type modifiers and unknown catalog content as native refinements.

Inference to test: a finite numeric ideal may need an explicit finite-domain
constraint because numeric(p,s) alone can retain NaN. A text length predicate can
express zero length without inventing varchar(0). Neither choice establishes
exact input conversion by itself. Decide explicitly how NUL/encoding restrictions
affect strict projection of a Unicode scalar ideal. These are candidate rules,
not qualified support or equivalence claims.
