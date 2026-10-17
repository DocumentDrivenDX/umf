# Small Delta native receipt capability-discovery proposal

STATUS: SOURCE PREPARATION ONLY. Warehouse remains STOPPED; runner default is plan-only and made zero CLI/cloud/auth calls. Root must approve exact target, statements, transport and limits before execution. R5 AST parser remains unapplied and held separately.

## Target and ownership

- Existing Databricks CLI profile `aidev-cus`, exact existing warehouse `d4b8eb5b4d6e34b8`, expected workspace hostname `adb-7405607548213398.18.azuredatabricks.net`.
- Runner NEVER starts compute. It requires RUNNING only after separately explicit approval/start. Finally it requests STOP on that exact warehouse and polls <=120 seconds; inability to confirm stop is a hard failed attempt.
- Existing qualified development namespace only: `client_dev.umf_sdk_atomic_cf40c0c7aa74`. Missing namespace refuses; no schema/catalog/principal creation.
- Three fresh exact tables: `receipt_discovery_20261017_objects`, `_receipts`, `_empty`; refuse preexisting names, never adopt them. Two seed rows. Explicit native fixture CDF=false/catalogManaged/Serializable properties; no empty-commit configuration guessing or writes.
- Cleanup rechecks exact original UUID before dropping only tables this attempt created. Submission uncertainty forbids further SQL/cleanup assumptions: stop warehouse, retain pending exact-owned resources for separately reviewed settlement. No automatic action retry or false noncommit.

## Cases and original authority

1. Preserved statement009 unchanged except original two fully qualified fixture identifiers relocated: UPDATE objects key1 plus original INSERT SELECT fixture marker. Two changed native tables.
2. Preserved statement015 similarly relocated: UPDATE value=value on key1 plus original noop marker INSERT; record physical commit metadata without falsely calling this a skipped business write.
3. Zero-selected predicate id=-1 on populated objects.
4. All absent keys id IN(-10,-11).
5. Empty table id=1.

Cases3–5 use the preserved original-owner DECLARE/SET VAR pre/post image shape plus a final SELECT. They are exploratory native syntax, NOT a compiled/admitted action. Missing/refused final SELECT result remains an explicit same-unit output prerequisite. No fallback outside-transaction recomputation, marker ledger, row outside each case's declared predicate, DDL-forced commit or semantic waiver is permitted.

For1–2, a distinct later native writer commits after original ACK but BEFORE history consumption. Its different StatementId is retained, so receipt discovery cannot accidentally select that later head. Original fixture marker rows are retrieved without recomputation. These are explicitly declared fixture effects inherited from009/015, not an invented production receipt store.

For each declared DML component, DESCRIBE DETAIL before and after bounded DESCRIBE HISTORY retains exact UUID observations; exact historical rows must match original native StatementId, native txnId and canonical version. Raw native responses remain unchanged. No missing component gets another writer's head/prior version. UUID observations do NOT qualify a concurrent DDL/dependency fence; actual receipt component domain and identity-fence capability remain unresolved owner prerequisites.

## Bounds and failure semantics

Maximum3newtables,2seedrows,50SQL submissions including cleanup,20history rows/table,60seconds/statement and900seconds discovery work. Cleanup SQL has a separate60second budget, explicit cancellation10seconds, and final warehouse stop120seconds. All connect/read/poll timeouts consume their remaining phase budget. Expected normal sequence uses48SQL statements. Query timeouts/cancel/transport loss never prove noncommit. Any committing response uncertainty remains Indeterminate; no automatic statement retry or history-based lost-ACK reconciliation. Native terminal refusal is retained as such; errors are not parsed into action outcomes. No independent actor/group/SCIM authorization is claimed from using the prior actor.

## Direct transport candidate (final execution hold)

SQL statement POST/GET/cancel use one stdlib HTTPSConnection on the exact verified host with ordinary TLS certificate/hostname verification, no redirects and no retry loop. A token is obtained in memory from the existing CLI auth provider; no credential is logged or saved. Native raw response bytes and SHA are retained separately from strict JSON decoding. Connect, headers and each bounded read consume the original remaining statement/overall deadline; cancellation and stop have their own explicit budgets. The retained verified socket supports Connection:close responses. CLI is used only for its original auth provider and idempotent warehouse GET/STOP.

The plan still has transportReviewRequired=true and execution hard-refuses before any native call. Root must review final runner/plan hashes and approve clearing that hold and starting the dedicated warehouse. Pure controls replace all CLI and socket calls, including synthetic refusal/uncertainty/cleanup lifecycles; none qualifies native behavior.

## Evidence disposition

The independent UMF contract review is committed separately at996f6396. Earlier audit/prototype/native cleanup-failed cohort remain unchanged. This runner never issues a production receipt or sets qualification/nativeAuthority true. Successful observations would motivate original-owner profile work and additional concurrency/retention/identity/frame witnesses, not enable the shipped managed mutation refusal. SCIM403 and cloud permission gates persist until independently resolved.
