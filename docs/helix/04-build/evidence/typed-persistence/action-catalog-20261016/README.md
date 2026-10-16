# Non-temporal action ABI, catalog freshness and PostgreSQL export evidence

Governing scope: CONTRACT-068, CONTRACT-071–073; TD/STP-083 and TD/STP-085;
[typed persistence implementation plan](../../../typed-persistence-design.md).
[Execution record](integration/execution.json) pins source, installed wheel,
prerequisite interfaces and retained commands. Full Typed SDK acceptance is OPEN.
Temporal qualification is HELD.

Generated actions now retain the exact original document digest, core/module/action
identity, declaration pointer and initial tx/1 invocation profile. Synchronous
clients validate raw model graphs, omit MISSING inputs, distinguish replay-capable
executors, and retain complete original result/request text, optional original
transport bytes and opaque host recovery custody through typed outcomes and
failures. These are executor-protocol tests; no native action or engine execution
claim follows from them. Existing original-result JSON strings remain immutable;
a decoded view is a fresh copy. No recovery token or authority is minted.

Generated model metadata pins stage-one inputDigest and runtime ABI. Reviewed
catalog build/load compares participating generated types and the installed runtime;
changed generations refuse with CATALOG_STALE before connection access. Standalone
reviewed models retain their explicitly separate source-free usage. The complete
stage-two catalog CLI and generated query module remain a separate missing surface.

PostgreSQL exports use existing compiled keyset programs inside one REPEATABLE READ
READ ONLY transaction. max_rows is explicit, every page keeps its compiled bound
and deadline, and callers close abandoned iterators. The native witness changes a
row through an independent connection between pages and proves the original
snapshot remains visible; it also proves early-close cleanup and host-transaction
refusal. No runtime SQL lowering, connection creation or business writes are added.

The installed-wheel proof runs105 Python tests and83 public schema-load/instance/
codec E2E checks on each pinned Python3.11.17/3.14.8. The15 compiler/native tests
run without skips against PostgreSQL18.6/psycopg3.3.3 and the exact frozen local
Weft raw-read wheel. All three pinned checkers accept positives and reject24
selected misuse files; the reporting helper retains its existing basic Pyright
mode. Chromium153 checks15 cases twice, with no external requests. Earlier
receipts remain intact; failed attempts and final source pins are in this packet.

Native action/bulk/search lowering, complete catalog publication, async clients,
per-action typed Key unions and the engine/managed backend acceptance lanes remain
unimplemented or unqualified as enumerated in execution.json. The inspected Weft
owner port exposes raw reads, not a native action/bulk program. Truss's inspected
Python action gateway explicitly supplies registration/value admission without an
invoke API. These facts are not substituted with a mock, a SQL fallback, or an
acceptance promotion.
