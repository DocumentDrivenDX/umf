---
ddx:
  id: umf.typed-persistence-design
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: SD-028
      kind: informed_by
    - id: SD-029
      kind: informed_by
    - id: SD-030
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Typed persistence generation: design and build handoff

## Scope

Design-time UMF-to-Python generation belongs in the UMF repository. Generated
models, PostgreSQL mappings and Spark/Delta declarations form a typed persistence
toolkit. Truss and Ashlar can adopt that substrate while retaining their own
execution protocols. Everything here is a draft specification; no compiler,
native support, migration or consumer adoption is delivered by these documents.

This focused handoff is indexed by the canonical implementation plan. It does
not replace its existing release priorities or the TableSpec-first goal.

### Read the design

| Layer | Artifacts |
| --- | --- |
| Direction | Vision input: generated typed persistence substrate; PRD FR-52–54 |
| Feature behavior | [FEAT-028](../01-frame/features/FEAT-028-python-model-generation.md), [FEAT-029](../01-frame/features/FEAT-029-postgresql-access-generation.md), [FEAT-030](../01-frame/features/FEAT-030-spark-access-generation.md) |
| Decision | [ADR-004](../02-design/adr/ADR-004-design-time-persistence-generation.md) |
| Exact interfaces | [CONTRACT-067](../02-design/contracts/CONTRACT-067-persistence-compiler.md), [CONTRACT-068](../02-design/contracts/CONTRACT-068-generated-python-access.md), [CONTRACT-069](../02-design/contracts/CONTRACT-069-engine-substrate-adoption.md) |
| Solution designs | [SD-028](../02-design/solution-designs/SD-028-python-model-generation.md), [SD-029](../02-design/solution-designs/SD-029-postgresql-access-generation.md), [SD-030](../02-design/solution-designs/SD-030-spark-access-generation.md) |
| Stories / technical designs / tests | US/TD/STP-080 compiler, -081 Python, -082 PostgreSQL, -083 Spark, -084 Truss adoption, -085 Ashlar adoption |
| Boundaries | Architecture: proposed typed persistence compiler and Module Boundaries; concerns: typed persistence application; TP-001 compiler strategy |

### Responsibility map

| Owner | Responsibility |
| --- | --- |
| UMF | Reusable semantic interpretation, generated schemas/types/codecs and support reports |
| Weft | Logical SQL query compilation/lowering |
| Truss | Generic physical layout, accepted catalog, protected mutations, transactions, journal/feed and ACK protocol |
| Ashlar | Admitted bindings, native snapshot retention, publication resolver/fencing, full version vectors and source/destination custody |
| Host application | Connections/sessions, pools, runtime configuration, materialization bounds, credentials and applying migrations |

## Shared Constraints

No artifact-supplied code/network loading; no inference from names; no silent
loss. Separate instance models from UMF document models, domain models from
engine storage models, and declared requirements from installed enforcement.
Preserve core/native semantics and unknown content. No mandatory generated
runtime helper distribution or compiler workspace split is selected.

## Implementation Slices

All paths/commands are planned. Do not label an absent command passing.

| Slice | Story / artifacts | Depends on | Validation gate / observable outcome |
| --- | --- | --- | --- |
| B-TP-000 | Architecture/concerns, ADR-004, all TDs | Approved capability scope | Establish compiler boundary checker and local/pre-commit/CI wiring; permitted/forbidden import, cycle/private-access and host-global controls pass |
| B-TP-001 | CONTRACT-067/068, TD-080/081/082/083 | B-TP-000 | Bounded compatibility spike locks exact Python/Pydantic/checker/SQLAlchemy/driver/Spark/Delta versions and configuration; prove sentinel, strictness, Decimal and passive import mechanics; unsupported cases narrow the profile explicitly |
| B-TP-002 | US/TD/STP-080 | B-TP-001 | Request/result schemas, admission, closure, assertion census and byte-stable bundle pass focused Bun tests; no second semantic implementation |
| B-TP-003 | US/TD/STP-080 | B-TP-002 | Host staging writer preserves hand edits and previous selection under failure; real Chromium output matches Bun |
| B-TP-004 | US/TD/STP-081 | B-TP-002 | Row/create/patch/key/projection source, generated exact codecs, isolated package and static-positive/negative cases pass |
| B-TP-005 | US/TD/STP-082 | B-TP-004 | Explicit PostgreSQL declarations/codecs pass independent pinned native value/catalog/constraint observations |
| B-TP-006 | US/TD/STP-083 | B-TP-004 | Spark schema/value/configuration and passive import cases pass on pinned local Spark/Delta |
| B-TP-007 | US/TD/STP-083 | B-TP-006; dedicated endpoint selected separately | Managed Unity Catalog declarations/policy boundary have independent native evidence; unavailable endpoint leaves this lane unqualified |
| B-TP-008 | US/TD/STP-084 | B-TP-005; consumer-local adopted Truss design | One named original/generated generic-storage family passes native protocol equivalence; protected paths need original complete authority/routines |
| B-TP-009 | US/TD/STP-085 | B-TP-006; consumer-local adopted Ashlar design | One named original/generated publication family passes resolver/vector/replay/failure/ACK/fencing witnesses |
| B-TP-010 | TP-001, all STPs | All scopes being claimed | Unchanged-source compiler/native/browser replay, regression required by changed code, semantic review and complete version/subset evidence |

