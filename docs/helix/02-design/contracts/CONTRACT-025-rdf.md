---
ddx:
  id: CONTRACT-025
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-025
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-025: RDF dataset interchange

**Type:** library/schema. **Version:** 0.1.0. **Status:** draft.

## Purpose and Scope

Support RDF 1.1 N-Quads, Turtle and TriG with complete pinned official syntax/evaluation corpora. RDF terms remain in umf.rdf rather than being promoted to core. Reasoning profiles,
SHACL validation, other RDF syntaxes and native platform bindings are separate semantics.

## Normative Surface

umf.rdf 0.1.0 MUST store {profile,blankNodeScope,quads,originalSource} on module and element
dataset. Profile is rdf11-nquads, rdf11-turtle or rdf11-trig; Turtle/TriG additionally require baseIRI,
and TriG requires namedGraphs. spec/extensions/rdf/schema.json defines the complete payload. Each quad has
subject (IRI/blank), predicate (IRI), object (IRI/blank/literal), and graph (IRI/blank/default).
IRI and blank terms have kind/value; default graphs have kind only; literals have kind/value/
datatype plus an optional lowercase language tag. Terms MUST preserve literal text without JS
numeric conversion or datatype-value normalization. Language literals require rdf:langString.

importRdfNQuads(text,{id,blankNodeScope?}) defaults scope to the supplied document id. Scope is
local metadata, not proof of globally shared blank-node identity. Import MUST NOT fetch IRIs.
getRdfQuads(document) returns copied ordered occurrences. proposeRdfQuadEdit(document,index,quad)
replaces one existing occurrence on a copy and returns document/validation; failures MUST NOT
mutate input. RDF dataset meaning has set semantics even though occurrences/order remain stored.

exportRdfNQuads(document,{preserveSource?}) returns exact original bytes when terms are unchanged, otherwise a
regenerated N-Quads representation. The original archive remains in the edited UMF document.
Language-tag case and plain string syntax can normalize in the term model; original spellings
remain in the archive. inspectRdfDocument, rdfRegistry and rdfPackage expose qualified validation.
Source length is at most 4,000,000 characters, with at most 10,000 quad occurrences and core copy
limits. Registry structural checks precede term inspection. Native parse/render checks ensure
IRIs, labels and term positions survive serialization; they do not validate datatype lexical spaces.

## Compatibility and Error Semantics

Unknown payload, quad or term encoding fields MUST survive UMF serialization and cause
RDF_REPRESENTATION diagnostics; RDF_EXPORT blocks their lossy native export. RDF_SYNTAX/RDF_PROFILE
reject invalid or unsupported native syntax. RDF_UNICODE rejects unpaired UTF-16 surrogates before UTF-8 output can replace them.
RDF_LIMIT, RDF_LITERAL, RDF_TERMS, RDF_DOCUMENT,
RDF_PAYLOAD and RDF_EDIT identify bounds, literal/term, envelope or edit failures. RDF_CONTEXT keeps
interpretation incomplete. RDF 1.2 triple terms/directional literals are not reinterpreted as RDF 1.1.

N3.js 2.7.12 supplies a browser ESM parser/writer. The entire official RDF 1.1 N-Quads syntax
manifest at w3c/rdf-tests commit 369a90d1a60c021b746df2e411da0ff36258a758 has 87 cases: 53 positive,
34 negative. All match expected outcomes. An authored eleven-occurrence schema dataset adds
opaque OWL/SHACL declarations, duplicates, blank graph names, custom datatypes and exact lexical
numbers. No entailment, shape-validation or literal value-space support follows from this example.

## Independent Evidence

