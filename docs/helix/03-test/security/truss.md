---
ddx:
  id: SEC-TRUSS
  type: test-procedures
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: STP-056
      kind: informed_by
    - id: STP-057
      kind: informed_by
---

# Truss PostgreSQL security qualification

## Scope

Independent backend acceptance for US-056/057 under CONTRACT-062/063. All cases
below are P0 and required; static source inspection and unrelated benchmarks
cannot close them. Matrix is a procedural expansion of the story test plans.

## Prerequisites

Version/profile: Actual admitted Truss current layout (0.12 source is uninstalled); exact PostgreSQL patch/build.
Fixture: Use registered type/relationship IDs and actual selected current state/node/scalar/edge/key/history homes. Synthetic graph rows are only spike evidence.
Mechanisms: CONTRACT-005 composition across all current stores; indirect keys, child values, retained payloads, reports, journal/tombstones and receipts; complete private integrity scope remains separate.
Use actual least-privilege subject connections and separately excluded assessor
and installer identities. Complete issuer/fact/authority inventory is required.
Seed Alice active on A, inactive on B; Bob active B; both Projects share Client C.
Resource RA belongs to A, RB to B, RO is ownerless; include multiple owners,
identity collisions, null/absent/sensitive fields and historical owner changes.
Every destructive drift control uses a disposable namespace/installation.

## Procedures

| Case ID | AC coverage | Required assertion |
| --- | --- | --- |
| truss.B01 | US-056-AC2 | read-membership: Selected native ordinary identity sees exact oracle resource IDs; active/inactive/sibling/no-owner cases. |
| truss.B02 | US-056-AC2 | association-endpoints: Junction row/typed edge identity and endpoint direction bind faithfully; reversed/wrong-type endpoints refuse. |
| truss.B03 | US-056-AC2 | collection-operators: Lookup/list/count/aggregate/traversal/page all follow eligibility, including all-hidden and empty authorized sets. |
| truss.B04 | US-056-AC5 | direct-storage-bypass: Direct tables, child homes, property bags, raw retained bytes, files and alternate query endpoints cannot bypass admitted policy. |
| truss.B05 | US-056-AC5 | native-role-escalation: Ordinary identity cannot inherit/SET/adopt owner, bypass or internal roles; pool role resets between transactions. |
| truss.B06 | US-056-AC5 | definer-resolution: Overloads, search path, temporary objects, wrapper calls and routine PUBLIC grants cannot enlarge ordinary authority. |
| truss.B07 | US-056-AC6 | logical-property-masking: Original null, absence, redaction and transform differ; forbidden property never escapes bag/retained carrier. |
| truss.B08 | US-056-AC6 | mask-query-semantics: Filter/sort/group/join/aggregate on protected properties cannot use raw value without explicit separate permission. |
| truss.B09 | US-056-AC7 | unsupported-activation: Unsupported path/mask/history/composition cannot install report-mode weakening; prior protected profile remains. |
| truss.B10 | US-056-AC8 | private-fact-observation: Authorization can consult hidden Assignment facts; ordinary direct/list/count/diagnostic paths disclose none. |
| truss.B11 | US-056-AC9 | inventory-drift: Change owner/grant/membership/routine/policy/column mapping after qualification; admission detects and refuses. |
| truss.B12 | US-056-AC10 | receipt-source-custody: Pin exact engine/build/model/policy/mapping/source/actual-role and per-case outcomes; missing or fabricated receipt refuses. |
| truss.B13 | US-056-AC2 | identity-carrier-collision: Same labels, hash collisions, quoted case, Unicode and composite keys cannot mix ownership or subjects. |
| truss.B14 | US-056-AC5 | privileged-negative-control: Excluded admin actually bypasses ordinary protection; ordinary identities cannot reach that authority. |
| truss.B15 | US-056-AC7 | incomplete-collection: Corrupt one required authority dependency; no silent partial rows/counts/page or success receipt. |
| truss.B16 | US-056-AC10 | performance-resource-budget: At 1k/100k/1M records retain plans/overhead and finite timeout refusal, with no unauthorized partial output. |
| truss.L01 | US-057-AC1 | write-old-new-state: Create/delete/update and ownership-change action compare original/proposed state; failed checks leave no effects. |
| truss.L02 | US-057-AC1 | field-write-authority: Updating forbidden field or policy attribute fails even where object write is permitted; plain SQL path cannot bypass. |
| truss.L03 | US-057-AC2 | revocation-drain-barrier: Hold admitted operation at final release; revoker blocks until drain and acknowledges only after release. |
| truss.L04 | US-057-AC2 | streaming-revocation: Revoke after first streamed page/row; profile either holds admitted guard through last release or refuses streaming before output. |
| truss.L05 | US-057-AC3 | read-after-acknowledgment: After assignment/grant removal acknowledges, a newly admitted read returns no revoked resources. |
| truss.L06 | US-057-AC3 | old-snapshot-new-generation: Begin repeatable-read before revoke, attempt first protected read after acknowledgment; restart/refuse old authority facts. |
| truss.L07 | US-057-AC4 | historical-owner-current-authority: Historical owner differs from current owner or key reused; current assignment with retained original owner alone governs. |
| truss.L08 | US-057-AC4 | native-history-policy-eligibility: Admit actual historical read only under proved native policy/compute/table profile; incompatible historical column fails closed. |
| truss.L09 | US-057-AC5 | cursor-cache-rebinding: Change caller/query/policy/assignment/mapping/data cut; old cursor or cache token cannot bypass fresh admission. |
| truss.L10 | US-057-AC6 | derived-copy-feed-propagation: Serving copies, journals, tombstones, provenance, exports and feed checkpoints preserve declared policy and completeness. |
| truss.L11 | US-057-AC7 | missing-custody-or-guard: Delete retained owner or make guard/fact provider unavailable; refuse without hidden counts or effects. |
| truss.L12 | US-057-AC8 | activation-rollback: Fail policy/mapping migration midway; prior protection survives, and downgrade never broadens ordinary access. |
| truss.L13 | US-057-AC3 | authority-change-exhaustiveness: Assignment activation, role changes, subject remap and relevant attributes advance authority and invalidate stale decisions. |
| truss.L14 | US-057-AC7 | effective-date-boundary: Trusted clock crosses assignment expiry during operation; lease/coordination profile preserves declared cut or refuses. |

