# Closed step branches and trusted execution policy

Unadopted shared contract. Each step has ONLY the exact common keys in contract-proposal.md plus the one listed branch extension. All preconditions/expectedOutcome bind the whole indivisible phase's before/after prefix, not an imagined commit after each internal step. Step IDs/source paths/order/SQL/meaning recompile from COMPLETE original sources/options/history and the one typed DAG. No author-supplied schedule, generic SQL fallback or extra fields. Table/Field/dependency/seed/metadata subjects have their exact closed shapes in contract-proposal.md.

| operation | kind | inventorySubject.kind | transaction | SQL | extra members |
| --- | --- | --- | --- | --- | --- |
| create-table, remove-table, enable-rls, force-rls | table | table | required | exact nonempty UMF DDL | none |
| add-column, drop-column, target-check, install-default, change-default, tighten-not-null, relax-not-null, rename-column | table | field | required | exact nonempty UMF DDL | none |
| dependency-drop, dependency-add with check/key | table | dependency (check/key) | required | exact nonempty UMF DDL | none |
| dependency-drop, dependency-add with foreignKey | foreignKey | dependency (foreignKey) | required | exact nonempty UMF DDL | none |
| dependency-drop, dependency-add with index | index | dependency (index) | required | exact nonempty UMF DDL | none |
| dependency-drop, dependency-add with policy | policy | dependency (policy) | required | exact nonempty UMF DDL | none |
| dependency-drop, dependency-add with grant | grant | dependency (grant) | required | exact nonempty UMF DDL | none |
| set-comment | comment | dependency (comment) | required | exact nonempty UMF DDL | none |
| add-not-valid, validate with check | table | dependency (check) | required | exact nonempty UMF DDL | none |
| add-not-valid, validate with foreignKey | foreignKey | dependency (foreignKey) | required | exact nonempty UMF DDL | none |
| create-concurrent-index | index | dependency (index) | forbidden | exact nonempty UMF DDL | none |
| apply-backfill | backfill | field | required | literal empty string | dataBinding |
| apply-seeds | seed | seed | required | literal empty string | seedSets |
| capture-originals, convert-field, validate-conversion | conversion | field | required | literal empty string | conversionBinding |
| capture-retired-values, retire-field, restore-field, validate-restoration | retirement | field | required | literal empty string | retirementBinding |
| prepare-inventory-metadata, record-inventory-approval, publish-inventory | metadata | metadata | required | literal empty string | none |

These rows are exhaustive. An unlisted kind/operation/subject/transaction combination refuses. Literal SQL empty is meaningful ONLY for the listed actual data/compiler/private metadata executors. Metadata steps are not arbitrary SQL commands. Field rename is admitted ONLY where the existing separately reviewed field identity/rename semantics apply; table/Record rename under an unchanged binding remains refused. `target-check` is its fixed column CHECK effect with exact original Field target, not a generic whole-table dependency discriminator.

DataBinding EXACT `{profile:"umf.table-inventory-backfill/0.1",selectionIndex,operationId,previousSourceDigest,nextSourceDigest}`; selectionIndex0..255, operationId the selected original source operation. Only an ORIGINAL before-existing retained carrier can select G01/G02/G11/G04 historical data operations. Neither initial nor mixed-created tables gain a fill domain by source similarity or after-creation population; only actual authored creation/default/seed data is available there. SQL is rendered ONLY by actual qualified immutable Weft; no UMF UPDATE/INSERT emitter. SeedSets is the exact ordered selected apply-once IDs, identical to subject.sets; no arbitrary subset, confirmed/retired ID or generated seed.

ConversionBinding EXACT `{profile:"umf.field-conversion-step/0.1",selectionIndex,intentDigest,beforeDomainDigest,afterDomainDigest}` from accepted G04 source8bf812. IntentDigest follows its cycle-free original irreversible marker rule; complete before/after physical/logical/mapping domains preserve unknown meaning. Recipe/null/invalid/recovery declarations and actual native/provider/Weft gates remain exact. No `phaseTarget` or `phaseOperation` aliases are added to this new inventory step variant.

