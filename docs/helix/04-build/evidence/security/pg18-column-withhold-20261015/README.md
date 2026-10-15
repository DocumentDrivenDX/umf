# PostgreSQL 18.6 native column-privilege withholding

This packet owns pg-raw.P01 / US-056-AC6 only. The exact PostgreSQL18.6 image,
server/client builds, original source bytes, ordinary TCP SCRAM identities,
role/membership/ACL/schema/helper/view/policy inventories and observed rows are
retained. The required assertion, coverage and 60-second timeout are unchanged.

The admitted direct SQL projection grants id/label/public_note columns through
an ordinary inherited reader role. Secret/audit columns remain ungranted; no
ordinary role has table SELECT or reaches a privileged role. Permitted text/null
rows match an independently authored oracle under the fixed membership policy.
Direct/mixed/whole-row/empty/LIMIT0/expression/filter/order/group/join/aggregate,
COPY, prepared and invoker-view attacks must produce an empty whole-statement
42501 refusal. A refusal is never emitted as a withheld Cell.

Six separate excluded-installer weakenings actually expose the independent secret
rows, then restore denial and the permitted projection: table grant, column grant,
inherited table grant, PUBLIC column grant, pg_read_all_data and owner-view grant.
One ordinary original TCP session retains a prepared query across committed column
revoke/regrant. The same native backend PID must refuse under revoked rights and
recover its exact original rows after restoration.

`runner-before-restoration-fix.py` and `restoration-before.log` retain a historical
fixture failure: revoking the temporary inherited table grant also removed its
original permitted column grants. The corrected restoration explicitly reapplies
only those original column grants. No expected row or refusal was changed.
`native-after-restoration.log` and `native-complete-inventory.log` retain intermediate
successful runs; `native.json` is the fresh full-gate execution, and `acceptance.json`
retains the complete governed case allocation and outcomes. `receipt.json` ties the
final source/artifact hashes to acceptance and freshness evidence.

`formal.py` / `formal.json` retain six conditional permission checks (three UNSAT,
three SAT counterexample/nonvacuity controls). They assume complete native reference
resolution and privilege checking, plus complete inventoried privilege routes;
finite native observations supply correspondence only for the authored corpus.
There is no SQL/compiler/kernel refinement, arbitrary side-channel/private-fact
freedom, general prepared-plan guarantee, native current-authority/lifecycle custody
or complete backend qualification claim. `astra-review.json` and its archive retain
independent review and scoped replay. `helix-validation.json` records the five
security artifacts; global implementation-plan findings remain independently tracked.

No PostgreSQL17.9 B/L receipt becomes PostgreSQL18 evidence. All other PostgreSQL18
B/L/P cases remain individually unqualified until actually replayed/implemented.
Truss, Ashlar and Delta qualification, native guarded consumers, authority/effect
custody and every remaining required acceptance case keep the overall goal active.

Independent review required strict primary SQLSTATE parsing (psql exit3, empty
stdout, exactly one verbose ERROR42501 and no FATAL/PANIC), complete installed
membership helper-source inventories, and verified owned container/anonymous-volume
removal. The pre-correction runner is retained as `runner-before-review-fixes.py`.
`native-reviewed.log` records the corrected119-observation run, including cleanup.
`refusal-tests.log` rejects14 malformed/non-permission/partial-output outcomes.
The caller-wrapper attack proves lack of CREATE in the protected schema only;
it does not prove permission rechecking inside an executable caller wrapper.
