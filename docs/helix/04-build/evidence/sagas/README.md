# Saga implementation qualification

This packet accompanies [PR #74](https://github.com/DocumentDrivenDX/umf/pull/74)
and the [implementation plan](../../saga-implementation-plan.md). It records
portable implementation, native reference-consumer observations and independent
Sol review. PR #74 is merged and the SDK/Python releases are public. Frozen CI,
public-byte verification and both public PyPI installed-consumer runs passed.
The release receipt records the exact run and artifact identities. This evidence
does not qualify a production hosting service.

## Portable and installed artifacts

The independent corpus has 19 vectors, with static expected diagnostics and
identities. It passes in Bun/N-API, actual Chromium/WASM, the native CLI and an
installed Python wheel. JSON/YAML exchange retains unfamiliar recovery and native
content; returned-source mutation does not change the caller or later inspection.
All operations share the Rust implementation; no TypeScript semantic evaluator
was added. Assessment always returns `executionVerified:false`.

The public SDK 0.10.0 archive passes the existing 139 consumer cases and all 19
saga vectors through its installed public facade and bundled WASM. The Python
0.10.4 wheel selected for publication passed all 19 vectors and 35
resource-integrity tests in Linux CI. Its source archive rebuilds with node, bun, npm and npx explicitly blocked; that installed
rebuilt wheel also passes the 19 vectors. SDK 0.10.0, Python 0.10.4, core 0.10.0
and action/saga vocabularies 0.1.0 remain coupled by `spec/release.json`.
Independent comparison confirms the three published PyPI distribution bytes
match the reviewed build. The public PyPI macOS installed-consumer run passed all
19 vectors on a fresh package installation.

Shared-codegen and wire regression passes 121 Rust tests. Existing native action
regression passes 125 tests and 1,993 assertions; the portable action regression
passes 63 tests and 512 assertions. These results are scoped regression evidence,
not a claim that every existing UMF adapter is completely implemented.

## Native scope and review

The profile uses Bun 1.4.3 and three isolated databases in one UUID-owned
PostgreSQL 17.9 container: coordinator, action provider A and action provider B.
Actual SQL server version, Docker image ID/RepoDigest and container identity are
captured in `.cache/saga/provider-platform.json`. Both recipe and isolated-handler
native action paths are exercised. The public protocol tests cover complete
reservation/allocation, longer reverse unwinds and exact typed-output reuse.

The combined final local native run passes 43 tests with 711 assertions across
protocol, independent oracle, inventory, provider, capacity and component cases.
The individual native component run passes 173 assertions, including
monotonic elapsed-time checks and refusal to invent missing legacy custody. The
provider/capacity boundary run passes five tests with 42 assertions. Hosted CI
run 41091819731 repeated the complete native suite and retained its raw log with
the built artifacts. It passed 43 native tests/711 assertions, the all-host
portable corpus, installed SDK regression and required release checks.

Sol reviewed each acceptance criterion against actual source assertions. The
following is a fresh review allocation against the frozen hosted run. It
does not rewrite the older inventory-only `tests/saga/protocol-coverage.json` or
promote the component receipt's unverified story rows. Those records preserve
their original, narrower purposes.

| US-905 criterion | Reviewed witness and scope |
| --- | --- |
| AC1 | Public success history compared with separately queried provider outcomes, tickets and entity state. |
| AC2 | Native business rejection followed by release: committed, rejected, committed history and compensated state. |
| AC3 | **Composed:** longer descending unwind order plus compensation's native original input containing the exact retained random output. The longer fixture itself does not declare outputs. |
| AC4 | Original execute acknowledgment loss, restart and exact recovery, combined with the live unknown-invocation barrier. |
| AC5 | Authoritative provider remains pending across restart; independent ticket, attempt and outcome observations prevent fabricated noncommit. |
| AC6 | Same-ticket repeated provider delivery returns the original result with no duplicate business outcome/outbox effect. |
| AC7 | Unresolved original admission blocks fresh delivery and later forward/compensation dispatch. |
| AC8 | Per-original lookup and elapsed limits survive restart and retain unresolved tickets. |
| AC9 | Failed compensation stops earlier automatic unwind and exposes intervention with the remaining work. |
| AC10 | Lost compensation acknowledgment recovers its original release outcome after restart; independent native/history oracle checks exact keys. |
| AC11 | Cancellation while the original provider call is live waits for its original outcome before compensating. |
| AC12 | Forward and compensation grants revoked independently after commit; compensation is denied without releasing the native entity. |
| AC13 | Tenant/owner boundaries, current history permission, namespace checks and instance-bound cursors refuse disclosure. |
| AC14 | Definition/binding snapshots resist directory replacement; missing required interpretation durably enters REVISION intervention with custody retained. |
| AC15 | Lease takeover advances the fence; stale workers cannot admit work. |
| AC16 | Declared irreversible native effect remains independently observable and explicit in residual state. External notification adapters remain outside actions 0.1.0. |
| AC17 | Random handler output is produced once, retained through acknowledgment loss/restart and reused by the later action. |
| AC18 | Public issuer resolution and raw immutable audit history retain original ticket/result, actor, service and issuer evidence. |
| AC19 | Expired submission identity remains unavailable across restart; no fresh instance or effect is created. |
| AC20 | Live public histories are checked against independent provider facts; oracle controls reject invented, omitted, duplicate and foreign effects. |
| AC21 | Concurrent equivalent submit and lost submit acknowledgment/restart recover the same original instance/response. |
| AC22 | Changed inputs, revision or trusted binding conflict under the retained key, including terminal and expired instances. |
| AC23 | Definition retirement refuses a fresh submission while the admitted original continues from retained custody. |
| AC24 | **Composed:** saga pre-native refusal enters intervention; existing native handler tests exercise retirement during an admitted transaction, commit, replay and refusal of fresh work through the same executor/store-lock boundary. An afterInvoke observation is not described as a precommit witness. |
| AC25 | Empty-prefix rollback and delayed original delivery create no fresh effect; reverse-prefix unwind and whole-ticket finality are also exercised. |
| AC26 | Complete issuer-bound operator review, exact sequence/cause, pending/stale/foreign refusal and closed history retain actor, disposition, review ID and digest. |
| AC27 | Pending original compensation during failure unwind rejects cancellation; the immutable failure cause and compensated classification remain unchanged. Source checks the cause before phase, including reconciling. |
| AC28 | Portable early irreversible barriers diagnose SAGA_PIVOT and native state discloses residual irreversible work. |
| AC29 | Incompatible duration/erasure admission refuses; tighter lookup, clock and retained-capacity limits persist across restart. |

Witness source is in [public protocol tests](../../../../../tests/saga/protocol.test.ts),
[provider/capacity tests](../../../../../tests/saga/provider-boundary.test.ts),
[native component tests](../../../../../tests/saga/native-recovery.test.ts) and the
[independent oracle](../../../../../tests/saga/history-oracle.test.ts). AC24 also
uses `tests/actions-reference/handler-executor.test.ts` tests titled “retirement
during an admitted native handler” and “native catalog retirement waits for
admitted handler commit”. The protocol delegates to that same qualified executor;
its reserved invocation lane adds custody enforcement before commit.

## Custody and limits

Original ticket keys use the admitted ASCII namespace and are persisted before
worker release. Execution, recovery and evidence verification consume the retained
key. Unicode/slash tenant and principal identities execute across restart with
one matching original provider outcome. Missing legacy namespace/key custody
refuses initialization with `SAGA_CUSTODY`; it is never reconstructed as a fresh
business identity. No legacy-state migration is qualified.

Mutating controls reserve count and worst-case response/recovery storage before
capability issuance. Completion retains the exact response and refunds only its
unused control reservation, atomically and at most once. Original in-flight ticket
custody is retained. Automatic admission/lookup/time exhaustion durably records
intervention, preserves the first cause and never proves native noncommit. An
observed clock rollback also stops automatic work. Authorized operator resolution
can import retained original issuer evidence after automatic budgets expire;
it neither renews those budgets nor resumes automatic work.

The bounded TLA+ model still has 43 passing transition checks and seven rejected
evidence-tampering controls. The final core-schema change only removes compiler
provenance derived from an accidentally inventoried, untracked CLI binary. The
model and transition semantics did not change; source pins were repackaged, not
reinterpreted as new native proof. Historical accounted companion bytes/pins stay
unchanged. The narrowly scoped provenance normalization rejects semantic changes.

`Saga qualification` CI checked the exact PR head, ran the frozen native suite,
built native/WASM/SDK/Python artifacts, tested installed consumers and rebuilt
the source archive without JavaScript tools. Its collector refuses dirty source,
stale corpus reports, mismatched SDK installation custody or a different installed
wheel. Retained archives and hashes were the publication inputs; SDK 0.10.0 and
Python 0.10.4 are now public and their downloaded bytes were independently
verified. The public PyPI macOS 19-vector consumer run and publisher workflow
41094344167 passed. The run, release and hash evidence is recorded in
`release.json`, and Sol confirmed the final evidence allocation.
