---
ddx:
  id: umf.plan.conformance-extraction
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: umf.plan.repository-size
      kind: references
    - id: umf.plan.rust-migration
      kind: references
---

# Conformance extraction manifest

## Scope

Plan a core checkout **strictly below 100,000,000 bytes**, preserving complete
working domain-pack schemas/loaders and small test samples. Adapter tests and
their data belong to the external conformance suite; bundled bulk pack data
becomes explicitly acquired, hash-verified assets. The owner now authorizes additive downloader/resolver implementation and the
subsequent extraction after migration approves the concrete cut. Existing files
stay in place until that approval. The owner also explicitly authorizes committing the additive work and publishing
remaining redistributable assets. No history rewrite or SDK/native release
coordinate changes are authorized by this work.

Governing inputs: [PRD](../../01-frame/prd.md), especially FR-45; [CONTRACT-052](../../02-design/contracts/CONTRACT-052-domain-packs.md)
and [CONTRACT-057](../../02-design/contracts/CONTRACT-057-domain-pack-loaders.md);
[cross-cutting requirements](../../01-frame/cross-cutting-requirements.md),
especially preservation, determinism and qualified support;
[architecture](../../02-design/architecture.md); [TP-001](../../03-test/test-plan.md);
[completed conservative cleanup plan](../repository-size-plan.md); and the
[shared Rust migration plan](../rust-migration-plan.md). This is a proposed next
phase, not a retroactive change to the cleanup's 500 MB guard or its evidence.

### Inventory and size contract

Baseline: `9e93fc583f809bd738409770d46c6dba8541a07a`, 32,815 tracked files,
450,852,831 bytes. Uncommitted Rust planning is excluded from the baseline and
must remain untouched. This is tracked source content, not `.git`, installed
dependencies, caches, build workspaces or filesystem allocation. A normal clone
will still retrieve old history until a separately authorized history operation.

[files.tsv.gz](files.tsv.gz) inventories **every baseline file**, with path, exact
byte length, Git mode, content-addressed Git blob identity, proposed destination,
cutover reason and known direct-input flag. `unknown` means dependency coverage
is unknown, never that a file is unused. Git uses SHA-1 here; final extracted
bundles also require independent SHA-256 manifests and verified archive hashes.
[summary.json](summary.json) records totals and the inventory's SHA-256.
[declared-inputs.json](declared-inputs.json) captures 709 inputs observed by
`scripts/check-build-inputs.ts`; these are direct declarations, not a complete
transitive closure or proof that a split works.

| Proposed destination | Files | Baseline bytes |
| --- | ---: | ---: |
| Retain in core | 10,323 | 65,053,889 |
| Pinned conformance distribution | 17,248 | 249,079,352 |
| Generated publication artifact | 5,183 | 107,931,951 |
| On-demand domain-pack assets | 61 | 28,787,639 |
| Total | 32,815 | 450,852,831 |

The retained baseline plus planning artifacts is approximately **66.29 MB**;
with the existing **3 MB** new-resource allowance, approximately **69.29 MB**.
This supersedes the earlier 98.76 MB projection and all-pack-bytes-local rule.
The inventory includes the large DICOM original as external data and retains the
747,274-byte unknown-rights legal derived CSV in core.
The reduction includes 28.79 MB of pack asset candidates and 205 adapter test/data
files (0.73 MB) newly classified outside core. The 3 MB allowance is not a cap on
required migration resources: rebase against the jointly agreed post-migration
head and measure the actual checkout before claiming the target is met.

[pack-assets.json](pack-assets.json) lists each proposed downloadable file with
baseline path, byte length, Git blob identity and independently calculated
**SHA-256**. URLs are intentionally unset pending source/mirror and rights review;
this is not an executable download lockfile. Candidates are data/source-document
files over 64 KiB in pack `data/` or `sources/` directories. That threshold is a
planning heuristic, not proof that everything smaller is a useful sample.
EX-02 must identify all remaining real data, retain a deliberately bounded sample
set and validate every schema/loader dependency before approving final membership.
No pack schema or executable loader may be reclassified merely due to its size.

