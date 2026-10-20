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


## Hosted boundary gate correction

The first hosted boundary job failed on an unchanged main-branch test fixture:
it expected `compile_table_operation_json` and `check_table_operation_json`, while
the current native reader and boundary checker permit only
`prepare_table_operation_module_json`. The original fixture and checker were
byte-identical to main; [baseline hashes](praxis-adoption/boundary-baseline.json)
retain that comparison. The failed job is
[118765790758](https://github.com/DocumentDrivenDX/umf/actions/runs/39462645808/job/118765790758).
The same failure reproduced locally before correction.

The test-only correction admits the prepared-module entry point, explicitly
rejects both superseded compiler functions and keeps the non-owner and unrelated
Weft/driver imports forbidden. The checker and library are unchanged. All24 local
boundary tests pass with174 assertions, and the real source checker reports no
violations. [Passing log](praxis-adoption/boundaries.log). This does not change
the prior83 local adoption/browser passes or27 installed parity cases. Hosted CI
must rerun against the follow-up commit; the independent Claude review remains
pending before merge.

## Integrated review successor

The [remediation packet](typed-api-remediation/README.md) supersedes this record's
earlier clean-review conclusion for cancellation, atomic stopping and unused-name
admission. It retains the original scoped results above and adds fresh tests and
an explicit compatibility amendment. Read the successor for current qualification;
the original83 passes did not cover those newly identified cases.

## Praxis consumer review reconciliation — 2026-10-20

[The consumer review](https://github.com/DocumentDrivenDX/umf/pull/40#issuecomment-6300376302)
ran the installed PR generator against original Praxis ontologies and reviewed
head `d33cc9f005f92db98e01882eeb075c6e2cbbe471`. Its passing observations support
the bounded experimental client profile, not native Truss execution. Latest Sol
review reconciled each finding against the current source:

| Finding | Disposition and validation |
| --- | --- |
| 1. TaskGroup suppresses cancelled child keys | Preserve normal cancellation and exception-based custody. CONTRACT-079 already states the combinator limitation; add an application-owned child-capture example. No global outstanding-writes registry: its lifetime/clearing semantics would introduce a new client state API. Existing TaskGroup controls remain required. |
| 2. Transport-raised refusal becomes unknown | Retain conservative behavior. CONTRACT-079 already requires a matching-schema wire refusal envelope and explicitly includes transport-raised AccessError among uncertain writes. Truss's new transport follows the same boundary. |
| 3. Unknown condition IDs accepted | Remediate: validate supplied condition IDs against the selected action's declarations, including validation and batch refusal items. Keep the documented string exception field and generated string Enum comparison; unknown host IDs fail response admission. |
| 4. Local codes absent from metadata | Remediate: publish the finite local error categories separately from wire codes. Preserve local compatibility rather than relabeling existing errors as host refusals. |
| 5. Batch cap duplicated | Centralize the fixed100-item limit used by metadata and runtime. No host-specific cap override or changed advertised capability. |
| 6. Atomic all-unknown outcome | Current source already rejects every atomic unknown item, with or without a key. Add the exact keyless regression. Clarify that uncertain atomic settlement uses the whole-response WRITE_OUTCOME_UNKNOWN error envelope. |
| 7. Link projection, wire schemas and byte-parity matrix | Retain as open qualification work, without promoting read traversal into projection or schema availability. Continue native Linux CI and local host testing; no duplicate platform matrix is added. |
| 8. Embedded generator correspondence | Rebuild using the canonical generator asset builder and verify payload, manifest and source correspondence together before push. Binary size alone is not a rejection criterion. |

The [execution receipt](praxis-consumer-review/verification.json) pins the corrected
source, embedded asset and manifest. Focused adoption/generation tests passed14;
actual Chromium passed exact byte parity across four sources; Python codegen's
three tests passed on CPython3.11.17. Typecheck, unified/compilation/Python access
boundary gates and the canonical embedded builder check passed. Disposable-copy
controls allowed the constants leaf and rejected both a node:fs import and a
process hook. Independent decompression SHA-256 matches manifest.bundleSha256;
_release.py pins the exact manifest digest. Latest Sol review found no remaining
actionable issue in this successor. These results are local macOS ARM64 evidence;
the explicitly open qualifications above remain open.

Commands: `bun test tests/access-adoption.test.ts tests/access-unified-generation.test.ts`,
`bun test tests/access-unified-browser.test.ts`, `bun run typecheck`,
`bun run check:unified-client-boundaries`, `bun run check:access-boundaries`,
`bun scripts/build-codegen.ts` followed by `--check`, and
`PYTHONPATH=python/umf_codegen/src python -m unittest discover -s python/umf_codegen/tests`.
The scoped Python command used the local CPython3.11.17 environment with
mini-racer0.14.1. No source asset was published or version relabeled.

### Hosted compatibility fixture follow-up

On head `4f39dd821`, the [hosted compatibility job](https://github.com/DocumentDrivenDX/umf/actions/runs/39491012407/job/118863889793)
exposed an older fake host returning `precondition:"order-open"` for an action
whose source declares no preconditions. The new declaration check correctly
classified it as malformed. Correct the fixture to assert keyed uncertainty and
one dispatch; retain valid declared-condition tests in the adoption probe.
Runtime, accepted source fixture and embedded assets are unchanged.

The exact hosted six-file Bun selection passes locally:38 passed,1 intentionally
unconfigured native test skipped,0 failed. The canonical asset check remains
current. This local correction requires a fresh hosted run; it does not establish
that all PR checks have completed.
