# Historical certification work log

These intermediate revisions, counts, pending states and interrupted captures are superseded by actions-certification.md and its machine-readable certificate. They are retained as historical work evidence, not current qualification claims.

# Action certification work — 2026-10-09

Status: **in progress; not certified**. The companion machine-readable
`actions-certification.json` maps all 21 action criteria to hashed witnesses and
keeps `certified: false` while the full core gates are pending. The owner requested a persistent goal to
resolve issues until all in-scope gates pass. Scope defaults to UMF action metadata,
core regression prerequisites, and the PostgreSQL reference consumer. Downstream
Truss/Ashlar/TableSpec adoption remains outside this scope unless requested.

Authority: CONTRACT-052/053, US-055/056, TD-055/056 and STP-055/056. Their draft
status remains unchanged; passing execution evidence does not imply human approval.
The earlier SMT/TLC/SQL/history probes remain bounded design evidence. They do not
replace the library and executor acceptance witnesses.

## Current implementation evidence

### Final audited native capture (core gates pending)

After the final requirements audit, the complete native inventory passed
**119 tests / 1,946 assertions / zero failures** on Bun **1.4.2** and PostgreSQL
**17.9 (Debian 17.9-1.pgdg13+1)**. Both TypeScript configurations and the regenerated
traceability ledger pass. The qualifier held **825 captured input hashes** stable;
independent recomputation found zero mismatches against both the working tree and
frozen replay checkout. The approve, create/link, composite-Key, Association-Record,
DDD, shared-case and graph-oracle fixture bytes were separately checked against
that checkout; their additional lineage is retained in
`/private/tmp/umf-actions-final-fixture-lineage.json` for final certificate assembly.

The final synthetic replay commit is
`083c6fdd23dc055cf6e98fdb11e06b826048a7ab`. Fresh preparation passed; all 174
native/browser commands are being executed anew. The preceding interrupted capture
at 0bd6f155 retains 50 successful recorded commands, but contributes no command
credits to this run. Its browser child was allowed to exit before the owned replay
was stopped; unrelated containers were untouched. Final auxiliary, disjoint full
regression, publication, evidence-integrity gates and certificate assembly remain
pending. The goal is active and this artifact is not a completed certificate.

The reviewed targeted composite/refusal run passed **2 / 51**; independent review
confirmed complete typed inputs, the admitted supported control, all 20 native
statement guards, exact unchanged rows and no protected business reads. The earlier
2/45 result is historical. Astra's final requirements audit found no further
concrete bounded-profile witness gap.

### Latest frozen whole native reference capture

This capture is historical pending the final requirements-audit additions. Astra
identified explicit missing actual-native composite-Key invocation/replay and
unsupported Association-Record/owned-lifecycle refusal witnesses. These are being
added before a fresh capture. The earlier 117/1,894 run remains valid evidence for
its recorded inputs, not a current complete acceptance claim. The replay at
0bd6f155 was stopped at a safe child boundary and will be retained as historical;
no partial commands will be credited to the replacement capture.

The complete reviewed reference test inventory now passes **117 tests / 1,894
assertions / zero failures** on Bun **1.4.2**, PostgreSQL **17.9 (Debian
17.9-1.pgdg13+1)**. The qualifier checked its **824 input hashes** before and after
execution and held source stable. An independent Python SHA-256 recomputation
found **zero mismatches**; all 824 inputs also match the staged core replay
checkout. `fixtures/actions/reference-foundation.json` retains exact runtime,
image and input identities; `umf-actions-final-frozen-native.log` records the
passing summary. The report deliberately retains its foundation profile scope;
final criterion certification requires the separate complete core regression
and evidence gates, rather than treating the test count as universal correctness.

The fresh owned replay checkout is frozen at synthetic commit
`0bd6f1550e8205670ca686a50f83868616658f75`. Its preparation passed using image
`sha256:1ad9fcd7156f59b0e8f5965abf48f90690471ee828929dae4c77921955868249`.
The full native/browser inventory is running anew; no interrupted earlier commands
are credited to this capture. The working branch has no new commit or PR.

### Latest semantic review closure (partial evidence)

The final requirements audit found two missing actual-native witnesses despite
previous green totals: composite-Key invocation/replay, and explicit unsupported
owned/Association-Record admission. `composite-key.test.ts` now passes **2 tests /
45 assertions** on PostgreSQL 17.9 and Bun 1.4.2. Two reversed same-family tuples
select distinct native entities; preparation/freeze retain ordered identities,
independent resource versions, typed changes and exact restarted replay. Valid
owned and Association-Record metadata refuse at the specific preparation boundary,
and actual native statement guards plus intercepted business access prove zero
business access or transactional writes during preview/invoke refusal. This is
bounded profile refusal, not support for these unqualified layouts.

The fixed owned `store.sql` schema and its known guards are qualified; ordinary
outside writers and administrator-added business triggers remain explicitly
outside TD-056's configuration. Existing delete witnesses refuse remaining-link
constraints rather than inventing unlink/cascade effects. No generic detection of
arbitrary added database triggers is claimed.

Astra's whole-profile review identified malformed selector string wrappers,
non-BMP expression length admission, inconsistent malformed lookup responses and
an unpublished token horizon. The first three are repaired in the actual library
and consumer. CONTRACT-053 and TD-056 now publish namespace-lifetime recognition;
expiry never permits time-based token reuse.

The targeted corpus and native lookup/expiry run passed **3 tests / 17 assertions**
(`umf-actions-final-static-horizon.log`). Original and changed intent after expiry
return TOKEN_EXPIRED through a fresh consumer without changing business state,
terminal records, audit, outbox or control. A malformed lookup refuses PARAMETER
before authentication or native SQL. The latest portable subset passed **22 tests /
85 assertions**, including the exact 65,536 UTF-16-unit boundary and over-bound
non-BMP strings for opaque selector languages. TypeScript checks passed. Real
Chromium **153.0.8010.12**, Playwright **1.63.0**, Bun **1.4.2** passed parity for
three fixtures and **29 shared cases**, with no external requests; exact inputs
are hashed in `fixtures/actions/browser.json`. These are partial witnesses,
not the final frozen whole-suite certificate.

The independent bounded native refinement checks passed **216 histories / 648
transitions**, with original-implementation controls and three actual consumer
mutations (replay suppression, authorization bypass and audit omission). Typed
semantic mismatches, rather than execution errors, identify kills; a separate
runtime-failure negative control verifies that distinction. Native receipts and
resource stamps are checked independently. Formal refinement plus reader
revocation passed **4 tests / 24 assertions**. Reader witnesses establish native
lock blocking, completion of an admitted protected read, and no protected SQL
after revocation. Conservative evolution comparison passed **2 tests / 57
assertions**, preserving selected action array position, model/profile context
and unknown content while explicitly leaving compatibility unproven.

The prior broad action run passed **166 / 2,801** before the latest source changes;
it is historical, not current-source certification. The isolated core replay was
intentionally stopped after 80 successful native commands while browser command
81 was starting. Its exit 137 is an interrupted run, not a passing core gate.
The promised alias/prefix mutations are now executed: the actual PostgreSQL
17.9 / Bun 1.4.2 witness passed **1 test / 6 assertions**, detecting both copied
consumer defects after passing original histories. Native primary/alternate
aliases establish one physical entity independently of frozen-frame canonical IDs.
Two disjoint native updates establish that event2-only delivery must retain prefix0
and pending visibility; the mutant exposes prefix2 with incomplete content. Runtime
errors and unrelated mismatches cannot qualify as kills. Source and mutant hashes,
exact observations and scoped counterexamples are in
`umf-actions-invariant-mutants-first.log`; Astra's independent review found no
vacuity or false-positive issue.

The complete explicit portable action inventory now passes **51 / 295**. All
**351 JSON Schemas** pass their audit, both TypeScript configurations pass, and
the regenerated **463-criterion** traceability ledger passes **2 / 639**. These
counts describe separate executed gates; ledger classification is not execution
certification. The source-frozen whole native capture and fresh full core replay
remain required.

### Durable launcher and Linux runtime qualification increment

The host launcher/security subset passed **19 tests / 198 assertions** with
resolved Unix endpoint and daemon pinning, reviewed program snapshot and immutable
owner-specific acknowledgements. Astra independently reproduced closure of the
snapshot and stale-owner findings with isolated mocked transport/filesystem probes;
those probes are not independent native Docker evidence.

Pinned Linux Bun 1.3.14 exposed two qualification failures. A real streamed
`pg_dump` produced an ArrayBuffer from `Response.bytes()`; explicit
`new Uint8Array(await response.arrayBuffer())` restores the binary contract, and
the actual physical restore witness then passed. The delayed-START test's HTTP
attach transport still failed. An attempted raw socket replacement also failed
host and Linux controls and was reverted. The original native HTTP fault proxy
passes **4 / 40** on Linux Bun 1.4.2 (`umf-actions-linux-http-bun142.log`). Project
and replay tooling now pin Bun 1.4.2. Earlier failed attempts remain historical
evidence, not qualified execution. Fresh whole-suite capture remains required.

### Source-frozen projection/restore/process foundation snapshot

The reviewed full native action capture passes **104 tests / 1,747 assertions**
with **815 input hashes**, source-held-stable confirmation and independently
recomputed **zero mismatches**. Command: `bun scripts/actions-reference/qualify-foundation.ts`;
log: `umf-actions-projection-restore-foundation.log`; report:
`fixtures/actions/reference-foundation.json`. Runtime: Bun 1.4.2,
PostgreSQL 17.9 and the immutable Node 24.20.0 handler image. Strict library/tooling
types and exact portable/traceability files pass **52 / 926**. This remains scoped
foundation evidence, not whole-profile certification. Subsequent governed test-plan
pointer updates and the pending delayed-daemon remedy will require a fresh capture.

Core replay preparation uses an owned disposable checkout with a synthetic source
snapshot commit to satisfy the installed runner's clean-source guard. No user
worktree commit was made. The prior uncommitted-overlay preparation was refused
by that guard; no core pass is claimed from it.


### Reviewed native projection, restore and process-recovery increments

Astra Ultra identified and closed independent authorization namespace collisions,
malformed retained projection refusal, stable receipt-scope codes, backup-era
authority revival, and a both-endpoint unrelated Record orientation defect. Pure
review probes remain separately scoped; no independent Docker review is claimed.

Native projection/attempt witnesses passed **18 tests / 209 assertions**
(`umf-actions-operational-namespace-final.log`): independent operational grants,
full baseline with untouched fields/links, all five primitive changes, reordered
duplicate delivery, per-view prefixes, actual atomic queue rollback, exact opaque
receipt lookup under forced digest collision, and exact unknown-fact retention
without advancement through its sequence. This snapshot predates later restore
changes; it is historical targeted evidence pending the new frozen full capture.

