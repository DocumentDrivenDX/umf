---
ddx:
  id: umf.plan.metamodel-authority
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - id: US-089
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: CONTRACT-080
      kind: references
    - id: TD-091
      kind: informed_by
    - id: STP-091
      kind: informed_by
---

# Authoritative UMF metamodel completion plan

## Outcome and scope

Owner direction, 2026-10-18: finish the UMF-for-UMF authority transition,
remove duplicate definitions and legacy paths, review the plan, then execute with
Sol coordinating Luna. The existing model is a JSON Schema projection. Completion
means an authored UMF model generates the current core schema, types, validation
program, reference and ontology. No reverse generation from JSON Schema remains.
The current core is 0.10.0; historical core profiles are not runtime compatibility
targets. Native dialect versions, independently released vocabularies and original
evidence retain their identities. This work does not claim new native equivalence.

Governing fidelity: CONTRACT-001 through CONTRACT-011, CONTRACT-076/078,
ADR-001/002 and the project test plan. ADR-005 and CONTRACT-080 own this cutover;
US-089-AC19–25 and STP-091 define completion. Catalog: installed HELIX 0.17.0.

## Findings and design choices

- `scripts/reference/self-model.ts` currently generates the model from schema
  fragments. Remove this authority direction, including embedded raw schema rules.
- Current TypeScript validation recursively strips newer fields and invokes older
  profiles. Python separately implements an incomplete 0.8 profile. Replace both
  with the same model-declared structural and ordered semantic rules.
- Adapter imports, classification operations, schema refs, package manifests,
  resource accounting and browser validators depend on historical core profiles.
  Migrate useful functionality before removing those profiles; changing version
  strings alone can reinterpret formerly unknown keys and is insufficient.
- The public browser 1.1.2 does not support the current model. Host shims and a
  separate explorer route compensate. Release a properly qualified current-model
  renderer and use one route owner. Do not patch immutable installed assets.

## Architecture and interface freeze

The authored source is `spec/metamodel/umf.yaml`, a current UMF document using an
explicit closed `umf.metamodel` vocabulary. It declares language objects, fields,
required presence separately from nullability, accepted shapes, unions,
conditions, unknown-content policies, domain refinements and ordered invariants.
Raw JSON Schema fragments and callbacks to handwritten core validators are not
allowed as authority. Human explanations accompany executable rules.

The compiler under `scripts/metamodel/` parses with independent bounded safe JSON/
YAML value admission, validates its closed vocabulary and rejects unknown
opcodes, dangling targets and ambiguous output identities. It must not bootstrap
through `readDocument` or the current generated validator. After generation, the
model passes current core structural admission and closed metamodel compiler
checks. This does not claim complete semantic registry validation: with the
ordinary empty registry, the metamodel extension remains unknown and
`complete: false`. A second generation must be a byte-identical fixed point.

Outputs and consumers:

| Output | Owner/consumer |
| --- | --- |
| `spec/core/schema.json` | Single current Draft 2020-12 document schema; no layered historical documents |
| `spec/core/semantic-type-reference.schema.json` | Generated reusable semantic-reference shape |
| `spec/core/extension-package.schema.json` | Generated current package envelope; package release identity remains independent |
| `spec/metamodel/generated/core-constraints.json` | Inert ordered semantic program, shared by TS/Python |
| `spec/metamodel/generated/domain-policy.json` | Domain/literal/facet eligibility and known-property policy |
| `src/generated/core-model.ts` | Current version/schema, vocabulary, constraints, domain policy and generated public types |
| Generated standalone structural validator | Browser-compatible TS module, produced through pinned schema compiler |
| `spec/metamodel/generated/python-shapes.json` | Generated Python shapes; no separately maintained field inventory |
| `spec/metamodel/package.json` | Generated closed metamodel vocabulary manifest and current coreVersion; replaces manual raw-schema annotations |
| Reference/ontology/catalog bundle | Derived from the authored model and compiler provenance |