For each row, instantiate positive and negative controls at the native surface.
Record original caller, complete native inventory, expected oracle outcome and
actual rows/fields/effects. Role tests must connect as the ordinary identity,
not merely SET ROLE from a superuser connection. Concurrent cases use explicit
barriers and independent lock/commit observations, with bounded deadlines;
sleep alone cannot establish ordering. Execute public driver/decoder paths too.

Guard failure expansion: cancel/crash an admitted worker, roll back its transaction,
stall a stream and abandon a cursor. Revocation must either drain before its
configured deadline or fail without acknowledging completion. Include both
released native resources and still-live application buffers.

## Execution

Current runner gate: `bun docs/helix/02-design/spikes/security/acceptance.ts`.
Backend production commands remain unimplemented and are explicitly null in
`cases.json`; the gate must fail until real exercising commands and receipts
exist. PostgreSQL spike replay is `python3 docs/helix/02-design/spikes/security/native.py`
in its isolated named container; it closes no actual Truss/Ashlar cases.
Native Delta runs must use an admitted existing test workspace and bounded
resources; this plan does not authorize production policy/role changes.

## Evidence Capture

Each case retains CONTRACT-063 EvidenceCase with AC citation, source digests,
versions/build, actual role, native descriptors, command, expected/observed
outcomes and artifacts. Include failed attempts and original transaction outcome.
Record schema/source inventory before and after drift and rollback cases.

## Pass/Fail Rules

100% required cases must exercise their assertions and pass at matching source
and profile. Not-run/blocked/skip/timeout never passes. Unsupported-feature
refusal verifies safety only; it cannot replace a required positive support case.
No unauthorized raw field, row, count, diagnostic or committed effect is allowed
within the declared profile. Timing/constraint-error limits must be explicit.

## Troubleshooting

Stale snapshots restart/refuse; they do not reuse a new generation with old facts.
Missing role/policy privileges are profile failures, not reason to grant ownership.
Native capability gaps remain explicit and cannot be solved by post-fetch filtering.

## Handoff

Implement these named cases before marking backend admission qualified. Preserve
an independently computed oracle and match exact physical identities. Report
performance observations separately from security correctness. Required native
commands and profile adoption remain open until original consumer integration.


### B08 query-use binding controls

Exercise predicate/order/group/join/aggregate with a protected field omitted from
the output projection. Retain positive exact original-action binding and negative
controls for a caller-supplied unrelated granted action, changed binding sources,
withholding, missing separate grants, forbids, empty prohibited selections and
incomplete dependencies used only by the original action. Admission must precede
native filtering/aggregation; evaluating permissions after a raw predicate has
already filtered rows is insufficient. Conditional logical simulation and a
self-asserted action label do not close this native case.

## Actual host-runtime ordinary-principal component

The actual Truss pg-runtime now has an optional pinned ordinary-login boundary
with native identity/bypass verification, role/settings reset and post-BEGIN check.
Forty native component observations cover three actual SCRAM logins, same-PID
reuse after commit/abort, wrong identity pin, privileged login, changed bypass flag
and retained quarantine. Original ParameterStatus frames preserve context reports
without satisfying command completion. Four wire tests pass with twelve assertions.

Evidence: `docs/helix/04-build/evidence/security/truss-principal.json`, generated by
`tools/security/truss-principal-probe.py` from actual Truss source and a uniquely
owned PostgreSQL 17.9 fixture. The fixture is raw relational storage, so this is
host-component evidence and cannot substitute for any required Truss graph case.
Native protected 0.13 installation, actual graph authorization, service caller
adoption, transaction-mode poolers and full current-authority/release remain open.

