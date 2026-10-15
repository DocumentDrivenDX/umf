# PostgreSQL 18 fixed write-mask profile: design review

The proposed fixed native profile can exercise the full unchanged P04 assertion. It need not become a general policy compiler or admit catalog providers. No implementation or case acceptance is established by this review. The native profile must reject source outside its exact supported literal/equality, subject-only policy and field/action mappings.

## Required correction: no-op equality oracle

A masked or withheld caller with ordinary update authority can guess the hidden amount. If the routine returns acknowledgment for an equal value (no changed Field) but raises42501 for a different value, its result distinguishes the canonical value. Existing logical write guards intentionally apply Field guards only to actual changes; a no-op still requires its object action. Do not silently change that logical contract.

The native entry is an explicit amount-assignment command. Require normal object permission, amount Field permission, and effective original-read OR exact declared-and-granted amount-bound blind permission for every such intent. Only then compare values to avoid unnecessary DML. Retain separate logical/no-op and stricter native-intent expectations; do not claim unconditional output parity. Test successive wrong and correct guesses under one masked session and one withheld session, including NULL. Both must refuse alike without effects. Positive original/blind callers may acknowledge identical values.

## Required native freshness and identity boundary

Select READ COMMITTED, read-write execution explicitly. The ordinary client must actually authenticate over TCP with SCRAM; use original SESSION_USER enrollment, never a supplied actor or permit Boolean. Reject missing/ambiguous enrollment and predicates that are not TRUE. An IF NOT nullableBoolean check is insufficient because NULL can skip the refusal branch. Require a complete unique mapping and exact nonnullable typed flags/read class or explicit refusal.

Acquire the authority-fact table SHARE lock before its first read; bound waiting/NOWAIT behavior and hold through effects. The write function must be VOLATILE so its queries observe appropriate snapshots, and must execute on NULL input because NULL amount is admitted. Use a fixed pg_catalog,pg_temp path, qualified objects/operators/types, no dynamic SQL, no caller-controlled policy/field/action names, and generic failures without raw row DETAIL/NOTICE. Lock the selected Resource row before comparing/writing it. Reject old RR/SERIALIZABLE and read-only caller modes rather than treating a table lock as a snapshot refresh. Inventory/source comparison and excluded administration remain premises, not continuous role/DDL closure.

## Full P04 evidence obligations

1. Preserve original assertion/covers/60-second timeout. For transformed and withheld callers, actual changed writes to0 (the mask output) and201 must be denied by both original evaluateSecurityWrite and catalog-aware guard, and refused by the ordinary native routine with unchanged complete business state. Use before values different from both proposed values.
2. Include independent normal-object and Field-grant negatives, original-read positives, declared-and-granted field-bound blind positives, missing/wrong-field blind binding and granted-but-undeclared blind negatives. Source-purpose classification is not a grant. Null transitions and exact bigint endpoints use original typed literals, not JS Number.
3. Native explicit-assignment no-op restrictions must be reported separately from intentional logical no-op admission. A fixed acknowledgment cannot include whether an actual row changed, or raw old/new values. All failed checks must preserve every business table; authorized effects may change only the selected amount.
4. Verify absent effective table/column UPDATE and raw SELECT for every ordinary actor, including inherited/PUBLIC routes and SET reachability. Direct UPDATE and direct old/new/aliased/whole-row RETURNING must produce an exact statement-level42501, zero data, and no effects.
5. Isolate the RETURNING read check: in an excluded reversible control, grant UPDATE(amount) without SELECT, prove plain constant UPDATE can execute and roll back, and prove OLD/NEW/aliased/whole-row RETURNING still fails42501 before effects. If RLS blocks the positive write, the control has not isolated SELECT protection; use an explicitly excluded controlled route and retain its exact restored state.
6. Retain actual removed-read-guard overwrite/returned-preimage counterexample and exact restored source/ACL/inventory. Do not let a later unrelated error count as detecting the removed guard. Also isolate normal/Field/blind-map weakenings, stale snapshot refusal, and malformed/duplicate/unknown supported-source refusal.

## Source/oracle correspondence

Retain the full original authored policy, core/ontology/profile source, exact realm/action/Field identities, immutable typed Staff and Resource captures, native binding/source/ACL inventory and complete effect snapshots. The0.1 and0.2 forms must have an explicit faithful source correspondence; never silently replace rules, mask literals, Field mappings, or grants to obtain matching decisions. Freeze the fixed native supported source before installation and reject any substituted or extra rule/binding. The independent Python oracle must compute expected outcomes from separately authored facts/requests and the contract, not use either evaluator or native routine output as truth.

This subject-only permission profile has identical authority facts in before/after amount states; it does not qualify resource-dependent policy changes, general source lowering, catalog/vault writes, absence storage, physical trigger/effect closure outside the inventory, live role/DDL lifecycle, or whole backend readiness. Store SQL NULL as a present nullable amount; do not relabel it as absent.

## PostgreSQL reference checks

PostgreSQL18 supports explicit OLD/NEW and renamed RETURNING rows; referenced columns require SELECT privilege independently of the UPDATE grant. [UPDATE documentation](https://www.postgresql.org/docs/18/sql-update.html).

VOLATILE procedural functions take fresh snapshots for their executed queries; this does not make an inherited repeatable-read transaction current. [Function volatility](https://www.postgresql.org/docs/18/xfunc-volatility.html).

SHARE conflicts with ordinary RowExclusive writers; transaction/savepoint settlement controls lock lifetime. [Explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html).