Sol freezes exact file/export names in CONTRACT-080 before parallel edits.
`python/hatch_build.py` must package generated shared resources and exclude
inert historical schemas; replace `fixtures/python/core-conformance.json` with
current-core vectors after retaining the original baseline inert. The
constraint kernel supplies reusable data operations, reference resolution,
prototype-safe equality (one shared generic implementation, including standalone
code generation), exact-number/UUID/Unicode mechanics, copying/resource
limits and explicit registry callbacks. Rules declare conditions, targets,
parameters, code/message/severity/path and execution phase/order. No `callValidator`
or named per-core-rule escape hatch. Preserve exact callback source context and
diagnostic ordering. Structural failures must not reach unsafe semantic casts.
JSON Schema enforces representable constraints; the semantic program explicitly
owns graph/reference and other nonstructural rules. Neither implies native meaning.

## Ordered work packages and ownership

| Work | Owner and delegation | Dependency | Reviewable result / gate |
| --- | --- | --- | --- |
| M0 Authority and baseline | Root; Sol reviews | None | Governed contracts/design/tests, frozen current behavior vectors, classified retirement census; plan review findings resolved |
| M1 Model/compiler/kernel | Sol | M0 reviewed | Closed model vocabulary, complete rules, deterministic build/check, TS types and structural validator; interface freeze |
| M2 Python parity | Luna under Sol | M1 interfaces | Generated shapes + shared rules; full current-core admission, registry and diagnostics; packaged resources and installed tests |
| M3 Producers/operations | Luna under Sol | M1 interfaces | Adapters, current classifiers, receipt refs, extension packages and active fixtures use current model without semantic loss |
| M4 Browser/reference | Freed Luna under Sol | M1, M3 catalog inputs | Current reusable renderer release/pin; one schema route; generated examples/reference/ontology; actual desktop/mobile browser evidence |
| M5 Retirement/integration | Sol, Root review | M1–M4 | Delete ledger complete, boundary/import/stale-output checks and complete regression; no hidden old dispatch |
| M6 Release and live proof | Root with Sol verification | M5 independent review | Reviewed diff, CI build signing, deployment, live bytes/claims and browser journeys verified |

Sol delegates bounded files with acceptance checks, reviews each Luna result and
owns integration. No overlapping edits; shared generated artifacts are compiler-
owned. Root owns governance and final independent review. Subtasks may narrow for
context size but not silently reduce scope. Record blockers and continuation in
this plan; no tracker or separate user chat is needed.

## Retirement ledger

| Existing path/family | Replacement and deletion condition |
| --- | --- |
| `spec/metamodel/package.json` manual annotation schema | Generated closed metamodel vocabulary manifest, no required raw-schema fragments or reverse-source authority |
| `docs/helix/05-deploy/reference/model/metamodel.ts` projection/graph | Authored model relationships plus explicit descriptive connections; preserve graph closure and key/value links |
| `scripts/reference/self-model.ts` reverse-schema extraction | Compiler model consumer; remove reverse builder and embedded raw-schema authority once equivalent model views pass |
| Layered core document schemas and old generated standalone validators | Single generated current schema/validator; archive original evidence inert and remove old runtime imports and distributed resources |
| `src/validation/document.ts` historical dispatch and per-profile semantic modules | Structural gate + ordered generic kernel; remove downgrade/strip/recurse paths after baseline/current parity |
| `src/model/*-transition.ts` nine historical upgrade/rollback modules and exports | Remove active core transition APIs; retain original receipts only as inert historical evidence |
| `src/model/schema-literals.ts`, eligibility/equality/known-property tables | Generated model policy + generic mechanics; remove duplicated decision tables |
| `python/src/umf/{schemas,models,validation}.py` hardcoded profiles/shape/rules | Generated current models and shared program; no incomplete old profile fallback |
| Native adapters/current classifiers with old envelope guards and operation `$ref`s | Current construction/classification, collision handling and qualified receipts; retain useful APIs and native extension migrations |
| Old extension-package `coreVersion` values/current schema refs | Migrate active packages and refs with schema validation; do not alter independent vocabulary/package release versions |
| `static-validators.ts`, `schema-work.ts` historical schema inventories | Generated current schema and model-declared traversal/resource metadata |
| Root `explorer.html`, `schema-navigation.js`, `catalog-defaults.js` | One `reference/core.html#view=ontology|reference|catalog` host, component-owned collapsed defaults; delete old host/shims, update all owned links, inventories and seals |
| Version picker/history entries and stale core API docs | Current generated docs; preserved source evidence explicitly historical, no unsupported operation advertised |