### Destination rules (exact membership is in the inventory)

- **Core:** implementation, authored schemas and generated runtime resources;
  pack metadata, schemas, loaders, generator source, provenance/license indexes
  and explicitly curated small samples; core/pack/build/install regressions and
  thin verification entrypoints. Adapter implementation stays in core. Retain
  required offline sdist/wheel resources and policy/integrity checks.
- **Conformance:** adapter test source, test-local helpers/data, corpus acquisition
  and native/browser oracle harnesses, bulky expected results and evidence. The
  inventory currently explicitly marks `tests/adapters/` and adapter-named test
  families, projections and relationship-native tests. EX-02 must follow their
  helper/import/runner closure and classify mixed files and Python/Rust adapter
  tests on the successor head; the old inventory is not an exemption for those.
  Keep thin core launchers if needed, not a second copy of adapter tests.
- **Pack assets:** bulk PDFs, observed rows, extracted data and other large pack
  resources. Preserve originals and lineage in verified external asset storage;
  do not put them into a new Git repository merely to move the bulk elsewhere.
  Small local sample exports remain useful offline; full-data exports explicitly
  require hydrated assets. Inspecting or validating a pack never downloads data.
- **Publication:** generated microsite/reference/download output. Preserve root
  authored HTML/CSS/SVG, signing policy and published download URL compatibility.

### Conformance storage policy

Maintain authored tests, acquisition recipes, compact manifests, toolchain pins
and licenses in a sibling `umf-conformance` source repository. **Do not check bulk
corpora, generated oracle results or run logs into either source repository by
default.** Acquire pinned upstream data or regenerate deterministic artifacts into
an ignored local cache; distribute necessary immutable inputs/receipts as
content-addressed release/object-store artifacts. A regenerated result is not an
independent expected oracle: retain authored expectations or independently pinned
native comparisons. Preserve non-reproducible original receipts externally before
removing any copy. Run logs use CI artifact retention, with durable qualification
receipts retained where support claims require them. Authored assertions remain maintained externally; generated bulk need not be
committed anywhere.

No remote, account, visibility, storage URL or retention service is selected or
created. Keep stable case IDs, pinned revisions, licenses and original paths in
bundles. Core default tests must not require the external suite. Explicit full
conformance requires its pinned tools and complete data; missing inputs fail
clearly and never silently skip or count as a pass. Scheduled/release qualification
must still execute the external suite, including real native/browser checks.

### On-demand domain-pack asset contract (proposed)

1. Keep a versioned asset lock/index in core, bound to pack identity/version and
   manifest digest. Each asset records source ID, relative materialization path,
   exact byte length and mandatory SHA-256, media type, acquisition URL/mirrors,
   license/redistribution status and original-source/derivation provenance. Hash
   full original bytes, not extracted text or an unrelated documentation page.
2. Explicit host acquisition prepares a cache or an export workspace; pack
   admission, schema inspection, library import and ordinary core tests do not
   fetch. Use existing trusted loader/acquisition boundaries and compatible hash,
   state and rights controls. CONTRACT-057 currently limits media types and runner
   profiles: CSV/archive acquisition needs an explicit supported extension, not
   an assumption that current document loaders already implement it. Coordinate
   consumer-owned execution with the existing TableSpec boundary.
3. Verify size and SHA-256 before exposing downloaded files or executing exports.
   Verify existing cache hits too; corrupt, truncated or changed upstream content
   fails visibly. Stream to a temporary file, then publish atomically to a
   content-addressed cache outside tracked source. An interrupted transfer must
   not create a valid cache hit. Offline mode uses only verified cached bytes.
4. Preserve the existing loader's host/network/rights restrictions. Bound requests
   and archive expansion; reject traversal, absolute paths and escaping symlinks;
   verify archive and extracted-member hashes where archives are distributed.
   URLs/data never authorize artifact-supplied code execution. Unknown or restricted
   redistribution does not authorize a public mirror; preserve permitted upstream
   retrieval/local use and state unavailable sources explicitly.