The actual host-component journal replay adds exact disk/in-memory original
correspondence and consecutive local ordinals, for 53 total native observations.
Malformed context reports and absent command completion refuse; missing outcomes
remain incomplete with raw bytes retained. A deleted well-formed context report
can leave a structurally complete journal while differing from the independently
retained original. Qualification therefore requires full source correspondence;
`state: complete` alone cannot establish authenticity or native/replay authority.
The private native originals and damaged copies remain in the owned directory
named by the component receipt. This does not pass Truss B12 or a graph case.


## Actual Truss normalized-IR row-predicate lowering component

`tools/security/truss-policy-lowering-probe.py` executes the actual portable
Truss backend lowerer against fresh actual Rust normalized rules in an owned
PostgreSQL 17.9 raw-table fixture. Forty-six observations pass. Generated SQL
installs as the existing fixed-search-path, private non-login-owner function
under forced RLS; ordinary original actors receive exact resource IDs. Only
resource-ID column publication remains granted; unmapped value, prior disclosure
view and private Assignment access refuse. An explicit complete native login
roster includes the unassigned outsider. NULL helper key input remains unknown
through STRICT and explicit qualified JSON truth encoding.

The mandatory membership rule is weakened through the actual Rust source
compiler to a permit. Its generated native function exposes all five IDs to
every ordinary actor. Reinstalling the exact original generated definition
restores every authored vector. Source/keyword/identifier/operator qualification
and bounded emission are backend-owned; SQL identifiers above 63 UTF-8 bytes,
unrecognized rule/term forms, context terms, unsupported domains/refinements
and oversized/deep output refuse. Native lowering currently admits only required
unrefined TEXT/BOOLEAN predicate facts. The emitter uses explicit three-valued
existence CASEs and permit-is-true/require-is-true/forbid-is-false composition.

`tools/security/truss-predicate-browser.ts` runs the same actual portable module
in real Chromium 148.0.7778.96 and emits SQL exactly equal to both native-tested
original and weakened predicates; no Bun/process/Buffer globals or external
requests occur. Initial normalized-domain and NULL-transport failures are
retained separately. A qualified JSON object envelope passes; the prior empty
unqualified scalar/object transport attempts are not positive evidence.

This is a native row-policy translation component on raw tables, not an installed
type-defined Truss graph profile. Complete host/issuer/fact/current-authority
admission, field-disclosure lowering, temporal/write/stream/cache/release controls,
privacy closure and production support remain unqualified. Public compiler
security activation remains unsupported; no B/L or full acceptance criterion
is credited by this component.

Current replay expansion: 49 observations include actual native routine owner/security/PUBLIC ACL flags and forced-RLS/ID-only column privilege vectors. The emitter refuses multiple logical types sharing one physical table without a discriminator bridge; browser replay independently verifies that refusal. The earlier 46-observation increment is retained as history. Current receipt paths are unchanged.


## Native three-valued existence diagnostics

`tools/security/truss-existence-truth-probe.py` records 63 observations, including
the 49 row-lowering foundation controls. Negative-existence and forbid variants
are emitted by the actual Rust owner from revised source policies and lowered
by the actual Truss module. Known-subject complements match authored vectors.
The unassigned subject is then deliberately removed for primitive SQL diagnostics
outside the admitted complete-subject cut. For RA/RAB/RB, unknown witnesses under
negative-existence and forbid deny. A deliberately naive native `NOT EXISTS`
collapses unknown to false and grants those same primitive decisions. The exact
original generated function and complete subject roster are restored before
normal final checks and cleanup. This is not a valid whole-collection read with
missing subject: host admission must refuse that incomplete context.

`tools/security/prove-existence-truth.py` supplies three conditional Z3 checks
in `existence-truth-formal.json`: logical Kleene-OR existence corresponds to the
SQL CASE priority algebra; unknown negative-existence and forbids cannot grant.
Two optional witnesses cover all T/F/U states and empty populations. Violations
are UNSAT, independent positive populations SAT, and naive-EXISTS controls SAT.
Identical complete stable native/logical witnesses and scalar truth correspondence
are premises. Source pins do not prove SQL/compiler implementation correctness;
actual native diagnostic execution is separate evidence. No full criterion or
missing-subject collection admission is credited.


### Ordinary subject preflight component — 2026-10-08

The actual Truss pg-runtime has an optional `ordinarySubject` selection paired
with a pinned `ordinaryPrincipal`. Before BEGIN can return successfully, original
native protocol must report exactly one non-null TEXT key tuple, in the selected
column order, from a fully qualified private routine invoked with SESSION_USER.
Column aliases, original type OIDs/text format, cardinality, UTF-8 and finite key
byte bounds are checked. Selection is copied before acquisition. Only stable
repeatable-read/serializable read-only transactions admit this experimental
selection; read-committed and writable requests refuse before native BEGIN.
Subject check failure retains quarantine and closes source admission. No
application query, including an empty scan/count, can run on that failed lease.

