# R2 amendment003 — valid immediate-FK initialization and global admission

Proposed source-only correction to sealed proposal001 and amendment002, not adopted. Root's
R2-F1 and R2-F2 are valid source contradictions. No SQL was run to establish
them. The original packet, failures and external provenance supplements remain
immutable. Amendment002's active-first generation1 order and claim that no
immediate active-carrier FK exists are WRONG and withdrawn. Both exact complete
DDLs contain lineages_active_carrier_fk; it remains intact and immediate here.
Only the explicit rules below supersede the matching001/002 rules;
every other complete record, authority, value codec, limit and obligation stays.
provider-ddl.sql and guard-renderer.md here are COMPLETE replacement files.

## F1 — exact construction and provisional restore order

There is NO new committed pending lineage/carrier wire state. Existing
active|retired states remain exact. An active native row in an uncommitted
transaction is not an authenticated installed carrier or published capability.
All below requires the actual original request/context/reservation/core-pending
handle/effect, immutable native session and SAME held G11 ingress exclusion.
New ordinary entry is fenced and prior ordinary work drained before maintenance;
the private connection exposes no author callback or general SQL execution.

Every affected provider first locks its provider_admission singleton, then all
existing affected lineages sorted by canonical UUID, carrier/generation rows
sorted by token, archive lifecycle rows sorted by archive, then permit/member
rows. Multi-table atomic groups collect/lock the full set before mutation. No
provider method may first lock a lineage then acquire the singleton. A native
guard re-lock of its already held rows is permitted. Business/dependency locks
then follow the existing complete graph order. Actual lock/deadlock timeout,
cancellation and full-group rollback remain finite original signed semantics;
serialization is not permission to extend/reset a deadline.

For an originally unenrolled generation1, in ONE original enrollment/business
TX under that exclusion: verify original source/native object and population;
reserve the provider's full fresh-issuance debit described under F2. Where
existing rows need initial hidden UUID/revision assignment, perform only the
fixed original G04 enrollment assignment under the original business table
lock BEFORE installing the new identity trigger. No author writes are allowed
in that interval. Create/verify the complete native business/hidden columns,
Key/check, guard function and trigger with the already reserved genuine new
token/lineage ID. Trigger creation does not execute a business INSERT/UPDATE.
Capture its actual native birth descriptor before inserting metadata that
references that descriptor. The birth receipt projection binds actual objects,
source, target and TX, not the eventual lineage/carrier record digest; it must
not recursively hash the record that references it. It remains unconfirmed
until the real original native/external COMMIT sequence; no cap is returned yet.

Insert immutable lineage record with native state='retired', active_table_token
NULL, generation_count=1, issued_count=N, revision=1. This is an uncommitted
construction sentinel, never an acknowledged historical retirement or public
restore selection; no archive/retirement receipt is fabricated. It satisfies
the active/null CHECK, the immediate active-carrier FK (NULL), count bounds and
all other immediate constraints before any carrier exists. Next insert the
new active row_tables with issued_count=N, then the new active generation1
carrier_generations with parent fields NULL. Its immediate lineage and
row_tables FKs now resolve, and generation1 parent checks hold. Carrier state
active does not bypass the still-retired lineage guard during construction.

Next insert the exact initial lineage/per-carrier issued ledger rows from the
actual protected assigned UUID set, so both ledger FKs also resolve. Provider
debit, lineage count and carrier count equal these sets. Only now perform
the following fixed initialization activation, checking exactly ONE affected
row; parameters are the actual original prepared lineage and new token:

```sql
UPDATE originals.lineages
 SET state='active',active_table_token=$2::pg_catalog.uuid,
     revision=revision OPERATOR(pg_catalog.+) 1
 WHERE lineage_id=$1::pg_catalog.uuid AND state='retired'
   AND active_table_token IS NULL AND generation_count=1 AND revision=1;
```

