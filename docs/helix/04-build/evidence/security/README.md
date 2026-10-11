# Shared security execution evidence

Owner direction: 2026-10-08. Requirements/design are drafted under FR-45,
FEAT-008, US-055–057, CONTRACT-052/053, SD-008 and TD-055–057. Formal/native
spikes have scoped execution evidence. Full extension and backend acceptance
remain open. The owner resumed implementation after OrbStack recovered; fresh native probes run again.

The table below retains early spike checkpoints; the current qualification summary follows it.

| Evidence | Recorded checkpoint | Qualified scope |
| --- | --- | --- |
| [formal.json](formal.json) | 15 checks passed; UNSAT violations with SAT weakened controls | Typed identity, composition, incomplete-fact refusal, write conjunction, bounded logical/flat/graph mapping, event ordering and mask algebra |
| [semantic.json](semantic.json) | 14 Bun tests, 36 assertions; strict typecheck | ProjectRead/disposition spike, not full policy package or language |
| [browser.json](browser.json) | 10,368 decisions match; zero external requests/host globals | Chromium 148.0.7778.96 / Bun 1.4.2 bounded spike |
| [native.json](native.json) | 44 checks passed | PostgreSQL 17.9 raw/synthetic graph RLS, private-fact access and field-projection feasibility |
| [lifecycle.json](lifecycle.json) | 5 cases passed | Native drain, host-buffer release/discard and unsafe early-session-close/stale-snapshot negative controls |
| [pg-driver.json](pg-driver.json) | 9 observations passed | Bun SQL ordinary reads/private facts, buffer release/discard, data loss and coordinator-loss controls |
| [epoch.json](epoch.json) | 7 native checks passed | Participating private native epoch protocol; old snapshot, rollback gap and missing-state refusal |
| [databricks-actors.json](databricks-actors.json) | Not qualified: zero distinct non-installer actors | Live native authentication observations; no SQL grants or backend qualification |
| [weft-admission.json](weft-admission.json) | 31 owner Rust tests passed; canonical schemas/strict overlays match | Source/snapshot custody, ontology closure and declared policy term types/scopes; activation remains unsupported |
| [weft-version.json](weft-version.json) | 4 observations passed | Fresh owner Rust compiler: original core07 compiles, correctly re-pinned core08 refuses at request envelope |
| [acceptance.json](acceptance.json) | S01–S12 pass; required implementation gate red | Historical initial checkpoint: 132 required cases / 28 criteria; 120 backend cases were open |

Current qualification is 26/132 required cases, leaving 106 native cases and all 28 complete acceptance criteria open. Qualified current component evidence includes 23 fresh native namespace observations, 143 raw scalar/composite/hash/decoder identity observations, 961 raw write component observations, 1119 raw field-write component observations, 78 scoped truth/lowering observations, and 82 subject/runtime observations. Actual owner compilation currently has 71 Rust tests; these components do not qualify a complete graph backend. Current Chromium replays use Chrome 153.0.8010.12; earlier Chrome 148 evidence remains historical. Three scoped-composition conditional checks and four actual-gate receipt controls address Astra review findings. See exact receipts and the implementation plan for versions, assumptions and remaining obligations.

Formal checks prove encoded properties under retained assumptions. They do not
prove installed roles, trusted issuers, complete mappings or backend execution.
Native results are independent witnesses for the selected disposable fixture.
No actual Truss/Ashlar installation, native Delta security or production policy
service is qualified. Bun packageManager 1.3.14 replay remains separate from
the measured Bun 1.4.2 environment.

The native stale-snapshot case is a successful **negative control**: fresh reads
deny after removal while an old repeatable-read snapshot still permits. Therefore
RLS plus a newly observed generation cannot qualify current authority without
fresh compatible facts. The contract now explicitly requires restart/refusal.

## Traceability and phase assessment

Every formal/native test record lists scoped AC coverage. Scope-linked evidence
does not close a whole criterion that has additional tests. The story plans own
the per-AC allocation; backend procedures expand physical cases. All 28 P0
criteria remain unchecked until their complete required evidence passes.

Requirements and shared design cover logical/physical separation, relationship
authorization, mandatory composition, protected fields/query use, writes,
revocation/history, complete private observation and native qualification.
Production realization gates remain: independently authenticated native fact/source
admission, Weft-owned lowering interface adoption, actual Truss store/routine/grant closure,
and actual Delta/Ashlar compute/policy/time-travel/authority coordinator profiles.
No generic engine or formal tool supplies those missing native facts.

## Review and corrections

An independent read-only HELIX reviewer found and rechecked five contract gaps:
false-permit obligations, protected-field defaults, streaming/direct guard
boundaries, old snapshots and indeterminate collections. They are corrected and
allocated negative scenarios. Follow-up review added three-mask associativity,
guard crash/cancellation schedules and fresh execution provenance to the gate.
Review found no overclaim in the stated conditional/finite proof scope.

## Failed attempts retained

[native-attempts.json](native-attempts.json) records the initial native connection
failure before any policy test passed. Browser attempts initially lacked local
Playwright resolution, sandbox localhost permission and a matching bundled
browser executable; the final run explicitly uses the installed executable and
records its version. The initial Bun filter needed a `./` path prefix. The initial
TypeScript invocation needed `--ignoreConfig`; strict typechecking then passed.
The fresh acceptance gate initially used ArrayBuffer directly with node crypto;
it was corrected to Uint8Array and remains red for the intended missing runners.

## Next implementation gates

1. Complete CONTRACT-052 fact admission and full expression execution, building
   on the implemented structural/typed package; execute remaining STP-055 cases
   in Bun/Chromium while preserving unknown/native policy content.
2. Bind reviewed Weft lowering and native deployment admission under CONTRACT-053.
3. Execute each backend's STP-056 procedures against actual selected installations.
4. Execute STP-057 authority/history/propagation schedules and retain every failure.
5. Require all required cases, exact source/versions and independent native inventory
   before changing backend qualification or marking the active goal complete.

### Production component progress (2026-10-08)

`src/extensions/security/logic.ts` now exports bounded strong-Kleene truth and
rule composition through the public entrypoint. It defensively copies input
without invoking accessors and refuses unknown members, malformed truths,
non-permit disclosure and unsupported transforms. The interpreted transform
subset remains boolean/string constant replacement. It implements mandatory
restrictions, conservative scoped U refusal, protected defaults, false-permit
exclusion, withheld dominance and transform conflict. It composes already-scoped
evaluated rules; it does not authenticate, resolve ontology, admit facts or
authorize native effects. Full policy/extension admission remains open.

[logic-browser.json](logic-browser.json) records real Chromium 148.0.7778.96
execution: 795 explicit composition/mask observations, zero mismatches, zero
external requests and no Bun/process/Buffer globals. Bun 1.4.2 ran the production
logic and runner tests: 10 tests, 865 assertions, zero failures. Strict TypeScript
7.0.2 checks passed for the logic and runner components. These observations
support parts of AC4/AC7/AC10; they do not close whole criteria or replace the
132 required execution cases.

`tools/security/run-command.ts` now bounds combined output and deadlines using
a POSIX process group. Normal exit, timeout and output overflow kill remaining
members of that group; collection has a 250 ms cleanup bound. Tests observe
descendant termination even with inherited pipes. Deliberately detached/escaped
descendants are outside this profile: runners remain trusted reviewed code,
and this helper is not an OS sandbox. Windows is explicitly unsupported.
The fresh gate fingerprints this helper and its own source. It remains red and
makes no backend support claim; current per-case progress is recorded below.

The native disposable container was removed after evidence capture.

### Typed policy package and fresh-case progress

The production `umf.security` 0.1.0 document-scope package, standalone policy
and ontology schemas, preservation APIs, explicit pinned-resolution inspection
and registry integration are implemented. CONTRACT-052 now specifies the exact
serialized term, association, field classification and constant-output shapes.
Nested correlated Ownership/Assignment references resolve against current core
Records and stable Keys, independent of physical table/node/edge storage.
Unknown security meaning remains retained and refuses interpretation. Registry
inspection without an explicit ontology/document closure remains incomplete.
Successful typed inspection alone establishes no fact authentication or native
enforcement. The new bounded read evaluator executes correlated expressions
over host-attested snapshots. Its authority boundary is explicit in CONTRACT-052;
client flags never establish trusted facts. Writes/history/revocation and native
query execution remain outside this component.

[components.json](components.json) retains actual focused commands: 56 tests,
1,905 assertions, zero failures; both project TypeScript checks; 60 package and
349 JSON Schema audits. [logic-browser.json](logic-browser.json) now includes
795 composition observations and 24 typed-policy/preservation checks and 10 independently expected
fact-evaluation outcomes in real Chromium, with exact Bun parity and zero mismatches/external requests. The
masking citations were corrected to US-055-AC7; AC5 concerns assignment behavior.

[acceptance.json](acceptance.json) freshly executes S01–S09 with 7/5/19/7/11/20/25/36/13
observations respectively, pre/post source fingerprints and fresh run IDs.
They pass their complete named refusal/preservation assertions. The gate still
fails on 120 required backend cases.
The 28 security criteria remain unchecked. The general citation ledger now
keeps partial security citations separate from accepted security criteria and
requires the complete fresh gate plus authored acceptance to close them.

Reproduce focused evidence with `python3 tools/security/components.py` and
the browser command documented for the installed Chromium executable, replacing
the entrypoint with `tools/security/browser.ts`. Reproduce fresh case progress
with the existing acceptance command. The bounded thirteen-proof run was
reproduced against the amended contract fingerprints; its original scope and
native-installation exclusions remain in force.

The broader `bun test tests` diagnostic run is tracked in
[regression.json](regression.json). It has observed failures in existing strict
prototype-equality round trips, stale native evidence and historical absolute
evidence paths. The expanded traceability-count failure was corrected and the
affected tests passed in focused replay. Edits occurred during the broad run,
so it does not qualify final current sources even after it terminates. No native
fingerprint was merely updated to hide an evidence failure.

The broad diagnostic tool handle expired without a retained terminal status;
its result remains unqualified. The Databricks aidev-cus profile authenticated
on this host during read-only inspection. No native security test namespace,
ordinary subject inventory or backend acceptance is inferred from that check.

Fresh ownership vectors include actual Client/Project facts: same-client sibling
Project access denies, any/all owners differ, and a nonempty-owner requirement
prevents vacuous ownerless permission. Identity vectors distinguish same-labeled
Records from another document, Unicode normalization variants, and integers
above host floating-point precision. Native mappings remain independently open.

S10 now freshly executes real Chromium through the reviewed acceptance runner,
with a unique run ID, source pre/post fingerprints, Bun parity, bounded loopback
loading and no host globals/external requests. S12 freshly replays all thirteen
Z3 checks and verifies UNSAT safety, SAT population and SAT weakened controls
against an explicit test oracle. Their qualified scopes remain unchanged.
The fresh gate therefore passes eleven named semantic cases; S11 and all 120
native/backend cases remain open.

Current Truss CONTRACT-012 and its 0.12 packet were inspected again. They remain
a source-only 46-table/442-column handoff with native bodies, security dependencies,
identity correspondence and installer/adoption unfinished. The generic PostgreSQL
spike cannot substitute for that installation. Databricks authentication is
available; an asynchronous request for a disposable namespace and independently
authenticated ordinary subject profiles is pending. Independent shared work
continues without inferring those identities from installer credentials.

## Immutable registration and complete named semantic matrix

`SecurityReadRegistration` admits complete definitions into a bounded host-owned
registry. It snapshots meaning, refuses content-changing reuse of policy, ontology
or core source revisions, commits pins atomically and refuses forged/foreign
handles. Two focused tests cover immutable source mutation, stale classification,
core revision reuse and preservation of a prior definition. Five additional
registration outcomes match in Chromium and Bun. Host construction/source custody
and authenticated facts remain independent native obligations; handles and
source flags are not credentials. The thirteen conditional proofs do not prove
this complete registry implementation.

S11 freshly exercises sixteen generated corruptions with retention/refusal
observations, plus stale classification, original-definition continuity, forged
handles and opaque native-issuer content against untrusted facts: 54 observations.
The current gate freshly passes all twelve named semantic cases and fails solely
on the 120 unimplemented backend runners. All 28 story criteria remain unchecked
while the full required gate is open. Backend support has not been inferred from
the completed semantic matrix.

## Portable authority guard

`SecurityAuthorityGuard` supplies bounded FIFO shared/exclusive coordination for
trusted hosts. Seven barrier-driven Bun tests pass with twenty assertions, and
seven guard observations match real Chromium. The observed drain barrier holds
an admitted read through final application release, excludes later readers during
change and gives them the new generation afterward. Active cancellation does
not forcibly release buffered output. Unknown producer outcomes permanently
close admission; reused generations and excess admission refuse before effects.

This is single-realm coordination. It does not prove native writer participation,
distributed fencing, crash cleanup, streaming release or authority freshness in
old database snapshots. Callback settlement must include final release/cleanup
on success and failure. The native acceptance count remains 12/132, with all
120 backend cases open; existing finite formal proofs do not cover the entire
new asynchronous implementation.

## Native original-caller correction

The raw and synthetic graph feasibility helpers now resolve Staff using the
original PostgreSQL `session_user`, never an adopted `current_setting('role')`.
A disposable membership-drift schedule grants Bob's role to Alice, connects
originally as Alice, adopts Bob and still observes only Alice's raw/graph rows
and masked field projection. A weakened raw helper selects the adopted role
and produces Bob's resource: the retained expected counterexample demonstrates
the identity defect. The exact original/weakened helper source, membership drift
and restoration are retained in native.json. Ordinary session-authorization
change refuses, and a caller-authored subject GUC has no effect.

The fresh PostgreSQL 17.9 replay passes 44 native observations. Membership drift
is intentionally unqualified and is restored; original-caller capture does not
replace complete native-role inventory. This fixture remains raw/synthetic graph
feasibility, not actual Truss or backend production acceptance. Dependent native
lifecycle schedules are replayed at the corrected source fingerprints. No Docker
ports are published; local trust authentication and the excluded Docker/installer
actor belong to this disposable fixture only.

## Semantic write admission

`evaluateSecurityWrite` now checks original/proposed/both states, every changed
field's mutation action, separate ownership/policy actions and complete field
coverage. It refuses mixed authority generations, changed non-ownership facts,
unknown binding content and incomplete profiles. Null/absence and literal values
are compared distinctly. The evaluator returns only a decision and executes no
write effects. Hosts must independently establish actual state custody, complete
policy/ownership classification and guarded native atomicity.

Five focused write tests pass (17 assertions), and five independently expected
write vectors match Bun and Chromium. The complete focused run passes 53 tests
with 1,898 assertions, project typechecks and all package/schema audits. The first
write component replay's TypeScript narrowing failure is retained in
[components-write-first-attempt.json](components-write-first-attempt.json); it is
historical failed evidence, not current qualification. Current source was fixed
and commands replayed. Native write acceptance and all 120 backend cases remain
open; the finite write-conjunction proof does not prove this entire implementation.

## Policy-dependency omission correction

`securityPolicyDependencies` now derives qualified live field and association
inventory dependencies from complete typed policy meaning. It includes subject/
resource/variable key components and endpoint components/target keys; constant
literal domains do not count as live reads. The first fixture independently
expects eight qualified fields and two association inventories. Unknown semantic
content cannot return a complete-looking closure.

Write admission now refuses a binding that omits a policy-read target field from
its separate policy-attribute classification. A regression adds a salary-dependent
policy condition: omission refuses, explicit classification without change-policy
authority denies, and the separate grant permits. Association create/delete also
requires separate policy authority when its inventory is a dependency. Three
new tests pass with seven assertions; dependency vectors and the omission control
match in real Chromium. The focused suite now passes 56 tests/1,905 assertions.

This closes a portable binding-validation gap, not native writer/provenance or
compiler adoption. All 120 backend cases remain open. Current finite formal
checks do not prove the complete dependency-analysis implementation.

## Native epoch/snapshot protocol spike

`epoch.sql` and `epoch.py` execute a separate PostgreSQL 17.9 candidate protocol
with private epoch table/sequence and a coarse definer guard. A shared native
advisory guard precedes explicit epoch admission. A statement's MVCC epoch row
must match the non-MVCC sequence state. The actual ordinary RR session opens its
snapshot through a public catalog read, then attempts its first protected read
only after a separately committed authority change. Epoch admission refuses
before resource rows. Fresh current admission observes the revoked result.

All seven native checks pass: healthy admission, private epoch/clock access
refusal, fresh current authority, first protected read from stale RR, a sequence
advance followed by rollback, and missing epoch refusal before an empty query.
Original setup startup failure/readiness replay is retained in
[epoch-attempts.json](epoch-attempts.json). Two added Z3 checks retain unbounded
integer equality/rollback-gap premises, UNSAT violations, SAT populations and
SAT weakened controls. They do not prove the complete native implementation or
all writer participation. The formal matrix now contains fifteen checks.

Reproduce in a fresh owned PostgreSQL 17.9 container without published ports:
run `native.py`, then `lifecycle.py`, then `epoch.py` from the spike directory via
their repository-root paths. Epoch cases intentionally leave missing/corrupt
state in that disposable namespace; discard it afterward. The owned container
is removed after retained evidence. Do not treat missing/rollback mismatch as a
reusable current epoch; recovery needs independent commit/fact reconciliation.

This protocol remains a native spike. Direct-SQL closure, all native authority
writers, rollover/reset exclusion, application final release and recovery are
not qualified. Every protected operation must explicitly admit the guard before
any rows/counts, including empty queries. RLS alone cannot guarantee that a guard
predicate runs for a zero-row query. All 120 backend cases remain open.

The initial concurrent epoch-era replay hit seven semantic runner deadlines and
the 60-second component deadline. These failures are retained in
[acceptance-epoch-timeout.json](acceptance-epoch-timeout.json) and
[components-epoch-timeout.json](components-epoch-timeout.json). The component
wrapper now records deadline failures instead of exiting without a fresh receipt.
Only after the original handles were confirmed terminal were commands replayed
at unchanged deadlines. The fresh sequential replay passes all twelve semantic
cases and all component commands; fifteen formal checks pass. Current source
freshness/allocation validation passes 22 checks, including the new epoch receipt.
Native/backend acceptance remains 120 cases open.

## Databricks actor availability and compiler handoff

The configured `scope-test` profile was queried through the native current-user
API, then both profiles were freshly observed by `databricks-actors.py`. They
return the same active native actor ID. The preflight correctly reports zero
distinct non-installer actors and exits nonzero. It retains CLI/source versions
and selected identity/context metadata, never credentials or raw auth diagnostics.
Configured context is not independently verified server/SQL context. No ordinary
Staff identity or SQL role eligibility follows from profile labels. The pending
request for disposable target and independent ordinary credentials remains open.

TD-056 now records concrete compiler interfaces: Weft's generic obligation
transport is available, but it does not perform security lowering or native
verification. The inspected v0.1 loader explicitly checks UMF 0.7.0, requiring
an explicit compatibility path for this extension's pinned 0.8.0 documents.
Scalar emission checks resolved type/nullability/carrier/decoder correspondence;
changed output type and tagged disclosure cannot be silently passed as canonical
scalar output. Newer backend-owned field/artifact profiles need their own explicit
security result-domain adoption. These version/result-domain and host-checker
gaps remain production integration work, not a reason to relabel source metadata.

## Application-buffer lifecycle witness

The fresh PostgreSQL 17.9 replay passes 44 native fixture checks, five lifecycle
witnesses and seven epoch checks. The new host-buffer schedule reads as the
actual ordinary Alice connection, commits its native read transaction while
retaining RA in a Python application buffer, and holds a session advisory shared
lock. An independent revoker is observed waiting in `pg_locks`. Final release
or cancellation discards the buffer before unlocking; acknowledgment follows,
and a fresh ordinary read returns zero rows.

A weakened control closes the guarded native session before invalidating the
host buffer. Revocation acknowledges while RA remains releasable. This is a
successful counterexample, not a supported cancellation strategy. A connection
loss must invalidate every result-release path or use independently held host
coordination that drains those paths before acknowledgment. Distributed process
failure, actual public backend drivers, HTTP/stream cancellation and complete
writer participation remain open; none of pg-raw.L03/L04/L11 is closed by these
witnesses. The exact owned disposable container was removed after execution.

The disclosure component's focused suite passes 58 tests/1,916 assertions, both
typechecks and package/schema audits. Real Chromium passes the new typed transport
round trip and malformed withholding checks. S01–S12 remain fresh passing cases;
the full 132-case gate remains red with all 120 backend cases open.

## Public Bun SQL driver witness

Six fresh observations in `pg-driver.json` pass on Bun 1.4.2/PostgreSQL 17.9.
The source-qualified witness uses actual ordinary connections and private native
SQLSTATE, plus independent native lock waits through host buffer release/discard.
Its exact owned container uses an ephemeral loopback-only port and is removed.
The first attempt's SQLSTATE extraction error and two initialization-server
readiness failures are retained separately. Native TCP readiness fixes the latter;
no deadline increase or skipped control supplies the passing result.

This strengthens physical integration evidence but does not close any B/L case:
compiler lowering, native inventory/source custody, prepared artifacts, full driver
failure/cancellation/streaming controls and complete authority participation remain
open. The full acceptance gate therefore remains 12/132. Bun's driver reservation
and transaction API are documented at https://bun.com/docs/runtime/sql; the witness
uses the installed 1.4.2 runtime and installed types rather than treating current
documentation as historical runtime evidence.

## Data-connection-loss schedule

The seventh fresh `pg-driver.json` observation uses an actual reserved ordinary
data connection and a distinct ordinary coordinator connection. The assessor
terminates the exact native data PID; the same reserved handle reports failure.
A native lock observation shows revocation remains blocked while RA is still in
the host buffer. Buffer invalidation precedes coordinator drain/acknowledgment,
and a new ordinary connection observes zero rows. Evidence is written only after
SQL pool/native container cleanup succeeds. This narrows the earlier early-close
counterexample with an explicitly independent guard owner; coordinator loss,
nonparticipating writers and distributed buffer custody remain unqualified.
No backend acceptance case is marked complete by this schedule alone.

## Coordinator-loss controls

Nine fresh public driver observations pass. Native coordinator termination
reproduces a counterexample: the native-only waiting revoker acknowledges while
RA remains in the host buffer. The participating single-realm guard instead
keeps the exclusive transition producer queued until the host buffer is discarded
and its read callback settles. Fresh ordinary reads after acknowledgment return
zero rows in both schedules. These are scoped negative/positive controls, not a
complete native profile. Cross-realm release handles, independent native writers,
trusted clock transitions and production compiler/host custody remain open.
The receipt includes the exact shared guard/type source hashes and is published
only after owned native resources have been cleaned up.

## Fresh owner-compiler version probe

An isolated offline/locked build of the current Weft owner source executes two
qualified fixture requests and their re-pinned core 0.8 variants. Both originals
compile; both variants return WFT-INPUT with no partial executable artifact.
The receipt pins all inspected owner Rust/contract/schema sources and corpus
bytes before/after build and execution, plus the emitted binary digest. This
locates the first actual integration gate at the public request schema, ahead
of catalog loading. Explicit versioned owner transport, semantic admission and
security/result-domain adoption remain required. No compiler fork or source
relabeling is introduced by this probe. The shell initially lacked Cargo on PATH;
the replay uses the existing isolated Rust 1.90.0 toolchain/cache rather than
installing another toolchain or downloading dependencies.

## Owning compiler source/transport implementation

Weft now has FR-19–22/CONTRACT-005, explicit compile request/blocked response 0.3,
canonical core08 schema custody and a separate Rust preparation path. Five new
admission tests and ten existing frontend/envelope tests pass in the retained
fresh-source command. The backend factory is not invoked for unsupported security.
Existing core07 transports stay unchanged; full core08 property/security semantics,
compiled security result domains and Rust/Python/browser/native implementation
acceptance remain open. These foundation refusals do not count as positive backend
acceptance or close any of the 120 backend cases.

## Rust policy/ontology source-shape admission