RetirementBinding EXACT `{profile:"umf.field-retirement-step/0.1",action,selectionIndex,intentDigest,fieldMeaningDigest}` from adopted G05; action retire|restore, index0..255 in matching original retirement/restoration array. Exact G05 options are copied without meaning changes: retire `{table,field,retention:{policyId,policyRevision,minimumRetentionMs}}`; restore `{table,field,archive:{profile:"umf.retired-field-archive-ref/0.1",providerId,archiveId,tableToken,targetCustody,retirementPlanDigest,retirementSourceDigest,fieldMeaningDigest},newInstances}`; newInstances exactly `{mode:"refuse"}` OR `{mode:"null"}` OR `{mode:"fill",expression}`. ArchiveSources exact `{digest,source}` <=64, each complete source<=1MiB, aggregate<=4MiB and complete G05 option wire<=6MiB. Other original retention/revision/domain/instance/source/guard/current-data/holds/purge/Weft rules from governing009 remain exact. Selection overlap across conversion/backfill/replacement/retirement/restoration for the same Field refuses unless an explicitly adopted composition exists; no general transform is inferred.

G05 Field archive capture/live drop/lifecycle/outcome is ONE actual required group under qualified G11 protection. Restoration population/fill/current dependencies/complete validation stay ONE group. Merge these groups with overlapping G01/G02/G11/G04 obligations in the typed graph. A removed WHOLE table cannot be represented by a collection of these Field archives: no retained-table retirement/restore/purge mode is admitted. Immediate reviewed table purge remains the explicit first subset; the table archive/source/row-membership/dependency composition remains OPEN.

## Exact finite host policy proposal

The campaign member of the COMPLETE signed component-policies.md policy envelope is EXACT (this record alone is not the execution authorization):

```text
{profile:"umf.table-inventory-execution-policy/0.1",statementTimeoutMs,
 lockTimeoutMs,campaignBudgetMs,maxPhaseRows,maxPhaseValueBytes,
 maxCampaignRows,maxCampaignValueBytes,maxRecordBytes,maxHistoryBytes,
 maxPlanBytes,maxPhases,maxSteps,maxSubjects,maxMemberships}
```

All numeric members are integers excluding booleans. Bounds: statementTimeoutMs1..300000; lockTimeoutMs1..10000 and <=statementTimeoutMs; campaignBudgetMs1..900000 and >=statementTimeoutMs; maxPhaseRows1..10000; maxPhaseValueBytes1..8388608; maxCampaignRows1..100000 and >=maxPhaseRows; maxCampaignValueBytes1..67108864 and >=maxPhaseValueBytes; maxRecordBytes1..8388608; maxHistoryBytes1..25165824; maxPlanBytes1..25165824; maxPhases3..1024; maxSteps3..99999; maxSubjects1..256; maxMemberships0..1024. The first empty plan still has THREE prepare/approval/publication metadata steps/phases. Actual configured policy may be tighter; original component/native transaction/SQL/driver/source/native record/history limits are ALSO required, not replaced by these caps. Plan's phases/steps/counts/complete history/record bytes must fit before effects. Original native history remains128 entries and32MiB pg-jsonb-text; the tighter24MiB canonical history context and every existing component limit are conjunctive.

Rows/valueBytes count actual original data effects per component's qualified accounting, including retained values/seed expansion and each repeated physical touch by a distinct approved operation; they are not business population counts or WAL/disk bounds. Campaign accounting persists with original receipts/reservations across rollback/retry/restart; confirmed work never resets. Known aborted transaction retains spent time/attempt accounting; selected data counters distinguish committed counts from reserved maximum admission. If actual row/byte count cannot be bounded before a required group, use the original admitted native protection/preflight and transactional guards; overflow aborts the COMPLETE group. Do not chunk or split an atomic group to fit.

The original enrolled elapsed-time/custodian implementation must conservatively account campaignBudgetMs across retries/restarts; it may not reset on process startup. Uncertain elapsed/reboot continuity refuses further effects until original authority resolves it; no new request grants a fresh budget after unknown COMMIT. Install/verify signed native transaction_timeout on the original IDLE connection BEFORE BEGIN, preserve its full-transaction deadline, additionally set actual native statement_timeout/lock_timeout and cancel only through original owned connection/process evidence; timeout never establishes rollback. Resource controls and immutable Weft/session support must be implemented and independently qualified before enablement. These are proposed finite caps requiring external agreement, not measured performance or current implementation claims.
