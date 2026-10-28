---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-002
      kind: informed_by
    - id: CONTRACT-003
      kind: informed_by
    - id: CONTRACT-004
      kind: informed_by
    - id: CONTRACT-005
      kind: informed_by
    - id: CONTRACT-006
      kind: informed_by
    - id: CONTRACT-007
      kind: informed_by
    - id: CONTRACT-008
      kind: informed_by
    - id: CONTRACT-009
      kind: informed_by
    - id: CONTRACT-010
      kind: informed_by
    - id: CONTRACT-011
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
    - id: TD-042
      kind: informed_by
    - id: TD-040
      kind: informed_by
    - id: US-042
      kind: informed_by
    - id: US-040
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-temporal-default-route
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-core-relationships-default-boundary
      kind: informed_by
---

# R8 TypeScript public runtime export map

**Latest checked worktree source cut (2026-10-28):** The inventory has 3,381 route-specific declarations across 509 source files and 1,129 unique export names. Its SHA-256 is `725d9a0fb08baa7f721e8af804340c1eb189b69dfacef5b07dcad9822d70b0a1`. It records 2,513 Rust-candidate declarations, 246 host declarations, 25 mixed declarations, and 240 V4 entry declarations. The condition-aware ledger has SHA-256 `3bdda421945ec5ec525676b155be19bd0622fa11cce10c914134f6124d37e079`. It records 920 logical executable default-route gaps, zero retired declarations, 101 names with accepted opt-in Rust mappings, and 834 names without accepted mappings. Each V4 root has 86 source-selected Rust declarations (172 rows total), including five Arrow IPC capture operations across both roots and seven Protobuf descriptor/document operations across both roots. The checked ledger proves zero current-source installed binding routes; five older CSV/inspector receipts remain visible as source-pinned historical evidence. The explicit `./reference` route remains TypeScript. `BIT128_PROFILE` remains one source-pinned immutable JSON string scalar across three routes; four immutable generated-data aliases and 198 JSON resource aliases per root retain their existing classifications. Source selection and historical private receipts do not retire declarations or establish release qualification.

**Earlier source recapture (2026-10-28, five-schema and loader-inspector selection):** The inventory records 3,375 route-specific declarations across 509 source files, 1,126 unique export names, and 1,120 declarations per Node, browser, and `./reference` root. Each default root has 922 executable declarations and 198 JSON resource aliases. Inventory SHA-256: `eced450d39b6e2eade2354cc549300179fc9a763183dd56d2d1af138bb662424`. Condition-aware ledger SHA-256: `14a9de59c1a5d37390f5eab7a8900945c2eecd74b8cf626ec773d46aa79d9ba5`. It records **922 open logical executable default-route gaps and zero retired**, with 84 accepted opt-in Rust mappings, 838 unmapped names, and 65 source-selected Rust declarations in each V4 default root (130 total). Ten bounded binding routes have evidence; source selection and bounded private evidence do not retire declarations or establish release qualification.

The [five-schema default-route packet](../r8-domain-pack-schema-default-route/README.md) covers the public exports `generateDomainPackSchema`, `generateDatasetSourceSchema`, `generateArtifactCollectionSchema`, `generateDomainPackLoaderSchema`, and `generateLoaderInventorySchema`. Its receipt SHA-256 is `1c192d0246a85c8c12de39b37b40e119026b692dade2db249e5aace2c689b19a`; its fixed-point source closure SHA-256 is `f767e90fe77adec74f85358c7d7d0b775a84d35fd5dd445b002da5a51026f231`. This is bounded private Darwin arm64 Node/Bun/Chromium installed-route evidence only; direct WASM provider counters were unavailable. The separately source-selected `inspectDomainPackLoader` has no installed route packet. `./reference` remains TypeScript, all 922 logical executable gaps remain open, and Linux and release qualification remain outstanding.

The [current-source Linux `securityNot` packet](../r8-security-not-current-linux-20261027/README.md) combines fixed-point Darwin arm64 and Docker-emulated Linux x86_64 installed SDK archives with Node, Bun, and Chromium receipts. The exact `/3` validator accepts the Node and browser `securityNot` declarations as retired for that evidence-bearing cohort, leaving 921 conditional logical gaps; `./reference` remains explicit TypeScript. This checked default ledger still has 922 open gaps and zero retired because it carries no archive evidence argument. Hosted CI and release qualification remain open.

The same archives also have [Darwin](../r8-record-values-current-darwin-20261027/README.md) and [Linux](../r8-record-values-current-linux-20261027/README.md) installed `validateCoreRecordValues` packets. Node, Bun, and Chromium pass the 24 frozen semantic and 19 raw-host cases through both routes, with pinned Rust dispatch and browser resource controls. This bounded parity evidence does not yet meet a Record Values `/3` retirement profile or a measured memory bound; both default-route declarations remain open.

The separate [historical installed SDK packet](../r8-full-sdk-9b89b757/README.md)
passed a private macOS arm64 archive on Node 26.12.1, Bun 1.4.3 and real
Chromium 153.0.8010.12 with a zero-transform 3,549-input source closure
`9b89b757176d03f518af3aa1a97f446e672d791a3f85629df490a6da07c085bf`.
That source cohort included the frozen 66-case Core Cardinality route probe,
but its selected TypeScript binder still performed `copyJson` admission before
Rust. The later host-input production cut removed that admission from the
default facade; the current installed and complete acceptance gates are still
separate. The three Cardinality names remain unretired. The current machine ledger marks
the Core Cardinality v4 resource `generated-authority-known`; the earlier
[authority decision](resource-authority-closure-decision-20261026.md) is a
historical cohort, as its dated correction records. All 922 logical default
route gaps remain open.

**Current source recapture (2026-10-26, Core Relationship consumer factories):**
The Avro, TableSpec, SQL Server, Parquet, extras and PostgreSQL consumer
factories are now injected with the Rust Core Relationship lookup and
verification operations through the V4 Node/browser entries. The inventory
records 3,375 route-specific declarations across 509 source files, 1,126
unique export names and 1,120 declarations per Node, browser and `./reference`
root. Each default root has 922 executable declarations and 198 JSON resource
aliases. Inventory SHA-256:
`edd8bc4cdca2b1265b6649f0535e840f19ff22cd7eed8eca0ff0c8d66b861132`.

The condition-aware ledger has 922 logical executable retirement gaps, 77
accepted opt-in Rust operation mappings, 845 unmapped executable names, 50
source-selected Rust declarations per V4 root and 100 source-selected
declaration rows total. The six consumer families contribute 25 public
project/verify/recover exports per route. Their default V4 declarations remain
mixed host TypeScript/Rust bindings: the Rust lookup and verifier are injected,
while each consumer factory still performs TypeScript behavior. They do not
count as accepted exact Rust consumer mappings or retirements. The explicit
`./reference` route remains TypeScript. This recapture does not add a proven
binding route or establish installed-package parity. Ledger SHA-256:
`e3cfa3eb5ce979c53d923bb58d15db56f7a236c98cfc0e0387373def2778b16e`.
The inventory and ledger `--check` modes, exact-shape negative controls and
full ledger suite (55/55) pass.
The action-plan producer identity is
`2e9732326e2c3dc0bf0387520aaf8223463d92e731402f689a5d6ac9caea11f6` and
passes its `--check`; this source-cohort recapture retains the 922/77/845
disposition counts.

**Current source recapture (2026-10-26, numeric V4 selection):** After the
five CONTRACT-049 numeric bindings, strict access import policy, Selection
private host continuation and generated metamodel/resource refresh, the
inventory records 3,375 route-specific declarations across 506 source files,
1,126 unique export names and 1,120 declarations per default or reference
root. Each default root has 922 executable declarations and 198 JSON resource
aliases. The inventory SHA-256 is
`cfb13382c1ce6ffdf1a394917f2e3fd461b2076451bde7e8661b57c41cfdde11`.
The condition-aware ledger SHA-256 is
`58a1b95d0d411f362eaf37658854fb182c647ae61784ed6d048db88c7143e14a`.
It records 922 logical executable gaps, 72 names with accepted opt-in Rust
mappings, 850 unmapped names, 50 source-selected declarations per V4 root and
five binding routes proven by the prior gated current-source cohort. The five
new numeric selections are source-selected-only: one derived private archive
passed Node/Bun/Chromium behavior replay but used 11 generated-source
transforms, so it does not qualify this current-source fixed point or retire
any gap. The reference route remains TypeScript. The generator `--check`
modes, exact-shape negative control and full 49-case ledger suite pass for
this recapture. Resource authority counts remain 56 generated-known, 49
authored-known, 88 candidate-generated and 5 unresolved.

**Prior source recapture (2026-10-26):** The inventory and condition-aware
gap ledger were regenerated from the current ten package conditions after the
V4 Node/browser entries grew to 45 direct declarations each. The inventory
and ledger were recaptured after commits `2b953bfec`, `e3de811e6`, `38b572c60`,
`4cbbe0c2f`, and `bfb082cac`, then extended through `e9f003a4e` and merged
with current main at `84cc17df3`.
The inventory
contains 3,375 route-specific runtime declaration rows across 506 source files,
1,126 unique export names, and 1,120 declarations in each Node, browser, and
`./reference` root. Each default root has 922 executable declarations and 198
JSON resource aliases spanning 189 distinct `spec/` files. The inventory SHA-256
is `f68de5672db92529b3c21909307c2c7e511fd0a36aec305e4b4396458b886d5e`.

The ledger contains 3,360 root rows, 922 logical executable default-route
retirement gaps, 67 names with accepted opt-in Rust-operation mappings, and 855
without such a mapping. Each V4 entry has 45 direct declarations; all 45 per
root are counted as source-selected Rust overrides by the ledger. The new
guarded `securityNot` root override maps to
`umf_core::security_logic::security_not` while `./reference` remains TypeScript.
Its private installed archive (SHA-256
`8b1d5ad2e57fa33487752b0116211b7628df201359cbd2a13a75912e0e08e60e`) replayed
14 cases each in Node v26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12. The
receipt pins the fixed-point, zero-transform package to source commit
`dc746ad53` and source closure SHA-256
`189772e74079af4d00fbd973380a4318330d5fe91a8652691feb3321ea5e6d8e`. This is
private historical source-pinned evidence; it does not qualify the current
worktree, release, complete parity, or declaration retirement. The explicit
`./reference` declaration remains TypeScript.
`verifyCoreKeyOperation` is the fifth Core Key operation and uses the staged
Rust host route in the V4 Node and browser roots. Its private fixed-point
archive has passing installed Node, Bun, and Chromium receipts for its captured
source closure; the receipt does not qualify the current worktree, release
readiness, or retirement. The explicit `./reference` declaration remains
TypeScript.
Its Node/browser declaration is a `BindingElement`, while its `./reference`
declaration is a `FunctionDeclaration`; the ledger normalizes only this exact
route-shape difference. That signature normalization does not change its
implementation status, Rust ownership evidence, route selection, or retirement
disposition. The ledger SHA-256 is
`5d2e5e7ad272041d4abb5bbe668ebbda724e75fa037cc3c9a75b32d18196985e`.