The current source-qualified owner check passes nine security admission tests plus
ten prior frontend/envelope tests. Canonical policy/ontology schemas are copied
exactly; selected-source overlays differ only by refusing unknown members on
objects with declared semantic properties. The native archive remains opaque.
Overlay correspondence and the shared correlated Project fixture are checked.
Rust preserves original source strings and immutable parsed trees, checks the
shared expression depth/node bounds, duplicate keys/rule IDs, permit-only disclosure
and exact policy/ontology/core document revision closure. Bounds, unknown source
meaning and stale/missing pins refuse before the backend factory can run.

This is source-shape/pin admission, not complete ontology field/key/domain/variable
interpretation. Well-shaped sources remain WFT-SECURITY-UNSUPPORTED after this
stage. Rust/Python/browser policy interpretation and native lowering/host admission
remain required. The earlier interactive workspace regression reached terminal
exit0 for its pre-source-packet checkpoint; it is not presented as fresh whole-
workspace evidence for these later source changes. Current targeted evidence is
retained independently, with exact source custody.

## Rust ontology reference closure

The fresh owner admission run now passes fifteen security tests plus ten prior
frontend/envelope tests. The correlated fixture resolves five logical types and
eleven fields; adding a second document with identical local IDs produces six
types/twelve fields rather than merged identity. Corrupt classifications, keys,
qualified document references, endpoint types/arity/domains and duplicate types
refuse. Unknown selected domain qualifiers/length units and inapplicable scalar
facets refuse. Endpoint matching retains declared component order and domain
shape, including nullable/facet/allowed-value declarations.

This reference-closure stage does not establish complete literal/facet semantics,
expression variable/type inference, native uniqueness or physical mappings. It
still ends at unsupported activation before backend composition. The earlier
whole-workspace checkpoint is historical; these current checks are independently
source-pinned. No native/backend criterion is closed by reference closure alone.

## Rust declared policy term checking

Twenty-one security tests plus ten prior frontend/envelope tests pass at current
source hashes. The correlated Project policy checks two rules/nine expression
nodes. Lexical exists scopes require fresh variables and association declarations;
subject/resource/context/variable fields must belong to their selected binding.
Endpoint roles resolve exact target type/key identity. Mixed scalar/identity,
different qualified identity or different declared scalar domain operands refuse.
Undeclared actions, duplicate targets, invalid output membership and mismatched
basic constant wrappers refuse. Expanded target checking is bounded.

Source packets now retain exact model pins and recheck source custody. Changed
model bytes and rehashed inputs different from the prepared catalog definitions
refuse. Type checking derives closure from the same snapshot rather than accepting
a separately supplied closure. These helpers remain data/type checks, not credentials.
Exact numeric/facet/allowed-value literal validity, security truth/IR composition,
physical lowering and native host admission remain open; the activation gate
still precedes backend composition. No required backend case is closed.

Current formal/query-use increment: `existence-unbounded-formal.json` records three quantified first-order checks over arbitrary witness populations, with independent least-upper-bound semantics and explicit completeness/scalar/cut premises. `weft-original-use.json` records ten owner checks/six artifacts; `truss-original-use.json` records 359 native observations (including five unregistered-path counterexample observations; enrolled persistent-publication controls remain a qualified spike); `truss-original-use-browser.json` matches ten native programs and fifteen refusals, plus immutable-input controls. These strengthen model semantics and the first compiler-derived raw field/operator integration. They do not prove full compiler/native refinement or close B08, graph, issuer, privacy or final-release criteria. Current aggregate components pass nine command groups, phase validation passes 72 checks, and the 470-criterion ledger is current. The complete gate remains 22/132 with all 28 security criteria open.

### Conditional original-source completeness theorem — 2026-10-08

`original-source-completeness-formal.json` retains four quantified Z3 checks over arbitrary eligible resource populations. An independently stated universal specification (each eligible resource has exactly one carrier with all required fields) is equivalent to anti-existence admission. Empty application results cannot hide unavailable source; unauthorized original actions and duplicate/null carriers cannot admit. Each check has an UNSAT violation, SAT weakened control and SAT positive control. Exact native key correspondence, truthful eligible-root RLS, complete carriers, field availability, independent action authorization and a stable authority/source cut through final release are explicit premises. This proves the admission algebra, not SQL generation or backend isolation. The current 74 native observations cover missing eligible carriers and restoration, but do not establish every formal premise or all duplicate/null implementations. Full B08 and graph/native acceptance remain open.

Verification for this theorem increment: four conditional proof checks pass; nine aggregate component command groups pass; phase evidence validation passes 73 checks; the acceptance ledger remains current at 470 criteria. Full backend gate remains 22/132, with no backend criterion promoted by the theorem.

### Malformed original carrier refusal — 2026-10-08

The fixed private PostgreSQL query routine now normalizes caught execution errors to an authored 42501 refusal before results are returned. Added eligible-carrier controls for null, text sentinel, fractional number, signed64 overflow and object values across all ten populated/empty application routines, plus exact restoration. Fresh PostgreSQL 17.9 receipt passes 125 observations. These controls require no output, 42501, and absence of the sentinel/cast diagnostic categories in ordinary-client stderr. This is not a general proof of diagnostic noninterference; cancellation/assertion exceptions, timing, logs, concurrent mutation and complete physical admission remain unqualified. The boundary is the explicitly authored fixed spike installer, not an activated production compiler/runtime API. B08/B10 and graph criteria remain open.

### Duplicate original-source cardinality controls — 2026-10-08

Fresh PostgreSQL 17.9 evidence now passes 138 observations. Owner-authored replacement of the private original view duplicates the eligible RAB projection while retaining base-table primary keys. All ten populated/empty query routines refuse before results; exact restoration recovers the aggregate. Duplicating ineligible RB leaves the eligible aggregate unchanged, followed by restoration. This concretely exercises the exactly-one-carrier branch of the conditional completeness theorem. The mutation is an authored fixture owner change: it does not demonstrate authenticated source installation, native dependency sealing, current-epoch/source drift admission or concurrent stable-cut enforcement. Full B08/B10 and actual graph backend cases remain unqualified.

### Hidden carrier error interference counterexample and native fix — 2026-10-09

The expanded native test found an actual privacy counterexample: changing only unreadable RB salary to JSON null made Alice's eligible predicate query fail. The vulnerable fixture source and observed failure are retained as `original-use-hidden-carrier-vulnerable.py.txt` and `original-use-hidden-carrier-counterexample.json`. Root RLS alone did not isolate malformed carrier evaluation in the native query.

The fixed spike installer enables and forces SELECT membership RLS on the private original carrier relation, using the same compiler-derived read membership predicate. PostgreSQL catalog observations independently verify enabled/forced RLS, guardian ownership and the authored SELECT policy. Fresh PostgreSQL 17.9 evidence passes 240 observations, including all five malformed hidden-carrier variants across all ten operator/empty-result programs: eligible outputs remain unchanged and client diagnostics are empty. Restoration, eligible missing/malformed/duplicate refusal and private-source access controls also pass.

Physical lowering must isolate every protected carrier before operations that can evaluate its stored values or errors; root row filtering plus a private view alone is insufficient evidence. Require either native policy on the carrier or an independently validated equivalent barrier, including hidden malformed-value regression controls. This applies to raw and graph carrier homes. The fixed authored installer is still a spike; native dependency/source sealing, concurrent authority cuts, timing/log noninterference, full backend B08/B10 and public compiler activation remain open. Full gate remains 22/132.

### Captured complete physical mapping inputs — 2026-10-09

Experimental raw-query-home binding 0.2.0 includes the subject and complete authored physical type mappings (root, subject and associations), in addition to the original carrier home and target. The portable consumer compares captured inputs to the exact original binding and the profile/handoff binding identity before lowering. The reviewed bridge reads physical mappings from these captured bytes. This closes the prior caller-substitution gap for completeness-root and policy association mappings; binding hashes establish correspondence, not issuer authenticity or native catalog equivalence.

Actual owner export passes ten checks/six artifacts; freshly replayed native programs retain 240 passing observations. Four conditional source-completeness proofs are refreshed against the consumer source. Chromium controls additionally refuse substituted root table, association field column and subject type. Native mapping admission, schema drift/epoch, authenticated source custody and final-release guards remain host duties and open backend acceptance. Full gate remains 22/132.

### Cross-source ontology/profile join — 2026-10-09

The portable original-use consumer now requires the profile's ontology digest to equal the captured handoff/ontology digest, and requires the selected subject to equal the ontology subject. Individual matching source hashes alone did not establish these joins. Chromium's new substitution control changes the ontology revision and recomputes its standalone handoff hash while retaining the original profile; the consumer refuses. This is cross-source identity checking under trusted owner provenance, not source authenticity or proof that logical IR was compiled correctly. Native programs retain 240 passing observations and the four conditional completeness checks remain scoped to their explicit premises. Full backend gate stays 22/132.

### Pinned compiler handoff snapshot — 2026-10-09

The portable original-use consumer now requires an expected SHA-256 for the canonical complete handoff snapshot, including logical plan, application plan and query-use lineage. The reviewed fixture host computes the pin only after fresh original-owner replay; later handoff mutation refuses before rendering. This closes consumer snapshot substitution under the trusted pin-provider premise. A caller-supplied pin is not authority: public activation must establish this custody independently, and that protocol remains open.

Chromium controls remove the application filter while retaining the original pin and supply a wrong handoff pin; both refuse. Existing capability/projection/action/cross-source semantic controls recompute their altered snapshot pins so their rejection still tests independent admission rules rather than only snapshot identity. Fresh native programs retain 240 passing observations and conditional completeness proof scope is unchanged. Complete compiler refinement, trusted public issuer/pin custody, native epoch admission and final release remain unqualified. Full gate stays 22/132.

### Exact original integer boundaries and aggregate widening — 2026-10-09

Fresh PostgreSQL 17.9 evidence passes 252 observations. Added signed64 minimum/maximum carriers across all ten operator/empty programs and exact restoration. Actual owner IR declares each SUM argument signed64 but its nullable integer result has no integer-width facet. PostgreSQL's numeric SUM result therefore preserves the admitted result: summing two signed64 maxima yields lexical `18446744073709551614`, and summing minimum plus maximum yields `-1`. Stored boundary values are authored as native numeric SQL literals; outputs stay text and never pass through JS Number. This qualifies the fixed integer subset only, not arbitrary aggregate facets/domains, protected projection, complete backend acceptance or issuer/current-cut guarantees. Full gate remains 22/132.

### Conditional hidden-carrier error isolation theorem — 2026-10-09

`carrier-error-isolation-formal.json` records four quantified two-world Z3 checks. Worlds share eligible resources, original action authority and all eligible carrier validity/cardinality while hidden carrier content is unconstrained. Eligibility-limited evaluation preserves admission and carrier-error outcomes; no eligible resources means no carrier error; malformed eligible carriers cannot admit. Each check retains an UNSAT violation, SAT negative control and SAT positive control. The all-carrier evaluation mutant yields a concrete SAT hidden-error interference control corresponding to the observed PostgreSQL regression.

The theorem requires exact eligibility, complete source cardinality, evaluation confined behind a truthful native barrier, faithful scalar domain checks and a stable source/authority cut. It does not prove the PostgreSQL optimizer/barrier, graph/Delta mapping, arbitrary result values, timing/log/diagnostic payload noninterference or full backend refinement. The 252 native observations remain separate empirical evidence for the fixed PostgreSQL raw spike. Required B08/B10/B15 backend cases must establish these premises rather than inheriting acceptance from an abstract proof.

### Original-query epoch integration and stale-snapshot control — 2026-10-09

Fixed authored native original-use routines now check private table/sequence authority generation before original-action admission, source completeness and application execution. An actual ordinary TCP/SCRAM connection establishes repeatable-read with a returned snapshot barrier; installer commits Assignment revocation plus generation advancement before the first protected read. The old connection refuses without output. A fresh connection after exact assignment restoration and another generation advance succeeds. Native generation is independently observed as lexical `2` after revocation. Fresh PostgreSQL 17.9 evidence passes 256 observations.

The first integration run failed stale-snapshot refusal because the newly created sequence's first nextval reused generation 1. The vulnerable source is retained as `original-use-epoch-initialization-vulnerable.py.txt`; initialization now explicitly sets generation 1 as already called, matching the existing epoch spike. No stale-row output was retained from that failing assertion, so this record does not claim its exact returned value. Fixed evidence tests actual advancement and refusal.

This is explicit installer-controlled authority mutation and stale-snapshot rejection, not exhaustive authority-change detection or drain coordination. The sequence is non-MVCC and nontransactional; abort/advance may conservatively refuse until repaired. No guard through final client release, revocation acknowledgment/drain, public activation, native source custody or full L06 qualification is claimed. Full gate remains 22/132.

### Epoch rollback and ordinary custody controls — 2026-10-09

Fresh original-use PostgreSQL 17.9 evidence passes 270 observations. A sequence advance inside a rolled-back authority transaction persists while the epoch row rolls back; the next fresh ordinary request refuses with no output. Explicit installation of a new generation restores the expected aggregate. Alice, Bob and outsider independently cannot read the epoch table, read the sequence, invoke nextval or call the private epoch helper. This verifies conservative mismatch refusal and least-privilege custody in the fixed installer.

Repair is an explicit assessor/installer action; no public recovery API or automatic acknowledgment is claimed. Authority changes remain manually enumerated in this spike, and no drain/final-release barrier or exhaustive authority invalidation is established. Link these controls to B05/L06/L11/L12/L13 qualification without promoting those cases. Full gate remains 22/132.

### Guarded native buffer/publication integration — 2026-10-09

Actual UMF SecurityAuthorityGuard now participates in a reviewed native pipeline spike around the original compiler-derived PostgreSQL aggregate. The ordinary query completes and decodes exact lexical output, then waits at an explicit publication barrier while the read callback still holds its guard. A participating change queues; its callback has not started, and an independent native assessor query confirms Assignment remains active. Publication completes before change callback admission; revocation and epoch advancement commit, and the next guarded ordinary query sees no eligible rows. A guarded restoration recovers the expected result. Six new observations produce 276 native observations overall.

The initial test oracle expected the word true, whereas psql's ordinary boolean carrier is t; correcting that lexical oracle and rerunning passes. No native safety failure is claimed for that oracle mismatch.

This demonstrates one-process read/change participation through buffered publication, not a production transport receipt, distributed/native-exclusive lock, all authority writers, streaming, cancellation/crash or final byte delivery. Public issuer/source/guard custody and exhaustive mutation participation remain open; L03/L05 are not promoted. Full gate stays 22/132.

### Guarded publication/transition failure controls — 2026-10-09

Extended the actual UMF guard/native publication pipeline with two failure paths. A buffered native result whose publication callback throws rejects the read and releases the guard, allowing the previously queued participating revocation to commit; subsequent protected reads have no eligible resources. A participating change that commits native revocation then throws an acknowledgment error produces SECURITY_TRANSITION_UNKNOWN, closes the guard, refuses subsequent reads before any native query, and refuses self-repair through that closed guard. Native assessor observation verifies committed revocation; separate explicit assessor restoration recovers the raw fixture.

Fresh PostgreSQL 17.9 aggregate receipt passes 287 observations. These are controlled single-process callback failures, not process crash, network acknowledgment ambiguity, distributed custody, final bytes delivered, all native writers or production recovery qualification. No L03/L11/L12 criterion is closed by the component. Full gate stays 22/132.

### Queued revocation cancellation and retry — 2026-10-09

Actual UMF guard/native pipeline now includes an AbortSignal-cancelled authority change queued behind a buffered read. The queue rejects with SECURITY_GUARD_REFUSED; the mutation callback never starts, an independent native observation confirms Assignment still active, and the active guarded read returns its original exact result. An explicit later participating retry commits revocation and the next protected read is empty. Restoration is separate and guarded. Fresh PostgreSQL 17.9 aggregate receipt passes 292 observations.

This qualifies cancellation before change callback admission only. Cancellation of a callback already executing, process crash, distributed/native-exclusive coordination, canceled native transactions and full guard participation remain open. No revocation acknowledgment is emitted for the cancelled request. Full gate stays 22/132.

### Conditional publication-drain induction — 2026-10-09

`publication-drain-formal.json` records four Z3 checks over unbounded abstract reader and pending-publication counts. Empty initialization plus every admitted reader/buffer/publication/release/change transition preserves pending publications <= retained reader guards and authority change => no retained reader. The invariant excludes publication outstanding at change admission/acknowledgment. A premature lease-release mutant produces a SAT counterexample. All checks retain UNSAT violations and SAT negative/positive controls.

Every operation must retain its own lease through publication, every authority mutation must use the same coordinator, callback settlement must be truthful, and coordinator transitions must be atomic/serialized. Global counts abstract individual lease custody; those premises are not proved by the theorem. No TypeScript implementation refinement, all-native-writer seal, distributed participation, streaming/final-byte completion, crashes or liveness/fairness is established. Current native guard pipeline tests remain separate scoped component evidence. Full gate remains 22/132.

### Separate-connection native publication drain — 2026-10-09

Added actual PostgreSQL coordination across separate native connections: an ordinary TCP/SCRAM read transaction acquires an explicitly authored shared transaction advisory lock, queries the compiler-derived routine and holds its lexical decoded result. A separate installer transaction attempts the matching exclusive advisory lock before assignment revocation/epoch advancement. The assessor observes PostgreSQL pg_stat_activity advisory wait and independently observes active Assignment while the read lease is retained. Publication precedes reader COMMIT; reader exits without diagnostics; revoker then commits and returns acknowledgment. A fresh ordinary read is empty, and explicit restoration recovers the fixture. Fresh aggregate receipt passes 302 observations.

The lock key is fixed coordination metadata, not a native resource identity. This proves the authored participating transactions' drain ordering and native lease lifetime through controlled publication. It does not seal all mutators, prove source/role lock custody, enforce lock use in public activation, cover distributed application buffers beyond the declared lease, final byte delivery, streaming, crashes, cancellation/deadlines or full L03/L05 acceptance. The original test's bounded deadline and actual native lock-wait observation establish ordering; elapsed sleep is not used as evidence. Conditional publication-drain proof source pins are refreshed, but the theorem does not verify advisory-lock implementation. Full gate remains 22/132.

### Native DML writer participation in the fixture — 2026-10-09

The fixed installer now creates statement triggers on employee, project, resource, Assignment junction, Ownership junction and private original carrier tables. BEFORE INSERT/UPDATE/DELETE/TRUNCATE acquires the selected exclusive transaction advisory lock; AFTER advances the non-MVCC generation and epoch row. PostgreSQL catalog evidence independently verifies all twelve enabled triggers and their selected routines. The separate native revoker now omits both explicit lock acquisition and explicit epoch advancement: its update blocks under the retained reader lease, and the trigger alone advances generation after drain. Fresh PostgreSQL 17.9 receipt passes 304 observations, retaining prior query/domain/privacy/epoch/guard controls.

This enforces participation for ordinary SQL DML on the six authored fixture tables with these enabled triggers. It does not seal trigger/role/function/schema changes, disabled-trigger or replication paths, excluded owner/admin bypass, independent native data sources, all selected graph homes, public read-lease acquisition, statement snapshot semantics beyond tested cuts or final client delivery. Protected read methods must still retain the native lease; ordinary direct invocation alone does not establish final-release drain. Installer/source inventory admission and comprehensive writer/read-path closure remain open. Conditional proofs retain updated source pins without claiming native-code verification. Full gate remains 22/132.

### Native revocation lock timeout — 2026-10-09

While the ordinary native reader holds its publication lease and a revoker is independently observed waiting in PostgreSQL, a second revoker executes an Assignment update with native lock_timeout=100ms. The trigger-enforced lock wait returns 55P03, no output/acknowledgment, and the connection ends without committing. Independent native observations show Assignment and epoch unchanged. Publication then completes and the original waiting revoker commits successfully. Fresh PostgreSQL 17.9 receipt passes 307 observations.

This verifies bounded native lock timeout without authority effects for the authored transaction, not elapsed-time ordering, canceled active callbacks, process crash/connection loss, complete deadline budget containment, distributed acknowledgment or production recovery. No drain acknowledgment is issued on timeout. The full required backend scope remains unchanged at 22/132 accepted cases. Conditional drain proof source pins are refreshed without native implementation proof claims.

### Protected-routine automatic native lease — 2026-10-09

The fixed native original-query routines acquire the selected shared transaction advisory lock before epoch checking, original-action admission, completeness validation and query evaluation. The ordinary retained read transaction no longer calls an explicit lock helper. After the query-result barrier, independent PostgreSQL pg_locks/pg_stat_activity observations confirm the ordinary reader's granted ShareLock on the selected coordination key. Trigger-only revocation still waits and timeout remains without acknowledgment/effects until publication and reader commit. Fresh PostgreSQL 17.9 receipt passes 308 observations.

Moving the catalog observation after the actual buffered-result barrier avoids timing-based lease evidence. Epoch checking follows acquisition so old data/authority snapshots cannot masquerade as current solely by obtaining a new lease. Autocommit releases the transaction before later application publication; production hosts must retain the admitted native transaction through their declared final-release boundary and qualify all read surfaces. This is a fixed authored installer protocol, not a public physical/compiler activation or complete source/role/mutator/graph closure. Full gate remains 22/132; conditional proof pins are refreshed without native code verification claims.

### Native backend-loss buffer-drain counterexample — 2026-10-09

Actual native negative control establishes an ordinary retained transaction, invokes the compiler-derived aggregate and holds its exact lexical result in the live client. Assessor terminates only that owned reader backend. Trigger-enforced Assignment revocation now commits before the client drains its buffered result; the old buffer remains available. Client subsequently detects connection failure. `original-use-native-lease-loss-counterexample.json` points to immutable retained evidence (`original-use-native-lease-loss-evidence.json`, SHA pinned). Fresh aggregate receipt has 313 passing observations, including successful observation of this unsafe mechanism boundary; those five counterexample observations are not acceptance of its drain behavior. No unauthorized publication is executed.

A native transaction lock alone cannot establish the CONTRACT-053 application-buffer final-release rule under backend loss. Production needs separately demonstrated publisher/lease participation that survives loss of the native session, or must refuse revocation acknowledgment while publication drain is unknown. Merely detecting the connection error later, retrying epoch admission or discarding the result in a cooperative client does not prove that all publication paths were drained before acknowledgment. Cleanup must distinguish dead publication owner from a live owner whose database session died; bounded uncertainty must not be reported as successful revocation. The conditional drain theorem's lease-through-publication premise is violated by treating this lost native lock as the sole lease. Native schema lock/read/DML results remain useful, but full L03/L11 acceptance remains open. Full gate stays 22/132.

### Persistent enrolled publication lease spike — 2026-10-09

Added a private persistent publication-lease registry and a separately enrolled aggregate wrapper to the fixed raw PostgreSQL fixture. A trusted issuer registers original actor/native backend before the wrapper executes. Unenrolled ordinary callers refuse, and all three ordinary actors cannot read the registry. Native writer triggers acquire the exclusive guard then refuse while any unresolved enrolled publication exists. Writers using repeatable-read are explicitly unsupported and refuse before effects, preventing an old writer snapshot from treating unseen leases as absent. The current ordinary read profile remains separately tested; this enrolled wrapper is not a public activation.

Actual enrolled reader buffers its compiler-derived aggregate, then the assessor terminates its backend. Its persistent publication record remains. Revocation returns 42501 with no acknowledgment; independent native observations prove Assignment and epoch unchanged while the live client retains the old buffer. Only after client failure is observed, trusted publisher explicitly discards its buffer and issuer clears the lease does a later native revocation commit. Fresh receipt passes 333 observations, retaining the unregistered native-lock-loss counterexample as a negative control.

This closes the observed backend-loss interleaving in the enrolled authored spike under trusted registration/release, not the whole system. Current binding uses actor/native PID; PID reuse, session incarnation/opaque token custody, public issuer authentication, lease recovery/owner-death proof, complete read enrollment, streaming/final bytes, DDL/trigger drift and graph/Delta implementation remain open. Cleanup is never inferred from backend disappearance or elapsed timeout. The unregistered base routine remains a spike control and cannot qualify publication custody. Conditional proof source pins are refreshed without claiming verification of registry snapshots or SQL implementation. Full backend gate remains 22/132.

