# Shared non-temporal read conformance tooling

This repository-only package is outside `src/umf_access` and is not shipped in
the runtime wheel. It supplies exercising assertions for STP-087/088, never
native authority, an adoption packet or a replacement native witness.

Implement `ReadFixture.open(case)` as an owned context manager. Yield a
`ReadWitness` containing the actual `TrussTarget` or `AshlarTarget`, its real
compiled `ReadPlan` and arguments. Supply reference rows from the engine's
independent read path at the same original pins, expressed in the catalog's
result shape. Do not derive that reference by calling the SDK under test.
The context must close its native fixture on assertion failure as well as success.

For refusal cases the owner installs the real engine fault in `prepare` and
names the actual exception type. `reads.withheld_rows` specifically requires a
fault after fetch and before closing/release. Alias cases require actual rename
and name-repointing witnesses, separately. An exception or missing fixture is
never converted to success or an empty result.

For continuation, supply a real first-page plan with a declared cursor and
at least one continuation, then change the publication/retention/policy in
`prepare`. Supply an independent fresh-page reference after the transition.
The suite checks stale continuation refusal and a new read without that token.
A target that refuses snapshot paging cannot qualify this case using a fake page.

```python
from conformance import run_read_suite

# native_fixture is constructed by the engine's owned native harness.
# This runs the three read cases required by STP-087 AC1; it does not claim
# Truss action/bulk or Ashlar publication/continuation coverage.
run_read_suite(
    native_fixture,
    cases=(
        "reads.parity",
        "reads.refusal_not_empty",
        "reads.pin_mismatch",
    ),
)
```

| Cases | Exercised mapping | Owner-native obligations remain |
| --- | --- | --- |
| parity, pin_mismatch, refusal_not_empty | US-087-AC1 | Original read-path equality, installed pins and statement witness |
| parity, empty_complete | US-088-AC1 | Resolver parity and independent complete status |
| refusal_not_empty | US-088-AC2 | Replaced snapshot and expired retention, each run separately |
| alias_renamed, alias_repointed | US-088-AC3 | Two actual alias mutations |
| withheld_rows | US-088-AC4 | Native replacement after fetch/before closing |
| continuation | US-088-AC5 | P1/P2, retention and policy transitions, each run separately |

`run_read_case` succeeds only after all its assertions run; `run_read_suite`
returns only the requested completed case names. Do not promote a subset to
whole-story completion. Action/bulk/preview/replay, lexical write refusal,
Ashlar's no-executor static/runtime controls and temporal value qualification
remain separate cases. Temporal qualification remains **HELD**.

Run the suite selftests with the pinned installed runtime and native Weft
compiler available, from repository root:

```sh
python -m unittest discover -s python/umf_access/tests/conformance_selftest -v
```

They compile the retained original engine request with actual Weft and exercise
all eight shared cases against a correct fake target; nine deliberately faulty
targets must each fail. These are suite-detection tests, not engine/native E2Es.

The repository-only `qualification_packet.py` validates `umf.access-adoption/1` packets.
Its caller supplies independently selected exact `nativePins` and a loader for
SHA-256-addressed JSON receipts. Pins include `engineVersion`, `adapterVersion`,
`runtimeAbi`, `weftVersion`, `bindingVersion` and `catalogRevision`; add wheel,
source and environment digests for the cohort being qualified. Packet engine,
adapter and ABI metadata must agree with those pins. Each evidence entry names
`kind` (`conformance` or `engine`), `case` and `receiptSha256`; its receipt repeats
`kind`, `case`, exact `pins`, and `status: "passed"`. Duplicate entries, duplicate
JSON members, missing receipts, changed bytes, failed/skipped results and pin
drift refuse qualification. Unknown extension content is retained untouched.

Qualification scopes are explicit: `reads-non-temporal` cannot qualify actions,
bulk or the complete adapter. Ashlar's scope requires all eight shared read
cases, no-executor controls, and the separate native replacement, retention,
alias and continuation transition witnesses. `complete` additionally requires
the story's temporal evidence and refuses while `temporalQualification` is
`held`. The checker verifies custody and coverage, not the truth of a receipt
or engine authority. Its synthetic receipt tests do not qualify either engine.
Run those controls with `python -m unittest discover -s python/umf_access/tests
-p test_adoption_packet.py -v`.

`actions.py` supplies seven shared original-protocol cases for STP-087 AC2–5
and AC8. An engine-owned `ActionFixture` yields independently named subject,
commit/no-op, replay and preview scenarios. Each scenario supplies the actual
executor, source-bound action and input, an independent native reference, and
native attempt/durable-state observations. The suite uses the public action
endpoints and compares complete original JSON, transport, recovery custody,
receipts and Key inventories. It checks one dispatch, no implicit retry,
precommit rollback effects, exact failure/retention classification, replay
without a new evaluation, pre-admission TOKEN_REUSE, and preview completeness
without admission. Fixture cleanup must run on failure.

The action selftests detect nine deliberately wrong targets. Those tests prove
the assertions can fail; they supply no native admission or invocation
authority. Truss must run the suite using its supported protected production
ports and retain the separate witnesses required by STP-087. Bulk control and
lexical-spelling cases remain separate from these seven action cases.


`bulk.py` supplies the repository-only `bulk.seal_submit` and
`bulk.control_recovery` assertions for STP-087 AC6. The engine fixture supplies
its actual public host plan, issued attempt, original seal and stable submission
key. No replacement manifest union, capability issuer, worker or execute API is
added to the shipped SDK. Each case requires the complete named scenario set:
seal/submit success, refusal and TOKEN_REUSE, plus known noncommit and unknown
ACK before a job reference exists. Missing, duplicate or unknown cases fail.

Owner extractors must return complete original immutable result bytes, native
recovery custody and job references. Independent native boundary observations
provide exact dispatched request objects, mutation-attempt counts and SDK control
write counts; these must not be inferred from the SDK convenience result. Seal
success must also use original seal inspection. Unknown recovery delegates the
same recovery object, preserves complete retained bytes and custody, and leaves
native attempt count, graph/control state and SDK control writes unchanged.
Fixture cleanup runs even when assertions fail.

The bulk selftests exercise all ten scenarios and detect twenty-six deliberately
faulty plans, including changed attempt/seal/key, implicit retry, dropped unknown
fields, changed result class, refusal-as-success, noncommit-as-conflict, lost
recovery, invented job, bad seal inspection, exposed execute, missing scenarios,
recovery mutations and SDK control writes. These are synthetic assertion tests.
Protected Truss manifest-plan integration and the separate twin-store native
witnesses remain required; this tooling alone qualifies no host implementation.

Bulk original-discriminant hooks must read engine result tags, not infer outcomes from scenario names. Every expected native attempt delta must be exact integer zero or one; the suite measures before/after even when the counter starts nonzero. Unknown ACK cases require an owner-bound fresh mutation probe using existing issued custody: original typed refusal, no new native attempt, no SDK write, no durable graph/control or custody change, followed only by original recovery. These exercising controls detect an always-refusal fixture, arbitrary expected retry counts and fresh mutation despite unknown custody.
