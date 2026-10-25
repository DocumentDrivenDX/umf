# Preserved source correction history

Proposal001 manifest a42cad1c5b62dccc1cc064bd8a11bb08020d600a0ecfb4ad119ecf30341016b7
has R2-F1 restore guard/order contradiction and R2-F2 absent global admission.
Amendment002 manifest fd6d8c26b18fbc7c3bd15af6021e608908f15c2a8492373887fb009bbe4962cf
proposes global native admission and provisional restore ordering, but its
generation1 active-first construction is invalid. It incorrectly says the active
pointer has no immediate FK. BOTH exact001 and002 DDL contain:

```sql
ALTER TABLE originals.lineages ADD CONSTRAINT lineages_active_carrier_fk FOREIGN KEY(active_table_token) REFERENCES originals.carrier_generations(table_token) ON UPDATE RESTRICT ON DELETE RESTRICT;
```

Root's source read identified this; no SQL was executed. Amendment003 preserves
that FK and all002 DDL/guard bytes, corrects initial native construction to a
retired/null-pointer lineage followed by carrier rows/ledgers then one guarded
activation, and fixes initial generation/revision semantics. Actual original
enrollment/native-birth/whole-after correspondence is still required, not
replaced by the FK. All prior immutable packets and original failures remain.

The002 original manifest is retained under inputs; source diffs record the exact
changed documents. The unmodified sealed002 packet remains at its original path,
including the rejected statement and every member/preimage. Metadata descriptors
are newly derived for003, not claimed to be the old002 approved identity. No
existing store/profile or old adopted wire is changed. All review, adoption,
implementation and actual native/atomicity/concurrency qualification gates stay.