The resource authority counts are 56 generated-known, 49 authored-known, 88
candidate-generated, and 5 unresolved. Kind v6 and Nullability v5 now have
authored metamodel bindings with exact current-byte outputs; these bindings do
not reconstruct their historical edits. Six unique executable names have
bounded private installed routes across the combined aggregate and the separate
Core Key verifier archive receipt. These
bounded receipts do not establish complete host parity, declaration retirement,
current-source qualification for the verifier, or release readiness. The
source-pinned `securityNot` receipt is separate and does not increase the five
current-source routes proven by the fixed-point aggregate.

The inventory and ledger were recaptured after the listed source commits and
the metamodel generated-output fixed point. The ledger records 45 source-selected
overrides per default root, including `securityNot`; its source-pinned private
receipt does not contribute to the five fixed-point current-cohort routes. Both
inventory and ledger `--check` modes pass. The exact-shape regression passes
1/1 and the full ledger suite passes 48/48. All 922 logical gaps remain open.
Current resource authority counts are 56 generated-known, 49 authored-known, 88
candidate-generated, and 5 unresolved; historical-schema negative controls
remain in the suite. Counts include the explicit `./reference` route where
stated; 922 is the logical default-route gap count, counted once per export.

**Coordinated source recapture (2026-10-25):** After the JSON Schema
boolean-true profile extension, opt-in Rust/Python catalog custody slice,
native JSON parser audit, and five-resource direct-authority review, Sol
regenerated and checked the metamodel, Python resource mirrors, WASM shared
sources, condition-aware inventory and gap ledger. Inventory SHA-256 is
`2fa3e288ea62bf75d7e08baa79c081db50afae8ef153ded8ed1ba1c31f5d5ba9`;
ledger SHA-256 is
`971a6e327e55fa81cde44e2b7f0c5e3f3d8a8fdf2b35c8527088ecab3ac08ab4`.
The current ledger has 922 logical executable default-route retirement gaps,
52 accepted opt-in Rust mappings, 870 executable names without an accepted
mapping, 37 Rust-selected source declarations per Node/browser root, and zero
proven default binding routes. Resource aliases stand at 32 generated-known,
19 authored-known, 91 candidate-generated and 56 authority-unresolved. The
five new authored files account for six aliases because key-tuple v4 has two.
The `./reference` executable route stays TypeScript. Source changes after this
cohort require another recapture; installed package and release gates remain
open. Both generator `--check` modes, the full ledger regression suite
(27/27), TypeScript typecheck, the 693-module Rust boundary census, and the
16-case Python sdist/artifact custody suite pass for this source checkpoint.

**Record Type source recapture (2026-10-25):** After the bounded Avro and
Parquet Record Type classifier/recovery compositions, Sol regenerated the
metamodel and action/codegen resource mirrors, then recaptured both generators.
The inventory SHA-256 is
`3f06c27891576be462fe8bb89758659eb815c15fd91ad50be5544bf030d960e2`;
the ledger SHA-256 is
`c8aa02f70056de387d3579ba9832a3a5ff9cd66badfc42d99d73ddc87b5acce5`.
Both `--check` modes, typecheck, Rust boundary/core-authority checks, and
12/12 Python sdist closure tests pass. The ledger remains at 922 logical
default-route retirement gaps, 871 without an accepted Rust operation
mapping, 37 Rust-selected declarations per Node/browser root, and zero
binding routes proven for this combined source cohort. The new opt-in Rust
modules do not reduce those counts.

**Record-composition source recapture (2026-10-25):** After the opt-in Avro
and Parquet Record classifier/recovery modules settled, Sol regenerated and
checked the metamodel and both Python resource mirrors, reran TypeScript
typecheck, Rust boundary checks and the 12/12 Python sdist closure suite, then
recaptured the inventory and authority-bound ledger. Inventory SHA-256 is
`45d5c11b927dc59cee801cce020b2d12eb6bec56dd68278cfbb6c545e56aa7cf`;
ledger SHA-256 is
`e4f258320f3072f1b60ca9bd0e595e79f0ae8029f577691912734dcf6193ae4b`.
Both generators' `--check` modes passed. The ledger still reports 922 logical
executable default-route gaps, 871 names without accepted Rust mappings, 37
Rust-selected source declarations per Node/browser root and zero proven
binding routes in this source cohort. The new Record compositions remain
opt-in candidates and do not change those retirement counts.

The [SQL Server Field and Cardinality schema-authority checkpoint](sqlserver-projection-resource-authority.md)
records their exact writer chains, read-only checks and package source closure.
The [TableSpec Cardinality schema-authority checkpoint](tablespec-cardinality-resource-authority.md)
records its direct Field base input, exact writer and read-only check.
The [model vocabulary export-disposition checkpoint](model-vocabulary-export-dispositions.md)
distinguishes generated frozen data exports from the executable version gate.
The [Parquet metadata schema-authority checkpoint](parquet-metadata-resource-authority.md)
records the shared two-output writer, direct inputs, package source closure and limits.
The [package-reference initializer analysis](package-reference-variable-analysis.md)
uses TypeScript AST/checker resolution for all 167 reference-route variable
declarations; it identifies the single additional generated-source constant as
runtime-semantic and promotes no inert-only generated aliases.
The [versioned core schema authority checkpoint](versioned-core-schema-authority.md)
records exact authorship revisions for five current core schema resources while
keeping older versions unresolved and installed archive bytes unqualified.
The [dataset-value schema authority checkpoint](dataset-value-schema-authority.md)
records the exact authored revisions and current consumer/package source closure
for the full and compact dataset-value operation schemas; installed archive bytes
remain unqualified.
The [Delta checkpoint and native JSON authority checkpoint](delta-checkpoint-and-native-json-authority.md)
records the AC18 schema writer/input closure and the contract-attested exact JSON
tree schema, while keeping both installed archive byte sets unqualified.
The [Delta profile schema authority checkpoint](delta-profile-schema-authority.md)
records the exact datatype and table-context schema writers, all three outputs
from each isolated writer run, and source/build closure; installed archive bytes
remain unqualified.
The [PostgreSQL Key catalog schema authority checkpoint](postgresql-key-catalog-schema-authority.md)
records the three outputs of its exact self-contained writer, history pins and
source/build closure; installed archive bytes remain unqualified.

**Current V4 entry census correction (2026-10-25):** The prior inventory
used a static list of 29 selected export names. That list predated the temporal
and Core relationship V4 root overrides, so it understated current root source
selection. The generator now derives each V4 entry's direct exports from the
TypeScript checker declarations resolved to that entry, and verifies that Node
and browser entry export names match. It records 37 direct declarations per
default root. The eight additional names are `parseGregorianDate`,
`truncateGregorianDate`, `parseRfc3339ExactInstant`,
`sameRfc3339ExactInstant`, `inspectCoreRelationships`,
`lookupCoreRelationship`, `declareCoreRelationship`, and
`verifyCoreRelationshipOperation`. The ledger maps these to exact Rust owners
and records their bounded evidence; this is route selection/evidence, not
retirement approval.

At the V4 entry correction capture, the [inventory](inventory.json) contained 3,375 route-specific declarations
and 1,126 unique names. The [ledger](gap-ledger.json) contains 3,360 root rows,
51 accepted Rust mappings, 871 executable names without an accepted mapping,
74 source-selected rows (37 per Node/browser root), and zero proven binding
routes in its current-cohort count. It still records 922 logical executable
retirement gaps, including the Rust-selected declarations until retirement
review. `./reference` remains a separate TypeScript route with 922 executable
rows. The temporal evidence is a prior private cohort with source-drift limits;
the relationship evidence is a private fixed-point package replay. Neither is
a release qualification claim.

The recaptured inventory SHA-256 is
`dacc99e18fdc5a7297a76e5fa358fb96062c0125f97f8dcbcc84fcc8d4f51017`; the
ledger SHA-256 is
`f22ebe94d4288dd1b693b005439f8fcd6e034dc9ae7727f191197c8a3cd2c057`. Both
`--check` commands passed at that capture, as did the focused ledger suite
(16/16). Generator
hashes: inventory
`129ccfebe9dec7df10a8240db9f39dc2825a056bff890a43b7ac6a07ad3a1c78`, ledger
`41bb64d486863f7aaae9d5eb1495367eed6afa877129f2c0b3819a8b73a6248b`, and
focused test
`097eb53b2f86332da2a555442c1e349626d54a3a10e3abca6bd3479aea3641f2`.
This moving-worktree recapture does not establish release readiness.
Later source edits make these historical hashes stale; the final coherent
inventory/ledger recapture remains open.

**PostgreSQL Cardinality schema authority checkpoint (2026-10-25):** The
ledger now resolves `spec/core/cardinality-postgresql-projection.schema.json`
to its exact single-output Bun writer,
`scripts/core-ideals/cardinality-postgresql-projection-schema.ts`. Its
read-only `--check` compares the rendered JSON with the checked-in output. The
ledger pins CONTRACT-040, TD-042, US-042, the writer, its direct imported base
schema hash, the runtime consumer/test, and SDK build/archive closure. This
establishes the writer/output and packaging source closure for this one
resource; it does not claim authority over the imported base schema or qualify
installed archive bytes. The resource ledger totals now show 25
generated-authority-known, 13 authored-authority-known, 98 candidate-generated,
and 62 unresolved resources. The 922 executable retirement gaps remain open.

The generated ledger hash is
`bf8f53f7c39b2e3e6f55aae7593b420d80fd5e0f665362a6c110c12dce7acbe8`; this is a
moving-source checkpoint, not the final shared-tree recapture. The writer hash
is `01cacbb0bc1862d5a75f67d64281dd458e743f5d8d2a47148a4f2e21c7894ecb`, the
ledger generator hash is
`96578b6f1d17695f21701a9284df282ba45e07862dcb3c628be2d48e074fa3ca`, and the
focused ledger test hash is
`100d0c55e3fba10ee7b507d73f90dff4526b4ec7c1e273fdbccb253fb08108e6`. The
read-only schema check, projection tests (3/3), and ledger tests (17/17) pass;
ledger `--check` and `git diff --check` pass for this checkpoint.

**Field PostgreSQL projection schema checkpoint (2026-10-25):** The ledger
also resolves `spec/core/field-postgresql-projection.schema.json` to its exact
single-output Bun writer, `scripts/core-ideals/field-postgresql-projection-schema.ts`.
Its read-only `--check` verifies the rendered bytes. The authority closure pins
CONTRACT-040, TD-040, US-040, the direct imported
`spec/core/field-tablespec-projection.schema.json` hash, consumer/test and SDK
build/archive routes. The imported TableSpec base remains `candidate-generated`;
this entry does not claim its writer authority or promote it transitively.
Resource totals are now 26 generated-known, 13 authored-known, 97
candidate-generated, and 62 unresolved; the 922 logical executable retirement
gaps remain open. Field projection tests pass 4/4; the schema writer
`--check` passes. The ledger hash for this moving-source checkpoint is
`d764dd4e119e0d54ab0c55a7c4e05b8b691810de102efad81d70903d1f7992d5`. This
moving-source capture passes ledger `--check` and `git diff --check`; hashes:
writer `f1ab9d6e03bce5ad45fadb11ae08b9e6ea9f3dfda144066d392d61fe3fe98bbe`,
ledger generator
`d46b97b72d3276b7b3fb49616e37b9c471f4bd408e3ab837b1d39fbb98f129b0`, and
focused ledger tests
`69ce1907ed1d0fa255e630654762ea32bca2a5f24d4c21b4c20a0c8bdab1ca2a`.

