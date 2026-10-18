---
ddx:
  id: umf.plan.schema-reference-ia
  authoring:
    home: repo
  links:
    - id: FEAT-032
      kind: informed_by
    - id: US-089
      kind: informed_by
    - id: SD-032
      kind: informed_by
    - id: TD-089
      kind: informed_by
    - id: CONTRACT-077
      kind: references
    - id: STP-089
      kind: informed_by
---

# Schema and API reference information architecture plan

## Scope

Make the latest UMF understandable and usable: find an object, see its valid
keys, understand each key and its values, and find the API needed to work with it.
Owner direction, 2026-10-17: release versions must stop dominating navigation;
record keys, `itemType`, `scalarType` and API exports must be understandable.
The linked `AVRO_KEYS_EXTENSION` entry is an explicit API acceptance case.

The owner authorized implementation and actual-browser verification. Incorporate
the decisions below into governing artifacts before feature implementation.
Publication and deployment remain separate from this local implementation.
Catalog: installed HELIX 0.17.0 `workflows/graph.yml`; alignment findings feed
the ordered requirement/design/test amendments in IA-1.

Governing artifacts: [FEAT-032](../01-frame/features/FEAT-032-generated-reference.md),
[US-089](../01-frame/user-stories/US-089-generated-reference.md),
[SD-032](../02-design/solution-designs/SD-032-generated-reference.md),
[TD-089](../02-design/technical-designs/TD-089-generated-reference.md),
[CONTRACT-077](../02-design/contracts/CONTRACT-077-generated-reference.md),
[STP-089](../03-test/test-plans/STP-089-generated-reference.md).
Core semantic contracts and canonical schemas continue to own meaning.
The [existing browser UX plan](schema-browser-ux-plan.md) governs user-model
inspection and embedding; it does not solve this definition-reference problem.

## Findings

| Gap | Local evidence | Assessment |
| --- | --- | --- |
| Versions dominate the entry experience | `scripts/reference/render.ts` renders an All profiles filter and profile-oriented catalog; the UI hard-codes initial core selection to the 0.9 schema while configured profiles include 0.10 | DIVERGENT with the owner's latest-only working preference |
| Keys are difficult to discover and interpret | `microsite/reference/index.ts` lists immediate properties, prints local `$ref` pointers as types, and derives Required/Optional solely from the immediate `required` array | INCOMPLETE: conditional requirements, applicability and meaning need readable presentation |
| Values require schema decoding | The same renderer favors `type` over `enum`, emits generic composed-constraint text, and puts conditions in raw keyword tables | INCOMPLETE: accepted values and recognized meaning are not explained together |
| Graph becomes a discovery workaround | The renderer repeats a source-wide list of up to 40 reference targets on nested views | INCOMPLETE: lacks selected-object/property context |
| Search changes with browsing history | Search includes loaded detail data, while initial search uses entry metadata | INCOMPLETE: property discovery cannot depend on prior visits |
| API inventory lacks usable explanation | Extraction falls back to Public export/Type declaration plus a source path; API rendering exposes entrypoint, runtime and declaration text | INCOMPLETE: no purpose, usage, parameter/member reference or meaningful grouping |

Paths abbreviated above are under `docs/helix/05-deploy/`. Source inspection
establishes these rendering mechanisms; it is not fresh visual or usability
evidence. The supplied deployed API URL could not be fetched by the web tool.

## Information architecture decisions

