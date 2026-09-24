---
ddx:
  id: CONTRACT-027
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
    - id: US-027
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
    - id: CONTRACT-026
      kind: informed_by
---

# CONTRACT-027: JSON-LD generalized dataset JSON

**Type:** Library/schema. **Version:** 0.1.0. **Status:** Draft.

## Purpose and Boundaries

Preserve JSON-LD generalized RDF data with blank-node predicates independently from the
RDF 1.1 package. The native representation is JSON of the JSON-LD processor's RDFJS-shaped
quad records, not a claim that generalized N-Quads is standard RDF syntax. This subset permits
node subjects/predicates, node or literal objects, and default or named graphs. Literal subjects
and predicates, empty graph inventory, entailment and global blank identity remain out of scope.

## Normative Surface

The extension ID is `umf.generalized-rdf`, version/core version `0.1.0`, on the dataset element.
The complete payload and native dataset schemas are in `spec/extensions/generalized-rdf/`.
Payload fields are `profile` (`jsonld-generalized-dataset`), nonempty `blankNodeScope`, exact
NativeJson `root`, and `originalSource`. Root holds the full native JSON, including unknown fields.
Known quads contain subject, predicate, object and graph. Named/blank nodes contain termType
and value; literals add a named datatype and optional language; default graphs have empty value.
Named IRIs and language syntax follow AC15; datatype lexical validity is not an entailment check.

`importGeneralizedRdfDataset(text, {id, blankNodeScope?})` archives JSON; scope defaults to id.
`exportGeneralizedRdfDataset(document)` recovers original bytes when unchanged, otherwise emits
JSON from the exact tree. `getGeneralizedRdfQuads(document)` returns copied interpreted quads.
`proposeGeneralizedRdfQuadEdit(document, index, replacement)` edits an existing occurrence in a
copy, validates it, and retains originalSource. Arrays preserve occurrence order; dataset meaning
uses set semantics. The same blank value in all term roles denotes one node within its scope.

Unknown native structures MUST remain recoverable through JSON/YAML and native JSON but MUST
block quad interpretation and edits. Unknown UMF encoding fields MUST block native export and
interpretation while remaining recoverable through the core envelope. Invalid JSON cannot be
imported. Source length is limited to 4,000,000 characters; interpreted datasets to 10,000 quads.

## Precedence and Compatibility

Source scope and exact terms are authoritative. No operation may infer global blank identity.
RDF 1.1 APIs do not accept this package. Future versions must explicitly define any wider term
positions or syntax mappings; additional unknown fields do not authorize lossy interpretation.

## Error Semantics

Unsupported native terms/fields produce GENERALIZED_RDF_UNSUPPORTED warnings and interpretation
errors. Unknown encoding produces GENERALIZED_RDF_ENCODING and blocks export. Invalid indexes
or replacements fail atomically. A caller can recover the archived source and choose a different
projection; retrying unchanged unsupported semantics cannot make interpretation complete.

## Example

A quad whose subject and predicate are both `{ "termType": "BlankNode", "value": "b0" }`
retains that shared identity. Replacing only its literal object preserves the predicate and scope.
See the pinned t0118 and te075 fixtures for executable multi-quad examples.

## Validation

US-027 tests must verify both envelope formats, copied edits, unknown guards, term-role identity,
qualified independent comparisons and browser execution. No support claim extends to entailment
or every possible generalized RDF term position.