**TableSpec Field projection schema checkpoint (2026-10-25):** The direct
writer `scripts/core-ideals/field-tablespec-projection-schema.ts` defines the
schema inline and applies the shared `projection-policy-schema.ts` helper; it
has no imported schema resource inputs. Its read-only `--check` compares the
deterministically rendered output bytes. The ledger pins CONTRACT-040, TD-040,
US-040 AC3–5, the helper, runtime consumer, tests, TypeScript root export, and
SDK build/archive closure. The Field PostgreSQL schema writer uses this
resource as its direct base; both writers now have independent pins, without
inferring authority for any further input.

The [PostgreSQL schema authority checkpoint](postgresql-schema-authority.md)
records three CONTRACT-015-authored schemas and the exact pinned-descriptor
writer for the PostgreSQL native-AST schema. Its source closure and generator
check do not qualify installed SDK archive bytes.

The [TypeSpec schema authority checkpoint](typespec-schema-authority.md)
records the five CONTRACT-013-authored operation and projection schemas with
their source consumers. No exact schema writer was found, and SDK archive bytes
remain unqualified.

The [JSON Schema projection result-schema checkpoint](projection-schema-authority.md)
records the three directly named Avro, GraphQL-input and JSON Schema-to-Protobuf
contracts. Their schemas are authored, with no exact writer identified; installed
archive bytes remain unqualified.

The [DDD, Bit128 and PostgreSQL projection-schema checkpoint](domain-projection-schema-authority.md)
records three directly named contract schemas. Bit128 has a direct runtime
schema import; the DDD and PostgreSQL report schemas are package exports and
test-validated without direct imports from their runtime projection modules.
Installed archive bytes remain unqualified.

The ledger now records 27 generated-known, 13 authored-known, 96
candidate-generated, and 62 unresolved resources. Its moving-source hash is
`f9cd1d40e5d1d889d02ecf165515c39f5cb1e17354d49ca32848402f81f2dfd3`; the
schema output hash is
`a49d3595315aa66b6ea4106fe3ef016d727be225f70e319f8953f28614266fa5`, the
writer hash is `06f83c4ffe1a56e8c7e56f7d78d9fafef550802067597e777ea8fda494e71ff6`,
ledger generator hash is
`728da768a56b4a7719e3953de5a662e3cefc394a98f80a483e1bf72e53f2b528`, and
focused ledger test hash is
`20b6055d4fb4a07fc03e60f5a7377ca5e19229ed4279018ad885e4d73207d761`. All
three schema writer `--check` commands pass; the three linked projection
test files pass 13/13 and the authority ledger suite passes 19/19. The ledger
`--check` and `git diff --check` pass at this checkpoint. All 922 logical
executable retirement gaps and installed-release limits remain unchanged.

**Current fixed-point recapture (2026-10-24, after the Delta/RFC3339 and
resource-authority slices):** Metamodel, action identity/resources, and WASM
source mirrors were regenerated and all four check-only commands passed.
Typecheck, Rust boundary checks, and core-authority checks also passed. The
[inventory](inventory.json) has 3,375 route declarations, 1,126 unique names,
and 29 Rust-selected versus 893 inherited TypeScript executable declarations
per default Node/browser root. Its SHA-256 is
`e679c1c018b18d43967d6ef6fc72e2ebddf7bd037722ff3e4cec373cc71cc186`.
The [ledger](gap-ledger.json) still has 922 logical retirement gaps, 43
accepted opt-in mappings, 879 unmapped executable names, and zero binding
routes proven for this cohort. It now distinguishes eight generated-known and
thirteen authored-known resources, 112 candidate-generated resources, and 65
unresolved authorities. Its SHA-256 is
`a7db866ece535698e41084a6f8a01a2b248ca2e7712077ca977d292567b18b97`.
Both generators passed `--check`, and the ledger suite passed 10/10. Generator
and test SHA-256 values are `abdb706300f2f74f51b725737cbd56ee26a5c05b8a8478027adc0fda904a8bf0`,
`0d0155deb7430a1833409fd3a818724d26d965963c9aa4d5bc93f6673c970b87`,
and `7596a2dc5e6cc79f2691000179b87c640da264b5e2bcff10f51e8314668ae14d`.
This is a local source census; an installed SDK replay and retirement review
are separate gates. Re-run the recapture after source changes.

**Current stable-source recapture (2026-10-24):** After the generated metamodel,
action identity/resources, and WASM source mirrors reached their check-only
fixed point, the R8 inventory and gap ledger were regenerated against the
paused source tree at Git HEAD
`23bf095b768b6e391da1967339cd559e22ff2eff`. This was a locally modified
worktree; the machine-readable artifacts hash their captured source inputs, and
any subsequent source change requires another deliberate recapture.

The [inventory](inventory.json) records 10 package-condition routes, 3,375
route-specific runtime declarations across 506 source files, and 1,126 unique
export names. Each Node and browser default root has 1,120 declarations: 922
executable declarations and 198 JSON resource declarations. Each root selects
29 Rust operations by source routing and inherits 893 executable TypeScript
declarations. The explicit `./reference` route retains 922 TypeScript
operations. Source selection is not installed qualification or retirement
evidence.

The [authority-bound gap ledger](gap-ledger.json) contains 3,360 route rows
(1,120 per Node, browser, and `./reference` route), 922 unique executable
names, 198 unique JSON aliases, and 189 unique resource files. It records 43
accepted opt-in Rust operation mappings, 879 executable names without an
accepted Rust mapping, 58 Node/browser Rust source-selection rows, and zero
binding routes proven against this current cohort. All 922 executable names
retain default-route retirement gaps; zero declarations are retired. Resource
authority remains unresolved for 82 of 198 exported aliases. These counts do not establish
full Rust parity, installed package behavior, or release readiness.

Captured artifact hashes: inventory
`8780c8b6a8b3af797a5eef628098437cf69c3b5638c54c8a2ea9db90fc900252`;
gap ledger
`37d35e004a689feb41036633993add3f655d79ebbd82cd80d170cecfd3e4fba5`;
inventory generator
`abdb706300f2f74f51b725737cbd56ee26a5c05b8a8478027adc0fda904a8bf0`;
ledger generator
`3bda2a4ba4fe6a0dbc404babf79905733e7e22a204ec30d1d8d6df353f9ea2f6`;
and focused ledger test
`2e7616258227a58bc8276d142866859cdfe0022f7059466289842dd92384e14d`.
Both generated artifacts pass their `--check` command, and the focused ledger
suite passes 7/7 tests. This refresh records source state and gaps; it does not
close the R8 port, installed SDK qualification, publication, or release gates.

Earlier R5 Bit128/UUID source-selection and opt-in evidence remain bounded to
their own captured sources and do not establish current default-route behavior.

**Previous condition-aware source checkpoint (2026-10-24):** The source `package.json`
selects Rust V4 Node and browser root bundles and exposes the TypeScript root
through `./reference`. The [inventory](inventory.json) has been recaptured at
SHA-256 `bb0f543e658129c266b9a3ee80c258c8480e3f923a6543ef9a275c2c5f1477ad`;
its `--check` passes for the pinned source cohort. It records ten condition
routes and 3,375 route-specific declarations from 506 source files. Each
default root contributes 1,120 declarations: thirteen source-selected Rust
rows (the V4 `generatePythonClient` route, three cardinality operations, four
facets operations, compact Dataset validation, and four Core Keys operations),
909 inherited TypeScript executable declarations, and 198 JSON resource rows.
Compact Dataset verification and `verifyCoreKeyOperation` continue through the
TypeScript implementation. The
explicit `./reference` route contributes 1,120 declarations. These are source
declarations, not by themselves installed-package or runtime parity evidence.
An earlier ordinary source build refused a changing live source closure. The
later R7 [captured local-private cohort](../r7-sdk-source-default-route/README.md)
passed installed Node/Bun and real Chromium replay for its frozen source tree;
it qualifies only the generator route in that captured cohort. The cardinality,
facets, compact Dataset validate, and four Core Keys root routes are
source-selected but remain unqualified pending installed replay. Neither result retires the 922 logical
executable gaps. The regenerated
derivative [gap ledger](gap-ledger.json) records Node, browser and reference
routes separately.

The condition-aware ledger at SHA-256
`5ac3e33faed292f5a1c0aeb57eff9fb1f2da74b1484f446b87e34ce31d50cdb2` has 3,360
route-specific declarations (1,120 per route) representing 1,120 unique export
names: 922 executable declarations and
198 distinct JSON aliases. Node and browser each select Rust V4 source
implementations for `generatePythonClient`, three cardinality operations,
four facets operations, compact Dataset validation, and four Core Keys
operations. Compact Dataset verify and `verifyCoreKeyOperation` remain
TypeScript. The generator route has captured local-private
qualification; cardinality, facets, compact Dataset validation, and Core Keys
remain unqualified in this integrated source cohort. The route-specific rows identify
these mappings and their gates. Generator rows identify the call
`umf_codegen::resources::CodegenEngine::generate_python_client_host_v4` and
hash the Node/browser wrapper, wire, Rust owner and focused qualification
sources. They also pin the R7 local-private archive receipts for Node/Bun and
real Chromium replay plus its 139-case Bun smoke. That qualification belongs to
captured source tree `0bf95b9c…`; live core source has since changed, so it is
not combined-tree, publishable or retirement qualification. The other 909
default-root executable declarations inherit TypeScript.
`./reference` route remains TypeScript for all 922 algorithms. All 922 logical
executable declarations retain a default-route retirement gap; source-selected
Rust rows are not treated as retired. The cardinality trio, facets quartet, and
compact Dataset validate and four Core Keys operations have bounded accepted
R5 core mappings, but this does not qualify their default binding routes. The
compact verify and Core Key verify functions remain TypeScript-root operations.
The recapture reports 13 source-selected Rust declarations per Node/browser
root, 909 inherited TypeScript declarations per root, and zero retired rows.
The ledger defines 922 executable gaps as unique unresolved logical names; it
also reports 922 per Node/browser route and the 922 retained explicit reference
operations separately. `bindingRoutesProven: 0` counts only rows with current
cohort route evidence accepted by the ledger and does not negate the historical
generator private-cohort receipt. Route rows
do not multiply unique executable or resource
counts. Resource records identify their Node, browser or `./reference`
entrypoint and inherited `src/index.ts` data leg separately; installed package
bytes remain unqualified. The 32 bounded opt-in R5 mappings remain separate
core ownership evidence, not default-route retirement.

