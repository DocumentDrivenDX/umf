---
ddx:
  id: TD-082
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-082
      kind: informed_by
    - id: SD-029
      kind: informed_by
---

# TD-082: Use generated PostgreSQL access declarations

**User Story:** [[US-082-generated-postgresql-access]]. **Feature:** [[FEAT-029]].
**Solution Design:** [[SD-029]].

## Scope

One journey governed by US-082; shared surfaces remain in CONTRACT-067/068/069.
Architecture's scoped compiler module map and ADR-002/004 apply.

## Technical Approach

Emit explicit native types and Core/Table declarations or qualified Mapped classes from resolved bindings. Reuse existing PostgreSQL DDL projection and require explicit selected-column DTO decoding.

Trade-off: favor explicit supported boundaries over generated conveniences that
imply unproved execution or typing guarantees. Unsupported dependencies refuse;
there is no silent fallback to another library, profile or native interpretation.

## Component Changes

Planned files: `src/compilation/targets/postgresql/; scripts/compilation-postgresql-oracle.py`. These are new capability paths; existing core and
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

| US-082-AC1 | `postgresql_binding_matches_native` | Use independent catalogs and native insert/select/refusal observations; preserve association fields and quoted names. | `@covers US-082-AC1` |
| US-082-AC2 | `no_fake_orm_identity` | Assert Core declaration is emitted and no Entity identity map or fabricated primary key exists. | `@covers US-082-AC2` |
| US-082-AC3 | `postgresql_codec_matches_native` | Assert precision/scale, integer width, timestamp and client/server defaults; qualified domain/collation limitations remain visible. | `@covers US-082-AC3` |
| US-082-AC4 | `postgresql_has_no_execution_authority` | Assert no engine/session factory, save/delete helper or import I/O; explicit relationship lazy=raise/no cascades. | `@covers US-082-AC4` |
| US-082-AC5 | `schema_drift_blocks_adoption` | Assert native-schema mismatch blocks use; manifests cannot claim installed enforcement from source hashes. | `@covers US-082-AC5` |

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

Prerequisites: US-080/081; CONTRACT-042/043/067/068; exact SQLAlchemy/driver/PostgreSQL profile spike.

## Risks

Missing native/managed authority can block adoption while generation remains
useful. Keep those outcomes separate. No performance equivalence is promised;
measure selected workloads before making such a claim.
