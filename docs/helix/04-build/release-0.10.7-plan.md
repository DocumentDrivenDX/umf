---
ddx:
  id: umf.plan.release-0-10-7
  type: implementation-plan
  activity: build
  authoring:
    home: repo
  links:
    - {id: FEAT-009, kind: informed_by}
    - {id: ADR-006, kind: informed_by}
    - {id: CONTRACT-052, kind: informed_by}
    - {id: CONTRACT-080, kind: references}
    - {id: umf.plan.browser-pack-tools, kind: informed_by}
    - {id: TP-001, kind: informed_by}
---

# UMF 0.10.7 coupled runtime release

## Scope

The owner authorizes SDK, Python and Node releases containing the new domain-pack
compiler, published and verified to completion. The later upstream generator-asset gate
also requires the repaired `umf-codegen` companion wheel/sdist to ship with the
matching core dependency. The owner's versioning correction
requires one UMF artifact version, rather than continuing the Rust migration
milestone's separate 0.1.0 identity. Release SDK, Rust library/CLI and native
bindings, Python distribution and browser runtime together at **0.10.7**.
Core documents remain **0.10.0**; extension vocabularies, operation/wire profiles
and the separately released schema-browser package retain their existing versions.
All compilation, behavioral tests and CI work run locally. Do not dispatch hosted
build/test jobs or wait for Actions credits. Publication transfers already built,
qualified bytes and verifies the public results.

Governing sources are [ADR-006](../02-design/adr/ADR-006-shared-rust-implementation.md),
[FEAT-009](../01-frame/features/FEAT-009-domain-pack-catalog.md),
[CONTRACT-052](../02-design/contracts/CONTRACT-052-domain-packs.md),
[CONTRACT-080](../02-design/contracts/CONTRACT-080-authoritative-metamodel.md),
the [browser pack-tools plan](browser-pack-tools-plan.md),
[TP-001](../03-test/test-plan.md), `spec/release.json`, the actual package builders
and [PyPI delivery policy](../05-deploy/pypi.md). The installed HELIX plugin owns
the implementation-plan graph/template; this file records this release's concrete
choices. The browser compiler's completed source and public-site evidence are the
semantic baseline, not a request to rewrite the compiler or requalify historical
operation families.

## Shared constraints

- The reported upstream stale-generator asset is a release gate. Reproduce the
  actual schema/asset checker against the pinned UMF dependency in an isolated
  temporary tree, identify its canonical producer and repair the upstream
  checked-in asset. Do not weaken the checker, edit a shared downstream checkout,
  or present a private derived snapshot as the upstream fix. Freeze changed
  version/API/schema inputs before regeneration. Checked-in generated authority
  must reproduce byte-for-byte and pass its normal check before candidate builds.
- Release SDK packaging runs canonical generators in `--check` mode inside its
  fresh source snapshot and refuses any generated-source transformation. Require
  `sourceClosure.transform.status: fixed-point`, an empty changed-input list and
  equal captured/live source-tree digests. Cargo cache reuse does not relax this
  gate. After candidate packaging, verify the actual pinned/installed consumer
  in an isolated temporary tree without mutating the shared checkout.
- One first-party artifact release authority is `spec/release.json`. SDK/Python,
  first-party Cargo package and native Node/WASM package versions must agree at
  0.10.7. Update the version guard to check this exact cohort independently from
  core/model and vocabulary/profile identities. Never change wire constants by
  global version replacement. Vendored third-party versions are unchanged.
- `generatePackTools(request)` is a synchronous public SDK Node/Bun/browser-root
  export, with shared request/result types. The facade passes `{request}` to the
  native family operation; it does not pass the family directly as a differently
  shaped engine. Python exposes `generate_pack_tools(request, **host_controls)`
  through the existing checked wire boundary. CLI exposes `codegen pack-tools`
  before loading unrelated generated-client resources. All execute the existing
  Rust compiler and preserve source/report/diagnostic/error/control behavior.
- Pack tools retains `umf.pack-tools/1`, result profile 1 and family wire profile 1.
  No SQLAlchemy, database driver, Bun/Node or V8 dependency is added to Python
  generation. SQLAlchemy remains a dependency of the generated consumer code.