The broader ten-route inventory reports 1,126 unique names because six names
belong only to candidate or loader-contract subpaths (`createPythonClientRustCandidateV2`,
`createPythonClientRustCandidateV3`, `PYTHON_CLIENT_HOST_READ_V3_PROFILE`,
`createPythonClientRustCandidateV4`, `PYTHON_CLIENT_HOST_READ_V4_PROFILE`, and
`createValidator`). None is a package-root or `./reference` declaration. The
ledger's 1,120-name denominator therefore covers all declarations on each of
those three root routes; the six subpath-only names are retained in the wider
inventory, not omitted from a root-route gap count.

This recapture uses inventory generator SHA-256
`97f2c54c7e04878d2be19e771ef774441ae4bec2eac49ce2016ab9087884391e`, inventory
`bb0f543e658129c266b9a3ee80c258c8480e3f923a6543ef9a275c2c5f1477ad`, ledger
SHA-256 `5ac3e33faed292f5a1c0aeb57eff9fb1f2da74b1484f446b87e34ce31d50cdb2`,
ledger generator `6d25067757b81bde5f5650b45cefcee50af1eab02db1112e95cb656d7f0e6135`,
and ledger test `8e0947ec7fa01ed77adb0868b794c17d85c6235c393cbbb09150cf40d147ae0d`.
The Node and browser source entrypoint hashes are `02e153836ea545ac3e6093d814c6c92f24620d9b75a16cda02e474b38d5f4694` and
`aef6f668c06af12cdcf0ec4ca2bdf7e034239adb651c6792bb53727d2d9c1a2f`; ledger
rows also pin each selected operation's wrapper, wire, Rust source, focused
test, and evidence closure. The CSV predecessor helper source in the Python
census is pinned at `7ab1119fb7a303f84a556135e4168f827dd914520865850456c4eae4dec3eead`.
The helper source counted in the Python census is pinned at
`7ab1119fb7a303f84a556135e4168f827dd914520865850456c4eae4dec3eead`. The
focused ledger suite passes 5/5 and both inventory and ledger `--check` pass.

The older counts and review history below are retained as historical
checkpoints at inventory SHA-256
`e0bb6c94fdb59721d70720345fa35b9021903e96b1bcca6e2c18366780f0eac7`.

The first symbol-level supplement to the R4–R8 successor census
resolved the then-current package JavaScript entrypoints with the installed TypeScript
5.9.3 compiler API and records each runtime exported declaration, its export
name, source location and source hash, candidate owner family, route, and
retirement disposition. Type-only exports are excluded; imported JSON resource
objects are included as runtime data exports. The JSON is a current
source snapshot, not an R8 completion receipt.

That historical capture covered the package root (`src/index.ts`), the public
`./loader-contract` subpath, and the six opt-in Rust codegen candidate
Node/browser entrypoints (`src/node.ts`, `src/browser.ts`, `src/node-v3.ts`,
`src/browser-v3.ts`, `src/node-v4.ts`, `src/browser-v4.ts`). The root route was
then the TypeScript default; it is now the explicit `./reference` route.
Candidate entrypoints are opt-in; they do not prove installed
package routing. `./loader-contract` exports executable helpers and is counted.

## Historical TypeScript-root captured state

The machine-readable [inventory](inventory.json) records eight routes, 504
export-declaration source files and 1,135 route-specific runtime export
declarations across 1,126 unique export names. The package root contributes
1,120 declarations. Of the rows, 913 are assigned to a broad Rust candidate
family, six to host facade code, 17 to mixed host/Rust candidate families,
and 199 to generated or authored resource data. The latter includes 198
public JSON resource exports from `spec/` that the first capture omitted.
These are provisional family-level owner roles, not proof of implemented Rust
parity or individual operation mapping.

The original inventory contains no exact Rust operation mapping: its
symbol-level mapping/retirement count remains 1,135. The derivative
authority-bound ledger adds thirty-two exact, evidence-backed opt-in Rust core
operation mappings for default-root declarations: five core semantic-type
operations, Record value validation, full and compact dataset validate/verify,
Key tuple encode/verify, five core Key/Record-membership operations, four core
facet operations, six Field/Record/Group kind and Field nullability operations,
three cardinality operations, and retained semantic-type get/set accessors. Each
mapped row pins the Rust implementation source, linked R5 evidence packet, and
focused Rust test by SHA-256. Those hashes pin source identity; the linked
bounded packet defines the operation subset and remaining gates. Mappings do
not qualify host bindings, install a Rust default route, or retire TypeScript.
The `unassignedOwner` count of zero means only that every
row matched a coarse path-family heuristic; it is not a zero-owner gap result
and must not be used to close the R8 gate. The inventory's broad `ownerKind`
classifications are navigation aids, not semantic adjudications.

The source snapshot also confirms 922 default-route declarations still resolve
to TypeScript source, plus 198 default-route JSON resource exports from `spec/`.
Those counts describe source-level export reach; they do not assert what an
unpublished or packed package artifact contains.

Independent Sol review of the earlier six-route capture verified its script and
inventory hashes, reproduced `--check`, checked its package condition routes
against their build entrypoints, and found no P1/P2 or false zero-owner closure
in that stated source scope. The reviewer independently matched 87 direct root
JSON re-exports and confirmed that further JSON resources arrive through
barrels. The direct type-only exports were excluded. Sol then reviewed the two
V4 opt-in routes against `package.json`, `src/node-v4.ts`, `src/browser-v4.ts`,
and the capture script. They contribute two runtime declarations each. After
the V4 nullish-selection repair, Sol found the prior snapshot stale, recaptured
it deliberately, and reran `--check` successfully. The reviewed script SHA-256
is `41a561d85039d445905bee026adfe1ced40839093cf899c214eae175ca0605b3`;
the refreshed inventory was
`5e49a450b7f9f87607ca8c5df067a16d15b29a7dfecf7265aed95df67408a4be`.
After the R7 private SDK build entrypoints were added, Sol recaptured the
unchanged eight-route declaration census against the frozen development
`package.json` route. `--check` passes for the new inventory SHA-256
`e0bb6c94fdb59721d70720345fa35b9021903e96b1bcca6e2c18366780f0eac7`
and package manifest SHA-256
`7a959f026f0df94ba2ae6336e1e14b5fa4a3526fb616430daf1735d37300a2d4`.
This source-level review does not qualify installed routes, exact Rust
operation ownership, or retirement. Recheck the inventory when production
entrypoints and the package manifest change.

## Reproduce

Run from the repository root with Node 26 and the installed `typescript-api`
dependency:

```sh
node scripts/rust-migration/r8/symbol-inventory.mjs
node scripts/rust-migration/r8/symbol-inventory.mjs --check
```

The script resolves names and declarations using the compiler API rather than
textual export-name guesses. It checks the captured routes against the current
`package.json` exports and hashes that manifest and each export-declaration or
JSON resource source file. It intentionally
does not fail on project-wide diagnostic errors caused by third-party packages
without declaration files; pre-existing project checks own compilation
qualification. A stale export-declaration source capture is rejected by
`--check`; changes in transitive helpers without changed exported declarations
require the wider source-bound successor census.

## Limits

This packet covers package entrypoint exports only. Active scripts, CLI commands,
Python public APIs and exported algorithms not re-exported from these package
entrypoints remain in the wider successor census. The script does not inspect
runtime package archives, establish browser or Node behavior, or qualify a Rust
implementation. It lists declarations separately when overloads or multiple
source declarations appear. Host/Rust splits, generated-data authority,
contract-level support subsets, tests/oracles, and whether a duplicate TypeScript
implementation can retire require review. These limits keep this packet from
claiming zero unresolved R8 rows.
The parser does not yet contain synthetic negative controls for future
`export type` aliases of runtime classes/functions, ambient declarations, or
erased `const enum` values. Route checking compares package keys; condition
targets and build entrypoints were manually reviewed for this capture and need
renewed review when they change.

## Authority-bound gap ledger

[The deterministic gap ledger](gap-ledger.json) expands the default Node root,
default browser root and explicit `./reference` route into route-specific rows:
3,360 total (1,120 per route), representing 922 unique executable declarations
and 198 unique inert JSON aliases. It groups rows by source/API family and
records exact accepted-operation mappings plus route-specific default status.
Thirty-two unique declarations map to reviewed bounded Rust core operations.
Some linked packets also qualify specific opt-in bindings, but none by itself
retires a TypeScript default. Node and browser each contain one source-selected
Rust V4 declaration (`generatePythonClient`) whose installed qualification
remains pending; their other 921 algorithms inherit TypeScript. The explicit
reference route remains TypeScript. All 922 logical executable declarations
retain a default-route gap. The other 890
executable rows lack an accepted-operation disposition. A separate
26-row JSON Schema/Protobuf supplement records exact owners and scoped opt-in
evidence without upgrading candidates to full parity. Of the 922 logical
executable declarations, 921 still inherit TypeScript on each default root
condition; the Rust-selected generator lacks installed qualification. None is
marked retired. Route duplication does
not multiply unique resource aliases or per-alias authority counts; route-level
rows preserve each condition separately.

JSON resources are recorded as retained data rather than executable algorithm
gaps. Their authoring authority, generator, packaged path and installed bytes
still require per-family evidence. The census justifies no thin host boundary
by name or location; a host wrapper needs its own capability and behavior
review before it can be retained as final glue.

The ledger separately inventories all 42 `package.json` scripts and their 45
directly named source-file entrypoints. It hashes all 1,518 source files under
`scripts/`, marking only direct package-script entrypoints active by that
evidence and leaving other helper reachability unresolved. It also lists eight
native CLI dispatch modes, the `umf` Python package root (`__all__` plus
module-level public-by-convention callables), and the `umf_access` and
`umf_codegen` Python packages. Python module walking is recursive. The CLI rows
are derived from dispatch branches in `main.rs` and record Cargo feature gates;
nested subcommands and options remain open. The Python census covers `umf` (23
root exports, 27 modules and 122 public-by-convention callables), `umf_access`
(40 explicit import-re-export candidates without `__all__`, 88 modules and 162
such callables), and `umf_codegen` (21 root exports, six modules and 11
callables). It also hashes the 14 tracked non-Python package assets (inert
resources and typing markers). Ignored or untracked build binaries, including
the local `_rust_core.abi3.so`, are excluded from the deterministic source
census because a clean checkout cannot reproduce them. Module callables and `umf_access` imports are
candidates, not a claim that each name is a supported API. These surfaces
remain outside the package-root declaration counts and need exact contract,
Rust operation, binding and release dispositions.

### Exact-operation supplement: JSON Schema and Protobuf

The ledger now attaches a source- and evidence-hashed `operationOwnership`
record to each of the 26 package-root exports in the JSON Schema and Protobuf
adapter surfaces (13 each, including `parseNativeJson`). The rows distinguish
`accepted-opt-in-subset`, `candidate-core`, `partial-host-boundary`,
`unported`, and `data-or-constant`; each also records its support profile,
exact Rust owner where established, wire/binding route, predecessor/native/host
gates, known mismatches, default-route status, source/evidence closure hashes,
and review status. The generated distribution is 3 accepted opt-in subsets,
13 core candidates, 2 partial host boundaries, 3 unported rows, and 5
data/constant rows. The focused ledger test asserts the categories, exact
operation mappings, 64-hex source/evidence hashes and zero retirement claims.

