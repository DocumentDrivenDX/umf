# Proposed inherited local table-definition digest

Source of direction: parent/root review message received during final source-only
authoring, quoting the external Sol decision. Its original frozen addendum path
and hash were not yet supplied at this checkpoint. This is a retained proposed
input/direction, NOT a claim that a new governing addendum is already adopted.

R2 prefix.2 selects the SAME newly clarified local definition semantics on every
phase, after phase mutations and canonical catalog ordering, for initial and
installed plans alike. For a present table, definitionDigest is H of EXACT
`{profile:"umf.table-inventory-table-definition/0.1",table,record,catalog:{tables,columns,keys,checks,foreignKeys,indexes,policies,grants,comments}}`.
Each catalog array contains ALL complete current phase-prefix rows whose
identity.table===table, preserving existing array order. Exactly one present
table row is required. Schema-global rows with table:null are excluded from
this local projection but remain bound by the whole prefix. No row filtering
by guessed owner/name, original-before-only rows or stale inventory meaning.

Absent table definitionDigest=H(null), with no current physical catalog rows
for that table. This is NOT InventoryTable.meaningDigest, which binds the full
review/source domain. Both domains remain separately bound. One function is
used at every phase; creation/removal reference fields remain plan-local and
reset to null in a subsequent installed plan. Only semantic-state equality
connects the final predecessor prefix to the next installed initial prefix;
earlier plan-local references are not copied into the new installed state.

This proposal does not invent a prior public wire alias for this preimage. Its
exact adopted addendum must be pinned and reconciled before governing adoption.