Owned PostgreSQL 17.9 `pg_dump`/`pg_restore` revealed a real unqualified digest
function schema failure; `public.digest` fixed actual restore. Restore witnesses
then passed **3 / 50**, and restore/process witnesses **5 / 93**. The strengthened
restore/graph suite now passes **6 / 75**
(`umf-actions-restore-orientation-final.log`), including restored authority refusal
until explicit reconciliation, irreversible fences across restart/rotation, every
restored business/admin namespace, fresh label/UUID namespace genesis, linked
required-degree topology, exact alternate aliases, and atomic invalid-domain,
corrupt-primary and both-endpoint orientation refusal without source repair.
Intermediate failures from invalid test fixtures (mutable alternate Key, shared
Field ownership and missing Reference role) were corrected with independently
valid core documents; they do not qualify the earlier unsuccessful runs.

An actual owned Bun command process was killed after native candidate writes but
before COMMIT, and after native COMMIT acknowledgement but before public result.
Independent SQL observed rollback in the first schedule and one durable commit
in the second. A third Bun process used a fresh trusted issuer and replayed the
exact independently retained result; no additional business/audit/outbox/receipt
sequence was allocated. Initial native witness passes **1 / 37**
(`umf-actions-command-process-recovery.log`); subsequent strengthening directly
asserts persisted approved business fields. This is application process death,
not physical database network packet-loss or full host death certification.

All new restore/projection code remains host-only. Current strict library/tooling
types pass. Whole-story qualification, complete mutation/refinement evidence,
delayed-daemon races and fresh repository/core native/browser gates remain open.


### Projection receipt foundation qualification increment

Native receipt, store, preview and recovery witnesses pass **13 tests / 200
assertions**, with strict tooling types passing. Exact immutable native receipt
mappings cover genesis sequence zero, changed commits, and no-op/replay identities;
preview allocates none. A late native audit fault rolls back the tentative mapping
with business/outcome/outbox state. Native receipt and outbox rows refuse every
field mutation and deletion. Facts now carry `umf.actions.native-facts/1`.
Astra’s independent pure mapping probes find no regression; projection content,
contiguous delivery and physical restore qualification remain unfinished. This
increment postdates the 809-hash journal snapshot below.

Core replay input discovery now includes untracked nonignored source/test/schema
files with lossless NUL-delimited Git inventory. The previous cached-only inventory
omitted this worktree’s new action implementation; fresh qualification must include
it. No existing proof hashes were manually refreshed.


### Reviewed attempt-journal foundation snapshot

The fresh source-frozen native capture passes **90 tests / 1,542 assertions** on
PostgreSQL 17.9 and Bun 1.4.2. Its **809 hashes** were held stable during execution
and independently recomputed with **zero mismatches**. The broader action and
traceability regression passes **142 tests / 2,466 assertions across 37 files**;
Bun’s actions-path filter includes native reference tests. Both strict library and
host-tooling typechecks pass. The native crash witness now confirms SIGKILL and
acknowledged start persistence. All journal review blockers are closed in the
reviewed scope; general crash/network schedules and full US-056 remain open.

The separate current core acceptance audit passes **6 tests and fails 11 tests /
81 assertions across 8 files**. The executable cardinality round-trip matrix passes;
remaining failures include incompatible historical browser pins, unsafe historical
absolute proof paths and stale source revalidation. These are actual failed gates,
not waived certification. Refresh requires logged native/browser execution and
publication for the current source, not manually changing old proof hashes.


### Independent attempt journal — implementation under qualification

The reference policy is explicitly best-effort observation durability: an
acknowledged append is durable, unavailable appends can be missing, and a start
without completion is unresolved supervisor knowledge. It uses independent
immutable started/observed records; it does not change terminal atomicity or claim
infallible logging through outages or host death. TD-056 records the exact timing,
retention and operational reader scope.

The first reviewed native audit/recovery/journal run passes **20 tests / 304
assertions**. It includes distinct retry IDs, post-commit injected uncertainty
paired with the terminal audit ID, SQL logging failure isolation, actual late native
rollback, the request-copy race, independent header/detail grants, irreversible
visibility retention, unknown-header refusal, a coordinated late insertion race,
native lock timeout with async failing diagnostics, original rejected-replay and
TOKEN_REUSE attribution, and actual supervisor SIGKILL after start persistence.

Astra found and helped resolve caller mutation before request copying, late
insertion bypassing expiry, permissive/malformed header decoding, unhandled async
diagnostics rejection, omitted original rejection/reuse attribution, unqualified
deployment metadata leakage and malformed details decoding. Final targeted native regression passes **22 tests / 317 assertions**, with strict
tooling types passing. Astra’s independent pure probes confirm all reported blockers
closed; it supplies no independent native Docker evidence. Unknown deployment
content remains exact in revision storage and absent from telemetry, and malformed
authorized details refuse explicitly. The crash witness requires zero unacknowledged
appends before its beacon and now separately asserts the actual SIGKILL signal;
that last assertion and a freshly fingerprinted broad capture remain pending.
These bounded witnesses do not certify full database network-loss recovery,
physical erasure, general host-crash schedules or complete US-056.


### Stable audit-retention foundation snapshot

The fresh native capture passes **76 tests / 1,400 assertions**, PostgreSQL 17.9,
Bun 1.4.2, with **806 hashes held stable** during execution and **zero independent
recomputation mismatches**. The snapshot includes audit access and visibility
retention, catalog, recovery and earlier native witnesses. It remains partial
qualification; the subsequent attempt-journal implementation requires new evidence.



### Audit visibility retention qualification increment

Native audit tests pass **3 tests / 83 assertions**; the combined audit, store and
recovery witnesses pass **11 tests / 215 assertions**, with strict tooling types
passing. These runs use PostgreSQL 17.9 and Bun 1.4.2. Astra Ultra’s source review
and independent 13-case query-order probe found no substantive blocker; that probe
is pure analysis and supplies no independent native Docker evidence.

Trusted operator policy sets the retention duration per store/action family. Each
terminal row pins its deadline at audit insertion using `clock_timestamp()`;
changing policy cannot extend old rows. Authorized access first observes expiry
using the expiry-update statement’s `statement_timestamp()`, persists an irreversible
expired flag, and refuses payload selection for expired rows. Visibility therefore
linearizes at that authorized statement: an admitted read may finish after its
deadline. This is visibility retention, not physical content erasure.

The native witness checks early expiry refusal, later policy changes preserving the
original deadline, expiry observed against the actual native clock, zero header or
result payload selections after expiry, byte-exact preserved content, and refusal
of reactivation or deadline extension. Revoked readers still receive denial before
expiry/existence disclosure. Business sequence and terminal row counts remain
unchanged by retention. The separate header includes the exact native deadline and
its clock profile. General read/revocation schedules, physical deletion if required,
and rollback/denial attempt telemetry remain outside this increment.

The source-stable broad regression preceding this retention change passes **127
tests / 2,297 assertions across 36 files**, with **402 unchanged input hashes**.
It replaces the mixed-source run described below, but predates this retention
increment. A fresh foundation capture is required for the current source snapshot.

### Separately authorized audit reader qualification increment

The host-only `ReferenceActionAudit` defaults to denial. Trusted configuration
sets separate header-reader and detail-reader role lists per native store/action
family. Membership/configuration/read ordering uses the same control lock; invoke
roles and replay discovery confer no audit grant. Reads bind exact family and UUID
and authorize tenant, header permission and requested detail permission before any
protected audit query. Header reads select the separate immutable header, not the
full result column. Missing store, wrong tenant, missing grant and revoked grant
deny without protected row queries. Unknown fields or malformed header encoding
return unsupported/AUDIT_PROFILE while preserving the original native content.

Native audit/store tests pass **5 tests / 103 assertions**, with strict tooling
types passing. The denial witness runs against a native role lacking audit-table
SELECT, both without configuration and with a configured policy lacking caller
membership. SQL instrumentation independently checks zero protected queries on
denial and no details-column selection for header reads. Full-detail permission
reveals stored changes; detail role alone does not replace header authorization.
Different family with the same attempt UUID returns not-found. Revocation and
missing-store/wrong-tenant checks remain uniform. Native unknown/malformed header
sources remain intact. All header/family/identity/revision/store and earlier audit
fields reject mutation. Astra's independent source/pure-config review finds no
reader authorization defect; it does not provide native Docker evidence.

The preceding full regression was invalidated by source edits during its live run:
old loaded executor code met new NOT NULL family schema, yielding 10 null-family
failures. It provides no current qualification; a stable-source rerun is required.
Audit retention, denial/rollback telemetry, general concurrent revocation schedules
and full AC11 certification remain open. Prior fingerprint captures predate this
reader increment.


### Protected terminal audit qualification increment

The immediately preceding stable catalog/recovery capture passes **73 native tests /
1,316 assertions**, PostgreSQL 17.9 and Bun 1.4.2. Its actually stable input
inventory has **804 hashes / 0 independent recomputation mismatches**. That capture
predates the audit changes below and is historical evidence for its own snapshot.

Each execution retry iteration now assigns an executor UUID before its transaction;
terminal audit identity and details use the same attemptId. Details record the exact
`umf.actions.tx/1` profile, accepted revision and terminal result. Trusted session
principal/service, held policy version and optional supplied correlation remain
separate from replay identity. A native append-only guard rejects every audit
UPDATE/DELETE, including no-op updates to protected fields. Retention maintenance
requires a separately qualified path; this increment does not implement it.

Native audit and recovery witnesses pass **6 tests / 117 assertions**, with strict
tooling types passing. The audit witness refuses a caller attemptId, checks native
trusted attribution/profile/id, demonstrates that an unused optional private input
is not copied into the audit, verifies exact replay creates no extra row, and
checks immutable guards plus one business/outcome/audit/outbox durability boundary.
The audit deliberately retains the complete protected terminal result, including
declared outputs and changed identities; the omitted input map does not establish
that values echoed in those outputs are absent. Astra finds no regression in this
partial scope. Separate reader/detail authorization, retention and rollback/denial
attempt telemetry remain required and unimplemented. No whole AC11 certification.


### Durable handler catalog qualification increment

`ReferenceHandlerCatalog` persists operator-published programs and retirement in
PostgreSQL per store. Publication, retirement and fresh admission share the native
store control lock. Database guards enforce exact identity, immutable program,
no retired reactivation and retained rows. Identical reordered program objects
publish idempotently. Fresh invocation/preview read durable active status under
that lock. The admitted capability retains only the selected exact build, and
freezing compares its deployment with the authoritative retained revision.

Native catalog/handler/registry tests pass **9 tests / 209 assertions**. A new SQL
connection and new consumer/catalog objects load a published build, while retiring
it through the original operator prevents fresh invoke/preview through the new
consumer. Retained original replay succeeds; another store remains active.
Reordered re-publication does not reactivate retirement. Actual SQL guards refuse
reactivation, source replacement and deletion. The final native build-substitution
regression passes **1 test / 26 assertions**: a broad registry contains builds A
and B, but mutating prepared deployment to B is refused by the singleton capability
and authoritative freeze before business execution. Astra independently reproduced
closure of both defects using pure helpers. Strict tooling types pass.

