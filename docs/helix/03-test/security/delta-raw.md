---
ddx:
  id: SEC-DELTA-RAW
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

# Unity Catalog Delta relational security qualification

## Scope

Independent backend acceptance for US-056/057 under CONTRACT-062/063. All cases
below are P0 and required; static source inspection and unrelated benchmarks
cannot close them. Matrix is a procedural expansion of the story test plans.

## Prerequisites

Version/profile: Exact workspace/cloud, warehouse/runtime, managed-table protocol and policy feature status. Field-protection P-cases (2026-10-14) and the `unity-delta-raw/0.1.0` profile additionally require two independent ordinary identities plus separately excluded installer/assessor identities (`databricks-actors.json` currently reports zero distinct non-installer identities: a hard external blocker), an isolated catalog/schema, pinned DBR/SQL-warehouse versions and compute tuple (DBR >= 12.2 for filters/masks; dedicated compute >= 16.3 for writes; DBR 17.2 for DELETE/UPDATE/MERGE on partition-column policies; DBR 19+ for the ABAC time-travel Beta), and the SHA-256 of the cloud documentation copy read at execution, because the AWS, Azure and GCP copies of the filter/mask page diverge (the Azure/GCP copies omit the time-travel and clone restrictions; the AWS wording governs this plan).
Fixture: Ordinary managed employee/company/m2m tables plus Project ownership and Assignment; match declared association endpoint columns. P-cases add a masked field, a hashed join key, a tokenized field with a stand-in vault table in an excluded schema, and (P07) authored ABAC policies with `EXCEPT` principals.
Mechanisms: Unity Catalog roles/grants, row filters, column masks, governed-tag ABAC or protected views; direct/path/REST/Delta endpoint eligibility and native policy conflict controls. P-cases add view-based withhold (no base-table SELECT), column-mask UDFs generated from the protection catalog, and observation of operator behavior over masked columns. Before any filter is generated, Q7 must be observed at an ordinary identity: a filter/mask UDF must read a private mapping table without granting it to the querying user, else the row-level design is refused.
Use actual least-privilege subject connections and separately excluded assessor
and installer identities. Complete issuer/fact/authority inventory is required.
Seed Alice active on A, inactive on B; Bob active B; both Projects share Client C.
Resource RA belongs to A, RB to B, RO is ownerless; include multiple owners,
identity collisions, null/absent/sensitive fields and historical owner changes.
Every destructive drift control uses a disposable namespace/installation.

## Procedures

