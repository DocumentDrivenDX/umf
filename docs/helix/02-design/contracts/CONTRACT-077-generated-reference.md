---
ddx:
  id: CONTRACT-077
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-032
      kind: informed_by
    - id: SD-032
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# CONTRACT-077: Generated reference, evidence and local workbench

**Type:** static data / build CLI / worker protocol. **Version:** 1.0.0 draft.
**Owner:** UMF reference tooling. This contract specifies proposed interfaces;
no generated reference implementation or refreshed qualification is claimed.

## Purpose

Define a deterministic, machine-readable reference over existing UMF artifacts.
MUST/MUST NOT are requirements of this profile. Existing semantic contracts
continue to own validation, native meaning, preservation and projection results.

## Scope and Boundaries

Inputs are local, explicitly inventoried source files and reviewed mappings.
Outputs are reference records, static pages, exact-source copies and fixed
browser tooling. No network discovery, native test execution, artifact-provided
code, semantic promotion or arbitrary schema compilation is authorized.

## Normative Surface

### Build commands and ownership

From the repository root:

```sh
bun scripts/build-postgresql.ts
bun scripts/build-protobuf.ts
bun scripts/reference/build.ts
bun scripts/reference/build.ts --check
bun scripts/reference/check-boundaries.ts
```

`bun run build:reference` builds the pinned PostgreSQL and Go1.27.1 Protobuf browser artifacts before
reference extraction. The direct commands above require the same prerequisite;
optional cached outputs must not change the available evidence input inventory
between generation and its drift check. The publishing profile includes the optional source compiler; Go1.27.1 must
be selected before invoking the shortcut.

The builder owns only `docs/helix/05-deploy/microsite/dist/reference/`.
`--check` MUST generate into temporary staging, compare exact file membership
and bytes and leave tracked inputs/outputs unchanged. Unknown flags fail. Normal
generation MUST complete validation in staging before replacing its owned tree;
failure leaves the prior tree intact. No command edits evidence or signatures.

Reviewed inputs live under `docs/helix/05-deploy/reference/`: `profiles.json`,
`operations.json`, `evidence-map.json`, `overlays/`, `guides/` and `examples/`. Proposed
JSON Schemas for these inputs and outputs live beside them in `schemas/` and
MUST implement the field definitions below before input is admitted.

The output tree contains `index.html`, `core.html`, `extensions.html`,
`integrations.html`, `api.html`, `examples.html`, `workbench.html`, `index.json`,
`manifest.json`, `discovery.json`, `entries/`, `sources/`, `assets/`,
`THIRD_PARTY_NOTICES.md` and `licenses/`. HTML/CSS/JavaScript are
generated; raw sources are byte copies. No generated ZIP is published.

### Common records and identity

All objects below reject undeclared fields in profile 1 except `sourceData`,
which preserves original JSON-compatible content without interpreting it.
Optional means omission, never implicit null. SHA-256 digests are lowercase
64-character hexadecimal strings over exact bytes. Paths are repository-relative
POSIX paths; absolute paths, traversal and symlinks escaping an allowed root fail.

| Record | Required fields | Optional fields / rules |
| --- | --- | --- |
| Source | `path`, `sha256`, `bytes` | `revision`: Git commit only when those exact bytes match that commit; `pointer`: JSON Pointer; `line`: positive source line. `bytes` is a nonnegative byte count |
| Entry | `id`, `kind`, `title`, `summary`, `sources`, `links`, `data` | `kind`: `schema`, `extension`, `api`, `integration`, `example`, `guide`. `sources` is a nonempty Source array; `links` contains entry IDs; `data` is the matching kind payload below |
| Index | `profile`, `entries`, `inputDigest` | `profile` is `umf.reference/1`; `entries` is an array of `{id,kind,title,summary,href,sha256,bytes}` naming detail shards |
| Manifest | `profile`, `inputs`, `outputs`, `inputDigest` | `profile` is `umf.reference.manifest/1`; `inputs`/`outputs` are path-sorted arrays of `{path,sha256,bytes}`; manifest itself and separately signed HTML are excluded from `outputs` |