- The published catalog's 28 requests form one captured baseline. Compare source
  digest, file paths/hashes, diagnostics and coverage from each installed runtime
  against that same baseline. The two loader-only blocked packs and 25 partial
  outcomes are honest support results, not failed release checks.
- The existing compiler/CRUD normal/refusal evidence stays closed unless source
  changes affect it. This cut adds host-surface and distribution evidence, including
  public controls/refusal and representative actual generated-code use; it does
  not start a new unrelated edge-case or native-oracle campaign.
- Root is the sole official writer and owns version integration, builds, git,
  artifact staging, publication and public verification. Luna lanes supply bounded
  temporary patches; GPT-6.1 Sol plans/reviews. Preserve user-owned `.tmp/`.

## Distribution and resources

The verified prior release `umf-rust-v0.1.0` contains source, two CLI archives,
two platform SDK archives, two ABI3 wheels, one sdist and SHA256SUMS. Public PyPI
currently serves `umf-core==0.10.5`; native 0.10.6 was a GitHub-only cohort.
Public npm returns 404 for both `@umf/core` and `@umf/core-rust-native`; the source
packages deliberately retain `private: true`. This release continues the existing
Node/Bun distribution through immutable platform SDK archives, installable from
the GitHub asset URL. It makes no npm registry-publication claim and introduces
no new scope/package ownership requirement.

Publish one source-bound UMF release, using `umf-v0.10.7`, with this expected roster:

| Asset | Scope |
| --- | --- |
| `umf-v0.10.7-source.tar.gz` | Exact merged first-party Rust/library source closure and locked inputs |
| `umf-v0.10.7-aarch64-apple-darwin.tar.gz` | Installed macOS arm64 CLI |
| `umf-v0.10.7-x86_64-unknown-linux-gnu.tar.gz` | Installed Linux x86_64 CLI |
| `umf-sdk-0.10.7-macos-aarch64.tgz` | SDK with macOS native addon plus portable browser/WASM closure |
| `umf-sdk-0.10.7-linux-x86_64.tgz` | SDK with Linux native addon plus the same browser/WASM closure |
| `umf_core-0.10.7-cp311-abi3-macosx_11_0_arm64.whl` | Python 3.11–3.14 on the qualified macOS arm64 target |
| `umf_core-0.10.7-cp311-abi3-<qualified-manylinux-tag>_x86_64.whl` | Genuine inspected/repaired/built compatible Linux wheel; final platform tag is evidence-driven |
| `umf_core-0.10.7.tar.gz` | Rebuildable native Python source distribution |
| `umf_codegen-0.10.7-py3-none-any.whl` | Repaired canonical generator resources and exact `umf-core==0.10.7` dependency |
| `umf_codegen-0.10.7.tar.gz` | Rebuildable source companion with the same checked resource closure |
| `release-pins.json` | Exact tag/merged commit/distribution/version and `sdk`/`umf_core` artifact pins at 0.10.7; `files` selects only three core Python archives, while a separate codegen section may pin its two files |
| `SHA256SUMS` | Complete exact twelve-asset release cohort, including `release-pins.json` |

Native binary provenance and the SDK verifier's live source/member hashes are
required. Reuse warm local macOS and Linux Docker caches and the existing pinned
toolchains; schedule heavy jobs centrally. The optional `UMF_SDK_CARGO_TARGET`
selects a persistent Cargo-managed cache while the builder still creates a fresh
private source snapshot and runs unconditional locked Cargo builds. Preserve all
live source and output rehashes; never substitute an old addon/WASM directly or
skip Cargo. Keep caches separate by platform/toolchain/profile and leave an
external cache outside scratch cleanup. Record cache mode honestly. Rebuild current full SDK/native bindings
because the public release must contain the new family. The existing focused
1,034,632-byte site binary alone is not the full SDK runtime. The same verified
snapshot/Cargo target also builds the focused pack-tools WASM crate, using a
separate wasm-bindgen output directory. Ship its JS, declarations and WASM under
`dist/runtime/pack-tools/`, require all three SDK members, and include their hashes
in the SDK manifest. No full-runtime file is overwritten and no new public export
is required for this resource cohort.

