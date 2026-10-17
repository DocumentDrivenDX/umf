# Installed aggregate qualification

The final r6f campaign passes 28 named checks on PostgreSQL 18.6, including
actual generated public CLI generation and drift checking, original compiler
refusals, exact SUM/AVG scales 0/1/1000, positive and negative tie rounding,
near-half values, empty/all-NULL groups, sums exceeding int64, negative floor
buckets, distinct Unicode identity and asynchronous reads. The fixture schema
is removed and the owned server stopped. Temporal qualification remains HELD.

[Native receipt](fixture/aggregate-result.json) retains start/end source,
generated package and installed runtime hashes. [Campaign receipt](result.json)
retains process outcomes and server teardown. The tested SDK wheel SHA256 is
08faf11e3620a10dddc57186682f5d812c7ba13fa00945f906afeeb01004fc5a;
[installed correspondence](sdk-r6f-byte-correspondence.json) verifies all 37
wheel payloads against the installed and tested source bytes.
[Installed static checks](typing-results.json) pass all three pinned checkers
and their exact 45 negative files. These receipts qualify the tested aggregate
subset, not other compiler builds or managed backend acceptance.

Earlier r6d/r6e attempts remain separate working evidence: the r6d compiler
refusal harness inspected the wrong stream; an intermediate r6e receipt hook
failed after semantic execution. Neither is promoted to this final passing
receipt. The final harness preserves compiler diagnostics and fails the process
when receipt construction fails. Subsequent source changes require fresh
qualification for their affected claims. [Inventory](inventory.json) binds
the retained raw files; it is diagnostic custody, not authentication.