The target token already exists in carrier_generations, so the retained
immediate active-carrier FK resolves. Original native checks additionally
require that token's SAME lineage, generation1 and complete actual birth,
row_tables and ledger correspondence; the FK alone does not establish them.
The first complete active observation is EXACT generation_count1/revision2;
there is no separate committed revision1/retired observation. Initial activation
increments revision ONCE and does NOT increment generation_count. Later
ordinary issuance increments revision as originally specified. This initialization
operation is distinct from restore's old-generation+1/old-revision+1 operation
below; neither is a general caller API. Initial assignment is NOT additionally
replayed through the ordinary INSERT guard. Empty construction has N=0, zero
provider debit and no ledger rows, but still final lineage revision2. Fresh
seed/application INSERTs after complete initialization DO use the ordinary guard.

The immutable Lineage record's originalBirthReceiptDigest is the actual original
physical birth descriptor already specified, not a retirement receipt and not
a claim that transient state was committed. It never changes at activation.
The original native enrollment outcome/receipt's first complete lineage
observation is active, SAME token, generation1/revision2, issuedCount=N and the
exact immutable recordDigest. Any enrollment receipt claiming retired/null or
revision1 as a successful final state refuses, including N=0. The candidate
birth/enrollment observations become confirmed only through actual native
COMMIT and original external custody confirmation; neither a construction
sentinel nor SQL row count is a capability. No retirement event, archive or
removal history is fabricated for this temporary state. Provider admission
debit is N (zero when empty); all initial carrier/lineage ledgers and exact
after-native birth/pointer/count bijections must hold at that SAME complete
boundary. This does not widen any old G04 enrollment receipt profile.

All short construction intervals remain under original native maintenance,
same-TX exclusion and complete result validation; no incomplete provider witness,
ordinary DML, receipt, capability or COMMIT is permitted. Before any guarded
business DML or successful outcome, require all records/FKs, pointer, birth,
counts and ledger bijections exact. Rollback removes every new record/object/
debit. No committed partial construction or constraint deferral/removal.

Required source-only sequence-control obligation (NOT executed): walk the
complete replacement DDL against each step below, reject active-first002,
and show every immediate FK/CHECK resolves without deferral. This accompanies,
and does not substitute for, later actual native empty/populated/cut controls.

| Construction boundary | Lineage | Available referenced rows | Immediate constraints |
| --- | --- | --- | --- |
| Before metadata | absent | no carrier metadata | no pointer or child FK exists |
| Insert lineage | retired/null/gen1/rev1/countN | lineage only | active/null CHECK valid; pointer FK NULL; count/cap bounds valid |
| Insert row_tables | unchanged | row_tables token exists | row_tables keys/count/record checks valid |
| Insert generation | unchanged | lineage and row_tables both exist | both immediate FKs resolve; generation1 parents NULL |
| Insert both ledgers | unchanged | lineage, row_tables, generation exist | lineage-issued lineage/first-token FKs and per-carrier FK resolve |
| Guarded activation | active/token/gen1/rev2/countN | SAME token generation row exists | active/null CHECK and immediate pointer FK valid; native SAME lineage/birth/ledger checks complete |

Every positive boundary also requires the exact source capacities, UUID/record
identity, unique binding/physical generation and no pre-existing contradictory
rows; NULL validities do not excuse any other CHECK or native correspondence.

For restore, the acknowledged prior reservation may leave whole_lifecycle in
restore-pending, but the committed source lineage is still retired, pointer
null, with its original committed generation prefix. The effect TX does:

1. Acquire locks above and validate SAME original reservation, exact retired
   lineage/pointer/null state, old retired row_tables/generation, archive live
   population/source proof, current policy/holds, absent target, capacity,
   complete atomic graph and original native pending effect authority.
2. Create/verify NEW actual empty business carrier and fixed guard/hidden
   objects from trusted renderer; reserve new token/physicalGeneration and
   generation=old+1. Observe its actual unconfirmed birth as above. Insert NEW
   active row_tables with issued_count0, then NEW active carrier_generations
   referencing the EXISTING lineage and OLD parent token/archive. No old row
   is reactivated, rewritten or adopted. Native lineage revision must have
   remaining space and generation_count<4096.