These are restart-of-consumer/new-connection witnesses, not complete process-crash,
rolling-upgrade or operator authentication/retention qualification. A native controlled retirement/commit race additionally passes **1 test / 10
assertions**: after the authenticated READ gateway beacon, actual pg_stat_activity
shows the operator retirement blocked on the store control lock. The accepted
build commits before retirement completes; fresh work then refuses and original
replay remains exact, with one outcome/audit/outbox. Astra's source review confirms
lock attribution within this isolated two-operation server. General rolling-upgrade
and failure schedules remain open. Earlier fingerprint captures
predate this increment and must be regenerated before certification.


### Transaction recovery qualification increment

The actual PostgreSQL executor now retries native known-abort SQLSTATE 40001 or
40P01 at most three total transactions, redoing replay lookup, authorization,
admission and state freezing each time. Bun 1.4.2 retains SQLSTATE in errno;
its code field identifies the driver error category. Exhaustion returns
failed/TRANSIENT_ABORT. Native connection/class-08 and server shutdown diagnostics
return indeterminate without automatic retry; this makes no durability claim.

Native recovery plus existing executor tests pass **6 / 130 assertions**.
Injected server aborts after business, outcome, audit and outbox writes prove that
two aborts followed by success leave exactly one commit, while three aborts leave
original fields/version/sequence and zero terminal/outbox rows. An explicitly
injected acknowledgement loss AFTER an actual database commit returns indeterminate
for keyed and unkeyed invocations, with one attempt. A new SQL connection recovers
the keyed original outcome without a second business commit. Actual termination
of the executing PostgreSQL backend also returns indeterminate with one attempt
and no committed business/terminal writes. These are finite injected/native
witnesses; they do not yet certify arbitrary packet-loss, actual process restart,
or all handler retry/crash schedules. An additional native 40001 rollback followed
by intervening membership revocation yields denial on attempt two, with one prior
candidate change and no durable business/terminal writes: the **4 recovery tests /
81 assertions** pass. This discriminates reuse of stale authorization between
attempts. Native injected SQLSTATE 40003 and 08007 also yield indeterminate after exactly
one attempt. PostgreSQL's versioned [error-code reference](https://www.postgresql.org/files/documentation/pdf/17/postgresql-17-A4.pdf)
identifies these as statement-completion/transaction-resolution unknown; neither
qualifies as a known abort. The complete **5-test recovery suite / 91 assertions**
passes, along with strict tooling types. Prior source fingerprints predate this increment.


Latest stable native capture after the strengthened security witnesses:
**66 pass / 0 fail / 1,200 assertions**, PostgreSQL
**17.9 (Debian 17.9-1.pgdg13+1)**, Bun **1.4.2**.
The collector actually verified its before/after source inventory; independent
post-run recomputation checks **801 hashes / 0 mismatches** in
`fixtures/actions/reference-foundation.json`. This supersedes older native capture
counts for this source snapshot. Counts of watchdog polling assertions can vary
with observed scheduling; the semantic readiness/termination assertions are fixed.
The report remains partial foundation evidence, not full US-056 certification.


### Handler isolation qualification increment

Actual Docker security probes on 2026-10-09 pass **5 tests / 37 assertions**
with Bun 1.4.2 and the immutable Node 24.20.0 handler image recorded below.
A synthetic Docker proxy configuration first exposes its synthetic credential
in an unsanitized control. The admitted handler and a spawned Node subprocess
then observe only the explicitly allowed HOME and PATH. Independent host file,
Unix socket and loopback listener controls establish that the resources exist;
the handler cannot access them or route to the external test address. Native
kernel status confirms dropped capabilities, no-new-privileges and seccomp.
Fork exhaustion returns EAGAIN under the actual 32-process cgroup limit; actual
128 MiB cgroup exhaustion sets Docker's OOMKilled flag and yields LIMIT. Timeout,
malformed protocol and dispatch refusal each have independent owned-container
absence checks. These are finite witnesses, not complete isolation certification.
The V8 old-space setting is 64 MiB; it is not a bound on total JavaScript memory.

Cleanup now has a shared absolute two-second deadline, a 500 ms inspection
subdeadline and cancellation checks before every client launch and after awaited
stages. Launch and cleanup pin the same copied Docker client environment.
Observations are frozen copies and callback exceptions cannot change execution.
The trusted host must keep Docker configuration/context files stable during an
attempt; copying the environment does not freeze changes to those files. Astra independently reproduced closure of the late-command
launch defect using mocked processes; native cleanup witnesses are separate.
Both strict TypeScript checks pass. The previous foundation source fingerprint
capture predates this increment and must be regenerated before certification.
A separate native watchdog witness first observes an authenticated gateway call
and Docker Running=true, then kills the Bun supervisor. The container's independent
ten-second GNU timeout stops execution (ExitCode 137, OOMKilled=false). The test
removes the exact owned stopped orphan and confirms absence; automatic orphan
reaping is not proved. The security suite now passes **6 tests / 129 assertions**.
Native transactional handler tests pass **6 tests / 181 assertions**, including
candidate SET followed by time exhaustion, stdout/stderr flooding, 257 gateway
operations and actual cgroup OOM. Every failure returns LIMIT with original fields,
entity version and business sequence unchanged and zero outcome/audit/outbox rows.
The strengthened combined security/handler witnesses pass **12 tests / 315
assertions**: launch ownership is persisted independently of authenticated readiness,
harness Docker clients have three-second deadlines, native Running remains true
250 ms after supervisor death and termination occurs more than eight seconds later.
Every transactional resource case independently observes exactly one successful
candidate SET returning changed before LIMIT. Both strict tooling checks pass.
Delayed daemon creation races, durable deployment catalog and full host-crash
transaction recovery remain open.


- `spec/extensions/actions/schema.json` and its identical package schema compile
  with the actual strict registry compiler. The module-only extension retains
  future effects while refusing malformed recognized variants.
- `fixtures/actions/approve.json` is admitted by core 0.8.0 and the extension
  structural compiler. Missing semantic callbacks correctly leave completeness
  false; a package manifest does not assert execution support.
- Portable action types, semantic dependency analysis, registration, inspection,
  declaration, editing and exact-snapshot capability assessment are implemented.
  Public exports were added to `src/index.ts`. Execution verification is always
  false in metadata assessment.
- `bun test tests/actions/*.test.ts`: **50 pass, 0 fail, 291 assertions**, Bun 1.4.2,
  macOS arm64. Contract, assessment and preservation tests carry AC1–AC8
  citations. Citation coverage does not certify the entire requirement set.
- Public-bundle Chromium **153.0.8010.12**, Playwright 1.63.0, compares
  three actual declaration fixtures with Bun 1.4.2. Results agree, host globals
  are absent and no external requests occur. Source fingerprints are recorded
  in `fixtures/actions/browser.json`. The shared language-neutral corpus now
  asserts 21 independently authored positive/negative decisions in both runtimes,
  including composite Keys and explicitly bound association Records.
- Separate pure rules/1 evaluation and keys/1 selection are implemented and
  tested for exact arithmetic, static branches, phase/access restrictions and
  bounded admission. They do not implement the transactional consumer.
- Published inspection, assessment and executor-profile schemas now validate actual
  output and reject malformed execution/capability claims. All **351 schemas** and
  **60 extension packages** pass the actual compiler audits.
- Strict TypeScript checks pass after the current implementation edits.
- The native reference foundation, native five-primitive recipes and installed
  container handlers, capability-limited typed outputs, advisory preview and
  directed relationship checks have **60 pass, 0 fail, 1031 assertions**. Actual PostgreSQL is **17.9 (Debian 17.9-1.pgdg13+1)**;
  image identity, source fingerprints and exact scope are retained in
  `fixtures/actions/reference-foundation.json`. Native observations prove alias
  uniqueness/FKs, rollback, an actually blocked second SQL session and persisted
  fencing. They do not certify complete action execution.

No native adapter/import/export direction is advertised by this package. Evidence
locators are inert declarations, never authenticated runtime certificates.

## Open action qualification work

1. Complete semantic boundary cases, including relationship/DDD examples,
   deterministic source pointers, unsupported Key component domains, transitive
   unknowns and static recipe/frame compatibility.
2. Complete independent EX-01 discriminators for rules/1 and keys/1; passing
   interpretation tests do not yet qualify native alias resolution or execution.
3. Complete AC1–AC9 tests and actual public-bundle Chromium/Bun comparison,
   serialization/edit and host-API exclusion evidence.
4. Complete transactional consumer qualification, isolated-handler exhaustion/
   denied-host-access/per-failure cleanup witnesses and durable operator deployment
   lifecycle. Installed handlers use the authenticated bounded candidate gateway;
   its completed subset is recorded below. No raw DB capability in handlers.
5. Execute EX-01–EX-05, including native concurrent alias/invariant checks,
   revocation/retirement, durable replay/tombstones, restart/ack ambiguity,
   verification/audit atomicity and projection-prefix/epoch witnesses.
6. Re-run independent design oracles and negative controls against the actual
   implementation, then record exact runtime/version/subset/source fingerprints.
7. Obtain final Astra Ultra review of substantive design/qualification claims
   and resolve any remaining issues before marking the goal complete.

## Open baseline prerequisites

Initial full baseline regression completed with **2114 pass, 23 fail**, 2137
tests in 381 files. Its historical log is
`/private/tmp/umf-actions-baseline-tests.log`. This failed run remains a failed
qualification checkpoint. Targeted repairs and actual reruns subsequently passed:

- Protobuf/native-oracle and traceability checks: **17 pass, 0 fail**, with
  a pinned Python oracle environment and sufficient native-process test timeout.
- Cardinality, Nullability, relationship and authored Key recovery checks:
  **4 pass**, followed by native Key recovery **1 pass**. The JSON comparison
  now compares admitted JSON data independently of plain/null object prototype;
  native byte carriers are compared as exact bytes. Getters and custom object
  prototypes remain rejected, and mutation/forged-receipt controls remain active.

Fresh full regression and evidence-gate publication are still required. Initial
failures included:

- Acceptance-ledger test expects 433 criteria; the current governed story inventory
  contains 451. Update the legitimate inventory assertion and regenerate the ledger
  while keeping untested action criteria explicitly untested.
- Protobuf projection native-oracle test cannot launch `.venv/bin/python`.
  Supply the pinned oracle environment and rerun the actual compiler/runtime test.
- Avro Cardinality composition compares JSON-equivalent objects with different
  prototypes using host `assert.deepStrictEqual`. Verify intended JSON data
  equality without weakening the semantic comparison.
- Cardinality/facet evidence gates mix Chromium 153.0.8010.12 proof files with
  an older default expectation, and current source changes also require fresh
  fingerprint/evidence publication. Use the repository core replay workflow;
  do not rewrite historical hashes or label stale evidence as current.

