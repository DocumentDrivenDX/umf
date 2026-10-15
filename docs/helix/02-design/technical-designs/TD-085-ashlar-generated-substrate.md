---
ddx:
  id: TD-085
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-085
      kind: informed_by
    - id: SD-030
      kind: informed_by
---

# TD-085: Qualify a generated Ashlar storage substrate

**User Story:** [[US-085-ashlar-generated-substrate]]. **Feature:** [[FEAT-030]].
**Solution Design:** [[SD-030]].

## Scope

One journey governed by US-085; shared surfaces remain in CONTRACT-067/068/069.
Architecture's scoped compiler module map and ADR-002/004 apply.

## Technical Approach

Generate declarations for one named runtime family and validate an isolated adoption packet. Preserve original resolver, fencing, publication and ACK flow; no adapter SQL repair or alternate writer.

Trade-off: favor explicit supported boundaries over generated conveniences that
imply unproved execution or typing guarantees. Unsupported dependencies refuse;
there is no silent fallback to another library, profile or native interpretation.

## Component Changes

Planned files: `src/compilation/adoption/ashlar.ts; scripts/compilation-ashlar-conformance.py; consumer-owned resolver/publication composition point (selected in Ashlar design)`. These are new capability paths; existing core and
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

| US-085-AC1 | `ashlar_reads_preserve_vector` | Compare all original table UUID/version pairs, presence, exact values and parallel-edge IDs; no scalar vector summary. | `@covers US-085-AC1` |
| US-085-AC2 | `ashlar_stale_read_refuses` | Assert no fallback, no empty-graph success and no retained prior authorization used as current authority. | `@covers US-085-AC2` |
| US-085-AC3 | `ashlar_publication_is_not_table_commit` | Assert manifest does not advance on partial roles; replay uses original receipts and no independent generated write. | `@covers US-085-AC3` |
| US-085-AC4 | `ashlar_ack_and_fencing_match` | Assert original destination/source evidence and fresh read-only ACK reconciliation; no second ACK or publication on uncertainty. | `@covers US-085-AC4` |
| US-085-AC5 | `ashlar_support_scope_is_honest` | Assert local-only packet cannot claim managed UC/production authority; profile changes require requalification and original selection survives failure. | `@covers US-085-AC5` |

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

Prerequisites: US-083; CONTRACT-069; consumer-local adopted Ashlar design and original resolver/publication implementation.

## Risks

Missing native/managed authority can block adoption while generation remains
useful. Keep those outcomes separate. No performance equivalence is promised;
measure selected workloads before making such a claim.
