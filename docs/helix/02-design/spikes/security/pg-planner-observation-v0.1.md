# PostgreSQL planner diagnostics and private authorization facts

Draft SPIKE-010 annex under CONTRACT-062/063 and STP-056. Traces original
pg-raw.B10 and US-056-AC8. This extends the physical privacy design; it does not
admit a backend profile or change any of the132 required cases.

## Observations belong to the physical policy boundary

The existing PostgreSQL17.9 deny-first experimental candidate revokes ordinary
catalog/table reads and catalog routine execution, publishing authorized rows
through one fixed SECURITY DEFINER routine. Ordinary SCRAM users can still set
client_min_messages=debug1 and debug_print_plan/debug_print_parse/
debug_print_rewritten=on. The native client then receives internal relation plans
on stderr. Catalog ACL closure alone does not close this diagnostic channel.

Actual evidence identifies the private Assignment relation by independently
captured native OID, not by a table-name substring. Adding1000 unrelated Staff
and active Assignment-to-D rows changes client-visible plan structure/estimate
vectors for Alice, Bob and outsider while their authored authorized results stay
unchanged. The vector does not represent an exact Assignment cardinality oracle;
it demonstrates dependence on a hidden population.

For two states differing only in policy-irrelevant private facts, equality of
ordinary authorized data is insufficient: the declared observation profile must
also require equality of its diagnostic trace. Enumerate the observable channels
explicitly. These tests cover client stdout/stderr and planner/parse/rewrite
traces, not general timing, resource use, asynchronous notifications, every error
path or all extensions. Excluded installer/assessor observations are distinct.

## Experimental mitigation and decisive controls

The outer secured routine sets all three debug_print settings to off in its own
proconfig, alongside fixed search_path=pg_catalog. Its body executes with those
settings even when caller settings are on. The tested guarded trace retains a
nonvacuous outer plan estimate['1'] and no relation OIDs. Another1000 unrelated
private rows leave its complete decoded stderr text and authorized data unchanged.
Individually setting each routine-local flag to on restores private plan disclosure
for each ordinary actor. Every setting is restored to off in finally blocks.
Same-session SHOW after the guarded call returns on for all caller flags, proving
function-scoped restoration rather than session-wide diagnostic suppression.

An independent native inventory compares exact SQL body, owner, language,
SECURITY DEFINER/STABLE flags, argument count, PUBLIC and ordinary EXECUTE
privileges, search path and all three settings against authored expectations.
The candidate must treat these settings as physical installation semantics;
a future qualified compiler/runtime must retain them in installation/receipt
binding and detect drift before admission. This is a design requirement, not an
implemented production admission guarantee.

Actual final producer run retains94 observations and cleans up its uniquely
owned labelled container. Each decoded diagnostic transcript is retained as UTF-8 with a digest;
text-mode subprocess capture is not a raw-wire byte capture. Prior
77/87/93 receipts and logs remain historical. A first exploratory name-based
classifier failed to recognize native OIDs; the final positive control requires
an actual private relation OID and the guarded control requires live outer logging.

## Evidence custody and remaining work

The final producer freezes its own bytes, native helper, case plan, selected B01
oracle and entire declared helper source closure before execution. Three reviewed
helper input-read replacements execute captured plan/oracle bytes; the executed
prefix digest is retained. Fixture SQL executes from captured bytes, and all
captured sources are checked unchanged at completion. This is reviewed-source
custody, not source authentication or a hermetic runtime/build proof.

Prepared/cached calls across guard mutation, complete reachable diagnostic/routine/
operator/view closure, configuration drift integration, cancellation and unknown
extension handling remain unqualified. The original direct-RLS B10 case remains
counterexample-found; the sealed routine candidate is a separate experiment.
Original acceptance stays26/132, production open, lowering closed and goal active.

Evidence: `docs/helix/04-build/evidence/security/pg-private-diagnostics.json`.
Producer: `tools/security/pg-private-diagnostics.py`.