Entry IDs are the compact JSON serialization of arrays of strings: schema
`["schema",path,pointer]`; extension `["extension",id,version]`; API
`["api",entrypoint,exportName]`; integration `["integration",operationId]`;
example `["example",exampleId]`; guide `["guide",guideId]`. Schema root pointer
is the empty string. Aliased exports retain separate API identities linked to
the same declaration source. IDs MUST NOT use titles or array positions.
Each entry is `entries/<sha256-of-UTF8-id>.json` containing one Entry object.

`inputDigest` hashes UTF-8 JSON serialization of sorted `[path,sha256]` pairs
for the complete build-input closure. Object keys sort lexicographically by
UTF-16 code units; array ordering is retained unless this contract specifies
sorting. JSON outputs use two-space indentation and a final newline. Builds
MUST exclude wall-clock timestamps, machine paths and ambient network state.
The manifest input closure includes the builder, renderer, mappings, schemas,
public API dependency closure, templates, fixtures, lockfile, TypeScript configs,
workflow and fixed-validator generation inputs. Source snapshots use
`sources/<sha256>` and MUST preserve original bytes. A source path/digest pair
must resolve to its copied bytes or a visibly identified source-only repository
link for nonredistributable content; never fabricate an immutable revision link.

Index entries sort by ID; entry links and discovery inventories sort by identity
or source path. Semantic arrays such as schema branches and ordered Key fields
MUST preserve source order. Indexed counts derive from emitted records; no
hard-coded extension, schema or test totals are permitted. Export signatures
retain their original spelling alongside the copied declaration source.

`discovery.json` is `{profile:"umf.reference.discovery/1",items,exclusions}`.
Items contain `{id,kind,paths,assessment}`; assessment is `represented` or
`excluded`. Exclusion rules use the profile configuration’s `{path,reason}`
shape and MUST match an existing discovered source. Inbound joins to an excluded
entry still fail rather than disappearing silently.

### Kind payloads

| Kind | `data` required fields | Optional fields and constraints |
| --- | --- | --- |
| schema | `schemaPath`, `pointer`, `role`, `profileVersions`, `sourceData`, `references` | `role`: `document`, `extension-payload`, `operation`, `other`; `references`: `{keyword,target,resolvedId?}[]`. `sourceData` retains exact-number tree tokens where needed. Unresolved refs stay visible |
| extension | `extensionId`, `version`, `manifest`, `schemaId`, `registration` | `manifest` preserves the complete original declaration; `registration`: `{mode,apiIds,coreProfiles}`; `mode`: `sdk-default`, `explicit`, `unmapped`. All profile strings are exact |
| api | `entrypoint`, `exportName`, `declarations`, `signatureText`, `runtime` | `declarations`: Source array; `signatureText`: string array retaining overloads; `runtime`: `type-only`, `portable`, `host-only`, `unassessed` |
| integration | `operation`, `declarations`, `evidence`, `correspondence`, `conflicts` | `declarations`: Source array; `evidence`: Evidence array below; `correspondence`: `matching`, `historical`, `unknown`, `conflicting`, `unassessed`; `conflicts`: evidence-ID pairs |
| example | `operationId`, `inputs`, `expected`, `apiIds`, `guideIds` | `inputs`: Source array; `expected`: Source for checked semantic expectations; references MUST resolve |
| guide | `body`, `relatedIds` | `body`: inert authored Markdown string rendered with escaped code/text; raw HTML and unsafe URLs refuse |

Schema constraints MUST retain composition branches, annotations and unknown
keywords; presentation MUST NOT flatten `allOf`/`anyOf`/`oneOf` into invented
semantics. A schema structural diff reports added/removed/changed pointers and
original values; it MUST NOT assert compatibility, equivalence or native behavior.
Descriptions and defaults remain distinguishable from executable constraints.
Schema `sourceData` uses the exact tree representation governed by
`spec/core/native-json.schema.json`; it MUST NOT round numbers through host
JSON parsing. Expose schema-valued nodes within each source entry using declared dialect locations;
stable pointer routes select those nodes. Unknown keyword values remain in the original tree without guessed subschema
interpretation. References distinguish resource identity from local storage path.

