# UMF tranche A corpus contribution

Portable contribution to the canonical corpus owned by Weft, prepared in UMF.
Format `umf-typed-access-contribution/0.1`, core 0.8.0 and proposed `umf.access`
0.1.0. All data is synthetic. `models.json` contains actual core documents and a
CONTRACT-042 PostgreSQL binding; `corpus.json` holds fixed datasets, proposed
logical statements, expectations, provenance and unresolved decisions.

Run `bun test tests/typed-access-shared-acceptance.test.ts` at the repository root.
This finite semantic checker is not a SQL parser, compiler, backend emulator or
runtime target. Backend compilation and execution remain **UNTESTED** for every
case. No native SQL lowering or support qualification is supplied.

Missing is an omitted row property; null is JSON null. Integers, decimals and
temporal source values are original text. Expected ordered IDs select complete
rows from the named dataset. The models share authored field identities but use
separate property-store and relational presence declarations: CONTRACT-070
forbids missing on a ColumnSet-bound row. The PostgreSQL 17 binding is a fixture,
not native acceptance. Engine and Spark bindings must come from Weft with pins.

## Syntax provenance

Weft checkout HEAD `94b2de5e303fe53f0c9432458119b6fe1eef187c` was read only.
`syntaxProvenance` records exact paths and SHA-256 digests for CONTRACT-001 and
`weft-sql-v0.2.ebnf`. Baseline sources use `namespace.record AS alias`; columns
must be `alias.field` and parameters `:name`. Bare columns are excluded. The
baseline admits `=` and `>` predicates joined by AND and ASC ordering, but
excludes optional/temporal selected fields and the additional tranche-A forms.
Every statement here is therefore `PROPOSED_NOT_ACCEPTED`, combining baseline
identifier conventions with UMF's proposed grammar delta. Do not freeze renderer
expectations as accepted Weft syntax. UPDATE aliases/SET qualification, nulls,
empty lists, temporal carriers and page entry points require Weft agreement.

## Admission limits and decisions

Public `readDocument`/`validateDocument` admit both envelopes while retaining
`UNKNOWN_EXTENSION` for `umf.access` under the default registry. This is not
complete access validation. `inspectBinding` admits the supplied physical binding.
Public core field/dataset validation checks non-temporal carriers, presence and
keys. Present non-null date/timestamp values currently **refuse** with
`CORE_SCHEMA_PROPERTIES`; source-shape admission does not imply temporal value
admission. Tests assert that refusal instead of weakening source meaning.

S8 overlaps its null/missing rule and empty-list rule. Empty IN/NOT IN is covered
for present values; null/missing with an empty list remains unresolved. The corpus
records this and other open decisions without inventing results or refusal codes.
Bulk cases describe required refusal and unchanged state, not observed execution.
The Truss offset case requires the same rows if accepted, or a specific refusal
when exact UTC comparison is unavailable. Related-entity page profiles and
bindings are pending; the entity mixed-order page is a semantic witness only.