Use recognition through visible choices, progressive disclosure for advanced
details, and a reference hierarchy that follows the model being described.
These are established design principles, applied here as proposed decisions:
[Nielsen Norman Group: recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/),
[progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/),
and [Diátaxis: reference structure](https://www.diataxis.fr/start-here/).
They are guidance, not a claim of standards certification or tested usability.

### Navigation and latest behavior

Keep the existing reference destinations, but make Schema reference and API
reference readable entry points with task-appropriate local navigation.

| Destination | Primary navigation |
| --- | --- |
| Schema reference | Document; Module; Elements → Record, Field, Group; Value types; Constraints → Nullability, Cardinality, Facets, Keys, Relationships; Extensions |
| API reference | Read and validate; Inspect and select; Author and edit; Serialize; Import and export; Extensions; All exports |

Latest is the ordinary working view. Show its exact core version as quiet context;
do not require a version choice or mix every release into the default catalog.
Resolve latest from validated configured core profiles using numeric semantic
version ordering, never a hard-coded filename, string sort or SDK package version.
Build checks must catch missing current definitions, explanations or examples.

Retain old exact entry/pointer links and source records. A deliberately opened
historical link stays exact, shows historical context and offers View latest.
Put history and structural comparison under a secondary History disclosure.
Unqualified concept links follow latest; Copy link produces a reproducible exact
link. An unavailable exact entry remains an explicit miss. Defaulting to latest
does not silently migrate an opened document or invent newer runtime support.
Extensions retain independent versions; latest core does not mean every latest
extension is compatible. Surface compatibility where an extension is used.

### Object pages and key discovery

Open directly to useful content, with Document selected initially and Record and
Field visible in navigation. Each object page follows this order:

1. Plain definition and where the object appears, with a breadcrumb.
2. Small complete valid example; highlight the selected object in its context.
3. Keys table: exact key, meaning, value shape, presence/applicability, values or
   linked type. Show all documented keys by default; support filtering locally.
4. Rules and relationships that affect valid combinations.
5. Related concepts, APIs and worked examples.
6. Secondary source/provenance, raw constraints, reference graph and history.

Distinguish Record definition keys from the fields listed in `members`, and from
the `keys` declaration that describes record identity. Label them explicitly.
Record and Field views specialize the shared Element shape and expose inherited
keys and kind-specific prohibitions. Do not present a union of every Element key
as equally usable on every role.

For every object, state its unknown-key policy: rejected, retained without known
meaning, or constrained by a map/pattern rule. A list of documented keys must
not falsely imply a closed object when additional content is permitted.

### Property pages and values

Every key links to a dedicated page or anchored detail with its exact spelling,
plain meaning, owning object/path, value shape, recognized values, structural
acceptance rules, presence conditions, prohibited combinations and examples.
Nested objects expose their keys inline; reference targets have human labels.
Use Required, Optional, Required when…, and Not allowed when… with actual rules.
Distinguish omitted, explicit null, default annotations and runtime defaults.

Required exemplar content, grounded in current core 0.10.0:

| Key | Explanation and value presentation |
| --- | --- |
| `scalarType` | Scalar value family. Show `boolean`, `integer`, `decimal`, `float`, `string`, `binary`, `date`, `time`, `timestamp`, `bits128`, `uuid`, each with scoped meaning. Also explain that other nonempty strings are retained with unknown meaning; this is not a closed enum. Show missing-value meaning and role/container restrictions. |
| `itemType` | Reference to the Field defining array items or map values. Show `{ "module": "sales", "element": "tagValue" }`, nested `module`/`element` keys, resolution rules and the target Field. Requires `kind: "field"` and `cardinality: "array"` or `"map"`; it is not a scalar label or an inline schema. Missing item meaning stays unasserted. |

Include validated scalar Field, array Field plus item Field, and Record membership
examples with all required document context available. Add counterexamples for a
scalar label in `itemType` and a container carrying `scalarType`. Link structural
admission separately from semantic reference resolution and native constraints.
Unknown scalar labels must never be presented as understood native types.

Generate facts from the canonical schema; supplement purpose and semantic rules
from reviewed contracts/overlays. Resolve supported references with cycle guards.
Preserve composition branches and their conditions; do not flatten alternatives
into an invented effective schema. Unhandled rules must remain explicit with a
source link, never yield an unqualified Optional or Any value label.

### API reference

Expose functions, types/interfaces, constants, schemas and packages as distinct
symbol kinds. Interface is a TypeScript construct; explain it where relevant.
Keep All exports as a complete secondary index with exact-name search and kind
filters. Group primary navigation by tasks and feature families, not filenames
or an alphabetized dump. Browse schema concepts separately from SDK symbols,
with cross-links between them.

Every API entry starts with what it is, what it does and when to use it, followed
by a copyable import and checked usage where applicable. Functions expose named
parameters, optionality, defaults, return shape, errors and restrictions. Types
and interfaces expose member tables and linked nested types; aliases/unions expose
their alternatives. Constants expose exact type/value, purpose and related APIs.
Schemas and packages explain their role and registration/use path. Full original
declarations and provenance remain secondary details. Runtime availability stays
visible and qualified; symbol kind alone cannot establish browser executability.

`AVRO_KEYS_EXTENSION` must appear as Constant with exact value `"umf.avro.keys"`:
the identifier for the Avro key metadata extension, used as a vocabulary/extension
map key. Show its import, link `avroKeysPackage`, related classification operations
and payload documentation, and explain the qualified scope: these observations
do not establish Avro uniqueness enforcement or authored key intent. Do not label
this constant as an interface or suggest it is callable. Include a checked example
of identifying its metadata, without implying automatic registration or mutation.

Preserve every discovered export. Generate symbol-kind and member facts from the
TypeScript compiler; curate explanations by task. Prioritize reader-facing groups
and the supplied example first. Track missing explanations explicitly; generated
source paths and Public export are insufficient descriptions for completion.

### Search and graph

Build an integrity-bound search catalog containing latest concepts, property names,
recognized values, API names/kinds and curated terminology. Search must work on a
cold visit without fetching every declaration/source. Results show context such
as Field → itemType, include exact identifiers, and link directly to the answer.
Distinguish a JSON property key from a record identity Key. Keep the complete
historical inventory searchable through the secondary history scope.

Replace the repeated global reference list with contextual Related types and
Used by links. Offer the graph as an optional view of the selected object or
property, with labeled edges, scope/counts, unresolved references and an accessible
text equivalent. Key meanings and accepted values must be available without it.

## Shared constraints

Preserve exact IDs, source bytes, unknown metadata and numeric tokens. Preserve
CONTRACT-077 routes, integrity manifests, input closure, bounded loading and inert
content. Schema/semantic/API facts must not be inferred from display labels.
Keep the current model/build/UI/runtime boundaries and browser-compatible code;
no new framework, external service, adapter behavior or native qualification.
The reusable schema-browser package remains under its separate release contract.

## Implementation slices

| Slice | Work and governing amendment | Dependency | Validation gate |
| --- | --- | --- | --- |
| IA-1 | Amend FEAT-032/US-089 for latest defaults, discoverable keys/values and usable APIs; then SD-032/TD-089 for the page/search design; CONTRACT-077 for any changed model surface; STP-089 for task assertions | None | Trace each complaint to observable acceptance criteria; preserve exact historical routes and version qualifications |
| IA-2 | Extend existing model/extraction boundaries for concept/property summaries, symbol kinds/members and task groups; define any new generated asset in the contract and manifest before rendering it | IA-1 | `bun run check:reference-boundaries`; permitted/forbidden import controls; schema/member/conditional/exact-token fixtures; deterministic catalog; contract migration if record shape changes |
| IA-3 | Deliver latest concept navigation and object/property pages, including Record, Field, scalarType and itemType | IA-2 | Cold-start discovery, complete documented key coverage and unknown-key policy; validated examples/counterexamples; 0.9→0.10 ordering and historical-link controls |
| IA-4 | Deliver task-based API navigation and symbol-specific pages, including AVRO_KEYS_EXTENSION and linked symbols | IA-2 | Complete export census; constant/function/interface/alias/schema examples; member/parameter navigation; checked imports/examples and explicit explanation gaps |
| IA-5 | Deliver cold search, contextual relations, keyboard/history behavior and responsive layouts | IA-3, IA-4 | Direct property/value/API results before visits; exact deep links; Back/refresh; no document overflow at 390, 798 and 1280 px; readable tables and visible focus |
| IA-6 | Rebuild and review complete journeys, update documentation and record evidence | IA-5 | Reference unit/build/browser/boundary checks, typecheck and existing public-route regressions; inspect actual screenshots; retain manifest digest and tool/browser versions |

## Validation plan

Extend `tests/reference/reference.test.ts` and `scripts/reference/browser.ts`.
Add behavior assertions before implementation, including nested references,
conditional prohibitions, open enums, unknown keys, recursion and missing docs.
Run the existing `bun run test:reference`, `bun run test:reference:browser`,
`bun run check:reference-boundaries` and `bun run typecheck` gates with their
documented prerequisites. Preserve source/download/integrity and user-model
browser regressions. Do not renew native support claims from reference tests.

Evaluate these tasks from a cold visit, without repository knowledge or graphs:

- Open Record and identify its documented keys, Field membership and identity Keys.
- Find scalarType; enumerate recognized values and explain acceptance of unknown labels.
- Find itemType; explain its object shape, target and allowed owner cardinalities.
- Find AVRO_KEYS_EXTENSION; identify its kind/value/purpose and a related operation.
- Find a function parameter and an interface member without decoding a declaration.

Proposed usability targets: each named concept/property/API answer within two
navigation choices from its reference landing page, or one exact-name search;
each task within 60 seconds in a small observed session with at least three
readers unfamiliar with the implementation. These are acceptance targets, not
observed results. Automation proves discoverability mechanisms; human sessions
assess comprehension. Record inability to recruit readers as unverified usability.

## Execution contract

Implementation is authorized by the owner. Start with IA-1, then use the
existing boundary gate before feature code. No tracker or delegation is required.
Token range and spending ceiling are unknown; no comparable usage baseline or
per-turn meter was supplied. Do not invent estimates or claim an enforced cap.
Publication/signing/deployment are separate actions after local acceptance.

## Risks and rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Helpful summaries misstate conditional validity | Preserve branch provenance; explicit unknown coverage; negative examples | Restore prior renderer and matching generated bundle |
| Latest conceals historical or extension meaning | Exact links stay pinned; independent compatibility context | Restore prior default navigation without rewriting sources |
| Search/member extraction enlarges payloads | Bounded build-time summaries and lazy details; measure within existing limits | Revert new catalog/schema surface with its consumer |
| API prose becomes another source dump | Enforce symbol templates and observed comprehension tasks | Revise curated explanation independently of source facts |

## Continuation evidence and exit criteria

IA-1 through IA-6 completed for local implementation and browser verification.
Governing requirements/designs/contract/test mapping were amended in place;
the reader companion, concept/property views, API kinds/members and cold search
are implemented. Latest core and the default workbench use 0.10.0; exact older
routes remain available. [Execution evidence](evidence/generated-reference/reader/README.md)
records 16 passing tests, deterministic regeneration, 41 Chromium checks,
typecheck, boundary checks, screenshots and precursor corrections.

No recruited-reader comprehension session occurred; the three-reader/60-second
target remains unverified. Uncurated APIs expose generated structural documentation
with an explicit guidance gap. No publication or deployment is claimed.

Completion requires all slice gates, complete latest documented-key and export
coverage, passing named journeys, preserved historical routes and original sources,
reviewed screenshots, and an explicit account of any unverified human usability.
Plans, generated counts and green layout assertions alone cannot establish that
readers understand the reference.

## Current-only reader and workbench follow-up — 2026-10-18

Owner direction supersedes the optional History presentation above. The reader
now documents core 0.10.0 without release controls or badges; earlier core links
resolve to the current schema while preserving a valid pointer. Current guides
explain concepts rather than core release history. Exact inventories, original
schema sources and native/extension qualifications remain retained.

All authored UMF workbench examples now validate as core 0.10.0. Inputs open as
YAML; YAML/JSON buttons format current edited values through a verified worker.
The output serialization choice also defaults to YAML. Malformed, duplicate-key
and noninteroperable numeric conversions retain the input and selected format.
The original loaded/edited source remains downloadable after formatting.
Protobuf source retains native syntax. The public property/default execution API
still rejects the current envelope, so its workbench operation is unavailable
rather than relabeling user documents or claiming current support. Its authored
schema-properties example now demonstrates current validation.

Every schema disclosure, including complete examples, starts closed. Chromium
checks explicit expansion, keyboard format switching, old links, desktop/mobile
layout, current validator execution, unknown preservation, native projection,
strict refusal and cancellation. Both browser suites passed 43 checks with zero
page errors/external requests. Reference tests passed 18 tests/13,964 assertions;
type checking and the 19-file boundary checker passed. The separately integrated
main-branch catalog parser changes passed three additional tests.

Self-description investigation: FR-35 remains a deferred requirement. No authored
UMF model of the UMF metamodel was found; JSON Schemas and TypeScript declarations
are the existing machine-readable authorities. A concept graph derived from a
self-model is distinct from the generated JSON Schema reference graph. No
self-model or ontology diagram is claimed by this documentation patch.

Confirmed clarification: “all schemas collapsed” applies to both the reference
and the separate schema catalog. The site host closes the initial catalog groups,
then relinquishes control so user expansion, search and navigation use the
released browser normally. No installed renderer, CSS or workspace markup is
modified. Independent Chromium inspection found 115 groups/zero open on startup,
with explicit expansion and 17 expanded matching groups after medical search.

The final combined browser replay passed 44 checks with zero page errors or
external requests; the installed package asset/workspace parity check and type
checking passed after the catalog host change.

Publication follow-up: CI's legacy artifact collection driver waited for a button
inside the initially expanded first catalog group. It now asserts the collapsed
startup state and explicitly opens that group before continuing. Its full local
Chromium journey passes 37 checks over six collections and four bookmark aliases,
including ontology graph interactions and field-filter history, with no external
data requests. This corrects the driver for the new desired behavior; the catalog
startup policy is unchanged.
