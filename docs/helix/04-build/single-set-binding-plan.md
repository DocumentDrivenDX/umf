---
ddx:
  id: PLAN-SINGLE-SET-BINDING-20261023
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-906
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-079
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Source-bound single-SET binding delivery

## Scope

Deliver the bounded pure shared Rust/Python admission interface in
[CONTRACT-906](../02-design/contracts/CONTRACT-906-single-set-admission.md), plus
original source/vectors and exact candidate artifact evidence, for a consumer's
memory-host integration. One required STRING Key and constrained STRING value,
one graph-write/1 SET and a complete seed row are supported. The generated
CONTRACT-079 client and wire remain unchanged.

The human authorized delivery in the Arras coordination session on 2026-10-23:
coordinate the missing upstream binding/vectors, then implement and test the
consumer slice; Sol plans/reviews and Luna implements. This upstream lane owns
semantic delivery only. The consumer owns its runtime, current person policy,
real administrative import, transaction, replay and commit qualification.

The isolated source starts at `8b06efc2d5186e315e2e68fe52d254c2a49f645c` on
`codex/umf-single-set-binding`. The full Rust-port owner's working files are not
part of this base and remain untouched. Package/source/vector digests identify
candidate artifacts; no public release is implied.

## Shared Constraints

- ADR-006 keeps shared semantics in Rust. Python supplies public resource loading,
  host carrier admission and dispatch, with no evaluator or V8 fallback.
- Preserve original source bytes, exact identities, unknown content and all
  obligations. Unknown relevant meaning refuses. Every result remains inert
  and retains `executionVerified:false`.
- The generated entity Field-ID map and primitive STRING values are converted
  inside UMF to the existing canonical Key tuple and CoreLiteral carriers.
  There is no consumer Key codec or canonicalizer.
- Opaque host policy remains unchecked in original inspection, with a separate
  exact trusted-host capability claim. No claim supplies current authority.
  The strict old plan-model/1 branch remains unchanged.
- Source-publisher revision is opaque and separate from backend revision/custody.
  The first consumer may use `sha256:` plus the original source digest.
- Managed/native effects, wider scalars/effects, selection, manifests, bulk,
  schema replacement and downstream application migration remain outside this cut.

## Module Map and Boundary Gates

`umf-core` owns values, Field constraints and bounded Context; existing
`umf-codegen::actions` owns declaration admission/analysis and
`umf-codegen::canonical` owns canonical bytes/hashing. A new child module
`actions::single_set` composes those owners, ports the existing STRING Key-tuple
branch and exposes bounded preparation/invocation/record admission. The existing
core-wire codegen dispatcher routes three additive operations. No core-to-host
or core-to-codegen dependency is introduced.

`umf.action_runtime` is thin package-resource/transport glue over the existing
explicit `umf.rust_codegen.CodegenEngine`. The public factory reads fixed official
wheel resources and verifies the package inventory. Missing/tampered resources
fail closed without source-tree fallback or implicit plugins.

The adopted local/pre-commit/CI gate is `bun run check:rust-boundaries`; it runs
source inventory, Rust/host import/dependency rules and their negative controls.
Also run `bun run check:access-boundaries` and
`bun run check:unified-client-boundaries`. Preserve existing source-bound debt
and historical census records; do not enlarge ignore lists to hide new code.
Semantic review separately checks obligation waivers, generated-wire conversion,
Key bytes, source/input digest custody and host authority separation.

## Implementation Slices

| Slice | Owner | Depends on | Validation gate |
| --- | --- | --- | --- |
| SB-0: exact interface and boundaries | Sol planning; root governance/coordination | Existing CONTRACT-049/079/900 semantics | Closed request/result/unsupported inventory and contract review; isolated source and module map |
| SB-1: pure semantic operations | Luna Rust implementation | SB-0 | Focused Rust positives/refusals, exact source/Key/value/action bindings and controlled limits |
| SB-2: packaged Python entrypoints and corpus | Luna packaging/fixtures | SB-0; SB-1 for actual calls | Official packaged-only resource factory, genuine generated Apply/Validate vectors, source and Python tests |
| SB-3: portable comparison | Root orchestration; Sol review | SB-1/2 | Original TypeScript oracle and shared Rust/Python outputs, exact tuple/obligation/value/digest comparisons and changed portable browser proof |
| SB-4: installed candidate | Root builds; Sol artifact review | SB-1/2/3 | Fresh isolated exact-wheel install, payload/import/resources verified outside checkout, same vectors and negative controls |
| SB-5: upstream handoff | Root coordination; Sol final review | SB-4 | Reviewable commit/PR or patch plus wheel/source/vector hashes; consumer owner acknowledges exact callable/artifact pin |