Refresh the microsite from that exact fresh focused module and current source
provenance. Artifact-version/Cargo changes otherwise leave its recorded compiler
inputs stale and cause the normal future deployment verifier to refuse. Verify
the rebuilt asset hashes and one focused local/public browser flow; do not repeat
the already closed compiler campaign solely for this cohort refresh. Measure the
new focused binary rather than assuming its previous byte count.

PyPI must receive the same qualified wheels/sdist, and public registry metadata
and downloaded bytes must agree with the release checksum cohort. A raw
`linux_x86_64` filename is not accepted by the existing publisher; do not rename
it to imply manylinux compatibility. Inspect dynamic dependencies/symbol versions
and genuinely qualify the wheel platform before publication. The prior Linux
wheel's extension and embedded CLI have actual ELF requirements through
GLIBC_2.34 (libm through GLIBC_2.29), with only libc/libm/libgcc/loader dynamic
dependencies. Prefer the warm-cache successor plus `auditwheel show` and genuine
`auditwheel repair --plat manylinux_2_34_x86_64` if the new bytes satisfy that
policy. This preflight does not establish a tag for an unbuilt successor or imply
compatibility with older glibc; no new base image/rebuild is required in advance.

The `umf-codegen` project currently returns 404 from public PyPI. The existing
coordinated Python workflow is a validation matrix, not a publisher identity.
Release the repaired companion on GitHub and verify the installed pair using its
immutable wheel URL and the released core. Publish it to PyPI only if actual
normal project/publisher capability is available; do not broaden the core-only
publisher or claim a nonexistent companion registry release. `umf_access`
0.1.0.dev8 remains outside this cohort and is not presented as stable.

The documented current PyPI publisher uses an existing GitHub OIDC identity,
not a documented stored token. Check normal available publication capability
without reading or dumping credentials. The owner's local-build/CI direction
supersedes a historical restriction on local upload if normal local authentication
is available. If the existing OIDC route is used, it must only transfer/verify
already qualified immutable artifacts; hosted build/test/consumer-CI jobs remain
outside this cut. Finish and review the complete artifact cohort before reporting
any concrete remaining credential or publication gate. Do not weaken registry
immutability or silently stop at GitHub if PyPI delivery remains unfinished.

## Implementation slices

| Slice | Owner and bounded surface | Validation |
| --- | --- | --- |
| R0: canonical generator freshness | Luna A investigates the reported schema/asset checker; root repairs canonical generated outputs and packaging admission | Reproduce the exact stale check, upstream regeneration/check is a fixed point, private snapshot transformations are refused, isolated pinned consumer passes |
| R1: artifact identity | Root: release authority, first-party package versions, Cargo.lock, version guard and release notes | Independent core/profile versions preserved; exact artifact cohort check passes |
| R2: Python/CLI facade and repaired companion | GPT-6 Luna A: Python public wrapper/exports, native bridge only if needed, direct CLI operation and focused tests/docs; root aligns codegen/core package pins and builds its wheel/sdist | Public request/control/error behavior; no hidden JavaScript; installed wheel and CLI consume captured requests |
| R3: SDK facade | GPT-6 Luna B: authored/generated Node/browser roots, generator integration, public types and focused installed tests/docs | Synchronous public export reaches Rust with correct nesting; Node/Bun/browser use actual packaged artifacts |
| R4: local release cohort | Root: macOS/Linux native builds, full WASM, SDK/wheel/sdist/CLI/source archives and manifests | Exact source/asset integrity, real installed consumers and explicit platform tags |
| R5: source/release review | GPT-6.1 Sol: changed source, packaging closure, versions and actual receipts | Material findings repaired; passing unrelated semantic baselines stay closed |
| R6: publish and verify | Root: merged source tag, direct GitHub assets, PyPI delivery and final receipt | Public tag/source, roster, hashes, versions and installed public consumers agree |

## Validation plan

