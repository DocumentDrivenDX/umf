---
ddx:
  id: TD-084
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-084
      kind: informed_by
    - id: SD-029
      kind: informed_by
---

# TD-084: Qualify a generated Truss storage substrate

**User Story:** [[US-084-truss-generated-substrate]]. **Feature:** [[FEAT-029]].
**Solution Design:** [[SD-029]].

## Scope

One journey governed by US-084; shared surfaces remain in CONTRACT-067/068/069.
Architecture's scoped compiler module map and ADR-002/004 apply.

## Technical Approach

Produce and validate a conformance packet for one named table/operation family. Compare isolated original and generated paths; keep direct driver and Core declarations initially. Do not edit Truss in this UMF implementation slice.

Trade-off: favor explicit supported boundaries over generated conveniences that
imply unproved execution or typing guarantees. Unsupported dependencies refuse;
there is no silent fallback to another library, profile or native interpretation.

## Component Changes

Planned files: `src/compilation/adoption/truss.ts; scripts/compilation-truss-conformance.py; consumer-owned host composition point (selected in Truss design)`. These are new capability paths; existing core and
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

| US-084-AC1 | `truss_does_not_create_domain_tables` | Assert no per-domain DDL/index/partition and exact property/key identity; isolated objects/edge properties and unknowns remain. | `@covers US-084-AC1` |
| US-084-AC2 | `truss_admission_cannot_be_bypassed` | Assert no direct registry mutation, custody fabrication, privilege escalation, ORM autoflush or hidden retry. | `@covers US-084-AC2` |
| US-084-AC3 | `truss_mutation_witness_matches` | Compare original native observations for full selected operation rather than generated rows alone. | `@covers US-084-AC3` |
| US-084-AC4 | `truss_failure_and_concurrency_match` | Assert no partial journal/feed, same stale refusal, no replay after uncertain commit and no duplicate live write. | `@covers US-084-AC4` |
| US-084-AC5 | `truss_incomplete_proof_blocks_switch` | Assert ADOPTION_INCOMPLETE/MISMATCH, exact evidence retention and explicit scope; no substitute routines are manufactured. | `@covers US-084-AC5` |

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

Prerequisites: US-082; CONTRACT-069; consumer-local adopted Truss design and original complete native operation.

## Risks

Missing native/managed authority can block adoption while generation remains
useful. Keep those outcomes separate. No performance equivalence is promised;
measure selected workloads before making such a claim.
