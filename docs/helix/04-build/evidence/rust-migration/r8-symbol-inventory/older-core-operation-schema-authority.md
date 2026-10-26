---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.older-core-operation-schema-authority
  type: execution-evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: CONTRACT-080
      kind: informed_by
    - id: ADR-005
      kind: informed_by
    - id: TD-040
      kind: informed_by
    - id: TD-041
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-symbol-inventory.core-operation-schema-authority
      kind: informed_by
---

# R8 authority review: older core operation schemas

## Finding

The current bytes of `kind-operation-v6`, `kind-operation-v8`,
`nullability-operation-v5`, `nullability-operation-v7`, and
`record-type-operation-v6` remain `authority-unresolved`. The available
contracts govern their subject semantics and operation obligations, but do
not name these exact schema files as directly authored resources. The present
metamodel generator does not declare any of them as outputs. Four are pinned
as source inputs in the generated manifest; that is not an output receipt.
No exact current writer/input closure was found. This review proposes no
resource-authority status changes.

## Present contracts and generator boundary

CONTRACT-040 defines core ideal semantics and version transitions. CONTRACT-080
and ADR-005 establish the authoritative metamodel and enumerate the generated
resource boundary. TD-040 and TD-041 describe Field and Nullability operation
requirements. These documents do not establish direct authorship of the exact
current bytes of the five paths reviewed here. Consumers, validators, and
test references show use, not source authority.

`scripts/metamodel/build.ts` and `spec/metamodel/generated/manifest.json`
identify generated outputs. None of the five schemas is an output. The
manifest lists the first four under `sources` with the checked-in content
hashes. `scripts/metamodel/source-closure.ts` includes those four as authored
external compiler inputs; `record-type-operation-v6` is in neither that
closure nor the manifest. The source-closure role supports compiler
consumption only. It does not mean the generator produced these files.

## Historical writer evidence

At commit `887d67410b42ffc58d8f0853185b33a603320e19`,
`scripts/core-relationship-versioned-schemas.ts` wrote `kind-operation-v6`,
`nullability-operation-v5`, and `record-type-operation-v6` from the prior
versioned schema files. I extracted that writer and `spec/core/` from the
commit into an isolated temporary directory and ran it with Bun. The resulting
three files matched the committed historical outputs byte-for-byte:

| Historical output | Direct historical input | Input SHA-256 at `887d67410` | Output SHA-256 at `887d67410` |
| --- | --- | --- | --- |
| `spec/core/kind-operation-v6.schema.json` | `spec/core/kind-operation-v5.schema.json` | `db8cda8dc9438615a2c1d8bf4c163927d91f4f35313ad2ee4d7229c54339408d` | `4ffbcac7d5e29793a40ab474abe327d29982317dc8ebac199780b330bfce99ad` |
| `spec/core/nullability-operation-v5.schema.json` | `spec/core/nullability-operation-v4.schema.json` | `efba43a0f7c78c2b19f9d2ced0c767ec7276cfea2682977c188f67d033941cf4` | `a6c626b71e518ac1cb561512de154e4c312be9db99794343fc8c48b7767f2486` |
| `spec/core/record-type-operation-v6.schema.json` | `spec/core/record-type-operation-v5.schema.json` | `7f200666e5a8eef71f4354d73792226043184398ee0c7e3c0ffee5c41fb93642` | `6b0e1c14e57ec1d921fd2717a7fd40d692538804e20857046c87f025b6fd2888` |

The writer's SHA-256 is `133f24ae549cf639711aed2c23600931ac118ba458ed1df9458a64217139a823`.
It is preserved in the metamodel-authority history archive at
`docs/helix/04-build/evidence/metamodel-authority/history/scripts__core-relationship-versioned-schemas.ts`.
This proves an exact historical generation event, not current authority.