### Profile and operation configuration

`profiles.json` is `{profile:"umf.reference.profiles/1",coreProfiles,registrations,exclusions}`.
`coreProfiles` entries are `{version,schemaPath}`; the exact root version
constraint MUST agree with the public validator's supported profile.
`registrations` entries are `{extensionId,version,mode,apiNames,coreProfiles}`;
`mode` is `sdk-default` or `explicit`, `apiNames` is an exported-name array.
Missing mappings produce `unmapped`, never an inferred registration.
`exclusions` entries are `{path,reason}` and MUST resolve to discovered items.
Schema discovery covers `spec/core/**/*.json`, `spec/extensions/**/*.json` and
`spec/projections/**/*.json` files declaring `$schema` or `$id`, plus every
embedded extension schema; package manifests are separately discovered by the
canonical `spec/extensions/*/package.json` pattern. API discovery resolves every
export/re-export from each `package.json` exports entry, mapping built paths
to checked source entrypoints. Source mappings are build code, not artifact input.

`operations.json` is `{profile:"umf.reference.operations/1",operations}`.
Every operation is `{id,title,kind,sourceSystem,targetSystem,coreProfiles,extensionVersions,subset,limitations,apiNames,fixturePaths,runtime}`.
`kind` is `import`, `export`, `round-trip`, `edited-round-trip`, `classification`,
`projection`, `inspection`, `validation`, `serialization`, `selection`,
`structural-diff` or `consumer-execution`. Systems are explicit strings, not
support grades; extension versions are `{id,version}[]`; other plural fields
are string arrays. `subset` and each limitation are nonempty text.
`runtime` is `{availability,profileId,requirements}`, with availability
`browser`, `host-only` or `unavailable` and textual requirements. `profileId`
selects a compiled, trusted operation bridge; data never supplies an import path.
Registration mappings MUST be exercised against the named exact manifests;
default mappings MUST agree with both SDK construction and low-level API behavior.

Overlays contain `{profile:"umf.reference.overlay/1",entryId,summary?,body?,relatedIds?}`.
They MAY supply explanation and relationships, but MUST NOT override generated
constraints, capabilities, versions, registration facts, outcomes or digests.
Missing target IDs, duplicate overlays and broken links refuse generation.
Example descriptors contain `{profile:"umf.reference.example/1",id,operationId,inputPaths,expectedPath,apiNames,guideIds}`.
Input names map to source paths; all names are fixed by the trusted bridge.

Authored `guides/*.md` become guide entries using the file basename as `guideId`,
the first Markdown heading as title and first paragraph as summary. Guide text
is rendered inertly; it cannot override generated facts. `examples/catalog.json`
is an array of the Example descriptors above.

### Evidence allocation and correspondence

`evidence-map.json` is `{profile:"umf.reference.evidence-map/1",allocations}`.
Each allocation is `{id,operationId,recordPath,readerId,selector,closureProfile,supersedes}`.
`selector` is an exact JSON Pointer or a Markdown heading anchor; `readerId`
and `closureProfile` select installed readers and dependency rules. `supersedes`
is an evidence-ID array. Reader code MUST validate the source record format,
resolve the selector and extract outcome/scope from the original record. An
allocation MUST NOT author a success, native version or tested source fingerprint.
Prose records without machine-checkable outcome/closure can be linked as
unassessed records; they MUST NOT receive `matching` correspondence.

Evidence is `{id,source,readerId,selector,outcome,correspondence,scope,versions,limitations,commands,inputHashes,closureComplete,supersedes}`.
`source` is Source; `outcome` is `passed`, `failed`, `mixed`, `skipped` or
`unassessed`; `correspondence` is `matching`, `historical`, `unknown` or
`unassessed`; `scope`/limitations are text; `versions` is a string-to-string map;
`commands` is a string array or an empty array when absent; `inputHashes` is
`{path,sha256}[]`; `closureComplete` is boolean. Optional `observedAt` is the
recorded timestamp, never the site build time. Missing facts MUST remain explicit
in scope/limitations; an absent fingerprint closure yields `unknown`.