### Exact issuer-created publication ID — 2026-10-09

The enrolled native aggregate wrapper now takes a UUID publication ID and requires the private row to match that ID, original native actor and backend PID. The trusted issuer captures the exact native RETURNING lease_id text and passes it through without numeric conversion. The actual enrolled ordinary session tests wrong and NULL IDs under savepoint controls; neither returns a result. Its exact ID then succeeds, and persistent backend-loss refusal/explicit trusted release still pass. Fresh PostgreSQL 17.9 receipt has 335 observations.

Opaque ID matching strengthens enrollment but does not authenticate the issuer, prove UUID entropy, provide public token custody or prove native session incarnation/PID-reuse safety. An old known token plus a reused PID must not be treated as a new publisher; actual incarnation/fresh-enrollment binding remains open. Private token values are not copied into observation receipts. The separately admitted public read/release protocol, immutable lease fields, cleanup evidence and recovery remain unqualified. Full gate stays 22/132; conditional proof source pins are refreshed without native source refinement claims.

### Native backend-start binding and metadata capability — 2026-10-09

The enrolled publication row now includes a native timestamptz backend-start value captured by the issuer from pg_stat_activity. The wrapper requires exact native equality for the current backend alongside UUID, original actor and PID. Controlled incarnation mismatch keeps those three other fields valid but substitutes -infinity: no result escapes. Restoring the actual native backend-start value admits the query. Values remain native timestamps; no JS Date or timestamp string conversion is used.

Initial direct stats lookup under the guardian role withheld metadata, so the valid enrolled request failed closed with Publication custody unavailable. The selected fixture now explicitly grants pg_read_all_stats to the internal guardian and uses pg_stat_activity; native checks establish that Alice, Bob and outsider cannot inherit this capability. Fresh PostgreSQL 17.9 receipt passes 339 observations. This additional capability is part of this fixture's qualified subset, not a default public role grant or a least-privilege production role proof.

Backend-start matching detects the tested mismatch; it is not a formal proof of globally unique session incarnation under clock/PID reuse, metadata-source authenticity or public token custody. Production must qualify the native identity source and isolate/retain its required capability. Issuer authorization, immutable lease/enrollment fields, reused tokens, owner cleanup, all read paths and final delivery remain open. Full gate stays 22/132; conditional proof pins are refreshed without native code verification claims.

### Isolated native incarnation metadata capability — 2026-10-09

Replaced the fixture guardian's broad pg_read_all_stats membership with a dedicated umf_sec_incarnation NOLOGIN/NOSUPERUSER/NOBYPASSRLS owner of the private stable, fixed-search-path original_backend_incarnation helper. It returns only the current backend's native start timestamp. Guardian receives only EXECUTE on that exact helper. Independent catalog evidence verifies stats capability on the helper owner, absence on guardian, restricted definer metadata, no PUBLIC EXECUTE and no resource/publication-registry SELECT for the helper role. Alice, Bob and outsider cannot invoke the helper or inherit the helper role; they also retain no stats membership. Enrolled wrong-incarnation refusal and restored admission still pass. Fresh PostgreSQL 17.9 receipt has 346 observations.

The prior guardian-wide metadata grant is historical spike evidence and is superseded by this isolated fixture capability. This is not a complete production privilege/dependency inventory or native metadata authenticity/uniqueness proof. Public issuer/cleanup/session/token custody, source drift and actual graph/Delta profiles remain open. Full gate stays 22/132; conditional source-isolation proof pins are refreshed without backend refinement claims.

### Exact publication release and sibling-owner counterexample — 2026-10-09

Two actual ordinary Alice publisher sessions enroll independently, buffer their admitted aggregate and lose only their native backends. The first tested cleanup still deleted by original actor; the exact-release-retains-sibling-publication control failed. Vulnerable source and actual failed control are retained in original-publication-actor-cleanup-vulnerable.ts.txt and original-publication-actor-cleanup-counterexample.json. The failing control did not retain its returned count, so no exact failed count is claimed.

Fixed cleanup deletes only the first exact publication UUID after its explicit trusted buffer discard. The second private lease remains, its live client still holds the original buffer, and another revocation refuses 42501 without acknowledgment or authority effects. Only after the second client detects native loss, discards its own buffer and releases its own UUID can revocation commit. Fresh PostgreSQL 17.9 evidence passes 354 observations. This closes the observed actor-wide cleanup interleaving in the authored enrolled spike, not public issuer/release authenticity, immutable lease history/token reuse, recovery, final delivery or graph/Delta custody. Full gate remains 22/132.

### Terminal publication lease history — 2026-10-09

Explicit exact release now marks the retained UUID row released instead of deleting it. Native primary-key history rejects attempted re-enrollment of the same UUID; release-state trigger rejects revival, deletion and truncation. Pending enrollment uses a partial actor/backend uniqueness index so terminal history does not block a future distinct lease. The query wrapper and writer-drain check consider pending rows only. Two-publisher exact release still retains the sibling blocker, and both terminal rows remain afterward. Fresh PostgreSQL 17.9 receipt passes 359 observations, including five terminal history controls.

These constraints apply to the enabled authored fixture triggers and ordinary DML paths. Pending record binding fields remain mutable under the trusted fixture issuer; immutable enrollment, privileged source/trigger changes, recovery/history retention bounds, public token/issuer custody and graph/Delta implementation remain open. Terminal UUID retention is not an authenticated lease protocol by itself. Conditional proof pins are refreshed without backend verification claims. Full gate stays 22/132. A read-only Astra re-review of the accumulated source/proof/protocol changes has been requested under the owner's existing review instruction.

### Publication retirement snapshot fence — 2026-10-09

Astra identified an unmodeled lease-retirement schedule. Actual PostgreSQL 17.9 replay confirmed that a retained ordinary repeatable-read snapshot could reuse a UUID already marked released; terminating that backend then allowed revocation while its second result buffer survived in the test host. Neither result was delivered to a consumer. The vulnerable source, full 370-observation run and focused counterexample are archived as original-publication-stale-retirement-* under the security evidence directory. Terminal history alone does not establish current admission.

The authored enrolled spike now requires read-committed retirement, takes the same exclusive native coordinator lock, and advances the non-MVCC sequence plus transactional authority epoch before pending->released. A live protected repeatable-read transaction prevents retirement acknowledgment (bounded lock timeout, unchanged pending state/epoch). After its native lease ends, retirement advances the epoch; an older idle repeatable-read snapshot refuses its first protected query, and a fresh snapshot refuses a terminal token. Trusted publication drain still precedes native lease termination and exact issuer retirement. Fresh native evidence passes 374 observations. The P2 discard evidence now retains explicit expected/observed booleans.

publication-retirement-formal.json contains four Z3 4.15.4 conditional algebra checks with SAT negative controls for unfenced terminal-state admission and retirement under retained readers. It assumes serialized lock participation and truthful snapshot/non-MVCC epoch comparison; it does not verify SQL ordering, runtime refinement, rollback/recovery, immutable enrollment, authenticated issuers, final delivery or full backend implementations. Existing publication-drain proof remains qualified separately. US-057-AC2/3/5/7 remain open; full acceptance remains 22/132. Astra re-review of the repaired protocol is pending.

Astra re-review of the repaired schedule found no remaining demonstrated bypass under the stated trusted-issuer and immutable-identity premises. Both lock orderings are explained conditionally: a retained protected read lock excludes retirement, and an earlier retirement invalidates an older eligibility snapshot at the post-lock epoch check. Actual opposite-order lock-wait and retirement-rollback schedules remain additional refinement work; no complete backend claim follows. Chromium 153.0.8010.12 correspondence passes all ten programs and fifteen refusal controls.

### Retirement rollback and opposite lock order — 2026-10-09

Extended the same authored PostgreSQL 17.9 enrolled spike to execute both refinement controls requested by Astra. A rolled-back retirement restores the pending row and transactional epoch, while the native sequence advancement survives. Both the retained ordinary repeatable-read snapshot and a fresh ordinary statement refuse without a result. The fixture then explicitly advances a new coordinated generation, verifies the same still-pending lease can read, discards its buffer, and retires the exact UUID. This trusted fixture recovery is not a public recovery protocol or issuer qualification.

In the opposite ordering, an ordinary repeatable-read snapshot is established before retirement, but has no protected read lease yet. The separate retirement transaction updates the lease and retains its exclusive native coordinator lock. Independent pg_stat_activity/pg_locks observations establish that the ordinary protected query waits on that advisory lock and the retiring backend owns it. Retirement commits; the waiting reader then refuses without any result buffer under the obsolete snapshot. Native receipt truss-original-use.json now passes 395 observations, including ten opposite-order and eleven rollback controls.

publication-retirement-formal.json now has five conditional Z3 algebra checks. The new rollback check shows transactional epoch restoration cannot admit old or fresh snapshots while the non-MVCC generation remains strictly advanced; its rewound-generation negative control is SAT. This does not prove actual SQL, recovery, multi-lease custody or backend refinement. Chromium 153.0.8010.12 still matches ten programs and fifteen refusal controls. US-057-AC2/3/5/7 and the full 132-case backend gate remain open; these are actual scoped refinement observations, not additional accepted backend cases.

### Immutable pending publication enrollment — 2026-10-09

The authored PostgreSQL 17.9 lease trigger now refuses changes to a pending row's UUID, original actor, native PID or native backend incarnation. Four actual issuer-side ordinary UPDATE attempts each fail 42501 without result, followed by independent catalog comparisons confirming the original exact binding remains pending and unchanged. The wrong-incarnation admission control now enrolls an initially invalid incarnation, verifies ordinary refusal, retires that exact UUID and creates a distinct correctly bound UUID; it no longer rewrites an existing enrollment. Terminal history retains both that invalid enrollment and the two drained publisher enrollments. Native receipt passes 403 observations; Chromium 153.0.8010.12 still matches ten programs and fifteen refusal controls.

This qualifies enabled authored triggers against ordinary DML on the owned raw fixture. It does not authenticate insertion metadata, restrict a superuser/owner from replacing triggers or tables, establish a production issuer/recovery API, or implement actual graph/Delta custody. Conditional proof premises are unchanged: immutable identity is now separately observed in this fixture, not discharged for every backend. US-057 lifecycle acceptance remains open and the full gate remains 22/132.

### Typed original-query binding readiness — 2026-10-09

Fresh original inspection-owner replay confirms that the current Truss original-query consumer refuses explicitly bound Resource root discriminators with text, int4 and exact int8 carriers (including 9007199254740993). Each replay rehashes the complete physical binding into the original query profile and obtains a new original handoff before invoking the actual portable consumer; unchanged old handoff hashes are not used to fabricate this result. truss-query-typed-readiness.json retains all three sources/handoffs/refusals. This is a support-boundary observation, not actual installed graph execution or an accepted backend case.

The current raw-query-home/0.2.0 binding cannot establish typed private-carrier identity. Before admitting typed graph original-query use, its replacement must independently bind the complete root and carrier type selectors and exact key correspondence. Every source/join alias must apply the selected carrier type; collection completeness must range over eligible roots of only the selected type and count carriers of that same bound type/key, before application filters. A sibling type with the same local key must neither satisfy completeness nor affect errors, grouping, ordering or sums. Missing/unknown/native-null selectors must refuse. Original resource-independent action admission needs an explicit selected-type contract: the row-predicate emitter currently requires a native root discriminator parameter even for such actions. Do not drop type constraints or synthesize a native parameter to bypass that requirement.

Actual current Truss node/key/scalar/edge and history homes must come from original installed catalog correspondence, not guessed table names or synthetic projected rows. The next implementation boundary is a compiler-owned qualified typed physical binding plus independently checked native carrier/root correspondence, followed by actual Truss storage installation. This requirement does not redefine the full goal around raw-table support. All 30 Truss and all 30 Ashlar backend cases remain required and open.

### Quantified typed carrier completeness — 2026-10-09

prove-typed-source-completeness.py and typed-source-completeness-formal.json retain four Z3 4.15.4 conditional checks over arbitrary uninterpreted type/key domains, arbitrary eligible populations, and nonnegative carrier counts. The selected-type universal completeness specification equals anti-existence admission; a sibling carrier cannot fill a missing selected-type carrier; arbitrary sibling count/required-field changes leave admission unchanged when selected-type facts agree; and type-plus-key matching excludes a sibling's colliding local key. Every violation query is UNSAT, every weakened negative control is SAT, and every admitted positive population is SAT. The type-erased control explicitly admits a sibling carrier while the selected type has zero carriers.

These checks establish the admission algebra required by the next typed physical binding. They assume truthful complete eligibility/cardinality/availability, injective native/logical identities, independent original-value authorization and a stable authority/source cut. They do not prove a binding API, native SQL emission, database error isolation, query result/group/order behavior, original-source authenticity or actual Truss/Ashlar storage refinement. No JavaScript number or invented native table identity participates. Current raw-query-home/0.2.0 typed-root refusal remains required until those physical obligations are implemented and qualified. Full backend acceptance stays 22/132.

### Portable typed completeness SQL builder — 2026-10-09

Implemented security-source-completeness.ts in the actual Truss PostgreSQL package and integrated it into the original-query consumer's admitted raw completeness path. The builder binds separate root/carrier selectors, exact qualified key fields and required carrier fields. It refuses one-sided typing, malformed references, duplicate logical fields or physical key/carrier columns, unsupported selector carriers and noncanonical/out-of-range integers. Integer selector transport stays lexical with exact BigInt admission and native typed SQL literals. No graph table allocation is inferred.

The owned PostgreSQL 17.9 spike now executes fifteen additional physical witness controls across text, int4 and int8 selectors, including 9007199254740993. For each selector: a malformed sibling field does not block selected-type completeness; a sibling cannot fill a missing selected carrier; sibling duplicates do not block; selected duplicates refuse; an untyped carrier binding refuses before SQL. Native receipt passes 418 observations. These authored witness tables establish SQL behavior only; they are not actual installed graph stores, compiler-owned typed binding or independently qualified eligible-root/carrier RLS.

The raw consumer's ten owner-derived programs remain equivalent in Chromium 153.0.8010.12, including fifteen refusal controls. This browser run exercises the integrated raw path; typed native SQL witnesses have no separate typed browser qualification yet. Fresh original-owner typed-root readiness still refuses all three selectors under raw-query-home/0.2.0, as required until the typed binding, query alias selection and typed original-action contract are implemented. Nine component groups and 78 evidence checks pass; traceability remains current at 470 criteria. Full acceptance remains 22/132.

### Typed completeness browser qualification — 2026-10-09

Closed the explicitly recorded browser gap for the physical typed completeness builder. truss-source-completeness-browser.ts builds the actual Truss helper as browser ES modules, executes it in Chromium 153.0.8010.12, and retains three exact host/browser SQL correspondences for text escaping, int4 and int8 selector 9007199254740993. Eight independent malformed-input variants refuse with the declared unsupported result: absent carrier selector, signed64 overflow, noncanonical integer, empty qualified reference, duplicate qualified carrier field, duplicate physical carrier column, NUL namespace and unknown selector carrier. The browser has no Bun/process/Buffer globals and makes zero external requests. Source hashes and exact inputs/SQL/refusal outcomes are retained in truss-source-completeness-browser.json.

This establishes portable SQL generation/refusal behavior for this helper, alongside separately retained native typed witness SQL execution. It does not establish compiler-owned typed binding, typed application alias selection, original-action admission, root/carrier RLS, source authenticity or actual graph storage installation. Typed original-query admission remains refused under raw-query-home/0.2.0. No additional required backend case is accepted; the full gate remains 22/132.

### Astra typed-builder review and malformed selector repair — 2026-10-09

Direct inspection first found null/absent physical metadata escaping as incidental JavaScript TypeErrors; the helper now normalizes capture/generation failures to TRUSS_SECURITY_SOURCE_COMPLETENESS_UNSUPPORTED. Astra independently identified the stronger P2 defect: falsy provided selectors (null, false, zero or empty string) were interpreted as omitted and emitted untyped TRUE predicates. The helper now treats only undefined/absence as untyped, validates every provided selector as an object, and compares selector presence explicitly.

Chromium 153.0.8010.12 passes three exact typed SQL correspondences and 24 malformed input refusals, including all twelve both/root-only/carrier-only falsy combinations. Astra's direct Bun re-review confirms those twelve refusals, preserves valid omitted raw selectors, and reports no further actionable type/key SQL or proof-scope defect. Native PostgreSQL 17.9 still passes 418 observations; original raw-path browser correspondence passes ten programs/fifteen controls; typed owner readiness still refuses three profiles. Nine component groups, 79 evidence checks and the 470-criterion traceability check pass.

Retained typed-completeness-falsy-selector-counterexample-variant.ts.txt and its focused JSON receipt reproduce twelve untyped outputs when the identified conditions are reinstated. This is explicitly a reconstructed tested variant, not a claimed original source snapshot. Original historical receipt fingerprints were refreshed before an immutable pre-fix archive could be retained, so no original-byte archive correspondence is asserted. The defect and repair do not promote any graph/backend case. Current source/issuer/installed storage and typed query admission obligations remain open; full acceptance remains 22/132.

### Original Truss graph correspondence boundary — 2026-10-09

Current-source inspection retains four original source/contract pins in truss-graph-correspondence-readiness.json. stageNewCatalogCohort returns provisional_new_catalog_staging_only; its allocated rows do not establish committed current catalog admission. The native new-catalog collector independently reconciles Record/Field storage IDs and creation revisions with original archived declarations. Default property home selection applies only to absent binding under ADR-002; explicit home interpretation remains separate. CONTRACT-007 requires business-key components distinct from opaque object storage IDs, object/type_id/props and edge/rel_type_id/props correspondence, canonical allocated property member names, and independently qualified state/node/scalar joins for row homes.

Therefore a typed security binding must retain original current catalog/layout custody and explicit native property-home correspondence, rather than reconstructing flat column maps from a provisional allocation or review-only schema export. Record type IDs, relationship type IDs and association-owner type IDs are separate identities. JSON-home scalar extraction and ordered key-component materialization must use original property catalog IDs and original native codecs; row homes must preserve complete state/presence/absence/domain guarantees. Carrier construction must retain its own type/key/source proof through eligibility, original-value use and final publication. The current flat SecurityPhysicalType.fields column subset and raw-query-home/0.2.0 do not realize those graph obligations.

Next implementation must close original admitted catalog/layout observation, property-home projection/codec correspondence and business-key materialization together with the typed compiler binding. Typed completeness SQL alone cannot qualify actual graph queries. This is source-derived readiness evidence only, not executed current graph state, source authentication or additional accepted cases. Full gate remains 22/132; all graph and Delta requirements remain intact.

### Graph storage/business-key correspondence algebra — 2026-10-09

prove-graph-key-correspondence.py retains three Z3 4.15.4 conditional checks in graph-key-correspondence-formal.json using separate uninterpreted storage-identity and logical-business-key domains. A truthful original-key projection preserves equality selection; separately qualified selected-key uniqueness excludes equal business keys on distinct storage owners; changing unrelated storage identities cannot change logical selection when original keys agree. Each safety violation is UNSAT, weakened control SAT and positive population SAT. An unqualified storage-ID cast has a counterexample selecting the wrong original key. Distinct storage IDs without the independently admitted key constraint permit equal business keys.

The selected-key uniqueness premise applies only within the separately qualified logical type/key namespace, not globally across all graph objects. Projection truth, original catalog/property/codec correspondence and native key namespace uniqueness must be established by implementation evidence; this algebra does not prove them. No SQL, JSON/row codec, compiler projection, graph installation or backend case is accepted by this proof. The typed binding port must consume compiler-owned property decoding and original native correspondence rather than casting object storage IDs or implementing a parallel guessed decoder. Full backend gate remains 22/132.

### Private insert-counter diagnostic counterexample — 2026-10-09

Extended the actual owned PostgreSQL 17.9 private-fact probe beyond the prior three known restricted diagnostic families. pg_catalog.pg_stat_get_tuples_inserted(oid) remains executable by Alice, Bob and outsider and exposes the private Assignment insert count. A second unrelated Eve Assignment advances that count exactly once for all three ordinary identities while each independently checked authorized Resource set stays unchanged. Restricting that exact additional function blocks ordinary invocation without changing authorized reads. pg-private-diagnostics.json now retains 21 observations including both worlds and the scoped restriction.

All catalog privilege changes occur only in the disposable owned fixture. These database-wide PUBLIC restrictions are a prototype, not a selected multi-tenant production deployment or a proved per-user policy. Restricting four known families does not establish complete metadata/statistics/function/view closure. pg-raw.B10 and US-056-AC8 remain open; direct private-table SELECT denial cannot qualify them. The next backend implementation must inventory and qualify the complete ordinary diagnostic surface and deployment scope, or refuse ordinary paths that cannot meet the selected privacy guarantee. Full acceptance remains 22/132.

### Deny-first native diagnostic candidate — 2026-10-09

Extended the owned PostgreSQL 17.9 diagnostic spike with a separately scoped candidate: ordinary subjects have no direct SELECT on security_raw relations/views or pg_catalog relations/views and no explicit EXECUTE on pg_catalog routines; the excluded guardian receives the built-in execution capability required by the private fixed-search-path read routine. Ordinary callers receive only that routine's explicit EXECUTE for this read surface. Forced resource RLS and SESSION_USER-based membership still govern its original authorized rows. Existing direct-RLS profile evidence is neither silently replaced nor promoted by this candidate.

Alice, Bob and outsider retain their actual ordinary native identity and exact authored authorized rows. Each refuses six known direct-root/catalog-view/cumulative-statistics/relation-size/private-EXPLAIN probes without output. Independent assessor ACL queries confirm zero effective SELECT privileges on all selected pg_catalog and security_raw relations/views, zero effective explicit EXECUTE privileges on catalog routines, and no CREATE in pg_catalog or public for each actor. pg-private-diagnostics.json now retains 27 observations. All catalog PUBLIC ACL changes are isolated to the disposable owned database.

These native ACL and row outcomes are stronger than a growing list of individual statistics revocations, but do not establish full diagnostic closure: implicit operator/type/language/extension behavior, other command surfaces, owner/dependency/role change closure, deployment isolation, approved client compatibility, current authority and final delivery still need independent qualification. Full graph and Delta implementation remains required. pg-raw.B10/US-056-AC8 and the full gate remain open at 22/132.

### Deny-first native command and wrapper controls — 2026-10-09

The separate PostgreSQL 17.9 candidate now revokes ordinary direct EXECUTE on security_raw helpers and regrants only the admitted protected-read routine for this surface. Guardian retains its own helper authority and the separately excluded built-in execution capability. Existing direct-RLS profile behavior is unchanged outside this candidate's disposable fixture.

For Alice, Bob and outsider, COPY of private Assignment, JSON EXPLAIN of the private table, direct allowed() invocation, and a caller-owned temporary SECURITY DEFINER function forwarding to the private statistics getter all refuse with no output. The temporary wrapper runs under its ordinary owner's rights and cannot acquire the guardian capability. Separately, nonexecuting JSON EXPLAIN of the admitted definer read call remains identical after an unrelated Eve Assignment is added and analyzed; exact authorized rows also remain identical for all three identities. Native receipt now retains 33 observations.

These tests address actual native command and caller-wrapper paths and a specific observable plan boundary. They do not prove timing, executing EXPLAIN, every implicit operator/type/language/extension surface, privilege/dependency drift, public runtime activation or streaming/final-release custody. pg-raw.B10 remains open; no raw, graph or Delta case is promoted. Full acceptance stays 22/132.

### Native operator/function ACL boundary — 2026-10-09

The owned PostgreSQL 17.9 candidate now tests an installer-created unary operator in the ordinary reachable security_raw namespace, backed directly by the denied pg_stat_get_tuples_inserted(oid) function. Alice, Bob and outsider all refuse both direct function and operator invocation with no output. An explicit temporary per-role EXECUTE grant then makes the identical operator return the exact assessor-observed private count for all three identities, proving the operator/control is live rather than malformed. The grant is revoked and the operator removed before fixture cleanup. pg-private-diagnostics.json now retains 39 observations.

