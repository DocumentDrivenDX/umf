---
ddx:
  id: SPIKE-006
  type: tech-spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: FEAT-002
      kind: informed_by
    - id: CONTRACT-029
      kind: informed_by
---

# SPIKE-006: RDF/XML browser parsing and fidelity

## Objective

Determine whether a pinned JavaScript RDF/XML parser can support the remaining
US-029 syntax work in a real browser while preserving RDF meaning. This experiment
does not implement a public UMF RDF/XML adapter or change the RDF/OWL payloads.
Export syntax, edited-source round trips, limits, RDF version policy and complete
XML literal behavior remain implementation requirements.

## Hypothesis and method

Evaluate rdfxml-streaming-parser 3.3.0 as a development-only dependency. The
[maintainer documentation](https://github.com/rdfjs/rdfxml-streaming-parser.js)
describes browser bundling and namespace options; inspect the installed code and
measure behavior rather than rely on those claims. This version uses Saxes directly;
the documented `strict` option is not part of its installed constructor interface.

Test three profiles: unmodified baseline, a subclass that finalizes the internal
Saxes parser at stream end, and finalization plus `includeXmlNamespacesInLiterals`.
The subclass uses a private parser member and is experimental. Rejected inputs
report the count of already-emitted quads but return no partial graph.

Retain all 166 active entries of the W3C RDF/XML manifest at rdf-tests commit
369a90d1a60c021b746df2e411da0ff36258a758, their input/expected files, license and
SHA-256 inventory. Commented-out manifest entries are not active tests. Add ten
authored probes for basic types, collections, resource/language scope, XML literals,
duplicate IDs, undefined entities, truncation, empty input and trailing junk.
Compare with RDFLib 7.6.0 without literal value normalization. Preserve raw results
and separately compare language tags case-insensitively for RDF term identity.

## Findings

All three parser profiles match the 166 official accept/reject outcomes. Baseline
and finalized profiles match every available official expected graph. That corpus
does not expose all fidelity defects:

- Baseline accepts empty input, an unclosed root and an unclosed property. Installed
  3.3.0 never closes its Saxes parser at stream end. The experimental finalizer
  rejects all three, agrees with RDFLib acceptance on all 176 inputs and passes the
  official corpus unchanged.
- The authored XML literal loses an inherited namespace and emits the decoded
  attribute value `a&b` without XML escaping. Its lexical form differs from RDFLib
  and is not well-formed standalone XML. Finalization does not repair this.
- Enabling namespace inclusion does not fix the attribute escaping and introduces
  two exact graph mismatches in the official xml-canon cases. This option is not a
  general fidelity correction.
- RDFLib's raw graph-isomorphism comparison differs on EN versus en in the language
  probe. The separate case-folded comparison agrees; no literal value or XML lexical
  normalization is used to hide the actual XML-literal discrepancy.
- A direct Bun browser bundle selects `process/index.js` through readable-stream's
  `process/` import and fails with `global is not defined`. Explicit build-time
  resolution of `process` and `process/` to `process/browser.js` works without
  installing process or Buffer globals on the page.

Chromium matches Bun on all 528 runs (176 inputs times three profiles), including
the known baseline errors. Comparison retains quad order and normalizes local blank
labels for same-parser runtime parity; it is not the independent native graph test.
External requests are zero and Node globals are absent. Three focused tests pass
1,806 assertions. Type checking passes.

## Evidence and reproduction

- `native/rdfxml/probe.ts`: experimental parser/finalizer and comparison helper.
- `native/rdfxml/sources/sources.json`: pinned inventory, active cases and hashes.
- `fixtures/rdfxml/probe.json`, `corpus.json`: every parser outcome and graph.
- `fixtures/rdfxml/oracle.json`: independent comparisons and retained discrepancies.
- `fixtures/rdfxml/browser-probe.json`: Chromium parity for all profiles.
- `tests/rdfxml/feasibility.test.ts`: reproducibility and known-gap checks.

Run `bun scripts/rdfxml-probe.ts`, `bun scripts/rdfxml-corpus.ts`,
`.cache/rdf-venv/bin/python scripts/rdfxml-oracle.py`, and
`bun scripts/rdfxml-probe-browser.ts` (set UMF_CHROMIUM_PATH as needed).
`scripts/rdfxml-corpus-inputs.py` reconstructs the retained corpus from the pinned
local checkout. The browser process mapping is confined to the experiment build.

## Decision and remaining work

Browser feasibility is demonstrated; unmodified parser fidelity is insufficient.
Keep the package development-only while addressing XML literal serialization,
document finalization and explicit RDF 1.1 versus 1.2 policy. A public adapter must
retain original XML, provide complete payload schemas, preserve unknown content,
reject partial parsing, enforce resource limits, and prove native graphs after
both UMF serialization formats and edited RDF/XML export. Add namespace rebinding,
escaped text/attributes, CDATA, comments, processing instructions and external/internal
entity cases before selecting a repair. Full OWL structural parsing and reasoning
remain separate requirements. No concept is promoted into core by this experiment.

## Experimental XML literal repair

`native/rdfxml/literal-parser.ts` adds a fourth, explicit `literal-repair` profile.
It finalizes XML parsing, escapes decoded text and attributes, retains comments and
processing instructions, and serializes explicit namespace declarations plus bindings
used by element/attribute names. Scope is copied per literal element so nested or
sibling rebinding cannot leak. Ordinary literal text now accumulates across SAX
text/CDATA events instead of overwriting prior segments. This is deterministic XML
serialization, not canonical XML or full namespace-context capture.

The additional matrix contains 14 XML-literal cases and one ordinary CDATA case,
run before/after repair. The repaired profile also reruns the earlier ten probes
and 166 official cases, for 206 total experimental runs. All official acceptance
and exact graph comparisons still agree. The original inherited-prefix/escaped
attribute defect now agrees with RDFLib.

Seven authored XML-literal graphs still differ lexically from RDFLib. The retained
records distinguish attribute quoting and carriage-return escaping from RDFLib's
omission of comments, processing instructions, default namespace clearing, an
attribute-prefix binding and an explicit unused binding. No mismatch is reclassified
as exact RDF graph agreement. A separate minidom/Expat comparison checks expanded
element/attribute names, attribute values, coalesced text, comments and processing
instructions: all 14 repaired XML literals agree with the corresponding source
structures, versus three before repair. That comparison intentionally excludes
unused namespace context and QName interpretation inside values; it is not proof
of full XML Infoset or RDF literal equivalence.

Original baseline evidence remains unchanged. New results are in
`fixtures/rdfxml/literals.json`, `literals-oracle.json`, `literal-structure.json`
and `literals-browser.json`. Reproduce with `bun scripts/rdfxml-literals.ts`,
`.cache/rdf-venv/bin/python scripts/rdfxml-oracle.py --literals`,
`.cache/rdf-venv/bin/python scripts/rdfxml-literal-structure.py` and
`bun scripts/rdfxml-probe-browser.ts --literals`.

Before public integration, define the literal serialization contract, including
namespace context used only in values and inherited XML attributes. Continue entity,
chunking, version-policy and resource-limit checks, then implement the source-bearing
payload and edited-source round trips. This experiment still exposes no public UMF
RDF/XML import/export API.
