# U3 row_scope authoring slice

`normalizeRowScope` in `src/table-authoring/row-scope.ts` converts the bounded
`row_scope` block to the existing `umf.tables` `TablePolicy`. Its caller supplies
exact owner Fields, via table/field pairs, and trusted group aliases. The
normalizer never discovers joins from matching names. In particular, the
`person_column` and `key_column` spellings must match fields explicitly bound by
the host context.

Every command is represented in both audience maps. Missing person commands
and batch commands become `deny`; batch grants do not depend on person identity.
Open reference reads require both an explicit `open_reference_read: true` and a
host assertion that the record is a public reference table. Unknown source keys
are copied into `source`, reported at their JSON Pointer, and refuse policy
production. The host must still pass the resulting table declarations through
`inspectTableLifecycle` and native deployment admission, which enforce related
SELECT dependencies and policy-cycle restrictions.

Examples: [owner/via/group and batch subset](row-scope-example.json) and
[explicit open reference read](reference-read-example.yaml).
Focused evidence is limited to the Bun tests in `tests/table-authoring/row-scope.test.ts`
and repository TypeScript typecheck. This is authoring normalization evidence;
it does not claim shared-security equivalence, complete ethical-wall behavior,
or new native RLS qualification.