The census classifies every historical marker/reference in source, tests, schema
resources and manifests as active replacement, independently versioned native
meaning, or inert evidence. Record exact retained historical paths and reasons.
No source/build/runtime may import the inert archive. Default packaging must not
copy the archive into current distributions. Zero unexplained legacy matches is
the gate; a generic grep exclusion of all fixtures or tests is not acceptable.

## Validation and review gates

1. Before M1 overwrites authority, Sol implements and runs
   `bun scripts/metamodel/capture-baseline.ts --output docs/helix/04-build/evidence/metamodel-authority/baseline`
   against HEAD `19fe5f1bc98840e3177e0d05584321c1e274bfdd`. Capture canonical
   `cases.json`, `ts-results.json`, `python-results.json`, source hashes and
   `receipt.json`; keep original source snapshot identity and command outputs.
   Freeze these files read-only for comparison; no generated successor may
   overwrite them. Python historical gaps must be recorded as gaps, not targets.
   Cases must cover the always-present `EXPERIMENTAL_CORE_SEMANTIC_TYPES` warning
   and private-view-dependent UUID/literal paths. Direct 0.10 literal evaluation
   currently differs from its downgraded 0.9 view; reviewed correction records
   must say which entry point and meaning changes and why.
   Freeze independent current-core behavior vectors before deleting old code:
   valid/invalid structure, all domain/refinement combinations, literal/key/
   relationship/default rules, semantic registry callbacks, unknown contents,
   diagnostic order and pointer paths. Preserve old outputs as dated baseline.
   Existing bugs need explicit reviewed corrections, not bulk expectation edits.
2. Compiler tests cover each opcode, rejected declarations, missing refs, unknown
   operators, hostile property names, exact numbers and model mutations that
   predictably change both schema and runtime behavior. Generated tests must not
   merely restate the generator. Model-authoring changes propagate to both runtimes.
3. Delete derived outputs and generate cleanly; compare two independent clean
   builds, self-validation/fixed point and `--check` with no writes. Missing/extra/
   stale artifacts must fail. Source hashes identify the authored model/compiler.
4. Run full TS, Python installed-package and browser current-core conformance;
   Python's old incomplete subset is not the parity oracle. Test JSON/YAML round
   trips, unknown/prototype-safe data, registry context, ordered diagnostics and
   resource refusal. Migrate meaningful tests; do not skip/delete failing tests
   just to remove legacy behavior. Historical-only tests move to inert evidence.
5. Exercise every changed producer/classifier family with retained native inputs,
   explicit collision/refusal handling and exact preservation receipts. Run required
   scoped native oracles. Historical evidence remains historical until rerun.
6. Run full repository tests, type/declaration/build checks, architecture boundaries,
   schema audits, package/embedding/integrity and reproducibility gates. Use disjoint
   shards while iterating, then account for the complete test inventory.
7. Real Chromium: cold single Schemas route, ontology neighborhood, Record keys,
   Field/itemType/scalarType accepted values, catalog local-file/current model,
   API constant/function/interface, YAML default + JSON toggle/edit round trip,
   collapsed groups/disclosures, keyboard, Back/refresh, mobile layout; zero page
   errors. Verify owned links do not visit retired hosts.
8. Root independently reviews semantic authority, complete ledger, test evidence
   and generated diff. Fix findings and re-review. Update docs to actual support.
9. Deploy through existing automated build-role signing (no 1Password/human key),
   verify live manifest/critical bytes/public signature claims and repeat browser
   journeys. Failed deployment or stale CDN bytes remain an open gate.

## Risks, unknowns and execution record

Main risk is accidental semantic reinterpretation in native producers or unknown
properties. Preserve source bytes, compare before/after, and refuse with retained
source where meaning cannot be carried. Structural parity alone is insufficient.
Cross-runtime numeric and diagnostic semantics require explicit shared vectors.
Reusable renderer source is owned here under
`docs/helix/05-deploy/schema-browser/`; package repository is DocumentDrivenDX/umf.
Target a breaking current-profile release `@documentdrivendx/umf-schema-browser`
2.0.0, GitHub tag `schema-browser-v2.0.0`, reproducible tarball/release manifests
and exact integrity-locked consumer pin. Update immutable producer inventories,
CI original-source qualification and package docs together. Build and qualify
the concrete release before attempting publication. A registry/publish authority
blocker leaves release/deployment open; it never permits a shim fallback or
a claim of completion.

