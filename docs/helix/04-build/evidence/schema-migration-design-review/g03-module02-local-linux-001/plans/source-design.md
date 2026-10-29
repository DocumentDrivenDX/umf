# Weft selected ordinary module 0.2 source design

Disposition: ACCEPT IMPLEMENTATION PLAN, subject to review of the actual governing amendment and source/test postimages before a Linux build. No runtime, dependency version or release is preaccepted.

Authority is UMF CONTRACT-081's ordinary-operation source-admission amendment plus Weft CONTRACT-003's compile/language-binding ownership and CONTRACT-004's existing native ordinary-operation guarantees. Add one bounded section to existing Weft CONTRACT-003, preserving its ID/frontmatter and direct API ownership. No new graph/catalog is needed. Published Weft 0.4.55 remains immutable. Source baseline is isolated upstream main e7e88b07, not the stale primary checkout.

## Exact implementation seam

The native module parser currently accepts only module envelope 0.1. The deeper selected010 model admission also excludes the logical Field default key. Both must be addressed together; a version allowlist alone is insufficient.

Use an explicit private Legacy01/LogicalDefaults02 admission profile selected solely by prepare_module_json's exact module-envelope string. Thread it through prepare_source, the profiled operation-document/catalog admission and module metadata. Keep existing prepare_table_operation010/selected010 behavior unchanged; only the new selected constructor/profile permits the known Field default property. Freeze selection with opaque prepared-source ownership. Unknown selectors refuse, with no inference from source/dependency version and no fallback.

Every existing direct admit_json caller, raw-read/query path, administrative/seed path and direct operation wire version remains explicitly on legacy admission. Existing weft.table-operation/0.2 row-expression invocation is a different version layer and cannot select module envelope 0.2 implicitly. Ordinary UMF declarations remain 0.1.

The logical/native equality owner is prepare_module_metadata: after the original whole-source lifecycle/mapping admission and after constructing the actual OperationField, it has the original Field, retained umf.tables column and exact native binding/type. Reuse that custody and existing native_seed_value/literal validators; do not invent Binding.default or duplicate/bypass lifecycle admission. Model admission may permit the selected default key structurally, but preparation must not return before the full mapping/literal checks succeed.

For a present logical default require exactly keys on,value; on must equal missing; native column default must be the existing closed literal form. Validate both literal values against existing Core domain/facet/allowed-value/nullability rules and native capacity. Compare the existing normalized scalar identities for string/integer/decimal/boolean; UUID and bits128 use their existing exact wrappers/lexical checks and normalized native identities. Preserve the existing exact-carrier qualifier refusals. Do not use raw JSON spelling equality for decimals, or lossy floating conversion.

Qualified non-null families are existing string→text/varchar, integer→int2/int4/int8, decimal→numeric, boolean→boolean, UUID→uuid and bits128→bytea. Exact actual subsets still require fixtures/build/native evidence. Logical temporal defaults remain refused, including Date/Timestamp/LocalTimestamp, while native-only temporal behavior stays unchanged. Logical NULL defaults also remain refused: UMF's retained literalIdentity rejects null equality, so accepting two normalized None values would widen its matching rule. Native-only literal NULL and ordinary explicit nullable inputs retain their existing behavior.

Never remove/rewrite source defaults, synthesize input arguments, materialize omitted columns, change SQL assignment/parameter order, or alter program/obligation formats just to admit source. Defaults are native database behavior, not compiler-provided input values.

## Focused controls required in the concrete patch

- Exact module 0.1 positive baseline and existing refusal/byte fixtures unchanged; retain the actual public-wheel baseline program hash from probe002 for later comparison. Unknown module envelope/type/extra-member and malformed JSON refusal remain.
- Selected 0.2 positives for every six-family mapping, native-only and absent-default controls, and normalized equal decimal spellings plus UUID/bits case variants where existing Core rules establish equality.
- Negative mismatched native/logical values for each family; missing native default, non-literal native behavior, unknown default keys/trigger/wrapper qualifiers, required-field NULL, logical NULL even nullable, temporal logical defaults, unsupported carriers and malformed token/domain/facet/native-capacity cases. Include string NUL/varchar width, integer overflow and decimal rounding/precision boundaries, and allowed-value/range violations where qualified.
- Native-only temporal/default behavior unchanged; direct operation/raw/query/admin/seed routes must still refuse selected logical defaults rather than acquire the new mode. Versioned module selection must not change direct invocation dispatch.
- Actual prepared module/operation binding retains original source and exact pins, explicit profile ownership and same parameter inventory/order. Verify omitted measure is not added to insert inputs/assignment targets or default parameter values; explicit values/nulls stay distinct. Same native-only source through 0.1/0.2 should retain existing lowered program semantics/bytes where the contract has no output-format delta.
- Preserve shared native Rust core and actual Python wrapper delegation. Before external N12 work, build a genuinely changed Linux artifact locally with exact source/build/runtime/member hashes, then run the same bounded five-case probe. Do not change expected positive outcomes to hide unsupported versions.

N12 remains separate: two source families, two-direction profile isolation and mandatory recovery/lost-COMMIT controls, fixed full-campaign conjunction and cleanup. Compiler source acceptance alone cannot qualify ordinary DB behavior, publish a release, admit a Mac target or close G03.
