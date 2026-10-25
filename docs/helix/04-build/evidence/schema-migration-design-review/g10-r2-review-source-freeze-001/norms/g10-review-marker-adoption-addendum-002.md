# G10 marker adoption addendum 002

Source-design successor to marker-freeze001 (SHA256
24de140f4b4ba1031113594683c062967bf35490e2be30465499cb6477e2437b),
closing the two finite Sol adoption findings. All runtime/native checks UNRUN.
Implementation owner must adopt these normative amendments into CONTRACT-081,
matching technical design, tests, and the candidate schema/cohort before support.
Do not claim the existing contract already specifies this union or disclosure.

## Explicit review-value union amendment

Replace CONTRACT-081's universal statement that all new candidate values are
TableReview with this exact discriminated rule: create-table, remove-table and
table-removal-effects use the complete TableReview P from freeze001 (oldValue
may be JSON null ONLY for genuine initial creation); retire-seed-history uses
the complete closed SeedReview from freeze001 on BOTH sides. Its separate
profile, keys, effects, immutable original definition, execution and retirement
semantics are normative. No table/Record or table intent is invented for a seed
set that may span tables. Existing component candidate values retain their
original separately governed shapes. This is a deliberate new-family contract
and schema amendment, not a widening of an old standalone marker API.

## Exact irreversible-purge presentation mapping

The public disclosure location is the table-removal-effects Candidate in BOTH
public discovery output and compiled plan.review. It is a REQUIRED presentation
mapping from that original candidate, not an added Candidate key, result
Diagnostic, serialized plan member, or legacy MigrationReview cast.

For EVERY such candidate c, render exactly one disclosure record in candidate
order with this derived shape (presentation only, never serialized authority):
`{code:'IRREVERSIBLE_TABLE_PURGE',path:c.path,markerId:c.id,message:M}`.
M is the concatenation of these exact strings and the original table binding ID:
`'Irreversible purge of all stored rows and columns for table ' +
c.oldValue.table + '. Metadata history is not a data backup; this profile performs immediate physical deletion.'`.
The table identity MUST be the same in both complete side projections and their
actual source/intents. path is the original `/options/tableIntents/i/disposition`
location. markerId is the actual effects ID, not remove-table. A view may also
show oldPath/newPath and physical names, but must preserve this code/location/
message/identity. Discovery and plan consumers must disclose it before approval
of immediate purge. A presentation implementation must not infer safe retention
from metadata history or hide this disclosure when collapsing duplicate hashes.

No new exported function is required: this is a total, fixed presentation mapping
for the already exposed Candidate kind. API documentation must publish the
mapping and its exact record shape/code, and browser/example review rendering
must use it. If the library later exports a convenience renderer it must derive
this exact record without changing the wire. A Candidate array is still exactly
the freeze001 closed wire. Successful compile still has diagnostics:[]; blocked
Diagnostic remains an error, distinct from this required pre-approval disclosure.
Old standalone MigrationReview and its existing column-purge codes are unchanged.
R2 retained-table effects use their own separately frozen disclosure semantics.

Required controls (UNRUN): schema rejects SeedReview on table kinds and P on
retire-seed-history; multi-table seed retirement needs no fabricated table;
initial null is limited to creation; exactly one disclosure per effects Candidate
in candidate order, code/path/marker identity/message exact; duplicate value
hashes do not collapse remove and effects; compiled diagnostics stays empty;
no extra Candidate/plan keys; browser review shows full loss before approval.