Existing qualification records remain byte-identical. Initial evidence discovery
inventories `fixtures/validation/**/*.json`, `fixtures/*/*results*.json`,
`fixtures/*/*oracle*.json` and `docs/helix/04-build/evidence/**/*.{json,md}`;
additional paths require explicit allocation. The builder emits a downloadable
`evidence-inventory.json` with `{profile:"umf.reference.evidence-inventory/1",items,exclusions}`;
items are `{source,allocationIds,assessment}` with assessment `mapped` or
`unassessed`. This is a path census, not a completeness claim about all native
tests. `exclusions` contains `{path,reason}` rules. The reference consumer's own
`docs/helix/04-build/evidence/generated-reference/**` outputs are explicitly
excluded to prevent build-evidence self-hash cycles; they cannot establish native
integration support. Missing allocation never silently removes other discovered records.

`matching` requires exact operation/profile/subset allocation and the complete
tested dependency closure demanded by its installed closure profile. Compare
every recorded participating hash against current input bytes, including
fixtures, semantic contracts, runtime/dependency pins and reader-owned required
inputs. Any mismatch yields `historical`; missing dependencies yield `unknown`.
Repository commit equality or file existence alone cannot yield `matching`.
External dependencies without immutable verified pins also yield `unknown`.
Recorded `dist/**` hashes remain visible in `inputHashes`, but this source
profile never reads ambient distribution build outputs as current evidence.
Their presence, absence or host-dependent bytes cannot alter the reference.
An unverified recorded artifact prevents `matching` and complete closure;
independently observed source mismatches still yield `historical`. Actual
reference runtime assets remain bound by their own build-input inventory.

Aggregation never converts a declaration into a pass. For the same operation
and exact scope, incompatible unsuperseded outcomes produce `conflicting` and
retain every record. Supersession must be explicit, acyclic and exact-scope;
dates do not imply supersession. Otherwise summary correspondence is `matching`
only when every allocated observation is assessed, complete and matching;
`historical` if any is historical; `unknown` for partial/unknown allocation;
`unassessed` for none. Individual records always remain visible. A matching
failure remains a failure. Different subsets never merge into blanket support.

### Routes, loading and integrity

Routes are relative to the deployed site base: `reference/<view>.html`, where
view is one of the seven HTML basenames above. `#entry=<encoded-id>&pointer=<encoded-pointer>`
selects an entry and optional schema position using URLSearchParams. Workbench
adds `example=<example-id>`; source text MUST NOT appear in URLs. Unknown
IDs/versions show an explicit miss and search/version recovery, never auto-upgrade.
Search indexes titles, summaries, identities and loaded definition text; it MUST
label this scope and MUST NOT silently fetch all sources for full-text search.

Reference assets load only same-origin paths under the deployed reference root,
with no redirects, using the manifest's exact hashes. Each HTML page embeds the
SHA-256 digest of `manifest.json` in a nonexecutable `reference-integrity` JSON
script; the existing page signature binds it. Verify the manifest before shards
or tool assets; fetched bytes MUST match before use. No manifest-to-HTML hash
cycle: HTML is signed separately and excluded from manifest outputs. Navigation
among HTML pages is checked independently. Unsigned development previews MUST
be labeled as previews and cannot be publication evidence.

### Local workbench protocol

