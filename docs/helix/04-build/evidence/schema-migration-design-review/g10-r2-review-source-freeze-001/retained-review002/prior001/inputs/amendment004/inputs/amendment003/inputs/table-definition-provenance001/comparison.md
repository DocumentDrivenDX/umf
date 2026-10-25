# External table-definition provenance supplement

This supplement preserves the sealed R2 proposal001 unchanged. It resolves the
missing original table-definition addendum provenance; it does not adopt R2,
edit governing artifacts or establish implementation/native evidence.

The live source file and the exact file at adopted commit
073bc44103f28cbdcde573c1737ed77423e5aaf6 both hash to
a8d3c590f98f12ba64632a868caa05f044b41ac0f2c7f1ad3e89bb46bb4baed9.
The full normative file is retained here. Parent identifies this commit as
G10 checkpoint004 and supplies root adoption receipt digest
e37097c64352a36322d422f1bec2c99d917b8d13c79fd88322a1756df29e9c7c;
that receipt itself was not supplied/read in this supplement.

The sealed pending direction has the SAME core semantics: exact profile and
preimage keys; complete current catalog rows filtered only by identity.table;
array order retained; one present table row; schema-global rows excluded locally
but whole-prefix bound; absent H(null)/no current physical rows; separate full
InventoryTable meaning; one function across initial/installed/every phase;
plan-local references reset; predecessor-to-installed semantic continuity.
There is no identified contradictory rule or different digest preimage.

It is NOT a semantically complete restatement of the normative addendum. The
following adopted obligations are explicit in the normative source but omitted
or abbreviated in the pending note:

1. Matching present table row must have the SAME full Record identity;
   unknown/contradictory identities refuse. Every complete row member, including
   state, paths, validation/validity and extensions, remains in the preimage.
2. Cross-table dependencies retain complete local declared meaning; target
   definitions are not recursively expanded and cannot create digest cycles.
   Business values and seed execution history belong to separate domains.
3. Apply the ENTIRE indivisible group, canonical ordering and full validation
   before recomputing EVERY present table. Every named catalog mutation counts;
   no stale digest from only the last table/RLS effect. Installed initialization
   never substitutes full review/source meaning.
4. Continuity explicitly compares semantic {table,record,state,definitionDigest}
   AND complete local catalog. Prefix index, completedSteps, source/head history
   and local provenance are independently bound by their original records.
5. Creation/removal refs are remapped from internal IDs to actual serialized
   THIS-plan steps before prefix hashing. Each must resolve to the corresponding
   selected create/remove operation and SAME table/Record. An unrelated metadata
   step is insufficient. Only the actual operation sets a new reference; reset
   changes neither the definition preimage nor original physical lineage.
6. The normative source adds explicit future initial/installed, empty/mixed,
   per-collection, unrelated-source, full-row, absent/global, cycles, reference
   remap and indivisible-phase verification obligations. No result is passed.

Thus the pending note is compatible and less detailed, not an independently
equivalent replacement. The adopted complete source controls these inherited
rules. A later reviewed R2 successor should replace the stale provenance-pending
status with this exact source pin and explicitly incorporate these obligations;
this supplement does not silently rewrite any sealed proposal file. Root and
external R2 review, implementation and qualification gates remain unchanged.

Only source reads, git-object hash comparison, file copying and metadata sealing
were performed. No tests, probes, source-module execution, SQL, native, build or
browser work ran under the active coordinator HOLD.
