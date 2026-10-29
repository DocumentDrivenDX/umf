# G10 table-state definition digest 001

Additive governing clarification for the unreleased inventory0.1 prefix. A
TableState's definitionDigest has one compiler-owned current-catalog domain.
It is separate from InventoryTable.meaningDigest, which retains the complete
review/source-declaration closure. Neither substitutes for original source,
operation/extension, native custody or whole-prefix proof.

For state present, hash the complete canonical JSON of EXACT:

```text
{profile:"umf.table-inventory-table-definition/0.1",table,record,
 catalog:{tables,columns,keys,checks,foreignKeys,indexes,policies,grants,comments}}
```

Table and record are the original exact stable binding ID and full Record ref.
For each named collection, take all COMPLETE row objects of the current phase
prefix catalog whose `identity.table === table`, preserving that prefix's
existing exact order. No member of those rows is stripped: meanings, identities,
states, source paths, validation, validity and all admitted extension content
remain exact. The preimage has no additional keys, optional collections or
arbitrary source wrapper. There must be exactly one present matching table row
and its Record identity must match. Unknown/contradictory identities refuse.

Schema-global rows with table null remain in the whole prefix catalog and its
digest; they do not become fictional table-local rows. Cross-table dependencies
retain their complete local declared meaning and identity. Do not recursively
expand target table definitions or create cycles between definition digests.
Business row values and seed execution history remain in their distinct owned
domains and are not a table's schema-definition preimage.

For state absent, definitionDigest is H of canonical JSON null. At the phase
boundary an absent table has no current physical catalog rows in these
collections; contradictory leftovers refuse. Retention archives/lineage are
separate explicit owned objects, never current physical table presence.

Use ONE identical function when deriving initial source catalog, installed
predecessor catalog and every completed phase. Apply the entire indivisible
effect group, canonical catalog ordering and complete validation first, then
recompute every present table definition from that actual complete prefix.
Field, key, check, FK, index, policy, grant and comment changes all participate.
Do not update a definition from only the last table/RLS effect or leave it stale
when another collection changes. Never swap in the full review/source digest
at installed initialization.

An unchanged stable binding and exact unchanged local catalog give identical
definitionDigest across predecessor final and successor installed index0.
Required continuity compares the semantic TableState projection
`{table,record,state,definitionDigest}` and its complete local catalog. Prefix
index, completedSteps, head/source history and plan-local provenance are bound
separately by their original records.

CreationStep/removalStep refer to actual serialized steps in THIS plan. They
must be remapped from internal IDs before prefix digests and must resolve to
the corresponding create/remove operation and SAME table/Record, never merely
an existing unrelated metadata step. Tables already present at this plan's
index0 retain null plan-local creation/removal refs; do not import predecessor
step IDs into the successor namespace. A new creation/removal reference is set
only by its actual selected operation. This local provenance reset does not
change the definition preimage or original physical lineage.

Required future verification covers initial and installed equality, empty/mixed
inventories, every catalog collection mutation, unchanged source unrelated to a
local catalog, complete row preservation, absent/null behavior, schema-global
effects, cross-table cycles, remapped refs with correct operation/identity and
before/after indivisible phases. This is a design requirement; no source, native
or release case is declared passed by this clarification.
