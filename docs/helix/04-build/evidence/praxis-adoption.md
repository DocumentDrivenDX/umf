# Praxis typed ontology adoption — 2026-10-20

Local implementation evidence for FR-56, FEAT-033 OA-22–28, US-091 AC11–13,
US-092 AC13–15, SD-033, CONTRACT-079 and CONTRACT-900. The original
[consumer asks](../../00-discover/inputs/praxis-ontology-access-asks-2026-10-20.md)
remain retained. [Source and artifact pins](praxis-adoption/verification.json)
identify the tested working-tree implementation; this is not a published release.

## Delivered boundary

- Refuse legacy module/DDD actions, malformed current inventories, unknown
  action-payload qualifiers and unsupported action vocabulary versions.
- Admit graph-write/2 optional assignments to absent-allowed exact destination
  Fields. Version1 retains its required-parameter rule. No native graph-write/2
  executor is certified by this change.
- Emit frozen per-action input dataclasses and precondition string enums. The
  [canonical example](../../../../tests/unified/adoption.json) generates both
  key-absence and referenced-entity-existence conditions.
- Emit sync/async batch and advisory validation methods. Batch size is1–100;
  typed items/flags/inputs are checked before dispatch. Outcomes preserve applied,
  refused, rolled-back, unknown and unattempted states with one consistency token.
- Treat graph success as committed acknowledgement. Pending, malformed, lost,
  wrong-schema and cancelled write responses preserve uncertainty and invocation
  key without retry. Known well-formed wire refusals remain typed business errors.
  Native table pending durability is unchanged.
- Publish wire error codes, batch limits and action condition/operation metadata.
  Rebuild the embedded generator, source manifest and derived action-plan producer
  identity so shipped source assets match the changed admission/generator source.

## Verification

| Gate | Result / retained evidence |
| --- | --- |
| Focused Bun suites across14 files | 82 passed,1 native test skipped,0 failed; [log](praxis-adoption/focused-tests.log) |
| Actual Chromium, four complete sources | Identical generated files/hashes, no external requests/host globals; [log](praxis-adoption/browser.log) |
| Isolated Python3.11.17 `-S` | Sync/async optional omission/null, named conditions, validation,100-item atomic/partial batches, stop/replay/rollback, malformed responses and actual task cancellation pass in the focused probe |
| mypy2.4.0 strict | Generated package and positive example pass; four intended wrong calls rejected; [positive](praxis-adoption/mypy-positive.log), [negative](praxis-adoption/mypy-negative.log) |
| pyright1.1.414 standard | Generated package and positive example pass; same four wrong calls rejected; [positive](praxis-adoption/pyright-positive.log), [negative](praxis-adoption/pyright-negative.log) |
| ty0.0.88 | Generated package and positive example pass; same four wrong calls rejected; [positive](praxis-adoption/ty-positive.log), [negative](praxis-adoption/ty-negative.log) |
| TypeScript library/tools typecheck | Pass |
| Browser library build | Pass; [log](praxis-adoption/build.log) |
| Unified, compiler, host-Python and codegen boundary checks | Pass; math is explicitly admitted as stdlib in the pre-existing template scanner |
| Codegen boundary negative controls | Three unittest methods pass |
| Extension package audit | 71/71 packages pass |
| Embedded assets check | Current;229 source inputs,13 payload files |
| Fresh local wheel installation, mini-racer0.14.1 |27 complete generation/refusal parity cases plus writer/integrity/CLI controls pass; [installed receipt](praxis-adoption/installed-codegen.json) |
| Scoped source review / diff whitespace | No remaining adoption-blocker finding; `git diff --check` passes |

The test commands are `bun test` over the14 file paths listed at the start of
[the focused log](praxis-adoption/focused-tests.log),
`bun test tests/access-unified-browser.test.ts`, `bun run typecheck`,
`bun run build`, `bun run check:unified-client-boundaries`,
`bun run check:access-boundaries`, `python3.11 scripts/check-codegen-boundaries.py`,
`python3.11 -m unittest discover -s python/umf_codegen/tests`,
`bun scripts/audit-extension-packages.ts` and
`bun scripts/build-codegen.ts --check`. Installed parity uses
`bun scripts/codegen-corpus.ts CORPUS` followed by
`python tests/codegen/installed_probe.py --corpus CORPUS --report REPORT`
from a fresh wheel-only local environment. The typing examples are retained as
`tests/unified/adoption_typecheck_positive.py` and its negative counterpart;
pyright uses standard mode with Python3.11 and the generated package on its path.
No generated suppression comments were added.

## Qualifications and unresolved work

This qualifies metadata admission, generation and a synthetic transport host on
local macOS ARM64. It does not establish native graph-write/2, production
Hohfeld/Truss batch or validation execution, durable host replay across restart,
authorization, audit, or a Linux x86_64/aarch64 × Python3.11–3.14 install matrix.
One existing native PostgreSQL test is unconfigured and skipped. The complete
repository test suite was not run. Real host conformance remains required.

An exploratory pyright strict source scan reported109 diagnostics, including
pre-existing unused imports, unknown-type and runtime-guard diagnostics. Strict
pyright source qualification remains unresolved; the required standard-mode
and positive/negative API checks above pass. An initial default Python3.9 package
build failed on its build dependency imports; the supported Python3.11 build
and wheel-only installation passed. Browser loopback execution required running
the existing test outside the restrictive sandbox and then passed.

Link-key projection, complete machine-readable wire/description schemas,
TypeScript emission and the broader reusable consumer conformance distribution
remain open. Legacy conversion belongs to Hohfeld/Praxis; UMF supplies current
examples and diagnostic refusals. Source and wheel hashes distinguish this local
successor from immutable0.5.2 release assets; no asset/version was republished.


## Fresh review and corrections — 2026-10-20

The requested follow-up review identified and corrected four bounded issues:

| Finding | Correction / evidence |
| --- | --- |
| Distinct parameter IDs can normalize to one Python name, producing invalid methods/dataclasses | Refuse the second normalized name at its original parameter path; generator regression |
| Module/action pairs can collapse to the same dot-qualified wire identity | Refuse ambiguous and duplicate qualified IDs before emitting description methods; cross-module regression |
| A malformed action entry can throw an unlocated TypeError or structural error | Locate inventory entries and wrap selected structural refusal at the original action path; null/scalar/missing-entry regressions |
| Sequence length can disagree with iteration, bypassing batch bounds or dispatching an empty batch | Bound snapshot iteration to101 observations and verify the actual nonempty1–100 snapshot; sync/async misreported empty/oversized/million-item controls verify zero dispatch |

Current retained results are82 focused passes, one unconfigured native skip,
one Chromium pass and27 installed complete-result/refusal parity cases. All
three positive/negative typing gates pass at their documented modes; source
boundary checks, extension audit, typecheck, build and embedded-source custody
pass. No remaining actionable finding was identified within the adoption scope.
The previously listed production/platform and strict-pyright qualifications remain
open and are not promoted by this review. The user explicitly authorized commit
and push; the detached checkout is carried onto a new codex topic branch.