## Execution Contract

Continue through source verification, installed evidence and independent review.
Routine reversible implementation/build choices remain authorized. Do not mutate
another owner's checkout or publish an unqualified package. No token or monetary
ceiling was supplied for this slice; reliable per-slice token/spend metering is
unavailable. Record actual command/resource limits and remaining scope honestly.
Use a separate Cargo target/cache and bounded build concurrency; coordinate with
the full-port owner before any competing heavy campaign. No PostgreSQL, Spark or
managed infrastructure is required for this pure semantic cut.

## Continuation Evidence

2026-10-23: Sol froze the additive single-set profiles and public factory,
including strict genuine Apply/Validate union, authored underscore fixture IDs,
opaque source revision and separately supported host policy. Two Luna lanes own
disjoint Rust versus Python/resources/fixture files. Runtime qualification and
artifact review remain pending; no pass is inferred from this planning record.

## Validation Plan

- Compare actual original fixture validation/generation and primitive generated
  wire with the admitted Rust outputs. Exercise the public functions, not only
  a helper file or schema.
- Include malformed/extra/missing keys, pins/source drift, Unicode/length and
  allowedValues boundaries, null/non-STRING inputs, relevant unknowns, policy
  profile/resource drift, copy isolation, limits/cancellation and no partial output.
- Prove exact original Key tuple framing and domain-separated input digest;
  object member reorder preserves logical digest, changed source/action/key/value
  does not. Retain unrelated source content.
- Test installed resources absent/tampered and source-tree fallback unavailable.
  Capture exact native binary/wheel/source/vector/resource/tool hashes and
  Python/OS/architecture; do not mix source and installed proof.
- Run meaningful regression and adopted boundary commands for affected modules.
  Final Sol review must resolve blocking findings before support/handoff claims.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| Another full-port candidate changes shared integration files | Keep semantic modules disjoint and expose small reviewed dispatcher patches | Reapply only reviewed additive integration against the owner's chosen base |
| Old plan-model policy/version assumptions leak into new bridge | Use distinct profiles and preserve unchecked/host-supported distinction | Remove additive callables; historical profile remains unchanged |
| A consumer treats pure admission as permission or commit | Keep executor obligations and executionVerified:false explicit; require consumer runtime proof | Refuse the new consumer profile until its authority/commit gate is qualified |
| Source/wheel/vector inputs diverge | Rebuild/review exact cohort and retain failed attempts separately | Withhold artifact handoff; never relabel old evidence |

## Exit Criteria

- The three pure operations and packaged-only factory implement CONTRACT-906.
- Original vectors, actual generated client, source tests and fresh installed
  exact-wheel tests pass with meaningful refusal and mutation controls.
- Required portable/runtime boundary evidence and independent Sol review pass.
- Candidate artifacts, source and support limits are documented and handed to
  the consumer owner through a reviewable PR/patch.
- No unverified wider native, policy-execution, release or full-port claim remains.

## Public Python SDK 0.10.1 integration and qualification

2026-10-23: The UMF owner authorized this bounded public SDK preparation on
current main `009c042545a17b49ea857eff22d0fcf3fd71ef44`. The reviewed semantic
and packaging changes are preserved through the original commit provenance:
`f46e91d49217640805225b1fcd8fbfa4fa8d4569` was cherry-picked with `-x` as
`60dcfd735f042241f6993ec48941ade279fa64d4`, followed by
`42cc635653972689d9443cbc06442df47eca92ca` as
`2e2d901c8b7c0df0526d4b664374bde51bfb616b`. This ports the bounded public
binding onto the current native SDK foundation; it does not adopt the separate
full-port branch or replace current-main lifecycle and SQL-containment work.

