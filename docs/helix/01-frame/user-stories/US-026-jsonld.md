---
ddx:
  id: US-026
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-026: Preserve JSON-LD sources and explicit context expansion

**Feature:** FEAT-002 NAT-01–04. **PRD:** FR-1/5/6/12/37/39/41. **Priority:** P0.

## Story and Context

As a metadata integration author, I want JSON-LD source and context meaning to remain inspectable
and editable without undeclared retrieval or numeric rounding. Expansion may intentionally discard
unmapped values; that behavior must be visible instead of being advertised as lossless interchange.

## Walkthrough

Import JSON with a base IRI, processing mode and supplied contexts. Inspect or edit a native pointer,
round-trip through UMF JSON/YAML, then propose expansion with an explicit report/reject loss policy.
Compare candidate expansion against official expected documents and an independent native processor.

## Acceptance Criteria

- **US-026-AC1:** Complete extension/payload/report schemas preserve exact JSON source, numeric
  tokens, unknown native content and all supplied contexts. Both UMF formats recover unchanged input;
  copied pointer edits regenerate JSON without changing unrelated values or original archives.
- **US-026-AC2:** Expansion uses only supplied contexts and explicit base/processing context.
  Duplicate URLs, missing context, unsupported numeric operations and unknown representation fields
  fail explicitly. Reports retain source, resources used, processor events and interpretation limits.
- **US-026-AC3:** Exercise every case in the pinned official expansion manifest, preserving even
  semantically invalid inputs. Record expected failures and all discrepancies. Compare candidates
  with official output and an independent processor; repeat in Chromium without Node globals.
- **US-026-AC4:** Verify loss rejection, context isolation, edited candidate expansion, exact numbers,
  unknown content retention and no network fallback using authored cases in Bun and the browser.

- **US-026-AC5:** Apply a nesting term’s scoped context while expanding nested values, without
  leaking it into sibling properties or treating opaque JSON literals as context declarations.
  Support recursive and remote scoped contexts, aliases, protected terms, invalid nested values
  and copied edits. Pin any processor patch and repeat the complete expansion/browser matrix.

- **US-026-AC6:** Honor explicit JSON-LD 1.0 term-definition and prefix-expansion behavior,
  including IRI-shaped aliases and blank-node prefixes, without weakening 1.1 constraints.
  Preserve lexical values and source mode through edits and both UMF formats. Verify paired-mode
  authored cases, the full official corpus, browser execution and fresh patch installation.

- **US-026-AC7:** Preserve exact numeric values through expansion, including JSON literals,
  large integers, precise decimals, negative zero and extreme exponents. Numeric values must not
  acquire string language/coercion semantics. Any unsupported arithmetic/coercion fails explicitly.
  Compare exact native expected tokens and independent decimal-aware expansion in Bun and Chromium.

- **US-026-AC8:** Propose flattening with an optional explicit target context and compactArrays option.
  Preserve source/context archives, report warnings and reject undeclared retrieval. Verify all pinned
  flattening cases, precise numeric duplicate handling, ordered lists, named graphs, blank nodes,
  copied edits and target-context compaction in Bun and Chromium against independent native evidence.

- **US-026-AC9:** Propose standalone compaction with an explicit target context, compactArrays
  and compactToRelative options. Retain source and target context, exact numbers, ordered lists
  and opaque JSON. Run the entire pinned compaction corpus, native comparisons, edits and browser
  checks. Report every discrepancy and reject missing contexts, unknown representation and loss
  events under reject policy.

- **US-026-AC10:** Propose framing with a required copied frame and explicit framing options.
  Preserve complete source/context archives and report that selection, embedding, defaults and
  graph merging can change meaning. Support exact numeric values, cycles as references, named
  graphs, defaults and copied edits; verify the complete pinned framing corpus and native/browser
  outcomes. Missing resources and rejected warning events must block atomically.

- **US-026-AC11:** Validate framing flags and identifier/type patterns before matching any subjects, including nested and
  aliased flags on empty input. Reject invalid embeds, non-boolean flags and flag arrays with
  invalid cardinality; retain legacy mode rules. Exclude opaque value/default data from frame
  validation. Verify archived rejected frames, mode controls and browser/native differences.

- **US-026-AC12:** Project an RDF dataset into JSON-LD with explicit native-type, rdf:type and
  direction options. Retain source in the report, preserve empty named graphs, exact numbers and
  JSON literals, and disclose lexical/datatype conversion. Run every pinned fromRDF case and
  authored edits/guards in Bun and Chromium; record unsupported direction behavior explicitly.

- **US-026-AC13:** Project JSON-LD to an RDF dataset using explicit contexts, base, mode, direction
  and loss policy. Retain complete source and context archives in the report. Reject unsafe numeric
  conversion, disclose dropped annotations/direction/graph inventory, and record every pinned
  toRDF corpus outcome and independent native discrepancy. Verify edits and both UMF formats in
  Bun and Chromium. Unsupported cases remain required work, never counted as conformance.

- **US-026-AC14:** Convert directional JSON-LD values to RDF compound literals with fresh
  blank nodes, plain rdf:value/rdf:direction and optional lowercase rdf:language. Keep components
  in the reference graph and preserve list order and direction distinctions. Verify both official
  direction cases, authored graph/list controls and reverse conversion through JSON/YAML in Bun
  and Chromium. Reproduce the processor patch from a fresh installation.

- **US-026-AC15:** Emit only well-formed RDF terms. Validate generic RFC 3987 IRI components
  and BCP47 language syntax without normalization. Report every omitted malformed term and
  block under reject policy. Validate graph/subject/property before generating list components;
  retain list rest links when an invalid first value is omitted. Verify official invalid-term
  cases, authored graph/list/language controls, native disagreements and browser execution.

- **US-026-AC16:** Preserve RFC-permitted Unicode spacing characters in IRIs during
  classification, expansion, flattening, compaction, framing and RDF conversion. Keep ASCII
  whitespace invalid. Exercise graph, subject, predicate, object and datatype roles, both UMF
  formats, reverse projections and browser execution; record independent processor limitations.

- **US-026-AC17:** Make RDF numeric conversion policy explicit: strict by default, optional
  binary64 conversion with path-specific loss diagnostics and rejection under reject policy.
  Preserve original numeric tokens, distinguish typed strings from JSON numbers, correctly
  serialize small exponent-form numbers, and block non-finite JSON overflow. Verify official
  JCS/numeric expectations, authored boundaries, native differences and browser results.

## Dependencies and Remaining Work

CONTRACT-001 and ADR-002 govern the envelope and runtimes. CONTRACT-026 defines this extension.
Remaining framing compatibility gaps, HTTP/HTML loading, RDF projection and their native corpora
remain required follow-up work. Expansion evidence does not establish RDF or ontology equivalence.
