---
ddx:
  id: CONTRACT-907
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-001
      kind: informed_by
    - id: US-904
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: references
    - id: CONTRACT-040
      kind: references
    - id: CONTRACT-078
      kind: references
    - id: CONTRACT-080
      kind: references
---

# CONTRACT-907: Extension-defined object kinds

**Interface profile:** 1.0.0. **Core document version:** 0.10.0, unchanged.
Catalog activation is an explicit registration capability; package metadata alone
does not authorize reinterpretation. Native support remains adapter-qualified.

## Purpose

Expose extension-owned object kinds to generic discovery and validation without
adding ecosystem meanings to the core kind vocabulary. Exact kind identity is
the tuple `(extension id, extension version, local kind id)`.

## Scope and Boundaries

This contract covers declarations on extension packages and occurrences at
document, module and element extension attachment scopes. The existing payload's
own `kind` property is the single occurrence discriminator. Core `Element.kind`
remains `field`, `record` or `group`; no value is added by registering a package.

Discovery MUST NOT infer equivalence, inheritance, core shape, native acceptance,
safe editing or execution authority. Semantic types under CONTRACT-078 annotate
meaning and value validation; they are not object-kind registration. Nested
objects inside one extension payload are outside this profile's occurrence
discovery. Their semantics remain the extension validator's responsibility.

## Normative Surface

### Package catalog

A package MAY declare `kindCatalog`. The caller MUST opt in with
`Registry.register(package, validator?, {kinds:true})` to activate it. Ordinary
registration keeps this metadata opaque. No declaration or no opt-in means no
advertised object kinds, even if a payload has a property named `kind`.

| Field | Shape | Rules |
| --- | --- | --- |
| `kindCatalog.profile` | nonempty string | Exact `1.0.0` activates this contract; other profiles remain unsupported data |
| `kindCatalog.definitions` | nonempty object | Required for 1.0.0; keys are nonempty, exact local kind ids |
| definition `title` | nonempty string | Human display name; never identity |
| definition `description` | nonempty string | Meaning and boundary; not executable instructions |
| definition `scopes` | nonempty unique array | `document`, `module`, `element`; subset of package scopes |

For supported catalogs, the union of definition scopes MUST equal package
`scopes`. This makes adoption exhaustive at the package's attachment scopes:
every attached payload MUST be an object with an own, nonempty string `kind`
matching a definition allowed at that scope. A package with untagged payloads
must retain legacy participation or publish a new tagged profile/version.
No deep scan, tag inference, case folding or alias expansion is permitted.

The existing package `schema` remains the only structural payload schema.
Catalogs MUST NOT introduce a second payload schema or select code. The existing
trusted semantic validator receives the full copied payload and original owner
context through the existing extension-validation interface.

Malformed supported catalogs reject registration atomically with
`PACKAGE_KIND_CATALOG`. Duplicate JSON keys are rejected during parsing; ids
including `constructor` and `__proto__` are ordinary data, never inherited keys.
Unknown catalog/definition fields MUST be copied and make the entire catalog
`unsupported`, preserving their meaning without applying a partial catalog.
An unsupported profile also makes the catalog unsupported. Ordinary package
schema admission/compilation still applies; unsupported kind metadata does not
authorize skipping ordinary extension validation.

### Occurrence validation

Ordinary document validation MUST include kind checks; callers MUST NOT need a
separate inspection call to reject a wrong kind or scope.

For each attachment, resolve only the version in `document.vocabularies[id]`
through the caller-supplied registry. Existing undeclared/unregistered extension
diagnostics remain authoritative. Never select a different registered version.
For a supported catalog, check discriminator presence/type, exact kind identity,
then permitted scope. Run ordinary payload structural validation and, when
structure and kind checks pass, the existing semantic validator. Do not invoke
that validator for a malformed tag or forbidden kind scope.

Supported kind checks do not remove unrelated document errors or warnings.
An unsupported catalog adds `EXTENSION_KIND_CATALOG_UNSUPPORTED` at the payload
path, while ordinary package validation continues. A legacy package with no
catalog adds no new diagnostic to ordinary document validation.