Reusable renderer release work must preserve local-file and embedding behavior;
new support claims require a real release/pin and its producer proof.

The inventory currently finds 47 old-marker producer files, 90 exact guards in
76 files, 159 core-schema files and 65 extension-schema files with old core refs;
873 test files require classification. Counts are an audit starting point, not
acceptance denominators. A reliable token estimate is unknown; no comparable
meter is available. Bound work by interfaces and acceptance gates and record
actual commands/time/results; do not invent a numerical budget.

Review status: Sol readiness review completed 2026-10-18. R1 corrected actual
Python paths and named wheel/resource/current corpus outputs. R2 added generated
metamodel vocabulary manifest retirement and authored graph consumer migration.
R3 added executable pre-overwrite baseline capture, exact frozen outputs,
experimental warning and UUID private-view correction requirements. Renderer
source/release/pin ownership, shared equality and program grammar freeze were
also made explicit. No unresolved readiness blocker remains; implementation is
authorized after Root's explicit handoff. Completion is not yet claimed.

Continuation: Root owns plan/governance; Sol holds read-only inventories from two
Luna agents. Preserve pre-existing untracked generated-reference live evidence.

### Execution checkpoint — 2026-10-18

M0 captured original139 observations and a separate139-case current composite
supplement from isolated original source, retaining source hashes and original
case identities. Initial generated TS structural+full semantic program matches
all139 outcomes and ordered diagnostics exactly with real Registry. Root's
key/relationship phase program separately matches122 admitted cases;17 structural
failures do not enter semantics. Evidence is under `evidence/metamodel-authority/`.
C001 direct current UUID admission, C002 completeness/maturity separation and
C003 useful current property/default APIs are explicit reviewed deltas, not
silent baseline rewrites. Full parity after those exact corrections, Python,
consumer/browser/native regression, retirement and release gates remain open.

### Integration checkpoint — current work ownership

Sol leads compiler/kernel/model/type integration and delegates Luna official
Python/shared-program/SDK-runtime work and Luna adapter/classifier/model/spec
migration. Root owns independent review/boundaries, extension/compilation/
projection consumers, tests/actions and tests/compilation, their authored
fixtures/actions and fixtures/access/{commerce,golden-vectors}, other active spec
schema directories outside core/extensions/metamodel, and final release/pin/seals.
No publication has occurred for this cutover.

Root's source consumer batch now uses generated CURRENT_CORE_VERSION and one
current schema resource; full library tsc passed. All21 current domain ontology
Documents validate. Independent kernel adversarial tests pass4cases/23assertions;
architecture boundary tests pass8cases/34assertions. Action API15tests passed.
The independent authored compiler census4tests/2119assertions passed after
recorded marker-only fixture transformation and refreshed source hash closure;
original authored census bytes and exact deltas are retained in current-fixtures.
Broader test shards are still being migrated, including deliberate retired-marker
negative cases. Nothing is skipped to pass. A stale checksum or former
old-profile refusal is reviewed against original meaning before changing it.

Substantive authority review requires literal applicability to move from named
core-property conditionals into model-declared ordered generic refinement
mechanics and selectors. Sol accepted this gate and is updating both runtimes and
mutation tests. Earlier Python/browser/TS139-case proofs qualify their captured
sources only; final descriptor implementation must renew them.

One-time baseline tools now survive as byte-exact inert text under capture-tools,
not current compiler imports. Boundary scanner covers all spec JSON, recognized
core discriminator/enum/profile data and transitive compiler dependencies.
Remaining old schema files, host shims and extension schema discriminators remain
explicit failing retirement items until migrated/deleted. Browser2.0 release,
full repository/native evidence, final review and live deployment remain open.

### Review checkpoint — authority and retirement

The literal policy now declares ordered refinement applicability, selectors and
generic mechanics in the authored model. Compiler mutation and closed-grammar
tests pass25 cases/142 assertions. Strict-CSP Chromium validates all139 current
corpus cases, including the real Registry Boolean-schema callback, with zero
page errors. Python's shared-program and installed-wheel evidence must remain
bound to its captured source closure. Arbitrary object-schema compilation retains
its separately qualified dynamic-compilation requirement.