| Case ID | AC coverage | Required assertion |
| --- | --- | --- |
| delta-raw.B01 | US-056-AC3 | read-membership: Selected native ordinary identity sees exact oracle resource IDs; active/inactive/sibling/no-owner cases. |
| delta-raw.B02 | US-056-AC3 | association-endpoints: Junction row/typed edge identity and endpoint direction bind faithfully; reversed/wrong-type endpoints refuse. |
| delta-raw.B03 | US-056-AC3 | collection-operators: Lookup/list/count/aggregate/traversal/page all follow eligibility, including all-hidden and empty authorized sets. |
| delta-raw.B04 | US-056-AC5 | direct-storage-bypass: Direct tables, child homes, property bags, raw retained bytes, files and alternate query endpoints cannot bypass admitted policy. |
| delta-raw.B05 | US-056-AC5 | native-role-escalation: Ordinary identity cannot inherit/SET/adopt owner, bypass or internal roles; pool role resets between transactions. |
| delta-raw.B06 | US-056-AC5 | definer-resolution: Overloads, search path, temporary objects, wrapper calls and routine PUBLIC grants cannot enlarge ordinary authority. |
| delta-raw.B07 | US-056-AC6 | logical-property-masking: Original null, absence, redaction and transform differ; forbidden property never escapes bag/retained carrier. |
| delta-raw.B08 | US-056-AC6 | mask-query-semantics: Filter/sort/group/join/aggregate on protected properties cannot use raw value without explicit separate permission. |
| delta-raw.B09 | US-056-AC7 | unsupported-activation: Unsupported path/mask/history/composition cannot install report-mode weakening; prior protected profile remains. |
| delta-raw.B10 | US-056-AC8 | private-fact-observation: Authorization can consult hidden Assignment facts; ordinary direct/list/count/diagnostic paths disclose none. |
| delta-raw.B11 | US-056-AC9 | inventory-drift: Change owner/grant/membership/routine/policy/column mapping after qualification; admission detects and refuses. |
| delta-raw.B12 | US-056-AC10 | receipt-source-custody: Pin exact engine/build/model/policy/mapping/source/actual-role and per-case outcomes; missing or fabricated receipt refuses. |
| delta-raw.B13 | US-056-AC3 | identity-carrier-collision: Same labels, hash collisions, quoted case, Unicode and composite keys cannot mix ownership or subjects. |
| delta-raw.B14 | US-056-AC5 | privileged-negative-control: Excluded admin actually bypasses ordinary protection; ordinary identities cannot reach that authority. |
| delta-raw.B15 | US-056-AC7 | incomplete-collection: Corrupt one required authority dependency; no silent partial rows/counts/page or success receipt. |
| delta-raw.B16 | US-056-AC10 | performance-resource-budget: At 1k/100k/1M records retain plans/overhead and finite timeout refusal, with no unauthorized partial output. |
| delta-raw.L01 | US-057-AC1 | write-old-new-state: Create/delete/update and ownership-change action compare original/proposed state; failed checks leave no effects. |
| delta-raw.L02 | US-057-AC1 | field-write-authority: Updating forbidden field or policy attribute fails even where object write is permitted; plain SQL path cannot bypass. |
| delta-raw.L03 | US-057-AC2 | revocation-drain-barrier: Hold admitted operation at final release; revoker blocks until drain and acknowledges only after release. |
| delta-raw.L04 | US-057-AC2 | streaming-revocation: Revoke after first streamed page/row; profile either holds admitted guard through last release or refuses streaming before output. |
| delta-raw.L05 | US-057-AC3 | read-after-acknowledgment: After assignment/grant removal acknowledges, a newly admitted read returns no revoked resources. |
| delta-raw.L06 | US-057-AC3 | old-snapshot-new-generation: Begin repeatable-read before revoke, attempt first protected read after acknowledgment; restart/refuse old authority facts. |
| delta-raw.L07 | US-057-AC4 | historical-owner-current-authority: Historical owner differs from current owner or key reused; current assignment with retained original owner alone governs. |
| delta-raw.L08 | US-057-AC4 | native-history-policy-eligibility: Admit actual historical read only under proved native policy/compute/table profile; incompatible historical column fails closed. |
| delta-raw.L09 | US-057-AC5 | cursor-cache-rebinding: Change caller/query/policy/assignment/mapping/data cut; old cursor or cache token cannot bypass fresh admission. |
| delta-raw.L10 | US-057-AC6 | derived-copy-feed-propagation: Serving copies, journals, tombstones, provenance, exports and feed checkpoints preserve declared policy and completeness. |
| delta-raw.L11 | US-057-AC7 | missing-custody-or-guard: Delete retained owner or make guard/fact provider unavailable; refuse without hidden counts or effects. |
| delta-raw.L12 | US-057-AC8 | activation-rollback: Fail policy/mapping migration midway; prior protection survives, and downgrade never broadens ordinary access. |
| delta-raw.L13 | US-057-AC3 | authority-change-exhaustiveness: Assignment activation, role changes, subject remap and relevant attributes advance authority and invalidate stale decisions. |
| delta-raw.L14 | US-057-AC7 | effective-date-boundary: Trusted clock crosses assignment expiry during operation; lease/coordination profile preserves declared cut or refuses. |
| delta-raw.P01 | US-056-AC7 | withhold-view-carrier: `withheld` maps only to a protected view omitting the column with no base-table SELECT; a NULL-returning mask is observed indistinguishable from canonical NULL at an ordinary identity and that mapping is refused without weakening. |
| delta-raw.P02 | US-056-AC6 | protection-transform-correspondence: Generated column-mask UDFs disclose per-actor values matching the independent oracle byte-exact; non-castable output domains refuse generation; UDF text, owner and `USING COLUMNS` pinned. |
| delta-raw.P03 | US-056-AC6 | disclosure-profile-query-use: Predicates/joins/aggregates over masked columns observed at an ordinary identity (masked vs original evaluation, EXPLAIN, error paths) and compared to effective retained properties; `prohibited` on a selectable masked column refuses or withholds; no claim that Unity Catalog enforces `prohibited`. |
| delta-raw.P04 | US-057-AC1 | native-write-surface-unsupported: INSERT of a row invisible to the writer's filter succeeds natively, so write obligations report `unsupported`; ordinary identities hold no direct write grant; positive writes flow only through the separately receipted consumer-owned write path. |
| delta-raw.P07 | US-056-AC7 | native-policy-archive: ABAC policy DDL preserved as archive, uninterpreted; `EXCEPT` principals, owners/`MANAGE` holders and metastore admins inventoried as privileged exclusions; interpretation refuses; profile unchanged. |
| delta-raw.P08 | US-056-AC6 | tokenization-stand-in: Deterministic tokens stored; vault in an excluded schema; detokenize unreachable by ordinary identities; token joins match the oracle; time-travel/clone/share propagation observed and declared; obligations `unverified`. |

