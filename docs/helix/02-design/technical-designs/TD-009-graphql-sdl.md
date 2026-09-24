---
ddx:
  id: TD-009
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: US-009
      kind: informed_by
---

# TD-009: GraphQL SDL AST and source archive

Parse with pinned GraphQL.js and bounded tokens, remove parser-only metadata and
undefined optional properties, then apply core JSON copying limits. Generate a
complete versioned JSON Schema from reachable SDL types, excluding source-location
objects and executable grammar. A development-only TypeScript 5.9.3 compiler-API
alias performs schema generation; TypeScript 7 remains the normal compiler and
Bun the development runtime. No compiler API enters the browser library.

Semantic inspection builds and validates a native schema. Unknown AST properties
are reported before printer use; custom scalar/directive behavior and grammar
additions are explicitly incomplete. Canonical AST comparison ignores property
insertion order while preserving arrays and literal strings. Unchanged AST exports
original source; changed AST prints current declarations and retains the original
archive. A print/parse discrepancy blocks export and conservative editing.

Tests compare native AST and source, execute an edited default, preserve unsafe
integer literal strings and reject semantic contradictions. The Python GraphQL-core
oracle checks query results and coercion in another runtime but shares lineage with
GraphQL.js. Browser checks execute the actual bundled ESM. Official corpus and
cross-system projections are the next coverage steps.

The upstream corpus distinguishes grammar acceptance from standalone schema validity.
An explicit fragment mode skips schema construction while preserving structural AST
and print/parse checks; it always reports incomplete interpretation. This accommodates
SDL extension files without silently assuming roots or definitions. Composition into
an executable schema remains separate work.

The extraction script uses the pinned compiler API to read direct static literal
arguments from upstream parser tests, without executing test code. It records
excluded dynamic call-site lines and preserves upstream sources/hashes/license.
Full GitHub-schema introspection is compared in GraphQL-core; the expected one-case
directive-extension grammar difference is pinned and fails if it changes unnoticed.