A fixed worker receives `{protocol:1,requestId,operationId,coreProfile,registryProfile,inputs}`.
Before an optional compiler operation, the controller MAY send
`{protocol:1,type:"compiler-assets",wasm:ArrayBuffer}` containing manifest-verified
compiler bytes. Responses are `{protocol:1,type:"compiler-ready"}` or
`{protocol:1,type:"compiler-error",message:string}`. Workers never fetch assets.
`requestId` is a nonempty string; `inputs` is a string-to-string map of the
selected bridge's admitted source texts. A fixed registry profile lists exact
extension versions; default SDK registration and explicitly empty registration
are separate profiles. No auto-installation or implicit fetching occurs.
Operation bridges are compile-time allowlisted and versioned with the bundle.
An optional WASM compiler profile MUST pin compiler/emitter bytes in the
manifest and receive packaged assets explicitly; it cannot retrieve imports.
Its required CSP permissions MUST be stated before execution. A denied
permission produces `REFERENCE_UNAVAILABLE`; inspection remains available.

Responses are `{protocol:1,requestId,state,outputs,diagnostics,retainedSources}`.
`state` is `completed`, `refused` or `failed`; `outputs`/`retainedSources` are
arrays of `{name,mediaType,text}`. Diagnostics are existing semantic diagnostics
or `{code,path,message,severity}` reference diagnostics. A completed operation
may still report incomplete interpretation or target losses; the UI MUST expose
them. Every submitted original text remains available independently of results.

Core inputs inherit CONTRACT-001 limits: 4,000,000 UTF-16 code units per text,
depth 128 and 100,000 traversed values. Total submitted text is at most 8,000,000
UTF-16 code units. A worker exceeding 10 seconds is terminated; cancellation
terminates it immediately. Controller outcomes `cancelled` and `timeout` preserve
input and clear stale output. Superseded request IDs cannot commit results.
Workers have no network capability; only the controller loads explicit tool assets.

Reference index limit is 2 MiB; detail shard limit is 8 MiB; individual source
preview limit is 4,000,000 UTF-16 code units. At most 50 search rows render at
once. Exceeding limits fails explicitly; originals remain downloadable when
their reuse terms permit. Inspection uses fixed build-time validators; no `eval`
or `new Function` is permitted. An operation needing dynamic native compilation
is `unavailable` under this fixed profile, with an explicit reason.

## Precedence and Compatibility

Core schemas and semantic contracts govern meaning; manifests govern declarations;
original evidence governs observations. Reference records are derived views.
All exact profile versions remain separate from SDK package version. Duplicate
IDs, unresolved entry joins and embedded/standalone schema disagreement fail.
Unsupported reference/protocol major versions refuse. Shape changes require a
new profile version; consumers must not silently discard unfamiliar fields.

## Error Semantics

| Condition | Code / outcome | Recovery |
| --- | --- | --- |
| Invalid descriptor/schema or duplicate ID | `REFERENCE_STRUCTURE`; build fails | Fix authoritative input/mapping |
| Escaping path, forbidden URL or unsafe markup | `REFERENCE_INPUT`; build/refusal | Supply admitted local input |
| Broken join, missing selector or unsupported mapped reader | `REFERENCE_LINK`; build fails | Repair allocation; unallocated evidence stays unassessed |
| Generated output differs | `REFERENCE_DRIFT`; check exits nonzero | Regenerate and review |
| Asset differs or manifest missing | `REFERENCE_INTEGRITY`; loading refuses | Restore consistent signed bundle |
| Unsupported tool/profile | `REFERENCE_UNAVAILABLE`; refusal | Choose available profile; retain input |
| Resource bound / termination | `REFERENCE_LIMIT` / `REFERENCE_TIMEOUT` | Reduce input or cancel; no partial success |
| Incompatible protocol | `REFERENCE_PROTOCOL`; refusal | Use matching compiled assets |

Build diagnostics use `{code,path,message,severity}` and nonzero exit status;
warnings never authorize support. Semantic failures preserve their existing codes.
They are local process/UI diagnostics; this profile defines no analytics export
or collection of user schema content.

## Examples

The schema entry ID `["schema","spec/core/bit128-document.schema.json",""]`
selects the exact experimental profile; it does not select SDK version 0.2.0.
An extension entry `["extension","umf.actions","0.1.0"]` links its manifest,
registration APIs, schema and allocated operation evidence independently.