The plan's slice labels delta-raw.P05 (time travel/clone/share) and delta-raw.P06 (path/Delta API/Iceberg REST/Unity REST/dedicated-compute matrix) are not case IDs; they execute as procedural expansions of delta-raw.L08/L10 and delta-raw.B04 below. All P-cases are `required` and `not-run` with no command (added 2026-10-14; see §Field-protection expansion).

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

## Field-protection expansion — 2026-10-14

Owner direction (2026-10-14) applies proposal P-F of the
[field-protection plan](../../04-build/security-field-protection-plan.md)
(FEAT-008 SEC-13..15; CONTRACT-062/063 §Field protection). Six P-cases are
added above. The following obligations are owned by existing IDs and execute
as procedural expansions; no case is retired, promoted or marked accepted, and
every delta-raw case remains `not-run` until native execution at an ordinary
identity in a real Unity Catalog workspace. Local Delta/Spark without Unity
Catalog cannot exercise row filters or column masks and is not a qualification
stand-in; it may only observe Delta token propagation (a P08 subset) labeled as
such.

- **delta-raw.B04 (US-056-AC5), plan label P06.** Exercise or list as
  unavailable-not-passed each alternate surface: SQL warehouse, standard
  cluster, dedicated cluster (DBR >= 16.3 for writes), path access, Delta Lake
  API, Iceberg REST, Unity REST and Delta Sharing. Documented refusals (no
  path/Delta API/Iceberg REST/Unity REST access to filtered/masked tables) are
  safety witnesses, not positive cases.
- **delta-raw.B05/B14 (US-056-AC5).** Owners and `MANAGE` holders can drop
  filters/masks; `EXCEPT` principals, filter/mask UDF owners and metastore
  admins see unfiltered, unmasked data. Each is visible only to excluded
  identities; ordinary identities cannot reach them.
- **delta-raw.B07 (US-056-AC6).** Extend distinctness vectors so original
  null, original absence, view-omission `withheld`, each catalog transform
  output and `reversed` stay distinct on the disclosure transport, with
  `storageEffect` per field; a NULL-returning mask is the retained negative
  control (P01).
- **delta-raw.B08 (US-056-AC6).** `original-authorized` maps to a separately
  granted unmasked object; one mask per column resolves per user; predicate
  evaluation over masked versus original values is observed (P03, Q6) before
  any disclosure-profile claim.
