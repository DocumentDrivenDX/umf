---
ddx:
  id: TD-075
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-075
      kind: informed_by
    - id: SD-026
      kind: informed_by
    - id: CONTRACT-053
      kind: informed_by
---

# TD-075: ecology reference pack

## Technical Approach

Inherit [SD-026](../solution-designs/SD-026-domain-pack-platform.md), [CONTRACT-053](../contracts/CONTRACT-053-domain-pack-profiles.md) and governing US-075. The first release authors synthetic domain fixtures and a core ontology target. Native source standards remain mapping candidates. Runtime replay reuses TableSpec spool/archive/sinks. Truss/Ashlar native acceptance is unclaimed.

## Component Changes

`spec/domain-packs/ecology/` contains versioned tables, ontology, pinned fixture CSVs, independent query expectations and source metadata. `scripts/domain-packs/catalog.ts` owns reviewed scenario authoring; build-catalog regenerates source artifacts. The pack README inventories every conceptual table, its fields and fixtures. The tests compare every field/value and key/reference with reviewed source definitions; independent domain checks are separate from structural equality.

## Interfaces

CONTRACT-052 owns pack/source metadata. CONTRACT-053 owns targets, identities, replay, graph candidates, inclusion and limits. Core Record/Key/Relationship declarations use CONTRACT-040/041. No native ontology equivalence or graph enforcement follows from a core schema.

## Security and Performance

No artifact-supplied code or SQL executes in runtime tools. Checks resolve from reviewed test code, using a read-only isolated SQLite connection and progress budget. Local realpath, hash, byte/row limits and source selection are required. No credentials or remote execution. Component expansion uses bounded batches and disk spool.

## Testing

STP-075 maps US-075-AC1 through AC8; archaeology adds specialized media/date/sample coverage. Preserve partial coverage for unexercised scale axes and source-native mappings. Verify schema/fixtures, counterexamples, deterministic replay, typed archive and native local engine. Actual browser inspects every declared schema/ontology in every pack.

## Migration and Rollback

Additive source artifacts; no production schema mutation. Removing this pack from canonical source removes it from the next explorer build. Legal/medical row fixtures and prior consumer behavior remain regression gates.
