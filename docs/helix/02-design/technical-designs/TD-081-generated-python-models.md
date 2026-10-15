---
ddx:
  id: TD-081
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-081
      kind: informed_by
    - id: SD-028
      kind: informed_by
---

# TD-081: Use generated Python instance models

**User Story:** [[US-081-generated-python-models]]. **Feature:** [[FEAT-028]].
**Solution Design:** [[SD-028]].

## Scope

One journey governed by US-081; shared surfaces remain in CONTRACT-067/068/069.
Architecture's scoped compiler module map and ADR-002/004 apply.

## Technical Approach

Emit ordinary Pydantic classes, an enum sentinel and local exact codecs. Revalidate complete value graphs at codec boundaries; generate distinct variants rather than a shared mutable entity.

Trade-off: favor explicit supported boundaries over generated conveniences that
imply unproved execution or typing guarantees. Unsupported dependencies refuse;
there is no silent fallback to another library, profile or native interpretation.

## Component Changes

Planned files: `src/compilation/targets/python/; generated fixture package; scripts/compilation-python-oracle.py`. These are new capability paths; existing core and
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

| US-081-AC1 | `presence_survives_codecs` | Assert empty patch encodes empty mapping; explicit bound null remains None; required omission, forbidden null/read-only/key patch fail; every default.on trigger remains preserved without substitution; equal cross-module bare IDs refuse; sentinel never enters transport. | `@covers US-081-AC1` |
| US-081-AC2 | `exact_values_refuse_loss` | Assert bool/string coercions, float Decimal input, scale/width overflow, timezone invention and excess precision refuse; accepted values round-trip exactly. | `@covers US-081-AC2` |
| US-081-AC3 | `nested_state_is_revalidated` | Assert invalid nested mutation and model_construct bypass fail; input values are not modified; errors do not render values. | `@covers US-081-AC3` |
| US-081-AC4 | `static_contract_is_inspectable` | Assert unknown attribute, wrong named result and incompatible constructor/key uses fail without missing-import errors; runtime nominal limitations remain explicit. | `@covers US-081-AC4` |
| US-081-AC5 | `generated_package_is_independent` | Assert isolated import with only exact runtime locks; backend import is optional and no I/O occurs. | `@covers US-081-AC5` |

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

Prerequisites: US-080; CONTRACT-068 and exact Python/Pydantic/type-checker profile spike.

## Risks

Missing native/managed authority can block adoption while generation remains
useful. Keep those outcomes separate. No performance equivalence is promised;
measure selected workloads before making such a claim.
