# RDF/XML feasibility experiment

This directory supports SPIKE-006, not an implemented UMF syntax adapter.
`probe.ts` tests rdfxml-streaming-parser 3.3.0 baseline and an experimental private
Saxes finalization hook. Sources are pinned to W3C rdf-tests commit
369a90d1a60c021b746df2e411da0ff36258a758 with license, hashes and all 166 active cases
in `sources/sources.json`. Additional authored inputs live in `scripts/rdfxml-probe.ts`.

Reproduce with `bun scripts/rdfxml-probe.ts`, `bun scripts/rdfxml-corpus.ts`,
`.cache/rdf-venv/bin/python scripts/rdfxml-oracle.py`, and
`bun scripts/rdfxml-probe-browser.ts`. Tests: `bun test tests/rdfxml`.

The baseline silently accepts three authored malformed XML inputs. The finalizer
rejects them. XML literal namespace/escaping defects remain, including two official
graph differences when namespace inclusion is enabled. These discrepancies are
retained in fixtures/rdfxml/oracle.json. Passing browser parity reproduces these
outcomes; it does not establish RDF/XML or OWL conformance.

The separate `literal-repair` profile in `literal-parser.ts` corrects escaping,
visibly used namespace bindings, comments/PIs and split character data. It retains
explicit namespace declarations but is not full namespace-context capture or XML
canonicalization. Run `bun scripts/rdfxml-literals.ts`,
`.cache/rdf-venv/bin/python scripts/rdfxml-oracle.py --literals`,
`.cache/rdf-venv/bin/python scripts/rdfxml-literal-structure.py` and
`bun scripts/rdfxml-probe-browser.ts --literals`. Separate reports preserve all
seven authored lexical graph differences from RDFLib; the independent XML structure
comparison must not be substituted for exact RDF term equality.