5. Version changed pack/source references and migrate callers deliberately. Existing
   fixed hashes and source-qualified receipts remain historical. Exporters, loader
   inventories, provenance readers, docs and checkout guards resolve required assets
   from the verified cache/workspace without needing them under tracked `spec/`.
   Preserve original source IDs, distinctions and full-data semantics. Never replace
   missing real data with synthetic samples and call a full export successful.
6. Core samples must be small, deterministic and labeled fabricated/observed as
   appropriate, with redistribution provenance. Select them per pack; test schema,
   loader and sample export offline. Separately replay every affected full pack
   after acquisition and from a disconnected verified cache, comparing existing
   export results, row/document counts and provenance against the original bytes.

## Shared Constraints and Coordination

Both active lanes received the proposal and returned constraints on 2026-10-23.
No reply is treated as approval to move data.

| Lane | Returned constraints | Cutover gate |
| --- | --- | --- |
| UMF/Weft — migration implementation and releases (`01a1602c-4669-7391-b16c-aadff7fe7035`) | Freeze `src/`, schema/generated authority, Python, bindings/crates, manifests/locks, scripts/tests/fixture paths, workflows, migration evidence and package/license provenance. SDK 0.5.7 candidate pins 116 source inputs; Codegen pins 236; immutable Core 0.10.1 has a separate 523-input producer closure. Paths and public evidence/download URLs are custody inputs. | Agree on a post-SDK-0.5.7 handoff revision and reconcile the exact candidate/producer manifests before any relocation. |
| UMF — Rust port and V8 removal (`01a16073-ec34-78b0-8795-b6abd1c7f058`) | Freeze authored `spec/`, complete extensions/packs, crates/bindings/Python and action runtime's nine canonical resources. Preserve R4 `include_str!` resources and offline sdist inputs used by `python/hatch_build.py`, `tools/_python_sdist.py` and resource sync. R5 includes the 1,301-vector JSON Schema core, 30-operation wrapper, Protobuf/Avro receipts; evidence links and R8 release checks consume paths. | Review this concrete inventory with the Rust owner, capture exact R5–R8 source/artifact closures, then agree a safe revision/window. |

The Rust owner reviewed the earlier all-pack-bytes-local revision and agreed
with its holds; that review does **not** approve this revised on-demand asset and
adapter-test boundary. Both owners must review the revised concrete inventory.
The implementation window remains unapproved. They confirmed that successor Rust modules, tests, generated
outputs and evidence may exceed the 3 MB allowance; the rebased measured checkout
remains the size acceptance gate. Both lanes received the revision; migration returned the additional constraints
below. Concrete rebased file-list approval remains pending with both lanes.

The migration owner supplied additional constraints for this revised proposal:

- Preserve exact G02/G03 reviewed fixtures, provenance, oracles and producer-input
  manifests through release handoff. Rebase on actual post-release source; the
  old `9e93fc583` baseline alone cannot authorize extraction.
- Pin both the external suite source commit and every asset's SHA-256, size,
  media type, rights and source identity. Retain domain meaning, unknown extension
  content and the locations of projection decisions.
- Missing or tampered required assets, or an offline cache miss, must refuse
  before the selected compile/admission operation. Browser/core/library and host
  execution never fetch implicitly; only explicit trusted acquisition may fetch.
- CI/release qualification archives must be self-contained for their selected
  cohort: fixtures, manifests, independently authored expected rows and published
  legacy replay corpus. Successful downloading alone is not parity evidence.
- Retain all five G02 carrier/NULL cases, the base 18 NULL/no-default controls,
  three recovery-fault controls and actual Chromium/installed paths. Preserve the
  separate G03 12-case/default/client/lock/recovery closure. These are required
  selected cohorts, not a claim that the full suite has only those cases.
- R3 inventory and conformance entrypoints must bind the external suite version
  and reject missing selectors before making support claims. Concrete rights,
  media and on-demand path choices remain subject to closure review.

Every proposed move is **held** until both gates are resolved. New files on those
branches are absent from this old-HEAD inventory and default to retained pending
classification. Do not rename, recompute or overwrite original receipts to make
them appear to qualify a successor tree. Preserve original source hashes, scope,
versions, failures, unknowns and evidence URLs.

