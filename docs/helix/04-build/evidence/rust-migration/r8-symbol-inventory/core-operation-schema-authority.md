---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.core-operation-schema-authority
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
    - id: US-042
      kind: informed_by
    - id: US-043
      kind: informed_by
    - id: US-044
      kind: informed_by
    - id: TD-042
      kind: informed_by
    - id: TD-043
      kind: informed_by
    - id: TD-044
      kind: informed_by
---

# R8 resource authority: older core operation schemas

## Finding

The current bytes of `cardinality-operation-v4`, `facet-operation-v3`, and
`key-operation-v2` remain `authority-unresolved`. Their history proves an exact
generator for the earlier 0.7.0 relationship-envelope versions, but the current
files were subsequently changed and no current writer reproduces those bytes.
The available contracts govern the operations' semantics and require complete
schemas; they do not establish direct authorship of these exact files. This
review therefore proposes no source-authority status change. Installed SDK
archive bytes and Rust runtime behavior are outside this resource-authority
finding.

## Governing requirements and current use

CONTRACT-040 defines the ideal meanings, version transitions, and complete
operation/result obligations. TD-042, TD-043, and TD-044 sequence complete
operation schemas before public API export. Those artifacts do not name these
three JSON files as contract-authored resources or define a current writer for
their exact bytes. The schema files themselves are consumed by the corresponding
TypeScript model modules, and the core Key/Facet/Cardinality test and projection
families exercise their behavior. Consumer use and schema validation are not
authorship proof.

The live R8 ledger currently leaves all three rows `authority-unresolved`, with
no generator, inputs, governing clauses, or source closure. It records a
package-reference source link, an SDK archive build rule without installed
qualification, and a source-only Rust compile-time include route for
Cardinality. These delivery routes do not upgrade authority.

## Historical writer proof

Commit `887d67410b42ffc58d8f0853185b33a603320e19` added the three operation
schemas and `scripts/core-relationship-versioned-schemas.ts`. That script
constructs each version from a previous schema using explicit version/core-ref
rewrites, adds the relationship-envelope title, and writes the versioned files.
The corresponding direct input/output pins at that commit are:

| Historical output | Direct input at `887d67410` | Input SHA-256 | Output SHA-256 |
| --- | --- | --- | --- |
| `spec/core/cardinality-operation-v4.schema.json` | `spec/core/cardinality-operation-v3.schema.json` | `70de41bdd92472d028734aa6b6db1a5edf54873f8c799f1a4c692d3edd85303d` | `a5e66c24f472893497ebdb8e356cb6d1c1a276910a1c35fbb366674c09846a41` |
| `spec/core/facet-operation-v3.schema.json` | `spec/core/facet-operation-v2.schema.json` | `c58ac212a80a9b141cd59f46c524c88a886c318768eceb69183cf0423362721d` | `bfc5bc9abb24b889c441f5aad44fc7b120f102ee9081d88b8487413d96c7b9cf` |
| `spec/core/key-operation-v2.schema.json` | `spec/core/key-operation.schema.json` | `dbc7f3bb2b6e80a91ec902e594d831e97a6de5715bc18719aa9eebdfb34bbaa7` | `7bae055d7dca44778d3025c225e0dfff91dae416d30ba77df79a2950af1938cc` |

The historical writer SHA-256 is
`133f24ae549cf639711aed2c23600931ac118ba458ed1df9458a64217139a823`. I
extracted the writer and `spec/core/` from commit `887d67410` into an isolated
temporary directory, ran the script with Bun there, and confirmed its three
outputs matched the commit's files byte-for-byte. This proves generation of the
historical output cohort only.

Commit `8706814a9605d7325eef32a5df3d05696de00b62` later changed all three
resources while moving the core model reference from 0.7.0 to 0.10.0 and
removing old lookup/inspection branches. In the same commit, the historical
versioned-schema script was moved into the metamodel-authority history archive;
it was not replaced by a writer for these current operation schemas. The
change's title and surrounding metamodel work do not prove that the operation
schema outputs came from the metamodel generator.

## Current generator receipt and limits

The current `scripts/metamodel/build.ts` declares generated outputs for the
portable core schema, semantic-type reference, extension package, generated
constraint/domain files, Python shapes, and generated TypeScript modules. None
of these three operation schemas is an output. `cardinality-operation-v4` is
present in `scripts/metamodel/source-closure.ts` as a Rust compiler input and
appears in the current manifest's `sources` map with the same digest as the
checked-in file; it is absent from `outputs`. The Facet v3 and Key v2 files are
absent from both the current manifest source set and outputs. A compiler input
hash is not a generation receipt.