This establishes native behavior for that exact operator/getter/role path and the value of its explicit function privilege boundary. It does not establish every operator, cast/type, language/extension or changed dependency under a full deployment. The positive control intentionally admits the diagnostic only inside the owned disposable fixture and is retained as a negative privacy profile. pg-raw.B10 remains open; full acceptance remains 22/132.

### Native raw PostgreSQL scale and statement-budget evidence — 2026-10-09

pg-raw-scale.py executes the actual forced-RLS raw fixture at 1,000, 100,000 and 1,000,000 additional Resources, with deterministic complete A/B ownership. All three original ordinary identities match independent authorized counts and exact boundary identity/value samples at every scale. Actual total stored rows are independently checked, including the five baseline Resources. Full protected Alice and excluded-assessor EXPLAIN ANALYZE JSON plans are retained in pg-raw-scale.json; the assessor is explicitly outside ordinary protection.

The latest run records protected/assessor execution times of 5.796/0.050 ms, 592.880/2.505 ms and 6176.115/14.193 ms at the three sizes. These are distinct access paths and output populations on one owned host, not a general percentage-overhead promise or SLA. The protected function checks membership per source row. A selected native 1 ms statement timeout on the million-row aggregate refuses with SQLSTATE 57014 and no stdout/partial aggregate. Every native subprocess is bounded and only the original UUID-labeled fixture is removed after source correspondence checks.

This completes empirical scale-plan and database-statement-budget observations for the authored raw component. It does not prove portable runtime cancellation/drain, reusable connection cleanup, streaming/final-publication custody, arbitrary workload budgets, complete diagnostic closure or actual graph/Delta performance. pg-raw.B16/US-056-AC10 remain open until the admitted runtime/backend profile exercises those obligations. No required case is promoted; full acceptance stays 22/132. Nine component groups, 82 evidence checks and the 470-criterion traceability check pass.

### Actual Truss runtime native-budget recovery — 2026-10-09

Extended the actual pg-runtime ordinary-principal component, with original in-memory/disk protocol correspondence, to test a supplied cancellation context and a native statement timeout separately. Cancellation remains unsupported: begin refuses before any original native query or BEGIN. A normal transaction then sets a selected native 1 ms budget and calls pg_sleep; original native response proves SQLSTATE 57014, zero DataRow frames, ReadyForQuery E and server_error journal outcome. A subsequent application statement receives 25P02, proving the failed transaction was not silently treated as recovered.

Only explicit original-connection ROLLBACK restores the lease. A new transaction on the same native PID and original effective principal returns exact authorized Resource IDs, then rolls back/releases normally. No transport quarantine is asserted for this fully observed native server error; no cancellation or rollback result is inferred from deadline expiry alone. The native Truss principal receipt passes 65 observations, including complete original journal request/frame/outcome and consecutive custody evidence. Nine component groups pass.

This qualifies selected native server-budget recovery on the existing original runtime, not AbortSignal delivery, concurrent cancellation, uncertain transport/commit recovery, portable resource-budget admission, final-publication or full B16/backend acceptance. Current runtime principal preflight reads pg_roles directly; it therefore cannot be combined unchanged with the deny-first candidate that removes all ordinary catalog SELECT. That candidate needs an original qualified private principal observation mechanism without weakening actual caller/bypass/reset checks. Both profiles and this compatibility gap remain explicit. Full gate stays 22/132.

### Private principal observer native candidate — 2026-10-09

The deny-first PostgreSQL 17.9 fixture now executes a least-privilege private principal observer. Its non-login, non-superuser, non-bypass owner can SELECT pg_roles and execute exactly current_setting(text), text(boolean) and nameeq(name,name); it has no private Assignment SELECT or retained schema CREATE privilege. The zero-argument fixed-search-path SECURITY DEFINER helper selects SESSION_USER internally. Original and effective caller identities are observed outside that helper, so SET ROLE remains visible rather than becoming the helper owner. Ordinary users still cannot read pg_roles, call current_setting directly or supply another actor to the helper.

Fresh pg-private-diagnostics.json retains 61 observations, including original/effective identity, lower-role visibility, RESET ROLE/SESSION AUTHORIZATION/ALL restoration, changed client encoding, and installer-only BYPASSRLS/SUPERUSER positive controls restored immediately. Initial native failures identified explicit boolean-to-text and name equality dependencies. Outside-helper identity uses native name carriers: casting those identities to TEXT requires a further ordinary function privilege under the deny-first ACL. The candidate does not grant that privilege. Any runtime integration must qualify the two native name response fields and the three TEXT observer fields explicitly; weakening caller, bypass or encoding checks is not an integration strategy.

This is native feasibility evidence for the principal-observation obligation in CONTRACT-053 and the compatibility gap identified under US-056-AC8. Actual pg-runtime still uses direct pg_roles preflight; no public private-observer option or deployment admission is implemented. Current owner/dependency/ACL custody, change invalidation, complete diagnostic closure, graph/Delta enforcement and final publication remain open. No required backend case is promoted; full acceptance remains 22/132. Astra review of the candidate is requested under the existing owner instruction.

### Principal observation review and native response validation — 2026-10-09

Astra ultra reviewed the private principal candidate and source-current 61-observation receipt; no demonstrated bypass was found. Review supports a scoped runtime port with exact native carriers, independently observed routine metadata and pooled failure controls. Added the requested independent installer inspection of pg_proc and expanded ACLs: isolated observer owner, SECURITY DEFINER, STABLE, zero arguments, fixed search_path=pg_catalog, no PUBLIC EXECUTE and selected ordinary EXECUTE. Fresh native privacy receipt now records 62 observations. This metadata is installation evidence inside the owned fixture, not persistent deployment authenticity or change closure.

The actual Truss pg-runtime direct principal path now requires all five RowDescription fields to have native TEXT OID 25 and wire text format 0, in addition to exact ordered names, one complete row and original/effective caller, privilege and UTF8 checks. Native principal replay passes 65 observations; subject replay passes 82 observations. No private-observer runtime option is yet delivered. The proposed port still requires native name OIDs 19 for its first two outside-definer caller fields, TEXT OIDs 25 for the remaining three, and pooled reset/missing/altered helper/elevated actor/LATIN1 controls. US-056-AC5/8, complete backend requirements and full acceptance remain open at 22/132.

### Actual private principal/subject runtime composition — 2026-10-09

Actual Truss pg-runtime now accepts the experimental ordinaryPrincipalObserver selection defined by CONTRACT-053. It captures qualified identifiers synchronously, requires a pinned principal and uses the selected zero-argument helper without fallback. Original/effective caller identity remains outside the definer; ordered OIDs [19,19,25,25,25], text format, one complete UTF8 row, actual caller pin, non-superuser/non-bypass and UTF8 encoding remain mandatory. Missing/malformed/unavailable observations close admission with original quarantine custody.

Fresh truss-private-principal.json passes 81 native observations on the owned PostgreSQL 17.9 restricted fixture, with actual pg8.16.3 protocol and independently retained memory/disk journal correspondence. Three ordinary actors return independent oracle-authorized rows; pooled reacquisition preserves native PID and restores effective identity. Missing, bad-shape, false privilege declaration, empty/multiple observations, wrong pin, elevated native actor, changed encoding and altered SECURITY INVOKER helper refuse. Independent pg_proc/ACL metadata remains explicit. A direct-catalog principal profile also refuses under this selected restriction rather than silently activating.

Astra found an integration regression: principal OID selection had also changed subject output validation. It is repaired: subject outputs always require TEXT OID25. Native combined tests admit valid TEXT output and refuse NAME, absent and ambiguous keys. The selected actorCarrier=name passes actual SESSION_USER without an ordinary name-to-text function grant; text remains the default. Unknown/null/falsy input carrier selections refuse before acquisition. The fixture observer owner, not ordinary users, receives the conversion dependency required by its TEXT subject result. Astra re-review of current source and source-current 81-observation evidence reports no remaining actionable defect within this component scope.

Existing direct principal and subject native replays pass 65 and 82 observations; nine component groups pass. This implements the previously missing runtime composition path, not authenticated deployment/change custody, complete diagnostic closure, actual graph catalog/codec/security adoption, Delta implementation, final delivery or full backend acceptance. US-056-AC5/8 and all unaccepted backend cases remain required.


Verification after private-observer composition: twenty Z3 4.15.4 conditional checks are refreshed against CONTRACT-052/053. The complete 132-case gate freshly executes the implemented runners and remains failed with 110 missing/failed required cases (22 accepted); all 28 complete security criteria remain open. Evidence validation passes 83 checks, aggregate components pass nine command groups, and the 470-criterion traceability ledger is current. New runtime component evidence does not replace those required backend cases.

### Actual scale runtime and bounded response window — 2026-10-09

The owned raw PostgreSQL17.9 scale fixture now executes million-row ordinary aggregates through actual Truss pg-runtime/pg8.16.3 with original memory/disk protocol correspondence. The first positive run failed into quarantine under the fixed 5000ms response window while the protected native plan measured 6201.223ms; close masked the preceding exception. scale-fixed-deadline-failure.json retains source archives and original uncertain journals. It does not assert an independently captured exact deadline event or native SQLSTATE for that failure.

CONTRACT-053 now defines the experimental originalResponseTimeoutMs option (default5000, selectedinteger1..60000). Runtime construction validates and captures it synchronously; originalQuery also validates the bounded window. Expiry remains uncertain transport custody, never native cancellation/rollback acknowledgment. The scale fixture selects30000ms to admit the known positive workload, separately from the native1ms statement budget. Invalid zero/negative/oversized/fractional/nonfinite/string/null selections refuse. Response timing remains subject to host event-loop/transport scheduling; no arbitrary-workload SLA or completed cancellation is asserted.

Fresh pg-raw-scale.json passes three scale stages (1k/100k/1M additional resources plus the authored baseline), native CLI timeout, and39 actual-runtime observations across76 original journaled queries. All ordinary actors return exact text aggregate counts. The million-row native budget returns57014 withzeroDataRows andReadyE; a following statement returns25P02, and only explicitROLLBACK restores the same nativePID and exact authorized baseline IDs. The ownerless recovery control now uses the actual RO key rather than the erroneous R0 spelling found by Astra. Selected cancellation context still refuses beforeBEGIN.

Latest paired protected/excluded-assessor plan times are5.780/0.055ms,595.005/2.316ms and6140.543/9.776ms. They are distinct access paths/output populations on one host, not a percentage-overhead guarantee. B16 remains unregistered pending an independent scale oracle, freshgate UUID/case binding, complete actual native inventory and explicit external runtime source-binding policy. Astra confirms the exact B16 assertion can be exercised at this authored stable cut without waiting for unrelated graph/Delta, diagnostic or revocation-streaming cases; those full requirements remain separately open. No case is promoted by this component receipt.


Post-deadline verification: existing principal, subject and combined private-observer replays pass65/82/81 native observations with current runtime/source/typecheck pins. Nine component command groups pass. Twenty Z3 conditional checks are refreshed against the amended contracts. The complete gate freshly remains22/132 accepted,110 missing/failed required cases andall28 security acceptance criteria open; the470-criterion ledger is current. B16 registration is the next implementation task, with actual driver and scale observations now available but no acceptance substitution.

### Raw PostgreSQL B16 accepted at authored stable cut — 2026-10-09

Implemented and freshly accepted pg-raw.B16 under STP-056/US-056-AC10. The reviewed runner tests exact total resource populations1000/100000/1000000, independently authored aggregate counts and samples for three ordinary SCRAM identities, paired protected/excluded-assessor native plans and actual pg-runtime execution at every scale. The million-row native1ms budget produces57014 withzeroDataRows/ReadyE; subsequent use produces25P02 until explicitROLLBACK, after which the same original nativePID returns authorized baseline IDs. Unsupported cancellation context refuses before nativeBEGIN. The recovery candidates include the actual ownerless RO record.

pg-raw-B16.json retains133 exercising observations, native objects/RLS/policies/routines/roles/membership/grants/indexes/constraints/authentication, all three plans and54/54/76 original journaled queries. Eighty-three source pins include every adapter module, independent oracle and selected managed dependency source:14 packages/70 JS/JSON files. Actual driver resolution is observed from both the UMF probe and Truss runtime importer. Astra caught and repaired the initial importer-origin gap and oracle-budget drift risk; supported statement budget/error states are validated and consumed, recovery expectations are consumed, and exact required populations are enforced. Re-review found no remaining actionable source/evidence-binding/native-inventory defect before the fresh gate.

The gate explicitly permits shared pg-runtime and task-managed dependency sources for raw PostgreSQL, as specified by CONTRACT-053; this does not imply graph storage qualification or authenticate source issuers by hashes. The complete gate now accepts23/132 required cases and leaves109 missing/failed. All28 complete security acceptance criteria remain open; AC10 still has other required evidence/implementations. B16 establishes only this authored raw workload at a stable cut, not arbitrary workloads, timing SLAs, streaming/final delivery, complete diagnostic closure or graph/Delta behavior. The older pg-raw-scale.json component uses additional populations plus baseline and is distinct from the exact-total B16 acceptance receipt.


### Composite identity native witness and verification — 2026-10-09

The original `tools/security/pg-raw-identity-probe.py` now retains 32 PostgreSQL 17.9 observations. Four independently authored two-component namespace/resource pairs exercise delimiter collisions, empty components, equal resource labels across namespaces and normalization-distinct Unicode. Actual composite primary/foreign keys and forced RLS use exact component equality; ordinary SCRAM Alice/Bob connections see their respective Project-owned rows and the outsider sees none. A deliberately delimiter-concatenated policy exposes both colliding resources to both assigned readers. Restoring exact component equality restores separate visibility. This is a fixed authored native installer witness, not compiler admission, hash routing, subject-composite coverage, arbitrary cross-home correspondence or full pg-raw.B13 acceptance.

`pg-raw-identity-component.json` pins the original probe, fixture helper, baseline SQL, new composite SQL and independent oracle. The earlier Docker-unavailable attempt remains historical evidence; the present OrbStack replay succeeds. Refreshed gate-receipt regression passes four controls; aggregate components pass nine command groups; evidence validation passes 85 checks and the 470-criterion ledger is current. Complete backend acceptance remains 23/132, with 109 required cases missing/failed and all 28 complete security criteria open.

Astra ultra reviewed the composite expansion and found no actionable correctness or oracle-independence defect. Its sole wording feedback removed the inaccurate compiler label from the probe docstring. The final source was replayed successfully with all 32 native observations; this review does not qualify full B13.


### Qualified composite subject identity — 2026-10-09

The identity component now passes 41 native PostgreSQL 17.9 observations. The independent oracle assigns two distinct namespace/Staff identities to original SCRAM Alice and Bob logins, with respective Project A/B assignments. Composite subject primary keys and assignment foreign keys preserve the complete identity. The private RLS helper binds SESSION_USER to its subject and joins assignments using both namespace and subject ID. Both ordinary actors receive their respective resource and the outsider receives none. Deliberately omitting the subject namespace makes both assigned actors receive both delimiter-pair resources; restoring the exact join restores the independent oracle outcomes. The outsider is checked in the unsafe and restored profiles too.

This exercises the complete-identity premise of the retained logical key correspondence analysis at one fixed native corpus. It does not prove universal native/compiler refinement or authenticated subject enrollment. Source-current `pg-raw-identity-component.json` retains all 41 observations. Aggregate components pass nine groups and evidence validation passes 85 checks. Hash-routing collisions, wider cross-home identity and admitted compiler lowering remain open; no full B13 promotion or acceptance-count change is made. The full gate remains 23/132 accepted, 109 required cases missing/failed, and all 28 complete security criteria open.

Astra ultra re-reviewed the qualified composite-subject extension against the final 41-observation receipt and source hashes. No actionable correctness, oracle-independence or scope issue remained. Hash routing and full B13 remain open.


### Native hash collision and conditional key refinement — 2026-10-09

CONTRACT-052 requires complete typed Key identity rather than a hash alone; CONTRACT-053 requires exact native correspondence. The independently frozen PostgreSQL 17.9 corpus now includes `hash-key-13383` and `hash-key-42423`. Separate original native evaluations verify both `pg_catalog.hashtext` results as exact text `-1315717682` before the collision test proceeds. The native fixture stores generated routing hashes, retains full resource IDs in primary/foreign key constraints, and indexes candidate hashes. Forced RLS consults a private helper that compares both candidate hash and complete resource ID before accepting Project assignment. Ordinary SCRAM Alice/Bob see their respective resources; outsider sees none. Replacing that predicate with hash-only equality leaks both resources to both assigned actors; restoring exact equality restores the oracle. All three profiles independently check outsider denial.

The source-current identity receipt passes 52 native observations. This adds a fixed real native hash collision to the preceding scalar/composite resource and qualified subject witnesses. It does not qualify arbitrary hash algorithms, hash-based subject enrollment, cross-home/graph identity or public compiler admission. Full pg-raw.B13 remains required and unaccepted.

`tools/security/prove-hash-key.py` and `hash-key-formal.json` retain two conditional Z3 4.15.4 checks over an unbounded uninterpreted complete-identity domain, arbitrary authorization predicate and deterministic non-injective hash. Independently stated direct authorization equals existential lookup with hash plus exact identity. The violation is UNSAT; a colliding positive population and a hash-only false-positive control are SAT. Complete truthful identity equality, the same hash semantics on each side, complete current facts and native eligible-only evaluation remain physical/authority premises. This is a refinement of the abstract lookup expression, not a proof of the SQL implementation or complete compiler/backend.

Aggregate components pass nine groups; evidence validation now includes the new proof receipt and passes 86 checks. The full acceptance state remains 23/132, with 109 required cases missing/failed and all 28 complete security criteria open.

Astra ultra reviewed the final 52-observation hash-collision component and both conditional proofs. No actionable defect remained. The candidate index is installed, but index-plan selection/performance is not established by this component. Full B13 remains open.


### Raw PostgreSQL B13 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.B13 under US-056-AC1 with 144 observations. The fixed PostgreSQL 17.9 raw profile uses non-null ordered TEXT identity components, explicit C collation and exact session-bound subjects. It does not hash subject identities. Scalar case, normalization-distinct and supplementary Unicode, delimiter-bearing composite keys, equal Staff labels in distinct namespaces, and a real native hashtext collision remain isolated. Genuine case-distinct quoted/unquoted table homes carry equal local resource labels with opposite Project ownership. Deliberately lossy delimiter, subject-label and hash-only policies disclose both resources to assigned actors; exact restoration recovers the independent oracle. No general compiler activation or graph/lifecycle support follows from this case.

The public actual pg-runtime decoder independently exercises scalar/composite/hash/quoted homes and unfiltered final corpus reads for three ordinary SCRAM actors. It retains 81 original queries with exact memory/disk request-frame-outcome correspondence and unique complete custody. Missing and duplicate-replacement controls refuse. Exact independent schema/table/routine privileges and effective column permissions are asserted, including no authority-table writes; all 16 installed identity/authority fact sets are independently compared. Native columns/collations, ordered constraints/FKs, generated hash expressions, routines/policies, role attributes/membership, authentication, encodings, client build and image identity are retained. Eighty-six source bindings include actual adapter modules and the selected managed pg8.16.3 closure (14 packages/70 files); actual resolution from both probe and importer matches the selected entry.

Astra ultra identified the quoted-home, decoder, full-fact, privilege-assertion and journal-bijection gaps, then found no actionable issue after the fresh 143-observation component replay. The first gate attempt refused duplicate relative/absolute source-path bindings; the second refused unordered JSONB member serialization in one private fact comparison. Both attempts and source archives are retained as b13-registration-path-failure.json / b13-registration-json-order-failure.json. The corrected runner pins one exact test-source spelling and applies the membership runner's existing unordered-object normalization to evidence, preserving arrays/scalars and original journal bytes. The third fresh full gate accepted B13.

Current full acceptance is 24/132, with 108 required cases missing/failed. All 28 complete security criteria remain open. Ten component command groups pass, including repeatable strict identity-runtime TypeScript checking; evidence validation passes 88 checks and the 470-criterion ledger is current. B13 qualifies the authored raw identity assertion at fixed stable cuts. Arbitrary cross-home/hash algorithms, authenticated enrollment/issuers, complete native/compiler refinement, live concurrent authority/final publication, full raw backend and actual graph/Delta acceptance remain independently required.


### Raw write action fold component — 2026-10-09

Under US-057-AC1, CONTRACT-052 and TD-057, the PostgreSQL 17.9 raw write fixture now retains 246 observations across 29 independently authored vectors in pg-raw-write-component.json. Its three non-null TEXT fields require object actions, changed-field actions and distinct changeOwner/changePolicy grants. Inline owner_project is both ownership and a live policy dependency. Native scenarios isolate original/proposed membership, original/proposed ownership and policy actions, and missing original/proposed writeValue grants across owner changes. Missing writeId refuses a rename; a positive rename succeeds without unrelated changeOwner permission. An active reader with all field permissions but no update grant sees zero updated rows for a no-op. Unchanged value does not require writeValue; a forbidden NULL transition refuses before the NOT NULL constraint.

A dependent data-modifying CTE processes an authorized mutation before a forbidden mutation. A private nontransactional sequence independently witnesses that processing; complete committed business snapshots remain unchanged after refusal. This sequence is excluded integrity instrumentation, not business state or a claim of zero diagnostic effects. Ordinary actors cannot write private grant facts, TRUNCATE, disable the trigger or read that sequence.

write-fold-formal.json retains nine Z3 4.15.4 conditional checks: the independent quantified obligation specification equals the expanded selected-state enforcement model, and ownership, policy-change, changed identity-field and changed value-field actions are separately necessary at OLD and NEW. Every violation is UNSAT, permitted populations SAT and weakened controls SAT. Complete current session-bound authority, truthful classifications, exact non-null text semantics and faithful native execution remain premises. This is not a proof of actual SQL/compiler refinement, nullable profiles, concurrent revocation or publication.

Ten aggregate component command groups pass; evidence validation passes 90 checks and the 470-criterion ledger is current. L01 is not registered or accepted: original public pg-runtime decoder/journal custody, explicit same-session failed-transaction rollback/recovery and complete native inventory remain next requirements. Full acceptance remains 24/132 with 108 required cases missing/failed and all 28 complete security criteria open. Actual graph and Delta implementations remain in scope.


### Raw write explicit session recovery component — 2026-10-09

Astra ultra found no actionable defect in the 246-observation/29-vector action fold and nine conditional proofs. A subsequent explicit ordinary SCRAM session recovery probe now brings pg-raw-write-component.json to 253 observations. Eve processes an authorized WA write, receives 42501 on a forbidden WE ownership change, and then receives 25P02 for a query in the failed transaction. Explicit ROLLBACK restores the complete business snapshot. Native TEXT backend PID observations before failure, after rollback and after a fresh successful no-op transaction agree; the fresh transaction is also explicitly rolled back. The private excluded sequence witnesses two authorized mutation executions. This is psql session evidence, not public pg-runtime journal or native protocol acknowledgment evidence. Original driver custody and complete inventory remain prerequisites to L01 acceptance. Ten component groups, 90 evidence checks and the 470-criterion traceability check pass. Full acceptance remains 24/132 and the full goal remains active.

Astra ultra re-reviewed the source-current 253-observation session component and found no actionable defect within its declared psql scope. Public-driver protocol custody remains open.


### Raw write original runtime composition — 2026-10-09

The source-current pg-raw-write-component.json now passes 718 observations across the same 29 independently authored write vectors. tools/security/pg-raw-write-runtime.ts imports the actual Truss pg-runtime and executes each vector as an ordinary SCRAM actor against the owned PostgreSQL 17.9 loopback fixture. A fixed validated RETURNING boundary selects original id, owner_project and value carriers. Decoded columns, TEXT cells, affected-row text and command labels match the independent oracle; successful commands receive explicit committed acknowledgment. Rejected commands yield 42501, then 25P02 inside the failed transaction, explicit rolled_back acknowledgment, a fresh transaction with the same native TEXT backend PID, and another explicit rollback. Healthy release observes no quarantine.