RDFLib 7.6.0, with literal normalization disabled, agrees on all 54 positive datasets and 76 edited
exports. The comparison reifies quad sets into graphs to check one blank-node isomorphism across
subject/object/graph positions. Plain literals are compared as xsd:string, and language tags are
lowercased for RDF 1.1 equality; source spellings remain archived. RDFLib accepts nine official
negative cases, recorded as accepted-negative rather than changing expected syntax results.
Chromium repeats 54 imports, 34 rejections, 108 source recoveries and 76 candidate exports with Node
globals absent. Blank-node canonicalization and cross-document merging remain
outside the current profile. Authority: [N-Quads Recommendation](https://www.w3.org/TR/n-quads/),
[official tests](https://github.com/w3c/rdf-tests/tree/369a90d1a60c021b746df2e411da0ff36258a758/rdf/rdf11/rdf-n-quads).

## Dataset-wide IRI rename (US-025-AC4)

proposeRdfIriRename(document,{from,to}) MUST return a copied source, from/to, status:candidate/blocked,
complete:false, changes, optional candidate and diagnostics. rename-schema.json defines the report.
IRI options have 1–4096 characters; malformed options throw RDF_RENAME_OPTIONS. Source and target
MUST differ and survive N-Quads term encoding without spelling changes. No URL normalization or
substring replacement is performed.

Every matching IRI in subject, predicate, object, graph and literal datatype positions MUST change.
The report records a native /quads/N/... pointer for every occurrence, including duplicates. Literal
text, language, blank labels/scope and unrelated terms MUST remain unchanged. Candidate documents
retain the original archive. Renaming changes identity explicitly; it is not an equivalence claim.
Datatype substitution may change value interpretation, and RDF_RENAME_CONTEXT MUST say so.

An already occurring target IRI blocks the proposal, including occurrences as a datatype. There is
no implicit coalescing policy. Missing source terms, no-op options, invalid IRIs, unknown encoding
fields and invalid resulting terms also block. For example, replacing rdf:langString on a language
literal cannot produce a valid candidate under this profile. Blocked reports MUST contain no
candidate and no partial changes. RDF_RENAME_NOOP/COLLISION/ABSENT/INPUT/INVALID identify these
outcomes. Core copy/input limits still apply. External documents and ontology/shape references
outside the supplied dataset are neither fetched nor rewritten.

The corpus renames a present IRI in each nonempty baseline positive source and adds explicit
all-position/datatype cases. Fifty-three cases yield 106 candidates across both UMF formats. Native
RDFLib computes expected replacements on parsed terms and verifies dataset isomorphism independently.
An all-position case retains two identical occurrences and changes nine positions, leaving literal
text containing the old IRI unchanged. Chromium repeats every candidate plus collision, missing-term
and invalid-language-datatype blocks. This does not establish OWL/SHACL execution equivalence.

## Turtle source and graph projection (US-025-AC5)

importRdfTurtle(text,{id,baseIRI,blankNodeScope?}) MUST require an explicit absolute base IRI of
1–4096 characters. Prefixes and base directives resolve into absolute term IRIs; no retrieval occurs.
exportRdfTurtle(document) returns the exact source when a Turtle profile's terms are unchanged.
Edited or cross-profile export uses absolute N-Triples syntax, a Turtle subset, retaining the
original archive but not regenerating its prefix aliases, list syntax or layout. exportRdfNQuads
MUST always emit N-Quads; it never returns a Turtle archive merely because terms are unchanged.

Turtle payloads cannot contain named graphs, and Turtle export from an N-Quads dataset with named
graphs MUST throw RDF_GRAPH_LOSS. Missing/invalid bases fail explicitly (RDF_BASE or syntax checks).
RDF version directives and RDF 1.2 term forms remain outside the RDF 1.1 profile. Existing N-Quads
payloads need no new field; an added baseIRI on that profile is uninterpreted encoding metadata.

Each Turtle parse allocates deterministic, disjoint local label spaces: generated nodes use g_N;
explicit labels use e_ followed by each Unicode scalar encoded as six hexadecimal digits. This
encoding preserves identity relationships, avoids explicit/generated collisions and avoids a
RDFLib N-Quads Unicode-label parser limitation. Exact source labels remain in originalSource.
Allocation is stable across unrelated parses and UMF serialization, not a graph canonicalization
algorithm or a promise of cross-document blank-node identity.

At the existing W3C corpus pin, Turtle has 313 cases: 145 evaluation cases, 74 positive syntax
cases and 94 negatives. UMF matches every syntax outcome and all 145 official expected graphs.
All 219 positive N-Quads projections and 204 edited outputs compare independently with RDFLib.
RDFLib's original Turtle parsing differs in eleven positive cases: seven numeric lexical changes
and four IRI-resolution differences. Those original-source differences are recorded separately
from successful exported-graph comparisons; they are never normalized into the UMF source model.
RDFLib also accepts 39 official negatives, which UMF rejects. Input bytes are decoded without
Python universal-newline translation so carriage returns in Turtle literals remain meaningful.
Chromium repeats 219 positive imports, 94 rejections, 438 original recoveries, 204 edited outputs
and named-graph-loss rejection. Authority: [RDF 1.1 Turtle](https://www.w3.org/TR/turtle/).


## TriG and empty named graphs (US-025-AC6)

importRdfTriG(text,{id,baseIRI,blankNodeScope?}) and exportRdfTriG(document) preserve RDF 1.1 TriG.
The same explicit base and deterministic scoped blank allocation apply as for Turtle. namedGraphs
stores declared IRI/blank names, including empty graphs; repeated declarations identify one graph.
getRdfNamedGraphs returns the union of that inventory and names present in quads, as copied terms.
At most 10,000 declared names are permitted, subject to the shared source/copy limits. Unknown
inventory encoding fields survive UMF serialization and block native export.

Unchanged TriG returns its exact archive. Modified/cross-profile output uses absolute graph blocks
and explicit empty declarations. Quad edits retain declared names even if their last quad moves.
IRI rename includes inventory occurrences and collision checks, with /namedGraphs/N/value paths.
It changes an empty graph name without changing blanks shared between graphs and ordinary terms.
N-Quads export MUST throw RDF_GRAPH_LOSS when any named graph is empty. Turtle export MUST reject
any named graph, whether empty or populated. Neither format may silently discard graph presence.

At the existing W3C pin, all 357 TriG cases match their expected syntax outcomes: 242 positives
and 115 negatives. All 143 evaluation quad sets match official expected N-Quads. An authored case
adds empty IRI/blank graphs with a blank shared across default/named graph triples. Across the
243 positive inputs, RDFLib verifies graph inventories, 239 available N-Quads projections, 216
literal edits and two empty-IRI-graph rename exports. Four inputs block N-Quads projection.
RDFLib differs on eleven original sources (seven numeric lexical and four IRI-resolution cases)
and accepts 48 official negatives; those remain explicit independent-parser disagreements.
Its graph store omits empty graphs, so the oracle observes RDFSink.newGraph during parsing and
includes presence markers in dataset isomorphism checks. Official expected N-Quads verify quads;
they cannot independently specify empty graph presence. Browser evidence repeats the corpus,
486 original recoveries, 216 edits, two renames and four blocked projections.
Authority: [RDF 1.1 TriG](https://www.w3.org/TR/trig/).


## Explicit dataset composition (US-025-AC7)

proposeRdfDatasetMerge(documents,{id,graphPolicy:'union-by-name',blankNodePolicy:'disjoint-inputs'})
MUST require both policies, 1–100 documents and a 1–4096 character output id. The report schema is
spec/extensions/rdf/merge-schema.json. Report fields include copied sources, options, status,
complete:false, blankNodes, quadOrigins, diagnostics and an optional candidate. Each input's
module dataset / element dataset payload is the selected RDF dataset; other envelope content
remains in sources. This is an explicit RDF projection, not a general UMF document merge.

Default graphs combine, and identical IRI graph names identify one output graph. Each input
occurrence receives fresh blank labels, even if documents, ids or blankNodeScope strings match.
Within an input, one label mapping MUST cover subject/object/graph positions and empty graph
inventory. Output labels m_INPUT_ORDINAL are deterministic for input order, not canonical IDs.
IRI strings, literal lexemes/datatypes/languages and quad occurrences MUST remain unchanged.
Duplicate occurrences remain represented although RDF graph semantics ignore multiplicity.
Named graph inventory MUST preserve empty graphs and union repeated IRI names.

blankNodes records {input,before,after}; quadOrigins records {input,sourceIndex,targetIndex} for
every occurrence. The candidate is a new TriG dataset with absolute terms and generated source;
full input archives and unknown envelope/extension metadata remain in the report's sources.
RDF_MERGE_CONTEXT MUST disclose that metadata is retained there rather than incorporated into
candidate RDF meaning. Unknown RDF encoding fields block instead of being reinterpreted. Invalid
inputs or aggregate limits block atomically with RDF_MERGE_INPUT, no candidate and empty maps.
Malformed options throw RDF_MERGE_OPTIONS. Non-JSON inputs and aggregate source copies exceeding
core copy limits throw before a report can be created. Existing source, quad and graph limits apply.
No shared-blank inference, graph canonicalization, ontology consistency or entailment is claimed.

The graph policy is a UMF operation choice: RDF 1.1 defines datasets and graph merge behavior but
not a universal interpretation for combining named graphs. References:
[RDF datasets](https://www.w3.org/TR/rdf11-concepts/#section-dataset) and
[RDF semantics](https://www.w3.org/TR/rdf11-mt/).


Evidence: all 516 positive baseline datasets paired with the authored empty/shared-blank input
produce 1,032 RDFLib and Chromium comparisons through both UMF formats. The independent oracle
uses regenerated absolute source terms, assigns fresh native blank nodes per input and compares
quad sets plus graph presence. Original-source parser differences remain in the baseline reports.
Bun verifies source retention, report schemas, blank mappings, per-occurrence provenance, repeated
identical inputs, duplicate quads, empty graphs and atomic unknown-encoding rejection.


The optional preserveSource flag defaults to true. Setting it to false requests regenerated
N-Quads syntax from validated terms, including unchanged datasets. It does not modify the stored
source, bypass unknown-encoding guards or permit empty-graph loss. CONTRACT-026 uses this explicit
term serialization at its RDF-to-JSON-LD processor boundary; raw source remains in the report.
