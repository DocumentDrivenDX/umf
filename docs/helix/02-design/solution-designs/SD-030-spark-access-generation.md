---
ddx:
  id: SD-030
  type: solution-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-030
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# SD-030: Spark and Unity Catalog access generation

**Feature:** [[FEAT-030]]. **Contracts:** CONTRACT-067/068/069, existing
CONTRACT-017 Spark and CONTRACT-064 Delta generation.

## Scope

Generate native schemas/declaration proposals and typed materialized-row decoders;
compose them with consumer-owned Spark and publication execution.

## Requirements Mapping

| Requirement | Design element | Verification owner |
| --- | --- | --- |
| SP-01/03 | Explicit Spark/Delta native profile and enforcement dispositions | US-083/STP-083 |
| SP-02/04 | Named result models; host analysis/materialization | US-083/STP-083 |
| SP-05 | Resolver-bound Ashlar adoption packet | US-085/STP-085 |

## Solution Approaches

Select source generation around explicit native schemas and existing host APIs.
Reject a typed facade that silently casts arbitrary DataFrames to a model:
Python annotations cannot prove expression analysis, nested nullability or a
complete dataset. Do not create a new query-expression compiler; Weft retains
that responsibility. A SQLAlchemy Databricks dialect may be evaluated later,
but does not replace native Spark/Delta publication semantics in this profile.

## Domain Model

A logical model, native Spark/Delta definition and catalog naming binding are
separate inputs. A named result projection owns its explicit field inventory;
the host checks the analyzed native schema before decoding rows. An Ashlar
publication owns a full vector of native table UUID/version pairs; a schema
fingerprint cannot replace that vector or its retention evidence.

## System Decomposition

TD-083 owns schema/declaration emission and Python decoding. TD-085 owns the
Ashlar conformance handoff. Existing public UMF Spark/Delta APIs retain native
interpretation; emitted helpers perform no collection, session setup or writes.

## Technology Rationale

Use Spark 4.0.1 as a bounded native candidate; lock Delta, PySpark, JVM, session
configuration and managed-platform identities independently. Generate Pydantic
only at explicit materialized-row boundaries; distributed validation belongs
to the consumer and must declare dataset scope/concurrency limits.

## Traceability

STP-083 separates schema, value, local execution and managed catalog proof.
STP-085 separately proves original publication reads, failure/replay, fencing,
uncertain ACK reconciliation and no latest fallback. Local green results cannot
close the managed Unity Catalog or protected-authority lanes.

## Concern Alignment

Preserve native metadata and exact values, retain unknown semantics and bound
all host tests. Compiler source remains browser-portable. No live Databricks
operation or service deployment is authorized by a design request.

## Constraints & Assumptions

The initial compiler emits no typed arbitrary DataFrame DSL or collection helper.
Unity Catalog keys remain informational unless separate native enforcement is
proved. Ashlar consumer contracts retain publication/execution authority.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Session config changes interpretation | Wrong timestamps/overflow | Exact profile configuration and refusal on mismatch |
| Informational keys used as enforcement | Invalid relational assumptions | Separate declarations/observations/enforcement dispositions |
| Latest fallback or partial commit exposed | Broken immutable publication | Original resolver/fence and failure witnesses |
| Empty/sampled result treated as schema proof | Incorrect typed results | Independent analyzed-schema check and bounded row claims |
