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
    - {id: CONTRACT-081, kind: informed_by}
    - {id: CONTRACT-908, kind: informed_by}
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

Rust source/CLI, the Node/Bun/browser SDK and the Python generator companion
use immutable platform/source archives on GitHub. The SDK packages retain their
intentional `private: true` metadata. Core Python uses the existing PyPI
publisher; its exact qualified wheel/sdist bytes also ship on GitHub. The
companion pins `umf-core==0.10.7` and ships its repaired ten-resource inventory.

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

Refresh the microsite using current-main UI and the authenticated released
0.10.8 SDK focused module. Its sixteen recorded compiler inputs match current
main exactly. Verify the GitHub asset digest, SDK member hashes and unchanged
site provenance checks before one local/public preview and download flow. The
0.10.7 SDK retains its own exact focused module; the site records the actual
0.10.8 runtime. Preserve newer main and the existing latest-release selection.
Do not repeat the closed compiler campaign for this static refresh.

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

The coordinated Python workflow is a validation matrix, not a companion
publisher identity.
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
   authenticated released files matching current-main compiler inputs and verify
   one actual local/public browser flow.
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

## Current implementation and acceptance

All selected artifacts use 0.10.7; the document format remains 0.10.0. Public
pack generation is implemented in SDK Node/Bun/browser, Python core/companion and
CLI. The canonical generator resource producer, exact ten-file inventory and
SDK fixed-point admission remain strict.

Three concrete library defects discovered during current installed/source review
are repaired before the final freeze:

- Saga facades honor an explicit Registry through the existing bound Rust host
  runtime and refuse unbound or changed registries (CONTRACT-908). Omitting the
  argument preserves default Rust dispatch.
- Inventory/catalog and renderer UPDATE grants share deployment's source-exact
  mutable-column resolver (CONTRACT-081). Declaration order is retained; every
  Key, immutable and generated column is excluded; empty UPDATE vectors refuse.
- Thirty-one immutable-resource cache publication sites return the completed Arc
  actually installed in OnceLock. Caller-context construction, eligibility,
  admission and error/control branches are preserved.

The Saga dispatch controls pass (3 tests,38 assertions), both TypeScript checks
pass and Rust source/host boundaries pass. All14 focused Rust cache/control, grant-vector and selected replay checks pass.
The connected cases verify the complete canonical payload after JSON exchange;
fixture input and identity-column shapes match the current admitted API/schema. The ordinary repository PostgreSQL18
regression checks actual emitted SQL, effective person/batch column ACLs and a
revoked-column drift observation through installed packages in a disposable
cluster. It does not claim a product database inspector or broader policy proof.

Canonical regeneration and the final source freeze follow these passing code checks.
Every affected Rust-bearing artifact, source archive and changed Python resource
companion is rebuilt from that source. Earlier candidate receipts retain their
actual identities and are not used to accept changed artifacts. All final
platform/package/publication gates remain below. The private source factory
includes the exact coordinated pair recipe and declared package patch files, so
unchanged verification runs in isolation without editing source during tests.

The release source and qualification commit are both
`722b1e5484ca5e1558bb364ebdac22c995e140f9` (Q), already merged through PR #88
and an ancestor of main. The merge commit contains additional compiler changes
and must not label Q-built binaries. The stager binds every declared SDK source
input to Q and preserves actual build receipts and matching source-tree hashes.
The public source asset is the complete Git archive of Q. Ten payloads plus release pins and SHA256SUMS form twelve
assets; the checksum file hashes the other eleven and is separately pinned.

## Current qualification