The selected Python distribution is `umf-core==0.10.1`. Its package
`__version__` follows that distribution version; the UMF document/schema version
and model `umfVersion` remain `0.10.0`. Distribution compatibility is qualified
by actual regression evidence rather than inferred from that shared document
version. The independent UMF owner retains final review and publication
responsibility, with repository tag `umf-v0.5.6` selected for the reviewed merge.
No tag, public URL, published artifact digest, or publication success is asserted
by this preparation record. The separate full-port distribution remains outside
this slice.

A source-byte comparison against the retained candidate inventory found all nine
canonical action resources unchanged on the selected current-main base. The
existing action runtime inventory digest remains
`13c3fb58b94eefdb319637eb15e80d20501d3538ab7b6c152e12a1b481156dff`.
This is a source comparison, not proof of a new installed or published package.
The fixed inventory and each resource digest must still be verified in every
built wheel and in its installed payload. Preserve the current native Hatch
hook, complete source-distribution closure and macOS binary handling.

The bounded implementation allocation is:

- Luna packaging owns the distribution constants, exact package inventory
  verifier, related tests and a nonpublishing SDK qualification workflow.
- The existing PyPI workflow may reuse that exact payload verifier in its build
  gate. Its publication action, environment and permissions remain unchanged.
- Root owns source commits, hosted artifact collection and build coordination;
  Sol independently reviews source and actual artifact evidence. The UMF owner
  independently reviews the resulting PR and controls public publication.

The new qualification matrix targets Ubuntu 24.04 x86_64 with CPython 3.11.17
and macOS 15 arm64 with CPython 3.11.9. The latter is the available exact
setup-python artifact; a separately observed local 3.11.17 arm64 installation
does not change the hosted cohort.
The Linux wheel is qualified with its actual `linux_x86_64` tag; it must not be
relabelled as manylinux or taken as proof for other Linux distributions. The
macOS artifact must retain its actual platform/ABI tag. Record the precise
Python, OS, architecture, build source and toolchain for each observed run;
an abi3 tag alone does not supply runtime or platform evidence.

Each selected platform must explicitly build a source wheel and source
distribution, then retain the wheel rebuilt from that source distribution as a
second artifact. Require byte-exact non-native package/resource payloads and
matching distribution version and platform tag. Record both wheel and native
binary hashes, plus the observed native-byte-identity boolean. Different native
bytes do not prove equivalent binaries or inherit the other wheel's test result.
Preserve the macOS unstripped/debug-info safeguard; do not strip a binary or
substitute an older native file to force identity.

Install each wheel in its own fresh environment outside the checkout. Verify
its exact package/metadata/RECORD/native bytes before imports and again after
tests, with each parity receipt bound to that wheel. Execute the same genuine
generated Apply/Validate client, fixed action source/vectors, resource refusal
controls and core regression corpus for both artifacts. Each requires its own
successful test step and positive JUnit count with zero failures, errors or
skips; missing proof or a passing sibling cannot qualify it. The final receipt
retains both outcomes and passes only when both are independently qualified.
Retain the exact 139-case core corpus identity and results; Arras separately
proves its fresh-empty-registry parity against the selected public SDK.
Existing browser/shared-Rust boundary and regression gates remain applicable to
changed semantic code; no wider browser execution or consumer backend claim
follows from Python qualification.

The workflow uploads artifacts and safe qualification receipts only; it neither
publishes packages nor mutates tags or releases. The owner review requires the
actual wheel/source-distribution hashes, native/resource identities, installed
results, rebuild comparison and supported/refused subset before publication.
After publication, Arras may select exact platform-specific public URLs/hashes
and requalify the unchanged document semantics plus its memory-host path. Its
local candidate override remains distinct from the default public-extra gate.

The earlier candidate evidence remains scoped to the exact local native
`umf-core==0.10.0` artifact and macOS arm64 environment that produced it. It is
historical provenance for this port, not new public `0.10.1` evidence. Installed
`0.10.1` platform qualification, independent owner review, publication and the
consumer's default public-extra proof remain pending until actual artifacts and
receipts establish each gate.

## Hosted attempts and dual-artifact qualification decision

The earlier hosted attempt `40006842930` failed its strict source-archive
check before installed qualification. The retained source distribution SHA-256
is `baa0a9f42a4edeffa9e2ea302ba5a5d74c3f099e7d34c0985cfa921d3ceda3d2`.
Archive-header review identified three duplicate, byte-identical license
members from simultaneous explicit source-closure and Hatch license-file
inclusion. The repair removes only the redundant explicit license routes;
duplicate/link/traversal rejection remains mandatory. The source archive also
contains legitimate nested project metadata, so extraction now selects the
single safe top-level `umf-core` project rather than rejecting all nested
`pyproject.toml` files. Neither repair qualifies the failed artifact.