`tools/security/truss-subject-probe.py` independently exercises the actual source
on an owned PostgreSQL 17.9 fixture with three original SCRAM ordinary logins.
Private mapping publication is unavailable. Positive empty counts are valid only
after admission. Missing/duplicate/null/wrong-native-type/wrong-column/error
responses reject before application SQL; composite keys retain exact original
column order and Unicode values, while reversed order rejects. Original query
journals independently retain all preflight attempts and show empty queries only
for admitted leases. The existing ordinary-principal 53-observation probe replays.

This fills a host preflight gap, not complete backend admission. Trusted exact
routine source/owner/ACL/inventory qualification, model-key correspondence,
current-authority generation and revocation guard remain external premises.
An attacker-controlled same-shaped routine is not an authenticated mapping.
Stable snapshots alone cannot establish current authority after acknowledgment.
Actual Truss typed graph adoption, complete facts, field publication and lifecycle
cases remain open; no full B15 or security criterion is accepted. Evidence:
`docs/helix/04-build/evidence/security/truss-subject.json`. Full gate remains 22/132.


Subject preflight concurrency refinement: eight additional native observations
raise this component to 58. An independently observed PostgreSQL advisory-lock
wait proves the original preflight is pending. Concurrent application SQL, BEGIN,
COMMIT, ROLLBACK and release refuse locally without submission. After native lock
release, admission completes and the original empty count returns zero. Eleven
original one-key preflight attempts and only four admitted empty-count submissions
are retained (composite attempts are separately checked). The original principal
53-observation replay passes at the same modified runtime source. This establishes
pending-admission exclusion, not revocation barriers/current-authority admission.


### Explicit shared-home type selection — 2026-10-08

The actual portable Truss PostgreSQL row emitter now accepts explicit native
row discriminators. Shared homes require every logical type to select the same
native discriminator column/carrier with distinct canonical values; absent,
overlapping, mixed-column and mixed-carrier mappings refuse. int4/int8 values
remain canonical decimal text and are range-checked with bigint, never stored
as JavaScript numbers. Typed resource lowering also requires the original native
row-type parameter immediately after ordered key parameters; omitting it refuses.
Subject and every association witness scan select their declared row type before
three-valued existential aggregation. Raw unique-home SQL remains byte-identical.

`tools/security/truss-type-selection-probe.py` retains 28 observations on owned
PostgreSQL 17.9 shared native fact projections with int4 discriminators. The
original Rust handoff is replayed with its exact binary/source digest. Deliberate
same-ID/different-type subject rows and wrong-relationship endpoint tuples cannot
supply witnesses. All three original ordinary actors match authored eligibility,
wrong root types return no eligible rows, and private facts remain unpublished.
Seven malformed mapping controls refuse before SQL. Erasing only association
filters causes Alice to read RB through wrong-relationship witnesses; exact
restoration recovers every actor vector. NULL root inputs cannot grant.

Real Chromium 153.0.8010.12 runs the actual portable module and matches all three
native-tested predicates (original raw, weakened raw, explicit typed projection),
plus shared-home-without-selection, missing root selection and overlap refusal.
The original 49 native row-lowering and 63 unknown-existence observations replay
at the new backend source; the existing three conditional existence proofs replay.
Two further Z3 checks establish typed witness fold versus filter-before-CASE
algebra and refusal on wrong/missing root tags. Each violation is UNSAT, with SAT
positive populations and SAT type-erased controls. Truthful injective native tag
correspondence and complete stable witness/scalar truth sets are premises.

This native projection is synthetic, not the current installed Truss graph
node/scalar/key/edge layout. TEXT/int8 discriminator execution, business-key codecs,
current property-carrier decoding, graph catalog identity and native endpoint
registry correspondence remain unqualified. Existing raw key correspondence
cannot automatically validate a shared (type,id) primary key as an id-only key;
an explicit typed native key bridge is required. Root parameter authenticity,
source/issuer/fact/current-authority/guard/privacy/lifecycle admission remain open.
No required graph case or full criterion is credited; gate remains 22/132.
Evidence: `truss-type-selection.json`, `type-selection-formal.json` and refreshed
`truss-predicate-browser.json` under the security build evidence directory.


### Typed logical/native key correspondence — 2026-10-08

The actual portable Truss backend now has `security-native-key.ts`, a synchronous
key correspondence check over original admitted compiler declarations and original
native inventory. Required unrefined TEXT key fields must match complete qualified
field references in authored order. Predicate field columns and key columns must
agree. Shared homes require distinct canonical int4 type selections, original
native catalog type/column observations and matching complete model source pins.
Native columns must have exact nonnull/deterministic TEXT domains; type columns
must be nonnull INTEGER. The validated native primary key must contain exactly the
selected discriminator and logical key carriers. An explicit
`nativePrimaryKeyColumns` preserves native index order separately from logical
component order; absent that declaration, the fixed type-prefix/default order
must match exactly. No silent component permutation or omitted type is allowed.
Malformed facet arrays and non-boolean native key flags refuse interpretation.

