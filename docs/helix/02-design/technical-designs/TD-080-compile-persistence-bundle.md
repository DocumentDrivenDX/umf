---
ddx:
  id: TD-080
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-080
      kind: informed_by
    - id: SD-028
      kind: informed_by
---

# TD-080: Compile a reviewable persistence bundle

**User Story:** [[US-080-compile-persistence-bundle]]. **Feature:** [[FEAT-028]].
**Solution Design:** [[SD-028]].

## Scope

One journey governed by US-080; shared surfaces remain in CONTRACT-067/068/069.
Architecture's scoped compiler module map and ADR-002/004 apply.

## Technical Approach

Reuse public UMF admission/semantic APIs; construct an immutable private IR and complete assertion census, then render a deterministic in-memory bundle. Keep the host staging writer separate.

Trade-off: favor explicit supported boundaries over generated conveniences that
imply unproved execution or typing guarantees. Unsupported dependencies refuse;
there is no silent fallback to another library, profile or native interpretation.

## Component Changes

Planned files: `src/compilation/admission/, src/compilation/ir/, src/compilation/bundle/, src/compilation/index.ts; scripts/compile-persistence.ts`. These are new capability paths; existing core and
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

| US-080-AC1 | `bundle_is_reproducible` | Compare every file byte, SHA-256, manifest and diagnostic; changing source/profile changes input digest. | `@covers US-080-AC1` |
| US-080-AC2 | `relevant_unknown_refuses` | Assert no candidate files for selected unknown; exact original source archive for both cases; complete assertion census. | `@covers US-080-AC2` |
| US-080-AC3 | `unresolved_meaning_refuses` | Assert missing reference and target choice refuse; original inputs remain unchanged. | `@covers US-080-AC3` |
| US-080-AC4 | `unsafe_output_refuses` | Assert keyword/case-fold collisions and path escape refuse; escaped literal cannot execute; no truncation success. | `@covers US-080-AC4` |
| US-080-AC5 | `writer_preserves_user_edits` | Assert ownership mismatch refuses; injected staging/selection failures preserve prior directory; symlink refuses. | `@covers US-080-AC5` |
| US-080-AC6 | `report_mode_is_conservative` | Assert strict refuses; report retains safe loss; write-broadening and unknown semantics refuse in both modes. | `@covers US-080-AC6` |

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

Prerequisites: CONTRACT-001/040/041/042/049/051; CONTRACT-067; scoped compiler boundary scaffold.

## Risks

Missing native/managed authority can block adoption while generation remains
useful. Keep those outcomes separate. No performance equivalence is promised;
measure selected workloads before making such a claim.
