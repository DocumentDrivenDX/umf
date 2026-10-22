---
ddx:
  id: umf.typed-api-review-remediation-plan
  type: implementation-plan
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.prd
      kind: informed_by
    - id: SD-033
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Typed API PR review reconciliation — 2026-10-20

## Scope

Disposition and remediation plan for [PR40](https://github.com/DocumentDrivenDX/umf/pull/40),
reviewed at `7466c5a9c456e7c200737b82ebc664d6576fc27d` against base
`5ba77cff91a121a44c82f6bce32a78d8842161b5`.
The initial revision records planning and read-only investigation. The owner
subsequently authorized implementation, cancellation and CI repairs, testing,
review, commit and push to the existing PR. The execution record below distinguishes
current verification from the original reviewed-head observations.

Inputs are [Claude's review](https://github.com/DocumentDrivenDX/umf/pull/40#pullrequestreview-5589259695),
the [first Codex review](https://github.com/DocumentDrivenDX/umf/pull/40#pullrequestreview-5588698574),
the [updated Codex review](https://github.com/DocumentDrivenDX/umf/pull/40#pullrequestreview-5588739078),
and the independent checks recorded below. GitHub returned three review summaries
and no inline review threads. The findings below exhaust Claude's five numbered
comments, CI note and minor import note, and retain the earlier Codex fixes.
The earlier clean scoped review does not establish merge readiness: this integrated
review identifies uncovered cases and supersedes that conclusion.

Governing artifacts:

- [PRD FR-56](../01-frame/prd.md), [FEAT-033](../01-frame/features/FEAT-033-generated-ontology-access.md),
  [US-091](../01-frame/user-stories/US-091-ontology-access-description.md) and
  [US-092](../01-frame/user-stories/US-092-portable-ontology-client.md).
- [SD-033](../02-design/solution-designs/SD-033-generated-ontology-access.md),
  [CONTRACT-079](../02-design/contracts/CONTRACT-079-unified-python-access.md) and
  [CONTRACT-900](../02-design/contracts/CONTRACT-900-declarative-actions.md).
- [CONTRACT-081](../02-design/contracts/CONTRACT-081-table-lifecycle.md) governs
  the native CI distinction between bounded operation scope and explicit full
  correspondence diagnostics under privileged-change quiescence.
- [TP-001 adoption coverage](../03-test/test-plan.md#typed-ontology-adoption-verification),
  the [canonical implementation plan](implementation-plan.md#praxis-ontology-adoption--2026-10-20),
  [existing execution evidence](evidence/praxis-adoption.md) and
  [consumer asks](../00-discover/inputs/praxis-ontology-access-asks-2026-10-20.md).

## Shared Constraints

FR-56 and CONTRACT-079 require one portable typed API, explicit uncertainty with
the attempted idempotency key, and no automatic write retry. Cancellation cannot
prove rollback. CONTRACT-900 version1 assignment semantics and version2 optional
assignments remain distinct. Preserve unknown declarations and exact source-path
refusals. ADR-002 and the active project concerns require browser-compatible
TypeScript, Bun checks, real Chromium evidence and stdlib-only generated Python.
Native table durability and graph-host receipts remain separate contracts.

Semantic changes below must first be reconciled into CONTRACT-079,
SD-033, the affected US-092 acceptance criteria and TP-001. This plan itself does
not silently amend those contracts or claim new host support.

## Finding Dispositions

Priority indicates remediation urgency, not an assertion that Claude assigned it.

| ID / source | Decision and evidence | Remediation / rejection boundary | Priority / gate |
| --- | --- | --- | --- |
| R1 — Claude1: atomic batch settlement | **Partially accept; qualify the claimed contract violation.** Both reported permutations are accepted. However, CONTRACT-079 explicitly limits the no-stop prohibition on `unattempted` to partial settlement. Atomic preflight ordering is underspecified; current wording does not prove the entire blanket claim. | Recommend one uniform rule: `unattempted` is permitted only with `stop_on_error=True`, as a suffix after the first refusal (or unknown in partial mode). Atomic failure without stopping may contain refusals/rolled-back items, never applied/unknown/unattempted. Clarify the contract before tightening validation. Reject treating the tightening as already unambiguously required by the old text. Cover all flag combinations and preserve genuine rolled-back work. | P2; S1, S3 |
| R2 — Claude2: reserved `check` | **Accept code defect.** Renaming an action parameter or precondition to `check` independently fails generation; emitted modules do not import `check`. | Remove only the unused reservation. Generate, import and invoke an action with parameter `check`; exercise a precondition enum value named `check`. Preserve real imported-name and normalized-name collision refusals, including `Enum` and `Sequence`. | P2; S2 |
| R3 — Claude3: transport-raised `AccessError` | **Retain intentional behavior; reject the claim that the contract lacks it.** CONTRACT-079 already explicitly includes arbitrary `AccessError` transport exceptions in post-dispatch uncertainty. A raised exception cannot authenticate precommit refusal. | Add a guide example contrasting a matching-schema known-code error envelope with a raised transport exception. Retain tests for arbitrary `AccessError`, wrong schema and malformed errors; verify exact `.key` and one dispatch. Do not restore direct exception propagation for writes. | Documentation; S4 |
| R4 — Claude4: required empty receipt collections | **Accept migration/documentation gap; retain strict decoding.** `created`, `changed`, `counts` and `consistency_token` are required. Defaulting omitted collections to empty would invent a complete receipt. | Explicitly document required empty `[]`, `[]`, `{}` values in the host guide and receipt contract. Add independent omission cases for each collection, and a valid all-empty success. Preserve optional wire `status` as legacy committed acknowledgement; do not confuse its optionality with receipt-field optionality. | P2 documentation/coverage; S4 |
| R5 — Claude5: swallowed cancellation | **Accept correctness/compatibility concern, despite being pre-existing and currently prescribed by CONTRACT-079.** Timeout and TaskGroup probes confirm changed structured-concurrency behavior. This is more than a missing `uncancel()` call. | Design and prove a cancellation-safe contract before changing code: propagate the original cancellation while retaining per-invocation write uncertainty and the exact key through an explicit, inspectable channel. Select and document that channel in S1; keep ordinary transport failures as `WriteOutcomeUnknown`. Reject blanket `uncancel()`, retry, invented rollback, and an untested cancellation subclass. Do not close this with documentation alone. | P1; S1, S5; merge gate |
| R6 — Claude CI note, extended by current checks | **Accept failed-CI gate; qualify inherited-failure attribution.** A historical main lint failure is verified, but its14 findings differ from the current5. Current CI also has two failed `source-dbapi` native-session jobs. | Compare the actual current base and head with identical tool/dependency pins. Fix or incorporate a minimal upstream lint repair; investigate the native declared-read failure separately. Establish provenance per failure, then fix and rerun affected jobs. Do not waive failures because an older main run was red. | P1 merge gate; S6 |
| R7 — Claude minor `math` allow-list note | **Retain; reject reverting a necessary scanner correction.** The generated runtime already imports stdlib `math`; allowing it aligns the scanner with emitted source. | Verify boundary coverage still accepts the actual stdlib runtime and rejects third-party imports, host globals and forbidden native compiler imports. No broader allow-list expansion. | Validation; S7 |

### Earlier Codex review integration

These fixes are already present at the reviewed head. They require regression
retention, rather than duplicate remediation or claims that new coverage passed.

| Earlier finding | Current disposition | Retained proof / next check |
| --- | --- | --- |
| Normalized parameter names can collide | Resolved at reviewed head | `tests/access-adoption.test.ts` source-path collision case; retain alongside R2 positive cases. |
| Concatenated module/action identities can collide | Resolved at reviewed head | Same suite's qualified action identity refusal; retain exact original source location. |
| Malformed action inventories lose useful diagnostic paths | Resolved at reviewed head | Same suite's malformed/future/legacy inventory refusals. |
| A dishonest Sequence length bypasses batch limits | Resolved at reviewed head | `tests/unified/adoption_probe.py` bounded actual snapshot, no dispatch on invalid inputs; retain cap100. |
| Stale native-read boundary fixture names retired compiler API | Resolved by `7466c5a` | Existing24 local boundary tests and checker evidence. Keep explicit old-import rejection. This does not resolve the separate hosted native read execution failure in R6. |

## Review Evidence and Limits

Independent read-only probes used the repository generator on
`tests/unified/adoption.json`, emitted into a temporary directory, and Python3.11.17.
They did not edit production source or execute a production graph host.

| Probe | Observed at reviewed head |
| --- | --- |
| Parameter name `check`; independently precondition ID `check` | Both raise `UmfError: Name cannot be generated without a collision`. |
| Two valid typed inputs, atomic=True, stop_on_error=False; host returns refused/unattempted, then reversed ordering | Both accepted as `BatchReceipt`. Refusal was PRECONDITION_FAILED/fresh; response used matching schema and token. |
| Host awaits an unresolved Future; `asyncio.timeout(0.01)` surrounds single apply with key `timeout-key` | Escapes as `WriteOutcomeUnknown`, key retained; timeout context leaves cancelling count0. It does not become `TimeoutError`. |
| Explicitly cancel task after dispatch, key `cancel-key` | `WriteOutcomeUnknown`; task.cancelled() is False and task.cancelling() is1. |
| TaskGroup sibling raises ValueError while write awaits transport, key `group-key` | ExceptionGroup contains both ValueError and WriteOutcomeUnknown. |

Python's [asyncio documentation](https://docs.python.org/3.11/library/asyncio-task.html)
warns that swallowing cancellation can interfere with TaskGroup and timeout.
Inspection of Python3.11's installed `Timeout.__aexit__` also shows an exact
`exc_type is CancelledError` check: a new subclass is not automatically a valid
fix. These probes characterize the minimum supported interpreter only; broader
supported-version and concurrent-call behavior remains an S5 gate.

Hosted status was re-read for head `7466c5a` on2026-10-20:

- Python failures: [job118768146039](https://github.com/DocumentDrivenDX/umf/actions/runs/39463352507/job/118768146039)
  and [job118768111471](https://github.com/DocumentDrivenDX/umf/actions/runs/39463342604/job/118768111471).
  The first job's downloaded log reports Ruff0.17.1: two RUF059 unused unpackings
  (`unified/table_reads.py`, `test_fixed_query_preparation.py`) and three I001 import
  blocks (`test_fixed_query_description.py`, `test_fixed_query_preparation.py`,
  `test_refactor_regeneration.py`). The second job's failure classification still
  needs log comparison in S6.
- [Historical main run39343894336](https://github.com/DocumentDrivenDX/umf/actions/runs/39343894336),
  head `57e68afed1b07dc22de493192a6951dba809b34b`, failed Python lint with14 errors.
  That proves an earlier red baseline, not identity with the current findings.
- Native source-dbapi failures: [job118768146226](https://github.com/DocumentDrivenDX/umf/actions/runs/39463352162/job/118768146226)
  and [job118768110785](https://github.com/DocumentDrivenDX/umf/actions/runs/39463342372/job/118768110785).
  The first downloaded log reaches `tests/unified/table_reads_native.py:125`
  (`read_page`) and `SyncTableReader.read`, then raises
  `SessionError('native declared read failed')` on Python3.11.17/PostgreSQL18.6.
  The hidden underlying cause and the second log's equivalence remain unknown.
  Preserve diagnostics without leaking row/identity data while reproducing.

The retained83 local adoption/Chromium passes,24 boundary tests and27 installed
generator parity cases in the earlier evidence remain historical, scoped results.
They do not establish correctness of these uncovered cases or future patches.

## Implementation Slices

| Slice | Area / governing artifacts | Depends on | Change and verification gate |
| --- | --- | --- | --- |
| S1 | R1/R5 semantic decisions; SD-033, CONTRACT-079, US-092, TP-001 | None | Amend batch ordering explicitly. Prototype cancellation propagation and per-call uncertainty custody; choose the public inspection surface, exact-key lifetime and transport-spontaneous-cancellation behavior. Update upstream acceptance criteria before runtime work. Reject designs that lose uncertainty or structured cancellation. |
| S2 | R2 naming; US-091, CONTRACT-079 | None | Remove unused `check` reservation; positive parameter/precondition generation/import/invocation plus existing genuine collision negatives. |
| S3 | R1 batch; US-092, CONTRACT-079 | S1 | Apply the approved ordering rule in shared generated runtime; sync/async matrix over atomic/partial and stopping flags. Invalid host settlement becomes keyed uncertainty after exactly one dispatch. |
| S4 | R3/R4 host integration; CONTRACT-079 and guide | None | Document raised transport error vs authenticated refusal, all required receipt fields and migration examples. Independent missing-field negatives, empty success, omitted/explicit committed status positives and pending-status negative. |
| S5 | R5 cancellation; approved S1 contract, TP-001 | S1 | Implement approved cancellation-safe propagation. Test single/batch timeout, explicit cancellation, TaskGroup sibling failure, read/validate controls, pre-dispatch cancellation and concurrent writes with distinct keys. Verify no retries and no mistaken committed/rolled-back claim. |
| S6 | R6 CI; TP-001, native table contracts | None; final rerun follows code changes | Compare both logs per failed job family and base/head with exact dependency pins. Repair lint minimally and reproduce native read failure. Separate inherited fixes from PR regressions; preserve prepared-operation boundary and real PostgreSQL assertions. All affected hosted jobs green at final head. |
| S7 | R7 and integrated adoption proof; ADR-002, TP-001 | S2–S6 | Rebuild embedded codegen assets; regenerate installed parity fixtures; run focused regressions, boundary gates, typecheck/build, Chromium and installed generator parity. Re-review final diff, refresh source-pinned evidence and check current hosted matrix. |

S1 precedes semantic code changes so tightening and cancellation do not silently
contradict the operative contract. S2/S4 and CI diagnosis can proceed independently.
No separate tracker is selected. The owner selected latest Sol for planning and
review and Luna for analysis, implementation and monitoring.

## Execution Contract

The owner authorized S1–S7 implementation, review, tests, commit and push to
`codex/typed-api-adoption` for another Claude review. This does not authorize
closing review comments on Claude's behalf or claim merge/publication.
Ordinary investigation belongs within each slice; unresolved contract conflicts
must be settled before dependent runtime changes. No merge while R5 design or R6
failures remain unresolved. A separate independent re-review should see the final
diff and dispositions before merge.

No token budget or spending ceiling was supplied; estimates and prior token usage
are unknown and this environment supplies no enforceable monetary meter. Do not
invent a budget or broaden work to deferred OA-F1–3/release/production-host gates.

## Validation Plan

- Extend existing `tests/access-adoption.test.ts` and isolated Python probes;
  cover both generated sync and async clients. Matrix R1 over both booleans and
  ordered status combinations: all applied, valid refusal/rollback, leading
  unattempted, middle gaps, resumed work after refusal, unknown in atomic mode,
  and missing refusal in atomic failure. Preserve exact input order and key.
- R5 must prove observable cancellation behavior and per-invocation uncertainty,
  including two simultaneous writes. Cover Python3.11 and every interpreter in
  the claimed supported CI matrix. Do not qualify untested versions.
- Run the existing adoption-focused suites and Python typing positive/negative
  corpus, `bun run typecheck`, `bun run build`,
  `bun run check:access-boundaries`, `bun run test:access-boundaries`,
  `bun run check:unified-client-boundaries`, extension-package audit and the
  adoption Chromium/installed-generator checks documented in the execution record.
  Preserve negative controls; do not widen scanner baselines to turn gates green.
- Regenerate embedded generator assets and run their drift check. Record exact
  commands, tool versions, source hash, changed fixtures and failures in a fresh
  evidence packet. Re-run affected hosted Python/native jobs after the final push;
  local synthetic transports cannot replace native CI.

## Risks and Rollbacks

| Risk | Response | Rollback / containment |
| --- | --- | --- |
| Uniform batch rule rejects existing atomic preflight responses | Amend contract first and publish host migration examples; test explicit refusals and actual rollback independently. | Revert the rule and corresponding contract amendment together; do not fabricate effects or relax atomic guarantees. |
| Cancellation fix loses the attempted key or breaks timeout/TaskGroup | S1 prototype and S5 behavioral gates before adoption; retain original cancellation and per-call uncertainty. | Keep PR unmerged if no design passes; never mask with uncancel or retry. |
| Native CI failure is obscured by generic SessionError | Reproduce with pinned dependencies and safe underlying-cause diagnostics; compare exact base/head. | Isolate minimal repair or upstream dependency correction; do not skip native assertions. |
| Source and embedded generator diverge | Rebuild and verify complete generated bytes and installed behavior. | Revert generated assets with their source change. |

## Continuation Evidence

Planning revision1: reviewed head and sources above; probes completed for R1, R2
and R5; one log per failed CI family plus the historical lint baseline inspected.
No S1–S7 remediation is complete. Next action on implementation authorization is
S1 contract/prototype work, with S2/S4 and S6 diagnosis independently available.
Record completed slice IDs, new source pins, exact checks, remaining decisions and
next action here on interruption. Preserve prior evidence as historical.

### Authorized execution

S1 selects original-cancellation propagation with append-only per-exception
uncertainty and the plural `write_outcomes_unknown` inspection helper. Displayed
cause/context traversal preserves every invocation without task-global state.
Timeout translation retains the cause; TaskGroup suppression and gather replacement
require callers to capture the original inside the child. CONTRACT-079, SD-033,
US-092, TP-001 and the host guide now carry this decision and the uniform batch
stopping rule. The [remediation evidence](evidence/typed-api-remediation/README.md)
owns final source pins, verification results, CI diagnosis and remaining work.

## Exit Criteria

Plan readiness: every review comment has a disposition, rationale, bounded work
and validation gate. This document meets that planning boundary. Execution exit
requires all of the following:

- [x] S1 semantic decisions are reflected in governing contracts and acceptance criteria.
- [x] R2 is fixed; R1 and R5 pass their approved behavioral matrices.
- [x] R3/R4 migration guidance and regression coverage are complete; intentional semantics remain explicit.
- [x] Earlier Codex fixes and R7 boundary protections remain verified.
- [ ] Every current CI failure is diagnosed and repaired; affected jobs and required PR checks pass at the final head.
- [x] Fresh portable/browser/installed evidence and final independent review are recorded, with no claim of deferred host/release qualification.