`tools/security/truss-native-key-probe.py` records 44 observations on owned
PostgreSQL 17.9 original descriptors and a synthetic native type catalog/fact
projection. Actual original Rust source/handoff/binary are replayed and pinned.
Eighteen malformed mapping/source/domain/metadata controls refuse. Native key
reordering, VARCHAR replacement, wrong type catalog entries and changed source
pins refuse before predicate emission and restore exactly. Equal keys in three
entity types and equal endpoints in two association types coexist. Explicitly
reviewed native composite order and type-last primary keys validate without
changing logical component order or emitted predicates; prior mappings reject
those same changed native orders. The same owner module validates original raw
TEXT keys and emits the byte-identical original native-tested raw predicate.

Real Chromium 153.0.8010.12 runs the same portable checker: raw and typed positive
inputs plus three key-order/type-source/predicate-column mismatch refusals pass,
with no host globals or external requests. Z3 has three conditional checks over
two ordered unbounded string components and unbounded type tags: canonical typed
logical/native tuple correspondence, distinct namespaces and declared component
order. Violations are UNSAT with SAT populations and type-erased/reversed controls.
Truthful injective tag correspondence and scalar equality remain premises; the
symbolic model does not prove compiler/code/native installation or catalog origin.

An initial raw refusal control targeted descriptor table zero (unselected Company)
instead of Staff. That test error is retained in
`truss-native-key-raw-control-failure.json`; controls now resolve Staff's exact
mapped home. It does not justify requiring every unrelated table to be part of
the declared key dependency closure. Complete authority inventory is independent.

This remains a key correspondence component, not actual Truss graph admission.
Original graph business-key codecs, node/current-state/property carriers, native
catalog/source authenticity, ordered endpoint/FK registry, complete issuer/facts,
current authority and final release remain open. Original stable inventory/cut is
a host premise; passing caller-supplied metadata cannot authenticate it. Public
security activation remains unavailable and no backend criterion is credited.
Evidence: `truss-native-key.json`, `truss-native-key-browser.json` and
`type-key-formal.json` under the security build evidence directory. Full gate
remains 22/132, all complete criteria open; the goal stays active.


### Original UMF tuple / native key-bucket transport — 2026-10-08

The actual portable Truss `security-key-transport.ts` captures independently
registered original UMF encode/verify functions plus copied model/key/namespace
selection. It requires the original current-core 3.0.0 `umf-key-tuple-v1` receipt,
reverified by its owner, and derives exact UTF-8 storage bytes for
`umf-key-tuple-v1:hex:<lowercase tuple hex>`. The native one-MiB encoded transport
bound and 64-KiB namespace bound apply. Full namespace and full encoded transport
must match together. A prefix, digest, caller-provided receipt shape or equal
value bytes in another namespace never establishes selected key correspondence.
The producer and original namespace authority remain independently qualified host
premises; the portable constructor cannot authenticate supplied methods or bytes.

`tools/security/truss-key-transport-probe.py` loads the exact original 0.15 owner
export in owned PostgreSQL 17.9 and uses actual native canonical string/tree
helpers. Seventeen observations pass with the registered 9e4bed3e UMF value
producer: ordered decimal `12.340`, Unicode `雪🙂` and integer token
`9007199254740993` match the independent original tuple oracle. Exact transport
bytes round-trip through the actual `object_key_bucket` BYTEA columns. Two native
memberships have identical key payload/digest but different complete namespace
bytes. The second namespace is deliberately unadmitted. Three original ordinary
roles lack schema access and direct bucket queries refuse with SQLSTATE 42501.
All fixture credentials remain private; owned native cleanup precedes receipt.

Real Chromium 153.0.8010.12 executes the actual owner bundle and portable backend
module. Four checks pass: exact expected encoding, original native bytes, foreign
namespace refusal and changed-payload refusal. No host globals or external
requests occur. This is original codec/native transport evidence, not a new formal
proof of the encoder, installed namespace authority or whole graph implementation.

Initial native source-completeness and ordinary namespace-lookup failures are
retained in `truss-key-transport-initial-refusals.json`; failed source snapshots
were not retained, so that diagnostic does not establish source-qualified failed
case receipts. Final fixture definitions retain required original document source
references and canonical type lineage. They remain installer-only fixtures:
`accepted_document` labels do not establish protected catalog acceptance, owner
property/key parity, original namespace/codec authorization or protected writer
execution. The actual object property bodies are incomplete and the second
namespace intentionally invalid; no successful complete graph operation is claimed.

Current `runtime_stage_object_key` admits only an already-encoded envelope shape;
its protected producer must separately establish complete source/codec/namespace
and canonical value correspondence. Security binding cannot accept arbitrary hex
payloads merely because that prefix passed. Actual graph business-key uniqueness,
full bucket collision/source inventory, native endpoint joins, complete canonical
facts, original-role/current-authority/guard and privacy closure remain open.
Evidence: `truss-key-transport.json` and `truss-key-transport-browser.json`.
No required graph case or complete criterion is promoted; full gate stays 22/132.

### Retained namespace and stored-key component evidence

