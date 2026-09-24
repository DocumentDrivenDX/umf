---
ddx:
  id: US-011
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-011: Preserve native OpenAPI descriptions

As an API integration author, I want programmatic access to OpenAPI metadata while
retaining references, schema dialects, extensions and original JSON/YAML source.

- **US-011-AC1:** Operations, parameters, media, schemas, callbacks/webhooks, security,
  links and extension content survive core JSON/YAML and native export. Copied node
  access cannot mutate the source. Both 3.1.2 and 3.2.1 fixtures are retained.
- **US-011-AC2:** Candidate edits reflect current content, retain original source,
  report incomplete validation/layout changes and reject structural errors.
  Unknown representation fields cannot disappear during native export.
- **US-011-AC3:** Exact numbers survive without host rounding; unsupported versions
  remain incomplete. Duplicate/non-string keys, tags and aliases fail explicitly.
- **US-011-AC4:** Twelve positive/negative cases agree with unmodified official
  schemas in Python. Embedded-schema non-validation remains demonstrated, not hidden.
- **US-011-AC5:** Actual Chromium executes preservation, candidate editing and
  incomplete-profile checks through the public package.

CONTRACT-011 defines the bounded validation profile. Full OpenAPI conformance,
reference/dialect interpretation and projections remain open under the overall goal.


- **US-011-AC6:** All 46 pinned official example files retain native content. The
  38 complete descriptions round-trip through both core serializations; eight
  referenced fragments remain distinctly outside standalone-document import.
- **US-011-AC7:** Official 2.0/3.0 validation rejects version-specific invalid
  structures and retains valid candidate edits. Python agrees on eight legacy
  cases and validates all complete corpus descriptions without the browser workaround.

Chromium additionally checks 2.0/3.0 validator availability and structural rejection.
The corpus oracle records its explicit JSON-compatible timestamp-string treatment.


- **US-011-AC8:** Explicit resource bundles retain owning URI, all supplied fragment
  URIs, source formats and contents through JSON/YAML and reimport. Copied lookup and
  candidate edits select resources without mutating originals; root-only export
  cannot discard dependencies. Native validation observes an edited referenced type.
- **US-011-AC9:** Missing resources/pointers, malformed fragments, named anchors and
  duplicate/owner-colliding URI identities fail explicitly. Unknown resource fields
  block native loss. Lookup never implies nested schema scope or complete resolution.

`tests/openapi/bundle.test.ts`, the Python bundle oracle and actual Chromium provide
this evidence. The standalone corpus intentionally continues to reject fragment files
without their owning context; bundle support is a separate input configuration.


- **US-011-AC10:** Known embedded schema keyword syntax is checked at actual schema
  positions. Unknown and nested dialect boundaries stay explicit; examples, defaults
  and extension data are not misclassified as schema declarations. Independent official
  meta-schema checks agree for known cases.
- **US-011-AC11:** OpenAPI 3.2 media item schemas, encoding headers, additional
  operations and XML vocabulary syntax receive the appropriate schema checks.

Browser evidence additionally rejects invalid embedded schema types. Meta-validation
is not credited as instance, reference or runtime conformance.


- **US-011-AC12:** Typed supplied-file Reference Object chains retain target origin,
  all source siblings and copied content, with the default outer annotation policy.
  Results validate against the published result schema and remain explicitly incomplete.
- **US-011-AC13:** Missing/wrong-kind targets, cycles, malformed references and
  unsupported schema/identity scopes fail rather than producing plausible targets.
- **US-011-AC14:** Each of seven declared object roles passes its native target check;
  independent official-schema evaluation agrees. Chromium executes typed resolution.

The source role is caller-declared. These checks do not establish arbitrary source
position inference, nested closure or JSON Schema reference semantics.

- **US-011-AC15:** Extract a declared Schema Object with exact number lexemes, native
  references, source pointer, retrieval URI and the full copied source/resource context.
  Literal example data cannot masquerade as a declared schema position.
- **US-011-AC16:** Report dialect provenance from schema override, owning document or
  version default. Preserve unknown dialects; reject standalone fragments without an
  owning description and unknown selection options. Extraction reports incompleteness.

- **US-011-AC17:** Index known-dialect schema positions and resolve static references
  using nested IDs, anchors, retrieval aliases and OpenAPI 3.2 document identity;
  preserve target pointer and retrieval location separately from schema identity.
- **US-011-AC18:** Reject ambiguous identities, unknown dialect traversal, non-schema
  targets and absent resources. Standalone schema resources require explicit selection.

- **US-011-AC19:** Resolve `$dynamicRef` using caller-supplied outermost-to-innermost
  schema resource scope. Select the outermost matching dynamic anchor only when the
  initial fragment is dynamic; ordinary anchors/pointers retain static behavior.
- **US-011-AC20:** Reject absent/unknown scope, fragment-bearing scope identities,
  mismatched innermost ownership and missing source/target references. Results state
  that instance evaluation and evaluation-path derivation remain unimplemented.
