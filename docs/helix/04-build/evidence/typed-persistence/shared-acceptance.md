# Shared tranche A acceptance contribution

2026-10-15. Scope: portable UMF contribution for the corpus ultimately owned by
Weft. Owner authorized implementation and waived the budget prerequisite in the
[execution contract](../../typed-persistence-design.md#execution-contract).
HELIX runtime handoff used the installed 0.17.0 catalog; the user explicitly
scoped fixture/test paths outside the documentation root. No contract, production
implementation, branch, commit or other chat was changed by this contribution.

[Fixture guide](../../../../../fixtures/umf-typed-access/README.md),
[models](../../../../../fixtures/umf-typed-access/models.json),
[39 cases](../../../../../fixtures/umf-typed-access/corpus.json), and
[focused tests](../../../../../tests/typed-access-shared-acceptance.test.ts).
[Machine-readable evidence](shared-acceptance.json) records source hashes,
versions, coverage, unresolved decisions and the exact fresh command;
[test output](shared-acceptance-tests.log) records **42 pass, 0 fail, 447 assertions**
on Bun 1.4.2 (43848b5a7).

## What was observed

Public source-envelope admission succeeds with `UNKNOWN_EXTENSION` for proposed
`umf.access` 0.1.0 under the default registry. The supplied CONTRACT-042 binding
passes `inspectBinding`. Non-temporal field carriers, required presence and Key
uniqueness are checked through public core APIs, including negative controls.
Present temporal values refuse `CORE_SCHEMA_PROPERTIES` in current public value
admission; tests retain that limitation. This contribution does not claim full
access-extension validation or fully admitted temporal datasets.

Finite semantic witnesses cover every minimum item in the Weft requirements:
all AND/OR truth cells including both UNKNOWN origins and NOT, null/missing tests,
negated comparisons/membership/ranges, empty membership for present operands,
DESC with both null placements, mixed-direction keyset pages including continuation
inside a null group, author-offset instant equality including Truss expectations,
exact decimal equality, binary Unicode scalar order, required-field SET NULL
refusal and bounded bulk refusal with no effect. Additional cases cover date,
local timestamp, count and existence. Bulk no-effect and all backend outcomes
remain requirements, not observed execution.

## What remains open

Weft HEAD `94b2de5e303fe53f0c9432458119b6fe1eef187c` was inspected read only.
CONTRACT-001 and its 0.2 EBNF require qualified alias columns, so all read
statements follow that naming convention. They still exceed accepted baseline
forms and profiles: every case is marked `PROPOSED_NOT_ACCEPTED`. They are not
frozen renderer expectations. UPDATE spelling and page entry points also await
Weft agreement. Exact provenance and hashes are in the corpus and evidence.

S8's empty-list and null/missing clauses overlap; the intersection has no invented
expectation. Canonical decimal parameter spelling, related-entity page profile,
Truss exact offset lowering, wider/null bulk domains and core temporal value
admission remain explicit gaps. Both 1- and 2-row entity page witnesses exist;
related-entity qualification is not claimed.

**Backend compilation, native execution and consumer adoption are UNTESTED for
every case.** PostgreSQL/Spark, Truss and Ashlar require their own pinned bindings
and real execution after Weft consumes the portable contribution. No SQL lowering,
mock target or native-support qualification was implemented here.