At the prior ledger capture, JSON Schema's successor host cohort was 27/30 against the frozen
predecessor, with three known validator-limit differences. The later bounded
[validator-limit successor replay](../r5-json-schema-inspect/validator-limit-successor.md)
and retained [host receipt](../r5-json-schema-inspect/validator-limit-receipt.json)
pass all 30 cases on extracted Node, Bun, WASM, and Chromium candidates, including
those three cases. The opt-in qualification is limited to its recursively
checked Draft 2020-12 profile and captured macOS arm64 artifacts; it does not
establish the full Draft corpus or change default routing. Its named Rust
owners and wire routes describe specific candidates, not general Draft 2020-12
parity. The Rust `edit_node` core function has no wire/binding route;
`editJsonSchemaNode` is only a core candidate. Protobuf descriptor
codec operations are separated from document operations. The codec's
`accepted-opt-in-subset` profile is limited to the installed CPython 3.11.17
Darwin arm64 wheel evidence; document operations remain core-only candidates.
The Protobuf inspector is a distinct opt-in subset and continues to require a
native compiler for full validation. Source import/export remains a
`partial-host-boundary` because compiler/printer callbacks stay host-owned.
Registry and descriptor-edit wrappers have no established matching Rust
operation. These records do not change the Node/browser root selection: the
generator is Rust-selected in source while the other 921 algorithms still
inherit TypeScript. No row is retired.

The accepted core-operation map uses the same exact source-export boundary. It
pins each named Rust source, predecessor evidence packet and focused Rust
integration test. The five core Key rows are limited to the operations frozen
in `r5-core-keys`; its packet covers exact result/refusal order but does not
establish host routes. The four facet rows are limited to the bounded
inspection/declaration/verification/historical-projection profile in
`r5-core-facets`; Python exposure and exhaustive allocation-failure checks
remain open. The three cardinality rows map the exact current core 0.10.0
inspection/declaration/verification operations. Their opt-in model-binding
receipts do not claim native cardinality equivalence. Adjacent
`readCoreKeyTupleBytes`, `prepareCoreKeyTuples`, the
callback-bearing `SemanticTypeRegistry` class, `semanticTypesRegistry`, and
`validateSemanticTypeValue` remain unmapped because their host/capability
boundaries are not established by these packets. Source hashes pin identity;
the bounded R5 packets define each subset and its remaining gates. All 922
executable package-root declarations retain a retirement gap: 921 inherit
TypeScript on each default condition and the Rust-selected generator lacks
installed qualification. No row is marked retired.

The six kind/nullability rows additionally cite the opt-in `r5-model-bindings`
Node/Bun and real-browser receipts. Those receipts establish only the named
model-factory route; they do not qualify default package routing, Python, native
classification, or retirement.

Successor update: the bounded [R5 validator profile](../r5-json-schema-inspect/README.md),
[validator-limit replay](../r5-json-schema-inspect/validator-limit-successor.md),
and independent [Sol review](../r5-json-schema-inspect/sol-review.md) pin a
30/30 frozen installed replay on Node and Bun and a 30/30 real Chromium replay
for its restricted Draft 2020-12 grammar. The ledger generator's JSON Schema
rows have been updated to that exact subset and retain candidate-core status.
The earlier 27/30 packet remains historical evidence; full Draft corpus,
reference and anchor semantics, edits, and default-route retirement remain
open. The source inventory still counts 922 TypeScript-default executable
exports.

The operation-level supplement is generated from explicit export-to-owner
entries in `scripts/rust-migration/r8/gap-ledger.mjs`; candidate-family labels
and similar operation names never create a mapping. Sol reviewed the bounded
26-row mapping schema, source/evidence digests and representative literal Rust
dispatch; operation-specific parity and final row-level retirement review remain
open.

### JSON resource ownership and action-runtime mirror

The resource supplement resolves the 198 exported aliases to 189 distinct
`spec/` files. Four aliases have metamodel-manifest generator authority; 112
have one candidate literal writer path but no proven writer/input relationship;
82 have unresolved generator authority. The current SDK `spec/` copy and archive
inclusion are source/build-rule routes only: no current production archive or
installed Node/Bun/browser asset receipt qualifies these bytes. Every JSON
export remains a TypeScript default-route data export, with no retirement claim.
Sol independently checked the 4/112/82 classification and a representative
unresolved Arrow schema row; the candidate status does not infer authority.

The separate nine-resource Python action-runtime mirror is checked against a
fixed name/source map in `python/src/umf/_action_runtime_manifest.py`. Explicit
`scripts/rust-migration/r8/sync_action_runtime_resources.py --write` refreshes
the manifest and digest pin; ordinary Hatch wheel/sdist initialization checks
them without writing. The checker refuses missing, extra, substituted or
symlinked inputs and a stale pin hidden by a comment or duplicate assignment.
Sol reviewed and corrected an initial self-referential manifest check and the
sdist checker's literal Hatch-list dependency. Source tests pass 45/45, the
actual source-archive inventory is 736 files, and `--check` passes. This is
source alignment; no newly built wheel or SDK asset has been qualified here.

Next clusters are ordered as core semantic operations, adapter import and
inspection families, extension/domain-pack boundaries, projections/schema
emission, generated resource authority, then CLI/scripts/Python closure. Each
cluster requires exact operation vectors, controls, source-bound evidence and
installed route review before it can retire TypeScript behavior.

Reproduce with Node 26:

```sh
node scripts/rust-migration/r8/gap-ledger.mjs
node scripts/rust-migration/r8/gap-ledger.mjs --check
node --test scripts/rust-migration/r8/gap-ledger.test.mjs
```

The gap-ledger generator SHA-256 is
`0c5fc9f1ac76ea911ae0caaa98199c76a01f4af10b03a237144f9f3f7c28dde3`, the
focused test SHA-256 is
`3e1dc23a3516f2956c9936f1cf20267e3aa568edc7e2905175ef393b7def76c5`, and the
generated ledger SHA-256 is
`b02d11b2b031197d41e881de8e1c6e4fd5a221e85f31f40397c5f9511b20c1fd`.
The ledger input inventory SHA-256 is
`5e49a450b7f9f87607ca8c5df067a16d15b29a7dfecf7265aed95df67408a4be`.
These hashes capture an earlier interim shared worktree cohort and are not the
current moving-tree ledger after the resource supplement. Other R5/R8 work can
change the script source set; rerun generation and `--check` at final
integration freeze before treating a snapshot as current. Every default-root
executable row still has an explicit port/route gap; this ledger advances the
census, not the R8 retirement gate.

Independent Sol review reran the deterministic check and focused tests (2/2),
compared the 40 `umf_access` root import candidates with Python's AST (no
missing or extra names), and confirmed every one of the 14 Python assets is
tracked in Git. The initial ledger omitted `umf_codegen` and the
`umf_access` import surface and counted an ignored local native binary; those
gaps were corrected before acceptance. Sol also checked that all 922
executable root rows retained an explicit retirement gap and that
none claimed a proven binding or retirement. The current condition-specific
inventory supersedes that interim default-route characterization. Exact Rust
mappings, installed routes, transitive script
reachability and release qualification remain open.

## Current coordinated recapture (2026-10-25)

After the Core Evolution meter fix, JSON-number and relationship-selection
opt-in bindings, metamodel/resource mirror refresh, and reviewed schema
authorities, Sol regenerated both source-bound snapshots. The inventory has
3,375 route-specific declarations across 506 source files. The ledger records
922 logical executable default-route retirement gaps, 54 accepted opt-in Rust
operations, 868 executable names without an accepted mapping, and zero proven
current-cohort default binding routes. Its 198 resource aliases across 189 files classify as 39
generated-known, 36 authored-known, 88 candidate-generated and 35 unresolved;
installed SDK archive bytes remain unqualified. `./reference` retains its
separate TypeScript route.

Inventory SHA-256 is
`03b684d7e58c6df7997d70021f9a34c9fef196432b53d024ada96d78b79052a4`;
ledger SHA-256 is
`0b62c22af96cebdee3f96f26a50f2f90fcea7e08ce7572fa5c13065a8ff9eb69`.
Generator source hashes are
`129ccfebe9dec7df10a8240db9f39dc2825a056bff890a43b7ac6a07ad3a1c78`
and `05f7f3ab016d8fc31880531be4077281c74155bec77dbdde38166f9543c13069`,
respectively; focused test source hash is
`61746e7ed01ab83a6b3550eff196366b057fe0dc5a9b41fc57cc2cfe2c83b77a`.
Both snapshot `--check` commands and the 37-test ledger suite passed. The
metamodel fixed point, Python resource mirrors, TypeScript typecheck, WASM
shared-source map, Rust-boundary gate (695 checked modules, zero V8 debt),
Python sdist/artifact custody (16 tests), and `git diff --check` also passed
at this source cut. These source checks do not qualify a publishable archive,
the six-host Python release matrix, or default-route retirement.

## Security binding recapture (2026-10-25)

The reviewed [security truth/composition binding](../r8-security-truth-logic-binding/README.md)
adds four exact opt-in Rust mappings and leaves the TypeScript default roots
and explicit `./reference` route in place. A condition-aware inventory
recapture also refreshed the source pin for `rust-host-reads-v4.ts` and the
additive Node/WASM binding entrypoints. The inventory now has 3,375
route-specific declarations across 506 source files, SHA-256
`f517fd3e58950f1feffe2bfdf0d13bb3ab08cea607b17a1ad79bccfb42f95201`.
The matching ledger SHA-256 is
`f7081e0f94ff93a3e2a54e8e85f37e46ebea6016963beab3d0977c4446960408`.
It records 58 accepted opt-in mappings, 864 executable names without an
accepted mapping, all 922 logical default-route retirement gaps, and zero
proven current-cohort default binding routes. Resource authority remains 39
generated-known, 36 authored-known, 88 candidate-generated and 35 unresolved
files. The inventory and ledger `--check` modes and the 38-test focused ledger
suite pass; installed package closure and release qualification remain open.

## Serialization profile recapture (2026-10-25)

The opt-in [JSON-compatible value serialization profile](../r8-json-value-serialization/README.md)
repairs Node/WASM alias format selection and a bounded Rust parser/writer
subset without changing generic value operations or the default TypeScript
roots. Its refreshed 24-case predecessor packet changes six generated
source-closure hashes but no case input or outcome. Node, Bun, WASM and real
Chromium each match 22 cases; duplicate-key and multiple-document YAML
diagnostics remain explicit mismatches, so neither export is accepted as a
full Rust mapping. The condition-aware inventory SHA-256 is now
`0ed368b556c3abbb4dd7534ed18ec68fef9738da0124fca2612293a371e0a56c`;
the matching ledger SHA-256 is
`5f55f338943c1a9bfb082a668d4fa6342d97787dafd3e7a99a14e66e6bdf32df`.
The ledger still records 58 accepted opt-in mappings, 864 unmapped executable
names, 922 logical default-route retirement gaps, zero proven current-cohort
default binding routes, and the same 39/36/88/35 resource authority counts.