An extension-local kind named `field` or `record` never satisfies a core rule
requiring `Element.kind` of that name. An element MAY simultaneously have a core
shape kind and extension classifications. Neither overwrites the other.

### Generic APIs

The language-neutral operations below use JSON-compatible owned snapshots.
TypeScript names specify the presentation surface; Rust owns shared mechanics.
`new Registry(runtime)` takes an explicitly initialized shared native/WASM engine
for this operation family. Existing ordinary registrations remain unchanged.
`register(package, validator?, {kinds:true})` copies, validates and indexes kind
metadata in the same atomic registration. Opt-in without the shared capability
MUST reject with `EXTENSION_KIND_RUNTIME_REQUIRED`, without mutation or a
TypeScript semantic fallback. All kind APIs require that runtime even when the
registry is empty; an initialized empty registry reports unavailable packages.
Python supplies the equivalent `register_package(manifest, semantics, kinds=True)`.

`Registry.listKinds()` returns:

- `definitions`: `{reference, definition}` entries for supported catalogs;
- `packages`: `{extension, version, catalog, diagnostics}` for every installed
  exact package, where `catalog` is `available`, `absent` or `unsupported`;
- `complete`: true only when every installed package has an available catalog.

`reference` is `{extension, version, kind}` with nonempty exact strings.
Definitions sort lexicographically by that tuple using UTF-16 code units;
packages sort by extension/version under the same ordering. Package diagnostics
use JSON Pointers relative to their manifest. `Registry.getKind(reference)`
returns a copied definition or undefined; malformed references throw
`EXTENSION_KIND_QUERY`. Missing or unsupported definitions never fall back.

`inspectExtensionKinds(document, registry?)` returns:

- `source`: a full copied input document;
- `sourceValidation`: ordinary document validity, completeness and diagnostics;
- `entries`: `{reference, owner, payloadPath, definition}` for resolved kinds;
- `coverage`: one `{owner, extension, version, payloadPath, status, diagnostics}`
  per extension attachment, including unresolved and invalid occurrences;
- `complete`: true only if sourceValidation is complete and every attachment
  has coverage status `resolved`.

`owner` is exactly `{scope:'document'}`, `{scope:'module',module}` or
`{scope:'element',module,element}`. It denotes the attachment owner, not a
payload-created identity. `payloadPath` is a JSON Pointer into `source`.
Coverage status is `resolved`, `absent-catalog`, `unavailable`,
`unsupported-catalog` or `invalid`. A registered package with no catalog is
`absent-catalog`; a missing exact registry entry is `unavailable`. An undeclared
extension is `invalid` and version is null; otherwise version is the document's
exact declaration. There is no kind reference in unresolved coverage: tooling
MUST NOT interpret an arbitrary `payload.kind` as a declared kind.

Entries indicate resolved classification, not semantic validity. A structurally
or semantically invalid payload with a resolvable tag still has a discoverable
entry and `invalid` coverage; callers see its document diagnostics. Missing or
unknown tags and wrong scopes have no entry. Coverage diagnostics are the
ordered subset of sourceValidation diagnostics at/under that payload path;
document-wide dependency errors remain in sourceValidation and are not hidden
or falsely attributed to one occurrence. Root ownership of graph-wide rules
remains the extension's responsibility.

Traverse document attachments, then each module's attachments and its elements
in source order. At each owner, traverse extension keys in UTF-16 lexical order.
Entries retain that occurrence order. Registration order MUST NOT affect results.

Inspection of a structurally invalid core document returns sourceValidation and
empty entries/coverage with complete false; do not walk unadmitted owner shapes.
JSON admission/limit failures throw existing core errors without a partial result.
Missing packages/catalogs never trigger network access. Queries and returned
definitions/source MUST be isolated from registry and caller mutation.

### Data-shape reuse

A dataset adapter SHOULD use core Records/Fields for meanings established by its
source or explicit authoring. Dashboard-specific bindings SHOULD reference
those stable module/element identities and be validated by that extension.
Kinds themselves do not define dataset bindings or certify schema completeness.
An adapter MUST NOT infer a complete row schema, scalar type, key, nullability
or measure evaluation context from widget names or opaque query text.

## Precedence and Compatibility