The Rust port and pack-generator changes are merged through PR
[#88](https://github.com/DocumentDrivenDX/umf/pull/88). The complete
[0.10.7 release](https://github.com/DocumentDrivenDX/umf/releases/tag/umf-v0.10.7)
is public at Q, and [PyPI](https://pypi.org/project/umf-core/0.10.7/) serves the
same three qualified core archives. The newer 0.10.8 latest release is preserved.

Both platform SDKs, core/codegen wheels, CLI binaries and source archives pass
their source and artifact gates. Installed Python APIs and SDK Node/Bun/browser
surfaces agree on all 28 catalog requests and 188 files: one generated outcome,
25 partial outcomes and two blocked outcomes with explicit coverage. Four focused
Python cases, fourteen focused Rust checks, packaged declarations, one real
installed Saga lifecycle/registry smoke, an independent fresh core-sdist rebuild
and actual PostgreSQL 18 column-grant checks pass.

Fresh public Node SDK, Rust CLI and Python 3.14 installs generate the expected
Legal Appellate pack. Both Python APIs pass, and the repaired companion verifies all ten packaged
generator resources. The general SDK follows CONTRACT-001's Ajv JIT policy; the microsite
keeps its unchanged strict CSP. The microsite refresh is merged through
[#110](https://github.com/DocumentDrivenDX/umf/pull/110), deployed, and publicly
verified for asset hashes, registered build signature, SQL/ORM/CRUD previews,
individual download equality and seven-file ZIP hashes/CRC.

All twelve public downloads match the reviewed checksums, including the complete
Git Q source archive. PyPI-served archive bytes match locally as well. All
delivery gates are complete; passing checks remain closed. Actual source, package, registry and site evidence is recorded in
[release.json](evidence/release-0.10.7/release.json).

## Artifact delivery gates

1. **Complete:** canonical regeneration, Q source freeze and source-payload
   equality. The SDK source closure is a checked-in fixed point.
2. **Complete:** both platform builds, genuine Linux manylinux qualification,
   independent fresh-target core-sdist rebuild, Linux SDK assembly and exact
   coordinated Python pair.
3. **Complete:** installed Python/CLI/Node/Bun/browser baselines, declarations,
   focused Saga smoke and actual deployment-grant checks.
4. **Complete:** twelve-file roster, core-only Python pins, exact Q binding and
   the one prepublication canonical/full-source acceptance described below.
5. **Complete:** immutable GitHub publication, upload-only PyPI publication and
   signed microsite deployment. Hosted behavioral tests remain skipped.
6. **Complete:** all twelve public downloads and all three PyPI-served archives
   match the qualified candidate bytes. Fresh public installs and the actual
   public browser/download flow pass.

## Public pinned dependency and resource acceptance

Before immutable publication, extract the complete declared build and check
inputs directly from the staged full Git Q source archive in a new temporary
directory. Verify its digest and the platform SDK digest against the final cohort
and checksum manifest, preserving every selected path and byte. Use the recorded input
inventories to avoid expanding unrelated documentation. Keep the shared original
checkout untouched; do not derive source from an SDK or regenerate assets during
acceptance.

Run the following normal checks once in that extracted source, using the recorded
Bun/Python/Rust tool cohort:

```sh
bun install --frozen-lockfile --ignore-scripts
python3 scripts/check-release-versions.py
bun scripts/rust-migration/r8/v4-default-facade.mjs --check
bun scripts/metamodel/build.ts --check
bun scripts/actions-plan-identity.ts --check
python3 scripts/sync-python-resources.py --check
```

No `--write`, replacement checker or source edit is allowed during this acceptance.
The normal checks establish canonical bytes, exact resource inventory and
manifest pins. With RELEASE_SOURCE and SDK_PACKAGE naming only the verified
candidate source and SDK directories, check the SDK's complete source binding
through the canonical verifier:

```sh
python3 - "$RELEASE_SOURCE" "$SDK_PACKAGE" <<'PYTHON'
import importlib.util, json, sys
from pathlib import Path
source, sdk = (Path(value).resolve() for value in sys.argv[1:])
spec = importlib.util.spec_from_file_location('release_sdk_verifier', source / 'scripts/package-sdk.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.verify_source_closure(source, json.loads((sdk / 'dist/rust-default-manifest.json').read_text()))
print('Public full-source SDK closure verified')
PYTHON
```

After publication, download all twelve public assets. Verify the checksum file
against its separately recorded digest, every payload against that manifest, and
the public tag against `release-pins.commit`. Require exact candidate/public byte
identity. That identity carries the already-passing canonical/source-closure
proof; do not rerun the source suite for identical bytes. Check the downloaded
Python archives against the same passing source-rebuild/pair receipts, bound to
their exact public digests. Install the verified SDK into a new consumer
directory and the exact core/codegen pair into a new virtual environment. Disable
checkout imports (`python -I`, no PYTHONPATH), assert installed import paths and
0.10.7 artifact versions, and exercise the public pack generator plus the repaired
companion's normal strict native-resource check. The installed-pair verifier binds
codegen sdist inputs, rebuilds its pure wheel and exercises generation; its core
receipt must identify the exact final core archive digest. Probe CLI from the
public platform archive and one public site flow. Upload success alone does not
establish these results.

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