## Consumer Map and Required Changes

| Consumer | Current coupling | Required extraction work / gate |
| --- | --- | --- |
| `scripts/conformance.ts`, adapter/oracle/browser scripts, tests | Relative fixture paths; manifests/results dynamically select further files | Extract adapter test/harness source and its helper closure; retain thin core entrypoints and small core regressions. Add explicit corpus-root resolution to the external suite. Build full manifest-driven closure, including negative inputs, licenses and provenance logs. Preserve test identities and assertions. |
| `scripts/check-domain-pack-checkout.ts`, pack loaders/exporters | Pack-local schemas, sources, loader assets and composed pack checksums | Replace the all-assets-local assumption with separate schema/loader/sample and full-asset checks. Preserve pack test source, verify asset-lock hashes, and replay all affected full exports after acquisition. Audit cross-root pack imports before moving any fixture. |
| Python sdist and SDK installation | `python/pyproject.toml` includes current-conformance; SDK install probe reads current-conformance and approve.json; Rust successor adds resource/include closures | Keep small resources and regression data local. Build offline extracted sdists, wheels and SDK archives without sibling repo or source history; replay installed probes. Inventory successor hatch/sdist sources, not just this baseline's pyproject. |
| `spec/extensions/*/package.json`, `scripts/audit-extension-packages.ts` | Capability evidence names repository paths | Keep package specs local. Introduce pinned receipt references/resolution without losing declared support scopes; no weakening evidence audit to a presence-only or skipped check. |
| `scripts/check-build-inputs.ts`, size/pre-commit gates | 709 declared local paths; history checksums and site pages are included | Split required core-input closure from explicit full-conformance/publication closure. Preserve traversal/symlink/hash controls. Only adopt 100 MB guard after the measured cutover passes. |
| Acceptance/security/authority readers | `security/acceptance.json` is 7.7 MB and mixes receipt data with policy consumption | Preserve exact full receipt externally. Define a small versioned core policy/index derived with integrity checks, preserving all decision predicates; compare old/new outcomes and negative controls. Retain retired-core byte-oracle archives locally. |
| Reference evidence reader/build and action guide checker | `recordPath`, JSON selectors, operation fixture paths, source-closure hashes, certificate/link checks | Resolve pinned records and preserve selector meaning and source correspondence. Historical hashes remain historical. Keep core action certification; audit its transitive references. Update guide links and preserve old public URLs. |
| Schema browser examples | Example host reads Arrow/dbt/PostgreSQL/ODCS/LinkML/etc. fixture inputs; some come through results paths | Extract a bounded complete example set into core/site source with provenance and hashes. Do not keep an entire corpus just for an example, or lose dynamically selected examples. Charge retained examples to the allowance. |
| Microsite workflow, reference tests and `.innsigle` page inventory | Pre-build signing inventory expects tracked generated pages | Preserve authored host sources and route declarations; build from clean source, then check complete actual inventory, orphan claims, renderer package pin/SRI, final signatures and publication bytes. Pre-build checks must still validate declarations. Preserve downloads and URL compatibility. |
| Native compiler/oracle inputs | `native/` mixes runtime imports with upstream suite acquisition | Move only enumerated SHACL upstream suite closure, with license and hash manifest. Preserve TableSpec runtime imports and Protobuf/PostgreSQL build resources. Trace SHACL acquisition/round-trip/native readers through corpus resolver. |

This map identifies observed consumer classes, not an exhaustive graph. Remaining
work includes dynamically selected corpus members, transitive receipt/source
references, source-bound hashes and unpublished successor packaging manifests.

## Implementation Slices

