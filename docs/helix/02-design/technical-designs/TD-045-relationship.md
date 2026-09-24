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
old `references` untouched. Validate exact keyed-Record endpoint pairs,
stable relationship and target-key IDs, unique local names, inverse collisions,
`min..max` bounds, lifecycle/direction coherence and any keyed association
Record before publishing copied results. Do not reuse field `cardinality`:
it describes a container (`one`/`array`/`map`), not participation. Separate
authored assertions from adapter classifications through CONTRACT-040 receipts;
do not infer intent from DDD fields, FKs or GraphQL AST nodes. Build one
priority binding at a time with source-linked outcomes, then run a separate
admission gate and all-five delivery gate. Additional GraphQL/RDF/LinkML
profiles retain their own versions and evidence.

## Component Changes

- `spec/core/`, `src/model/`, `src/validation/`: publish the new schema/version,
  typed access, exact-ID/key and collision checks, migration/rollback receipts
  (US-045-AC1/2/10). The CONTRACT-041 semantic text is the prerequisite.
- `src/adapters/{tablespec,postgresql,sqlserver,avro,parquet}/` and
  `src/projections/`: scoped native observations and explicit down-bindings;
  retained native source and residuals (AC3–9).
- `tests/core-ideals/`, `fixtures/relationship/`, `scripts/core-ideals/`:
  authored six-case corpus, negative counterexamples, native oracle and browser
  replays (AC2–10). No historical oracle alone counts as a new pass.

## API/Interface Design

CONTRACT-041 owns the exact relationship shape and operation result;
CONTRACT-001 owns IDs/unknown preservation and CONTRACT-040 owns stable named
keys, provenance, strict/report and recovery. This TD wires those surfaces and
does not add a second reference resolver. Consumers select by exact
module/relationship ID and preserve full source context. The serialized
`target[].key` uses `Record.keys[].id`, not display name or native index name.
Cross-document identity/pinning is deferred
to the CONTRACT-001 successor and must not be guessed here.

## Data Model Changes

Reserve `module.relationships` only in the new explicit core version. Test old
unknown members with the same spelling before migration. No older document
acquires an association by default. Keep native refinements in extensions.

## Integration Points

TableSpec may initially refuse with a retained residual, but its native model
must be inspected. PostgreSQL/SQL Server need scoped FK/junction checks,
including alternate UNIQUE targets, `NOT VALID`/`NOCHECK`, composite `MATCH
SIMPLE`, and native action/trust details. Native classification records these
as observations, never authored identity, lifecycle or aggregate membership.
Avro and Parquet need qualified carriers and preserved bytes; they cannot
enforce references. GraphQL/RDF/LinkML are additional profiles, never
replacements for a priority target. Association Records need a keyed row
carrier and attribute preservation; a bare junction cannot satisfy them.

## Security and Performance

Use core copy/depth/node limits and exact reference traversal. Reject getters,
unsafe paths and malformed models atomically. Keep Bun/Node native tooling in
scripts; portable source must build for Chromium. No throughput claim.

## Testing

Map US-045-AC1–10 to cited tests. Check JSON/YAML recovery, unknown content,
strict/report pairs, ideal→native→ideal, native→ideal→native, original six
corpus shapes plus alternate-key, bounded and keyed-Enrollment cases, old-member
collisions, pinned native systems and real Chromium parity. Include `min:1,max:*`,
an empty-but-required association set, non-Record endpoints, composite nullable
FKs, untrusted FKs and foreign keys to UNIQUE rather than PK. Record
two useful priority mappings separately from all-five delivery and FR-28.

