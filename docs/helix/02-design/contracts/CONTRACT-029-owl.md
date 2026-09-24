---
ddx:
  id: CONTRACT-029
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-029
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
---

# CONTRACT-029: OWL RDF graph interface

## Scope

`umf.owl` 0.1.0 carries the RDF 1.1 payload plus `owlVersion: "2"`. This describes
an RDF-mapped OWL 2 graph, not an OWL 2 DL structural model or profile assertion.
The source is the [OWL 2 RDF mapping](https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/).

Turtle import/export MUST preserve unchanged source, terms, blank scope and unknown
predicates. Copied quad edits MUST retain unrelated envelope content and reject
invalid RDF atomically. Unknown encoding blocks interpretation/export. No imports
are fetched; all import/version/annotation triples remain in the graph.

`getOwlOntologyHeaders` returns copied, explicitly typed owl:Ontology subjects,
with declared version IRIs and import targets as RDF terms. It does not invent an
ontology for a headerless graph, merge multiple headers, resolve imports or infer
axioms. Invalid OWL syntax can still be valid RDF and is retained with incomplete
interpretation. JSON schemas cover the payload and header result.

No OWL reasoning, consistency, DL/Full profile, complete axiom parser or other
serialization support is claimed in this initial package. No core promotion.

## Local expression views

`getOwlExpressionView(document, node)` returns the `owl-expression-1` result described
by `expression-schema.json`. It recognizes local RDF encodings for intersection,
union, enumeration, class/data complement, inverse property, restrictions and datatype
restrictions. Members, property terms, fillers and facets retain RDF identity, order,
lexical values and duplicates in lists. Cardinalities remain typed literal terms;
no JavaScript numeric coercion or closed-world interpretation occurs.

This is a local constructor view, not the OWL DL reverse mapping. Object/data property
typing, filler legality, cardinality lexical validity, arities and profile restrictions
are not inferred or validated. Restrictions expose onProperty/onProperties and declared
quantifier/cardinality/onClass/onDataRange facets. Datatype facets retain every predicate
on their facet nodes. Named resources without a recognized constructor are references;
unrecognized blank expressions are explicit. Consumers can inspect referenced nodes
separately; this API does not recursively expand them or resolve imports.

Malformed list structure, missing/multiple required structural links and conflicting
constructors throw OWL_EXPRESSION without changing the document. Lists are bounded at
10,000 traversed cells. Successful results always have complete=false and contain a
full copied source snapshot, blank-node scope and the selected subject's quad indexes.
Unknown triples and all referenced structures remain in source. These indexes apply
only to that snapshot. Native RDF term annotations survive copying.

## Axiom annotation graph access

`getOwlAxiomAnnotations(document, quadIndex)` returns `owl-annotations-1`, described
by `annotations-schema.json`. It finds explicitly typed owl:Axiom reification nodes
whose annotatedSource/Property/Target match the selected triple by RDF term identity.
It follows typed owl:Annotation reifications of their nonstructural outgoing triples,
returning flat records and nested links. Each record exposes its target triple,
asserted source indexes and annotation source indexes. Multiple matching reifications
remain separate. Duplicate triple occurrences retain their indexes. This follows the
[OWL annotation RDF mapping](https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/#Translation_of_Annotations)
without claiming the full reverse structural mapping.

Datatype lexical differences are not equated by value. Resource identity includes
blank-node scope from the copied source. Missing/multiple structural reification
fields, literal sources, non-IRI predicates and nodes typed as both Axiom and
Annotation are listed in `malformed`; they are not arbitrarily attached. This list
covers all typed reifications in the supplied graph, including unrelated ones.
Unmatched and malformed content remains available in the full copied source.
Unknown predicates are exposed as candidate annotation triples without inventing
annotation-property declarations or validating OWL legality.

The selected index must exist. Results always have complete=false. They do not prove
that the selected triple is an OWL axiom, infer annotations, resolve imports, or
interpret n-ary/negative assertion encodings. Editing the selected assertion does not
automatically retarget reifications: consumers must make that semantic edit explicitly.
Nested records are a finite graph with visited-node traversal; no recursive flattening
or source mutation occurs. All returned indexes refer to the included snapshot.

## Negative and n-ary assertion views

`getOwlSpecialAxioms(document)` exposes explicitly typed NegativePropertyAssertion,
AllDifferent, AllDisjointClasses and AllDisjointProperties encodings. Its result
schema is `special-axioms-schema.json`. Negative individual and literal-value targets
remain distinct; inverse object-property expressions remain resource references.
Data assertions require IRI properties and literal targets. N-ary members retain
list order and repeated resources; AllDifferent accepts members or distinctMembers.

Conflicting types/structural links, invalid term roles, fewer than two members and
malformed/cyclic lists are reported in `malformed`. Complete source, including
annotations and unknown predicates, is copied into every result. No positive edge
is generated, no list is expanded to pairwise axioms, and no property/class typing,
inverse-expression validity, consistency, profile compliance or entailment is proven.
Results always have complete=false. Source indexes belong to the returned snapshot.
These are local RDF views, not the complete OWL reverse structural mapping.

## Explicit declaration access

`getOwlDeclarations(document)` returns `owl-declarations-1`, with complete=false,
copied source, blank-node scope, declarations and anonymous type assertions. It
recognizes the six explicit RDF declaration types in the
[OWL 2 mapping, Table 1](https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/#Translation_of_Axioms_without_Annotations):
owl:Class, rdfs:Datatype, owl:ObjectProperty, owl:DatatypeProperty,
owl:AnnotationProperty and owl:NamedIndividual. Records pair one named IRI with
one entity kind and retain every matching source occurrence index. Several kinds
on the same IRI remain separate, including combinations that require profile
validation. Duplicate triples do not create duplicate declaration records.

The same type triples on blank resources appear in `anonymousTypeAssertions`, not
in named declarations. They may describe anonymous expressions or invalid input;
this view does not classify their OWL legality. Other triples remain in copied
source. No entities are inferred from usage, built-in vocabularies or imported
ontologies. This does not implement declaration consistency, punning legality,
OWL profile validation or the complete reverse structural mapping. Output schema:
`spec/extensions/owl/declarations-schema.json`.

## List axiom access

`getOwlListAxioms(document)` exposes `owl:propertyChainAxiom`, `owl:hasKey` and
`owl:disjointUnionOf` as `propertyChain`, `key` and `disjointUnion` records. Each
record retains its subject, list head, ordered resource members, all matching main
triple indexes and traversed first/rest indexes. Distinct lists on the same subject
remain separate. Duplicate triples share a record but retain occurrence indexes;
repeated list members are never deduplicated. Blank expression references remain
references; key members are not guessed into object/data property partitions.

Chains and disjoint unions require at least two resources; keys require at least
one. A disjoint-union subject must be named. Literal/missing/conflicting list links,
cycles, structural triples on rdf:nil and lists beyond 10,000 cells produce a
malformed record with main triple indexes and a diagnostic. Other axioms still
remain accessible, and the complete copied source retains malformed and unknown
content. All indexes refer to that source snapshot. Results use `owl-list-axioms-1`,
have complete=false and follow `list-axioms-schema.json`.

These are local views of the OWL 2 RDF mapping, not full reverse structural parsing.
They do not prove property typing, inverse-expression validity, chain regularity,
class expression legality, key uniqueness, disjointness or entailment. In particular,
an OWL key is not lowered into a database unique constraint, and a chain is not an
instruction to create edges. Annotation lookup can use the main triple indexes.