3. BEFORE permit installation or any value INSERT, perform exactly one guarded
   native update of that locked lineage from state retired/active pointer null/
   exact old revision+generation to active/new token/generation+1/revision+1.
   Check exactly one row changed. This is provisional SAME-TX activation,
   not an acknowledged state transition or an ordinary access capability.
   The immutable lineage record and issued_count remain unchanged. Native
   row_tables/generation are now active, so the unchanged strict guard checks
   succeed for the genuine NEW token and actual TG_RELID.

   Fixed activation SQL, parameters ONLY the actual original prepared lineage,
   new token, prior generation and prior revision after the locked checks above:

   ```sql
   UPDATE originals.lineages
    SET state='active',active_table_token=$2::pg_catalog.uuid,
        generation_count=generation_count OPERATOR(pg_catalog.+) 1,
        revision=revision OPERATOR(pg_catalog.+) 1
    WHERE lineage_id=$1::pg_catalog.uuid AND state='retired'
      AND active_table_token IS NULL
      AND generation_count=$3::pg_catalog.int8 AND generation_count<4096
      AND revision=$4::pg_catalog.int8 AND revision<9007199254740991;
   ```

   Exactly one affected row is required; this SQL is no standalone public API
   or caller-authorized activation. Original source/native carrier and current
   policy/pending/permit guards remain conjunctive.
4. Install only the exact same-backend/xid/original-request restore permit and
   members from the protected archive. Dispatch only fixed prepared restore
   INSERT of complete UUID/revision/native values. The guard requires actual
   membership and pre-existing lineage-issued IDs, attaches the new carrier
   ledger/count, and does NOT issue/debit global or lineage IDs. Any ordinary
   branch/callback/extra statement while this permit lives is forbidden by the
   original native effect-operation guard. No author data fills/defaults/seeds.
5. Verify full original set/value proof and all current after constraints and
   dependency activation; remove members then permit, prove zero committed
   permits, write lifecycle restored/new birth/outcome/progress in SAME TX.
   Do NOT repeat lineage activation or increment its revision a second time.
   Check final pointer/generation/count/ledger/native object correspondence.
   COMMIT, native confirmation, original custody/core settlement and actual
   publication retain the original001 sequence. The outer fence stays until
   the genuine final activation; same-TX grants do not release it early.

Failure/positive rollback restores the pre-effect retired lineage/pointer and
generation prefix, removes new carrier/metadata/ledger attachments, leaves
acknowledged restore-pending reservation for original recovery/abort settlement,
and preserves all earlier Field archives/holds/history. Unknown COMMIT neither
assumes rollback nor repeats creation/activation/INSERT. Read actual original
outcome: the committed branch has final active successor+restored lifecycle;
the positive-no-effect branch has original retired prefix. Any partial/mixed
committed state is corruption, never permission to repair by ad hoc writes.
Only original positive noncommit proof can authorize the next charged attempt.

## F2 — one atomic native provider-wide issuance gate

The fresh fixed provider now has20 tables, the previous19 PLUS exactly one
provider_admission. This replaces every current-footprint19 assertion in001's
provider description/descriptors/current native oracle requirement. The old
19-table proposal remains retained history, never claimed qualified. This is
still a PROPOSED new store.2 definition, not an upgrade of an installed/old
store. All old G04/G05/inventory.1 bytes/footprints remain unchanged.

Exactly ONE singleton row, singleton=true, is created by the genuine original
store creator in its same approved creation TX before any enrollment/issuance.
The PK+CHECK forbids a second key; complete native census requires exactly one.
No INSERT ON CONFLICT, IF NOT EXISTS, missing-row recreation, metadata adoption,
counter reset or ledger trimming. Initial issued_count0, revision1,
max_issued_instances1000000. The descriptor and original signed creation intent
bind this exact hard cap/DDL; no new caller-selectable quota or signing scope.

Immutable record EXACT
`{profile:"umf.table-provider-admission/0.1",providerId,storeId,targetCustody,
providerDefinitionDigest,maxIssuedInstances}`; IDs/custody are the genuine
original store creation, maxIssuedInstances literal1000000. Native duplicates
must match complete original record. Separate closed observation EXACT
`{profile:"umf.table-provider-admission-observation/0.1",recordDigest,
issuedCount,maxIssuedInstances,revision}`, exact integer bounds from DDL.
record_digest=H(immutable record), never a mutable JSON checksum. Observation
is data, not authority. No hidden native RFC8785 function is assumed.