## YAML diagnostic and relationship authority recapture (2026-10-25)

The [serialization profile](../r8-json-value-serialization/README.md) now
matches all 24 frozen cases with the fresh Node/Bun native addon and Node,
Bun, and Chromium WASM builds. The native Bun test temporarily used the fresh
dylib in place of an ignored stale checkout addon.
The [relationship resource authority review](relationship-resource-authority.md)
pins four directly authored files representing five exported aliases; one
relationship-selection schema remains unresolved. After regenerating the
metamodel and source-bound snapshots, the inventory SHA-256 is
`1d7589b8bad71a50f1fdcebcc50bfa897af25d7dbd2cdfbdf452f6a5ae8aa3c2`
and the ledger SHA-256 is
`12485a87eb3aba1a6ca8f52aa1b4c196445b89d4b325af18da9ab6320b99368f`.
The 198 resource aliases across 189 files classify as 39 generated-known, 41 authored-known,
88 candidate-generated and 30 unresolved. All 922 logical default-route
retirement gaps remain open; no installed SDK archive is qualified by this
recapture.

## Exact writer and authored-resource recapture (2026-10-25)

The [CSV Boolean and SQL Server nullability review](resource-authority-csv-boolean-sqlserver-nullability.md)
pins one newly authored operation schema and one exact generated schema
writer. The [Delta log, Parquet framing and Spark datatype review](resource-authority-delta-parquet-spark.md)
pins three more exact writers with isolated byte-for-byte output checks and a
Parquet writer-mutation negative control. These classifications concern source
authority and package paths; only the separate
[CSV Boolean installed-route packet](../r8-csv-boolean-default-route/README.md)
qualifies two executable operations in one private archive.

After the metamodel and action-identity fixed point, inventory SHA-256 is
`426057d73541807b4226181f56b49aeae4c845412faf0c9c48eef819a26f9447`
and ledger SHA-256 is
`ab924386439ee3de1abf76f8f91bea66cae8df9882002f7bb40370210800b289`.
The 198 resource aliases across 189 files now classify as 43 generated-known, 42
authored-known, 88 candidate-generated and 25 unresolved. All 41 ledger
tests, both snapshot `--check` modes, the metamodel check, typecheck and the
strict Rust boundary gate pass. The ledger still records 922 logical default
route retirement gaps, 58 accepted opt-in mappings, 864 unmapped executable
names and zero current-cohort binding routes promoted by an explicit
retirement review. Older operation-version resources and the composite
relationship-selection schema remain unresolved.

## Current R8 source-bound recapture (2026-10-25)

The [older operation authority reviews](core-operation-schema-authority.md)
and [follow-up](older-core-operation-schema-authority.md) found eight
unresolved schemas at that checkpoint: historical writers reproduced previous
bytes but did not establish current authority. The later versioned-operation
review below resolves two of those eight. The [selection review](core-selection-schema-authority.md)
pins exact CONTRACT-078 authorship for the semantic-types selection schema;
three composite selections remain unresolved. The [projection, Parquet IDL,
and SQL Server review](projection-parquet-sqlserver-resource-authority.md)
pins three authored schemas and the Parquet IDL's historical generated bytes.
The Parquet compiler could not be freshly replayed because the pinned
`thriftpy2==0.5.3` was unavailable; the ledger records that limitation and
correctly identifies the writer as Python 3 build tooling.

The [versioned operation follow-up](versioned-core-operation-resource-authority.md)
establishes direct authorship of the current Kind 8 and Nullability 7
inspection schemas while retaining six older operation schemas as unresolved.
The [semantic-types operation review](semantic-types-operation-schema-authority.md)
adds one exact CONTRACT-078 authored schema. These are source-authority
findings, not installed-resource or runtime claims.

After rebuilding the source-bound metamodel, synchronizing the Python codegen
and action runtime mirrors, and refreshing action-plan identity, the
condition-aware inventory SHA-256 is
`47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`;
the ledger SHA-256 is
`75ff82583c884d4351883e5644e83b320e693f8359e62ad0f1bfebc167495e77`.
The 198 resource aliases across 189 files classify as 44 generated-known, 49
authored-known, 88 candidate-generated, and 17 unresolved. All 43 ledger
tests pass, both snapshot `--check` modes pass, the metamodel fixed point and
both Python resource-mirror checks pass, and the strict Rust boundary gate
reports 702 source modules with zero V8 debt or findings. The executable
ledger still has 58 accepted opt-in mappings, 864 unmapped names, 922 logical
default-route retirement gaps, and no proven current-cohort default binding
route. Installed SDK, the full Python wheel/sdist matrix, and release closure
remain open.

## Current private installed-route recapture (2026-10-25)

The [CSV Boolean replay](../r8-csv-boolean-default-route/retirement-review.md)
uses a 3,431-file fixed-point private SDK archive (SHA-256
`bdd14aa62e09df465d784bb7889c4d7ddfc79c61f8186acf6eb2423ce35e8b3b`,
source closure
`83730261e84c90533a4cf2b5710550c92655f1f9519961e04e718a86187851e9`).
Its 14 frozen cases and 18 adversarial host-object cases match the installed
TypeScript reference in Node 26.12.1, Bun 1.4.3, and Chromium 153. Sol
independently reran the adversarial harness and obtained the byte-identical
receipt SHA-256
`6bebf6780e32f09de0eaee450faf9266c1af2bf99ab21cccd519a5cbf67b77b2`.
The [three Core inspector replays](../r8-core-inspectors-installed/current-source-replay-20261025.md)
pass 26 frozen installed cases on the same archive and hosts; selected
accessor, hidden-member, and symbol-key errors still differ in Node/Bun.
These five operations have bounded current private installed binding-route
evidence, not complete host parity or retirement approval.

The condition-aware inventory remains SHA-256
`47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`;
the refreshed ledger is SHA-256
`035ce31bd7f69a2834f6434322a1a8115207b11289aeb6ca20b09ddd4f91671e`.
It records five unique executable names with current private binding routes,
58 accepted opt-in Rust mappings, 864 unmapped executable names and 922
logical default-route retirement gaps. The resource aliases remain 44
generated-known, 49 authored-known, 88 candidate-generated and 17 unresolved.
The [remaining five-schema review](remaining-schema-authority-review.md) keeps
those selection, Parquet and SQL Server resources unresolved because their
current writer or exact governing resource-path authority is unproven.
The explicit `./reference` route still contains TypeScript executable
semantics. The private SDK archive and the one-host
[Python installed cohort](../r8-python-v8-closure-audit/current-source-installed-20261025.md)
do not qualify a complete port or the six-cohort release matrix.

## Current source-provenance refresh (2026-10-26)

The deterministic ledger was regenerated after the Core Key staging and
generated metamodel/V4-root source edits. The new ledger SHA-256 is
`b569e0867e97b7e779692e0a7f7112579f3a125800490de8ce03a072c9621111`.
The condition-aware inventory remains
`47d46f3a3fe2dd5c621d3c05a11590db2567b98f7e172f120d92554489d84cec`.
The regeneration changes provenance hashes and repeated source-closure pins;
it does not change the 3,360 route rows, 58 accepted opt-in mappings, 864
unmapped executable names, 922 logical retirement gaps, five previously
recorded bounded installed binding routes, or resource classifications.
`gap-ledger.mjs --check` and its 52 focused/integration tests pass. The
five-route evidence is historical relative to the latest Core Key archive
until all selected routes are replayed against one common closure; it does
not retire a logical gap.

## Current fixed-point R8 aggregate ledger (2026-10-26)

The [current private installed-route aggregate](../r8-installed-route-evidence/current-a2552db0/aggregate.json)
passes its separate [gate](../r8-installed-route-evidence/current-a2552db0/gate-result.json)
for 24 bounded Node/Bun/Chromium operations on archive SHA-256
`6adacc2f019d6cf73c856c9002ba75fb1d33ca22cb56182e63806296983661e` and exact
source closure
`6a6bef1345e9f90e0d26dd8841ed27ba2ca6f3db8e6dfd330fb78dd9f42cb14c` across
3,439 inputs with zero generated transforms. Independent preflight verified
1,788 of 1,788 package payload members. The current ledger SHA-256 is
`fec93cab8b0825ae66af096ad166012465a9c1edf07c77c484335d82b61f73df`.
It records 62 accepted opt-in Rust mappings, 860 unmapped executable names,
24 bounded aggregate-proven routes, all 922 logical retirement gaps, and 9
unresolved resource aliases. Separate Schema Properties, Facets and
Cardinality gates preserve their narrower scopes. Previous archive and ledger
cohorts remain historical; no declaration is retired or release qualified by
this private archive evidence.

## Integrated Rust-port source refresh (2026-10-26)

After merging main's schema-browser npm publisher and Core 0.10.2 PyPI
publication receipts, the current source and generated resource closure was
rebuilt. The condition-aware [inventory](inventory.json) has SHA-256
`ae64e464126dc2a7c92fcc76a33f6f59a0e271c0fd0add7aaeb3669f6050fffe`;
the [ledger](gap-ledger.json) has SHA-256
`189c19968d25619ca038e62413e9341cdff816c0216e13dbea57801164a13f54`.
The ledger's fixed-point check and 47 tests pass. It records 67 accepted
opt-in Rust operation mappings, 855 executable names without an accepted
mapping, five bounded binding routes, and all 922 logical default-route
retirement gaps. The new private Selection, captured-graph and release-custody
slices do not change the default route or qualify a release.

## Current canonical regeneration after Selection and JSON Schema changes (2026-10-26)

After JSON Schema profile commit `202aff524`, canonical Rust-owned metamodel
outputs, the Python action-runtime resource manifest, action-plan identity,
symbol inventory, and condition-aware gap ledger were regenerated against the
current worktree source cohort. `bun scripts/metamodel/build.ts --check`,
`bun scripts/actions-plan-identity.ts --check`,
`python3 scripts/rust-migration/r8/sync_action_runtime_resources.py --check`,
and both inventory and ledger `--check` modes pass. The 49-case gap-ledger
suite passes 49/49 and the metamodel suite passes 61/61. The real Chromium
replay passes in Headless Chrome 153.0.8010.12: 138 strict-core cases and one
explicit registry-callback case, zero failures and zero page errors. Bun is
1.4.3. The bundle SHA-256 is
`491f7cf035467d0b4f9d8a598242793e8da16a6f96e8500a1b59dbf67f6151d9`; the
receipt is [here](../../metamodel-authority/browser/receipt.json), with
SHA-256 `fd3f0acb3b96a196dc3d6ecf7c2182c6ea6ab7ebd5a4541d1b664f7a5dc80855`.

The regenerated metamodel manifest SHA-256 is
`e36dd31730c7d821aa6ddb64435203509271f7826a314aa86c2a090911812263`;
`spec/core/schema.json` is
`1f8424ecdd4086ab5ca0720e3978294eaf22b9707da5e0690fe451cf1193eb4f`, and
`src/generated/core-validators.ts` is
`a4a7de1d3e4abd588c7a178c8e5d851d964c20d22dc3d3f652bfbd3589a63762`. The
nine-resource action-runtime manifest pin is
`70b9d6947d7c0478c1fc161be6b58cf0eb3e646419abc34c14e7dd069f51ab53`; the
action-plan identity source SHA-256 is
`958ccf117704a368ce1c002cf02e2aa47b479d649972bb2f07f720ee38648257`.

