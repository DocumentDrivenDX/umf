# Durable original data-transaction claim prerequisite

CONTRACT-063 current-authority/lifecycle preparation; supports US-057-AC5 binding
custody prerequisites only. No required backend case is bound or promoted. This
packet does not prove current authority, one execution, a protected selector,
finalizer or seal. The full required gate remains40 accepted/118 unbound.

The actual native bridge is
`tests/security/native/pg18-preparation-data-claim.sql`. It installs a private
UMF guard home alongside the exact Truss e79d67df program registration and
pre-RR anchor ABI. It does not modify Truss, grant ordinary execution or mint a
permit. New guard-home source/ACL/DDL custody must be independently included in
a future qualified production installation; existing Truss source cuts do not
implicitly qualify these extra objects. SQL is a native spike, not a generated
production storage-model contract or an admitted public core extension.

E is the excluded control issuer; C is the original ordinary READ COMMITTED
coordinator; D is the original ordinary data transaction. These names distinguish
C from the earlier anchor's own control issuer. Exact API:

- E `umf_security.claim_preparation_data(int4 anchor, uuid nonce, xid8 claimed_D)`
  returns a **pending** UUID identity. E must independently COMMIT. The function
  validates native original anchor, peer fullxids/incarnations, committed same-store
  enrolled program and exact store/program bytes. It stores the full D xid8,
  physical/backend/transaction identity, original C fullxid/incarnation, exact
  program/store/receipt and E issuer xid. Unique anchor plus immutable trigger
  permits insertion or exact active-D retry, never replacement. Anchor row
  FOR UPDATE NOWAIT serializes participating E callers without waiting.
- C `umf_security.require_preparation_data_claim(int4 anchor, uuid nonce)`
  returns `(claim_id uuid, data_pid int4, data_xid xid8, program_id int8)` only
  from a fresh committed claim, original C transaction and still-live exact D.
  It retains a row SHARE lock, but returns identity metadata only.

The claim binds the first **durably issued** D. It cannot prove no earlier
unadmitted D transaction ever ran after anchor creation. An E return is not
commit acknowledgment. E rollback leaves no claim; missing/unknown commit refuses
until original C's fresh committed-row comparison establishes the outcome. D can
end between E's final observation and E COMMIT: that permanently burns the anchor,
then C refuses. No automatic deletion, successor attachment or retry reissue may
reset the claim. Exact same-D retries/savepoint rollback remain the same claim;
one execution per D and finalizer/seal lifecycle are still separate obligations.

D begins RR and assigns its fullxid before E commits. Its original snapshot
cannot see the later claim. C consumes the new row under RC; a future qualified
current-source/Subject/action/owner guard must then bind that exact fullxid tuple
through native mint and D checks. This bridge cannot supply those guards. E can
observe native login/backend state, not D's effective SET ROLE/isolation: the
future D native checker must enforce writable RR/no SET ROLE independently.
Program commit comparison uses RC-visible immutable row plus issuer distinct
from current xid, rather than requiring ancient program issuer clog history.
Newer anchor/claim native issuer status and original coordinator still require
committed/in-progress observations within the admitted recent context.

The actual Python fixture invokes the existing Truss products exporter, original
Weft MutationCompiler, public catalog/store setup, program enrollment, committed
anchor and ordinary products_person connections on pgserver-pg18 18.6.1 / server
18.6. Selected source pins, exact native Weft/Postgres/Python binaries and original
model are retained before/after; this is not a hermetic dependency/source closure.
No independent fake store or invented program substitutes for that workflow.

32 native observations pass, including absent/pending/rolled-back E claims,
forged full epoch, unknown program/nonce, competing exact/conflicting E NOWAIT,
committed exact retry, unchanged old D snapshot/visibility, same-D savepoint,
D rollback/same-PID successor refusal, D ending before E COMMIT (burned anchor),
C rollback/same-PID successor refusal and immutable UPDATE/DELETE/TRUNCATE.
Ordinary direct table and private helper calls deny42501. Diagnostic metadata
wrappers are fixture-only, never a production permission path. The original
Truss identity-only D resolver actually continues to resolve the program for a
same-PID successor D; the new claim refuses reuse. This demonstrates why that
resolver cannot serve as the transaction-bound native guard.

LocalPostgres stops before temporary installation cleanup. The original native
postmaster PID is observed from its actual data_directory/postmaster.pid;
ProcessLookupError from signal0 establishes process absence, and the temporary
installation is absent before receipt publication. Generic failures do not
establish cleanup. SQLSTATE comparison is exact; the retained concurrency oracle
failure expected55000 where prior NOWAIT correctly returned55P03. That contention
control does not independently establish rejection of a conflicting xid.

Nine independently replayable Z3 queries retain7 UNSAT/2 SAT: serial first-claim
uniqueness, immutability, D/C successor refusal, pending/dead-D refusal and old
snapshot ordering; SAT shows identity without permission and unsafe rollback
claim deletion allowing reattachment. The formulas assume participating issuer
serialization and independent immutable E commit. They are not a SQL refinement
theorem; actual peer/role/snapshot behavior requires the separate native evidence.
All required backend cases, source/current-authority and protected consumers
remain open, and the security goal remains active.