| Slice | Depends on | Scope and validation gate |
| --- | --- | --- |
| EX-01 | None | Produce all-file inventory, downloadable asset candidate hashes and revised size projection. Planning only; classification heuristics require EX-02 review. |
| EX-02 | Both coordination handoffs | Rebase against agreed source head; capture full producer/consumer closure and old URLs, schema/resource imports and policies. Owners review revised pack-asset and adapter-test file lists, schema/loader closures and curated samples; unknown consumers block affected moves. |
| EX-03 | EX-02 | Implement host-side pack acquisition/cache and corpus/evidence resolution; separate core, hydrated-pack, full-conformance and publication checks. Amend exact interfaces/contracts before consumer wiring. Exercise wrong/missing revision, hash corruption, traversal, symlink escape, offline operation and no silent skips. No bulk deletion yet. |
| EX-04 | EX-03 | Materialize authored conformance source externally, pinned corpus/evidence artifacts and on-demand pack assets at agreed destinations; verify every byte, license and original path against source Git objects and independent SHA-256. Replay from a fresh offline cache. |
| EX-05 | EX-03, EX-04 | Refactor site generation/signing, example closure and policy/index consumers; compare inventories, original evidence scopes and published download/URL compatibility. |
| EX-06 | EX-04, EX-05 | Remove only verified enumerated core copies. Run core-only offline build/install/sample-pack regressions; hydrated full-pack exports online/offline; and external adapter/conformance/native/browser workflows with matching case inventories. Enforce measured checkout under 100 MB including all required new resources and planning files. |

## Execution Contract

The user authorizes the host-only on-demand downloader, conformance resolvers
and the extraction once migration approves the concrete rebased membership. Do
not request that same user authorization again. Removal remains conditional on
both source handoffs, producer/consumer review and the existing validation gates.
Preserve unrelated edits and existing Git history. No tracker, spending ceiling
or token budget was selected; usage estimate and runtime enforcement are unknown.

## Validation Plan

- Verify exactly one inventory row per baseline Git blob, exact path/mode/OID/size,
  disjoint destination totals and a reproducible compressed inventory/hash.
- Verify every pack schema, loader and selected small sample remains core; every
  downloadable candidate has the exact baseline SHA-256. Existing 28-pack /
  742-reference closure is the pre-change baseline, not the future local-only rule.
- Verify all adapter test families and their imported helper/oracle closures are
  external, with unchanged assertion/case coverage; bulk inputs/results stay out
  of source Git. Review mixed and successor Python/Rust tests individually.
- Exercise cold download, verified cache hit, corrupt cache, hash/size mismatch,
  interrupted transfer, offline hit/miss, unsafe archive paths and full export
  parity. No implicit network fetch or sample-for-full-data substitution.
- Before extraction, check full dynamic dependency closure and all protected
  source-artifact manifests against the agreed new head.
- Bind suite commit and selector inventory, reject missing selections before
  compile/admission, and replay the named G02/G03 controls from self-contained
  offline qualification archives, including independently authored expectations
  and legacy replay inputs. Network acquisition alone cannot satisfy this gate.
- Before cutover, demonstrate standalone core offline build, package install,
  small-sample pack load/export and negative integrity controls; separately demonstrate pinned
  full conformance and real browser/native tests. Compare case inventories and
  outcomes; preserve known failures without relabeling them as extraction passes.
- Measure the actual fresh source checkout, including new policy/example/resolver
  files, compressed inventory and successor source growth. Dependencies/caches and
  Git history are separately reported, never hidden as source savings.

## Risks and Rollbacks

| Risk | Response / rollback |
| --- | --- |
| Dynamic references omitted | Block affected move; retain complete old family until closure verified. |
| Source-bound qualification invalidated | Freeze during migration; retain original bytes/paths in external distribution and historical receipts; qualify successor separately. |
| Offline pack or package build breaks | Keep schemas/loaders/runtime/sample closure core; prove offline sample operation and verified cached full exports before removing copies. |
| Old links or signed downloads break | Preserve immutable public URLs/artifacts and verify redirect/download hashes before website cutover. |
| Under-100 MB projection exceeded | Reinventory required bytes; refine only reviewed external assets, never remove pack meaning or skip gates. |
| External bundle unavailable or corrupted | Fail explicit conformance command; restore verified core copies from pinned Git objects without history rewrite. |

## Additive Implementation and Current Evidence

