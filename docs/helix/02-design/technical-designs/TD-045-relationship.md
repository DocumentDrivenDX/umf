---
ddx:
  id: TD-045
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-006
      kind: informed_by
    - id: US-045
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: TD-044
      kind: informed_by
---

# TD-045: Implement authored relationships

## Scope

Implement [[US-045]] under CONTRACT-041 after the key five-system gate. The
architecture is the parent design, as in TD-040–044; no separate solution
design exists. This is an experimental ideal, not native replacement.

## Technical Approach

Add relationship authoring/inspection to a new core envelope version, keeping
old `references` untouched. Validate exact endpoint pairs, local names,
inverse collisions and cardinality before publishing copied results. Separate
authored assertions from adapter classifications through CONTRACT-040 receipts;
do not infer intent from DDD fields, FKs or GraphQL AST nodes. Build one
priority binding at a time with source-linked outcomes, then run a separate
admission gate and all-five delivery gate. Additional GraphQL/RDF/LinkML
profiles retain their own versions and evidence.

## Component Changes

- `spec/core/`, `src/model/`, `src/validation/`: publish the new schema/version,
  typed access, exact-ID and collision checks, migration/rollback receipts
  (US-045-AC1/2/10). The CONTRACT-041 semantic text is the prerequisite.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/` and
  `src/projections/`: scoped native observations and explicit down-bindings;
  retained native source and residuals (AC3–9).
- `tests/core-ideals/`, `fixtures/relationship/`, `scripts/core-ideals/`:
  authored six-case corpus, negative counterexamples, native oracle and browser
  replays (AC2–10). No historical oracle alone counts as a new pass.

## API/Interface Design

CONTRACT-041 owns the exact relationship shape and operation result;
CONTRACT-001 owns IDs/unknown preservation and CONTRACT-040 owns provenance,
strict/report and recovery. This TD wires those surfaces and does not add a
second reference resolver. Consumers select by module/name and preserve the
full source context.

## Data Model Changes

Reserve `module.relationships` only in the new explicit core version. Test old
unknown members with the same spelling before migration. No older document
acquires an association by default. Keep native refinements in extensions.

## Integration Points

TableSpec may initially refuse with a retained residual, but its native model
must be inspected. PostgreSQL/SQL Server need scoped FK/junction checks; Avro
and Parquet need qualified carriers and preserved bytes. GraphQL/RDF/LinkML
are additional profiles, never replacements for a priority target.

## Security and Performance

Use core copy/depth/node limits and exact reference traversal. Reject getters,
unsafe paths and malformed models atomically. Keep Bun/Node native tooling in
scripts; portable source must build for Chromium. No throughput claim.

## Testing

Map US-045-AC1–10 to cited tests. Check JSON/YAML recovery, unknown content,
strict/report pairs, ideal→native→ideal, native→ideal→native, six corpus shapes,
old-member collisions, pinned native systems and real Chromium parity. Record
two useful priority mappings separately from all-five delivery and FR-28.

## Migration & Rollback

Migration records original envelope and any old colliding unknown member.
Rollback restores the old document and retains new relationship assertions in
an explicit receipt/residual. It never silently deletes native extensions.

## Implementation Sequence

1. Finish key gate and publish CONTRACT-041/version transition.
2. Implement schema/types/validation and core tests.
3. Add five scoped bindings and their native/browser oracles; then additional
   GraphQL/RDF/LinkML profiles.
4. Run separate admission/delivery conformance and publish qualified evidence.

## Risks

Heterogeneous endpoint types and reverse cardinality can be overclaimed by a
single FK or GraphQL field. Require residuals and native counterexamples.
