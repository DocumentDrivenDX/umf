---
ddx:
  id: CONTRACT-028
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
    - id: US-028
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
---

# CONTRACT-028: SHACL graph and property-path interface

**Type:** library/schema. **Version:** 0.1.0. **Status:** draft.

## Purpose and Scope

Define SHACL 1.0 graph interchange and path metadata. The governing standard is
[W3C Recommendation 2017-07-20](https://www.w3.org/TR/2017/REC-shacl-20170720/).
Constraint execution remains required downstream work, not an implemented claim.

## Normative Surface

`umf.shacl` MUST use the RDF 1.1 payload from CONTRACT-025 plus `shaclVersion: "1.0"`.
The package is attached to element `dataset` in module `dataset`; blankNodeScope and
originalSource retain their RDF meaning. Schema and package live under
`spec/extensions/shacl/`. Native Turtle import requires explicit id/baseIRI and permits
an explicit blank scope. Export MUST retain unchanged source; edits regenerate syntax.
No imports or remote resources are retrieved.

`getShaclQuads` returns copies. `proposeShaclQuadEdit` replaces one existing occurrence
on a copied document. Invalid RDF, named-graph loss and unknown encoding MUST block the
operation. Unknown native predicates remain in the graph, without an execution claim.
Malformed SHACL graphs remain recoverable; successful import validates RDF representation,
not SHACL constraints. `inspectShaclDocument` MUST disclose this distinction.

`getShaclPropertyPath(document, shape)` returns the path tree described by
`path-schema.json`. Seven operators are predicate, sequence, alternative, inverse,
zeroOrMore, oneOrMore and zeroOrOne. Predicate carries iri; sequence/alternative carry
at least two paths; unary operators carry path. Shape blank labels belong to the shapes
graph scope. Graph triple duplicates count once. List cells may be IRIs or blank nodes,
while sequence heads MUST be blank. List annotations are retained; unary/alternative
nodes MUST have exactly one outgoing triple. Recursive paths and malformed lists throw.

`evaluateShaclPropertyPath(shapes, shape, data, focus)` returns a copied RDF term set.
The data argument MUST be an RDF document containing one graph; named datasets require
prior explicit graph selection. Focus blank labels belong to data's scope, never to the
shapes graph merely because their spellings match. No entailment is performed. Inverse
sequence evaluation reverses order and direction; closure terminates on visited values.
The return value is not a conformance report.

## Errors and Limits

Unknown representation fields block interpretation/export but not UMF recovery. RDF
limits apply: 4,000,000 source characters and 10,000 quad occurrences. Path compilation
is bounded by 10,000 structure steps and depth 128; evaluation by 1,000,000 work steps.
`SHACL_PATH`, `SHACL_LIMIT`, `SHACL_DOCUMENT`, `SHACL_PAYLOAD` and delegated RDF errors
throw without partial results or mutation. Native semantic unknowns are not erased.

## Compatibility and Verification

No promotion into core is established. Complete payload encoding does not establish
complete SHACL semantic support. Authored native comparisons and browser results MUST
be qualified separately from official conformance. AC3–5 of US-028 remain open.


## Core target selection

`getShaclTargetNodes(shapes, shape, data)` returns copied RDF terms under
`target-nodes-schema.json`. The shape node belongs to the shapes graph. Returned blank
nodes belong to the supplied data graph; labels MUST NOT create cross-graph identity.
Both arguments must be explicit single graphs. The function computes the union of
SHACL Core targets before deactivation or constraint evaluation. It is not a validation
report and does not establish whether the shape itself is well-formed in every respect.

Explicit node targets accept IRIs and literals, including nodes absent from the data.
Class, subjects-of and objects-of declarations require IRIs. Class traversal follows
`rdf:type/rdfs:subClassOf*` in the data graph, including cycles. Implicit targets require
SHACL-instance membership in NodeShape or PropertyShape and rdfs:Class in the shapes
graph; the resulting shape MUST be an IRI. Shapes-graph hierarchy triples are not
silently copied into data. Duplicate targets are returned once without normalizing
literal lexical values. Output ordering is not semantically significant.

Custom `sh:target` on the selected shape, `owl:imports` or `sh:entailment` declarations
block selection with `SHACL_TARGET_UNSUPPORTED`; the caller must explicitly resolve or
process those semantics first. Malformed target parameters throw `SHACL_TARGET`. Unknown
encoding remains blocked by the existing RDF/SHACL guards. No resource is retrieved.
Traversal is bounded by 1,000,000 work steps and returns no partial result on failure.

The target set is retained for deactivated shapes: deactivation belongs to validation,
not target-set calculation. Target tests therefore cannot establish constraint behavior.
Independent expected sets use RDFLib SPARQL property paths and graph queries over eight
inputs: the seven official target cases and one authored graph pair with separate scopes.
All named subjects are tested, including empty sets, to avoid selecting evidence based
on UMF's computed result. Full official validation-report execution remains open.


## Experimental constraint-engine proposal

`proposeShaclEngineValidation(shapes, data, {id, blankNodePolicy})` runs pinned
`rdf-validate-shacl@0.6.5`. It returns the copied source graphs, diagnostics, engine/version,
policy, `complete: false`, and status `evaluated` or `blocked`. Only evaluated outcomes
carry `engineConforms` and a full RDF report document. This boolean is the engine's
outcome, NOT a verified UMF conformance assertion. The complete report encoding is in
`engine-report-schema.json`; RDF report terms use CONTRACT-025.

`blankNodePolicy` MUST be explicit: `disjoint-inputs` prefixes the two blank-label spaces
separately; `shared-scope` requires equal declared blankNodeScope values and uses one
label space. Equal document IDs alone do not request shared identity. Report-local
blank identity is separately scoped by the requested report id. Native report graphs
may copy source structures or abbreviate sh:in lists; the proposal retains the entire
original graphs independently, so those report conventions cannot replace the source.

A fresh engine is created per proposal, with named RDF-list cells allowed. The engine's
silent repeated-check cutoff is disabled. Cyclic shape/list dependency edges or depth
above 128 are rejected before execution. Cyclic class hierarchies or path expressions
may still cause native failures, which produce blocked outcomes with no partial report.
General recursion semantics remain unimplemented. This conservative dependency check
also rejects unused cycles; the proposal does not claim complete shape well-formedness.

Imports, declared entailment, SPARQL, JavaScript, custom targets and rules are blocked.
Integer/decimal ordering now uses the exact profile below, correcting the known false
pass at 9007199254740993. Mixed float/double promotion uses the numeric profile below. Datetime and string-collation
fidelity still need further evidence. Input shapes/data remain
recoverable on these failures. No resources are fetched and no custom code is executed.

The initial official matrix executes all 98 pinned Core cases. All native conformance
booleans agree. Mandatory top-level result fields agree in all cases when equivalent
SPARQL path mappings are compared; raw path-subgraph isomorphism agrees in 89 because
nine expected reports duplicate equivalent path nodes where the engine shares them.
This comparison excludes messages, nested details, and blank-node identity relative to
source graphs. Those exclusions MUST NOT be represented as full report equivalence.
PySHACL 0.30.1 independently agrees with 97 booleans and 95 path-semantic projections;
its differences remain recorded, not treated as proof that either engine is authoritative.

Required follow-up: source-anchored report identity, messages/details, malformed-shape
validation, exact native datatype ordering, recursion/limits, and cross-system consumers.
This experimental proposal does not close AC3 or the overall SHACL support claim.


## Exact integer/decimal profile

Evaluated and blocked proposals MUST identify `numericProfile: "umf-numeric-2"`.
The engine label identifies the dependency; this profile identifies UMF overrides rather
than attributing their results to the unmodified dependency.

The profile implements exact integer/decimal ordering for minInclusive, minExclusive,
maxInclusive, maxExclusive, lessThan and lessThanOrEquals. Integer-derived types use
their exact bounds and lexical rules, including signed and unsigned 64-bit limits.
`sh:datatype` for this family also uses exact validation. Integer and decimal operands
compare by signed decimal digits and scale; values never pass through JavaScript Number.
Original literals, datatype IRIs, signs, whitespace and decimal spellings stay in source
and report terms. XML whitespace is accepted at lexical boundaries; non-XML whitespace,
exponent notation in decimals, malformed signs and invalid integer-derived bounds fail.
Zero spellings compare by value while their original terms remain distinct.

The semantic basis is [XSD datatypes](https://www.w3.org/TR/xmlschema11-2/) and
[SPARQL operator mapping](https://www.w3.org/TR/sparql11-query/#OperatorMapping).
Mixed decimal-family/float or double ordering follows the explicit promotion rules below.
Other native datatype behavior remains experimental. This
profile does not promote RDF datatype semantics to core or claim complete SHACL support.

Evidence: 75 authored cases across six ordering constraints and datatype boundaries,
with 150 browser evaluations after JSON/YAML recovery. PySHACL agrees in 71 and differs
on four datatype cases: out-of-range long, out-of-range unsignedLong, decimal exponent
notation and a non-XML trailing separator on integer. These differences are explicit,
not counted as independent agreement. The original 98 official booleans still agree.


## Binary numeric promotion (umf-numeric-2)

This profile supersedes the initial exact-decimal-only profile while retaining its
integer/decimal comparison and facet behavior. For the six ordering constraints, a
double operand promotes its partner to double; otherwise a float operand promotes its
partner to float. Float literals first enter their binary32 value space, even when then
promoted to double. Two decimal-family operands still compare exactly.

The rules follow [XPath numeric promotion](https://www.w3.org/TR/xpath20/#promotion)
and [XSD float/double values](https://www.w3.org/TR/xmlschema11-2/#float). Decimal-to-float
conversion rounds directly to binary32, nearest with ties to even; it MUST NOT round
through binary64 first. Binary64 lexical conversion uses JavaScript's Number conversion.
The declared type's promotion can intentionally equate distinct decimal values; it does
not rewrite or discard either source literal. Signed zeros compare equal; infinities
order normally; NaN is unordered and therefore fails all six ordering constraints.

Float/double lexical validation is included in sh:datatype. XML whitespace, exponent
notation, INF, +INF, -INF and NaN are accepted; malformed tokens and non-XML whitespace
are rejected. Finite lexical values can map to infinity or zero at datatype boundaries.
This is datatype interpretation, not a lossy source transformation.

Direct binary32 conversion uses exact integer ratios and midpoint comparisons. It is
bounded by 10,000 significant digits and decimal scale after normalization; conversions
beyond those limits produce SHACL_FLOAT_LIMIT without a partial report. Exponents whose
magnitude necessarily dominates the source-length limit saturate without constructing
huge powers. Existing RDF and shape limits remain in force.

The authored matrix covers 24 operand pairs across six constraints plus 16 datatype
cases. Native glibc strtof/strtod independently confirms every pair, including decimal
values just above binary32 midpoints that expose double rounding, subnormal ties, overflow
ties, type promotion, NaN, infinity and signed zero. This numerical evidence does not
establish complete SHACL report, recursion, datetime or string semantics.

## String interpretation (umf-string-1)

The experimental engine report records `stringProfile: umf-string-1`. Length
constraints count Unicode code points in the RDF lexical form, including IRIs;
blank nodes violate both length constraints. Combining characters and joiners count
individually. Six ordering constraints compare xsd:string operands by Unicode code
point, without locale collation or normalization. Other string datatypes and
language-tagged ordering still use the pinned engine and have no new conformance claim.

`sh:languageIn` uses case-insensitive basic language-range matching with a hyphen
boundary. A wildcard requires a nonempty language tag. This profile accepts basic
ranges and blocks other parameter strings; negative/noninteger length parameters
also block. These runtime checks are not complete static shape validation.

The rules derive from [SHACL string constraints](https://www.w3.org/TR/shacl/#core-components-string)
and [SPARQL string functions](https://www.w3.org/TR/sparql11-query/#func-strings).
The authored matrix contains 106 cases: 56 lengths, 42 order comparisons and eight
language matches. PySHACL 0.30.1 with RDFLib 7.6.0 agrees on 100. Its six differences
are four lengths of the lexical integer `001`, blank-node minimum length zero,
and the `en-US` range matching `en-US-x-private`. The normative lexical-length,
blank-node and basic-range rules determine UMF's expected results; native disagreement
is retained in `fixtures/shacl/string-oracle.json` rather than hidden.

Chromium evaluates all 106 cases after both JSON and YAML recovery: 212 evaluations,
424 source recoveries and 212 report recoveries, without external requests or Node
globals. Report comparison establishes same-engine browser/Bun parity only. Pattern
syntax, language-tagged ordering, malformed RDF lists and full static shape validation
remain outside this new evidence. No core semantic promotion follows from these tests.

## Constraint list structure preflight

Before engine construction, UMF checks lists referenced by `sh:in`, `sh:languageIn`,
`sh:ignoredProperties`, `sh:and`, `sh:or` and `sh:xone`. Each nonempty cell must have
exactly one distinct rdf:first and rdf:rest; the tail must terminate at rdf:nil,
which must have neither property. Literal cells and cycles block execution. These
checks follow the [SHACL list definition](https://www.w3.org/TR/shacl/#syntax-rule-SHACL-list).
Duplicate triples count once; named cells and shared tails are allowed. Sources
remain intact on rejection, with no partial report or engineConforms value.

The check applies to all occurrences of these predicates, including unused shapes,
and caps total traversal at 100,000 steps. It checks list structure only: member
shape validity, all parameter cardinalities and general static shape validation
remain open. Property-path structure retains its separate interpreter and limits.

## Declared shape metadata for consumers

`getShaclShapeMetadata(document, shape)` returns `shacl-metadata-1`, described by
`metadata-schema.json`. It describes the selected node and one level of distinct
`sh:property` references. Each node groups direct declarations into presentation
annotations, Core constraint parameters, controls/targets, and uninterpreted predicates.
Names and descriptions retain all languages; numeric hints and defaults retain their
RDF lexical forms and datatypes. No locale selection, numeric coercion, sorting,
default application or inferred requirement is performed. Presentation annotations
follow [SHACL property shape characteristics](https://www.w3.org/TR/2017/REC-shacl-20170720/#nonValidation).

Fields carry all distinct RDF values and source quad indexes, including duplicate
occurrences. Indexes refer only to the returned source snapshot, not later revisions.
The result retains a full copied UMF document, source blank-node scope, all unknown
extension content and referenced graph structure. Blank labels must be interpreted
within this scope. Compiled paths use the existing seven-operator interpreter; absent
and invalid paths remain distinct. Invalid paths and literal property references
produce diagnostics, retaining their original declarations in source. Undescribed
nodes are identified rather than populated with guessed metadata.

The result always has complete=false: grouping a constraint declaration neither
validates the shape nor enforces its constraints. Nested properties, logical branches,
groups, defaults and custom rules remain resolvable from the source; they are not
flattened into form requirements. Consumers may request referenced nodes separately.
This API is a metadata input for forms, agents and documentation, not a completed
form generator, cross-system projection or full FR-41 demonstration.
