---
ddx:
  id: CONTRACT-009
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-001
      kind: informed_by
    - id: US-009
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-009: GraphQL SDL preservation

The `umf.graphql` 0.1.0 extension represents schema SDL using the pinned
GraphQL.js 17.0.2 grammar. The normative reference is the
[September 2025 GraphQL specification](https://spec.graphql.org/September2025/).
Runtime grammar additions, such as directive extensions and directives applied to
directive definitions, are retained with explicit profile-extension warnings.

## Representation

`spec/extensions/graphql/schema.json` completely describes the payload and 38
reachable SDL AST definitions. It is generated from pinned GraphQL.js declarations
by `scripts/graphql-schema.ts`, then embedded in the extension package. An element
payload contains the profile, a location-free SDL AST, and `originalSource`.
Executable operations/fragments are excluded from this schema adapter. Optional
undefined parser properties and nonsemantic token counts are omitted; literal
numeric values remain exact strings. Native declaration order, defaults, list/non-null
wrappers, descriptions, directives, arguments, type extensions and names survive.

Original source retains comments, commas, whitespace and spelling. If the current
AST still matches parsed original source, native export returns that exact text.
After edits, export prints the current AST; the bundle reports layout loss and
retains original source separately. It never substitutes archived text for an
edited model. Unknown representation fields survive core serialization but block
native export because the printer cannot represent them.

## Interpretation and Edits

Import parses SDL within core text/token/value limits, validates the AST schema,
builds the native schema and runs GraphQL schema validation. Invalid references,
duplicate fields, invalid defaults and OneOf declarations fail. Custom scalar
coercion/serialization and custom directive behavior are externally supplied;
these produce incomplete-interpretation warnings rather than execution claims.
No resolver implementation or network service is inferred from SDL.

Copied AST access supports programmatic consumers. Atomic edits require complete
interpretation before and after the callback. Printer/parser comparison detects
edited AST content that cannot survive native printing. Schema consistency is
validated before returning a new document. Original documents remain unchanged.
Rich schemas with external scalar/directive behavior remain round-trippable but
cannot use conservative edits until that interpretation is supplied.

## Evidence and Limits

The authored shop fixture covers schema roots, every standard type family,
interfaces, OneOf input, directives and schema/type extensions. Bun checks source
and AST retention, isolated edits, exact numeric tokens and invalid models.
Actual Chromium runs public import/export/edit operations. GraphQL-core 3.2.12
checks seven queries before/after export, introspection, OneOf coercion and changed
argument-default behavior. It is a separate runtime port with shared GraphQL.js
ancestry, not an unrelated algorithmic oracle.

Upstream corpus coverage, cross-system projections, federation conventions,
introspection import and runtime bindings remain open. No GraphQL type, nullability,
argument default or execution concept is promoted into core merely because another
extension uses a similar term.

## Explicit Fragment Mode and Upstream Corpus

Optional `mode: "fragment"` preserves syntax-valid SDL without claiming standalone
schema consistency. It reports `GRAPHQL_FRAGMENT` because references, roots and
composition need an explicit context. Conservative edits remain blocked. Omitted
mode or `mode: "schema"` retains full schema validation. Executable operations are
excluded in both modes. Original-source and AST round-trip guarantees are unchanged.

Upstream GraphQL.js v17.0.2 commit `71606d736c79b77588a15b32b9c9497e397adae0`
contributes both benchmark documents, SDL parser test source and kitchen-sink SDL
source, with hashes and license. The GitHub benchmark schema retains 540 declarations;
GraphQL-core confirms identical full introspection over 552 types, including native
built-ins. A changed Query.viewer output type makes that comparison fail.

Forty-eight static parser inputs are extracted without executing upstream code;
six dynamic references are explicitly excluded. Twenty-nine are syntax-valid SDL
fragments and nineteen are syntax errors. None of these snippets is a complete
standalone schema. Valid fragments survive explicit fragment import and serialization;
schema mode correctly rejects them. Python agrees with 47/48 grammar outcomes and
rejects the GraphQL.js directive-extension addition. That mismatch remains recorded.