The first `bun scripts/metamodel/build.ts --check` attempt in this worktree
failed while creating `target/metamodel-compiler/build.lock` with `EPERM`.
After lock access was made available, Sol reran the check with Bun 1.4.3; it
reached generator comparison and failed with
`METAMODEL_STALE_OUTPUT spec/core/schema.json`. The check therefore did not
pass. The manifest's declared output set and generator source were inspected
directly. No generator output was rewritten; this check result does not change
the operation-schema authority conclusion.

The old writer can reproduce each file as it existed at `887d67410`, but not
the current bytes. The later edits are visible as Git changes at
`8706814a9`; no current deterministic writer and complete input closure for
those edits was found. Contract coverage, public consumption, historical
generator output, package copying, and source hashing individually do not close
that gap. Thus all three current authority classifications remain unresolved;
the exact-generated historical cohort is only a predecessor fact.

## Source pins

SHA-256 values identify the inspected working-tree sources at this review:

| Source | SHA-256 |
| --- | --- |
| `spec/core/cardinality-operation-v4.schema.json` | `c2562ad726b58306c18332512f2b5388ddc625abb7494c532794682492300d45` |
| `spec/core/facet-operation-v3.schema.json` | `74c1ca75e2bac44afd0010292b82741618e9cb031cc37159667fa4f4ff95fd9f` |
| `spec/core/key-operation-v2.schema.json` | `67c35f417d940d9d3ff8c4fe7ca57ea29d319a1da4310ea3f9d2437160e9095b` |
| `docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md` | `58b5f07693618b91f73da98fba04ba14b222285e84b33b8639eb057bc7e3abd0` |
| `docs/helix/02-design/technical-designs/TD-042-core-cardinality.md` | `44f84075790e80f752e05efc75e43994c1a787c3ff20a1e140f42013e6127bb8` |
| `docs/helix/02-design/technical-designs/TD-043-core-facets.md` | `35e2644c8def7c7dac0e571b3d0a51006b60e924310b67dd526cb4597eeab37f` |
| `docs/helix/02-design/technical-designs/TD-044-core-key.md` | `396760c64c1e19f694cd80e9552378ad5ca0e9d0964756c90bd26921361b9e95` |
| `docs/helix/04-build/evidence/metamodel-authority/history/scripts__core-relationship-versioned-schemas.ts` | `133f24ae549cf639711aed2c23600931ac118ba458ed1df9458a64217139a823` |
| `scripts/metamodel/build.ts` | `f2a0b2f18c09b8bcff2099d4cadd20a7d91017b53ccfa2596226818189f054c3` |
| `scripts/metamodel/source-closure.ts` | `c9a5d963a6e2484fe0ff71cfb67864efe3292152ea9b4fee7e8915e03094675c` |
| `spec/metamodel/generated/manifest.json` | `100bc7b1ff47e178be1aa8083650e5a59095242689284c52d9b9297cbe18f3aa` |
| `src/model/cardinality.ts` | `30274929e3bc395b6d6066849aacb95305841f8138de242bd3d0609bcd64e76c` |
| `src/model/facets.ts` | `4f875d0e2561fa5f7949f72db8d16b8199f03841b6fb40ed1af5e9efe5f59465` |
| `src/model/keys.ts` | `e2bbe702d3165b2f7fafcbb641700933cdae49a2120accb19087d44f4071817b` |
| `src/index.ts` | `acfc8529b437fc6daa279a6586acb25644bae4c3c0b0fe15541d07eba20658da` |
| `scripts/rust-migration/r8/gap-ledger.test.mjs` | `a9919a65aa58fc419682fe239d61abe45f59255a7afb8a765386221d46e0d057` |

## Proposed ledger disposition

Keep the three current resource rows `authority-unresolved`. Record the
historical writer and its exact 0.7.0 predecessor outputs as evidence only; do
not label the current bytes `generated-known` or `authored-known`. A future
classification change needs either a current exact writer/input reproduction
including the 0.10.0 removal/reference edits, or an explicit direct-authority
case tied to contract clauses and current file revision history. Neither is
established here. Existing `not-installed-qualified` archive status remains
unchanged.