The catalog/profile and public shapes are generated from the authored current
metamodel. Document core stays 0.10.0: no new owner fields, structural kinds or
core-value rules are introduced. There is no document migration or marker-only
rewrite. This replaces the draft's proposed 0.11.0 cutover, whose unrelated
producer/callback migration was unnecessary for this additive registration API.

Existing registrations MUST preserve even a perfectly shaped lookalike catalog
without interpreting it. Full-manifest transport includes an explicit boolean
`kinds` flag, false by default. Mixing manifest and legacy identity/schema fields
or supplying a non-boolean flag MUST reject. The Rust registry's ordinary
registration remains opaque; its explicit kind-package registration activates the
profile using the engine's generated kind policy and catalog schema. Convenience
registrations that reconstruct a manifest never imply kind activation.

An extension publisher adds a catalog in a new exact extension version rather
than rewriting an already distributed package in place. Exact version selection,
unknown-content preservation and existing payload semantics remain unchanged.
Subsequent kinds need only an extension release and explicit trusted registration,
not a core revision. Catalog data cannot load executable validators. Older
consumers may retain it; they cannot claim kind discovery or validation.

## Error Semantics

| Condition | Code / outcome | Recovery |
| --- | --- | --- |
| Malformed supported catalog or uncovered package scope | `PACKAGE_KIND_CATALOG`; registration unchanged | Correct/reversion package |
| Opt-in or kind API without shared runtime | `EXTENSION_KIND_RUNTIME_REQUIRED` | Initialize native/WASM engine explicitly |
| Duplicate exact package | Existing `DUPLICATE_VERSION` | Use distinct version or fresh registry |
| Missing/non-string/empty own payload tag | `EXTENSION_KIND_REQUIRED`, error at payload `/kind` | Supply declared tag; missing pointer denotes required location |
| Undeclared local kind | `EXTENSION_KIND_UNKNOWN`, error at payload `/kind` | Correct tag or install intended exact package |
| Kind at forbidden attachment scope | `EXTENSION_KIND_SCOPE`, error at payload `/kind` | Move payload or revise extension profile |
| Unknown catalog profile/qualifiers | `EXTENSION_KIND_CATALOG_UNSUPPORTED`, warning at payload | Supply supported exact profile; preserve data |
| Package missing or extension undeclared | Existing extension diagnostics; unresolved/invalid coverage | Supply explicit registry/declaration |
| Invalid payload/schema or semantic callback failure | Existing extension diagnostics | Repair payload or trusted validator; no kind validity shortcut |
| Resource/JSON admission failure | Existing core `LIMIT`/JSON errors; no partial output | Reduce input or use explicit supported resource profile |

## Examples

Illustrative fragment of an extension manifest; its payload schema and ordinary
capabilities remain required. `example.dashboard` is synthetic, not a native claim.

```yaml
id: example.dashboard
version: 0.2.0
coreVersion: 0.10.0
scopes: [document, module, element]
kindCatalog:
  profile: 1.0.0
  definitions:
    dashboard:
      title: Example dashboard
      description: A dashboard composition; not a row/value shape.
      scopes: [document]
    page:
      title: Dashboard page
      description: An ordered presentation surface.
      scopes: [module]
    data:
      title: Dataset catalog
      description: A container for dataset declarations.
      scopes: [module]
    dataset:
      title: Dashboard dataset
      description: A declared data source with extension-owned query context.
      scopes: [element]
    layout-item:
      title: Dashboard layout item
      description: A widget and its native placement.
      scopes: [element]
```

The document declares `example.dashboard: {version: 0.2.0}` and carries a document
payload `{kind: dashboard, ...}`. Discovery resolves
`{extension: example.dashboard, version: 0.2.0, kind: dashboard}` without setting
core `kind: dashboard`. A second extension's `dashboard` is a separate entry.
Declared dataset Records and Fields remain ordinary core elements; an
extension-owned dataset-to-Record binding requires its own versioned contract.

## Validation Checklist

US-904 covers catalogs, wrong/missing tags and scopes, same-name/version
collisions, unknown packages/profiles/qualifiers, copy isolation, limits and
ordinary core consumers. Test both source preservation and interpretation status.
Browser/native parity and actual adapter round trips are separate gates.