At every committed verified provider boundary:
provider issued_count = SUM of ALL lineage_issued_instances rows across ALL
lineages = SUM of all lineages.issued_count, including deleted, retired,
restored, purged and speculative-reservation IDs. Counts never decrease on
business DELETE, retirement, restore, archive purge or generation change.
All corresponding rows persist; same-generation per-carrier counts/ledgers
and original lineage max capacity remain independently enforced. Global cap
is conjunctive, not a substitute for any signed original component bound.

The replacement guard first locks the singleton, then lineage/carrier rows.
Ordinary new issuance executes the shown native guarded UPDATE +1, requiring
count<immutable cap and revision<safe maximum, then creates one lineage ID
and one carrier reservation in the SAME business TX/statement. Every update
checks exactly one affected row, all ledgers/counters/UUID uniqueness/caps and
business effects succeed together or roll back together. Missing singleton or
capacity fails closed; a preflight SUM, process-local count or JSON number is
not admission. Two concurrent lineages serialize on this native row: at cap-1
only one new committed issuance can succeed; the waiter observes the committed
full count or succeeds if the first transaction actually aborts. Restore takes
the lock but debits ZERO because the original lineage UUIDs already occupy it.
UPDATE only takes the lock and preserves count/revision, besides its separate
native business revision update. Read-only reobservation/recovery does not debit.

For genuine original existing-population enrollment only, N is the exact
protected native population requiring NEW lineage-issued UUIDs, computed under
the original native business lock and all original caps. N is an exact int8
0..1000000, not caller data. With singleton already locked, for N>0 execute
the fixed native update (trusted native bound parameter N only):

```sql
UPDATE originals.provider_admission
 SET issued_count=issued_count OPERATOR(pg_catalog.+) $1::pg_catalog.int8,
     revision=revision OPERATOR(pg_catalog.+) 1
 WHERE singleton=true AND $1::pg_catalog.int8>0
   AND $1::pg_catalog.int8<=1000000
   AND $1::pg_catalog.int8<=max_issued_instances OPERATOR(pg_catalog.-) issued_count
   AND revision<9007199254740991;
```

Require exactly one row. N=0 performs no counter update. The exact N distinct
new UUID assignments and both ledgers must materialize in the SAME TX as that
debit, with no later ordinary guard re-debit. Original enrollment receipt and
complete native after census prove the bijection before COMMIT. If any step
fails, full TX rolls back this debit. No caller can use this bulk operation or
manufacture a restore permit to evade admission. Per-request signed/native
row/time/byte limits still apply; large enrollment is not implied admitted.

The table/record/column/PK/CHECK/native owner/ACL/RI/TOAST/default-privilege closure
is protected exactly like the19 previous tables: original controller owns it;
ordinary roles have no schema/table/function grants, no effective membership,
SET/INHERIT or maintenance callback permitting direct mutation. The trigger's
fixed SECURITY DEFINER admission update is its sole ordinary-write route, bound
to the actual business TG_RELID/token/lineage. Only actual original creator and
fixed native enrollment code have additional qualified insertion/bulk paths.
Native metadata validation treats any missing/extra/contradictory singleton,
record/scalar/counter/ledger or unknown ACL/object as corruption. No global
counter statement commits separately from the corresponding issuance effects.

An aborted transaction may make its uncommitted counter increment disappear;
this is not a decrement/refund of a committed UUID reservation. Original outer
attempt time charges remain spent as before. Unknown business COMMIT must be
settled against SAME native/original outcome/counter/ledger state; never infer
an additional debit/refund from a retry or status query. Committed ON CONFLICT
speculative reservations remain in both ledgers and provider count even when
no business row is inserted, preserving original001 semantics.

The new exact definition descriptor hashes replacement20-table DDL and guard,
these rules and new acceptance cases, plus complete original001 definitions.
All new actual store creation/config/context/policy/native observers must bind
that descriptor before effects; old prototype descriptor is not accepted for
this provider. No migration, authority, durability, concurrency or native result
is established by this design amendment.