Implementation is in new host-only files; existing schemas, loaders, fixtures,
adapter tests and verification entrypoints remain untouched. The current default
conformance runner is not redirected until the agreed extraction/consumer cut.
[Usage and exact host-lock interface](../guides/on-demand-assets.md) describes
explicit acquisition, seeding, offline materialization and source-bound suite
locks. This host configuration is not a change to the portable pack schema or
CONTRACT-057's declared companion runtime/media profile.

- `scripts/assets/store.ts`: versioned lock validation; mandatory trusted lock
  digest; explicit selectors/source revision; size/SHA-256/media checks; bounded,
  allowlisted HTTPS with general redirects disabled and one explicit pinned
  GitHub-release-to-asset-CDN hop; verified cache hits; atomic publication;
  symlink/path rejection; non-overwriting materialization. No archive extraction
  or test/loader execution. No browser/library import or ambient fetching.
- `scripts/domain-pack-assets.ts`: additive pack command using a pinned generated
  lock for all 789 baseline files; composed medical families include hash/version
  checked child packs. Retained source data can explicitly seed a cache before
  removal. The 68 exact-byte upstream URLs are not a reachability claim. A separate
  source-qualified asset release supplies exact-byte URLs for 21 cleared large
  files; unknown-rights legal derived data remains local.
- `scripts/conformance-resolve.ts`: requires an explicit lock SHA-256, suite source
  commit and job selectors. Complete selected inputs resolve before a usable
  path map/cohort is returned; missing/tampered inputs refuse. The selected lock
  carries case IDs and independently authored expectations chosen by the owner.
- `scripts/assets/build-conformance-lock.py`: source-bound selected-input locks
  from exact Git blobs, with streaming SHA-256 and independent Git object checks.
  Explicit case/path closure is required; it does not infer semantic coverage.
- `tests/asset-resolvers.test.ts`: host download/cache, negative integrity, path,
  selector, source-lock and CLI controls. These are core asset-tool integrity
  tests, not a retained copy of the adapter conformance suite.

On 2026-10-23 the end-to-end probe seeded 208 files / 33,194,810 bytes across legal,
appellate, medical-imaging and public-company packs. With source-root access
removed, offline materialization reproduced every selected hash. Existing full
appellate export produced the same 77 paths and byte hashes from the original
and hydrated pack. A separately pinned current-metamodel resource packet resolved
from offline cache without its source checkout; that integrity probe is not full
conformance qualification. A real cold public HL7 HTTPS download verified all
268 bytes against its baseline SHA-256. The first sandbox attempt could not
resolve DNS; the isolated network-enabled probe succeeded without changing
repository files or source URLs.

All 16 host integrity tests pass (80 assertions) on Bun 1.4.3.
Scoped strict TypeScript checking of all new runtime/CLI/test modules passes;
the deterministic generated pack-lock check passes. Source inspection confirms
no new imports in `src/` or Python. New tests also cover executable mode preservation
and refusal to replace a reviewed conformance lock.

The current unchanged-tree guard still checks all 28 packs / 742 local references
and 709 build inputs; the source tree remains about 453 MB before extraction.
No under-100 MB result is claimed yet. No required asset URL is invented or a
changed upstream response accepted to enable a cut.

The migration owner confirmed additive new-file implementation can continue.
The actual SDK 0.5.7 handoff head/window is still unknown and unapproved. They
require the final inventory rebased onto the actual post-merge/tag tree, exact
suite/asset and selector/job closure, offline sdist/SDK/cohort parity and an
independent review of the old-path-to-resolver consumer diff. The isolated G03
prototype/native closure must also be included even if not released. SDK 0.5.7
and immutable Core 0.10.1 / 0.5.6 coordinates remain untouched.

## Exit Criteria and Continuation Evidence

The revised planning deliverable includes all-file membership, 61 hashed pack
asset candidates, external adapter test families, storage policy, download/cache
requirements and coordinated migration holds. It supersedes the earlier promise
to keep all 789 pack files and adapter test source in core. No extraction has occurred. Host acquisition/resolution is now implemented
alongside the original files; the full conformance/site/consumer cut is pending. The revised inventory validation matched
all 32,815 baseline paths/modes/blob IDs/sizes and destination totals, independently
verified SHA-256 and Git blob identity for all 61 proposed pack assets, confirmed
297 declared schema/loader references remain core, mapped all 709 declared inputs,
and reproduced identical inventory and asset-index bytes. Whitespace checks pass.
Those inventory checks remain baseline evidence; the additive implementation
has separate host integrity tests and end-to-end probes above. Previous checks proved that the current
unchanged tree has 28 packs / 742 local asset references; successor behavior
requires the new split tests, not a weakened old guard.

