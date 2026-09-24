---
ddx:
  id: TD-025
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-025
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-025: Browser RDF dataset terms

## Technical Approach

Store explicit RDF terms and original N-Quads bytes, with a local blank-node scope. Use the pinned
N3.js browser ESM distribution through a typed shim. The library supplies syntax handling; UMF
rejects RDF 1.2 term kinds and checks regenerated term equality. CONTRACT-025 owns the public
surface and limits. No RDF semantics are lifted to core.

## Components and Integration

rdf-sources.py captures every official manifest case with license and source hashes. rdf-schema.ts
materializes the extension package and full term/quad payload schema. src/adapters/rdf/index.ts
provides copied access and atomic quad replacement; source remains authoritative for unchanged
export. Unknown encoding fields block native output. Source IRIs are opaque and never fetched.
Core serialization supports both UMF formats without numeric conversion of literal text.

## Validation and Risks

rdf-roundtrip.ts covers every official case plus authored schema metadata and literal edits.
The independent RDFLib oracle disables numeric literal normalization and compares reified datasets
up to blank-node isomorphism, including blank graph names. Native parser permissiveness is recorded
separately from W3C expectations. Bun verifies corpus hashes, round trips, atomic failures, duplicate
occurrences, exact lexical numbers and unknown fields. Chromium tests the public API without Node
globals. The browser ESM dependency avoids relying on Node stream modules at runtime.

Other syntaxes, isomorphism/canonicalization APIs, entailment, SHACL, OWL and
cross-system projections remain open. Limits are explicit rather than performance promises; Bun
remains the development/test runtime. The package is additive and can be removed independently of
other adapters; no persisted core migration is required.

AC4 adds an atomic IRI rename proposal and complete report schema. Enumerate exact RDF term/datatype
occurrences first, reject target collisions across all roles, then mutate a private payload and
validate native export before exposing a candidate. Diagnostic reports retain the copied source;
failed candidates never expose a partial change list. Literal text and blank scope are never searched
for replacements. Native comparison helpers are shared by the original and rename oracles, with
independent expected rewrites performed on RDFLib terms. The 106-export matrix covers all nonempty
baseline cases plus explicit all-role and datatype cases. Browser checks include three atomic guards.

AC5 adds a Turtle profile with required base context to the existing term model. The parser factory
allocates deterministic ASCII blank labels in disjoint explicit/generated spaces. This avoids
cross-parse counters and Unicode-label limitations in the independent N-Quads oracle while keeping
source labels archived. Term validation still uses N-Quads and exact model comparison. Turtle
exports reject named graphs; modified Turtle uses an absolute N-Triples representation. Profile-aware
export prevents the existing N-Quads API from returning an unchanged Turtle archive.

The full 313-case corpus includes official expected graphs for 145 evaluations. The oracle distinguishes
original native Turtle results from output comparisons: seven numeric lexical and four IRI-resolution
differences stay explicit, as do 39 accepted-negative results. All 219 N-Quads projections and 204
edits compare successfully. Python input uses raw UTF-8 decoding without newline translation.
Bun verifies source hashes, stable labels, base behavior, exact number lexemes and graph-loss guards;
Chromium repeats the entire corpus. N-Quads/rename tests remain regression gates. RDF/XML,
JSON-LD, ontology/shape execution and cross-system projections remain open.


AC6 adds TriG and a graph-name inventory because quad lists alone cannot represent empty graphs.
The pinned N3.js 2.7.12 parser's private _readGraph hook captures each named declaration, including
anonymous names and empty blocks. Missing hook detection fails explicitly; dependency upgrades
require the complete corpus and targeted empty-graph checks in Bun and Chromium. This private API
is a maintenance risk. Regeneration emits graph blocks plus empty declarations; export guards
prevent N-Quads/Turtle from losing presence. IRI rename checks/mutates inventory and quad terms.
Graph names undergo exact N-Quads probe validation before rendering.

rdf-trig-sources.py vendors the complete 357-case manifest at the existing source pin. The native
oracle observes RDFLib graph creation because its dataset store discards empty graph declarations.
Presence markers join reified quads so one isomorphism mapping covers blank graph names and terms.
An authored shared-blank case checks two-format literal edits and empty-IRI renames. Official
expected N-Quads validate 143 quad sets; independent graph inventory evidence is separate. Eleven
native source disagreements and 48 accepted negatives remain recorded. No semantic-web concepts
are promoted into core by this syntax work.


AC7 implements explicit dataset composition. Validate/export each selected payload before use;
allocate a private Map per input, then remap every blank occurrence and graph inventory name.
Concatenate quad occurrences with source-index provenance and union graph inventory by term key.
Validate the complete candidate before exposing any mappings. Unknown RDF encoding causes an
atomic blocked report. The full copied source list retains arbitrary metadata that the RDF-only
candidate does not interpret. The explicit graph policy prevents treating this as a general UMF
merge or inferring blank sharing from identical scope strings.

rdf-merge.ts pairs every positive N-Quads/Turtle/TriG baseline with the authored empty/shared-blank
dataset. Native oracle inputs are regenerated absolute TriG from the selected terms, bypassing
original-source numeric shorthand differences; original corpus evidence remains separate. RDFLib
independently assigns fresh blanks per input and compares the combined dataset and graph inventory.
The shared TriG oracle helper observes empty graph declarations. Bun checks report schema, source
retention, blank maps, quad origins and two-format exports; Chromium repeats the full matrix.