A final certificate must enumerate all acceptance gates, commands, failures,
negative-control detections, browser/native versions and unsupported boundaries.
An unchecked/untested requirement is an open gate, not a passing certificate.

## Astra review reconciliation — 2026-10-09

Astra Ultra independently confirmed the first five corrections and the then-current
38-test/232-assertion run. A second review found four related gaps: external refs
localized by strict consumers, malformed relationship snapshots treated as known
absence, warning-covered obligations left checked, and missing transitive DDD
vocabulary qualifiers. Concrete regression witnesses now pass for all four.
Additional tests prove a permissive caller semantic callback cannot suppress known
action errors. This latest correction set has been returned to Astra for independent
review; final review and execution qualification remain open.

The follow-up review also identified incomplete strict reference branches, an
unrelated-vocabulary false positive caused by relationship/element index confusion,
and metadata rejection of preserved reference qualifiers. Additional regression
tests pass for all three. A shared strict reference walker now covers nested
parameter/frame/effect/rule references and the exact DDD operation shape. Metadata
compilation defers when relevant unknown meaning is inventoried. The refreshed
44-test run, typecheck, build and actual three-fixture Chromium comparison passed
at that checkpoint. Subsequent schema/corpus and strict dependency corrections are
covered by the current 49 portable tests and refreshed Chromium evidence.
The final portable review independently confirmed 49 tests and found no remaining
blocker in the reviewed metadata/preservation paths. Full execution qualification
remains open.

## Native implementation allocation and foundation

US-056, TD-056 and STP-056 allocate the complete bounded transaction journey to
twelve native criteria; all twelve remain unqualified until their end-to-end
assertions execute. Astra reviewed the store-lock design and its full qualification
plan. Reordered expected-version assertions now canonicalize by declaration, and
uncertain restore requires an invocation fence independently of changing epochs.
The plan includes full-declaration admission, link-only/alias/no-op resource versions
and unknown-commit behavior with and without replay keys.

Actual host implementation now includes the SQL migration/control boundary, test
issuer authentication, exact request admission and canonical concurrency assertions.
The complete invoke/replay/revision/gateway/sandbox/audit/projection path is unfinished.
Tests under `tests/actions-reference` intentionally claim partial foundation evidence;
they do not carry full US-056 citations prematurely.

## Lossless native representation correction

Astra reproduced three admitted-domain mismatches: JSONB rejects NUL/lone-surrogate
content, composite text indexes can reject legal large tokens/tuples, and the issuer
accepted an escaped identity larger than its verifier allowed. The storage foundation
now uses lossless encoded JSON text, bounded generated digest buckets and exact retained
identity comparison, with numeric physical row IDs. Store-owned identity/uniqueness
guards serialize without adding undeclared business effects.

Actual PostgreSQL witnesses preserve NUL/lone-surrogate content and distinct principals,
a 1024-unit noncompressible token (3072 UTF-8 bytes) and a public core composite tuple
over one megabyte. A forced constant-digest fixture proves bucket collisions retain
distinct entities and reject exact duplicates. Maximum escaped issuer context also
round-trips. Duplicate/ambiguous stored representations refuse.

A native test first timed out because the lazy Bun SQL query was passed directly to
a rejection matcher and never executed. The database diagnostic showed idle sessions;
the disposable test was interrupted and its own container removed. The corrected
witness explicitly awaits execution, and fresh reruns pass. An earlier native-version
check also refused the actual Debian suffix; qualification now checks PostgreSQL's
authoritative version number and records/asserts the exact build string. These failed
attempts are not acceptance evidence.

Latest combined checkpoint: **66 pass, 0 fail, 1080 assertions** across portable action,
native foundation and traceability tests. Typechecks pass; schema/package audits remain
351/351 and 60/60, and current Chromium evidence includes the 21 shared case decisions.
All twelve full transactional story criteria remain open.

### Native isolation and revision retention checkpoint

The native store wrapper explicitly pins READ COMMITTED. Identity guards refuse
unsupported transaction isolation. Updating an existing store avoids the global
registry lock; native sessions prove another store commits while the first stays
locked, and competing identical alias inserts yield one exact retained identity.
Astra Ultra reviewed this correction and found no remaining scoped foundation blocker.

`ReferenceRevisionRepository` retains admitted original documents independently of
execution qualification. Native tests prove retirement preserves source and deployment,
duplicate replacement refuses, the database rejects source updates, and missing
revision lookup refuses. This is partial US-056/AC-6 evidence; accepted invocation
pinning, original typed replay and authorization remain unimplemented. No whole
US-056 acceptance criterion is promoted by these tests.

The refreshed foundation report hashes all source and specification JSON plus the
host implementation, tests and admitted fixture. Native checkpoint: 7 tests,
72 assertions, no failures on PostgreSQL 17.9. Typechecks pass. The combined action,
native and traceability checkpoint passes 58 tests / 976 assertions. The certification
goal remains open pending the executor and current full-repository evidence gates.

### Original typed intent and current-policy checkpoint

`intent.ts` matches the actual retained document action before interpreting inputs.
It retains declaration-ordered presence and exact core literal/Key equality: numeric
spelling variants compare equal; omitted versus null, changed values and changed
revision targets differ. Correlation and token are excluded from typed payload identity;
version assertion order follows the declaration. The full retained identity string,
rather than a digest, establishes equality. This helper has not yet been integrated
with a durable terminal outcome/replay path.

`policy.ts` checks issuer-bound tenant/principal against current native membership
under the store-control lock. Native sessions observe revocation blocked behind
already accepted protected work, then subsequent access denied without running the
callback. Service identity remains separate. Astra found ignored unknown members
on the roles authorization envelope/profile; both now refuse, with native callback-
not-run witnesses. The trusted host helper accepts an Action argument: future executor
integration must resolve its authoritative immutable revision under the same lock,
never accept a caller-selected policy as authority. Whole US-056/AC-5 remains open.

Current checkpoint: typechecks pass; foundation suite 9 tests / 91 assertions;
combined portable/native/traceability suite 60 tests / 995 assertions, zero failures.
The initial strict TypeScript run exposed an optional extensions dereference in the
new test; it was corrected before the final passing checkpoint. No whole US-056
criterion is certified by these partial witnesses.

Astra also identified ignored oversized later role IDs (despite an earlier matching
role), unsafe getter evaluation during intent comparison, and mutable revision targets
across lock waits. Every role is now validated before membership lookup; hostile action
input is safely copied before comparison; revision read snapshots its target before
waiting. Native callback-not-run and blocked revision lookup tests discriminate these
cases. In-transaction revision lookup avoids nested control-lock acquisition; fresh
retirement/pinning journey tests still await executor integration.

The first checkpoint after target snapshotting failed one native isolation test with
PostgreSQL `57P03` (server starting up): the Unix-socket readiness check had observed
the temporary initialization server. Qualification did not publish that failed run.
The harness now probes the final TCP listener at 127.0.0.1. Full checks are rerun;
this environmental failure remains part of the evidence history.

Final checkpoint after the TCP readiness correction: strict typechecks pass;
foundation 9 tests / 99 assertions and combined 60 tests / 1003 assertions pass
with zero failures. `fixtures/actions/reference-foundation.json` has refreshed
current source fingerprints and actual PostgreSQL/image/runtime observations.
These witnesses remain partial; durable outcomes, protected original replay and
full executor admission are the next implementation boundary. Certification remains open.

### Durable terminal retention implementation checkpoint (qualification open)

`outcomes.ts` adds host-side durable rejected/conflict decision retention and lookup.
Native witnesses prove unchanged replay after retirement and service changes,
original-schema interpretation across an incompatible replacement revision, current
revocation, absent-entity replay without business reads, irreversible tombstone
recognition and database refusal of retained result replacement/deletion. Lookup
never runs business work. This does not implement invoke, committed results, audit
atomicity, crash acknowledgement recovery or a complete replay acceptance criterion.

Astra found two further edges: revision mismatch must return `TOKEN_REUSE` before
original typed-input admission; a paired incompatible-new-schema witness now passes.
Branch-specific missing/opaque-policy refusals were made indistinguishable to revoked
callers, but changing valid role policies still permits a retained-token presence
discriminator. Namespace discovery authorization needs an explicit governed design
and native witness before this path is qualified; green existing tests do not discharge
that finding. The design review is ongoing.

Before the final revision-conflict correction, the expanded suite passed 61 tests /
1021 assertions and the native foundation passed 10 tests / 117 assertions. After
that correction, strict typechecks and the targeted native retention test pass
(19 assertions). The foundation report needs refresh after further discovery-policy
work. No complete US-056 criterion is promoted.

### Explicit replay-discovery policy correction

Astra's recommendation is now normative in CONTRACT-053 and allocated in TD-056
and STP-056. The executor installs a separate action-family exact roles/1 discovery
binding; revisions never implicitly change it. It grants trusted principal-scoped
token-presence visibility only. Current original-revision authorization still protects
results, conflicts and expiry; missing-token requested-revision checks remain explicit.
Lookup and keyed terminal admission check current discovery before token access.

The native proof uses a database role with SELECT permissions on control/policy/
membership only. Direct outcome SELECT fails with permission denied, while discovery-
denied lookup returns uniformly for retained, absent, tombstoned and unknown-revision
cases. Changing v1/v2 roles cannot infer presence without the independent grant. With
discovery permission, presence distinctions are authorized while old results still
refuse until original membership is restored. Cross-principal/tenant isolation and
an observed blocking discovery-disable race also pass.

Astra's follow-up found duplicate persisted roles and malformed stored JSON could
bypass exact configuration or leak parse failures. Builder and native reader now
share exact validation; duplicates, unknown profile configuration, oversized later
roles, malformed and noncanonical JSON deny uniformly before token queries.

Current verified checkpoint: strict typechecks pass; native suite 11 tests / 139
assertions; combined portable action/native/traceability suite 62 tests / 1043
assertions, zero failures. The native report includes current runtime/image/source
and governing contract/design/test-plan/story fingerprints. These remain partial
consumer witnesses. Full keyed invoke must use this same discovery gate; recipe/
handler execution, atomic audit/outbox, crash recovery, projection and current
repository-wide evidence gates remain open. All complete US-056 criteria remain
unpromoted until their end-to-end journeys pass.

### Full-declaration fresh preparation checkpoint

`preparation.ts` gates the entire selected obligation inventory before narrow rule,
selector or input consumers. Native-domain checks consume every exact model
obligation, including unused and transitive references and relationships. Omitted
optional inputs with unknown Field meaning and literal-true conditions with unknown
unused dependencies refuse. Native tests independently show no business, terminal,
audit or outbox rows are created. Supported create/link preparation remains admitted.

Astra reproduced skipped unused RelationshipRefs, transitive known decimal Fields,
and reserved/oversized declared failure codes. The current inventory-based gate
and whole-declaration protocol checks close all these findings. The first unused
dependency fixture was invalid (missing declared failure); it was corrected rather
than weakening the asserted refusal. An intermediate model-inventory implementation
missed relationship paths; the exact element/relationship namespaces are now handled
and the positive create/link witness passes. Astra's final independent preparation
review found no remaining scoped blocker; local review checks passed 5 tests /
41 assertions.

