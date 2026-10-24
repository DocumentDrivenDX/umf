# R1 — execution-aware immutable seed lineage

Proposed successor contract; unadopted. This replaces proposal001's inference that a retained authored definition was already applied. It preserves all original definitions and the full forty acceptance obligations.

The G10 request's `history` is exactly `{profile:"umf.table-inventory-source-history/0.1",plans,executions}`. Both arrays are chronological, length0..128 and equal length. `plans` contains complete original applied plans, never recursively embedded history. `executions[i]` is exactly `{planDigest,entryDigest,seedOutcomes}` and binds `plans[i]` to its actual original native publication entry. SeedOutcomes is an ordered array of exactly `{id,definitionDigest,originalSourceDigest,execution,proof}`; execution is literal `confirmed`. Proof is exactly one of:

```text
{kind:"atomic-publication",entryDigest}
{kind:"phase",phaseId,phaseDigest,phaseReceiptDigest,entryDigest}
```

Atomic-publication is admitted only for an original historical host/profile whose selected seed effects and native history publication committed in the same transaction. Phase proof requires the ORIGINAL confirmed phase receipt retained at publication and bound to the same original native entry. `entryDigest` alone is not self-authenticating native evidence. The host must verify original history/custody, exact old host semantics and the actual applied outcomes. If historical receipt custody or execution meaning cannot be proved, refuse; do not manufacture proof from source definitions, selected plan text, matching row counts or current data. Conflict-ignore with zero inserted rows is still confirmed execution of that selected set, not permission to replay.

Portable verification accepts these records only as explicit, bounded input data. It verifies closed shapes, source definitions, exact chronological correspondence and original phase selections. It does not attest native execution. Before effects the host requires byte-for-byte correspondence to its original protected applied history and receipts. A supplied `confirmed` string grants no capability. A missing required actual outcome or unknown COMMIT is a pending original effect, not `not-run`.

For every original ID first encountered in the complete chronological source history (including current next.source), derive EXACTLY:

```text
{id,definitionDigest,originalSourceDigest,disposition,execution}
```

Disposition is `retain-definition|apply-once|retire-definition`; execution is `not-run|confirmed`. `definitionDigest` hashes the complete original authored set including ID, row/set ordering, defaults/omissions, extensions and every original value. `originalSourceDigest` identifies the first complete original source defining it. Both remain immutable even after retirement. Lineage order is first definition occurrence, then authored order within that source; selection never reorders definitions. Definitions and original sources remain in the bounded history; digests cannot replace bytes.

| Original execution and definition | Current request | Planned entry / effect |
| --- | --- | --- |
| Newly authored, never selected | retained in next, unselected | retain-definition / not-run; no effect |
| Existing authored, actually never selected | retained in next, unselected | retain-definition / not-run; no effect |
| not-run and not retired | explicitly selected in current `seedSets` | apply-once / not-run before its phase; ONLY its actual phase COMMIT changes execution to confirmed |
| confirmed | retained in next | retain-definition / confirmed; no effect, selecting it again refuses |
| not-run | removed from next through exact `retiredSeedSets` marker | retire-definition / not-run; no effect and no fabricated success |
| confirmed | removed from next through exact `retiredSeedSets` marker | retire-definition / confirmed; no effect on surviving-table rows |
| retired, either execution state | requested again, selected, or redefined | refuse permanently, including same bytes/new source |
| unknown original selected outcome | retain/retire/select/new plan | settle ORIGINAL phase/entry first; no inferred status or replacement request |

Plan `inventory.seedLineage` binds the pre-effect execution state with this current disposition; apply-once stays not-run in the portable plan. Prefix `seedStates` has the SAME five-key entries, with execution updated only after the selected phase is actually confirmed in the host progress. The compiler projects the expected post-phase state, while the native host independently proves the actual update/receipt in that transaction. Final publication records the actual final five-key entries. `disposition` is the action of the current plan; retirement history is sticky across all later plans even if the ID is absent in next.source. No separate `historical` or `committed` alias is admitted.

Apply-once IDs must be exactly the current original `seedSets` selection in authored order. A mixed-table set retires as a WHOLE definition; no split, row deletion, implicit refill, default replay or mutation of surviving rows follows. A never-run historical set can be selected later only while its original unchanged whole definition still exists in next.source and all table/Field constraints remain admitted. Unknown or invalidated dependencies refuse; silently retaining an invalid definition is not a source-valid workaround.

Verify each historical G10 plan against ONLY its original chronological history prefix and execution context at compilation; then apply the independently verified original published execution result. Do not verify an earlier plan against later facts or make it claim it already knew its own COMMIT. Old plan/source wire meanings remain exact. No recursive plan embedding; complete history (plans AND executions) <=24MiB canonical UTF8, <=128 plans; history lineage<=32768 IDs. Check limits incrementally before parsing/cloning/expanding each prefix. Native history payload limits remain the conjunction of this bound and the original host's tighter limit; this proposal does not raise old limits by implication.

Required additions: authored unselected set retained across two generations then selected once; authored never-run retired with not-run preserved; confirmed retained and retired sets never replayed; mixed-table whole retirement leaves surviving rows unchanged; unknown selected phase blocks retirement; forged confirmed state/omitted original history refuses; retired IDs never reused; first empty selection remains no effects. These expand C09/D07/N04/N09/N10 rather than replacing them.
