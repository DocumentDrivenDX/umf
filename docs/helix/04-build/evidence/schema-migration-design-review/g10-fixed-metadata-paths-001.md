# G10 fixed metadata diagnostic paths 001

Additive design clarification for the unreleased inventory0.1 compiler. Governing
G10 checkpoint001 closes the three fixed metadata operations and common step
members but leaves their exact sourcePath strings unspecified. Use ONLY:

| Operation | Exact sourcePath | Required phase |
| --- | --- | --- |
| prepare-inventory-metadata | /inventory/metadata/prepare | first, prepare |
| record-inventory-approval | /inventory/metadata/approval | second, approval |
| publish-inventory | /inventory/metadata/publication | last, publication |

Each has kind metadata, transaction required, SQL exactly empty, no branch
extension, and exact inventorySubject
`{kind:"metadata",profile:"umf.table-inventory-metadata/0.1"}`. Every original
common step member and complete before/after phase-prefix binding remains
required. The original approved/denied decision and unknown-COMMIT branches
remain unchanged. A denied decision is not a successful approval step or a
business capability. The real empty inventory still contains all three steps
and phases, with original execution/custody and all bounds applied.

These paths are reserved compiler-owned plan diagnostics. They are explicitly
not pointers into an authored source document or options object. The compiler
derives them from its corresponding fixed operation; authors cannot supply or
select them. No other operation uses this namespace. Missing/mismatched paths,
duplicate metadata operations, arbitrary suffixes and caller overrides refuse.
Step IDs and plan/prefix digests bind the complete original request and typed
DAG. A diagnostic path alone confers no identity, SQL permission, native
capability or metadata-object selection. Native effects remain the closed
original host-owned metadata definition, not generic statements.

Required future tests cover all three exact paths and pairings, initial empty,
initial nonempty, installed and mixed plans, mismatch/extra/duplicate controls,
approval denial and same-original unknown-COMMIT recovery. This clarification
does not assert source implementation, native acceptance or release support.