The native counterexample corpus is pinned independently of authored ideal
projection. `fixtures/relationship/postgresql-native/` records PostgreSQL
17.4 catalog state for a `NOT VALID` FK to an alternate UNIQUE key and a
composite `MATCH SIMPLE` FK; its SQL source survives the PostgreSQL adapter,
JSON/YAML recovery and Chromium. The existing
`fixtures/sqlserver/constraints-oracle.json` records SQL Server 2022's
untrusted FK state and UNIQUE target. These observations constrain future
classification and loss reports. They do not count as useful authored
down-projections or as proof that existing rows satisfy either FK.
`fixtures/relationship/graphql-native/` similarly records that two
object-returning SDL fields can share a target type while the schema alone
cannot distinguish association from computation. The GraphQL adapter,
GraphQL.js 17.0.2, GraphQL-core 3.2.12 and Chromium retain and validate the
native SDL without creating authored relationship intent. This is additional
up-classification evidence, not one of the two priority-system admission
down-projections.
`fixtures/relationship-native/` pins the TableSpec 1.0 native
`relationships.foreign_keys` carrier, RDF domain/range and OWL union-class
source-domain graphs, and a LinkML class slot with range and `multivalued`.
The native model/parsers and Chromium 148 recover the same source hashes through
the UMF adapter codecs. TableSpec's confidence value, RDF blank-node list and
LinkML slot metadata remain native refinements. These observations prepare
up-classification and residual tests; they do not prove authored projection,
named target-Key resolution, participation minima or native enforcement.

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

Heterogeneous endpoint types, both participation minima, lifecycle ownership
and association identity can be overclaimed by a single FK or GraphQL field.
Require residuals and native counterexamples. Before core publication, resolve
the final Key-ID serialization, relationship lineage across revisions, and how a
binding connects an association Record to endpoint-key columns. These are
design decisions, not authorization to infer semantics from storage.


## Experimental 0.7.0 implementation decision

The Key five-system gate is accepted in e3230451. Reserve
`module.relationships` only in the experimental 0.7.0 candidate schema. First
implement complete structural and semantic validation against unchanged keyed
Record semantics. Then integrate collision-preserving migration/rollback, typed
authoring/inspection and browser operations before core-task acceptance. Until
that integration, public `Document` support remains through 0.6.0; candidate
validation is explicit and older unknown module members remain uninterpreted.
Native binding admission and all-five delivery remain later separate gates.


### Transition implementation evidence

The candidate transition is implemented in `src/model/relationship-transition.ts`
with `spec/core/relationship-transition.schema.json`. Upgrade preserves every
legacy module collision in a source-qualified residual. Rollback restores the
original 0.6.0 document and retains all subsequent 0.7.0 content in its source;
it does not merge new assertions into the old interpreter. Receipt verification
recomputes the operation. Bun and Chromium evidence is recorded in the
[implementation plan](../../04-build/implementation-plan.md). Public operations
and full core-task acceptance remain separate from this candidate checkpoint.


### Public 0.7.0 integration

The staged public integration is now implemented: Document validation and
serialization accept 0.7.0, relationship operations are exported, and earlier
core operations use separate 0.7.0 receipt schemas. Older versions remain
unchanged. The public integration checkpoint is recorded in the implementation
plan; broad compatibility and complete core-task acceptance remain pending.

### Core implementation acceptance

The subsequent compatibility refresh and all required regression/conformance
tests passed. The experimental core implementation task is accepted in
[the acceptance record](../../../../fixtures/validation/relationship-core-acceptance-evidence.json):
1,494 tests across 352 files, 114 compatibility commands, 318 schemas and
53 extension packages. This supersedes the pending core-task status of the
checkpoints above. Native relationship bindings and the separate ideal-admission
and delivery gates remain required; US-045 is not complete.

### Experimental TableSpec native classification

`classifyTableSpecRelationships` observes the pinned TableSpec metadata profile
without creating authored relationships or upgrading its source envelope.
`umf.tablespec.relationships` has a complete observation payload schema; the
separate classification receipt schema supports source envelopes 0.1–0.7.
Foreign-key and outgoing metadata expose raw endpoint names and, where present,
the exact local source-column identity. Reverse/incoming and unknown metadata
remain native observations. Every observation retains its complete native tree.

`declared` means metadata was present with the recognized endpoint shape; it
does not mean the native schema, participation strings, confidence or join
expressions are valid. The operation does not establish remote target resolution,
stable target Key identity, enforcement or authored intent. Source-qualified
residuals retain these unknowns. Strict mode emits no candidate when residuals
remain; report mode retains them with a structurally valid copied target.
Conflicting extension content/version blocks in both modes. Receipt verification
recomputes the classification and rejects modified receipts or stale targets.
Native text and split-file bundles recover exactly, including unknown sidecars.

The [Chromium classification record](../../../../fixtures/validation/relationship-tablespec-classification-browser.json)
and Bun tests qualify this classification stage only. Authored down-projection,
ideal recovery, composition and full TableSpec binding acceptance remain required.