`namespace-canonical-oracle.json` binds the retained 23-case native canonical corpus to unchanged original SQL producers. `truss-key-namespace-replay.json` and `truss-key-namespace-browser.json` test the current immutable factory against that corpus. `namespace-native-domain-formal.json` retains four conditional mathematical checks. `truss-stored-key-replay.json` tests exact original bucket correspondence, foreign namespace refusal, immutable selection, codec pin mismatch and producer replacement during an awaited callback; `truss-stored-key-browser.json` checks original, foreign, and changed bytes in Chrome 153.0.8010.12 without host globals. These replay receipts explicitly record `freshNativeExecution: false`. The earlier `truss-key-namespace.json` predates the factory change and is historical, not current-source native qualification.

Required next evidence remains fresh native execution of the current factory, authoritative original namespace/key definitions and source parity, protected writer/read integration, endpoint and property disclosure enforcement, and an authority guard spanning decision through final release. Signed/zero token representability does not qualify a live key definition or profile migration. The 30 required Truss backend cases remain open.

Current async capture expansion: stored-key replay now passes eight Bun checks and seven Chrome 153.0.8010.12 checks. The three new adversarial interleavings repair an initially bad stored key, change an initially valid stored key, and repair an initially bad original value tuple while namespace verification is pending. Each decision preserves entry-state tuple correspondence. The retained pre-fix source and failure receipt demonstrate all three controls detected the original bug. This does not replace native registry authority, complete source/graph parity, or the final-release authorization guard; full backend cases remain open.

Astra review expansion: 78 native scoped-truth observations now include actual owner-derived two-permit U controls, both rule orders, false competing permit and unrelated action/target scopes. 82 native subject/runtime observations include an independently observed application advisory-lock wait, local refusal of all competing public operations before new journal creation, original response custody and healthy later checkout, for both unconfigured and principal-only sources. These fix lowering and runtime defects; actual type-defined graph/native final-release acceptance remains open.

### Original-value carrier isolation regression protocol — 2026-10-09

Required expansion of truss.B08 (US-056-AC6), truss.B10 (US-056-AC8) and truss.B15 (US-056-AC7). The retained PostgreSQL raw spike counterexample `original-use-hidden-carrier-counterexample.json` demonstrates that protecting a root relation alone can let hidden malformed carriers affect eligible results. Its fix and 252 observations are motivation, not acceptance evidence for this backend.

1. Establish actual ordinary-subject outputs for predicate, order, group, join and aggregate, including populated and empty-result variants; separately bind original-value action authority. Retain rows and client diagnostics, including success with an empty authorized set.
2. Change only an unreadable resource's carrier to null, text, fractional numeric, overflow and structured object values outside the selected native field domain. For every operator and empty variant require identical eligible outputs and no new ordinary diagnostic payload. Restore exact carrier bytes. Compare successful request/error outcomes as well as returned rows; a generic failure is observable interference.
3. Apply the same changes to an eligible required carrier. Require whole-request refusal before any row, aggregate, page or success receipt, including empty application results. Repeat with a missing carrier and duplicated selected carrier projection; restore each state and prove successful recovery.
4. Test same native key bytes in another logical type/home and reversed or wrong-type endpoint bindings. Required source completeness must consider exactly the eligible selected type population. A hidden/ineligible carrier or carrier of a different type cannot satisfy an eligible dependency or cause its refusal.
5. Inspect native policy/barrier metadata for every protected carrier before evaluating stored values, including child and retained homes. Use an assessor's inventory rather than installer declarations. Denying direct SELECT or filtering the root relation does not establish evaluation isolation. Retain native execution-plan evidence where available, while treating observed query behavior as the decisive regression result.
6. Change carrier policy, original routine, type selection or source mapping in a disposable installation. Public admission must detect drift or retain a demonstrated immutable dependency cut. Retain the prior installation and show migration failure does not broaden access. Link these results to truss.B11/B12 and L12; fixed installer edits do not qualify current-source custody.
7. Use explicit barriers to mutate carrier/authority after admission and before final release. Require the declared stable source/authority cut, coordinated drain or refusal without partial output. Link to truss.L03/L06/L11; a sequential fixed-statement test does not qualify concurrent final-release behavior.
8. Retain source pins, selected field/input/result domains and the full ordinary driver result/error path. Signed64 input extrema and widened aggregate results must remain exact native/lexical values. Do not route stored identities or numeric values through JS Number. Compare unmasked input authorization separately from disclosed output semantics.

Backend instantiation: use the actual installed graph type and edge registry, selected node/edge/scalar/key/retained or serving homes, and both endpoint directions. Include colliding keys across type IDs, original root discriminator validation, and wrong-type roots. A fabricated shared-table graph fixture cannot qualify this protocol.

No new cases or criteria are removed or marked accepted by this procedural expansion. Execute it as part of the existing required case IDs.

Formal obligation: `carrier-error-isolation-formal.json` proves conditional eligible-only carrier evaluation over two worlds; truss.B08/B10/B15 must independently establish native eligibility/barrier/cardinality/scalar/cut premises. SAT unsafe evaluation is a mandatory negative-control pattern, not a passing backend receipt.