The condition-aware inventory SHA-256 is
`6e5e211273b6f1678e03706a0a2bfe26c654c31f49348759e013305c067d3a4a`: ten
routes, 3,375 route-specific runtime declarations, 1,126 unique declaration
names, and 506 source files. The regenerated ledger SHA-256 is
`aa9fa724b9d0f4cbcd57928dc5b1a255681791a70c4cf10b45b9d3e151a3b377`. It
records 3,360 route rows, 922 executable names, 72 with accepted opt-in Rust
operations, 850 without accepted Rust mappings, all 922 logical default-route
retirement gaps, 198 resource aliases across 189 files, and authority counts
of 56 generated-known, 49 authored-known, 88 candidate-generated, and 5
unresolved. The source census does not retire declarations or qualify a
release; bounded route evidence remains separately scoped in the ledger.

Reproduce the snapshots and checks with:

```sh
export UMF_METAMODEL_CACHE_DIR=/private/tmp/umf-metamodel-cache-20261026
bun scripts/metamodel/build.ts
bun scripts/actions-plan-identity.ts
python3 scripts/rust-migration/r8/sync_action_runtime_resources.py --write
node scripts/rust-migration/r8/symbol-inventory.mjs
node scripts/rust-migration/r8/gap-ledger.mjs
bun scripts/metamodel/build.ts --check
bun scripts/actions-plan-identity.ts --check
python3 scripts/rust-migration/r8/sync_action_runtime_resources.py --check
node scripts/rust-migration/r8/symbol-inventory.mjs --check
node scripts/rust-migration/r8/gap-ledger.mjs --check
node --test scripts/rust-migration/r8/gap-ledger.test.mjs
bun test tests/metamodel
bun scripts/metamodel-browser.ts
```

## Protection-binding source-coherent recapture — 2026-10-26

After the opt-in protection query-property and typed-parameter Node/WASM
bindings at `2ef24d6a6`, the canonical metamodel, action-plan identity,
nine-resource Python mirror, condition-aware inventory and gap ledger were
regenerated in that order. Their current SHA-256 values are:

| Artifact | SHA-256 |
| --- | --- |
| `spec/metamodel/generated/manifest.json` | `5d5a5e504951860adcb76c17ce6bc379037476fb9556b5ce359ace8ef4fa9556b` |
| `src/extensions/actions/plan-identity.ts` | `980e6b49736003164409ca732fa0072fd511bb9817af57e95fad1d3579426856` |
| `python/src/umf/action_runtime_resource_manifest.json` | `30d65f75f48cbb232f3efa36f1d918a31639ab73452e20c211221a4d4d9439a6` |
| `inventory.json` | `27257b8aca2c84560a8b99321a9b542f87d1373cc9ec3fc426498c3824d1ee16` |
| `gap-ledger.json` | `62bd01d3d85d63f5f8c5caca5e9a246f6e5f86107496cf27a488e14403fe58e3` |

The inventory records ten routes, 3,375 route-specific runtime declarations,
1,126 unique declaration names and 506 source files. The ledger has 3,360
condition-specific public-root rows: 922 logical executable names, 77 accepted
opt-in Rust mappings, 845 without accepted mappings, and **922 open logical
default-route retirement gaps**. Each default root still has 922 executable
rows, 50 Rust-selected declarations and zero retired declarations. The
reference route retains 922 TypeScript executable rows. The five new
protection mappings are bounded candidate ownership, not default selections.

The ledger's new route-aware retirement status is deliberately open for every
production Node/browser executable row and `reference-only` for the explicit
reference route. Its 52-test suite includes synthetic paired-route accounting
that would count three retired pairs as 919 logical gaps, but production ledger
generation has no retirement-evidence override. This prevents arbitrary
hash-shaped evidence from lowering the count. A reviewed current-source
evidence gate and direct TypeScript-consumer analysis are required before a
real row may be retired.

The metamodel, action identity, Python resource mirror, inventory and ledger
`--check` modes pass. The metamodel suite passes 61/61, the ledger suite passes
52/52, typecheck and `check:core-authority` pass, and real Chromium 153
metamodel replay passes 139 cases across its two profiles without page errors.
`check:rust-boundaries` passes with zero V8 debt, zero findings, its negative
controls, and 16 plus 19 Python tests. The focused protection binding receipts
remain opt-in and source-scoped; this recapture is not an installed SDK archive
or a release qualification.

## Inspector consumer source recapture — 2026-10-26

After the V4 raw-profile helper began injecting the Rust-bound Record Members
inspector, the metamodel and nine-resource Python mirror remained fixed-point.
The action-plan source identity was regenerated, followed by the condition-aware
inventory and ledger. The action identity SHA-256 is
`300debe98f657bde0aacac7b89961b3f9de370d1bc60b279a4ab4081320dbef9`;
the inventory SHA-256 is
`bbcf418908ec486eb6890e7eb4f2bd8fc55c9812347d6dc93626029426492532`;
the ledger SHA-256 is
`93e4ffda4f8e87748f5bd067046e4fb194b2986e027f18370b6b9f86d917319d`.
The source census now includes 507 files and 3,375 route-specific declarations.
Each V4 root has 51 direct declarations, of which 50 have accepted Rust
operation ownership; the new `inspectRawTableBinding` declaration is a mixed
TypeScript wrapper with an injected Rust inspector, not an exact Rust-owned
operation. The explicit `./reference` helper remains TypeScript.

The ledger continues to record 77 accepted opt-in mappings, 845 unmapped
executable names, 922 open logical default-route gaps and zero retirements.
The new exact-shape annotation and its negative controls pass in the 53-case
ledger suite. This recapture describes source selection only; the updated
helper still needs a source-current installed archive replay before any
retirement review.

## Compact verifier build-bound source recapture — 2026-10-27

The current inventory SHA-256 is
`5a901c4943624f6bb69759fa7ba4eadea0cb0a0519549898d168df69dc80cc6d`.
The regenerated ledger SHA-256 is
`bec39f2da2ff8d2078285a5f5e13c476521ffe2ef60ad4e5967f2bdb0025d4b5`.
It records 81 accepted opt-in Rust mappings, 841 unmapped executable names,
57 source-selected declarations per Node/browser root, **922 open logical
default-route gaps**, and zero retired declarations. The `verifyCoreDatasetValuesCompact`
source-only claim now requires all three host receipts to name one immutable
[build manifest](../r8-compact-dataset-verify-source/build-manifest.json) and
match its source closure and six compiled artifact hashes. The ledger rejects
stale source and artifact bindings; its focused suite includes negative
controls. The four Core Semantic Types declarations remain source-selected
but current-route unqualified because their earlier 16-case source replay did
not capture an immutable three-host build cohort. Installed archive and full
retirement qualification are separate gates.

## Fixed-point V4 source recapture — 2026-10-27

The canonical action-identity generator now leaves
`src/extensions/actions/plan-identity.ts` at SHA-256
`525e20080bdcc27588dbf46064a74f8e5c4ac1f44adf5db775068e089acabc8e`.
The inventory SHA-256 is
`1ee0ccbaaa27749d92a6f4820ccf3e962d3a027829b6284b0fe0ec72fcd9958c`;
the regenerated [ledger](gap-ledger.json) SHA-256 is
`553a4924258b04d04e4f561138cc4c509910a9f4c00d545b1e617590c104426a`.
The ledger accepts the five-case Compact Dataset verifier receipts and the
68-case Security And/Or receipts only when Node, Bun, and Chromium bind to the
same immutable build manifest, SHA-256
`4d25c856fdac60bd5e0ae9c0bf7ac9afeda235251c13c05f313e3c6da96e5f3e`,
its expanded source closure, and its exact six compiled artifacts. The
62-case ledger suite passes, including stale source, artifact, and manifest
negative controls.

The counts remain 81 names with accepted opt-in Rust operations, 841 without
an accepted Rust mapping, **922 open logical default-route gaps**, and zero
retirements. Source selection and bounded three-host evidence do not imply
whole-route parity or release qualification. Separate 16-case Core Semantic
Types source receipts now exercise public `UmfError` identity in all three
hosts; the four ledger rows remain conservatively current-route unqualified
until their own immutable receipt gate is added to this ledger.

After the installed Security replay gained archive-payload verification, the
ledger was deliberately regenerated. Its current SHA-256 is
`4b09f83b44faa7c8c744f6520712f65832f3f1d5f8a1c3dd7576751e4df4a32b`.
The only change from the preceding ledger is the SHA-256 of
`scripts/rust-migration/r8/security-and-or-installed-replay.mjs` in the
repository script census. All counts remain unchanged: 922 open logical
default-route gaps and zero retirements.

## Opt-in ordinary JSON binding source recapture — 2026-10-27

The isolated primitive-string `readJsonValue` N-API seam adds no default
Node/browser export. The symbol inventory remains SHA-256
`1ee0ccbaaa27749d92a6f4820ccf3e962d3a027829b6284b0fe0ec72fcd9958c`.
Because the shared N-API source and generated metamodel manifest changed,
the five-case [Compact verifier replay](../r8-compact-dataset-verify-source/README.md)
and 68-case [Security And/Or replay](../r8-security-and-or-v4-source-replay-current/README.md)
were rebuilt and rerun on Node 26.12.1, Bun 1.4.3 and real Chromium
153.0.8010.12. Both host sets bind to the same immutable build manifest,
SHA-256 `9d70a420cc76a308bd42d3984993bc616919e718f3073bceb332822625b363cc`,
with source closure
`d0d54682e6bc91b1eaa31d55d2b425b0bfbe706b6e2fe3be966422cccd2cc264`.
Prior exact receipts remain under each packet's historical directory.

The regenerated [ledger](gap-ledger.json) SHA-256 is
`8c22bcd000582fc48dc29345fe0c6f631e132b6a1bb033e08494908c0ee6fb1c`.
It still records **922 open logical default-route gaps and zero retired**,
with 81 accepted opt-in mappings and 841 unmapped names. The isolated
ordinary JSON binding is a failing opt-in parity spike and adds no accepted
mapping or installed qualification.

## Compiler-provenance refreeze and current-source recapture — 2026-10-27

The generated metamodel compiler-provenance refresh changed the two source
hashes in the Compact verifier's current index without changing any of its
five frozen payloads or their model hash. A new private build, manifest SHA-256
`65bb6505f247e221f55b3e0fe7a5b998c76ef7470b390bfae33c8140add3d5aa`,
binds 1,967 live source inputs at closure SHA-256
`571569bc131aaa1a38c6d52edfd2273cec7cf13e52e01b77eb63d8b2b03c31ed`.
Node 26.12.1, Bun 1.4.3, and Chromium 153 passed the five Compact cases. A
separate replay of the 68 Security And/Or cases on the same build passed all
three hosts with 30 valid Rust/WASM calls and zero refusal calls per host.
Both packets preserve their preceding receipts and indexes under historical
directories, and their checksum indexes verify.