`admission.ts` selects the authoritative retained source, current original policy,
keyed discovery/token routing and uncertain-restore fence under the store lock.
`prepareInTransaction` permits executor composition without releasing that boundary.
The read-only `prepareFresh` snapshot grants no execution permission after lock
release; future invoke must retain the lock through canonical state resolution,
execution and commit. Handler qualification and broader native domains remain
explicitly unimplemented rather than inferred from static compatibility.

Current checkpoint: strict typechecks pass; foundation 14 tests / 161 assertions;
combined portable/native/traceability 65 tests / 1065 assertions, zero failures.
Current source and governing artifact fingerprints are refreshed. Full US-056
criteria remain open until native gateway/executor, audit/outbox, handler isolation,
recovery/projection and repository-wide evidence gates complete.

### Native identity and frozen-state foundation

`state.ts` establishes all native aliases from actual core Key tuples and resolves
primary/alternate Keys to one physical resource under the retained store lock.
Separate frozen read/write frames share canonical identity/version while preserving
their declared permissions. Duplicate alternate-Key insertion rolls back the
new entity. Missing entity inputs retain parameter declaration order. Opaque
resource versions use lossless JSON text; NUL/lone-surrogate versions round trip.

Astra identified alias-to-value and receipt-authority gaps. Loaded fields now pass
refinement checks; requested and primary Key tuples are recomputed against stored
values. A native alias-target guard refuses reassignment. Independent ephemeral
corruption controls disable only that guard to remap an alternate alias to a wrong
same-Record entity, and separately corrupt Key fields; freezing refuses both.
The test restores the guarded alias in finally. Freeze loads the actual immutable
revision and repeats full preparation/typed admission before business entity SQL;
supplied action/source mismatches refuse. Prepared frame receipts cannot widen
access or change selection. Astra's independent mocks confirm forged action,
forged source/action pair and forged input Key produce zero business-entity reads.
Its final scoped review found no remaining substantive foundation blocker.

Current checkpoint: strict typechecks pass; native foundation 15 tests / 176
assertions; combined portable/native/traceability 66 tests / 1080 assertions,
zero failures, current source fingerprints refreshed. This establishes identity/
freeze prerequisites only. There is no completed recipe/handler mutation gateway
or executor, and no full AC-8/other US-056 promotion. Final primitive permissions,
net changes/versions, constraints, atomic terminal audit/outbox, sandbox, recovery,
projection and current full-repository gates remain required by the active goal.

### Candidate SET gateway and exact literal admission

The partial native gateway verifies SET against frozen canonical write permissions,
unions permissions across write aliases, excludes read grants, and forbids every
component of every core Key. Assignments validate before candidate publication;
an invalid operation permanently aborts the gateway. Net restoration produces no
update, and returned/caller snapshots cannot mutate retained candidate state.
The 256-operation limit counts no-ops; operation 257 permanently aborts.

Astra Ultra identified two scoped defects: write aliases did not union grants,
and structurally malformed literals could reach coercible core identity helpers.
Both are corrected. Action input admission, rule compilation, state evaluation,
native fields and SET now use the actual typed literal schema before refinement
or equality. Regression witnesses reject `{string: 4}` in inputs, rule literals,
state reads and SET. This does not certify unrelated core literal consumers.
Astra's final scoped review found no remaining blocker for candidate SET; its
independent probes covered numeric equality, restored net no-ops and permanent
operation-limit abort.

Before adding the explicit operation-limit regression, the checkpoint passed
71 tests / 1103 assertions across actions, native foundation and traceability.
The native qualification report passed 19 tests / 197 assertions on PostgreSQL
17.9 (Debian 17.9-1.pgdg13+1). Strict typechecks, build and fresh Chromium
153.0.8010.12 checks passed with Bun 1.4.2. The qualification report records
current source hashes and image identity.

Candidate SET has no persistence, create/delete/link primitives, handler RPC or
terminal executor. Full US-056 acceptance, recovery/projection, formal refinement
and current repository-wide gates remain open. This is partial evidence only.

After adding the operation-limit witness, the fresh native qualification rerun
passed 20 tests / 457 assertions with zero failures. Its captured report and
source fingerprints are current. The gateway subset itself passed 5 tests /
281 assertions. No full US-056 criterion is promoted by this partial result.

### Ordered candidate recipes and bounded reads

`recipe.ts` now composes the trusted frozen-state foundation with SET execution.
It checks absent entity inputs before version conflicts; version assertions run
in combined frame declaration order, independent of request ordering. Declared
preconditions run before effects. Postconditions see candidate final state while
pre-state remains frozen. Failed postconditions throw without exposing updates.
This internal candidate stage does not authenticate, persist or grant permission
to execute after releasing the qualified native transaction boundary. Full invoke
must compose it with authoritative preparation/freeze under that same lock.
Create/delete/link/unlink, declared outputs and relationship rule snapshots remain
explicit refusals pending their implementation, not claimed support.

The bounded gateway read capability exposes current candidate values only through
read frames; canonical read aliases union their read fields without write grants.
It counts operations, isolates returned values, and permanently aborts unauthorized
read attempts. Rule snapshots contain read frames only. They do not expose native
invariant reads as hidden handler/rule permissions.

The actual PostgreSQL witness verifies missing-input precedence, request-order
independent version conflicts, candidate final-state rules, failed postcondition
rollback, unchanged native fields, and zero outcomes/outbox for this candidate-only
stage. Astra found a prototype-key dictionary defect: valid `__proto__` frame IDs
mutated the snapshot prototype. A null-prototype dictionary corrects it, and the
admitted native witness now uses that frame ID through rules/version checks.
The first fixture run also correctly refused undeclared condition failure codes;
the fixture now declares them. Neither failure is hidden as prior passing evidence.

Strict typechecks and the gateway/native recipe checkpoint pass 7 tests / 298
assertions, zero failures. Full acceptance remains open for durable terminals, all
remaining primitives, final native constraints, handler/recovery/projection and
current repository gates. No full US-056 criterion is promoted here.

Astra Ultra's final scoped review independently confirms the prototype-key fix,
missing-input/version/ordered-precondition precedence, unsupported-primitive
refusal, read/write separation and isolated snapshots. Its local gateway checks
pass 6 tests / 288 assertions with no remaining scoped blocker.
The combined actions/native/traceability checkpoint passes 74 tests / 1380
assertions (21 files), zero failures. Fresh native qualification passes 22 tests /
474 assertions on PostgreSQL 17.9; the captured report includes current source
fingerprints. These results qualify this partial foundation only.

### Atomic native SET invocation

`executor.ts` now authenticates a logical invocation, routes keyed retries through
original-revision replay, and keeps fresh admission, authoritative state freeze,
recipe checks and commit under one native store-control transaction. Successful
SET changes advance one store sequence and stamp changed canonical resources.
Primary core EntityInput identities form the net updated change list. Immediate
effect verification and final postcondition verification are persisted unchanged.
A restored/unchanged net state publishes no business fact and advances no business
or resource version. The opaque stamp hashes exact lossless store/epoch/sequence
identity; it remains distinct from a public ordered counter.

Business rows, store sequence, replay outcome, protected audit and outbox fact now
commit atomically. Rejected/missing-input/conflict decisions persist outcomes and
audit without business changes. Keyless accepted work still records protected
audit. Calling service is audit attribution, not replay scope. Native tests verify
exact retained committed replay, no-op verification/version/outbox, current
authorization revocation and terminal replay after competing state changes. An
independent native audit CHECK failure occurs after tentative business/outcome/
outbox writes; all roll back, and the rolled-back token can execute safely later.
The test restores its injected constraint in finally.

Astra identified inconsistent keyless/error responses and pre-authorization fence
disclosure. Authentication/keyless denial now return logical denied/AUTHORIZATION;
known failed rules/postconditions are normalized only after SQL.begin completes
rollback. Unexpected SQL/connection/commit failures are not mislabeled as known
rollback; retry/lost-ack classification remains unfinished. Fresh admission checks
current action authorization before exposing a restore fence. Native regressions
cover invalid credentials, denied keyless access on a fenced store, and logical
failed/POSTCONDITION with zero new audit/outbox.

Concurrent actual invoke histories start identical-token calls together and require
one retained result/audit/outbox; distinct tokens with the same resource-version
assertion require one commit and one retained EXPECTED_VERSION conflict. This
extends mechanism-level lock evidence to the invocation itself.

This stage implements SET recipes only. No full primitive/output/relationship,
handler, retry/lost-ack/restart, projection, mutation/refinement or repository-wide
certification is claimed, and full US-056 criterion promotion remains open.

Astra's final scoped review also found typed-input code leakage: wrong Key values
exposed KEY_TUPLE_VALUE and invalid Field refinements exposed CORE_SCHEMA_PROPERTIES.
The shared native input boundary now normalizes both to PARAMETER in fresh
preparation and original-revision intent comparison; lookup returns unsupported/
PARAMETER after original authorization, revision and expiry checks. Native probes
exercise wrong Key wrappers and length-facet failures in fresh and retained paths.
Astra independently confirms these fixes and the auth/fence/postcondition responses;
its local preparation/intent/admission/gateway checks pass 12 tests / 331 assertions.
Its final review found no remaining substantive defect in scoped SET invoke/commit/
replay. This excludes the explicitly unfinished retry/unknown-ack and other features.
The focused final native executor suite passes 3 tests / 58 assertions, including
actual concurrent invocations. Strict typechecks pass.

Final stable-source checkpoint: strict typechecks pass; combined actions/native/
traceability passes 77 tests / 1438 assertions (22 files), zero failures. Fresh
PostgreSQL qualification passes 25 tests / 532 assertions on 17.9 (Debian
17.9-1.pgdg13+1). The report captures current source fingerprints and exact image
identity after all scoped fixes and refinement/concurrency witnesses. Portable
source did not change in this host-only stage, so no new portable/browser claim
is inferred. All full-story/repository requirements remain open.

### Authorized advisory native preview

`preview.ts` exposes the exact validation-only logical shape through executor.preview.
It admits the preview request (no replay key/correlation), authenticates, checks current
authorization, performs authoritative preparation/freeze and runs the same ordered
missing-input/version/precondition checks as invoke. False preconditions report
preview/rejected; missing inputs and version conflicts use their logical error
variants. The stateBasis receipt uses the same opaque store-version derivation as
commit. changes remains not-computed and commitGuaranteed is always false.
It executes no effect, postcondition or handler, and reserves no identity/version.

An independent native witness installs statement-level INSERT/UPDATE/DELETE failure
triggers on every action table, including control, revisions, policy, business,
outcomes, audit, outbox and projection. All preview paths run under those guards;
exact table snapshots remain identical. Satisfied/false preconditions, version
conflict, missing inputs, current denial, invalid credentials and forbidden request
members are covered. After removing the guards, a competing actual invocation
commits; invocation using the earlier preview's resource assertion conflicts.
This proves advisory receipt semantics using actual changed native state.