Drain proof obligation: publication-drain-formal.json gives an inductive abstract invariant. truss.L03/L04/L11 must prove individual native lease custody through actual final release and all mutation participation; an application callback promise alone does not establish those premises. Include the premature-release negative control and failure/cancellation protocols.

Mandatory truss.L03/L11 backend-loss control: retain a live client publication buffer, terminate only its native session, then attempt revocation acknowledgment. Native-session lock release is not buffer drain. Require separately proved publisher lease/acknowledgment or bounded refusal; exercise cleanup of live publisher versus dead owner. PostgreSQL retained native-lease-loss counterexample motivates this test without transferring results to this backend.

Publication cleanup expansion for truss.L03/L11: enroll two publishers for the same ordinary actor, retain both buffers and lose their native sessions. Release one exact lease only; the sibling must still prevent revocation acknowledgment until separately proved release. Actor-wide cleanup is a mandatory negative control. The raw PostgreSQL retained counterexample supplies motivation, not acceptance evidence for this backend.

### Required publication retirement interleavings

For US-057-AC2/3/5/7, retain an enrolled ordinary repeatable-read reader after its first result is drained and attempt exact lease retirement before ending the native read lease. Retirement must refuse or wait without acknowledgment or effects; terminal state must never admit a second buffer. Also establish an older ordinary snapshot without a protected read lock, retire its enrolled lease, then attempt first protected use: restart/refusal without data is required. Cover overlapping read-committed statements independently; selecting read-committed alone does not establish freshness. Observe current lease state, native coordinator ownership, authority generation, output custody and mutation acknowledgment separately. Preserve a negative schedule and prove equivalent fencing for each actual storage backend; the raw PostgreSQL spike does not accept graph or Delta implementation cases.

For the same lifecycle criteria, test both coordinator orders with native barriers: retain retirement's exclusive guard before an older snapshot requests protected use, independently observe the blocked reader and exclusive holder, then commit retirement and require refusal without a result. Also roll back retirement after generation advancement and verify that obsolete snapshots and fresh statements cannot self-repair or emit data; recovery must use the selected explicit coordinated protocol. Separately inventory transactional and non-transactional state, retained lease custody and issuer authority. These schedules remain required on actual graph/Delta backends even when the raw PostgreSQL authored spike passes.

Publication enrollment tests must attempt independent changes to the enrolled identifier, original caller, native backend identity and backend incarnation before release. Each must refuse without changing the binding or eligibility. Wrong-incarnation controls must preserve immutable enrollment: use an initially invalid distinct enrollment and separately admitted replacement, with retained terminal history. Inventory insertion provenance and privileged trigger/table replacement separately; immutable ordinary UPDATE behavior alone does not qualify the issuer or complete installation.

Typed original-carrier completeness must be evaluated by exact selected type plus exact native key. Seed a selected-type root with a missing carrier and a sibling-type carrier carrying the same local key: admission must refuse. Then vary sibling cardinality and malformed required fields while holding selected-type facts fixed; admission must remain unchanged. Test selected-type duplication independently. Retain compiler-owned selectors, installed native correspondence and the complete eligible population before application filtering. The quantified typed-source-completeness algebra is conditional evidence; each backend must independently establish its premises.

### Required original graph mapping controls

For truss.B01/B08/B10/B11 and US-056-AC2/4/5/10, obtain actual original admitted current catalog/layout correspondence before constructing security facts. A provisional catalog-stage result, stale creation revision or review-only owner export must not authorize graph mapping. Use different native object storage IDs and business-key component values; substituting the storage ID must refuse or fail the mapping conformance assertion. Include Record/relationship/association-owner ID collisions, qualified property names across modules, json-to-props home translation and row-home state/node/scalar presence. Verify original canonical property IDs and codecs rather than ordinal/name guesses. No synthetic flat projection can close these actual graph cases.


### Required principal/subject profile composition

For US-056-AC5/8/9 and truss.B05/B10/B11, compose original caller observation and actual subject-key binding under the selected deployment ACLs. Require independently qualified zero-argument principal observer ownership/configuration/ACLs and exact outside-definer native caller carriers; subject key output remains TEXT. Exercise original pooled PID reuse and role reset, missing/changed observer, altered native flags/encoding, unsupported caller input carriers and absent/ambiguous/wrong native subject key outputs. Ordinary name-to-text conversion may require a denied catalog function: select an explicit qualified input carrier, never silently broaden grants or drop identity checks. truss-private-principal.json is component feasibility evidence; actual graph deployment/change custody and full ordinary surface remain separate acceptance obligations.

## Complete native dataset collector controls

These controls expand the existing B01–B16 obligations; they do not add substitute
acceptance cases or qualify the supplied-dataset component as native evidence.
Source inspection found two distinct precursor interfaces: candidate graph source
SQL preserves selected object/edge rows but leaves source/cut authority to its
caller; the private owner-states proposal enumerates all states for one typed
owner but assumes complete visibility and coherent cut. The canonical-event
operation generation observer explicitly does not claim complete row-touch
observation. A complete collector must compose those obligations under actual
installed authority before feeding the original compact UMF operation.