A recorded passing native check whose participating source hash differs is
displayed as **Passed / Historical source / recorded native version and subset**.
A complete matching failed check is **Failed / Matching source**, never supported.

## Validation Checklist

- [ ] JSON Schemas and reader validators implement these surfaces.
- [ ] Inventory, exact-source, evidence correspondence and conflict controls pass.
- [ ] Deterministic/check-mode, signed closure and base-path checks pass.
- [ ] Bun/browser parity, fixed CSP and cancellation/refusal paths pass.

These are implementation exit criteria, not executed evidence.

## Reader companion profile 1

`reader.json` is an optional additive, manifest-bound presentation asset; original
reference entry/index profiles and IDs remain unchanged. It MUST validate against
`schemas/reader.json`. The fixed reader consumes only `umf.reference.reader/1`.
It contains `latest:{id,version}`, `concepts` (ordered `{key,title,pointer,description,role?}`),
`api` (ordered `{id,title,kind,task,summary,href}`), `propertyText` (key-to-text map),
`examples` (complete core documents), and `scalarMeanings` (label-to-text map).
API `href` names a manifest-listed `reader/<entry-id-sha256>.json` detail shard.
Each shard validates against `schemas/api-reader.json`: `id,kind,task,purpose,
authored,type,parameters,returns,members,alternatives,related`, with optional
`value,example`. Parameter/member rows have `name,type,optional,description,links`.
Links contain exact API IDs. Kind is Function, Interface, Type alias, Constant,
Schema, Package, Class or Enum. Task is Read and validate, Inspect and select,
Author and edit, Serialize, Import and export, Extensions or Other APIs.

Every companion join MUST resolve before emission; original exports remain in
the complete census. `authored:false` identifies generated structural explanation
without reviewed usage guidance. Unknown runtime availability remains unknown.
Reader index and detail assets are bounded at 2 MiB and 8 MiB respectively; size
excess fails generation. Their inputs join the deterministic manifest closure.

Core concept selection adds `concept=<key>` to an existing exact `entry` route;
its key must map to the selected schema's pointer and optional role. Unknown
concepts refuse. Latest-only default navigation MUST NOT rewrite explicit older
entry routes. Source pointer coordinates stay exact. Authored meanings MUST NOT
override schema admission rules or semantic contracts. Branch conditions remain
visible; unresolved constraints MUST NOT be presented as unconditional Optional.

### Schema example YAML asset

`example.yaml` is a manifest-bound UTF-8 serialization of `reader.json`
`examples[0]`, emitted through the public UMF YAML writer. Generation MUST verify
that reading it as YAML yields the same example values. It is bounded by the
existing source-preview limit. Schema example presentation defaults to YAML;
JSON is an explicit alternate view of the same values. Switching formats MUST
NOT rewrite canonical examples, original schemas, source records or routes.
This adds an asset; the reader record profile and existing fields are unchanged.

## Current documentation amendment — 2026-10-18

Owner direction supersedes historical core browsing, core-profile selection and
migration-oriented reader requirements above. Document core 0.10.0 as the single
current schema: no core version picker, history catalog or version badges. Old
core links resolve to the current schema and preserve valid pointers; invalid
pointers refuse visibly. Original source inventories and native/extension evidence
keep their truthful identities and qualification; historical evidence is not
relabelled as current support.

Workbench examples use core 0.10.0 and open as YAML, with accessible YAML/JSON
buttons converting current edited values through the public interoperable
serialization API. Malformed, duplicate-key or inexact values refuse without
replacing input. Cancellation and input edits invalidate pending conversion.
Original bytes remain downloadable. Native Protobuf keeps its own syntax.
Property/default execution APIs restricted to earlier envelopes are not offered
by the current workbench; their API declarations retain their original limits.
Every schema disclosure starts collapsed, including complete examples. Explicit
user expansion and format switching remain keyboard accessible.

Acceptance: verify all supplied examples execute, format parity after edits,
conversion refusal and cancellation, current-only navigation, old-link recovery,
and zero initially open schema disclosures in Chromium at desktop/mobile widths.