The component retains 525 original query journals. Exact memory/disk request, frame and terminal-outcome correspondence is bijective; missing-custody and duplicate-replacement controls refuse for every vector. Both importer and probe resolve the independently selected managed pg8.16.3 driver. Eighty-five pinned sources include the actual runtime modules, selected dependency closure, reviewed collector, fixture and independent oracle. The excluded host compares complete committed business snapshots and private approval counts after every runtime vector. It explicitly restores the authored seed and private sequence between the separate runtime and psql phases; this is not an ordinary mutation or rollback path. The preceding psql session controls also replay successfully.

Strict TypeScript verification is added to the aggregate component runner; eleven groups pass. Evidence validation passes 90 checks and the 470-criterion ledger is current. Complete independent native inventory, physical/refinement and current-authority coordination remain required before L01 registration. Full acceptance remains 24/132, with 108 required cases missing/failed and all 28 complete security criteria open; actual graph and Delta implementations remain required. Astra ultra review of this new runtime composition is pending.


### Raw write inventory and rejected-response controls — 2026-10-09

Astra ultra found one verification gap in the preceding runtime component: execute throwing and journal bijection did not separately exclude DataRow frames before ErrorResponse. Retained originals showed no actual disclosure. The corrected runtime selects the unique original write statement/custody and asserts server_error, zero DataRow/CommandComplete frames, one 42501 ErrorResponse and one final ReadyForQuery E. A compatible three-TEXT-field RowDescription/DataRow is injected only into an independent in-memory inspection. Native ResponseIngress feed/finish accepts that protocol-valid response, while the security assertion refuses it. Original journals are unchanged.

The excluded-host pg-write-inventory.py collector records the write schema's objects, columns, constraints, routines, policies, roles and memberships; it independently checks exact object/routine/policy names, guardian-owned forced RLS, three non-null TEXT/C resource columns, native PK/FK, enabled BEFORE mutation trigger, SECURITY DEFINER ownership and fixed search_path, and exact selected-state policy expressions/commands. Every ordinary actor's effective schema, table, column, routine and sequence privileges is compared against an independent allowlist; private grants and instrumentation have no ordinary access, and ordinary CREATE/TRUNCATE/REFERENCES/TRIGGER rights are absent. Host authentication is SCRAM; image and client build are retained. Recollection after both runtime and psql phases matches the complete collected installation metadata at this authored stable cut.

The source-current component now passes 863 observations across 29 vectors. Eleven aggregate command groups, 90 evidence checks and the 470-criterion traceability check pass. These are scoped installation and response observations; full dependency/authority inventory qualification and Astra review remain required before L01 registration. Native/compiler refinement, live concurrent authority/final publication and actual graph/Delta implementation remain required. Full acceptance is unchanged at 24/132 with 108 missing/failed required cases and all 28 complete security criteria open.


### Raw write review corrections and L01 registration — 2026-10-09

Astra ultra found that the first 863-observation inventory receipt retained 20 expected/observed mismatches despite status=passed: enriching a mutable privilege object after comparison changed earlier evidence. That historical receipt is preserved as write-inventory-alias-failure.json with status=failed and explicit qualification. The runner now copies both observation sides and rejects any final mismatch or duplicate observation ID before publication. A dependency-inventory attempt also refused a host variable-name collision before recording success; the corrected collector uses separate names for dependency descriptors and column privilege expectations.

The fresh corrected component passed 961 matching observations with unique IDs and current source hashes. It records original security_raw schema/objects/columns/key/login constraints, guardian ownership, non-elevated ordinary roles and a non-login guardian, and effective table/column privileges on employee, m2m_employee_project and project. Ordinary enrollment/assignment/project mutation probes refuse. Complete enrollment, assignment, action-grant and Project fact sets are independently compared after both execution phases. Installation metadata is independently recollected across the two phases. Astra ultra found no remaining implementation blocker for the fixed L01 assertion; partial-row and receipt-aliasing findings are resolved.

pg-raw.L01 is now registered with the reviewed original test source, independent oracle and exact 87-source implementation closure. The runner preserves the gate-supplied UUID/case binding, checks its exact selected source set, adds ordinaryActor and a canonical nativeInventory digest, retains managed-source execution metadata and serializes observations canonically. The complete 132-case gate and a separate component refresh are executing; registration alone does not imply acceptance. General compiler/refinement, live authority/final publication, every other lifecycle case and actual graph/Delta implementation remain required.


### Raw PostgreSQL L01 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.L01 under US-057-AC1 with 962 matching observations, its preserved gate UUID and exact 87-source bindings. The independently authored PostgreSQL17.9 raw profile exercises create/delete/update and ownership-changing writes across original/proposed states, changed-field actions and separate changeOwner/changePolicy permissions. Native hidden-original zero-row commands remain indistinguishable from absent targets. Dependent multirow refusal preserves the complete committed business snapshot, with excluded private sequence instrumentation demonstrating prior authorized processing. Direct ordinary authority mutations, trigger disable and TRUNCATE refuse.

The actual public pg-runtime decodes native RETURNING values/counts and commits permitted commands; rejected commands retain zero data/command frames, 42501 then25P02, explicit rollback acknowledgment and same-native-PID recovery. All525 original query journals have bijective request/frame/outcome custody, with missing/duplicate and protocol-valid partial-row controls. Both execution phases retain independent full authority fact comparisons and installation descriptors, including original enrollment/assignment/project key/login constraints and ordinary effective table/column privileges. NativeInventory ordinaryActor/digest, executed managed-source metadata, SCRAM, image/client and dependency resolution are retained. A separate source-current component passes961 observations. Astra ultra found no remaining implementation or registration defect after the archived receipt-aliasing failure and partial-row/dependency corrections.

The complete gate now accepts25/132 required cases and leaves107 missing/failed. All28 complete security acceptance criteria remain open. Eleven aggregate command groups,91 evidence checks and the470-criterion traceability check pass. L01 qualifies this authored stable-cut raw assertion; it does not accept L02 or any other remaining case, general compiler lowering/refinement, live concurrent authority/final publication, or actual graph/Delta implementations. The full original goal remains active.


### Raw L02 field-authority component and registration — 2026-10-09

The additive L02 fixture preserves the accepted L01 source/corpus and requires US-057-AC1 field-authority behavior under TD-057. Jules has active A/B membership and object, ownership-change and policy-change grants, but lacks writeOwner at B. Separate OLD/NEW owner changes refuse; the same actor's value-only update at B permits. Existing baseline ID/value/policy cases and independent Dave/Frank positive controls show unchanged ownership/policy fields do not require those extra actions. Actual runtime and plain SQL execution retain complete authority/effect snapshots, native inventory, original responses, transaction recovery and private mutation-denial controls.

Astra requested the same-actor positive control and explicit read qualification. The ordinary PostgreSQL WHERE/RETURNING profile requires read visibility at selected write states. Every actor's native read/create/update/delete grid across A/B/D is independently compared with enrollment, active assignments and authored grants; write eligibility implies read permission in this corpus. TD-057 and receipts explicitly exclude write-without-read and full SQL/compiler admission from the symbolic fold. Eleven Z3 conditional checks add distinct OLD/NEW owner-field necessity to the independently quantified authorization algebra.

The first additional seed attempt was correctly refused by guardian-owned forced RLS. The corrected excluded installer step seeds the two new rows while the mutation trigger is disabled, then re-enables it before ordinary execution; no ordinary privilege or policy is weakened. Fresh pg-raw-field-write-component.json passes1119 matching observations with unique IDs across34 vectors and retains source-current proof evidence. Twelve component groups,93 evidence checks and the470-criterion ledger pass. Astra ultra found no remaining scope/isolation blocker to fixed-profile registration.

pg-raw.L02 now binds the original field-write test, independent oracle and exact88-source closure, preserving its case/run UUID, complete inventory and canonical observation requirements. The complete132-case gate is executing; L02 registration does not yet imply acceptance. Full acceptance before that result remains25/132, with107 required cases missing/failed and all28 complete criteria open. General compiler/refinement, live concurrent authority/final publication, graph/Delta and every remaining required case stay in scope.


### Raw PostgreSQL L02 accepted at authored stable cut — 2026-10-09

The fresh complete gate accepts pg-raw.L02 under US-057-AC1 with1120 matching observations, its preserved fresh case/run UUID and exact88-source closure. The34-vector fixed three-non-null-TEXT-field corpus runs through actual pg-runtime and ordinary SQL. It retains separate OLD/NEW owner-field refusals with object, membership, ownership-change and policy-change grants present; the same actor's value-only success at the forbidden-owner Project confirms field isolation. Existing identity/value/policy refusals, unchanged-field positive controls, independent complete business/authority facts, original native response custody, explicit transaction recovery and before/after installation/privilege checks remain exercised.

Native action grids independently verify the selected raw WHERE/RETURNING read precondition for all11 ordinary actors. Semantic read/write actions remain distinct; write-without-read is unqualified for this wrapper. Eleven conditional Z3 checks establish the independent authorization algebra under stated premises, not SQL/compiler admission or concurrent authority. The source-current standalone component retains1119 matching unique observations and595 original query journals. Astra ultra found no remaining scope/isolation blocker after the same-actor and read-precondition refinements.

The complete gate now accepts26/132 required cases, leaving106 missing/failed and all28 complete security criteria open. Twelve aggregate command groups,94 evidence checks and the470-criterion traceability check pass. L02 accepts its declared fixed raw field-authority assertion only. L03 revocation/drain, all other unaccepted raw cases, general compiler/refinement, live concurrent authority/final publication and actual graph/Delta implementations remain required. The full goal stays active.

### L03 component evidence, not acceptance — 2026-10-09

pg-raw-drain-component.json contains145 matching unique observations from four actual pg-runtime/PostgreSQL17.9 schedules. Publish/discard await actual consumer acknowledgment before native guard release; early-unlock and backend-loss controls demonstrate unsafe revocation acknowledgment with a live host buffer. Exact completion-event equality and bounded EOF inspection reject embedded and delayed rows, each exercised by a subprocess negative control. Original query custody and private runtime telemetry remain retained. Astra ultra found no remaining completion-verifier defect.

persistent-publication-formal.json contains four conditional Z34.15.4 proof checks with satisfiable populations and weakened counterexamples. Durable custody survives modeled native loss and excludes revocation acknowledgment until consumer drain. Native implementation qualification is explicitly false. Persistent native custody, authenticated enrollment/retirement and complete installation/authority inventory remain prerequisites for L03 registration. Thirteen component groups and96 freshness/evidence checks pass; full acceptance remains26/132 and all28 complete criteria open.

### Persistent custody through actual pg-runtime — 2026-10-09

pg-raw-persistent-drain-component.json retains119 matching unique source-current observations across healthy publish and backend-loss discard. Trusted fixture issuer enrollment binds UUID/actor/native PID/backend_start; atomic single-use admission and exclusive retirement fencing prevent tested token reuse. Ordinary revocation refuses with an unresolved durable publisher, preserving the independently observed active assignment despite native reader loss and retained host buffer. Actual consumer acknowledgment, buffer discard and explicit issuer retirement precede successful ordinary revocation retry. Original refusal journals retain exact query custody,42501/no data-command/ReadyE and rollback. Both raw and drain installation snapshots remain stable after each schedule.

The source-current aggregate passes14 groups and97 evidence checks. Astra reviewed the corrected sources and receipt and found no new defect in the two authored schedules. Single-use is qualified to committed admission; rollback/replay custody remains open because transaction rollback can undo the claim. Full metadata/privilege/fact qualification, custody mismatch/private-access/isolation/multiple-publisher controls, public issuer and complete writer/read/release closure remain open; this component is not registered L03. Formal proof remains conditional rather than a verified SQL/TypeScript refinement. Full acceptance stays26/132.

### Rollback/replay custody and refusal-control isolation — 2026-10-09

The refreshed persistent component retains249 matching unique observations across three schedules. Native rollback restores enrolled custody while the first host buffer remains; replay creates a second buffer. Backend loss leaves revocation refused until both buffers are explicitly discarded and the issuer retires custody. Four ordinary identities lack private table/helper/stats capabilities, with actual42501 attempts. Unsupported isolation asserts its specific native guard reason. Terminal history mutation refuses and preserves exact private bindings; original-backend terminal reuse has specific custody42501/no data-command frames and same-PID rollback recovery.

Astra identified masked isolation and terminal-token controls in the intermediate238-observation run; the249-observation replay corrects their isolation. Astra re-reviewed the249-observation corrections and found both isolation defects resolved with no additional defect. Fourteen component groups and97 evidence checks pass. General rollback/savepoint/failure paths, otherwise-valid identity mismatches, simultaneous publishers, complete independent inventory/facts and public issuer/full read-writer-release closure remain required. L03 is unregistered; full acceptance remains26/132.

### Exact sibling retirement retains the other publication — 2026-10-09

The refreshed persistent component has336 matching unique observations across four schedules. Two actual native reader sessions enroll independently and retain separate host buffers. Primary backend loss, discard and exact retirement leave the live sibling pending; actual revocation refuses and native authority remains active. Separate sibling discard acknowledgment/retirement then permits commit. Terminal history retains both UUIDs.

Astra found a primary-only final-buffer check in the intermediate330-observation version. The336-observation replay computes aggregate liveness from both buffers, derives sibling drain from its actual buffer and asserts both empty before final revocation. An actual retained-sibling control exposes the old primary-only false-drain view. Astra re-reviewed the336-observation fix and found the sibling-buffer gap closed with no additional defect. Fourteen component groups and97 evidence checks pass. All-owner failure/recovery, identity mismatch controls, full independent inventory/facts and public issuer/admission/release/mutator closure remain open; L03 stays unregistered and full acceptance stays26/132.

### Full authored fact comparisons — 2026-10-09

The persistent component now retains432 matching unique source-current observations across four schedules. All eight authored business/authority relation fact sets are independently queried and compared at initial, refusal/sibling-refusal and final cuts. Only Alice's assignment-active flags may change after successful revocation; company/Project, enrollment, ownership, resources and private/child carriers remain exact. Fourteen aggregate groups and97 evidence checks pass. Independent review is pending. This is authored fact-universe qualification; complete effective native inventory and remaining custody/public activation/graph requirements remain open. L03 is unregistered and full acceptance remains26/132.

Astra confirmed the full-fact logic and found one omitted healthy-publisher refusal boundary. Its added comparison before retirement/retry brings the fresh replay to440 matching unique observations across four schedules. Astra re-reviewed the440-observation correction and found no remaining defect. Fourteen component groups and97 evidence checks pass; broader inventory and L03 remain unqualified.

### Effective ordinary table/column privileges — 2026-10-09

The persistent receipt now retains449 matching unique source-current observations across four schedules. An independently authored four-actor matrix covers all eight raw tables, two views and the publisher registry, including seven table actions and four actions per exact authored column. Native metadata is enumerated and ordered independently; the matrix is compared initially and after every schedule.

The negative control grants only assignment active-column UPDATE inside a rolled-back installer transaction. Native table UPDATE remains false while column UPDATE becomes true; the baseline assessor rejects the changed matrix, and a separate observation confirms rollback restores expected privileges. Fourteen component groups and97 evidence checks pass. Independent review is pending. Broader schema/routine/role/RLS inventory, identity mismatch controls and public issuer/full closure remain open; L03 remains unregistered and acceptance stays26/132.