| Control | Required exercising observation | Existing acceptance linkage |
| --- | --- | --- |
| Population identity | Include every selected typed object and relationship occurrence, including owners with no states; compare independently enumerated typed IDs, not only counts. Object/edge kind and discriminator remain part of identity. | US-056-AC2, AC10 |
| Omission detection | Remove an owner, replace one owner with a duplicate, or omit a same-version document. Equal totals must not pass. | US-056-AC2, AC10 |
| Whole owner states | Include undeclared, retired, sibling, duplicate and extra property states; do not filter to known active fields before the completeness check. | US-056-AC5, AC7 |
| Presence and lexical values | Distinguish absent state, present null, malformed tree, missing scalar and exact arbitrary integer/decimal tokens. Reject coercion through Number or Date. | US-056-AC6 |
| Endpoints | Preserve edges with missing/wrong-type endpoints or zero/multiple key buckets; a join must not remove them. Preserve parallel occurrence IDs. | US-056-AC2, AC7 |
| Hidden facts | Assessor collection sees private membership/assignment facts needed for policy while ordinary subject list/count/diagnostic paths reveal none. | US-056-AC8 |
| Source binding | Exact original artifact/interpretation mapping determines every native type, property, key and relationship ID. Removing WorksOn in an alternate parser must refuse, even if supplied data then validates. | US-056-AC7, AC10 |
| Coherent cut | Mutate owner/state/scalar/key/edge or catalog authority between enumeration, value projection and verification; mixed observations cannot issue complete evidence. Include concurrent committed writes and stale transaction snapshots. | US-056-AC9, AC10; US-057 |
| Resources | Exhaust owner, occurrence, tree, source, receipt and work limits before bulk materialization or effects. Preserve whole-dataset uniqueness and multiplicity; independently validated chunks cannot discharge the global obligations. | US-056-AC7, AC10 |
| Evidence custody | Reject copied, cross-operation, cross-document, stale-cut or reordered evidence and fabricated complete flags; bind exact native wire bytes, authority/cut and original owner checker/verifier bytes. | US-056-AC9, AC10 |

Required retained artifacts: independently authored expected typed population and
presence/key/endpoint mappings, selected source/profile inventory, original native
wire bytes and cumulative reservation account, coherent cut observations before
and after collection, complete original compact receipt, exercising mutations,
actual subject/assessor roles and installed authority inventory. Each gate remains
unavailable until a native runner demonstrates it. A supplied-dataset receipt
retains its unverified provenance and cannot authenticate these artifacts.

Parallel-occurrence lowering must additionally exercise two same-tuple edges
with distinct identities and different active/ownership attributes. Verify
original occurrence cardinality, minimum/maximum participation and both edge
predicates separately. A tuple-only existence optimization requires evidence
that the admitted predicate cannot observe edge identity, attributes or counts.
For the current endpoint-unique layout, require explicit incompatible-profile
refusal with no partial installation or source pruning; a future occurrence-
capable layout must retain both original edges and qualify native concurrency
and mapping correspondence. See SPIKE-009's eleven-query parallel preservation
analysis. These are expansions of the original mapping/relationship acceptance
obligations, not additional accepted backend cases.

Count-meaning acceptance expansion (truss.B02/B09/B12/B15, US-056-AC2/7/10):
retain the original declared count domain. Pinned UMF multiplicity counts
 distinct related Records; the Truss participation proposal counts canonical
edge occurrences. Test two parallel edges under maximum-one and minimum-two in
both domains. Require exact expected distinct and occurrence counts, original
edge identities, source/profile correspondence and zero-effect refusal for an
unadmitted composition. A complete UMF dataset receipt alone cannot attest a
Truss occurrence bound. Any no-parallel premise must hold for complete native
scope, including hidden edges and concurrent writers, rather than supplied
samples or endpoint visibility.

Unfiltered population prerequisite controls (truss.B02/B10/B15): independently
activate RLS hiding objects and RLS hiding edges. A candidate integrity collector
must refuse both with no partial result, even if the other table was captured
before the error. With RLS disabled, a NOSUPERUSER/NOBYPASSRLS role with explicit
SELECT and routine execution must return exact expected typed owners. This
positive control distinguishes filtering refusal from an unconditional failure.
Neither SET ROLE from an excluded administrator nor this isolated collector test
qualifies authenticated ordinary sessions, protected integrity authority or the
complete original backend case.

Repeat the unfiltered collector controls with a non-superuser table owner under
non-forced RLS, then FORCE RLS. Record both native owner OID and relforcerowsecurity:
the first may be exempt and the second must refuse if policy filtering applies.
Restore ownership and original explicit grants before further controls; otherwise
a later permission error can mask the RLS behavior being tested.

Collector source custody expansion (truss.B06/B11/B12): compare native routine
body, complete selected overload inventory, owner, definer mode, settings and
PUBLIC/effective grants with the original installation closure. A body-only
false-filter mutation must fail correspondence despite unchanged name/signature;
rollback must restore exact bodies before later execution. Native dependency and
role resolution require separate qualification beyond this source comparison.