Astra found a substantive qualification divergence: metadata-known but uninstalled
DELETE/linked-postcondition recipes could preview as satisfied while invoke refused.
Installed recipe qualification now runs in shared admission before business identity
lookup, and checks postcondition support without executing postconditions. Both
preview/invoke refuse those recipes. Native guarded tests cover each, and Astra's
independent actual-method probes observe zero business entity/alias queries.
The final scoped review found no further preview/shared-SET regression; independent
local foundation checks passed 12 tests / 331 assertions. The native preview witness
passes 1 test / 23 assertions; the preview/executor/recipe checkpoint passed 5 tests /
89 assertions before adding the last linked-postcondition pair. Strict typechecks
pass. A refactor regression briefly added an internal stage field to candidate
rejections; the existing decision shape is restored, rather than changing its
expected result. Full handler/relationship/other primitive qualification remains
open; this does not promote a complete US-056 criterion or full certification.

Final stable-source preview checkpoint: combined actions/native/traceability passes
78 tests / 1461 assertions (23 files), zero failures. Fresh native qualification
passes 26 tests / 555 assertions on PostgreSQL 17.9 (Debian 17.9-1.pgdg13+1),
with current source fingerprints/image identity. The capture scope now explicitly
includes partial atomic SET/advisory preview observations while retaining all
unimplemented full-profile/repository gates as unqualified. No portable source
changed in this host-only stage; prior current browser evidence remains separate.

### Canonical DELETE lifecycle and explicit invariant failure order

The gateway now tracks deleted canonical identities independently of absence.
DELETE permission unions only across write aliases. Subsequent read/exists/SET/
DELETE through any alias aborts permanently with FRAME_ACCESS; a read grant cannot
widen delete permission. Postcondition snapshots may observe deleted identity
absence, while pre-state remains intact. SET followed by DELETE reports one net
deleted entity in first-modification order, with separate immediate effect entries.
Atomic native persistence removes all Key aliases and the entity, advances one
store sequence, and retains outcome/audit/outbox deletion facts. Original typed
replay remains valid after the entity and its aliases are absent; fresh invocation
still rejects missing required entity inputs.

CONTRACT-053's invariant-failure behavior lacked a stable code. It now explicitly
reserves CONSTRAINT for known rolled-back runtime refinement/native invariant
failures. Initial typed inputs remain PARAMETER, forbidden access/Key mutation
remain FRAME_ACCESS, and unknown meaning/unexpected SQL errors are not reclassified
as understood invariants. Preparation refuses declaration failure codes that
reuse CONSTRAINT. Runtime normalization is limited to CORE_SCHEMA_PROPERTIES
from known admitted scalar fields.

The final constraint/postcondition priority is also normative rather than incidental:
effects run, then final native constraints, then ordered postconditions. Native
execution uses split candidate-effect/rule stages. Under the retained store lock,
executor-owned invariant validation checks all remaining edges referencing each
deleted resource, scoped to the same store; those reads are not exposed through
handler/rule frames. Independent relationships require explicit unlinking; no
cascade is invented. Native FKs remain a backstop.

Actual PostgreSQL witnesses cover primary/alternate deletion, retained replay
after absence, alias reuse rollback, preserved aliases/fields/outcome/audit/outbox
on failure, and constraint precedence. The same request with a remaining native
edge and a false postcondition returns CONSTRAINT; removing only the seeded edge
then returns POSTCONDITION. Test seed manipulation occurs under the control lock
and is not claimed as an implemented unlink command. The uninstalled-preview
witness now uses CREATE because DELETE has become installed. Linked-rule support
remains refused by the shared installed-profile gate.

The native delete/gateway/preview checkpoint passes 10 tests / 367 assertions.
Strict typechecks pass. Astra Ultra's final scoped review found no remaining
concrete SET/DELETE lifecycle defect; its independent gateway/preparation/intent
checks passed 11 tests / 343 assertions. It independently confirms canonical
read/exists/net-change behavior and reviewed the paired native failure-priority
witness; it did not independently rerun Docker. An initial strict TypeScript
union inference error was corrected without changing runtime assertions.
Full CREATE/link/unlink/relationship invariants, handler, recovery, projection,
formal refinement and repository-wide certification remain open.

Final stable-source DELETE checkpoint: combined actions/native/traceability passes
81 tests / 1517 assertions (24 files), zero failures. Fresh native qualification
passes 29 tests / 611 assertions on PostgreSQL 17.9 (Debian 17.9-1.pgdg13+1).
Current governing contract and source fingerprints/image identity are captured
in reference-foundation.json. These establish the scoped SET/DELETE and preview
foundation; they do not discharge the remaining full-story/profile/repository
criteria. The persistent certification goal remains active.


## Primary-Key CREATE implementation and scoped Astra re-review

CREATE now requires an originally selected primary-Key write frame with
create:true at the exact supplied identity. Supplied values prove every core Key
tuple before matching aliases are remapped. Field grants union across proven
write aliases; read aliases confer no write grant. Pre-state remains absent and
post-state exposes the created candidate, including a later SET through a created
binding. Keys remain immutable; deleting a newly created candidate and recycling
existing/deleted alias identities are refused. Provisional identities never appear
in committed results or outbox content.

Native checks cover existing primary, selected alternate, unselected alternate,
intra-candidate and concurrent absence collisions. Every incident relationship is
admitted even when omitted from action frames. Unknown qualifiers and unsupported
association arrangements refuse; required zero-degree minima fail CONSTRAINT
before postconditions. Asymmetric regression cases distinguish targets per source
from sources per target. This zero-degree check must become actual candidate-graph
validation when LINK is installed.

Astra Ultra found two defects during implementation: premature field-grant checks
rejected a legitimate proven write alias, and unframed relationship minima were
missed. Both were corrected. Its final scoped review found no remaining CREATE
blocker, with independent local 13 tests / 367 assertions and asymmetric helper
probes. It did not rerun Docker. The native preview refusal now uses UNLINK, since
CREATE is installed. Full relationship operations, handler isolation, recovery,
projection, formal refinement and repository certification remain open.

Stable-source CREATE checkpoint: strict TypeScript checks pass; combined portable
actions/native/traceability passes **86 tests / 1578 assertions**, 26 files, zero
failures. Fresh reference-foundation capture passes **34 tests / 672 assertions**,
zero failures, on PostgreSQL **17.9 (Debian 17.9-1.pgdg13+1)** and Bun 1.4.2.
Exact current source and governing-contract fingerprints and Docker image identity
are retained in fixtures/actions/reference-foundation.json. This qualifies the
reported partial foundation only; no whole US-056 criterion or full profile is
certified. The persistent goal remains active.


## Native directed relationship READ snapshots

Invoke and preview now evaluate linked pre/post rules from actual directed,
independent native set relationships under the retained store control lock. SQL
selects only declared READ source identities and selected READ target identities;
it limits each source/relationship result to selected-target count plus one and
refuses duplicate/overflow set members rather than truncate. Endpoint Record
membership is validated before projection. Canonical READ aliases share granted
relationship access; WRITE relationship grants never confer read capability.
The gateway linked operation counts against the operation bound and permanently
aborts on invalid access or reuse of a deleted endpoint. Snapshots are copied.

Astra identified that the initial SQL fetched all outgoing targets before filtering
in JavaScript. The target filter and set-member bound now execute in native SQL.
The native witness includes eight duplicate unselected adjacency rows, which cannot
affect selected linked(a,b), and a duplicate selected pair, which refuses SELECTOR.
It also covers direction, absent pairs, retained rejection after a new edge appears,
canonical read aliases, read/write separation, and write-free preview under SQL
statement guards. The paired snapshot/preview checkpoint passes 2 tests / 43
assertions; strict TypeScript checks pass. Earlier linked-rule refusal statements
are historical checkpoints. LINK/UNLINK mutation primitives and final candidate
graph invariants remain unfinished and are still refused by the installed gate.

Astra's subsequent callable-gateway review found missing endpoint Record
orientation admission. linked now validates understood directed-independent
relationship semantics and authored source/target membership using frozen Key
Record identities before testing existence. Reversed, unrelated and absent
unrelated endpoints fail FRAME_ACCESS and permanently abort; valid absence
returns false. Astra independently confirmed the production correction with a
valid Order/Customer/Product model. The regression fixtures initially reused
Fields across Records, violating native Key ownership. They now author distinct
Fields/Key components and assert actual declaration validation before testing
orientation and asymmetric minima. Final paired pure/native checkpoint passes
4 tests / 63 assertions; strict TypeScript checks pass. No remaining scoped
relationship-read production defect was found in Astra's final review.

Stable-source relationship READ checkpoint: combined actions/native/traceability
passes **88 tests / 1614 assertions**, 28 files, zero failures. Fresh reference
qualification passes **36 tests / 708 assertions**, zero failures, PostgreSQL
17.9 (Debian 17.9-1.pgdg13+1), Bun 1.4.2. All **786 captured source fingerprints**
were independently recomputed against the current worktree with zero mismatches.
This is partial foundation evidence, not complete US-056/profile certification.
The persistent goal remains active; LINK/UNLINK, final graph invariants and stamps,
handlers, recovery, projection, formal refinement and full repository gates remain
required.


## Candidate LINK/UNLINK capability foundation

The candidate gateway now implements directed independent set link/unlink. An
existing link or absent unlink is a successful no-op. Mutations require a frozen
source WRITE relationship grant and a frozen READ or WRITE target reference. The
actual target Key must equal the authored relationship target Key before absence
or no-op handling. Source/target Record orientation, permanent delete/use tracking,
exact copied arguments and operation bounds remain enforced. Canonical source
WRITE grants union without borrowing READ grants.

Original relationship membership is retained separately from candidate post-state.
Net link changes omit restorations. A combined first-modification journal orders
entity and relationship net changes together and removes restored changes. Native
freeze queries READ sources only against selected READ targets, and WRITE sources
against selected frozen READ/WRITE target references. Both native paths are bounded
and checked for duplicates; the same authoritative pair observed in both paths is
deduplicated. Internal write membership does not confer any rule/read capability.

Tests found and corrected pre-state mutation. Astra found and corrected an omitted
authored target Key check and an unjustified target WRITE requirement, using
CONTRACT-052 and actual declaration analysis. Meaningful witnesses cover alternate
Key refusal, read-only target references, mixed net-change order, restoration,
invalid orientation/absence/access with permanent abort, and candidate mutations
against actual frozen PostgreSQL membership while native rows remain unchanged.
The gateway/native checkpoint passes 16 tests / 425 assertions, strict TypeScript
checks pass.

LINK/UNLINK remain refused by invoke/preview's installed mutation gate until final
candidate-graph validation, ordered recipe integration, native persistence and
endpoint version/outbox behavior are implemented and independently qualified.
This foundation does not claim transactional LINK/UNLINK execution.

