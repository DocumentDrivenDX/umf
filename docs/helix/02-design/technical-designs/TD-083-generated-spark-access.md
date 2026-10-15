---
ddx:
  id: TD-083
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-083
      kind: informed_by
    - id: SD-030
      kind: informed_by
---

# TD-083: Use generated Spark and catalog declarations

**User Story:** [[US-083-generated-spark-access]]. **Feature:** [[FEAT-030]].
**Solution Design:** [[SD-030]].

## Scope

One journey governed by US-083; shared surfaces remain in CONTRACT-067/068/069.
Architecture's scoped compiler module map and ADR-002/004 apply.

## Technical Approach

Reuse native schema and Delta DDL APIs. Emit StructType constructors and row decoders only; host analyzes named projections and controls all materialization and publication.

Trade-off: favor explicit supported boundaries over generated conveniences that
imply unproved execution or typing guarantees. Unsupported dependencies refuse;
there is no silent fallback to another library, profile or native interpretation.

## Component Changes

Planned files: `src/compilation/targets/spark/; scripts/compilation-spark-oracle.py; scripts/compilation-unity-catalog-oracle.py`. These are new capability paths; existing core and
native APIs remain their semantic authorities. Use only public module barrels,
keep target/vendor conversion at the owning boundary, and run
`bun scripts/check-compilation-boundaries.ts` before dependent feature tests.
The compiler facade constructs trusted profiles; consumer execution construction
stays in the host. No package split or consumer source edit is implied.

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| Compilation and retained report | CONTRACT-067 | Exact input/profile and reviewable file data |
| Generated models/codecs/declarations | CONTRACT-068 | Explicit supported Python/backend operations |
| Engine conformance, when selected | CONTRACT-069 | Refuse incomplete or mismatched substitution |

## Data Model Changes

No core schema or database migration is introduced. Generated artifacts retain
source identities and native choices. New request/result schemas implement the
contract as separate compiler resources; they cannot redefine canonical UMF.

## Integration Points

Consume public UMF semantic/native APIs and exact installed target libraries.
Native harnesses own isolated runtimes and independent observations. If a required
semantic API or original native operation is absent, block that profile rather
than reconstruct consumer internals in the generator.

## Security

No network, credentials, connections or artifact-loaded code in portable modules.
Escape generated literals, bound traversal/output, retain unknown content and do
not print source values. Native tests use explicitly owned fixtures. Consumer
admission remains authoritative; import success confers no write permission.

## Testing

| US-083-AC1 | `spark_schema_matches_native` | Assert StructField/ArrayType/MapType metadata and nullability; nullable map keys and unsupported metadata refuse. | `@covers US-083-AC1` |
| US-083-AC2 | `spark_exact_values_are_qualified` | Assert decimal boundaries, epoch-microsecond text projection versus raw naive TimestampType, NTZ and process/session timezone differences, and ANSI overflow under exact locks; no silent cast or setting changes. | `@covers US-083-AC2` |
| US-083-AC3 | `spark_result_type_requires_schema` | Assert wrong/missing/duplicate columns fail even with zero rows; arbitrary raw expressions have no unchecked typed cast. | `@covers US-083-AC3` |
| US-083-AC4 | `spark_generation_is_passive` | Assert no SparkSession creation, collect/toLocalIterator/MERGE or schema-evolution action is emitted. | `@covers US-083-AC4` |
| US-083-AC5 | `catalog_claims_are_separate` | Assert informational PK/FK/unique and no RELY; managed native case is not-run without dedicated endpoint and cannot count as local pass. | `@covers US-083-AC5` |

The corresponding STP owns the authoritative assertion-to-test mapping. Generated
positive and negative examples must be tested under exact locks; tests cannot
substitute their own renderer's expectations for independent native observations.

## Migration & Rollback

Keep generated output in its own owned directory; CONTRACT-067 prevents silent
replacement of hand edits. Revert the selected source bundle/host composition
choice to roll back. Any schema/data/protocol change requires a separate reviewed
migration; reverting code alone does not undo native effects.

## Implementation Sequence

1. Establish the exact profile and fixtures, then create the named red tests.
2. Implement the owning modules and focused invariant/refusal behavior.
3. Verify isolated generated imports, static/native lanes and source retention.
4. Record failed and successful attempts with exact pins; qualify only this scope.

Prerequisites: US-080/081; CONTRACT-017/064/067/068; exact Spark/Delta/catalog profile spike.

## Risks

Missing native/managed authority can block adoption while generation remains
useful. Keep those outcomes separate. No performance equivalence is promised;
measure selected workloads before making such a claim.