The next action is both owners' review of this revision, followed by EX-02 on the
agreed post-migration head. A missing window does not block this planning update.
Extraction completes only after EX-02–EX-06 pass: core-only schemas/loaders/samples
work offline, full packs work with verified on-demand/cached assets, adapter
verification runs externally without lost cases, and measured core source content
is strictly below 100 MB. No history rewrite is part of the plan.

Regenerate the pinned inventory (writes only this artifact directory):

```sh
python3 docs/helix/04-build/conformance-extraction/inventory.py
```

Read the file-level table with Python's `gzip.open(..., 'rt')`; columns are
Tab-Separated Values with one file per row. To inventory a later agreed revision,
pass `--revision <sha>` and refresh `--declared-inputs <json>` from that revision's
input reader. Manually reconcile classifications and consumer coverage; the script
is a deterministic planning classifier, not an automatic move/deletion tool.

### Commit and publication continuation

The owner authorized additive commits and asset publication. Commit `adff33512`
contains only the 16 additive resolver/planning files; unrelated Rust planning
remains uncommitted and excluded. A dedicated asset release/tag
`domain-pack-assets-2026-10-23` was cleared for coordinate separation by migration.
Publication staging contains 21 explicitly redistributable exact-byte assets /
6,132,614 bytes, plus provenance, attribution and SHA-256 indexes. The DICOM
original retains its TCIA CC BY attribution and de-identification limits. One
747,274-byte legal derived file has unknown redistribution rights and remains
core; it is not publicly mirrored to force the size goal.

The GitHub release transport is a narrow explicit configuration addition, not
an ambient redirect exception. Publication and cold-download verification must
complete before these release URLs are described as available. The release
must not become the latest SDK release, replace existing assets, or touch SDK
0.5.7/Core 0.10.1 coordinates. No extraction approval has been received; actual
post-0.5.7 handoff revision still does not exist. A current checkout measurement
is about 453 MB, not the conditional under-100 MB projection. The final fresh
checkout measurement and core/offline/conformance validation follow the approved
consumer cut; preview byte arithmetic cannot establish that gate.

### Published assets and remaining cut gate

The dedicated [asset release](https://github.com/DocumentDrivenDX/umf/releases/tag/domain-pack-assets-2026-10-23)
is public, pinned to source commit `d5ba7b4f321140c37c0c2346617bc09faaf27520`.
[Publication receipt](asset-publication-receipt.json) records all 26 release-file
identities, hashes and sizes. All 21 payloads / 6,132,614 bytes were cold-downloaded
through the actual resolver with no retained asset files used, then materialized
and rehashed offline. A separate fresh GitHub download verified all 26 payload,
notice, provenance and checksum files. Local regeneration reproduced all 26 file
hashes. The asset release is not the latest release; that endpoint resolves to
`umf-v0.5.5`. No SDK release asset was replaced.

The additive commits are `adff33512` and `d5ba7b4f3`, published on
`codex/domain-pack-assets` without changing remote main. No unrelated Rust docs
entered either commit. Root source HEAD measured 32,833 files / 453,205,677 bytes
before this final publication receipt, so **under 100 MB is not yet verified**.
Do not report the conditional 69 MB inventory projection as a completed checkout.

Migration reiterated that no actual published post-0.5.7 handoff tree exists:
its successor is resolving main integration conflicts and regenerating its
cohort. No extraction approval has been issued. Current files/default workflows
remain intact. Resume EX-02 against the supplied actual tree, review the concrete
old-path-to-resolver and selector/producer closure, then apply the already
user-authorized cut once migration approves; finally build a fresh core checkout
and prove its real under-100 MB size plus offline/core/full-conformance gates.
