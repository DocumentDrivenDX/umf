---
ddx:
  id: US-092
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-033
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-092: Generate and use a portable ontology client

**Feature:** [FEAT-033](../features/FEAT-033-generated-ontology-access.md).
**Feature Requirements:** OA-02/06/07/08/10/11/12/13/14/15/16/17/18/19/20/21.
**PRD Requirements:** FR-56. **Priority:** Release priority unassigned.

## Story

**As a** Application Developer, **I want** to generate, check in and use a typed
ontology client through an injected conforming binding, **So that** my plugin
runs unchanged across hosting modes and reports unsupported or uncertain results
without depending on an execution framework.

## Context

The developer starts with the reviewed description from US-091. The portable
plugin uses an async convention even when its backend implementation is synchronous;
the consumer binding owns that adaptation. Generated code has no connection,
authorization or effect-evaluation authority.

## Walkthrough

1. The developer generates models and a typed query/action client from UMF.
   They compose reads directly; no decorated wrapper or parameter declaration
   is needed to execute a query.
2. They construct a typed Solution key and invoke ChangeCoverage through the
   injected binding, then request a read meeting the returned consistency token.
3. They run the same plugin source against the test fake and the host/worker
   arrangements they intend to support.
4. They check the generated package and commit it through their ordinary workflow.
5. After a schema change they regenerate, inspect the compatibility report and
   fix affected call sites using the pinned type checkers.

## Acceptance Criteria

- [ ] **US-092-AC1** — Given a valid description, when Python output is imported
  in isolated Python 3.11, then the package works with only the standard library
  and exposes the selected typed models, action methods and transport protocols.
- [ ] **US-092-AC2** — Given positive and deliberately invalid plugin call sites,
  when pinned pyright, mypy and ty check them, then valid code passes and wrong
  entity keys, argument types, field filters and unselected operations fail,
  without generated suppression comments.
- [ ] **US-092-AC3** — Given absent, explicit null and exact numeric/temporal
  values, when supported codecs encode and decode them, then no distinctions
  or precision are lost and unsupported conversions refuse.
- [ ] **US-092-AC4** — Given the same async plugin source, when it runs against
  local-sync, local-async, remote-sync and remote-async backend arrangements,
  and table/ontology storage, then the imported client and call sites remain
  unchanged for supported operations. Unsupported capabilities fail explicitly.
- [ ] **US-092-AC5** — Given fixed-code business failures and a lost write
  response, when the binding reports them, then typed business refusals remain
  distinct from uncertain commitment and no automatic write retry occurs.
- [ ] **US-092-AC6** — Given paged reads with an at-least token, when the binding
  handles valid, foreign and expired cursor/token scopes, then valid reads obey
  the described semantics and rejected consistency is never returned as success.
- [ ] **US-092-AC7** — Given bounded action batches and replay keys, when a
  conforming binding executes them, then atomicity, ordered partial settlement,
  limits and durable replay behavior match the advertised contract.
- [ ] **US-092-AC8** — Given identical build inputs or malicious source names,
  when clients are generated offline in Bun and Chromium, then accepted outputs
  are identical and names cannot execute code, access networks or escape output
  ownership; collisions refuse explicitly.
- [ ] **US-092-AC9** — Given checked-in output, when checking or regeneration
  encounters a byte change, deleted file, extra owned file or failed replacement,
  then drift is detected and previous output survives without overwritten edits.
- [ ] **US-092-AC10** — Given a mismatched running module or unsupported wire
  version, when a client attempts a call, then it fails before effects and never
  treats matching identity as authorization.
- [ ] **US-092-AC11** — Given a description and claimed binding, when the shared
  conformance suite runs against the fake and that binding, then reports keep
  their separate identities and unsupported cases cannot count as passed support.
- [ ] **US-092-AC12** — Given the same description supplied to both language
  targets, when Python and TypeScript clients exchange admitted vectors, then
  decoded meanings agree and target-specific unsupported forms refuse explicitly.

SD-033 describes the shared interface and generated value handling.

## Edge Cases

- Response loss after commitment: preserve uncertainty and invocation custody;
  the caller must not receive a proven rollback without positive evidence.
- Cancellation during partial batch: distinguish completed, unknown and
  unattempted items; do not report the whole batch as rolled back.
- Advisory validation passes before state changes: apply still may refuse.
- Current Hohfeld conversion cannot preserve a portable value: mark the binding
  unsupported until corrected; fake success cannot override that result.

## Test Scenarios

| Scenario | AC ID | Input / observation |
| --- | --- | --- |
| Typed action | US-092-AC1/2 | ChangeCoverage with Solution key succeeds; UseCase key or integer level fails static checking |
| Exact/presence values | US-092-AC3/12 | Missing versus null; integer 9007199254740993; decimal 12.50; timestamp with nine fractional digits: preserve or explicitly refuse |
| Hosting switch | US-092-AC4 | Same plugin source uses four backend/placement arrangements with injected bindings |
| Failures | US-092-AC5 | Named precondition refusal versus commit followed by response loss: distinct typed observations, no retry |
| Cursor/token scope | US-092-AC6 | Cursor from another filtered list and token from another issuer: reject without stale-success fallback |
| Bounds/replay | US-092-AC7 | 101 items against maximum 100: no effects; repeat retained key: same terminal outcome |
| Output custody | US-092-AC8/9 | Malicious identifier, edited client and injected interrupted writer: explicit refusal, previous package intact |
| Identity | US-092-AC10 | Change expected source identity before apply: mismatch with zero effects |
| Binding correctness | US-092-AC11 | Fake passes, consumer cannot preserve null: the consumer test fails |

## Dependencies

US-091, FEAT-033, FR-56 and [SD-033](../../02-design/solution-designs/SD-033-generated-ontology-access.md).
Run the same plugin and binding assertions in all four hosting/backend
arrangements. Tests cite their exercised acceptance criteria.

## Out of Scope

Production transport/backend implementation, credentials, grants, storage,
execution engines, audit, migrations and changes to the existing table SDK.