Astra's final scoped candidate review found no remaining blocker. Its independent
local suite passed 15 tests / 398 assertions, including corrected target reference
permissions/Key identity, bounded write snapshots, lifecycle and mixed ordering.
It did not certify native LINK/UNLINK persistence or final constraints.

Stable-source candidate relationship checkpoint: combined actions/native/traceability
passes **91 tests / 1658 assertions**, 28 files, zero failures. Fresh native reference
foundation passes **39 tests / 752 assertions**, zero failures, PostgreSQL 17.9
(Debian 17.9-1.pgdg13+1), Bun 1.4.2. All **786 captured fingerprints** match the
current worktree. This is partial capability/foundation evidence. No complete
US-056 criterion or transactional profile is certified; the persistent goal
remains active. Native recipe/persistence/final graph/version/outbox integration
for LINK/UNLINK is next, with handler/recovery/projection/formal/full repository
qualification still required.


## Native final candidate graph validator

Executor-owned graph checks now replace the original zero-degree CREATE shortcut
and isolated remaining-edge DELETE check. Under the retained store control lock,
they inspect every incident relationship of affected created/deleted/link endpoints,
verify actual native endpoint existence/Record membership and set uniqueness, apply
candidate link deltas, and enforce opposite-side distinct-endpoint degree minima
and maxima. Deleted resources require explicit removal of every remaining native
edge; surviving counterparts still satisfy lower bounds. These invariant reads
include unselected competing edges, remain private, and confer no rule/handler read
capability. Native CREATE/DELETE use the unified validator before postconditions.

Actual PostgreSQL witnesses cover hidden outgoing/incoming upper-bound competitors,
rewiring, required CREATE plus candidate LINK, explicit UNLINK before DELETE,
surviving-counterpart minimum failure, deleted/unresolved endpoint refusal, unknown
incident meaning, duplicate set members, and zero validation-only changes to
business rows/version/outcome/audit/outbox. The native/preparation checkpoint passes
6 tests / 82 assertions; strict TypeScript checks pass.

Astra reports an independent comparison of 32,768 bounded mocked-SQL
graph/lifecycle cases with zero mismatches (202 accepted), plus distinct-Record
asymmetric survivor-minimum probes. The exact retained script/raw output is being
retrieved; the review narrative alone is not a reproducible certification artifact.
This remains bounded review evidence, not native full-profile refinement.
Its admission review found unframed incident dependencies on mutation endpoints
were missing before preconditions. Preparation now resolves both LINK/UNLINK
bindings, including earlier creates and read-only targets, and admits every
incident dependency before compiling rules/admitting inputs/execution. A false
precondition cannot bypass unknown target incident meaning. The final independent
local review passes 7 tests / 64 assertions, no remaining scoped blocker.

Ordered recipe integration, native LINK/UNLINK persistence, endpoint versions and
outbox remain unfinished; their invoke/preview mutation gate stays closed. The
persistent full certification goal remains active.

Stable-source graph checkpoint: combined actions/native/traceability passes
**93 tests / 1675 assertions**, 29 files, zero failures. Fresh reference foundation
passes **41 tests / 769 assertions**, zero failures, PostgreSQL 17.9 (Debian
17.9-1.pgdg13+1), Bun 1.4.2. All **788 captured source fingerprints** match the
current worktree. Native graph validation and its current CREATE/DELETE integration
are qualified only by these scoped observations. Full LINK/UNLINK invocation and
remaining full-profile/repository gates are not certified.


## Native ordered graph-write recipe integration

CREATE/SET/DELETE/LINK/UNLINK now execute through the same candidate gateway.
Target frame selection preserves the actual input's authored Key while canonical
source WRITE grants union; read-only targets remain valid references. Typed net
results preserve combined first-modification order. The graph check and ordered
postconditions precede all business writes. Native unlinks precede DELETE, and
created provisional identities are remapped to actual native surrogate IDs before
link persistence/outbox publication. LINK/UNLINK are now installed for the qualified
directed independent set subset. The prior closed mutation gates are historical.

Net association changes advance one store sequence and stamp both surviving
endpoints, including read-only target references. They do not invent property
updates in typed changes. No-op and restored membership leave resource/store
versions and outbox unchanged while retained terminal/audit decisions persist.
Actual outbox facts carry remapped native links/unlinks and changed endpoint state.

Actual PostgreSQL journeys cover required CREATE plus two links, linked
postconditions, typed replay, alternate-Key target identity with a primary read
alias deliberately first, ordered unlink/unlink/delete, read-only target stamps,
existing-link no-op, unlink/link restoration, stale target assertions, hidden
competing-edge constraint precedence, postcondition rollback, late audit failures
after both link insertion and removal, explicit retry of a rolledback token, and
concurrent same-edge/disjoint-source writes sharing maximum-one target constraints.
The new native invocation checkpoint passes 2 tests / 79 assertions; current
existing CREATE/DELETE/SET/preview tests also pass (6 tests / 133 assertions).
Strict TypeScript checks pass. Handler/ambiguous commit/retry/restart/projection and
full independent acceptance/refinement remain unfinished.

The exact historical Astra graph oracle was recovered from its stdin command,
retained as scripts/actions-reference/graph-oracle.mjs with relative imports and
explicit failure/report capture, and rerun against current graph source. Actual
output is 32768 checked / 202 accepted / 0 mismatches. Its scoped source hashes
and bounds are retained in fixtures/actions/graph-oracle.json. The native
foundation collector now reruns it and labels it mocked/non-native evidence.
This resolves the earlier narrative-only archival gap; it does not qualify native
transaction/refinement behavior by itself.

Astra's final native integration review found no remaining scoped blocker. It
confirms the additional shared-invariant concurrency and late LINK rollback/safe
retry witnesses, exact alternate-Key target identity and bounded oracle limits.
Its local source/recipe checks pass 18 tests / 413 assertions; all six retained
oracle fingerprints match. Native observations remain independently scoped to
the actual PostgreSQL runs, with full profile qualification still open.

Stable-source native graph-write checkpoint: strict TypeScript checks pass; combined
actions/native/traceability passes **95 tests / 1754 assertions**, 30 files, zero
failures. Fresh reference foundation passes **43 tests / 848 assertions**, zero
failures, PostgreSQL 17.9 (Debian 17.9-1.pgdg13+1), Bun 1.4.2. The collector reruns
the archived 32768-case bounded oracle with zero mismatches. All **792 captured
fingerprints** match, including the actually consumed create-link fixture; the
six independent oracle input hashes also match.

An initial capture omitted create-link because the collector had already parsed
its earlier fixture list while source was edited. Its manifest audit failed and
it was not accepted as complete-input evidence. The collector was rerun with all
source held stable, producing the verified current capture above. Native engine
behavior remained unchanged between captures. Full US-056/profile, handler,
recovery/projection, independent refinement and repository gate certification
remain open; the persistent goal remains active.

Isolated-handler foundation checkpoint (2026-10-09): `sandbox.ts` adds a separate
Docker process with no network, host mounts or supplied database credentials,
read-only filesystem, UID 65534, dropped capabilities, no privilege escalation,
128 MiB container memory / 64 MiB JS heap, 32 process limit, bounded execution
and owned-container cleanup. Runtime image is pinned to
`sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`;
actual isolated Node observation is **24.20.0**, host Bun **1.4.2**. This is a
trusted host helper, not a deployment registry or handler invocation admission.
An exact source/bootstrap/image build fingerprint is checked; registration,
revision/deployment matching and qualified output persistence remain unfinished.

The private stdin/stdout channel authenticates each message, enforces exact
canonical JSON and monotonically ordered calls, allows only the eight declared
gateway operations, copies payloads and refuses more than 256 attempted calls.
Only synchronous bounded candidate dispatch is qualified. The source/runtime
can execute container-local Node APIs; confinement is the container boundary,
not JavaScript language isolation. No claim is made about arbitrary runtimes,
images, writable host access or production credentials.

Actual Docker tests pass **9 tests / 27 assertions**, zero failures, including
copied inputs/ordered calls, read-only root access, only loopback interface and
no outbound route, no supplied credential variables or host mount, source-build
mismatch before dispatch, forged output, caught gateway refusal, asynchronous
dispatch refusal, infinite-loop timeout, output flood, operation 257, invalid
UTF-8 and a truncated multibyte sequence, authenticated extra-member/out-of-order/unknown-operation requests before dispatch, stderr flooding, delayed-timer deadline bypass and unsafe numeric payload error normalization. Strict TypeScript checks both pass.
`/private/tmp/umf-actions-handler-isolation.log` records this checkpoint. Memory
and process controls are configured, but dedicated exhaustion witnesses remain
open. This is not AC7 certification or a full handler security qualification.

Astra identified a timeout tail wait that could hold a transaction after a stalled
asynchronous dispatch, and fatal UTF-8 decoding escaping as an untyped TypeError.
The dispatcher now refuses asynchronous continuations, both decoder paths return
FRAME_ACCESS, and one two-second cleanup deadline covers the Docker command,
child exit and channel tail waits. Native negative controls cover these findings.
The earlier combined source checkpoint passes **100 tests / 1767 assertions**,
31 files; it precedes the final decoding/tail-wait changes and is retained only
as that source checkpoint. Final combined regression is rerun separately.

Further Astra findings were resolved before retaining the current nine-test
checkpoint: delayed JavaScript timer delivery could admit success after a
synchronous dispatch exceeded the budget, and hostile JSON numbers could leak
the core NUMBER code. Absolute monotonic checks now guard message admission,
post-dispatch continuation and final success; malformed protocol payloads map to
FRAME_ACCESS while structural LIMIT and trusted gateway failures retain their
meaning. Native witnesses reproduce both refusal paths, including one actual
3.1-second synchronous dispatch under a three-second budget. Dedicated memory/
process exhaustion, denied external network/host-sentinel/socket attempts,
owned-container absence checks, reviewed deployment admission, real candidate
gateway/typed-output integration and full transactional handler acceptance remain
open.

Final stable handler-foundation source regression passes **104 tests / 1781
assertions**, 31 files, zero failures, across `tests/actions`,
`tests/actions-reference` and `tests/traceability`. Both strict TypeScript
configurations pass. `/private/tmp/umf-actions-handler-stable-combined.log`
records the actual combined run. An actual Docker listing after this run returns
no live `umf-actions-handler-` containers; per-failure ownership assertions remain
a separate unfinished witness. The older reference-foundation capture describes
its previous exact source hashes; it is not current certification for the new
sandbox source. Full US-056, handler invocation, recovery/audit/projection,
independent refinement and current full repository gates remain open.

Final scoped Astra Ultra review finds no remaining concrete blocker in the sandbox
foundation. Independent mocked-child probes confirm malformed numeric args/results
return FRAME_ACCESS before dispatch, structural copy bounds retain LIMIT and trusted
gateway CONSTRAINT remains unchanged. It rechecked absolute deadlines, malformed
UTF-8 and shared bounded tail cleanup. Astra did not independently run Docker;
its review does not expand the native or full-handler qualification scope above.