Generation can be qualified independently of managed catalog and consumer adoption.
Completion of the entire proposed scope requires all selected lanes; no local
pass substitutes for B-TP-007 or a protected consumer witness. Read-only Truss
qualification is a named smaller scope, not mutation qualification.

## Execution Contract

The current request authorizes specifications, Astra review and a Claude prompt.
It does not authorize implementation, dependencies, migrations or production
operations. Subsequent implementation should follow this sequence after scope
and provisional decisions are adopted. No deployment or migration approval is
being sought as part of this specification task.

Implementation token estimate and spending ceiling are **unknown/not selected**:
there is no measured compiler implementation baseline or execution budget. Before
implementation, record a user-selected ceiling and metering limits in this section,
including native verification/review effort. This is a planning gap, not a reason
to claim execution-ready authorization. No tracker is selected.

## Continuation Evidence

When implementing, retain exact plan/source/profile revision, completed slices,
command outcomes, failed attempts, pending lanes and next action under
`evidence/typed-persistence/`. Do not reuse historical acceptance for changed inputs.

## Validation Plan

At design time verify unique new IDs, resolvable internal links, required artifact
sections, every FR/feature requirement's story allocation and all 31 AC mappings.
Astra review and dispositions belong in build evidence. Actual tests remain
UNTESTED until code and native observations exist.

At build time create red tests, then execute each STP's gates and the exact-source
integration replay. Qualify managed services and protected engines separately.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Target profile fails exactness or static typing | Narrow/change draft profile before emitters | Preserve original source and previous package |
| Generated access changes execution behavior | Fail adoption; retain independent native evidence | Keep original host selection; no double writes |
| Existing advanced semantic API is incomplete | Resolve upstream API scope before claiming support | Refuse affected assertions |
| Consumer authority cannot be qualified | Leave corresponding scope incomplete | Original consumer protocol remains selected |
| Separate packaging becomes necessary | Propose scoped ADR-002 policy change with evidence | Continue module-level isolation initially |

## Exit Criteria

Design completion means coherent draft artifacts, traceability checks, recorded
Astra review with dispositions, and a ready Claude second-opinion prompt.
Implementation readiness additionally requires adopted profile/consumer decisions
and execution budget. Runtime completion requires exercising cited tests and
all claimed native/consumer gates; this design provides no such evidence.

## Open Qualification Decisions

- Exact Python/Pydantic/checker/SQLAlchemy/driver/Spark/Delta/platform locks and
  native configuration: B-TP-001; managed service identity observed separately.
- Initial native type/collation/domain subset and recursive model policy: admit
  only after counterexample corpus; initial recursion refuses.
- First Truss/Ashlar table/operation families: select in consumer-local designs
  against current contracts; illustrative catalog reads are not a settled choice.
- Any packaging release, helper distribution, production policy installation,
  full query-typing facade or core Python semantic parity: separate proposals.

## Review and Independent Opinion

[Astra review record](evidence/typed-persistence/astra-review.json) retains the
three review rounds and finding dispositions. Astra closed its review with no
unresolved findings after the corrections. That is design-review evidence only.
[Scoped structural verification](evidence/typed-persistence/structure-check.json)
records document/link/traceability checks and their limits.

[Claude second-opinion prompt](typed-persistence-claude-prompt.txt) supplies the
read order, sibling context and adversarial questions. It asks Claude to form
its own view before reading Astra's record. No Claude review has been run.
