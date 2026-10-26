---
ddx:
  id: umf.evidence.rust-migration.r8-symbol-inventory.record-type-operation-v6-authority-followup
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
    - id: umf.evidence.rust-migration.r8-symbol-inventory.versioned-core-operation-resource-authority
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-core-record-type
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
---

# Record Type operation v6 schema authority follow-up

## Result

`spec/core/record-type-operation-v6.schema.json` remains
`authority-unresolved`. This follow-up extends the prior resource review with
a read-only reproduction of its creation history and current bytes. The
historical writer deterministically reproduces the schema introduced by the
relationship-envelope commit. The current file can also be reproduced from
that output after three later edits: the title and the two `source`/`target`
core `$ref` values. Neither the writer nor a governing contract establishes
those later edits as the canonical v6 resource definition. No ledger
classification changed.

## What the governing contract establishes

CONTRACT-040's explicit record-type authoring section defines the meaning and
receipt contents: source, target, Field and record author receipts, reference
path and record-definition path; verification recomputes against the unchanged
current model. Its core 0.3.0 paragraph says kind and record-type authoring use
operation version 2.0.0 and older schemas remain unchanged. Later sections
define additional compatibility constraints. The current `record-type.ts`
interface and implementation use operation/binding version `6.0.0`, and the
current schema uses core `0.10.0` references. The contract does not identify
`record-type-operation-v6.schema.json`, state the v6 envelope, or expressly
authorize its current title and v0.10 references. CONTRACT-001 provides the
portable envelope boundaries but does not name this versioned receipt schema.

The contract therefore supports the semantic shape of record-type authoring,
but the inspected language does not directly establish these exact resource
bytes. The R5 evidence
[`Core Record Type Rust candidate`](../r5-core-record-type/README.md) pins and
uses the current schema; its writer, wrapper, and Rust implementation consume
the schema and are not source-authoring evidence for it.

## Creation and later modification

The schema was introduced at commit
`887d67410b42ffc58d8f0853185b33a603320e19`. That commit added
`scripts/core-relationship-versioned-schemas.ts` and the v6 schema. The writer
reads `spec/core/record-type-operation-v5.schema.json`, replaces `5.0.0` with
`6.0.0`, replaces the core `0.6.0` reference with `0.7.0`, appends
`(Relationship envelope)` to the title, then serializes formatted JSON. A
read-only replay of that exact algorithm over the commit's v5 input produced
the exact schema blob in the introducing commit.

The current file first differs in commit
`8706814a9605d7325eef32a5df3d05696de00b62`, titled “Generate current UMF
definitions from the authoritative metamodel.” In this schema the commit
changed the title to `Core record type declaration receipt` and changed the
two source/target `$ref` values from core `0.7.0` to `0.10.0`. Its commit
diff does not change CONTRACT-040, the versioned-schema writer, or a tracked
schema-specific input/generator. The current schema bytes exactly equal the
introducing writer output after those three field edits. This identifies the
byte history and makes the transformation reproducible; it does not identify
the normative source that chose the edits.

The current TypeScript implementation imports the schema, adds core and kind
schemas to its validator, emits literal version `6.0.0`, and checks generated
receipts against the imported resource. The current Rust implementation also
includes the same file. Both are consumers. The current metamodel manifest
does not list this operation schema as an output, and the current
`scripts/core-relationship-versioned-schemas.ts` is absent. The historical
writer is preserved in Git history but no current writer or input manifest
accounts for the title and current core-version references.

## Reproduction and pins

All commands below are read-only. The historical writer reproduction used the
v5 input and v6 output at the introducing commit; the second check compares
the current file against that historical output after the exact later title
and reference changes:

```sh
node --input-type=module <<'NODE'
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const commit='887d67410b42ffc58d8f0853185b33a603320e19';
const inputText=execFileSync('git',['show',`${commit}:spec/core/record-type-operation-v5.schema.json`],{encoding:'utf8'});
const input=JSON.parse(inputText.replaceAll('5.0.0','6.0.0').replaceAll('urn:umf:core:0.6.0','urn:umf:core:0.7.0'));
input.title+=' (Relationship envelope)';
const introduced=JSON.parse(execFileSync('git',['show',`${commit}:spec/core/record-type-operation-v6.schema.json`],{encoding:'utf8'}));
if(JSON.stringify(input,null,2)+'\n'!==JSON.stringify(introduced,null,2)+'\n') throw Error('historical writer replay differs');
const current=JSON.parse(readFileSync('spec/core/record-type-operation-v6.schema.json','utf8'));
introduced.title='Core record type declaration receipt';
introduced.properties.source.$ref='urn:umf:core:0.10.0';
introduced.properties.target.$ref='urn:umf:core:0.10.0';
if(JSON.stringify(introduced)!==JSON.stringify(current)) throw Error('current three-edit replay differs');
console.log('historical writer replay and current three-edit replay pass');
NODE
```

| Input | SHA-256 / Git identity |
| --- | --- |
| Current `spec/core/record-type-operation-v6.schema.json` | `2b40d2be0562794f918738d96ee8f974f7133f26ee8476583b944c9f676a255d` |
| Current `docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md` | `58b5f07693618b91f73da98fba04ba14b222285e84b33b8639eb057be7c3abd0` |
| Current `src/model/record-type.ts` | `ad5c465d49d676625296ca354c0297b6d49aa60c59b61eb031757fa81053b5ba` |
| Historical v5 input at introducing commit | Git commit `887d67410b42ffc58d8f0853185b33a603320e19`; see command above |
| Historical v6 output at introducing commit | Git commit `887d67410b42ffc58d8f0853185b33a603320e19`; SHA-256 `6b0e1c14e57ec1d921fd2717a7fd40d692538804e20857046c87f025b6fd2888` |
| Historical writer | `scripts/core-relationship-versioned-schemas.ts` at `887d67410b42ffc58d8f0853185b33a603320e19` |
| Current-resource edit | Commit `8706814a9605d7325eef32a5df3d05696de00b62` |

## Authority disposition and next check

Keep the resource's ledger status `authority-unresolved`. The exact schema is
versioned, imported by the package and Rust runtime, and reproducible from
history; those facts establish use and provenance but not the authority for
the later edits. Do not promote it based on a current consumer importing it,
the implementation's matching literals, or a transform that has no
governing input source.

The concrete next check is to obtain one source-authority artifact that
directly names the v6 receipt schema and states the intended v6 envelope and
core-version references, or a retained deterministic writer plus pinned
inputs whose governed specification establishes the same exact fields. Then
regenerate the authority ledger and run its focused direct-authority test.
Until that exists, Record Type may proceed as an opt-in semantic candidate,
but default-route integration must not treat these schema bytes as an
authority-cleared resource.

## Verification

The following focused R8 ledger test passes against the current unresolved
classification:

```sh
node --test --test-name-pattern='versioned core operation schemas pin direct authoring history' scripts/rust-migration/r8/gap-ledger.test.mjs
```

It checks that the directly authored kind-v8 and nullability-v7 schemas
retain their exact contract/revision evidence and that
`record-type-operation-v6` (along with five other unresolved historical
operation schemas) remains unresolved at the current pinned SHA. It does not
qualify archives or installed packages.