Root's independent boundaries pass9 cases/36 assertions, including actual shipped
inventory checks. Action-plan/local-profile and adversarial kernel tests pass27
cases/162 assertions. Prepared identity coverage passes7 cases/169 assertions,
including current foreign-source refusal and explicit codec-profile verification.
The full action and compilation regression inventories are still running.

Retirement review rejected archiving useful public relationship, dataset bounds,
facet inspection and nullability inspection coverage merely because the original
fixtures named an old core version. Sol is restoring current equivalents; the
final ledger must name those replacements and deduplicate entries. Transition-only
evidence remains inert. CI now checks generated-model drift, source authority,
strict-CSP validators and the actual site distribution before deployment. The
browser producer release, final consumer pin and live deployment remain open.

Root's exact isolated action inventory passes63 tests/512 assertions across10
files; the compilation inventory passes881 tests/5005 assertions across18 files.
Thirteen additional search/navigation fixtures required recorded core-marker-only
migration; their native payloads remain unchanged. CLI imports now use direct
consumer modules rather than loading the complete SDK barrel: a measured cold
usage invocation dropped from7.42s to1.86s, and the CLI writer test passes under
its original60s bound. Full source type checking passes. The authority scan passes
1399 files and31 retired paths; emitted retired JavaScript/declaration modules are
also rejected in shipped inventories (9 tests/37 assertions). Full tools type
checking still has integration findings owned by the current Sol/Luna work.

Release readiness discovery found working GitHub access and existing immutable
schema-browser releases. Local npm authentication returns401; the repository has
no npm release credential. Build, review and qualify the concrete2.0 candidate
before any final authentication request. This is an open publication gate and
does not authorize relabeling1.1.2 or weakening asset parity.

### External native qualification gate — Truss preparation

Read-only inventory of the available Truss checkout found explicit0.7/0.8
consumer profiles, original receipt identities and0.8 native model pins. Its
workspace contains unrelated ongoing changes and was not modified. The UMF host
prototype also pins an original Truss compiler, native binding and lowering
artifacts by exact identity. A marker/hash rewrite cannot qualify those native
effects. See [the scoped inventory](evidence/metamodel-authority/external-truss-current-gate.json).

Root/Sol review retains the source feature and original packets, archives the
exact original native-positive/correspondence harness as inert evidence, and
separately qualifies authored current logical closure, write checks and exact
Subject codecs. Active tests explicitly refuse historical native preparation;
they do not claim that a refusal exercises downstream native guards. Renewed
native qualification requires an upstream Truss consumer/profile/package upgrade
and fresh compiler/binding/lowering observations. This external gate remains open;
the all-consumers milestone is incomplete for that integration. A schema/API/
browser release can state its achieved scope while excluding this native profile
from current-core support. No full native completion is claimed.

### Browser and residual duplication review

Root retired22 inactive inspection/operation schema variants and narrowed public
types to actual emitted authoring/inspection formats; Sol retired11 inactive
kind/record-type variants. Supported independent formats retain their identities.
The source/distribution boundary includes all64 retired paths. A symbol-aware
cleanup removes repeated imports/registrations of the same current core resource
across79 source files; source type checking and62 focused regression tests/735
assertions pass. Root's independent C001/C003 review passes21 tests/123 assertions.

Actual in-app browser review found incorrect ontology-to-reference targets,
missing resolved scalar-type values, conditional summaries dropping nested paths,
and catalog groups opening on a fresh empty-state load. These are release-blocking
usability findings assigned to M4; source generation and automated browser counts
alone do not close them. Item-type object keys, YAML/JSON toggling and the supplied
AVRO_KEYS_EXTENSION constant journey were verified directly.

### Integration verification update

