---
ddx:
  id: US-014
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-014: Preserve and edit Smithy native models

As a service-model author, I want exact Smithy JSON AST content available to browser
metadata tools, with candidate edits checked separately by the native model assembler.

- **US-014-AC1:** Recursive shapes, service operations, member traits and exact numeric
  metadata survive UMF JSON/YAML. Node access returns copies; candidate edits leave the
  original intact. Invalid AST field types fail structural checks.
- **US-014-AC2:** Unknown native fields, shape types and traits remain retained and
  incomplete. Unknown UMF representation fields survive UMF but block native export.
- **US-014-AC3:** Inventory every JSON fixture in the pinned upstream loader/valid tree,
  retain license and hashes, and round-trip every fixture. Compare native JVM acceptance,
  diagnostic IDs and canonical model hashes before/after UMF. Account for missing context
  rather than describing rejected fixtures as supported standalone models.
- **US-014-AC4:** Native assembly accepts an authored valid reference edit, changes its
  model hash, and rejects an unresolved target. Chromium preserves exact numeric tokens
  and offers candidate edits without claiming native semantic validation.

This begins the Smithy cycle. Native IDL, multi-file assembly, selectors, full trait
semantics, transformations and cross-system projection remain required work.

- **US-014-AC5:** Explicit dependency IDs and exact native ASTs survive bundle export,
  bundle re-import and UMF JSON/YAML. Reads and candidate edits can select a dependency
  without modifying the root or original. Single-file export must block rather than
  omit dependencies. Chromium exercises bundle retention and this export guard.
- **US-014-AC6:** Duplicate dependency IDs, malformed dependency ASTs and unknown
  representation fields cannot be silently accepted or discarded. Native JVM assembly
  compares two supplied-context bundles before/after round trip, observes valid edits,
  and rejects unresolved references and conflicting definitions.

- **US-014-AC7:** Preserve exact supplied `.smithy` and `.json` source text, comments,
  Unicode, numeric lexemes and file boundaries through UMF JSON/YAML. Candidate source
  replacement preserves the original; archive validity never certifies syntax.
- **US-014-AC8:** Reject empty archives and unsafe/non-model paths. Unknown source-profile
  representation remains in UMF and blocks native export. AST-only APIs reject source
  profiles explicitly. Browser checks exercise preservation and unvalidated edits.
- **US-014-AC9:** Inventory all pinned loader/valid IDL fixtures with hashes/license.
  Compare JVM assembly outcomes/events/canonical model hashes before/after source round
  trips. Verify a meaningful authored bundle edit and native unresolved-target rejection.

- **US-014-AC10:** A public assembly API accepts either supplied source archives or AST
  dependency bundles through an explicitly supplied trusted backend. Preserve original
  source, compiler identity, input mapping, exact native model JSON and native diagnostic
  locations/shape IDs. Results follow complete JSON Schemas. Assembled UMF model round
  trips and native reassembly retain canonical meaning across the pinned corpus.
- **US-014-AC11:** Runtime failures, malformed responses, native rejection and target
  import failure expose no assembled model. Isolate compiler inputs from retained source.
  Chromium assembles valid AST/IDL and preserves diagnostics for invalid source.

- **US-014-AC12:** An explicitly supplied module-worker URL runs assembly outside the
  page thread. Every call gets a fresh worker. Completion, failure, cancellation and
  deadline expiry terminate it exactly once. Pre-cancelled requests create no worker.
  Cancellation/deadline results preserve source and expose no model. Chromium verifies
  native valid/invalid assembly and page responsiveness during a nonterminating worker.

- **US-014-AC13:** Inventory every model file in the pinned upstream invalid-loader
  subtree with hashes and license. Preserve exact source through UMF YAML, compare
  public JavaScript outcomes and event severity/ID multisets with unmodified JVM
  assembly, and retain source without partial models after rejection. Record native
  exceptions separately from validation diagnostics. Chromium repeats the corpus
  comparison; unsupported behavior must fail the gate rather than be excluded.

- **US-014-AC14:** Query either source profile using the native Smithy selector engine
  after assembly. Preserve source/assembly diagnostics and return sorted unique native
  shape IDs, including member/prelude IDs. Define full response schemas; malformed
  responses, invalid selectors and assembly failures expose no partial shape set.
  Compare every expression in the pinned upstream selector/cases corpus against both
  expected matches and unmodified JVM results. Repeat native selection in Chromium.

- **US-014-AC15:** Run native shape-set selection in disposable module workers with
  cancellation and per-stage deadlines. Stop before selection when assembly is cancelled;
  selection cancellation/timeout preserves successful assembly and source but exposes no
  shape set. Verify fresh-worker recovery and responsive-page behavior in Chromium,
  including native valid and invalid selector results.

- **US-014-AC16:** Provide explicit native Smithy-to-JSON-Schema emission for a named
  versioned configuration profile. Retain source, assembly evidence, converter identity,
  native output and loss issues. Strict policy blocks targets; allow-reported-loss blocks unresolved references and
  reported target validation/compile errors. Exact-number limits that prevent JavaScript
  compilation remain explicit and require independent target evidence. Compare all declared data roots from the complete
  upstream converter source-resource corpus with the JVM. Independently verify target
  instance behavior and retain failing native conversions/reference outputs as evidence.

- **US-014-AC17:** Offer an explicit root-definition emission profile that uses the
  native converter's chosen pointer and typed root schema to resolve recursive roots.
  Retain original and adapted output, report the representation change, and keep strict
  policy blocked. Compare every corpus root with the JVM. Validate recursive instances
  independently after target UMF round trip; preserve exact numeric defaults and literal
  reference-like text. Missing backend capability or occupied pointers must fail closed.

- **US-014-AC18:** Provide a caller-selected native service-context emission profile.
  Require an existing service and a data root in its native closure; use declared
  service renames without collapsing qualified shape identities. Preserve source,
  context policy and both output forms. Compare all applicable source service/root
  combinations with the JVM, including outside-context rejection. Independently test
  distinct same-named shapes and different per-service enum constraints after round trip.