1. Reproduce the reported stale-generator check with the exact pinned dependency
   in an isolated temporary tree. Record the source schema, canonical generated
   asset and producer. After version/API/schema inputs freeze, regenerate and
   check the authored facade, metamodel outputs and action-plan identity in their
   dependency order. Metamodel generation already performs a second check;
   compare the actual reported asset as well. Release packaging must refuse stale
   canonical assets and transformed private snapshots. This is an upstream fix,
   not a downstream bypass or a historical semantic regression campaign.
2. Run affected TypeScript configurations, generated-facade drift check, Rust/access
   boundaries and exact cohort version guard. Run focused new Python/CLI/SDK host
   tests and the ordinary changed binding checks; preserve existing control/errors.
3. Build once per selected platform using warm caches and locked inputs. Build
   the full WASM runtime and package both platform SDKs with source-bound manifests.
   Build the embedded focused pack-tools WASM resource from that same snapshot
   after the full WASM runtime, with separate bindgen outputs, and require/hash
   its complete resource trio. Refresh the site's focused runtime/provenance from
   those exact files and verify one actual local/public browser flow.
   Inspect Python wheel metadata, native ABI/dependencies and sdist source closure;
   Twine-check the exact candidates and genuinely qualify Linux registry tags.
   Build the repaired pure-Python codegen companion wheel/sdist from the same
   frozen resources, aligning pyproject, public version and _release.py pins;
   rebuild/check its sdist and install it with exactly core 0.10.7.
4. Install each candidate outside the checkout: wheel in clean Python environment;
   SDK tgz through npm install followed by Node and Bun public-root calls; CLI from
   its archive with no Python/JavaScript requirement; browser from the packaged WASM.
   Execute the captured all-28 baseline once per exposed runtime/platform and compare
   complete results. Run one public control/refusal and representative generated
   CRUD case where required by the changed host surface. Record actual versions.
5. Review final sources and the artifact roster, freeze checksums and merge the
   qualified source. Bind the tag/source archive to that merged revision; do not
   substitute unrelated stale binaries because the versions match.
6. Publish immutable GitHub assets and PyPI 0.10.7, then fetch public metadata and
   every checksum cohort member. Install actual public wheel/SDK artifacts and
   verify versions plus `generate_pack_tools`/`generatePackTools` and CLI operation.
   Install the public repaired `umf-codegen` artifact with the matching core and
   run its normal immutable resource/manifest/native-protocol checks.
   Keep upload success separate from verified distribution and consumer success.

## Continuation evidence and unknowns

Initial distribution metadata was checked on 2026-11-02: PyPI 0.10.5, no public
npm SDK/native package, and the nine prior GitHub assets described above. Source
versions at that check were SDK 0.10.2, Python 0.10.6 and Rust/native packages 0.1.0. The owner
resolved the version clarification explicitly as one 0.10.7 artifact cohort while
retaining core 0.10.0. The later explicit upstream asset gate expands the release
to `umf-codegen==0.10.7` with `umf-core==0.10.7`; `umf_access` 0.1.0.dev8 remains
outside the selected cohort.

Implementation lanes are bounded and active. The reported stale asset is the
checked-in `python/umf_codegen/src/umf_codegen/_resources` cohort: six canonical
copies plus its manifest and _release.py resource pin fail
`scripts/rust-migration/r4/sync_codegen_resources.py --check`. The installed pair
then exposed a stale inventory: the native CLI correctly includes ten resources,
including Saga, while Python's three inventories allowed only nine. Add the exact
canonical Saga package to producer/build/runtime inventories and keep native
capability equality strict. The corrected ten-resource manifest is
`9da1c47959a2bc9403a94c908ce032f44a3742b974244b047c6be8760f9be101`;
Saga bytes are independently equal to the canonical SHA-256
`4f42d73efe15041807f74031e12013c6df843d12556105a7aff357a0956a8940`.
Freeze the canonical metamodel first, then run the canonical `--write` producer
and its unchanged check. The public companion must contain these repaired assets,
not merely the source repository. This R0 gate is separate from the SDK private
snapshot fixed point. The core action-runtime ten-resource manifest/pin also
required canonical sync; the helper `scripts/sync-python-resources.py` composes
both normal checks without weakening either build hook.
Final Linux compatibility tag,
exact native build/cache locations, available registry authentication, publication
receipt and public installed-consumer results are not yet established. Record
actual outcomes here and in a source-bound release evidence directory as work
proceeds; registry absence or authentication failure is not inferred in advance.

