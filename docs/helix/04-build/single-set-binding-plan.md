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

The new qualification matrix targets Ubuntu 24.04 x86_64 and macOS 15 arm64.
The Linux wheel is qualified with its actual `linux_x86_64` tag; it must not be
relabelled as manylinux or taken as proof for other Linux distributions. The
macOS artifact must retain its actual platform/ABI tag. Record the precise
Python, OS, architecture, build source and toolchain for each observed run;
an abi3 tag alone does not supply runtime or platform evidence.

Each selected platform must build the wheel and source distribution, verify the
closed source/resource/native inventory and archive RECORD, then install the
exact wheel in a fresh environment outside the checkout. Verify import origin,
installed RECORD and payload parity before reporting installed results. Execute
the genuine generated Apply/Validate client, fixed action source/vectors,
resource refusal controls and core regression corpus without treating missing
runtime capability as a skip. Retain the exact 139-case core corpus identity and
results; Arras separately proves its fresh-empty-registry parity against the
same selected public SDK. Rebuild from the source distribution and compare the
resulting payloads, explicitly qualifying any native binary differences rather
than asserting container-byte equality. Existing browser/shared-Rust boundary
and regression gates remain applicable to changed semantic code; no wider
browser execution or consumer backend claim follows from Python qualification.

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