At source `c71be8f4117a3f8999e88760482e3c8b80ef982c`, the coordinator reported
Linux run `40009761439`, job `120606811539`, built both artifacts but failed the
strict complete-package rebuilt-payload equality check. No installed pass is
claimed for that attempt. The same run's macOS job `120606811008` failed Python
setup because the requested 3.11.17 arm64 setup artifact was unavailable; the
hosted matrix is corrected to exact 3.11.9 arm64. These failures remain part of
the execution history and do not become successful receipts after source fixes.

Independent read/hash review of the earlier, separately qualified `0.10.0`
macOS candidate already shows unequal native artifacts: primary native SHA-256
`ea1b1522c173b39f8c5ef1d696a228c15d540fcc590fcf8c644cbd3911116b51`
and source-rebuilt native SHA-256
`d54703ae8fe08c1d0cbea362e731d7d63bc4a4af3cb75e6692ed4c0b89a6cd1b`.
That packet retained an independent installed-rebuilt semantic probe. It is
precedent for retaining distinct artifacts, not proof for the new SDK or an
attribution of the new Linux difference to a particular compiler mechanism.

The adopted repair replaces an unsupported reproducible-native assumption
with the two actual installed gates specified above. It keeps source/resource
identity strict, records native identity accurately, and requires real separate
qualification rather than accepting a merely nonempty rebuilt extension.
Both new hosted artifacts, their pre/post parity and test receipts, independent
owner review, public release attachment and consumer public-extra qualification
remain pending until their actual results are retained. No local SDK build was
started for this decision, and no backend qualification follows from it.

## Source-bound metamodel refresh and archive custody

The source-bound generator completed against unchanged source
`a4c6057bda65cfeda7ea4dde9d05bfdc02b36310`, using the official private
output-root mode. Independent read/hash review accepted exactly the eleven
declared outputs: the authored model digest stayed
`1e406ee49b0c4c08b8eb996bb1fcb6e96fa8d6f4673f0877aa1800986b2dbbce`,
and the nonmanifest outputs differed only in the exact compiler-provenance
digest. The generated manifest now records 211 source entries, including the
eleven single-set additions. Its source-bound compiler-closure SHA-256 is
`f63bb4e9dbb8c094958d3ef50dad48f7ba30e047a5ebcac0a8ae402a27bed951`.
The generated output manifest is
`86d7c5215280429e3252b5d44880cb5ce3b7e80557bc5a095b22688893a79157`.
After the exact reviewed copy, the coordinator observed the canonical
metamodel self-check pass in 31.5 seconds using the source-bound cached
compiler. This is source-generation evidence, not installed SDK qualification.

The action resource inventory remains nine files. Its refreshed manifest is
`857cb47fd75b274631c9008c61d1200ec0141b1d6da972248ba7b4a516967660`;
independent hashing confirms every declared resource matches its canonical
source. Five resource digests changed with the reviewed compiler-provenance
refresh. Earlier evidence bound to manifest `13c3fb58b94eefdb319637eb15e80d20501d3538ab7b6c152e12a1b481156dff`
remains historical evidence for that exact artifact and does not qualify these
new bytes. Earlier bounded preparation attempts ended before generation;
the successful staged generation and later canonical check are separate
observations, not retroactive passes for those attempts.

The coordinator independently compared the retained c71 source archive to an
exact targeted snapshot of
`c71be8f4117a3f8999e88760482e3c8b80ef982c`, supplying the retained direct
wheel's exact METADATA bytes as the expected PKG-INFO. All 520 archive files
matched the closed source inventory and bytes; the canonical inventory digest
is `e283366d78ab725f952091090faa4637809f7862bd706777899fe540d2b0d0c1`.
This comparison executed no archive code or build. It establishes a positive
control for the custody checker on that historical source cohort, not a new
installed pass for the earlier failed hosted attempt.

