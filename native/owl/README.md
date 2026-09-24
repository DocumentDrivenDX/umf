# OWL source evidence

`primer.html` is the W3C OWL 2 Primer Second Edition (2012-12-11), retained with its
copyright/license notices. `scripts/fetch-owl.py` retrieves it, extracts appendix 13's
Turtle block and writes hashes and extraction details in `sources.json`.

`primer.ttl` retains the published syntax error: a period inside the hasSelf blank
node property list. Both N3 2.7.12 and RDFLib 7.6.0 reject it. The separately named
`primer-corrected.ttl` removes only that period; `corrections.json` records the exact
change and hash. Other source quirks, including owl:subClassOf, remain untouched.
Do not present the corrected fixture as the unmodified W3C source or an OWL-valid ontology.

`authored.ttl` adds exact large cardinality, punning, property-chain lists, annotation
and unknown-policy examples. RDF graph preservation does not validate their OWL meaning.
No imports are fetched, including those in the W3C sample.

Reproduce: `bun scripts/owl-schema.ts`, `bun scripts/owl-roundtrip.ts`,
`.cache/rdf-venv/bin/python scripts/owl-oracle.py`, `bun test tests/owl`, and
`bun scripts/owl-browser.ts` (set UMF_CHROMIUM_PATH when needed). The independent
oracle checks graph isomorphism for regenerated Turtle after both recovery formats.
OWL profiles, structural axiom APIs, RDF/XML/Functional/Manchester/OWL XML syntax,
reasoning and consumer projections remain required work under US-029.

`expressions.ttl` exercises local constructor and restriction metadata. Regenerate
schema/evidence with `bun scripts/owl-expression-schema.ts`,
`bun scripts/owl-expressions.ts`, and
`.cache/rdf-venv/bin/python scripts/owl-expressions-oracle.py`. The independent
comparison covers constructor counts and list/facet lengths for 44 expressions,
not OWL reasoning or complete RDF-to-structural mapping.

`annotations.ttl` covers repeated axiom reifications, nested annotations, exact
lexical matching and malformed records. Reproduce with
`bun scripts/owl-annotation-schema.ts`, `bun scripts/owl-annotations.ts`, and
`.cache/rdf-venv/bin/python scripts/owl-annotations-oracle.py`. RDFLib agrees on the
reification graph's two roots, four reachable records and nested links. This evidence
does not validate annotation-property declarations or OWL axiom legality.

`annotation-cases/` is a generated authored identity/malformed-input matrix. Run
`bun scripts/owl-annotation-cases.ts`, then
`.cache/rdf-venv/bin/python scripts/owl-annotation-cases-oracle.py` and
`bun scripts/owl-annotation-cases-browser.ts`. The 15 cases compare exact term matching
and malformed classifications independently; duplicate occurrence provenance is
checked in Bun/Chromium rather than by RDFLib's graph-set representation.

`declarations.ttl` is an authored boundary fixture for the six explicit RDF entity
roles. Its overlapping roles deliberately include combinations whose OWL DL legality
is not established; anonymous typed resources and unknown types remain preserved.
Run `bun scripts/owl-declarations-schema.ts`, `bun scripts/owl-declarations.ts`,
`.cache/rdf-venv/bin/python scripts/owl-declarations-oracle.py`, and
`bun scripts/owl-declarations-browser.ts`. The 12 cases cover this fixture, authored.ttl
and primer-corrected.ttl through both UMF formats before/after copied declaration edits.
RDFLib checks explicit named role sets, anonymous role counts and changed subject
presence. Bun/Chromium additionally check source occurrence indexes and exact views.
This is declaration metadata access, not an OWL profile validator or reasoner.

`list-axioms.ttl` is an authored chain/key/disjoint-union fixture with ordered and
repeated members, multiple axioms, duplicate triple occurrences, an annotation and
malformed list cases. Run `bun scripts/owl-list-axioms-schema.ts`,
`bun scripts/owl-list-axioms.ts`, `.cache/rdf-venv/bin/python scripts/owl-list-axioms-oracle.py`,
and `bun scripts/owl-list-axioms-browser.ts`. Twelve cases compare this fixture,
authored.ttl and primer-corrected.ttl through both formats and copied member edits.
Native comparisons abstract blank resource identity; exact scope and occurrence
indexes are checked by Bun and Chromium. The source semantics follow the
[OWL 2 RDF mapping](https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/),
but these local views do not perform its full reverse structural/type analysis.