Astra identified missing PostgreSQL17 MAINTAIN in the intermediate449-observation matrix. The corrected453-observation replay includes all eight table actions and a transactional MAINTAIN grant control: native MAINTAIN becomes true, the full assessor refuses, the old seven-action projection would pass, and rollback restores the expected profile. This follows the [PostgreSQL17 privilege catalog](https://www.postgresql.org/docs/17/ddl-priv.html). Astra re-reviewed the fix and found no additional defect;14 component groups and97 evidence checks pass. Broader inventory and L03 acceptance remain open.

### Effective native role/schema/routine entries — 2026-10-09

The persistent component now retains479 matching unique source-current observations. Independently expected six-role capability flags, two-schema owner/USAGE/CREATE and all six routine signatures/owners/definer/search-path/PUBLIC/effective EXECUTE are compared initially and after every schedule. Native transactional PUBLIC helper, outsider CREATE, owner-role inheritance and unexpected public routine controls each demonstrate the assessor refusing a real capability change; rollback and fresh profile restoration are checked separately.

Astra independently reviewed the479-observation addition and found no new defect;14 component groups and97 evidence checks pass. Complete RLS/policy/trigger/constraint expectations, broader role/default-grant settings, identity-mismatch and public issuer/full admission-release-mutator closure remain open. L03 stays unregistered; full acceptance stays26/132.

### Authored enforcement metadata — 2026-10-09

The persistent component now has509 matching unique source-current observations. Expected eleven relation owner/kind/RLS/force/view-option descriptors, two exact resource policies and two complete authored publisher trigger descriptors are compared initially and after every schedule. Native rolled-back NO FORCE, permissive PUBLIC policy, disabled trigger, owner change and WHEN(false) controls each expose their target weakening and then restore the expected metadata.

Astra reviewed these checks and found no new defect. Fourteen component groups and97 evidence checks pass. Complete constraints/settings/grant options, identity mismatches, public issuer and all read/release/mutator closure remain open. Direct baseline reader surfaces remain outside the durable enrolled wrapper qualification. L03 stays unregistered and full acceptance remains26/132.

### Original native actor/PID/incarnation mismatch controls — 2026-10-09

The persistent component now retains552 matching unique source-current observations. Three otherwise-valid UUID rows independently mismatch actor, live native PID or native backend_start. The assessor confirms exactly one false identity equality per row. The original actual Alice runtime refuses each with exact custody42501, zero data/command frames, ReadyE and rollback; enrolled rows remain unchanged until explicit excluded test cleanup. Correct enrollment succeeds afterward on the same original native PID.

Excluded control retirement conservatively marks no-output control tokens pending then released and retains UUID history. It does not establish public issuer/cancellation safety or infer no buffers from enrolled state. Astra reviewed the additions and found no new defect. Fourteen component groups and97 evidence checks pass. Full native identity uniqueness, remaining inventory and public issuer/all admission-release-mutator closure stay open. L03 is unregistered; acceptance stays26/132.

### Schema/routine grant options — 2026-10-09

The persistent component retains570 matching unique source-current observations. Native schema USAGE/CREATE and routine EXECUTE grant options match independent six-role expectations. Transactional WITH GRANT OPTION controls preserve admitted access while enabling delegation, reject the full matrix and demonstrate the old permission-only projection would pass. Rollback restores the profile. Actual ordinary Alice delegation attempts yield no-grant warnings; independent entry observations confirm unchanged capabilities. The native inquiry syntax follows [PostgreSQL17 access privilege documentation](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE).

Fourteen component groups and97 evidence checks pass. Astra independently reviewed the570-observation addition and found no new evidence defect. Table/column/default-grant and role administrative-option closure, remaining inventory and public issuer/full admission-release-mutator requirements stay open. L03 remains unregistered and full acceptance stays26/132.

### Table/column grant options — 2026-10-09

The persistent component has584 matching unique source-current observations. Expected grant options cover all eight table actions and four actions per exact authored column for all four ordinary actors. Table/column SELECT WITH GRANT OPTION controls keep ordinary read permission true while adding delegation, reject the expanded matrix and expose the older permission-only blind spot. Rollback restores the profile. Alice's actual table/column GRANT attempts yield no-grant diagnostics and independent complete matrices remain unchanged.

Astra reviewed the additions and found no new defect. Fourteen component groups and97 evidence checks pass. Administrative/default-grant closure, remaining inventory and public issuer/full admission-release-mutator qualification remain open. L03 stays unregistered and full acceptance stays26/132.

### Native ADMIN/INHERIT/SET membership options — 2026-10-09

The persistent component retains629 matching unique source-current observations. Exact role/member/grantor/ADMIN/INHERIT/SET expectations are compared at initial/final cuts. Three transactional one-option controls reject the baseline, verify all other membership facts unchanged and restore the profile after rollback. All four ordinary actors' guardian role grants and guardian/incarnation SET ROLE attempts refuse42501, followed by unchanged membership observations. Option semantics are grounded in [PostgreSQL17 role membership](https://www.postgresql.org/docs/17/role-membership.html).

Astra found no defect in these additions. Fourteen component groups and97 evidence checks pass. Remaining default-grant/settings/constraint inventory and authenticated issuer/full admission-release-mutator closure remain open. L03 stays unregistered and acceptance stays26/132.

### Ordinary runtime credential bundle — 2026-10-09

The persistent publication probe previously passed every fixture credential, including the excluded PostgreSQL installer credential, to the ordinary runtime child. It now passes only the authored reader and revoker credentials. The runtime refuses an unexpected actor key, missing required actor or empty/non-string password before endpoint and journal setup. Exact sorted key arrays are compared structurally; delimiter-joined names are not an identity representation. Each schedule retains only the exact actor names in its observation, never credential values.

Four retained synthetic subprocess controls verify extra-installer, missing-revoker, empty-password and combined-key bundles refuse with the exact bundle error and no stdout before invalid endpoint setup. The source-current native component passes637 unique matching observations across four schedules; fourteen component groups and97 evidence checks pass. This constrains the explicit actor bundle, not inherited environment, host filesystem or complete process-secret isolation. L03 remains unregistered and full acceptance remains26/132. Authenticated enrollment/retirement and complete direct-read, release and authority-mutation participation remain open.

Astra ultra independently reviewed the final credential-boundary change and found no actionable defect. It confirmed637 matching unique observations and all87 current source digests.

### Denied unenrolled raw reads and enrolled fresh reads — 2026-10-09

CONTRACT-053 requires uncoordinated disclosure paths to refuse. The persistent integration fixture now revokes ordinary table, function and schema grants in security_raw. Independent table/column and schema/routine inventories expect no ordinary raw access at initial and final cuts. Guardian still executes the enrolled ID projection under forced resource RLS and original SESSION_USER. The original raw membership/write profiles remain separate; their general direct-query behavior is not supplied by this fixed Alice ID-projection component.

All four ordinary actors refuse SELECT on every authored raw table/view (40 checks) and COPY/cursor/helper paths (16 checks). The actual Truss runtime additionally exercises seven direct paths in each of four schedules: one original server-error attempt, no data/command-success frames, native42501, ReadyE, rollback and unchanged native PID. A failed replay exposed an incorrect ReadyForQuery field accessor in the new test; the accessor was corrected to the existing decoder representation before the successful replay.

The post-revocation freshness read no longer bypasses custody. A distinct UUID binds its original native actor/PID/backend_start, the enrolled query returns the expected empty result after revocation, COMMIT retains pending custody, and the excluded issuer retires only after the actual empty-result completion event. Native pending and released states are independently observed. Table/column grant-option controls explicitly normalize their newly added access when testing option-only omission; schema grant-option isolation uses the drain schema where Alice retains USAGE.

The current component passes945 unique matching source-current observations across four schedules, fourteen component groups and97 evidence checks. This is progress on uncoordinated-read denial for the authored projection, not general relational query/disclosure compilation or complete L03 acceptance. Public authenticated enrollment/retirement, wider authority-writer/release closure, remaining native inventory, actual graph stores and other backend cases remain required. L03 stays unregistered; full acceptance remains26/132 and the original goal stays active.

Astra ultra found no actionable defect in the final change and verified945 unique matching observations, all87 current source digests and224 original-runtime direct-path assertions.

### Enrolled public-value, ownership and disclosure projection — 2026-10-09

The authored enrolled raw projection now returns four fields: resource ID, public value, authorized Project ownership context and typed disclosure cells. It composes the existing forced-RLS resource table with the security-barrier ownership and disclosure views inside the same guarded durable claim. Ordinary raw privileges remain absent. Alice sees only Project A ownership for RA and RAB, even though RAB also has Project B ownership in native facts. The independent expected public values and disclosure cells come from the retained literal membership oracle; they are not computed from native query results.

Actual Truss buffers retain all four native TEXT carriers, including JSON encoded ownership and disclosure. Typed JSON decoding preserves original-null, absent, withheld and transformed cells; object key order is normalized solely for structural comparison. Initial buffering, rollback/replay, independent sibling buffering and the actual consumer publication compare the complete projection, not only IDs. Parent-controlled consumer delivery also independently compares the full payload. Post-revocation enrollment still returns no rows and commits pending custody before explicit terminal retirement.

This extends the integration component's useful relational semantics without admitting unenrolled direct access. It does not implement a general query/disclosure compiler, all actors' projection profiles, actual graph storage mappings, public authenticated enrollment/retirement or complete physical refinement. Those remain part of the original goal. Astra ultra found no actionable security defect and confirmed full carrier preservation and independent expected semantics. An obsolete oracle phrase describing an ID-only projection was corrected and native evidence replayed to preserve source freshness. L03 remains unregistered; acceptance remains26/132.

Final source-current replay passes945 matching unique observations across four schedules; fourteen component groups and97 evidence checks pass.

### Unbounded token/count durable-custody induction — 2026-10-09

A new Z3 proof supplements the earlier single-publisher Boolean proof with unbounded integer-indexed token identities and unbounded nonnegative per-token retained buffer counts. Its invariant states that every live buffer retains unresolved custody, terminal tokens have no custody or buffer, and a revocation event excludes every live buffer. Eight modeled atomic transitions individually preserve the invariant: enrollment, read/replay, commit/rollback, backend loss, complete consumer drain, unlock, retirement and revocation. Further checks cover terminal non-reuse, independent sibling preservation, sibling exclusion of revocation and backend-loss retention.

All fourteen cases retain an UNSAT violation query, a SAT unsafe control and a SAT valid population. Controls include forgotten durable custody and a primary-only revocation assessment that overlooks a live sibling. New enrollment/read resets the event acknowledgment marker; this permits new post-acknowledgment operations rather than permanently closing the realm. Fresh eligible policy cuts are an explicit separate premise, not established by this count model.

The proof assumes a complete truthful durable registry, authenticated enrollment/retirement, truthful drain of all buffers for the exact token, atomic serialized protocol transitions, complete writer participation and fresh native authority observations. Integer identities and counts abstract UUID/native identity binding, payloads and transport ownership. Source digests link the authored persistent SQL/runtime/oracle for traceability; they do not prove refinement. Native SQL/TypeScript refinement, current-policy correctness, crash recovery and liveness/fairness remain open. The proof is linked to US-057-AC2 and remains conditional component evidence, not L03 acceptance.

The proof command is part of component validation; its source freshness, unique case IDs, exact expected solver outcomes and explicit nativeImplementationQualified=false are checked by the evidence validator. Fifteen component groups and99 evidence checks pass. Existing native component evidence remains945 observations across four schedules. Acceptance stays26/132 and the full goal remains active.

Astra ultra identified a retained-formula replay defect in the first proof receipt: post-solve SMT serialization included Z3 internal model-converter declarations, and26 of42 formulas did not parse independently. Formula results were not contradicted, but that receipt was insufficient as standalone replay evidence. The prover now serializes before solving and requires a fresh solver to parse and reproduce every retained formula result before writing the receipt. All42 formulas replay with expected outcomes; the validator checks their replay outcomes. Positive preservation populations now explicitly include live buffers for read/replay, commit/rollback, backend loss and unlock, and multiple buffers for consumer drain. The eight preservation cases share one custody-forgetting negative control; they are not eight transition-specific mutants. Final fourteen formal cases, fifteen component groups and99 evidence checks pass.

Astra ultra re-reviewed the corrected proof, independently parsed and solved all42 retained formulas to their recorded results, confirmed five current source digests and found no remaining actionable defect.

### Retained formal-formula replay audit and hash/key correction — 2026-10-09

Following the quantified custody serialization defect, a fresh-solver audit examined the selected saved smt/result leaves in the formal receipt directory. It found four nonparseable hash/key SAT formulas containing undeclared uninterpreted model constants. The hash/key prover now captures pre-solve SMT and requires fresh parsing and reproduction of every outcome before retaining its two conditional cases. This corrects reproducibility evidence; the original UNSAT/SAT theorem results were not refuted.

The retained audit scans19 formal receipts and reproduces147 selected formulas from eight receipts. Per-receipt counts explicitly identify eleven receipts without selected smt/result leaves: some use alternate query fields, others omit serialized formulas. They remain outside this audit, and expanded replay coverage remains required. Legacy selected formulas can contain Z3 model-converter annotations ignored with parser diagnostics; the result concerns parsed assertions, not strict SMT-LIB conformance. Neither replay nor source hashes validate formula-to-generator correspondence, assumptions or physical implementation refinement.

Astra identified two verifier issues during review: absolute/relative self-path mismatch caused coverage to fail closed, and nonempty/unique result checks could accept truncated coverage. The audit now guards and retains its reviewed relative self path; the validator independently derives the exact saved leaf ID/result map and requires exact coverage, uniqueness and matching outcomes. Missing-leaf and duplicate-leaf controls refuse. Astra independently replayed all147 selected formulas, confirmed all20 audit source digests and found no remaining actionable defect in the qualified scope.

Seventeen component groups and101 evidence checks pass. Native persistent evidence remains945 observations across four schedules. Expanded formal replay coverage and full implementation refinement remain open; no backend case is promoted. Full acceptance remains26/132 and the original goal remains active.

### Expanded saved-formula replay coverage — 2026-10-09

The replay audit and independent exact-coverage verifier now recognize the older query/result field pairs used by the main semantic, mask-query and existence-truth receipts. This exposed a nonparseable main semantic weakened-control formula caused by post-solve model-converter serialization. The main prover now captures all three queries before solving and requires fresh solver replay before retaining its twenty cases. Its source change correctly invalidated prior S12 gate evidence, so the full acceptance gate was launched to refresh it rather than modifying stored gate results.

The eight remaining formula-less formal receipts now retain pre-solve SMT and fresh replay results in their existing safety/control/population records. No formulas, assumptions or scope claims were changed in those generators. The resulting audit independently reproduces321 formulas across all nineteen selected receipts; none lacks a selected saved formula. Some legacy formulas still contain ignored parser annotations, so strict SMT-LIB conformance remains outside this replay claim. Formula-to-generator correspondence, policy assumptions and native/compiler/runtime refinement remain separately required.

Astra ultra independently replayed all321 formulas, confirmed exact receipt counts and current source digests, tested omitted coverage rejection and found no actionable defect. Twenty-six component groups pass. The original full acceptance refresh completed with26 of132 cases accepted and106 missing/failed; S12 evidence is fresh again. All101 evidence checks pass. The full gate remains failed because the original required backend scope is incomplete. No extra backend case or full criterion is claimed accepted, and the original goal remains active.

### Independent durable-publisher integrity inventory — 2026-10-09

The persistent raw component now compares independent authored expectations for all five publisher columns (native type, NOTNULL, default, identity and generated flags), exact UUID primary-key and state-domain constraints (keys, definition, validation and deferral), and the authored btree index (keys, uniqueness, primary/valid/ready/immediate flags, predicate and expressions). Initial and final cuts and every control restoration retain full expected/native snapshots. Transactional controls drop the primary key or state check, permit NULL state or add a state default; each rejects the baseline, matches an independently constructed control snapshot and restores the exact profile after rollback.

Actual excluded native insert attempts reject invalid state23514, NULL state/ID23502 and duplicate UUID23505. SQLSTATE checks match the anchored verbose native ERROR line. The duplicate is one atomic multirow INSERT in the fresh owned fixture, and all refused insert transactions leave the publisher table empty before schedules. UUID history and ordinary privilege controls remain separately exercised.

Astra recommended retaining full queried integrity facts instead of only equality Booleans; the final receipt includes all thirteen snapshots, including independently expected control mutations. The source-current native probe passes980 matching unique observations across four schedules; twenty-six component groups and101 evidence checks pass. This qualifies the authored publisher metadata and tested integrity refusals, not all raw constraints, operator classes, default grants/settings, authenticated issuer custody or complete admission/release/authority-writer participation. L03 remains unregistered; full acceptance stays26/132 and the goal remains active.

Astra ultra confirmed980 matching unique observations, all87 current source digests and thirteen complete integrity snapshots, and found no remaining actionable defect in this scoped addition.

### Guard-before-tuple private publisher retirement — 2026-10-09

The persistent SQL component now exposes a private guardian-owned SECURITY DEFINER retire_publisher(uuid) routine, with fixed pg_catalog search path, no PUBLIC/ordinary EXECUTE and read-committed-only admission. It acquires the exclusive realm guard before updating the exact pending UUID to released, and refuses missing or terminal identifiers. Normal excluded fixture retirement paths use this routine. This is a private issuer primitive, not authenticated public enrollment/retirement or proof of truthful consumer acknowledgment.

The earlier direct UPDATE path could acquire the publisher tuple lock before its history trigger waited for the realm guard, opposite the enrolled read's guard-before-tuple order. Two actual owned PostgreSQL contention controls run while Alice retains her original shared guard and the actual ordinary revoker waits for the exclusive guard. The old tuple-first UPDATE prevents an independent FOR UPDATE NOWAIT probe; the private guard-first routine leaves that row available while waiting. Both retirement attempts then refuse with native lock-timeout55P03, leave custody pending and preserve all business facts. Ordinary invocation and unsupported snapshot refusals remain checked, and independent routine/privilege inventories include the new private entry.

Astra caught a verifier timing gap: a successful row probe after retirement timeout could falsely demonstrate availability during waiting. The corrected controls capture the exact native decimal-text retirement PID and require both the owned process to remain live and that same PID/app/actor to remain blocked on the same exclusive advisory guard immediately after the row probe. Astra confirmed the fix and independently verified1009 unique matching observations and87 current source digests, finding no remaining actionable defect. Twenty-six component groups and101 evidence checks pass.

These observations establish the authored lock-ordering improvement, not general deadlock freedom, native/compiler refinement, public issuer custody or complete writer/release participation. The trigger still protects excluded direct mutations, which are outside the ordinary profile. L03 remains unregistered, full acceptance stays26/132 and the original goal remains active.

### Native-bound private enrollment and queue-safe admission — 2026-10-09

The persistent component now has a guardian-owned enroll_publisher(uuid,name,integer,timestamptz) routine with fixed pg_catalog resolution, read-committed-only admission and no PUBLIC/ordinary EXECUTE. Its native realm guard participates in writer exclusion. Nonnull UUID/PID/backend_start and the authored Alice profile are mandatory. A separate private incarnation-role stats helper compares supplied actor, PID, native backend_start and client-backend kind against PostgreSQL's actual backend observation; only guardian can execute that helper. Primary, sibling and post-revocation fixture enrollments now call this primitive instead of directly inserting valid publisher rows. Deliberately malformed raw rows remain explicit excluded test injections for read-boundary mismatch controls.

Native controls reject three otherwise-valid actor/PID/incarnation mismatches and four NULL components with exact42501 and no new custody, reject active UUID duplication and terminal UUID reuse with23505 while preserving their states, and independently compare successful native identity bindings. Ordinary calls to both new routines and unsupported enrollment snapshots refuse. Native routine/privilege inventories enumerate both new entries.

Astra identified a circular-wait regression in the first implementation: a reader held its session shared guard while awaiting a separate issuer's shared acquisition, which can wait behind a queued exclusive writer that is itself waiting for the reader. Enrollment now commits before the reader acquires its session guard. To also avoid nested-admission stalls while another publication remains live, the enrollment primitive uses native try-shared acquisition and explicit42501 Publisher enrollment guard unavailable rather than waiting. An actual queued-writer control distinguishes this admission refusal from native55P03 timeout and verifies no token, unchanged publisher count and unchanged original reader/writer guard states. Public issuer retry and recovery remain unimplemented; refusal is conservative, not automatic retry or weak admission.

All four schedules independently observe no granted reader shared guard after committed enrollment, then invoke a separate actual ordinary revoker before signaling the child to acquire its guard. Revocation refuses on the specific durable-custody condition, enrollment remains enrolled and all eight authored business relations stay unchanged. These forty-four checks demonstrate the intervening-writer gap is closed in this authored component.

Final native evidence passes1103 matching unique observations across four schedules, with all87 source digests current. Twenty-six component groups and101 evidence checks pass. Astra ultra re-reviewed the ordering, private identity validation and all forty-four intervening-writer assertions, finding no remaining actionable defect. These private primitives do not establish public issuer authentication, broker all-buffer drain truth, complete retry/recovery, generalized query profiles or all writer/release paths. L03 remains unregistered and full acceptance stays26/132; the original goal remains active.


### Private retirement state admission — 2026-10-09

The persistent raw probe now attempts private retirement of the actual enrolled UUID before the runtime acquires its shared guard, plus NULL and unknown UUIDs. Each attempt must refuse with an anchored native verbose ERROR42501, the specific Publisher retirement unavailable diagnostic and no result output. After each refusal an independent native query compares the original actor, PID and backend_start binding and requires state enrolled. Each schedule also attempts a second retirement of its released post-revocation token, requiring the same refusal and preserved released history. These thirty-two additional assertions cover all four existing schedules.

The source-current native component passes1135 matching unique observations across four schedules; twenty-six component groups and101 evidence checks pass. This qualifies the private routine's authored state admission and refusal preservation. The unbounded custody model currently combines enrolled and pending as unresolved custody; these finer native state restrictions are additional observations, not a state-refinement theorem. Public issuer authentication, truthful all-buffer retirement, recovery, generalized query profiles and complete writer/release participation remain open. L03 remains unregistered, full backend acceptance stays26/132 and the original goal remains active. Astra ultra independently verified all1135 unique matching observations, four schedules and87 current source digests and found no actionable defect. Repeated terminal retirement checks state preservation; full binding preservation is separately checked for enrolled refusal controls.


### Explicit publisher-state conditional proof — 2026-10-09

publisher-state-formal.json retains fourteen Z3 cases and forty-two pre-solve formulas, each independently parsed and replayed. The unbounded integer-token model distinguishes absent, enrolled, pending and released custody with nonnegative retained-buffer counts. Empty initialization and nine modeled atomic transitions preserve custody. An admitted claim rollback restores enrolled from pending while keeping host buffers; a subsequent read can accumulate another buffer. The exact state projection unresolved=(enrolled or pending), terminal=released satisfies the existing abstract custody invariant. Specific admission mutants remove the relevant state restriction and yield counterexamples for enrolled retirement, repeated terminal retirement and terminal reenrollment. The nine preservation cases share one custody-forgetting mutant and are not nine distinct mutation tests.

An initially unconstrained SAT population returned unknown under the solver deadline. Transition populations now supply explicit array witnesses with the authored live or multiple-buffer counts; safety formulas and unbounded domains were unchanged. The final fourteen cases require UNSAT safety queries and SAT control/population queries, including fresh replay of all retained formulas. Twenty-seven component groups pass; the independent audit reproduces363 saved formulas across twenty formal receipts and all103 evidence checks pass.

This is conditional model induction and state-invariant projection, not transition-by-transition refinement to the other model or verification of SQL/TypeScript execution. Commit is a modeled stutter; rollback covers an admitted claim rollback only, not arbitrary nested transactions or enrollment rollback. Abstract locks do not model PostgreSQL queues. Truthful complete enrollment and all-buffer drain, authenticated issuer, serialized transitions, participating writer guard and fresh authority observations remain premises. Public issuer/recovery and full physical/backend qualification remain open. Astra ultra independently replayed all42 saved formulas, verified all three current source digests, confirmed the exact invariant projection and intended admission mutants, and found no actionable defect. The explicit witnesses constrain only SAT populations; universal preservation formulas remain unchanged. No additional backend case is accepted; the full gate remains26/132 and the original goal stays active.


### Publisher-state transition correspondence — 2026-10-09

The explicit-state generator now loads the actual multipublisher custody model and substitutes unresolved=(enrolled or pending), terminal=released, and the same retained counts, locks and acknowledgment event. Nine additional cases require each concrete modeled transition to satisfy its mapped abstract transition. Commit and claim rollback map to commit-or-rollback; read maps to read-or-replay; the other operations map to their corresponding abstract operations. These checks retain UNSAT correspondence violations, SAT concrete populations and SAT controls that deliberately add one to the projected next buffer count. The controls test a broken projection, not nine native implementation mutants.

Z3 returned unknown for some lambda-array SAT queries. Array equalities in the mapped abstract formula are now expressed extensionally as equality at every integer index, with beta reduction through simplify. This preserves array equality semantics and avoids accepting an unknown solver result. The twenty-three explicit-state cases retain sixty-nine independently replayable pre-solve queries. Twenty-seven component groups and103 evidence checks pass; the whole retained audit now covers390 formulas across twenty receipts.

This establishes transition correspondence between the two authored mathematical models under their recorded premises. It does not establish SQL/runtime refinement, PostgreSQL queues or snapshots, authenticated issuer and truthful all-buffer retirement, arbitrary nested/enrollment rollback, recovery or full backend acceptance. Earlier statements that transition correspondence was unproved are historical and superseded only for these two models. Astra ultra independently replayed all69 saved queries, rebuilt all nine transition implications with UNSAT violations, verified current source digests and confirmed the projection and extensional equality transformation. No actionable defect remained. Full acceptance remains26/132 and the original goal remains active.


### Dedicated authenticated host issuer capability — 2026-10-09

The persistent fixture now defines a distinct LOGIN host issuer with NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB and NOREPLICATION. Its protected-schema grants are drain USAGE and EXECUTE on the two guardian-owned enrollment/retirement routines without grant options. It has no business or publisher table/column privileges, no stats membership, no incarnation/helper/read/revocation EXECUTE and no privileged role membership. The independent effective inventory now covers seven selected roles and includes issuer table/column privileges and grant options across all eleven protected relations. Ordinary reader/revoker roles cannot SET ROLE to the issuer.

Normal primary, sibling and post-revocation enrollment and retirement now connect separately with the host issuer's SCRAM credential. Enrollment still obtains exact decimal-text PID and native timestamp text from the excluded assessor, then supplies that binding to the private native-validation routine. Nine actual issuer login identity checks require session_user=current_user=issuer and no superuser/bypass attributes. Ten issuer attempts refuse native42501 for publisher/raw reads, raw writes, stats helpers, protected read/revocation, privileged role switches and reader delegation. The original runtime child continues receiving only reader and revoker credentials; the issuer credential remains in the fixture host context. Malformed identity injection and drift/lock controls remain explicit excluded administration.

The source-current native component passes1158 unique matching observations across four schedules, twenty-seven component groups and103 evidence checks pass. This reduces routine-operation privilege from fixture superuser to a separately authenticated restricted host role. The trusted host can still falsely retire a drained-looking token, and the assessor still supplies enrollment identity: this is not a public broker, truthful all-buffer retirement service, production host isolation, complete recovery/query/writer profile or L03 acceptance. Astra ultra review is pending. Full acceptance remains26/132 and the original goal remains active.


Astra's issuer review found no privilege or credential-handoff defect, but requested direct evidence for the SCRAM claim. The probe now retains ordered native pg_hba_file_rules host facts, requires every selected host rule to use scram-sha-256 without errors and an all-database/all-user127.0.0.1 rule, and rejects a separately attempted issuer TCP login with a fresh wrong password and the issuer-specific authentication diagnostic. The original issuer credential is restored in finally and subsequent normal successful issuer logins remain required. Local installer trust remains an explicit exclusion. Each final schedule cut independently compares the entire ordered host-rule snapshot. The first authentication addition failed an installation comparison because of a new inventory field; the base inventory comparison and separate authentication stability assertion have been corrected. Final refreshed native evidence passes1164 unique matching observations across four schedules, including all four complete host-rule stability comparisons. Twenty-seven component groups and103 evidence checks pass. Astra ultra verified1164 unique matching observations, all four complete authentication-rule comparisons and87 current source digests, confirmed wrong-password refusal plus subsequent successful issuer logins and found no remaining actionable finding.


### Authenticated issuer refusal preservation — 2026-10-09

The existing enrolled, NULL, unknown and repeated-terminal retirement controls now authenticate through the restricted host issuer rather than the excluded administrator. Exact native42501, retirement-specific diagnostic, no output and independent selected-binding/state assertions remain mandatory. An additional native snapshot reads every publisher row and all five columns in native UUID order immediately before and after each refusal. Sixteen added checks compare the full registry, including unrelated retained history, across the four schedules. Private UUID values stay in assessor memory; observations retain the equality result rather than exposing those values.

This strengthens evidence for the actual host issuer's refusal paths without proving truthful positive retirement or a public broker. The native run passes1180 unique matching observations across four schedules; twenty-seven component groups and103 evidence checks pass. Astra ultra independently verified all sixteen complete-registry comparisons and87 current source digests, retained error/binding assertions and qualified scope, finding no actionable defect. No backend acceptance case is added; the full gate remains26/132 and the original goal remains active.


### Authenticated issuer enrollment refusal preservation — 2026-10-09

The probe now factors native actor/PID/incarnation observation into the issuer enrollment statement builder. The three otherwise-valid binding mismatches, four NULL components, active and terminal UUID duplication and busy queued-writer enrollment execute via the restricted authenticated issuer. Test overrides are fixed reviewed SQL expressions, not a public input parser; malformed raw identity injection remains excluded administration. Existing exact42501/23505 diagnostics, guard-specific busy refusal, selected binding/state/count checks and successful issuer identity assertions remain mandatory.

Sixteen additional complete-registry comparisons cover these enrollment refusals across the existing four schedules. Each compares every row and all five binding/state fields before and after the attempt without publishing private UUIDs into observation receipts. This supports the actual issuer's tested refusal paths; it does not establish public issuer input validation, identity-observer isolation, truthful all-buffer retirement, recovery or complete backend admission. The source-current native run passes1196 unique matching observations across four schedules; twenty-seven component groups and103 evidence checks pass. Astra ultra independently verified all sixteen new registry comparisons and87 current source digests, exercised all seven mismatch/NULL argument variants and found no actionable defect. No new backend case is claimed; full acceptance stays26/132 and the original goal remains active.


### Owned host publication buffers — 2026-10-09

A candidate SecurityPublicationCustody component now owns copyJson snapshots behind opaque in-process buffer handles. Sealing forbids new retention; retirement calls the trusted native callback only after sealing and draining every registered buffer. Asynchronous consumer callbacks retain their buffers through resolution. Duplicate/forged/foreign handles and discard during delivery refuse. Backend loss never disposes host buffers. Consumer rejection or uncertain native retirement quarantines the publisher, refusing subsequent retirement/retry. The component rejects accessor-bearing payloads without invoking getters and bounds live buffers at128.

The independently authored twenty-four-observation corpus exercises retained first/replay buffers, pending consumer acknowledgment, data-copy isolation with large identity text and null, remaining-buffer retirement refusal, exact native-callback count, terminal reuse refusal, foreign/forged handles, consumer/native uncertainty and payload/buffer bounds. Bun and actual Chromium153.0.8010.12 reproduce identical results without Node/Bun globals or external requests in browser execution. Twenty-seven component groups and105 evidence checks pass. The source is not yet exported from the public root or connected to the actual native publication runtime.

This is a host component for buffers routed through one instance. It cannot account for arbitrary host copies, authenticate consumer acknowledgment, recover a lost process or prove issuer/native writer closure. Consumer callback resolution must mean the host's declared final-release boundary, and the native callback remains trusted. Claims of truthful global drain or completed native/backend acceptance would therefore be premature. Integration with the enrolled native runtime and corresponding physical evidence remains required. Astra ultra review is pending. Full backend acceptance stays26/132 and the original goal remains active.


Astra reproduced a Proxy reflection-trap reentrancy defect in the first host component: copyJson could invoke a trap that sealed/retired the empty publisher before retain inserted its buffer. Retention now guards the copy window, rejects nested retention/sealing and rechecks publisher state and capacity after copying. The guard resets in finally. Five new Proxy controls prove seal/retirement refusal during copying, zero premature native callback calls, retirement refusal while the resulting buffer remains live and one callback only after disposal. Bun and Chromium153.0.8010.12 pass the expanded twenty-nine-observation corpus. This repairs the observed admission window; it does not claim arbitrary host-copy or native/backend qualification. Astra also identified that the first foreign-handle test used a retired target, allowing state rejection to mask ownership rejection. The revised control targets an open publisher with a live local buffer, verifies foreign refusal preserves that custody and allows retirement only after local disposal. Bun and Chromium now pass31 unique matching observations. Twenty-seven component groups and105 evidence checks pass. Astra ultra verified all six current browser source digests and found no remaining actionable finding in the stated component scope. Native integration remains required.


### Managed custody in the original native publication runtime — 2026-10-09

The actual pg-runtime consumer now imports SecurityPublicationCustody and retains copied four-carrier rows behind opaque handles for primary, rollback/replay, sibling and fresh post-revocation reads. Primary custody seals after all authored replay buffers are registered. Actual publication projects the owned managed payload and waits for the parent's receipt acknowledgment while custody remains live. Discard schedules keep managed payloads until that same declared discard acknowledgment; replay handles drain separately before retirement. The existing original buffers are cleared only after this boundary.

Only the managed retirement callback now emits the existing drained request and waits for the restricted issuer's native retirement acknowledgment. Sibling and empty fresh reads use the same admission/drain/retirement discipline. New runtime checks attempt retirement while owned buffers are live, while consumer acknowledgment is pending and before even an empty buffer has been explicitly released; exactly one retirement request must follow each drain. The child still has only reader/revoker credentials. The native source closure now pins the custody implementation and JSON-copy/type dependencies in addition to the original pg-runtime/driver sources.

This connects the candidate component to the authored actual native schedules, not a general public broker. Original private journal/assessor copies and arbitrary host copies remain outside the routed publication custody claim; callback resolution still relies on the declared fixture consumer boundary. Process recovery, complete read/query/writer closure, authenticated public broker and L03/full backend admission remain open. Typecheck passes; the actual native run passes1227 unique matching observations across four schedules, including31 managed-custody checks. Twenty-seven component groups and105 evidence checks pass. Astra ultra independently verified all90 current source digests, acknowledgment-before-drain/issuer ordering and separate replay/sibling obligations, finding no actionable defect in this scoped integration. Full acceptance remains26/132 and the original goal stays active.


### Native consumer-failure quarantine — 2026-10-09

A fifth, final native schedule now delivers the original managed payload and receives an explicit consumer-release failure rather than acknowledgment. The callback rejects; host custody reports unknown and refuses retirement with zero issuer requests. The original payload remains retained through that failure boundary. A fresh actual ordinary writer attempt retains original request/response custody and must refuse42501 Publisher drain unavailable with no DataRow/CommandComplete, error ReadyForQuery and rollback. The lost original reader also refuses further use and is quarantined.

The child exits its run through transport cleanup and then completes the original journal bijection checks. The independent parent skips every retirement path, observes durable pending custody and all eight unchanged business relations before exit, and confirms pending state and ordinary revocation refusal after child shutdown. Owned fixture destruction is excluded cleanup and supplies no drain acknowledgment or recovery claim. The schedule remains last so its deliberately unresolved custody is never silently repaired to admit a later scenario.

Astra found that inherited terminal-history/revoked labels were misleading for this pending/active outcome. The refreshed source uses state-neutral final authority and explicit pending-history/binding/other-backend labels. Evidence validation now requires all five named schedules and eight critical failure assertion identities in addition to unique matching observations. The source-current native execution passes1421 unique matching observations across five schedules; twenty-seven component groups and106 evidence checks pass. Astra ultra independently verified all90 current source digests, five schedules and eight critical failure checks, confirmed no drain/retirement acknowledgment in the failure transcript and post-shutdown revocation refusal, and found no remaining actionable finding. Full backend acceptance stays26/132; public broker, general failure/recovery and L03 qualification remain open and the original goal remains active.


### Installed routine body source correspondence — 2026-10-09

The persistent raw probe now compares native pg_proc.prosrc against exact body bytes extracted from the three fingerprinted fixture SQL files in installation order. The reviewed parser admits only named functions with literal dollar-quoted bodies; the later revoke_alice replacement supersedes its earlier definition. The exact qualified set contains nine routines. Native enumeration covers every routine in both protected schemas, so an extra overload or routine changes the observed list and refuses correspondence. Existing independent signature/owner/definer/settings/ACL checks remain separately required.

A transactional control replaces only the retirement body with an unconditional return. It rejects the source baseline, matches an explicitly authored one-body mutation and demonstrates that a name-only assessor would miss the change. Rollback restores all bodies; each of the five final schedule cuts independently repeats complete correspondence. Eight complete expected/native body snapshots and two drift/control observations are retained. Evidence validation requires all ten assertion identities and all nine typed body records at each snapshot.

The native run passes1431 unique matching observations across five schedules, with90 current source digests. Astra ultra independently extracted all routine bodies, confirmed the later override and exact mutation/restoration/final snapshots, and found no actionable defect. This is installed-source correspondence for the reviewed PostgreSQL17.9 fixture subset, not independent semantic correctness, general SQL parsing, complete resolution/dependency inventory or public native admission. B12 and L03 remain unregistered; full backend acceptance remains26/132 and the original goal stays active. Twenty-seven component groups and107 evidence checks pass. Astra independently checked the source-coverage expression and rejected thirteen missing, duplicate or malformed evidence variants, finding no actionable defect.


### Truss SCRAM authentication and session lifetime — 2026-10-10

[Direct-main integration evidence](truss-scram-authentication/integration.json) records Truss main
`bb5eb75a018e068c281c565ae49e9a50825ee400`. The separately installed combined wheel matches53 source,
owner-asset and typing files, passes328 tests and212 Python boundary imports.
The original PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 Unix-socket SCRAM fixture passes82 observations across31 inventories,
with21 frozen source/preimage pins. Native authentication log entries bind the
ordinary role and SCRAM method to its backend PID. Wrong credentials and missing
roles refuse28P01. NOLOGIN changes inventory qualification and refuses new
sessions28000, but two established authenticated sessions remain usable.
Restoring LOGIN allows a fresh connection. Thus authentication establishes a
connection identity; login permission alone cannot revoke current operation
authority or retire existing sessions. Protected admission must independently
establish current authority at its coherent cut.

Four failure controls cover receipt/stderr secret redaction, an unwritable receipt
sink, continued connection cleanup and cluster cleanup after failures. Astra ultra
feedback was applied and the captured helper bytes execute directly. The final
read-only review verifies current pins and preserves the qualification boundary.
Historical Truss development evidence retains its original source hashes.

This supplies component evidence for US-056-AC5/AC9/AC10. It does not prove
production/TLS authentication, native protected ontology mapping, complete
collection/current cuts, PA01/PA02 completion, seven semantic operation bodies
or complete backend acceptance. Historical acceptance remains26/132; every
original required case remains governed by the existing plan and the goal stays
active. No source-derived formal theorem gains native/temporal premises merely
from this fixture's success.


### Native elevation routes outside the registered namespace — 2026-10-10

[Verified direct-main integration](truss-definer-routes/integration.json) records Truss
`71ba19f8373657cca34085250819220efd5ea79c`. The fixed invoker observer now requires a twelfth census
section enumerating native EXECUTE-accessible SECURITY DEFINER routines across
all schemas. Schema USAGE is retained independently and cannot filter the census.
Any nonempty census refuses even against an identical unsafe baseline; legacy
eleven-section packets refuse. This is a conservative profile-specific rule.
Protected registered definer chains require a distinct admitted profile; UMF
logical semantics do not prohibit all definers.

The PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes97 observations across35 inventories with21 frozen
inputs. An ordinary session with no direct UPDATE right invokes an external
PUBLIC-executable definer owned by a distinct nonlogin role. The actual committed
row UPDATE changes xmin, independently observed, while logical revision remains
unchanged. Original and matching unsafe baselines refuse. Revoking EXECUTE removes
the route; revoking only schema USAGE retains and refuses it. Native prepared-call
revalidation in this fixed fixture returns42501 with unchanged xmin; it does not
demonstrate a surviving write or prove behavior of every retained statement.

Astra identified and verified fixes for the schema-USAGE filter and replayed
packet budgets skipping empty final-section columns. Exact80164-unit budget
passes;80163 and80076 refuse. Native final-section row overflow refuses. The
separately installed wheel matches53 source/owner/typing files and passes334
tests; Python boundary checks pass212 imports. Exact source/preimage, test,
wheel/log/native digests and the read-only Astra review are retained. Owner
historical attempts preserve earlier pins and two rejected prepared-call
predictions instead of being repinned to the final producer.

This advances US-056-AC5/AC9/AC10 and Truss PA01/PA02 component evidence.
It is not complete installed call closure: operator/type/extension routes,
trigger/default/RLS paths, indirect resolution, protected capture, current
authority cuts and seven semantic operation bodies remain unqualified. Earlier
source-derived role proofs retain their historical source scope; no fresh
whole-program, SQL or temporal refinement proof follows. No original required
case is promoted; acceptance remains26/132 and the full goal remains active.


### Operator-backed hidden definer and source-derived guard laws — 2026-10-10

[Native integration](truss-operator-routes/integration.json) records Truss main
`f48975262c74317940329c4f70bd193db81b68fa`. A native operator invokes a SECURITY DEFINER
implementation in a distinct function schema to which the ordinary caller has
no USAGE. The caller also lacks direct UPDATE, but the operator commits a row
UPDATE whose changed xmin is independently observed. The merged census retains
that hidden function and refuses an identical unsafe baseline. Revoking function
EXECUTE then returns42501 with unchanged xmin; scoped correspondence and operator
removal restore the baseline. The proposed EXECUTE-ignoring operator bypass was
not observed. No thirteenth inventory section or new permission semantics is
introduced: this validates an actual route covered by the existing conservative
function census.

The fixed PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5 SCRAM fixture passes107 observations across38 inventories with21 frozen
inputs. The unchanged separately installed53-source wheel passes336 tests,
including original-native operator packet regressions. The read-only Astra review
verifies the native source/preimage and wheel pins. Library source remains the
reviewed71ba19f8 implementation; no unchanged owner build is attributed as new
implementation.

[Source-derived analysis](truss-definer-census-formal/cfa978ae-c2c9-4fef-b244-4495aab10da9/proof.json) recognizes the complete exact
census SQL subset and extracts the actual final three Python classifier
statements. Three UNSAT violation queries show the selected hidden executable
definer cannot be filtered by schema access, a nonempty census cannot match and
an earlier refusal cannot clear. Three SAT controls populate a safe empty
profile, the hidden operator witness and a namespace-filter-erasure leak. All six
SMT byte digests replay independently. Sixty-four Boolean vectors execute the
extracted actual tail;38 original native inventory tail replays preserve refusal
when the census is nonempty. The role-route fold is retained, without replacing
the full classifier with a handwritten policy implementation.

Complete faithful immutable native rows and effective privilege facts are explicit
analysis premises. This is a recognized-filter and pure-tail proof, not native SQL
semantics, full Python ingress/admission, authenticated producer, dependency
closure, temporal-cut or protected-publication refinement. Operator
support/selectivity/planner, type/extension and trigger/default/RLS paths remain
required. The actual protected capture/writer protocol and seven semantic bodies
remain open. This augments US-056-AC5/AC9/AC10 component evidence without
promoting any original requirement. Full acceptance remains26/132 and the goal
stays active.


### Protected caller capture: post-elevation information loss — 2026-10-10

[Native observability evidence](truss-capture-observability/533c90f6-3dbe-4d7d-ae83-484617149b4a/native.json) passes10
observations on PostgreSQL16.15 / pgserver0.1.4+truss.pg16.15 / pg8000
1.31.5. In one physical connection and transaction, direct and unregistered
wrapper paths enter the same privileged function. Their original effective actors
differ; the nine post-elevation fields are identical: session person, effective
writer owner, role setting, database, backend PID, xid, session-role OID, writer
role OID and entry-routine OID. The wrapper explicitly captures its actor in
PLpgSQL before entering the writer; direct host capture precedes its native call.
This avoids relying on SQL target-expression evaluation order.

[Formal equal-input analysis](truss-capture-observability-formal/4b3dbd6b-1c44-49f6-8480-0e84fd4c6a69/proof.json) retains two
UNSAT separation attempts for arbitrary deterministic decisions over that exact
tuple, including equal extra state. A SAT population shows that adding a distinct
trusted pre-entry actor can distinguish the paths. This does not authenticate an
added caller label or implement capture. The formulas do not prove all PostgreSQL
protocols impossible: unequal history/nonce/state, trusted host original-call
custody, native frame/stack evidence and additional provenance remain outside
the equal-input premise. No HMAC/signature primitive is implemented or proved.

PA02's protected realization therefore must name the independently trusted
pre-elevation provenance or qualified original-call restriction that enforces
the registered chain. Sealing only these post-elevation fields cannot recover
the missing actor; same-entry OID/xid/PID binding alone cannot classify these
paths. One-use custody must remain, but refusing a second invocation is distinct
from establishing the original caller of a first invocation. The accepted trusted
embedding host can supply original call facts under Truss ADR-008 only through
qualified exclusive physical-connection custody and protected carriers. Native
SQL arguments do not themselves authenticate Python object identity. Preserve
the existing invoker elevation guard; neither writer-owner substitution nor
caller-supplied JSON/GUC fields is an implementation shortcut.

Required protocol tests now include this collision witness, independently
authenticated pre-entry capture, a forged added actor, copied public context,
first-use submission through a different wrapper, same/different native attempt,
transaction and connection, and native plus trusted-host one-use custody across
savepoint rollback. Original PA-N01–PA-N12 and all132 required cases remain
required; this supplies US-056-AC5/AC9/AC10 design evidence only. The fixture
uses local trust actors and synthetic routine/role names, no actual Truss registry
or business effects, and no authenticated subject/production capture qualification.
PA02 and full backend acceptance remain open at26/132. Earlier cleanup failure
and preliminary SQL-expression-order run retain their original sources; the
final receipt alone qualifies the explicit capture order.


### Trusted-host protected capture candidate — 2026-10-10

The [native candidate receipt](truss-protected-capture-candidate/90e12409-3a54-466f-8184-2a54c961669d/native.json) retains23 matching observations on
PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15 and pg8000 1.31.5.
Original source bytes, seven source pins and actual installed routine OIDs,
owners, settings and complete definitions accompany the receipt. The earlier
19-observation run and preliminary23 run remain historical; the final run
adds same-transaction absence checks, original frozen AdmissionCustody execution
and guaranteed sanitized failure reporting even if the receipt sink fails.
Two retained subprocess controls exercise secret-bearing exceptions with writable
and unwritable evidence sinks; both suppress secret text and exception chaining.

This implements an isolated physical candidate for the PA02 prerequisite:
an INVOKER query captures native person/actor OIDs, database, backend PID and
xid before elevation. A separately privileged trusted registrar inserts a
private random 32-byte capability bound to those facts, original attempt and
exact synthetic payload. The fixed host dispatch invokes an INVOKER gate and
DEFINER writer; the writer atomically consumes the matching capability before
inserting the synthetic effect. Ordinary callers cannot read capabilities,
write effects directly, create routines in the candidate schema, or inherit
writer/registrar roles. The wrapper gate refuses elevated acting identities.
The capability is never public context or included in retained evidence.

Actual native negatives refuse forged/copied public context, a different
connection (even with the private capability), another login route, attempt/input
substitution, unregistered wrapper invocation and direct private access.
The exact native positive effect is inspected in its original transaction.
For this inspection only, the fixture administrator temporarily grants effect
SELECT, immediately revokes it, and verifies the final prohibition. This is
an administrative test observation, not an adopted ordinary read surface.

Native same-transaction reuse refuses, but savepoint rollback restores the
native capability's unused state. The producer independently demonstrates
successful direct native replay after rollback and verifies its actual effect.
The existing original Truss AdmissionCustody ticket refuses that resubmission
and retains one fixed dispatch. Therefore the composed candidate requires
trusted exclusive host dispatch and private carrier custody; its native table
alone does not provide rollback-resistant one-use authorization. This is not
a qualified SQL-only route or protection from a malicious same-credential host.
A changed transaction also refuses the old capability.

The adjacent acceptance-map.json ties all23 observations to original requirement
IDs without marking a complete schedule passed. The adjacent astra-review.json
retains independent review: all three harness findings were fixed and the final
seven pins, installed definitions and failure controls were independently checked.

This advances US-056-AC5/AC10 physical component evidence and PA-N03/04/05/09
schedule development, without promoting them to complete acceptance cases.
Local trust authentication, synthetic registrar inputs and the fixed actor
profile do not establish production authenticated subject mapping, SET ROLE,
current owner authority, generation/configuration checks, complete callable
closure, resource admission or publication. PA01–PA04 and all seven Truss
semantic bodies remain unfinished; the original132-case goal remains26/132.
Next integration must replace synthetic registrar facts with the original
owner authority/artifact and coherent-cut protocol, qualify installed closure
and protect the carrier throughout the registered adapter. No public API or
ordinary registry grants are added to Truss.


### Native current-authority primitive and lock boundary — 2026-10-10

The [final native receipt](truss-protected-capture-candidate/85d31486-2f88-48e5-b492-ec15b9d730f3/native.json) extends the protected capture candidate to39
matching observations. Seven original source pins/preimages and six actual
installed routine identities, owners, settings and complete bodies are retained.
READ COMMITTED is independently observed and explicitly required by the writer.
RR/Serializable refusal is currently source-reviewed, not natively exercised.
The earlier23/33/38 schedules and their preimages remain historical evidence.

A separate non-login authority responsibility owns a private, fixed single-actor
row with permitted/generation fields. Only the writer can execute its private
check helper. The helper locks the selected row FOR SHARE, then checks complete
row presence, permission and exact captured generation before the writer inserts
its synthetic effect. Ordinary authority SELECT/UPDATE/helper execution and
revoker direct UPDATE refuse. The registered revoker routine updates the row;
it is the selected native mutation route in this fixture, not a complete policy
administration or ontology resolver interface.

Actual revocation after capture refuses without effects. A separately issued
capability matching the revoked generation independently isolates permission
false; regrant advances the generation and the earlier capability remains stale.
A fresh matching generation produces an independently inspected original effect.
An independently submitted revoker times out with native55P03 while the writer
retains the authority row lock; authority remains unchanged. After writer rollback,
the same revoker succeeds and advances the generation. This is one bounded native
row-lock schedule, not proof of complete writer participation, fair termination,
deadlock freedom or final publication. PostgreSQL16's documented FOR SHARE
conflicts and transaction/savepoint release rules govern this candidate:
https://www.postgresql.org/docs/16/explicit-locking.html.

[Formal guard analysis](truss-capture-authority-formal/19fe84d8-27c7-4bc7-b323-52ad9fe0223d/proof.json) saves eight independently replayable formulas:
four UNSAT laws and four SAT positive/weakened controls. Positive generation
integers are unbounded in the model. Exact authority-check and writer routine
bodies are recognized, but SQL execution/FOUND/atomic exception behavior and
complete faithful current authority are premises. The held-lock serialization
law explicitly assumes revoker exclusion; it is not derived PostgreSQL semantics.
The stale mutant requires captured<current; advancement requires next>current.
Originally parsed native bytes are frozen, canonical invocation is required,
and saved formula bytes are rechecked before publication. No SQL/Python/compiler
refinement, ontology resolution or publication-drain theorem is asserted.

The adjacent native acceptance-map.json links all39 observations to original
US-056-AC5/AC9/AC10 and PA-N01/03/04/05/07/08/09/11 component schedules without
claiming those complete schedules passed. The two sanitized failure controls
remain passing; new UUID receipts use exclusive creation, preserving reruns.
Astra review findings about independent permission evidence and proof source
custody/directional controls were applied before final qualification.

This supplies a current-authority physical primitive only. Production subject
mapping, original ontology/policy/artifact admission, coherent complete source
cuts, all authority mutation/callable dependencies, resource/family bindings,
protected carrier lifecycle and final release remain required. Savepoint rollback
releases the native authority lock and restores native capability reuse; the
existing host ticket remains burned. This cannot replace durable pending-buffer
custody or L03 revocation/drain. No Truss public API or supported backend profile
is promoted. PA01–PA04, seven semantic bodies and the original132 required cases
remain open at the historical26/132 checkpoint.


## Raw ontology read-admission candidate — 2026-10-10

The retained Weft `natural-count-self-join` logical plan now drives the captured Truss PostgreSQL predicate lowerer in a private raw-table experiment. Exact original lowerer and graph-source bytes are frozen with the bridge; no fresh Rust compilation or production owner-artifact admission is asserted. Staff, Projects, resources, assignments and ownership form five private relational tables. The rule requires an active Staff assignment to the same Project that owns the resource. This is a synthetic read-admission receipt, not authorization to mutate resources.

Final native evidence is `truss-ontology-capture-candidate/a91be6ca-a0de-417d-bc51-aec34faaeb41/native.json` under `docs/helix/04-build/evidence/security/`: 76 observations, 11 source pins, eight installed routine bodies and three complete five-table fact cuts. PostgreSQL 16.15, corrected pgserver 0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun 1.4.2 qualify this run. Alice can obtain RA/RAB receipts; inactive, unrelated, ownerless and unknown resources refuse. Ordinary private-fact access and predicate execution refuse. The selected membership revoker receives 55P03 while the authority lock is held, then succeeds after rollback. Only Alice/A's active flag changes. Independent current authority `[[6,true]]` precedes denial of all six resources after membership revocation, isolating ontology denial from stale-generation or permission-false denial. Two sanitized failure-boundary controls pass; earlier run receipts remain historical.

Formal evidence is `truss-ontology-capture-formal/e48c8318-302b-4b23-8fd4-f4d25c00a167/proof.json`: seven replayable formulas (three UNSAT laws, four SAT positive/weakened controls), 14 source pins and three complete finite-population replays. Typed unbounded relational semantics establish the natural-witness join law and refusal without active assignment or ownership. Erasing active status, project equality or the mandatory rule admits counterexamples. Faithful facts, native keys, subject binding and serialized current authority remain premises; exact source coupling is not a compiler, SQL or Rust refinement proof. Exact ordered cuts, unique observations and one actor/Staff mapping prevent vacuous replay.

Astra ultra independently verified final pins, formulas and seven rejected mutation controls; review receipts are adjacent. The acceptance map ties all 76 observations to original US-056 criteria and PA schedules as component evidence only. Historical acceptance remains 26/132. Actual typed graph execution (AC2), Ashlar/Delta, authenticated production subjects and owner artifacts, coherent complete current cuts, installed callable closure, four-family protected admission, seven Truss semantic bodies, field publication and final publication/drain remain open. No supported public backend profile or complete PA02/L03 qualification is promoted. Next integration must use the same owner artifact across actual typed graph storage and raw tables, with production owner admission and final release obligations.


## Original-policy graph/raw population parity — 2026-10-10

A separate installer-only spike now executes the same retained Weft `natural-count-self-join` IR through the frozen actual Truss row-predicate and graph-source modules against the exact captured `qualified-property-layout-0.15.owner-export.sql` object/edge tables. Predecessor IR and both lowerer pins must equal the raw candidate's pins before lowering. The current exported layout bytes, including property declaration modules and definition provenance constraints, are retained; synthetic catalog seeds satisfy those constraints without weakening them. These are fixture assertions, not original catalog staging or authenticated owner metadata.

Final evidence `docs/helix/04-build/evidence/security/truss-ontology-graph-parity/9b5634ec-caf8-4624-9c02-00ed637b3a94/native.json` contains 53 passing observations and nine source pins, SHA256 `e957e0d3de95338d5df53743bd9548fe4fd5ca0d17672894b9d49aed501b1f64`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify this run. Five complete native projected relation populations match the independently retained raw initial cut, and five match the raw final membership-revocation cut. Alice admits RA/RAB initially and none after her assignment is deactivated; Bob admits RB/RAB both before and after Alice's revocation. Both six-resource corpora include ownerless and unknown resources. A deliberately reused native object ID across Staff/Project verifies qualified type incidence rather than untyped ID equality.

The authored host preflight checks all five source-validity programs (including outer Resource), six unique natural-key/login groups and both native edge-incidence/logical-endpoint correspondences. Eleven malformed-source controls refuse with42501: absent or wrong-domain active properties, logical/native endpoint mismatches, duplicate Staff keys or logins, retired resource/association metadata, absent ownership/resource fields and wrong active metadata. The two endpoint controls independently observe all11 validity/uniqueness components true, Assignment incidence false and Ownership incidence true before refusal. This isolates incidence from both native and logical duplicate-key constraints. The exact installed read-receipt routine is retained. Ordinary callers have no object/edge SELECT; the fixture's PostgreSQL-owner definer returns only synthetic booleans.

Earlier failures are retained, including missing synthetic definition-provenance fields and a corruption initially blocked by native edge uniqueness. Final controls use existing ProjectD to isolate incidence. No new theorem is asserted: the prior typed relational laws apply conditionally, while native correspondence evidence does not prove automatic SQL/Rust/compiler refinement. Natural key properties remain fixture-attested and explicitly checked; canonical key-bucket codecs/namespaces, current coherent cuts, authenticated production subjects/owner artifacts, original staging, production role/callable closure, protected four-family admission, concurrent authority participation and final publication/drain remain required. The adjacent acceptance map links all53 observations to US-056-AC1/AC2/AC5/AC10 as components only. Complete typed-graph AC2 and full backend acceptance remain open at26/132; no public supported profile is promoted.

Astra ultra independently verified all53 observations, nine current/preimage pins, exact frozen lowering, complete initial/final fact parity, all13 installed preflight components and both isolated incidence controls. The adjacent review receipt records no remaining blocker within this installer-only scope.


## Composed protected graph read-admission candidate — 2026-10-10

The actual graph predicate and explicit full preflight now run behind the private original-call capture primitive. The original INVOKER entry still requires the actor/captured native tuple; the writer checks its registrar-issued capability, exact original transaction/attempt/resource bytes and READ COMMITTED, then calls its private authority helper. That helper obtains the same authority row FOR SHARE, verifies permission and captured generation, executes all13 authored graph-preflight components separately, and evaluates the original compiled owner predicate before inserting a synthetic read-admission receipt. There are no raw shadow fact tables. Exact captured Truss object/edge layout and frozen lowerer bytes are used; synthetic catalog seeding remains installer-authored, not original catalog admission.

Native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/8ea0b9dd-a0c3-4ecc-b8cb-0d5fbf26998a/native.json` passes135 unique observations with14 source pins, SHA256 `108096e8eb0bace54a4ce709cd44e6ef1b995a4aeb52abd7241f3be9576de7db`. PostgreSQL16.15, corrected pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2 qualify the run. The captured graph predecessor's IR, bridge, both lowerer modules and layout pins must match before composition. Nine installed protected routine bodies, exact generated SQL and frozen fixture/lowerer code are retained. The private authority role owns the edge table and can read required catalog/object facts; actor and revoker cannot directly read/write graph tables or invoke preflight. No public graph support claim follows from those fixture grants.

Eleven deliberately committed installer corruptions now traverse genuine fresh private capabilities and the original native entry. Every malformed source independently yields preflight false,42501, an unconsumed native capability, zero effects inspected in the actual actor transaction, and restored preflight true. Both endpoint corruptions observe the exact13-component vector isolating Assignment incidence. Authority [[5,true]] is independently observed before these controls. These fault injections deliberately sit outside the admitted mutation closure; they do not prove complete participation or coherent source-cut authority.

The selected membership revoker updates the authority generation before changing the actual graph Assignment edge. An independent revoker receives55P03 while the read-admission writer holds the authority row; all five projected fact populations remain unchanged. After actor rollback the revoker succeeds, only Alice/A's active flag changes, independent authority [[6,true]] is observed, and all six resource admissions refuse. Three complete projected fact cuts are retained. Transaction rollback still restores native capability reuse; the original host custody restriction remains necessary and is independently exercised. This is synthetic read admission, not permission for canonical resource writes or a complete publication protocol.

Formal evidence `truss-graph-capture-formal/c2b4aa2a-f28e-4434-bb0a-ce96071da3a3/proof.json` under the same evidence root saves14 formulas: six UNSAT laws and eight SAT positive/weakened controls, with17 source pins and all three complete population replays. Original typed natural-witness laws are supplemented by an explicit authored conjunction of original capability, current authority, full graph preflight and ontology membership. A positive composed SAT control prevents an always-false conjunction from passing; independently erasing each admission guard yields a counterexample. These are conditional model laws, not automatic SQL/gate extraction, compiler refinement, native snapshot/lock semantics or final publication proofs. Source custody and observed native controls are separate evidence.

Two sanitized failure-boundary controls pass. The adjacent acceptance map links all135 observations to original US-056-AC1/AC2/AC5/AC9/AC10 and PA component schedules without promoting complete cases. Authenticated production subjects/owner artifacts, canonical graph key-bucket and namespace authority, original catalog staging, complete authority/callable closure, coherent source cuts, all four protected admission families, seven Truss semantic bodies, field publication and final release/drain remain required. Full graph AC2/PA02/L03 and the original132-case acceptance plan remain open at26/132. No public Truss backend profile is promoted.

Astra ultra verified all135 observations, fourteen native pins, nine installed bodies and eleven corruption groups, then independently replayed the final fourteen formulas with seventeen source/preimage pins. The always-false composition mutant fails the added positive control. Adjacent review receipts record no remaining landing blocker within the declared experimental scope.


## SCRAM-authenticated graph composition and owner-binding audit — 2026-10-10

The composed graph candidate now authenticates fresh ordinary, registrar and revoker sessions with PostgreSQL SCRAM on its owned Unix socket. Four role secrets are generated only in memory and never retained or included in receipt hashes or exception chains. The original bootstrap postgres session remains an explicitly trusted installer; the exact HBA admits local postgres trust, requires SCRAM for other local sessions and rejects both loopback host families. Reload completion, parsed rules, stored SCRAM-verifier presence (booleans only) and unchanged final rule rows are independently observed. This is an authenticated owned fixture, not a production issuer/Staff/owner mapping or general connection-authority profile.

Final native evidence `docs/helix/04-build/evidence/security/truss-graph-capture-candidate/f4186d8d-38ff-461d-9f0c-deefd7b8969f/native.json` passes147 observations with14 current/preimage pins (SHA256 `7cbb71735a60b89f622968eb5426ef6457c826f47914f8dfa0b30b8d1dbb5e4b`). Four wrong-secret attempts and an absent role yield28P01; correctly authenticated sessions independently expose the five expected original native identities, including two distinct connections using the same actor credential. NOLOGIN refuses a fresh actor session with28000 while the existing session still has its original identity. Admission revocation remains an independent current-authority obligation; NOLOGIN alone is not an existing-session revocation mechanism. All135 original graph/protected-capture/authority/corruption controls also pass on these freshly authenticated sessions. SQL, lowerer packet, nine installed protected bodies and complete fact cuts are unchanged from the reviewed135 run. Two sanitized failure controls match the updated producer.

Refreshed formal evidence `truss-graph-capture-formal/0e186858-5aca-40cf-b1a6-53b2e792bbb7/proof.json` under the same evidence root replays14 formulas (six UNSAT/eight SAT),17 source pins and three complete populations, SHA256 `f52b59906718137e426c9b959e0652159a31a872f486b3a7e036cae3e47d5aec`. This rebinds the previously qualified conditional model to the authenticated native run; no SCRAM cryptographic, SQL/compiler or publication theorem is added. Historical135 receipts retain their original source bytes and narrower trust-authentication scope.

The next catalog integration cannot silently rewrite the owner source. The actual frozen Truss declaration collector, executed on the retained original owner document, exposes five keys with unspecified primary roles, zero core relationship declarations and two ontology associations with ordered typed endpoints. Resource's complete required signed64 integer salary declaration is preserved alongside key-only read projections. Current native staging source explicitly requires a Boolean primary selection; its guard is source inspection here, not a performed native refusal. These facts require owner-issued storage key-role choices and relationship bindings with original accepted-binding provenance. Key-only graph projection cannot stand in for complete Record/property catalog staging or field publication.

[Owner-binding audit](truss-owner-binding-audit/9d296d60-1dd6-48cd-bb6e-2b63d7d4778e/audit.json) is located under `docs/helix/04-build/` and passes14 observations with five current/preimage pins, SHA256 `46a649c19af2f370518c27667e45de4177b59e0b954ba6f4a12426809d938f01`. A separately parsed frozen oracle checks the complete post-call document, exact ordered keys, complete Field/reference inventories and full ordered ontology endpoints. Composite-key reversal, integer-width deletion, unknown-extension mutation, omitted Record and omitted Field controls all refuse. The initial eight-observation audit had aliased preservation checks and provides no independent preservation qualification; its receipt remains historical. The twelve-observation correction predates the final completeness controls. No fresh owner validation, original catalog preparation/staging or binding authority is claimed by this audit.

Astra ultra independently verified147 native observations/14 pins, replayed14 formulas/17 pins and verified the final14 audit observations/five pins, including all five mutation/omission controls. Adjacent reviews are clean within their declared scopes. The acceptance map treats authentication as a PA-N01 prerequisite, without claiming SET ROLE coverage, and retains original US-056 component links. Complete owner bindings/authenticated artifact/current-cut/installed-callable and mutation closure, all four families/seven semantic bodies, canonical graph keys and final publication/drain remain required. Complete backend acceptance stays26/132; no supported production profile is promoted.

## Optional key marker correction — 2026-10-10

The earlier owner-binding conclusion overstated the primary-role gap. CONTRACT-040 makes `primary` optional; Truss's existing native key writer projects absence as non-primary while preserving the original archived source. The host staging helper previously rejected absence; Truss commit `ac94538b22fad6a27825b60eb2cef8bd2486f767` now follows that native projection. A named non-primary key needs no invented primary-role binding merely to stage. Names such as `pk` do not imply primary status. The two original ontology associations still require actual relationship bindings; this correction does not synthesize core relationships.

The actual pinned owner preparation tests pass 16 cases/55 assertions under Bun 1.4.2, including absent/false/true markers, original archive bytes, ordered composite fields and invalid-marker refusal. The added staging test mocks native calls. PostgreSQL qualification of the unchanged original five-Record document remains pending; no acceptance promotion follows. The historical14-observation owner audit retains its captured preimage and old guard, which this runtime fix supersedes. Existing native147/formal14 evidence remains scoped to its captured source inventories. Historical acceptance remains26/132.

Astra ultra reviewed Truss `ac94538b` and this correction with no merge blocker. The review was source-only; the 16-test result is execution evidence from the parent. The reviewed runtime change is directly on Truss main, with concurrent Python transport work preserved.

## Original owner document/native catalog staging — 2026-10-10

The unchanged `natural-count-self-join` owner document now passes genuine original UMF preparation and actual Truss provisional catalog staging on PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg8000 1.31.5 and Bun1.4.2. Retained evidence `docs/helix/04-build/evidence/security/truss-owner-catalog-stage/75408a57-00c9-4054-bffc-ab2a918dfb73/native.json` passes31 observations/697 source pins, SHA256 `bec358feb8942d8a5bea0208f368da2bece80dc7c08c87e9a1ae3cdbf7cefa88`. Executed copied source includes the owner bundle, actual Truss preparation/stager/native SQL/layout, and declared Ajv8.20.0 dependency closure. The private bounded stdio adapter drives one installer transaction; this does not qualify the complete installed public runtime or driver.

Independent native projections verify exactly five original Records, all nine owned Fields with full scalar/nullability/cardinality/facets and accepted-document provenance, five original ordered keys as non-primary, and zero relationships/endpoints. Exact archived source retains absent primary markers, the unowned Field and unknown content. Salary retains its required signed64 facet. A native primary substitution and a composite component reversal each refuse the intended message/55000 from an isolated genuinely new-key prestate with an agreeing successful positive; exact state is restored. The head stays unpublished and rollback removes all staged catalog rows. Passing evidence is emitted only after independently attempted cleanup succeeds.

The first retained run failed in the RPC command-result adapter. Historical13/20/21-observation runs do not independently isolate key guard refusal: their existing-key prestate can also refuse55000. The corrected29 run predates complete native type/relationship checks. These remain historical receipts, not the final qualification. Refreshed post-validation collector/literal guard audit `truss-owner-binding-audit/db1509e7-7399-4d62-8322-a1663e40a614/audit.json` passes14 observations/five pins, SHA256 `cb2b47b065313e8295a0d8e4e08428245ba1f00b358c78365b5f68b9d55c36cc`; its scope remains source inspection and post-validation preservation, separate from the new native spike.

This resolves the extra host primary-marker restriction and qualifies complete original catalog projection for the captured installer-only subset. Original ontology associations still require authenticated owner-issued physical relationship bindings with exact source provenance. Synthetic operation artifacts, trusted installer identity, absent binding/default JSON homes and rollback-only provisional revision are explicit premises. Accepted owner/binding/current-cut authority, canonical key buckets, complete mutation/callable closure, protected semantic bodies and final publication/drain remain open. US-056-AC1/AC2/AC10 gain component evidence; no whole criterion or backend profile is promoted. Historical acceptance remains26/132.

Astra ultra independently audited final31 native observations and all697 current/preimage source hashes with no remaining blocker. Review was read-only, with no native execution; the qualification remains provisional installer staging with rollback.

Catalog-stage source preimages are retained as byte-exact `preimages.zip` bundles next to each receipt. The producer checks every entry against the captured bytes before execution; independent hash verification checks all entries against the receipt source inventory. This compact representation replaces duplicated dependency trees without changing original receipts or source bytes. The earlier58932dc5 run precedes only this archive representation change.

## Conditional association storage compatibility — 2026-10-10

Formal evidence `docs/helix/04-build/evidence/security/association-storage-compatibility/d31be4c0-393e-4209-b775-e6563ac54c83/proof.json` saves12 independently replayed formulas (four UNSAT/eight SAT), five current/preimage source pins, Z3 4.15.4, SHA256 `0c94557e3b6e55545565d04022a66bf73312f5b30e01bfd19c7470883814ce80`. Quantification over every nonnegative participation count proves that complete preservation excludes an inferred positive minimum or finite maximum, with explicit unrestricted positive and separate restrictive-bound counterexamples. Exact distinct binary role selection preserves the same-witness key/attribute predicate in either physical orientation; assuming ontology array order is native direction has a valid-population counterexample. This is an abstract conditional model. It does not extract SQL/compiler semantics, prove lifecycle compatibility, authenticate owners/cuts, establish complete facts/keys or qualify publication. The initial8-formula run had a tautological count check and is superseded by the quantified model.

Implementation must preserve native unrestricted storage compatibility or require an explicit semantic restriction before choosing bounds. Current Truss native relationship carrier requires bounds/lifecycle/direction, while the retained ontology asserts none. No existing core source is rewritten, and no new accepted-binding vocabulary or native support is claimed by this proposal. Owner-issued role choices, original accepted binding/archive custody, exact independent native definition correspondence and compiler-owned lowering remain required. US-056-AC2/AC10 gain design/component proof obligations; historical26/132 remains unchanged.

Astra identified native `edge_out` endpoint-pair uniqueness as a separate association-instance preservation gate. The final proposal requires an authored key proving endpoint-tuple uniqueness or refusal of this layout. Three additional formulas establish conditional instance injectivity, a valid distinct-endpoint positive and a parallel same-endpoint/different-key counterexample. The nine-formula predecessor lacks this gate. Semantic count laws assume realizability over all nonnegative counts; arbitrary owner domains/keys must be compared independently, and explicit operational resource refusal is separate from semantic restriction. No infinite storage capacity is promised.

Astra ultra independently replayed final12 formulas (four UNSAT/eight SAT), verified all five current/preimage pins and found no remaining blocker within the proposal scope. These remain conditional laws, not native binding admission, SQL/compiler refinement or acceptance promotion.

## Implemented private association correspondence boundary — 2026-10-10

Truss main `fe8a67051a4ecb3c6a0ff10fdd89ab71f3d9a218` implements `packages/python/src/truss/_security_association_binding.py` as a preliminary source-correspondence boundary. It captures exact bounded original core/ontology/binding bytes and returns frozen tuples/bytes, preserving unknown numeric tokens without imposing Decimal or integer ranges. It requires complete association and role mappings, explicit orientation/unrestricted independent storage choices, exact ordered association/target-key references and an authored association key contained in endpoint Fields. Separate instance IDs and attribute-dependent keys refuse the endpoint-pair edge layout. Higher arity, non-string endpoint profiles, changed source digests/revisions, missing/defaulted metadata and duplicate mappings refuse.

Truss evidence `docs/helix/04-build/evidence/security-association-binding/b332851f-fc2d-4489-b737-536aa90bfe84/tests.json` passes39 tests under Python3.11.17, six current/preimage pins, SHA256 `d81a4d95a527948dda63e3e08fa76817a8e8a762818ab2b5bcb7603c01ca44b8`. Tests retain original fixture bytes, both explicit orientations, composite-order positives and independent reversals, endpoint-key subset positives, parallel-instance loss, duplicate/omitted mappings, Unicode/depth/byte boundaries, unknown fractions and extreme exponents/5000-digit integer tokens. Python module boundaries pass245 imports. Astra ultra verified all six pins,39 names against AST/log and the boundary result; it reviewed the corrected implementation with no remaining blocker. It did not rerun the suite or execute native operations.

This checks source correspondence only. Genuine UMF/ontology owner semantic validation, authenticated original artifact/cut and archive revision/pointer authority, registered relationship interpretation, actual catalog/namespace/key/incidence observations, original Weft lowering and complete protected mutation/publication remain independent required gates. The output dataclass is not an admission capability; no database effects/public exports or installed-wheel/backend qualification follow. The mapping carrier is a private candidate, not a newly accepted native vocabulary. US-056-AC1/AC2/AC10 gain preliminary component evidence, not completed criteria; historical26/132 remains unchanged.

## Original owner interpretation and association correspondence — 2026-10-10

`tools/security/qualify-association-owners.py` now executes the pinned UMF producer's original `inspect` API, Weft's legacy `security_mapping_handoff` owner entry point and the captured Truss Python correspondence boundary against the unchanged `natural-count-self-join` core/ontology sources. Final evidence `docs/helix/04-build/evidence/security/association-owner-interpretation/0e6a5088-80fd-4279-b8ef-4da50419248c/receipt.json` passes25 observations/292 current/preimage source pins, SHA256 `c3299918ae2594ff4da0c0063fc4857e58c3317d2ccf27405e34ba65692a5eba`, using Python3.11.17, Bun1.4.2 and rustc1.90.0. Captured Weft sources from clean main checkout `6cc7bc71e47cf31da9197c964db979f9a21ecb4d` build in a fresh temporary target with locked offline dependencies; executed UMF/Python source is copied from captured bytes. Original fixture digests and complete owner handoff match. The producer checks source, executable and archive custody before retaining a passing receipt; preimages and build logs are retained. Registry dependency bytes and the complete toolchain are not archived, so this is not a hermetic-build proof.

Independent actual-owner controls reject invalid core kind (UMF validation and Weft `WFT-MODEL`), substituted ontology document revision (`WFT-SECURITY-PIN`), removal of a declared Assignment Field classification (`WFT-SECURITY-ONTOLOGY`) and removal of an endpoint required by the policy (`WFT-SECURITY-TYPE`). Every Weft refusal has exit1 and empty stdout after the agreeing successful original. The first25-observation predecessor instead added an unknown ontology member; it cannot prove missing-classification rejection. Two intervening captured-source builds failed because compiler schema dependencies were omitted; their logs/preimages remain historical. Successful `caa02791` precedes explicit Python/Bun runtime metadata; `2eefdfc1` retains those hashes but precedes Weft's merged reliability integration. The final run preserves that integration, captures its clean main commit and reproduces the same original handoff. Astra's requested control/custody corrections are applied in the final run.

US-056-AC1/AC2/AC10 gain original interpretation and source-correspondence component evidence. Weft interprets the original legacy policy/query/binding packet; it does not register, issue or authorize the new private association mapping. The private correspondence dataclass grants no native authority. Authenticated owner/issuer/current-cut and archive-pointer custody, registered native relationship interpretation, canonical keys/incidence, complete protected mutation/callable closure and final publication/drain remain required. Historical acceptance stays26/132. Next implementation work must carry these exact owner-validated source dependencies into registered binding admission and independently observed native relationship definitions before protected graph activation.

Astra ultra independently verified the final receipt SHA, all292 current/preimage pins,25 unique matching observations, clean Weft main commit, fresh build log/removed target, runtime/tool hashes and complete handoff correspondence. It found no remaining blocker within interpretation/correspondence scope. Review was read-only and did not rerun the compiler or execute native operations.

## Private provisional binding byte custody — 2026-10-10

The native `catalog_binding_archive` candidate retains the entire original binding body, vocabulary pin, artifact identity, complete original admitted input and actual writer xid. `runtime_stage_catalog_binding` checks original admitted bytes/digest, canonical base64, exact current document cohort and unchanged prior revisions/archive before inserting; the archive participates in catalog generation and has ALWAYS immutable UPDATE/DELETE/TRUNCATE guards. The actual private TypeScript stager calls it inside the existing savepoint before native definitions. Unknown binding content remains uninterpreted, including binary NUL/invalid UTF-8 and extreme numeric token text. Present-binding default homes still refuse; these fixtures explicitly select JSON homes.

The complete native prestate capture has a distinct `truss-native-catalog-prestate/0.2-binding-custody` profile including prior archive rows. The 0.1 producer refuses when the archive relation exists. This is fresh isolated candidate DDL, not adoption/migration of the exported storage layout or populated deployments. **The 0.2 parity/finalizer is unimplemented**: existing `runtime_verify_new_catalog_prestate` does not admit this profile. No accepted report, readiness, publication or registered relationship authority is established. Native JSON aggregation is size-checked after aggregation; it is not a general CPU/allocation bound.

Captured-source native receipts (PostgreSQL16.15, pgserver0.1.4+truss.pg16.15, pg80001.31.5, Python3.11.17, Bun1.4.2):

`truss-binding-catalog-stage/4c7f2a37-f6bc-4582-a282-696b6b7374bf/native.json`: 84 observations/700 current/preimage pins; SHA256 `c183c2eed9a290fec6d1ebed4e3b553d35be0761663373bbeea526efc1f6a208`.

`truss-binding-catalog-stage/e8e65e86-4af3-4840-88ad-5e85f2a7da26/native.json`: 79 observations/700 current/preimage pins; SHA256 `0216dc8b7ee69c26fe9b4c195aba856cf6388aa56ecd0fab1d8d2741d6958bf2`.

`truss-owner-catalog-stage/af76cacd-6eb8-48a4-937e-c7e6fd7b8f4e/native.json`: 31 observations/697 current/preimage pins; SHA256 `f2839fa8c5c52e37a16408ad0fc7eddf34ab0f0b08f09ea22f9651d4d987115c`.

Occupied coverage uses an explicitly excluded installer seed on revision0 with inert original bytes, not an accepted historical cohort. All guards are restored ALWAYS before genuine capture/staging. Successful current staging and whole rollback preserve that prior row; an isolated prior identity-byte drift after original capture refuses with the intended55000 message and zero effects, following an agreeing positive. Independent byte substitution, prior revision, document revision/digest refusals, generation, immutable guards, ordinary-role privilege denial and full catalog/archive projections also pass. Ordinary-role controls use SET LOCAL ROLE in the excluded installer session, not login/SCRAM qualification. All required cleanup completes before passing receipts. Bun catalog-input preparation regression:16 tests/55 assertions.

Astra ultra reviewed source/controls, verified the earlier75-observation/700-pin receipt, and requested occupied-prestate coverage and fresh execution; both are now retained above. Historical75/77 predecessors precede current harness, and two failed attempts (including misrouted `truss-owner-catalog-stage/8bccc16f-9255-4ec0-b786-5de3cb0c9c9e`) retain failure/preimages without claiming support.

US-056-AC1/AC2/AC10 receive component evidence only. Historical acceptance remains26/132. Authenticated owner/issuer/current-cut and report custody, registered vocabulary/relationship interpretation, canonical keys/incidence, complete protected mutation/callable closure, 0.2 finalizer/publication/drain and remaining backends stay open. The archive is byte custody, not a policy engine or a semantic authority.

Astra ultra independently verified the final occupied receipt SHA, all700 current/preimage pins and84 unique matching observations, including isolated prior-byte drift, restored ALWAYS guards, before-admission old-profile refusal and exact positive/rollback preservation. It found no blocker for this narrowly scoped landing; review did not execute native probes.