The macOS core native wheel and CLI built successfully. The corrected installed
pair now runs the same 28 requests through core and codegen public APIs with exact
parity. The isolated companion sdist rebuild reproduced 25 wheel-member contents
byte-for-byte, including RECORD. The direct core wheel passes its source payload,
native platform and resource checks; four focused installed tests also pass. Companion-only resource and
inventory corrections do not change the already built core/native input closure.

Local release-policy checks pass: 17 publisher/dispatcher unit tests and seven
focused wheel-qualifier cases. The dispatcher no longer imports the removed
hardcoded qualified-version constant: it selects a matching numeric tag/wheel
cohort. `umf-v0.10.7` explicitly skips automatic dispatch in release and producer
paths, so the existing main-only OIDC publisher is invoked manually with
`locally_qualified=true`; immutable tag/source/checksum/metadata/collision checks
remain. The exact 0.10.7 native-wheel profile permits 64 MiB archive/family and
128 MiB expanded bytes while preserving historical bounds; positive and oversize
controls pass. No hosted test job or registry upload has run for this candidate.

A first SDK attempt was stopped after a measured 15-minute pre-Cargo snapshot
bottleneck. The reviewed correction batches at most eight reads/copies, retains
only digest strings outside each read batch, and preserves sorted hash ordering
and all fixed-point/source checks. The SDK retry is active; no success or new native/portable artifact is inferred
from inventory/copy progress.

The Linux driver is prepared but not run. It checks the actual mounted source
against the qualified Mac SDK liveInputs/tree digest before and after locked,
offline native builds; its receipt matches the reviewed Linux assembler. The
assembler anchors the parent archive's expected SHA-256, preserves portable
bytes/toolchain and replaces only the source-matching Linux addon. The driver
measures auditwheel's actual platform floor, repairs and rechecks the wheel, and
records DOCS_RS honestly: pinned pg_query still compiles C and runs bindgen,
while optional protoc regeneration of registry sources is suppressed.

Sol reviewed PR #42 separately. Its Lakeview, cache-identity, timing and ontology
changes belong to a successor; no missing pack-generator artifact or output
failure was demonstrated. This release includes the applicable wheel-qualifier
bounds and already contains the required pack-tools workspace sdist member.
The owner's unified 0.10.7 artifact version remains authoritative.

## Risks and rollback

| Risk | Response |
| --- | --- |
| Artifact/core/profile version conflation | Exact independent version guards; no schema/vocabulary changes without semantic authority |
| Raw family reachable but public API absent/wrong envelope | Installed public-root calls across Python, Node/Bun, browser and CLI |
| New version wrapping stale binary/source cohort | Rebuild affected hosts; require live source and artifact hashes |
| Linux tag overstates compatibility | Actual dependency/symbol inspection and compatible wheel qualification |
| Registry credentials or immutable version conflict | Complete reviewed candidates first; report actual gate; never replace conflicting bytes |
| Unrelated historical qualification consumes release work | One captured all-28 baseline per installed runtime and focused changed-host checks |

Rollback means keeping prior immutable release tags/assets and allowing consumers
to pin their prior version. Never overwrite existing release or registry bytes.

## Exit criteria

The reported canonical generator asset is repaired upstream, byte reproducibility
and the isolated pinned-consumer freshness check pass, and SDK manifests admit
only a checked-in fixed point. All selected first-party artifact versions agree
at 0.10.7; core/profile versions retain
their independent identities. Public Python, SDK Node/Bun/browser and CLI surfaces
execute the shared pack compiler. Both selected platform cohorts have honest
installed evidence. The source-bound GitHub release and PyPI 0.10.7 are published,
public bytes match reviewed candidates, public consumers pass, and actual
publication evidence is recorded. The repaired public codegen companion and exact
core dependency pass their isolated installed pair/resource checks. Local artifacts
alone do not close the release.
