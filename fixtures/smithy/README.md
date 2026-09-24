# Smithy evidence

`domain.json` is authored: recursive order shapes, service/operation inputs/outputs,
member traits, exact large integer metadata and a decimal lexeme. `upstream/` contains
all 63 JSON files from the pinned native loader/valid subtree with hashes and license.
The manifest records selection, repository and commit. These are native AST fixtures,
not evidence of IDL import/export.

`bun scripts/smithy-oracle.ts` uses Java and checksum-pinned smithy-model/smithy-utils
1.73.0 jars cached under `.cache/smithy/`. It compares native outcomes, event IDs and
canonical model hashes before/after UMF YAML. 62 of 64 cases assemble in isolation;
service-with-rename and use/use-shapes require absent referenced models. A valid edit
changes the native model; an unresolved reference fails. Read oracle-results.json for
case-level evidence. The browser adapter always reports incomplete semantic validation.

`bundles/widget.json` is explicitly authored dependency context for the two standalone
fixtures with unresolved `foo.example#Widget` references. `bun scripts/smithy-bundle-oracle.ts`
verifies ten native assembly cases: original/restored pairs, valid dependency edits,
unresolved references and conflicting definitions for each bundle. It shares checksum
verification/runtime setup with the single-file oracle. The original standalone corpus
report remains unchanged. Bundle retention does not provide a browser-native assembler.

`idl-upstream/` independently inventories all 80 `.smithy` files in the pinned loader
valid subtree, plus license. `idl/` contains an authored two-file recursive model with
comments, Unicode and exact metadata. The source oracle compares native assembly and
canonical hashes before/after UMF source archives: 78 of 80 upstream files assemble
standalone; the same two missing-context cases remain explicit. Authored bundle checks
verify round trip, changed length constraint and missing-reference rejection. Archive
validity does not mean browser syntax/semantic validity.

`assembly-oracle-results.json` covers the public API over all 144 AST/IDL corpus cases,
with a generated runtime hash, native diagnostic/canonical-model comparisons, complete
result-schema checks and successful-model YAML/reassembly checks.
`reassembly-oracle-results.json` records native first/second-stage serialization and
flattened effective-model hashes. Two mixin member override IDL fixtures add explicit
apply entries after serialization/reload; their effective models remain unchanged.
This normalization is a disclosed native behavior, not a byte-idempotence claim.