All 62 security files pass in isolated Bun processes: 324 tests and 5,739
assertions. The exhaustive 13,122-state rule/disclosure corpus passes under its
original 60-second bound. Review caught repeated admission of the complete
immutable rule program and literal policy; preparing private immutable snapshots
removed that overhead while preserving defensive admission for mutable caller
programs and policies. Mutation-after-success and snapshot-custody tests pass.
See [Root's complete selected regression inventories](evidence/metamodel-authority/regression/root-shards.json).

The current typed-access witness retains every original truth/order/refusal
oracle and its backend-UNTESTED qualification. Four authored model/binding markers
were migrated; all 42 tests and 447 assertions pass. A remaining many-key budget
fixture now uses the current marker without changing its receipt-byte limits.
Originals and exact deltas are retained under `current-fixtures/`.

The retirement boundary now covers 67 source paths and rejects obsolete renderer
assets in the actual published inventory. Independent review found 119 stale
root renderer chunks, including assets older than the installed release. The
publisher must remove these, the old renderer styles/scripts and both retired
hosts; namespaced package assets and active first-party assets remain distinct.
The strengthened boundary tests pass (9 tests, 39 assertions).

Workbench worker startup and current validation now pass in the actual in-app
browser. YAML input defaults and JSON conversion preserve example values. Nested
rule summaries, concise open-enum presentation, complete package inventory
verification and final browser review remain M4 gates. The original UUID native
qualification receipts are stale against the changed source; Sol owns renewed
five-target observations rather than relabelling their old fingerprints.

### Final integration review follow-up

The source boundary now inventories host `scripts/` and `tools/`, in addition to
portable library, schema and browser sources. Exact guarded negative assertions
remain executable evidence controls; their path, full assertion bytes and unique
source span must match, and a stale/changed control fails. An unguarded old
producer beside a valid control still fails. Boundary tests pass 11 tests and
62 assertions, including emitted facet-module retirement and projection source
core identities. Independent extension/native/receipt format versions remain
valid. Two residual host generators were assigned to M3 before source closure.

The current native-preparation guard retains its original compiler, binding,
lowering, closure and batch checks. The obsolete transition-specific Truss stage
and illustrative record-home probe are retired with exact source archives.
Current logical preparation/refusal tests pass 13 tests and 106 assertions.
Current PG18 catalog compilation admits its 13-transform fixture and refuses an
old marker; this portable compiler check alone does not renew native execution.
The external issuer and Truss gates remain explicit.

Frozen document-research reports remain linked at immutable revision
`19fe5f1bc98840e3177e0d05584321c1e274bfdd`, with original hashes in the release
inventory. The current research builder no longer republishes historical report
copies inside its current distribution. Public evidence links lead directly to
those originals; their qualification is not silently upgraded.

Release identities are SDK 0.5.0, Python `umf-core` 0.9.0 and schema-browser
2.0.0. SDK 0.3.0 is already published and must remain immutable. The browser
producer release precedes its exact installed consumer pin; then all provenance,
fixed validators, reference outputs and native qualification fingerprints must
be regenerated against that final closure. npm authentication remains an open
publication gate until actual registry publication succeeds.

### Host producer and historical verification closure

Python host generators/probes are now a distinct source-census lane. The combined
inventory covers 3,138 files and 77 retired paths, with 12 boundary tests and 104
assertions. The obsolete Python core schema upgrade generator is archived and
retired; it can no longer recreate layered core schemas or transitions. Security
generators derive current identity while retaining their independent twelve-carrier
wire codec; both reproduce all five existing current artifacts without semantic
changes. The independent Python semantic-type structural oracle agrees on 18/18
cases against the current generated schema.

Three Weft native request probes derive current pins and explicitly refuse retired
upstream source documents. Current external native qualification remains open.
Two historical evidence verifiers retain original checkout/schema/runtime pins,
with explicit historical-only scope; their read-only retained receipt checks are
not current profile admission or runtime schema definitions. See
[the host migration inventory](evidence/metamodel-authority/host-tools-migration.json).

The PG18 catalog provider now has a fresh actual native integration observation:
93 assertions over 260 typed cells, 13 transforms, three ordinary actors and five
rounds on PostgreSQL 18.6. Its receipt binds actual source/runtime hashes and
confirms disposable container/volume cleanup. That scoped observation does not
close the general security backend or external Weft/Truss gates.

### Concurrent main integration — 2026-10-18

Main advanced to `87b7f4343182d02eb486cd8cb79fc63e5ddaf745` while the
metamodel migration was being qualified. Its unified Python access API and
governing artifacts are preserved. The established unified-access CONTRACT-079
retains its identity; this previously uncommitted metamodel contract now uses
CONTRACT-080, with authored traceability updated. SDK 0.5.0 avoids changing the
concurrent owner's existing 0.4.0 draft release.

The earlier migration observations retain their actual source hashes. Integration
requires targeted API/boundary/SDK checks, generated provenance renewal, and
fresh UUID native campaigns where the strict gate binds the changed full source
closure. No old native receipt may be rehashed to satisfy that gate. Final
reference and site generation follows this new freeze. npm browser sign-in is
still required before publishing the reusable renderer and pinning its consumer.

The final site-source audit added authored deploy-site code and Python runtime
packages to the explicit source census. It caught the playground's default old
core marker and the reusable package's host example; both now use current-core
documents. Four valid playground presets retain their content, the invalid
preset refuses output, and JSON output preserves unknown extension content.
Current developer download links target SDK 0.5.0; retrieval is a release gate.

### Reviewed publication sequence after concurrent integration

The clean producer commit A qualifies and releases only schema-browser 2.0.0.
It does not publish SDK 0.5.0 or declare the full migration complete. The consumer
commit B installs the exact published renderer and freezes package/lock inputs.
The strict UUID source gates remain pending across that change: their final
actual native campaigns run against B's combined source closure. Publish SDK
0.5.0 and deploy only after those gates, the remaining regression census, final
reference generation, browser checks and build-signature verification pass.
This avoids running the same full native campaign twice merely because the
renderer dependency pin changes, without weakening the exact-source gate or
rewriting earlier observations.

### Integrated current-source candidate checkpoint

The SDK source is now 0.5.0 and includes the concurrent unified Python access
API. Its selected-field admission refuses missing/unknown availability or
cardinality, unsupported scalar labels and nonempty extensions before generating
or executing the bounded host profile. Fresh scoped PostgreSQL 18.6/Weft
observations, Chromium checks and an isolated installed host wheel
`umf-access` 0.1.0.dev2 are recorded separately; no published host wheel or
broader native equivalence is claimed.

The current producer census covers 3,138 files and 79 retired paths. All 44
retained schema generators execute and reach a fixed point, and all 373 active
schemas compile with their resource closure. Duplicate current-document schema
branches and generators that could recreate retired profiles are removed. Two
obsolete receipt-schema writers are retained as exact inert source archives.
Boundary checks pass 15 tests and 119 assertions; all four metamodel test files
pass 59 tests and 405 assertions. Source and tools TypeScript checks pass.

The local SDK 0.5.0 candidate passes the installed distribution probe, including
139 core vectors and the new public generator. Its renderer dependency is still
the installed 1.1.2 pin, so this archive is an integration candidate. The reusable
renderer 2.0.0 candidate passes reproducible package builds, complete installed
inventory parity and Chromium under strict CSP. It remains unpublished. Exact
artifacts, inputs, runtimes and limitations are in the integration receipts.

The six older ideal gates retain source-functional, native-payload equality,
recovery and refusal observations. Their partly recoverable historical artifact
pins do not qualify current native admission or priority delivery. The narrow
current-native policy marks twelve corresponding acceptance criteria UNTESTED;
unrelated functional criteria and the original proof bytes remain intact.
Final per-file census and reference/site proofs are still closing gates. The
reviewed producer A / published renderer / consumer B sequence above remains
required, followed by actual UUID and scoped PG18 native renewal against B.

### Local candidate regression closure

The live test census now contains 590 files: 588 have passing local observations,
and the two strict UUID qualification files await actual native renewal after
consumer pin B. The census retains the original mixed runtime/source scopes;
it does not claim that all files ran at one clean release revision. All 174
producer files are classified with actual observations and retained available
raw logs. Reference/site checks pass 24 tests and 13,318 assertions under Bun
1.4.2, including regeneration, deliberate drift refusal and exact package custody.
The final reference rebuild incorporates this census closure.

A final host integration review found that copying the candidate package did not
select it for the canonical reference bundle. Explicit `--candidate` mode now
verifies the package, mounted copy and local preview declaration, compiles the
actual verified entry, and binds its code/styles to host provenance and asset
integrity. Default mode still requires the exact installed release pin. The
reference collector now uses current core identity and a canonically ordered
schema set; the complete regeneration and tamper test passes. The source census
now covers 3,139 files and the same 79 retired paths.

The fresh official Python `umf-core` 0.9.0 wheel passes 166 tests from an isolated
installation, including all 139 current core vectors. Its 23-member inventory
passes distribution checks, and all 19 included source/resource files match
current bytes. The wheel, SDK and renderer remain unpublished local candidates.
Final producer review, npm authentication, published consumer pin B, actual
source-bound UUID/PG18 renewal and final release/deployment checks remain open.