Installed-handler integration checkpoint (2026-10-09): the trusted operator
allowlist accepts exact `{id,version,build}` plus copied immutable source for
`umf.actions.container/1`; clients cannot install programs through invoke,
lookup or preview. Whole-declaration admission overrides only the exact inert
handler-identity obligation after qualification, preserving every other unknown
meaning gate. Freeze rereads authoritative source under the native store lock;
already admitted work retains its accepted build after retirement. Retired or
unavailable builds refuse fresh admission and preview, while original protected
replay needs neither a live deployment nor runtime reexecution.

The isolated runtime now invokes the same synchronous candidate gateway for all
five mutation primitives and the three read operations. Runtime outputs receive
actual declared-type admission, followed by capability-preserving final entity
identity validation, native final graph constraints, and ordered postconditions
with typed outputs. Handler verification records exact deployment, verified
outputs/postconditions/frames/constraints and is retained unchanged on replay;
protected audit records the accepted deployment. Business/version/outcome/audit/
outbox persistence uses the existing atomic native boundary. This is implemented
reference behavior, not registration-based certification of arbitrary handlers.

Astra found two substantive integration issues: malformed CREATE Key components
could leak internal NON_JSON/KEY_TUPLE codes, and arbitrary returned Keys could
become an unauthorized native existence oracle. Complete CREATE fields are now
validated before Key encoding; known value/constraint errors normalize without
hiding unknown model semantics. CONTRACT-053 and TD-056 now explicitly constrain
existing entity outputs to surviving exact admitted input/READ identities, or
READ-selected alternate Keys whose component Fields all have READ permission;
newly created verified aliases are allowed. Validation has no SQL capability.
WRITE grants and different-canonical READ grants cannot widen output disclosure.

Actual PostgreSQL 17.9 plus isolated Node 24.20.0 histories cover typed
SET/output verification, write-free advisory preview, exact replay and no-op
versions; original replay after deployment/revision retirement and a new executor
with an empty runtime registry; caught outside-frame/read-denied attempts,
invalid/unknown/deleted outputs and false postconditions rolling back all five
protected/business categories; five malformed CREATE cases and successful
created alternate-Key output; existing/absent output guesses both refusing with
zero business queries under an instrumented native SQL negative control; ordered
handler CREATE/SET/LINK then UNLINK/DELETE with read-only target stamps and final
required minima before a false postcondition. A real handler READ RPC marks an
admitted transaction before retirement; it completes its accepted build while a
subsequent fresh invocation refuses. Native handler plus registry checks pass
**8 tests / 156 assertions**, zero failures.
`/private/tmp/umf-actions-native-handler-complete.log` records that run.

Astra Ultra closed both findings independently with 18 local gateway/model tests
and 413 assertions, plus an explicit output permission matrix. Its exact
independent probe bodies are archived in
`scripts/actions-reference/output-capability-oracle.mjs`; the archival wrapper
uses authored expected outcomes and a portable invocation. Actual root replay
passes **14 executions / 13 unique scenarios / 15 matched expected output lines**.
The original getter fixture read its own getter once during setup and is retained
only for provenance; the corrected second probe demonstrates zero getter calls.
This finite pure evidence is separate from actual SQL/runtime behavior and is
not a universal or transitive-dependency completeness proof. Astra did not
independently run Docker.

Stable integrated regression passes **112 tests / 1937 assertions**, 33 files,
zero failures across actions/native/traceability. Strict tools TypeScript passes
with explicit runtime recipe/handler verification discrimination.
`/private/tmp/umf-actions-handler-installed-combined.log` records this run.
The qualification collector now reruns both independent finite oracles and
rejects any changed source/input inventory before publishing a capture. The
handler runtime image/version is observed separately. Full isolated-handler
exhaustion/denied-host-access/per-failure cleanup witnesses, durable operator
catalog lifecycle, recovery/audit/projection, independent full refinement and
current repository gates remain open; no full AC7 or US-056 certification is
claimed.

Fresh stable integrated foundation capture passes **60 tests / 1031 assertions**,
zero failures, PostgreSQL **17.9 (Debian 17.9-1.pgdg13+1)**, Bun **1.4.2**,
isolated Node **24.20.0** under the pinned container image. Both strict TypeScript
configurations pass. All **800 captured source/input hashes** were independently
recomputed with zero mismatches, and the collector verified equal pre/post source
inventories. It actually reran the 32768-case graph oracle (202 accepted, zero
mismatches) and 14-execution output capability matrix (all 15 expected lines
matched). `/private/tmp/umf-actions-handler-foundation-capture.log` records the
run; `fixtures/actions/reference-foundation.json` contains exact source/environment
identities and explicit unqualified dimensions. This is a partial versioned
qualification capture, not completion of the persistent certification goal.

### Core replay assertion repair and fresh qualification

The frozen `083c6fdd` replay completed 81 native commands, then command 82 failed on a strict object-prototype comparison of equal JSON data. The complete failed evidence is retained at `/private/tmp/umf-core-failed-083c6fdd-command82`. Astra Ultra independently confirmed additional instances in actual key recovery cases and reviewed the JSON/binary distinction. Qualification assertions now compare all JSON meaning through the governed JSON copier; binary recovery remains byte-strict. Both TypeScript configurations and the equality controls pass (3 tests, 10 assertions).

The fresh replay source is `1bb1a3e415b1bafec992f0da69bff0c9bcdf820a` in the disposable certification checkout. Full native, auxiliary, regression, publication and integrity results are pending. Certification remains **false**; prior successful action gates do not substitute for these prerequisites.

### Final portable union and witness audit

Astra Ultra's requirement audit identified missing executable witnesses for policy/actor attribution alternatives, three frame-ID collision forms, exact required Field value bindings and unsupported float/temporal declarations. Direct probes found correct current behavior. The shared public-API corpus now executes all 44 independently specified cases in Bun and Chromium, including JSON/YAML preservation and unchanged-source checks. Dedicated assessment tests distinguish opaque authorization declaration claims from enforcement and retain unoverrideable unknown, actor and value meanings. CONTRACT-052 explicitly names both role and policy authorization in its existing opaque profile exception.

The complete portable suite passes 54 tests with 332 assertions; both TypeScript configurations, all 351 schemas and Chromium 153.0.8010.12 parity pass with zero external requests. Astra independently reran the changed tests: 9 pass, 96 assertions. Durable raw gate logs are in `actions-certification-logs/`. The certificate includes actual CREATE/DELETE/LINK and isolation/exhaustion witnesses omitted by automated citation collection.

Replay `1bb1a3e4` was intentionally superseded after 46 successful commands with no recorded failure. The coordinator was paused and its current browser child reached terminal state before the owned container was stopped. Full historical evidence is retained at `/private/tmp/umf-core-union-audit-interrupted-1bb1a3e4`. Updated native contract capture and a fresh complete core replay remain required; certification is still **false**.

The final independently reviewed witness source is frozen at `6b5d29e7263b3282d1b0df47f6e3bac4141e23de`. Fresh preparation/native replay is running. The PostgreSQL reference qualification is also running to capture the clarified CONTRACT-052 fingerprint. Previous 119/1946 native evidence is historical until that recapture completes.

Current PostgreSQL recapture completed successfully: **119 pass, 0 fail, 1,945 assertions** on PostgreSQL 17.9 and Bun 1.4.2. All 825 captured inputs, including clarified CONTRACT-052, independently match both the working tree and frozen `6b5d29e7` replay. The genuine regenerated foundation report is synchronized into that checkout; guarded replay source is unchanged. Whole-core gates remain pending.

### Complete oracle JSON equality audit

Replay `6b5d29e7` completed 83 successful commands, including the repaired real SQL Server facet oracle, then failed command 84 in Avro selection. The tagged native JSON tree had identical values and different ordinary/null object prototypes. All failed evidence is retained at `/private/tmp/umf-core-failed-6b5d29e7-command84`; failed log SHA-256 is `e02f4bc60dd5ea8e696b96f9bce9458770f3c9b2568d8829450422cc8bb5441f`.

Astra audited the full 174-command inventory and nested helpers. All remaining governed JSON Document, tagged NativeJson AST and receipt metadata comparisons now use the existing JSON equality contract. Optional document-extension absence is checked explicitly, required native elements must remain present, and native bytes/Datum ABI/scalar checks remain strict. An actual Avro JSON/YAML regression preserves the exact unknown native number token `9007199254740993` and rejects a changed token. Host controls pass 4 tests/13 assertions and both TypeScript configurations pass. Current native action evidence still matches all 825 inputs in both trees.

Source is frozen at `1ee31cb0a8a60ebddec8a74a4a7dd4cfe2f90934`. The pinned Linux runner executes preparation, real Avro selection preflight and equality controls before a fresh full native replay. Auxiliary, complete regression, publication and integrity qualification remain pending; **certified:false**.

Pinned Linux preflight passed the actual repaired Avro selection oracle: 20 native parser cases, 32 sample recoveries, 3 expected parser refusals, 8 resolved/2 refused selections and 20 document-format recoveries. Linux equality controls pass **4/4 tests, 13 assertions**. Durable raw logs are `actions-certification-logs/core-avro-preflight.log` and `core-json-controls.log`. The full fresh174-command replay is live, followed by all downstream gates.

Astra's existing read-only retained-fixture facet probe reached terminal exit 0 across all five systems: 1,802 authored cases, 2,390 ideal recoveries and 3,880 native-format recoveries, with refusal controls passing. It imported the source before the latest preventive comparator edits and wrote no evidence files; these figures are additional consistency analysis, not current frozen-source native qualification.

Astra Ultra final evidence-map audit verified the existing captured inputs, fixture lineage, witness hashes, evidence artifacts, formal reports, and linked logs against current bytes. The certificate now explicitly binds the eight governing US/TD/STP/Contract documents by SHA-256 and cites existing discovery-policy and native relationship-invariant tests for US-056-AC5 and AC8. Full current core replay and downstream gates remain pending; this is not certification.

The 1ee31cb0 replay passed140 commands and failed command141 on a hard-coded foreign Python checkout path (ENOENT). Its full incomplete run is preserved separately. Two Python launchers now use the configured interpreter or local .venv; the relationship integrated regression inherits configured runtime paths. Tools type checking and Astra Ultra review passed. Actual commands141–174 then passed as a34-command native/browser preflight, with raw logs retained. The full sequential qualification now runs from frozen replay revision fb3d05fdf17cb4221b6e06518bae4a823d78da31. Certification remains pending the complete replay and downstream gates.

Frozen revision fb3d05fdf17cb4221b6e06518bae4a823d78da31 completed all174 native/browser commands and all6 auxiliary checks with zero failures. Independent audit verified174 raw execution-log hashes and6,990 captured source inputs. The disjoint full regression is running; publication and final admission/integrity gates remain pending. The certificate remains certified:false.