The current archive gate must require the complete reviewed build-input
inventory before rebuilding and recheck it afterward. The direct and rebuilt
wheel METADATA and WHEEL bytes must match exactly, alongside the non-native
payload; native bytes remain separately measured and separately qualified.
The macOS repair must derive a truthful thin arm64 tag from the explicit Rust
target and inspected Mach-O minimum OS while preserving the unstripped
safeguard. Actual hosted direct/rebuilt installed qualification, independent
owner review, public artifact attachment and Arras default public-extra proof
remain pending. No backend or broader platform support follows from these
source checks.

The integrated source review is clear for the next hosted qualification run.
The reviewer independently read and hashed the Mac target/inspector, file-relative
build-hook loader, source-custody helper and its pre/post checks, exact
METADATA/WHEEL comparison, and workflow's two independent installed gates.
The reviewed main verifier SHA-256 is
`e6e658d4bd4050ecb37923641cbc0db94936f2bb1c23d888d188463754beb38c`;
its pinned sdist helper is
`bf2c29b2bbdf2699b016566f2583288885014c99a4d4caf80095135b363a19d5`
and native-platform helper is
`5856eb375d176af7671ad22981d983a14cec24663e3a8bc466446b433c2cd7b1`.
The implementation owner reports 47 focused controls passing, including the
retained real-helper tamper/inventory/path/resource controls and orchestration
controls, with Ruff, format, workflow YAML and diff checks passing. These are
owner-executed checks; the independent reviewer did not rerun them or build
native artifacts. Final source inventory and Rust boundary checks remain
coordinator gates. Current hosted direct/rebuilt artifacts and their actual
installed test receipts are still pending; source clearance supplies no
installed, public-release or backend qualification.

## Hosted post-build source inventory correction

Run `40021779237`, Linux job `120647877231`, built the direct wheel and source
distribution, then failed the pre-rebuild custody gate with
`sdist-file-inventory-differs`. It checked out producing PR merge
`b46d8087eb3482b5bbe3fe2652b5080092887af4`; the coordinator confirmed its tree
is identical to reviewed head `5e68560b66cd6b2324b595a5b6f08ab26c870295`.
No sdist rebuild or installed qualification ran. Retained artifact `12530912238`
has ZIP SHA-256
`5ac968a68bf94db7bd986a910e0f9f3ee3916e67f7c436a24c732773e6ab3566`.
Independent container hashing records the direct wheel as
`34019b36dbed45ae49ff85f4eed5e68693d5bb62ace8d2e52cf78070d23df1df`
and source archive as
`f5b2e1903886e5df3735b13c77aec7f3f1fb2b9808c71e2964eeed2eb8fda3cf`.
These are retained failed-attempt artifacts, not qualified release assets.

The coordinator's byte-only comparison found all 523 archive files matched
the clean source closure, with no missing, extra or differing bytes. A bounded
reproduction placed only the two retained build containers in the live
checkout's `python/dist` output directory. The helper then expected 525 files:
the only two additional expected paths were the generated wheel and source
archive under that root output directory. No archive-only or byte differences
appeared; the temporary reproduction outputs were removed in cleanup.
The retained comparison-record SHA-256 is
`52b72911a92b6977b4d1217b0cfffc66522f075abd97fad9e5a48f25896155e4`.

The repair is confined to excluding that generated root `python/dist` subtree
from source enumeration. Legitimate nested package directories named `build`
or `dist` remain source inputs, and archive duplicate/path/link rejection and
complete byte custody remain mandatory. Retained controls must exercise the
post-build output condition and nested source preservation. This diagnosis and
source repair do not convert the failed run into a pass; actual hosted
rebuild and both installed artifact qualifications remain required.

The repaired helper passed the retained-artifact control with both generated
containers present under the exact 5e source snapshot's `python/dist`.
All 523 approved archive files matched, with canonical inventory SHA-256
`a1d49cb246c10df2171d5141af8749e61947a2fcba1957dc8f15d3d45977747a`.
The executing owner measured unchanged helper SHA-256 before and after:
`81ce3ed420fce370ae9440d2994413d11e3b3838aa0e3eb9c32df8594f2d6b7e`.
The retained control receipt SHA-256 is
`e9f1b7bc7ec8910298d6d5ffd9e7c9bfec63acf305da93617fbc21fe78bafc08`.
This byte-only control performed no archive build or installed runtime test.