The regenerated [ledger](gap-ledger.json) SHA-256 is
`2e86c1158af02db939d3d997dffe88a00c607be17299ab485a65a6dce3cbeaf7`.
Its current check passes. It records 81 names with accepted opt-in Rust
operations, 841 without accepted mappings, **922 open logical default-route
gaps and zero retired**, and five names with bounded current-source route
proof. This source replay does not qualify an installed SDK archive or release.

## Arrow and host-input source recapture — 2026-10-27

After the opt-in Arrow schema core, `copyJson` host-input binding, and SDK
source-inventory gate were added, the five Compact and 68 Security And/Or cases
were replayed from one fresh build on Node v26.3.0, Bun 1.4.3, and Chromium
153.0.8010.12. The [Compact packet](../r8-compact-dataset-verify-source/README.md)
pins build manifest SHA-256
`1dfb786e44d32a22ed7595bf7f3b4a6be0692b5932c3b9de87ad2da894996ae4`
and 1,969-input source closure
`45133a5eab727481d7ee30d0cfaa1e00ccf2b10ea9d0117a9952887f17e00f2c`.
Security receipts bind that same build. The Compact cases made 14 native/WASM
dispatches per host; Security made 30 valid dispatches and zero refusal
dispatches per host. Both packets preserve their preceding current receipts
under `historical/pre-arrow-copyjson-source-20261027/`, and both checksum
indexes pass.

The regenerated [ledger](gap-ledger.json) SHA-256 is
`c432635cf345e9d8c6f6c36114078f40403c96dcfb9590d329d201781c05a8ba`.
It still records 922 open logical default-route gaps, zero retired, 81
accepted opt-in Rust operation names, 841 without accepted mapping, and five
names with bounded current-source route proof. The Arrow core and `copyJson`
entrypoint are not default-route selections. These source replays do not
qualify an installed SDK archive or a release.

## Arrow pointer correction and refrozen source replay — 2026-10-27

The Rust Arrow schema inspector now emits the correct `/fields/0/...` JSON
Pointer for a nested field diagnostic. That source change refreshed metamodel
compiler provenance; the Compact predecessor refreeze changed only the two
generated schema pins, with all five payloads byte-identical and the same
model hash. The new [Compact packet](../r8-compact-dataset-verify-source/README.md)
uses current index SHA-256
`475f7311eec810c84806b23ee6d0bd41c99bedc9b2bc84bd99318962d917db68`,
build manifest SHA-256
`0faa8dc02cb0e0068af0b66c5e0cffe46a7d16c3c15d953403916c643bc6dc65`,
and 1,969-file source closure
`12e2975de46a4bed5749e4f93390959f2a0ebed30cf23b36940189c328451a61`.
All five Compact and 68 Security And/Or cases passed on Node, Bun, and real
Chromium against that build. Both packets retain the preceding exact cohort
under `historical/pre-arrow-pointer-20261027/`, with verified checksum
indexes. The separate private SDK build also reached a fixed point with zero
source transforms at captured/live closure SHA-256
`e95ca0fa8109a3a81f605cbeae735683ca5b253b3663e90edb105b38f8260a6d`.

The regenerated [ledger](gap-ledger.json) SHA-256 is
`dbcda31cde1d44f17aebda8bfb3c4bd9705bb3832256e90c81e60dd4dcbc9414`.
It records 922 open logical default-route gaps, zero retired, 81 accepted
opt-in Rust operation names, 841 without accepted mapping, and five names
with bounded current-source route proof. The source replay and fixed-point
private SDK archive do not establish complete parity, retirement, or release
qualification.

## Plan identity source refresh — 2026-10-27

The Compact and Security And/Or source packets were replayed against the
refreshed action-plan identity source at SHA-256
`cd104adefbc27d9e51870ca4e316d414cbc8bb5de2e458b1cd673035f8049c5b`. The
unified build manifest is
`9501e340a2e8905378926b7415e1d247a57ed3fa1bb070ccd241de73a4943cb7` with
1,973-file closure
`a917c501d6882ba7a0b737232f69ea3acc859848e0e497c0c8760a314577991f`.
All five Compact and 68 Security And/Or cases passed on Node v26.12.1, Bun
1.4.3, and Chromium 153.0.8010.12. The deliberate inventory refresh retains
3,375 declarations across 509 files and 1,126 unique names, with inventory
SHA-256 `fccbfe07a3a43a490d207080120b4b0e33591f0e71cc37de0ab92683ebf3d7ec`.
The regenerated ledger SHA-256 is
`fd5cdf327fbf13ad3d96c92cfae3eddc13fc88a73f5acc0be2890217a42c42df`; its
922 logical executable default-route gaps remain open, with zero retired.
These bounded source replays do not qualify an installed archive or release.

## Current-source replay refresh — 2026-10-27

After the Arrow and generated-schema source updates, the symbol inventory was
deliberately regenerated and checked. It remains 3,375 route-specific runtime
declarations across 509 source files, with 1,126 unique names; the regenerated
inventory SHA-256 is `fccbfe07a3a43a490d207080120b4b0e33591f0e71cc37de0ab92683ebf3d7ec`.
The Compact Dataset packet replays 5/5 cases and the Security And/Or packet
replays 68/68 cases on Node, Bun, and real Chromium against the shared build
manifest `7e22134d72023245036097ec4f110b9ddb773eb820ecb681d77a5d677b941da6`
and 1,973-input source closure
`9143f872a1bb2cd3d4aa5d25da4ec0c7d7f06c3b22447f1b32b54e70d5629681`.
The regenerated condition-aware ledger SHA-256 is
`3a76c8dce68c424750da7a233962bf3800fbd7913b6e9365ca96dd011b6c7e2b`; it
retains 922 open logical executable default-route gaps, zero retired, 81
accepted opt-in Rust operation names, 841 without accepted mapping, and five
bounded current-source binding routes. This source replay does not establish
installed SDK qualification, complete semantic parity, or declaration
retirement.

## Facets and CSV Boolean opt-in source refresh — 2026-10-27

After adding narrow opt-in Facets and CSV Boolean lexical Python/CLI bindings,
the inventory was deliberately regenerated. It still records 3,375 route
declarations across 509 source files and 1,126 unique names; its current
SHA-256 is `1bba1489fa9402edfe5e5daeba8eb77eee21033ca6b38c5182e3dfb2a3907e72`.
The Compact Dataset and Security And/Or source replays passed on Node, Bun,
and real Chromium against one private build manifest SHA-256
`11733381ed77cbf6fb14d66cbb34836b2df72beda67d8ff7781093dc643b644a`
and 1,975-file source closure SHA-256
`a5dd80bb04a458db5aed74374d0e3da30eca68d3860ace6a928e724b291298e6`.
Compact passed five cases with 14 Rust/WASM calls per host; Security passed
68 cases with 30 valid calls and zero refusal calls per host. The current
ledger SHA-256 is
`4b82e0f322270ba3f3d50b7fcae2984dd08755b1705c288ef83adbbf6b6eb0d8`.
It still has **922 open logical executable default-route gaps and zero
retired**. The new binding surfaces do not retire any route or qualify a
release.

## Post-lint fixed-point replay — 2026-10-27

After the Python source cleanup and regenerated metamodel/action identity,
the current Compact Dataset and Security And/Or receipts were recaptured
against one private SDK build. Its manifest SHA-256 is
`43a735c629f357ca85d99708055a86c38a73522375ac7334eae79d7138ad8b3e`;
the 1,975-file source closure SHA-256 is
`ca6d3b7c893833073d2cd79a8a13d3909f0428dd16c6305f9115d6c2a33b2c21`.
Node 26.3.0, Bun 1.4.3 and real Chromium 153.0.8010.12 each passed five
Compact cases with 14 Rust/WASM calls and 68 Security cases with 30 valid
calls and zero refusal calls. The packet SHA256SUMS verify 78 Compact and
50 Security files. The deliberate inventory remains 3,375 route declarations
and SHA-256 `1bba1489fa9402edfe5e5daeba8eb77eee21033ca6b38c5182e3dfb2a3907e72`.
The regenerated ledger SHA-256 is
`fc46ba9d0b90f49bc5947ded2c721c58ffd90400353d6e2be2f48a42032cc5b8`:
**922 open logical executable default-route gaps, zero retired**, 81 accepted
opt-in mappings and 841 without an accepted mapping. These are bounded
source replays; installed archive, full contract and release qualification
remain open.

## Domain-pack/Record Values refreeze — 2026-10-28

The current inventory SHA-256 is
`6a592a171d0e4f2f4983302ccc9d2a15bc881c9b6159d6ffa19d76cef1104c40`:
3,375 route declarations across 509 source files and 1,126 unique names. The
current condition-aware ledger SHA-256 is
`3bc69e8f032e32240b9fe31c59a96acb5c6df422039122004b8d97d8a1868810`.
Each default Node/browser root has 1,120 declarations, including 59
source-selected Rust declarations and 198 JSON resource exports. The ledger
retains 922 logical executable default-route gaps, zero retired, 84 accepted
opt-in Rust mappings, 838 without an accepted mapping, and five bounded
current-source route proofs.

The current Compact, Security And/Or, and RRF packets share build manifest
SHA-256 `cedcbf75d43607fbed7d1e6a4310775c41096ebf9ba89d31c33081d4cb679586`
and source closure SHA-256
`f8c9450063b9f13274366f07255f0e22aa5c18e04aae96a1d3da6e001a1f85ec`.
Node 26.12.1, Bun 1.4.3, and Chromium 153.0.8010.12 passed their five Compact,
68 Security, and five RRF cases. These source-built packets do not establish
installed SDK behavior, complete semantic parity, or release qualification.
Earlier sections retain their historical hashes and scopes.

## Five-schema fixed-point route and loader inspector selection — 2026-10-28

The current inventory SHA-256 is
`eced450d39b6e2eade2354cc549300179fc9a763183dd56d2d1af138bb662424`:
3,375 route declarations across 509 source files and 1,126 unique names. The
condition-aware ledger SHA-256 is
`14a9de59c1a5d37390f5eab7a8900945c2eecd74b8cf626ec773d46aa79d9ba5`.
Each default Node/browser root has 1,120 declarations, including 65
source-selected Rust declarations and 198 inert JSON resource exports. The
ledger retains 922 logical executable default-route gaps, zero retired, 84
accepted opt-in Rust mappings, and 838 without an accepted mapping.

The five schema-generator routes have a checked private installed archive
[packet](../r8-domain-pack-schema-default-route/README.md) from a zero-transform
3,610-input source closure. Node and Bun observed two direct provider calls
per generator and matched the TypeScript reference's exact JSON, alias
classes, and fresh-instance behavior; real Chromium matched public behavior
with adjacent WASM and no Node globals. The separate `inspectDomainPackLoader`
route is source-selected but remains unqualified pending installed Node/Bun/
Chromium evidence. Neither selection nor this bounded packet retires a gap or
qualifies a release.