- **delta-raw.L08 (US-057-AC4), plan label P05.** Historical reads under
  table-level row filters or column masks are `unsupported` ("Time travel isn't
  supported with table-level row filters or column masks"); the ABAC
  time-travel Beta (DBR 19+, managed Delta with catalog commits, column mapping
  on both versions, not on dedicated compute, fails closed when the policy
  column is missing) is a separate candidate with its own receipt.
- **delta-raw.L10 (US-057-AC6), plan label P05.** Deep/shallow clones and
  Delta Sharing of filtered/masked tables are refused natively; materialized
  views and streaming tables carry the refresh identity's filtered/masked data
  (not found on the inspected pages; verify at execution) so the refresh
  identity is in `EXCEPT` or the copy is declared permanently transformed; AI
  Search indexes cannot be created from such tables (a refusal, not a bypass);
  token propagation into time travel, clones and shares is declared.
- **delta-raw.L01/L02 (US-057-AC1).** Remain required positive cases. Under
  CONTRACT-063 they can pass only through the consumer-owned protected write
  path (plan slice B-SFP-017: a service applying `evaluateSecurityWrite` to
  original and proposed state before `MERGE`, ordinary identities without
  direct write grants, its own receipt and actor). Q10 accepted 2026-10-14;
  until that path passes, no `qualified` statement is published for
  `unity-delta-raw` and read-side evidence is reported as `candidate` or
  `unsupported`.

Open questions Q6 (operator semantics over masked columns), Q7 (UDF execution
authority), Q8 (subject identity stability) and Q9 (ABAC release status) are
decided by execution at the admitted workspace, not assumed.


### B08 query-use binding controls

Exercise predicate/order/group/join/aggregate with a protected field omitted from
the output projection. Retain positive exact original-action binding and negative
controls for a caller-supplied unrelated granted action, changed binding sources,
withholding, missing separate grants, forbids, empty prohibited selections and
incomplete dependencies used only by the original action. Admission must precede
native filtering/aggregation; evaluating permissions after a raw predicate has
already filtered rows is insufficient. Conditional logical simulation and a
self-asserted action label do not close this native case.

### Original-value carrier isolation regression protocol — 2026-10-09

Required expansion of delta-raw.B08 (US-056-AC6), delta-raw.B10 (US-056-AC8) and delta-raw.B15 (US-056-AC7). The retained PostgreSQL raw spike counterexample `original-use-hidden-carrier-counterexample.json` demonstrates that protecting a root relation alone can let hidden malformed carriers affect eligible results. Its fix and 252 observations are motivation, not acceptance evidence for this backend.

1. Establish actual ordinary-subject outputs for predicate, order, group, join and aggregate, including populated and empty-result variants; separately bind original-value action authority. Retain rows and client diagnostics, including success with an empty authorized set.
2. Change only an unreadable resource's carrier to null, text, fractional numeric, overflow and structured object values outside the selected native field domain. For every operator and empty variant require identical eligible outputs and no new ordinary diagnostic payload. Restore exact carrier bytes. Compare successful request/error outcomes as well as returned rows; a generic failure is observable interference.
3. Apply the same changes to an eligible required carrier. Require whole-request refusal before any row, aggregate, page or success receipt, including empty application results. Repeat with a missing carrier and duplicated selected carrier projection; restore each state and prove successful recovery.
4. Test same native key bytes in another logical type/home and reversed or wrong-type endpoint bindings. Required source completeness must consider exactly the eligible selected type population. A hidden/ineligible carrier or carrier of a different type cannot satisfy an eligible dependency or cause its refusal.
5. Inspect native policy/barrier metadata for every protected carrier before evaluating stored values, including child and retained homes. Use an assessor's inventory rather than installer declarations. Denying direct SELECT or filtering the root relation does not establish evaluation isolation. Retain native execution-plan evidence where available, while treating observed query behavior as the decisive regression result.
6. Change carrier policy, original routine, type selection or source mapping in a disposable installation. Public admission must detect drift or retain a demonstrated immutable dependency cut. Retain the prior installation and show migration failure does not broaden access. Link these results to delta-raw.B11/B12 and L12; fixed installer edits do not qualify current-source custody.
7. Use explicit barriers to mutate carrier/authority after admission and before final release. Require the declared stable source/authority cut, coordinated drain or refusal without partial output. Link to delta-raw.L03/L06/L11; a sequential fixed-statement test does not qualify concurrent final-release behavior.
8. Retain source pins, selected field/input/result domains and the full ordinary driver result/error path. Signed64 input extrema and widened aggregate results must remain exact native/lexical values. Do not route stored identities or numeric values through JS Number. Compare unmasked input authorization separately from disclosed output semantics.

Backend instantiation: use the exact admitted Unity Catalog compute/table tuple and original ordinary identities at SQL, direct table/path and alternative endpoint surfaces. Qualify native row filters/masks or the selected protected-view barrier empirically; PostgreSQL RLS behavior does not transfer to Delta.

No new cases or criteria are removed or marked accepted by this procedural expansion. Execute it as part of the existing required case IDs.

Formal obligation: `carrier-error-isolation-formal.json` proves conditional eligible-only carrier evaluation over two worlds; delta-raw.B08/B10/B15 must independently establish native eligibility/barrier/cardinality/scalar/cut premises. SAT unsafe evaluation is a mandatory negative-control pattern, not a passing backend receipt.

Drain proof obligation: publication-drain-formal.json gives an inductive abstract invariant. delta-raw.L03/L04/L11 must prove individual native lease custody through actual final release and all mutation participation; an application callback promise alone does not establish those premises. Include the premature-release negative control and failure/cancellation protocols.

Mandatory delta-raw.L03/L11 backend-loss control: retain a live client publication buffer, terminate only its native session, then attempt revocation acknowledgment. Native-session lock release is not buffer drain. Require separately proved publisher lease/acknowledgment or bounded refusal; exercise cleanup of live publisher versus dead owner. PostgreSQL retained native-lease-loss counterexample motivates this test without transferring results to this backend.

Publication cleanup expansion for delta-raw.L03/L11: enroll two publishers for the same ordinary actor, retain both buffers and lose their native sessions. Release one exact lease only; the sibling must still prevent revocation acknowledgment until separately proved release. Actor-wide cleanup is a mandatory negative control. The raw PostgreSQL retained counterexample supplies motivation, not acceptance evidence for this backend.

### Required publication retirement interleavings

For US-057-AC2/3/5/7, retain an enrolled ordinary repeatable-read reader after its first result is drained and attempt exact lease retirement before ending the native read lease. Retirement must refuse or wait without acknowledgment or effects; terminal state must never admit a second buffer. Also establish an older ordinary snapshot without a protected read lock, retire its enrolled lease, then attempt first protected use: restart/refusal without data is required. Cover overlapping read-committed statements independently; selecting read-committed alone does not establish freshness. Observe current lease state, native coordinator ownership, authority generation, output custody and mutation acknowledgment separately. Preserve a negative schedule and prove equivalent fencing for each actual storage backend; the raw PostgreSQL spike does not accept graph or Delta implementation cases.

For the same lifecycle criteria, test both coordinator orders with native barriers: retain retirement's exclusive guard before an older snapshot requests protected use, independently observe the blocked reader and exclusive holder, then commit retirement and require refusal without a result. Also roll back retirement after generation advancement and verify that obsolete snapshots and fresh statements cannot self-repair or emit data; recovery must use the selected explicit coordinated protocol. Separately inventory transactional and non-transactional state, retained lease custody and issuer authority. These schedules remain required on actual graph/Delta backends even when the raw PostgreSQL authored spike passes.

Publication enrollment tests must attempt independent changes to the enrolled identifier, original caller, native backend identity and backend incarnation before release. Each must refuse without changing the binding or eligibility. Wrong-incarnation controls must preserve immutable enrollment: use an initially invalid distinct enrollment and separately admitted replacement, with retained terminal history. Inventory insertion provenance and privileged trigger/table replacement separately; immutable ordinary UPDATE behavior alone does not qualify the issuer or complete installation.

Typed original-carrier completeness must be evaluated by exact selected type plus exact native key. Seed a selected-type root with a missing carrier and a sibling-type carrier carrying the same local key: admission must refuse. Then vary sibling cardinality and malformed required fields while holding selected-type facts fixed; admission must remain unchanged. Test selected-type duplication independently. Retain compiler-owned selectors, installed native correspondence and the complete eligible population before application filtering. The quantified typed-source-completeness algebra is conditional evidence; each backend must independently establish its premises.