Independent static review cleared the exact root-output-only repair and all
helper pins, including the main verifier now hashed as
`7892ab07d78abc0fc368046aa3435728a4d107300798d14ad6287c95e4f836a5`.
The implementation owner reports all nine real helper tests passing, including
root-output exclusion, retained nested source, archive-extra refusal and
root-output symlink refusal. Existing ignored-directory behavior is preserved.
Those owner-executed controls are distinct from the reviewer's source/hash
inspection. Fresh hosted artifact rebuild and both installed qualifications
remain pending.

## Hosted dual-artifact result and macOS fixture repair

At reviewed head `ef8962a02acb32a92aac408877383076828b7380`, run
`40023461006` used producing merge
`f7d35d6aed63f83bc806dfde12137835b953ba01`; the coordinator verified its tree
matches that head. The Linux job `120653647455` passed both artifact gates.
Independent original-byte/receipt/XML review confirms 237 passing tests with
zero failures, errors or skips for each wheel, including the exact 139 core
case IDs, source custody, exact non-native/METADATA/WHEEL parity and each
artifact's own installed pre/post parity. This remains the observed Ubuntu
24.04 x86_64, CPython 3.11.17, glibc 2.39 cohort. It supplies no macOS or
portable-Linux qualification.

The same run's macOS job `120653647206` completed actual wheel/source builds,
strict source custody and rebuild, and both isolated installs/payload checks.
Its direct test suite then reported 236 passing tests and one failure, with
zero errors or skips. The failure was the source test
`test_full_wheel_hook_initialization_keeps_resource_targets_disjoint`: its
fake Cargo callback wrote to the old unqualified `release` directory while
the hook now correctly uses the explicit `aarch64-apple-darwin/release`
output. The rebuilt wheel's runtime suite was skipped after that failure;
its successful post-test payload check cannot imply those tests ran. The
final receipt correctly records `failed_or_incomplete` for both artifacts.

The retained macOS artifact `12532102000` has ZIP SHA-256
`9baabad8f9d7f651f23673aa27b5072b368d6bce9aedb8fc10edf5e4945ab1c5`.
Independent hashing of its originals records direct wheel
`abe8736d2a3ee1f7b6cb8382de7b9d0073091da1b80a1c1bbbeb2ee43cc16af8`,
rebuilt wheel
`592891dbb7510c8f487bd78094316ce37adbcc499f64a9931ce1c378a1f5ad50`,
and shared source archive
`f58afbe335a741a26980f45803c567730136a2b19383699291771e04b76c447d`.
The failed qualification receipt SHA-256 is
`45f1d129ae3dd859603aaaa1f9d9b15405e2ff1e1f54126bafc0389fbf2ba655`;
the original direct-suite XML is
`220cf1e8d8397f0dbea2b740765e7ea42bb0f3b4111421e51cd47aa995caada3`.
These identities preserve the failed attempt, not qualified macOS assets.

The repair must update only that synthetic callback's target path and provide
valid synthetic Mach-O bytes for the declared CPU/minimum OS. Real native
inspection and both actual installed gates remain unchanged. A local rerun of
that source fixture, if performed against the retained unqualified SDK, proves
only the fixture repair. Fresh complete hosted macOS qualification, final
source checks, owner publication and Arras default public-extra acceptance
remain mandatory.

Independent static review cleared the test-only callback repair at SHA-256
`3a08e3ad28da280334ecc75ef215025b2a6241d00b3659dff95a7ea384f7bd71`.
The fake now follows the actual Cargo target argument and uses a closed CPU
mapping for the hook's existing ARM64 and x86_64 Darwin targets, with bounded
synthetic LC_BUILD_VERSION bytes declaring macOS 11.0. This preserves source
test behavior for both branches without adding an Intel artifact support
claim. No production hook, inspector or qualification gate changed.

The implementation owner reran only the changed source fixture in a fresh
local environment with the exact hosted Hatchling 1.27.0 and retained failed
macOS direct wheel `abe8736d2a3ee1f7b6cb8382de7b9d0073091da1b80a1c1bbbeb2ee43cc16af8`:
one test passed in 3.01 seconds. Ruff, format and diff checks also passed.
The independent reviewer read/hashed the diff and did not execute this test.
This is partial fixture-repair evidence, not an installed artifact
qualification or a replacement for either hosted runtime suite. New hosted
source and complete direct/rebuilt artifact gates remain required.