Commit `25a38767a` added `kind-operation-v8` and
`nullability-operation-v7`; their schema hashes at introduction were
`b0ea478865567f2ee6c3b060df5eda10723cb4bdeaa4ff26eb7e0bba6d7b063e` and
`18bc5717486dd78997ba8b52ff9a24a5fa50166decdf6fe3226443f499030b17`,
respectively. This establishes their presence at that commit, but no writer
was found that generated them. Their introduction history alone does not make
them `authored-known` under the current exact-resource authority rule.

Commit `8706814a9605d7325eef32a5df3d05696de00b62` later modified all five
schemas while moving current core references and removing older operation
branches. The historical writer was moved into the archive and no current
replacement writer for these exact resources was found. The metamodel build
at that commit does not establish these schemas as outputs: the current build
and manifest output inventories still omit all five.

## Current source pins

SHA-256 values identify the inspected working-tree sources at this review:

| Source | SHA-256 |
| --- | --- |
| `spec/core/kind-operation-v6.schema.json` | `e1de0aba1c3db6a09e85332a10441a0eec7a2dca0a4e4249fab67fcc491783b8` |
| `spec/core/kind-operation-v8.schema.json` | `3f7cc27f133f0a242b42ae2f41b665d046d0e069668235c82b0b2cd38c8bd68c` |
| `spec/core/nullability-operation-v5.schema.json` | `442cc69c8998da361b775251b2e8842cece0d700fb1fa59dad4bd3de03f13c92` |
| `spec/core/nullability-operation-v7.schema.json` | `6f0d20390165d2da79f22a69b3fec0126512c9f870a49445a5c33e55d68ff2d9` |
| `spec/core/record-type-operation-v6.schema.json` | `2b40d2be0562794f918738d96ee8f974f7133f26ee8476583b944c9f676a255d` |
| `scripts/metamodel/build.ts` | `f2a0b2f18c09b8bcff2099d4cadd20a7d91017b53ccfa2596226818189f054c3` |
| `scripts/metamodel/source-closure.ts` | `c9a5d963a6e2484fe0ff71cfb67864efe3292152ea9b4fee7e8915e03094675c` |
| `spec/metamodel/generated/manifest.json` | `100bc7b1ff47e178be1aa8083650e5a59095242689284c52d9b9297cbe18f3aa` |
| `docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md` | `58b5f07693618b91f73da98fba04ba14b222285e84b33b8639eb057bc7e3abd0` |
| `docs/helix/02-design/contracts/CONTRACT-080-authoritative-metamodel.md` | `1521c6b9f6106c03d929a027481568d03e04dc0161a6b7372e8334e956514f22` |
| `docs/helix/02-design/adr/ADR-005-authoritative-metamodel.md` | `abbb02ae902128d529d696e68d5c0006e1af2cf872c593629f212aa689ddae67` |
| `docs/helix/02-design/technical-designs/TD-040-core-field.md` | `89ab18fd7d2a3f68099dbdea391e3dd1f6d92c34a9268030ebed6a767b4587d1` |
| `docs/helix/02-design/technical-designs/TD-041-core-nullability.md` | `03e487ff4003e1cd5f68869a08547dddd5b0d3197a9157f02150d3d6e4806334` |

The focused writer reproduction used Bun in an isolated historical archive;
the three output hashes above are the reproduced values. No current metamodel
output was rewritten. A separate current `bun scripts/metamodel/build.ts
--check` run first encountered `EPERM` creating the compiler lock; after lock
access was available, Sol's Bun 1.4.3 rerun reached comparison and failed with
`METAMODEL_STALE_OUTPUT spec/core/schema.json`. It did not pass and does not
provide a generation receipt for these five resources.

## Proposed ledger disposition and limits

Keep all five present resource rows `authority-unresolved`; record the three
historically reproduced writer outputs and two added-file hashes as historical
facts only. The rows could be reconsidered with an exact current writer and
complete input closure, or a direct-authority case naming the exact current
resource revision. No such proof is established in this review. Package-copy
routes, installed archives, schema validation, and runtime migration are not
qualified here.

This is a source-authority review, not a semantic conformance claim. History
proves only the three identified predecessor outputs, and no full current
generator check passed. It does not classify unreviewed operation versions.
