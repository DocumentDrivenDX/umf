---
ddx:
  id: TD-060
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-060
      kind: informed_by
    - id: SD-026
      kind: informed_by
    - id: CONTRACT-057
      kind: references
---

# TD-060: Domain-pack loader companion slice

**User Story:** [[US-060-domain-pack-catalog]] | **Feature:** FEAT-009 |
**Solution Design:** [[SD-026-domain-pack-platform]]

## Technical Approach

Apply CONTRACT-057 to US-060-AC8–AC12. Pure metadata code lives in
src/domain-packs/loader.ts; acquisition/state code is a separately bundled Bun
host CLI under scripts/loaders/. Source inventory is explicit to keep collection
coverage auditable and avoid prematurely certifying complete website discovery.
Document-byte revision identity and copy-on-publication preserve older inputs.
Atomic current-pointer rename commits a complete snapshot; exclusive state lock
prevents concurrent state mutation. Retrying a failed run rechecks selected items.
No remote checkpoint/sink acknowledgment is asserted.

## Component Changes

- Add portable loader schema/admission and known-profile inspection to the
  existing domain-pack validator and public index (AC8).
- Add bounded transport, finite inventory validation, archive/projection and
  locked immutable publication modules (AC9/AC10).
- Add offline replay with full retained-byte and projection verification (AC11).
- Extend pack exporter for checksum-pinned companion closure; deterministic
  companion builder emits court and SEC demonstration packs and a public ZIP
  bundle. Existing Pages build distributes these and operator instructions (AC12).

## API/Interface Design

All exact metadata, CLI, inventory, row, receipt and publication surfaces are
owned by CONTRACT-057. Existing source/schema export remains CONTRACT-052/053.
The runner verifies declared companion files but imports only its compiled
trusted implementation. No artifact-supplied module path executes.

## Security

Explicit host allowlist, HTTPS/no redirects, media validation, byte/time/retry
bounds and no authentication headers constrain acquisition. DNS trust remains an
operator responsibility. Secrets never enter pack configuration. Unknown rights
need explicit local-use; redistribution requires allowed declarations. Export
preflights checksum and lexical/realpath containment. Locks are never silently
stolen. Keep filenames content-addressed rather than using source IDs as paths.

## Testing

STP-060 maps AC8–AC12 to portable Bun/Chromium metadata, real transport and clean
bundle invocation tests. Fake response tests supplement actual loopback transport;
no fake database sink acceptance is claimed. Test finite failure coverage and
publication recovery, not only successful file generation.

## Migration & Rollback

Existing packs need no loader annotation or migration. Keep new companions and
state independently versioned. Restore previous build/export code to roll back;
retain snapshots and originals. Public ZIPs are replaced by Pages builds and
contain no credentials or live user data.
