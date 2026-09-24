---
ddx:
  id: TD-028
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-028
      kind: informed_by
    - id: CONTRACT-028
      kind: informed_by
    - id: CONTRACT-025
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-028: SHACL implementation sequence

## Design

Reuse the existing RDF codec through a copied internal envelope. The SHACL package
retains all triples and adds an explicit language version; it does not reinterpret RDF
terms as UMF core entities. Native unknown predicates survive, while unknown encoding
fields block interpretation. TypeScript compiles into the browser bundle; Bun runs tests.

Compile paths into a discriminated tree independently of source preservation. Read lists
with cycle and cardinality checks; track active path nodes to reject recursive mappings.
Evaluate sets of RDF terms, reversing both sequence order and edge direction for inverse
paths. Closure uses a visited set and a bounded work counter. Exact literal lexical forms
remain strings. A data graph and shapes graph retain distinct blank scopes.

## Implementation and Verification

1. Source package, schema, copied edits and seven path operators.
2. Authored RDFLib native expressions independent of UMF path trees; JSON/YAML graph
   isomorphism and an edited count control. Record results and run Bun/Chromium parity.
3. Pin official SHACL corpus and implement target/constraint/report semantics. Include
   malformed and recursive shapes, severity/deactivation, and failure versus violation.
4. Add SPARQL/custom-component execution and explicit capability checks, then metadata
   consumers and cross-system projections with independent behavior comparisons.

Only steps 1–2 are underway. Later steps remain part of the accepted goal. Browser path
parity cannot prove constraint conformance. SHACL 1.2 needs a separate version inventory.


Core target selection now implements the first part of step 3. It indexes subclass
edges and computes a visited closure separately for shapes and data, unions the four
explicit target categories with implicit class targets, and preserves lexical terms.
The output schema is `target-nodes-schema.json`. Seven official target files plus an
authored graph pair produce 60 selection checks, including empty selections. Independent
SPARQL queries verify the hierarchy behavior. Constraint components and validation reports
are the next required part of step 3; no whole-SHACL conformance claim follows from targets.


The constraint-engine experiment uses rdf-validate-shacl 0.6.5 (MIT) as a pinned JS
implementation that bundles for browsers. The UMF wrapper preserves source graphs,
requires an explicit blank-node policy, exports the native report as RDF, rejects
unsupported execution declarations and cyclic shape/list dependencies, and disables
the native engine's silent repeated-check cutoff. Numeric boundary probes found an
unsafe integer false pass; conversion-changing integer/decimal values now block.

The official harness discovers 98 Core Validate cases from the pinned manifests and
retains all outcomes. PySHACL 0.30.1 / RDFLib 7.6.0 provide independent development-only
execution. Report comparisons preserve raw and path-semantic outcomes separately:
sharing of equivalent path blank nodes is not a semantic difference. Full report
identity, messages/details and datatype semantics remain unfinished and are explicit
in the API's always-false complete flag. No new semantic concept is promoted into core.


Exact numeric follow-up replaces the earlier conversion guard. A per-engine registry
installs six ordering validators and the integer/decimal datatype validator, then rebuilds
the pinned ShapesGraph because it binds validator objects during construction. No global
registry or installed dependency is patched. Signed digit/scale comparison and BigInt
facet checks preserve unbounded decimal-family values. The public report schema identifies
`umf-exact-decimal-1`; mixed float/double promotions remain blocked. Other native behavior
is unchanged and still experimental. Four PySHACL datatype discrepancies are retained.


Numeric profile 2 adds XPath mixed-type promotion. Direct binary32 conversion parses an
exact decimal ratio, binary-searches positive finite encodings, and resolves the midpoint
with ties to even. Overflow/subnormal boundaries and negative signs use the same rule.
Float literals are rounded before float-to-double widening; decimal operands promote
according to the other operand's declared datatype. Binary64 uses native Number parsing.
NaN returns unordered rather than relying on subtraction, which also fixes infinity-equal
comparisons. Native C conversion functions serve only as an independent development oracle.


### SHACL string profile evidence

`umf-string-1` implements code-point lexical length, xsd:string ordering and basic
language-range matching. The 106-case corpus and PySHACL comparison retain six native
disagreements; see CONTRACT-028 for their interpretation and limits. Chromium passed
212 JSON/YAML evaluations, 424 source recoveries and 212 report recoveries with no
external requests or Node globals. Reproduce with `bun scripts/shacl-strings.ts`,
`.cache/shacl-venv/bin/python scripts/shacl-string-oracle.py`, and
`bun scripts/shacl-string-browser.ts` (set UMF_CHROMIUM_PATH when needed).
This remains experimental engine evidence, not complete SHACL conformance.

### Constraint list structure

`lists.ts` indexes distinct rdf:first/rest values and validates lists used by the
six Core list-taking constraint parameters before native engine construction. A
checked-tail cache permits shared tails without treating them as recursion; each
walk tracks its own visited cells. The original envelope is never normalized.
Malformed lists produce the existing blocked proposal, not an empty constraint.

### Programmatic shape metadata

`metadata.ts` builds a subject index over a copied source graph, groups direct
predicates without coercion, and compiles paths with the existing interpreter. It
expands property links one level; cycles remain references. Source quad indexes give
consumers an edit location for the existing atomic copied-quad editor. Regenerating
metadata after an edit exposes the changed declaration without mutating the prior
view. Full source retention keeps custom rules, groups and unknown envelopes available.
