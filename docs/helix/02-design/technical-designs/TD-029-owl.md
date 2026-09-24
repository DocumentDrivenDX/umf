---
ddx:
  id: TD-029
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-029
      kind: informed_by
    - id: CONTRACT-029
      kind: informed_by
---

# TD-029: OWL RDF graph adapter

## Design

Reuse the RDF adapter for source envelopes, lexical terms, graph checks and copied
edits. Keep the OWL version marker separate from RDF syntax profile. Expose declared
ontology headers without choosing a canonical ontology IRI or following imports.
Independent RDFLib graph isomorphism checks regenerated Turtle after UMF JSON/YAML
recovery; browser tests exercise identical APIs. W3C Primer's full Turtle sample is
the first external fixture, with retrieval hashes and extraction provenance.

Subsequent work must add structural OWL axiom/expression APIs, other syntaxes,
profile checks, reasoning evidence and projections. RDF graph equivalence alone
does not prove those capabilities.

### Expression metadata implementation

The expression reader builds a subject/predicate index with RDF-set value semantics,
then reads one constructor without recursively guessing class/data categories. RDF
lists use a visited set and traversal cap, retaining member order and repeated terms.
Restriction and datatype facet literals remain exact RDF terms. The complete source
snapshot carries annotations, unrecognized rules and referenced nodes for later work.
Recursive OWL structural parsing and validated lowering remain separate requirements.

### Axiom annotation lookup

Build subject and exact-triple indexes once, recognize typed reifications with one
source/property/target, and index those by target. Start from matching owl:Axiom
records and traverse owl:Annotation matches for their candidate annotation triples.
Return flat links with a visited set and source indexes; preserve all unrecognized
content in the copied envelope. No property declaration inference or datatype value
normalization participates in matching.

### Declaration metadata

Scan copied quads for the six explicit entity type IRIs from the OWL 2 RDF mapping.
Index each result by subject kind, subject value and entity kind, retaining source
occurrence indexes. Keep each role separate even when the IRI is shared. Partition
named declarations from anonymous type assertions without treating the latter as
automatically malformed. Return the complete source and its blank scope; infer no
types from property use, expressions, imports or built-ins. The independent RDFLib
comparison checks named role sets and anonymous role counts, while Bun and Chromium
also check occurrence indexes and copied edits.

### List axiom metadata

Index main triples by subject, predicate kind and exact list head; index outgoing
triples by subject. Traverse each list with a visited set and a 10,000-cell limit,
checking unique first/rest values while retaining duplicate occurrence indexes.
Keep list members ordered and repeated values intact. Return malformed main records
individually so one damaged axiom does not conceal unrelated source metadata. Keys
retain unclassified resource references; object/data property partitioning requires
the still-unimplemented structural type analysis. Annotation APIs can reuse the
reported main triple indexes without synthesizing annotation links.
