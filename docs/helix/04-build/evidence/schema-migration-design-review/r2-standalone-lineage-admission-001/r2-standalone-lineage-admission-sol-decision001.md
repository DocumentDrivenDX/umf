# R2 standalone comparison — precise test admission correction

Accept changing the ONE standalone positive's setup to genuine same-meter ownR2SourceComponents admission, then call the existing complete historical verifier and deriveInventorySeedLineage on those exact owned history/current roots. No production behavior change is needed for the observed failure.

Actual40268742881 now proves the full original prepareR2InventorySourceContext and separate final-retention failure/fresh retry succeed under the fixed1M cap; its historical/current hit assertions pass. Remaining failure is the later standalone comparison, which starts a NEW meter but passes raw mixedHistory/current fixture bundles directly. The helper's generic fallback therefore has neither this new meter's exact owned-member spans nor current-root canonical association and repeats full copies/canonical walks. A frozen value or ownership on an earlier meter cannot replace that missing admission.

The source .2 preparation path explicitly owns all four components first, then verifies chronological history, projects complete source bundles and derives lineage with the SAME owned references/meter. deriveInventorySeedLineage itself is an internal source-lineage primitive, not a public raw .2 context issuer; its optional meter conservatively charges work and its generic raw path remains valid but potentially more expensive. There is no contract that every semantically valid raw pipeline must fit the same conjunctive budget. Do not relabel raw calls unsupported, flip expected success to refusal, add a raw-mode gate, or broaden the helper to manufacture source ownership automatically.

Minimal test correction:

- Keep fixture.next, complete mixedHistory, selector02 and the original current seed selections unchanged.
- Create recoveryMeter once.
- Call ownR2SourceComponents({previous:fixture.next,next:fixture.next,history:mixedHistory,selector:selector02},recoveryMeter). This actually performs all descriptor-safe copies/canonicalization/freezes and charges their full cost on THIS meter. Do not reuse state.owned, refund counters, reset the meter or construct a matching token/tuple.
- Construct recoveryCurrent from that result's exact previous/next references and the same seedSets/retiredSeedSets selections. Pass its exact owned.history plus createHistoricalG10Verifier(recoveryMeter) and recoveryMeter to deriveInventorySeedLineage.
- Require the returned complete lineage to equal state.seedLineage (retaining existing confirmed-seed assertions), rather than only not.toThrow. This is a new independent derivation; do not compare two aliases of state or skip history/phase/proof checks. Keep the existing raw current variable if later unrelated negatives use it.

The standalone call still enters its own original verified-bundle scope and performs genuine full historical semantic recompilation/chain/proof/seed validation. Only actual prior immutable ownership/canonical production can be reused; complete verifier cache hits remain full equality. Original .1 and generic unowned behavior, complete fixture, fixed caps and15s/180s remain. Existing mutation/tamper/fallback controls remain, without claiming a generic toThrow uniquely proves its semantic cause when resource refusal might occur.

The successful full context flow supports this setup choice; it does not guarantee the independent standalone invocation's actual cost or deadline. Run the corrected exact cohort once before declaring all45 API tests green. No further cache/canonical mechanism or native authority is proposed.

Exact read inputs:
- `tests/lifecycle/table-inventory-api.test.ts` — `32ee444c34c3e62627b34021fdd693adc7ae4dbb225952e991e2b90ad178953f`
- `src/table-migration/inventory-history.ts` — `ec5a73ddfeae2fbf05d6b96ad712f93848ff86b22f0f9befe174e779df8aba30`
- `src/table-migration/inventory.ts` — `518c77dce8db179246dcb637617bbbee9a2fb69ad99e7bddb6821387ae65b006`
- `src/table-migration/inventory-r2-context.ts` — `475848cb92a45a79188eaec1f67046ae860c9a67b9beee3a0c7073abe36988ab`

Source-only decision. No imports, tests/runtime, AST/type/schema evaluation, product edits, SQL/process or Git. No broader audit/reviewer chain.
