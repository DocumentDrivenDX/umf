# U3 row_scope authoring slice

`normalizeRowScope` in `src/table-authoring/row-scope.ts` converts the bounded
`row_scope` block to the existing `umf.tables` `TablePolicy`. The caller supplies
exact owner Fields, via table/field pairs and trusted group aliases. The
normalizer never discovers joins from matching names. Source `person_column` and
`key_column` spellings must match fields explicitly bound by the host context.

Every command is represented in both audience maps. Missing commands become
`deny`; groups cannot add commands outside the person's declared subset; batch
grants do not depend on person identity. Open reference reads require both an
explicit `open_reference_read: true` and a host assertion that the Record is a
public reference table. Unknown source keys are copied, reported at their JSON
Pointer and refuse policy production. Results carry one-to-many source/output
JSON Pointer mappings. `admitPolicy` is mandatory; production integrations must
run lifecycle and deployment admission. The Python bridge binds that callback to
the supplied lifecycle document, target table and deployment configuration.

The legal fixture generator now exercises via-scoped matter rows, a public client
reference table, and a trusted billing group through the normalizer. Bun tests
cover command subsets, ownerless group/open-read forms, accessors, unknown
content, exact mapping, policy cycles and related SELECT dependency refusal.
Chromium parity exercises the public root export. The actual embedded Python wrapper also passed six TS-oracle parity cases across the locally rebuilt bundle, including preserved unknown content, duplicate/ambiguous bindings, widened group commands, policy cycles and missing related-table SELECT. The local PostgreSQL 18
[receipt](postgresql18-legal-20261021.json) records 34 assertions over the
fabricated legal fixture, including FORCE RLS, person-specific via visibility,
old-row visibility/new-row WITH CHECK, trusted group access, open reference
read, and batch UPDATE/DELETE denial.

This is scoped native RLS evidence. It does not establish shared-security
equivalence, a complete ethical-wall system, Praxis consumer acceptance or
managed-service qualification. The embedded Python wrapper source is present,
but its immutable packaged asset still requires the root integration build and
installed-wheel replay.

Examples: [owner/via/group and batch subset](row-scope-example.json) and
[explicit open reference read](reference-read-example.yaml).
