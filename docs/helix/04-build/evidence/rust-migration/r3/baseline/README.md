# R3 frozen TypeScript baseline

`operations.json` stores each operation input and the complete current TypeScript
entry-wrapper result envelope. `stage-one.json` stores separate
`generateAccessPackage` compiler vectors, including admitted private IR,
independent emitter output, full package result, every emitted UTF-8 file, and
the per-file digest, plus package-diff vectors. `source-manifest.json` lists SHA-256 hashes for the
complete Bun metafile input closure of the operation, corpus-generator, and
stage-one compiler roots, plus supplemental harness and retained generator asset
hashes. `receipt.json` records its digest, tool versions, and the compressed
embedded JavaScript bundle and manifest digests; capture also checks the
decompressed JavaScript against the manifest's bundle digest.

The seven operation names are `generatePythonClient`, `compileTableDeployment`,
`verifyTableDeployment`, `compileTableMigration`, `verifyTableMigration`,
`discoverTableMigrationChanges`, and `normalizeRowScope`. Fixture IDs are labels
only; a replay runner must dispatch by `operation` and pass the retained
`request` value without consulting test code or guessing fixture meanings.

Regenerate only when deliberately refreshing the frozen oracle:

```sh
bun scripts/rust-migration/r3/capture.ts
```

Replay the operation requests through the current TypeScript boundary and compare
the entire result trees (object member order ignored, array order retained):

```sh
bun -e 'const f=JSON.parse(await Bun.file("docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json").text()); await Bun.write("/private/tmp/r3-inputs.json", JSON.stringify({cases:f.cases.map(({id,operation,request})=>({id,operation,request}))}))'
bun scripts/rust-migration/r3/replay.ts /private/tmp/r3-inputs.json /private/tmp/r3-actual.json
bun scripts/rust-migration/r3/compare.ts docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json /private/tmp/r3-actual.json docs/helix/04-build/evidence/rust-migration/r3/baseline/receipt.json
```

Use the same replay protocol for stage-one vectors:

```sh
bun -e 'const f=JSON.parse(await Bun.file("docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json").text()); await Bun.write("/private/tmp/r3-stage-inputs.json", JSON.stringify({cases:[...f.vectors.map(({id,operation,request})=>({id,operation,request})),...f.diffs.map(({id,before,after})=>({id,operation:"diffAccessPackages",request:{before,after}}))]}))'
bun scripts/rust-migration/r3/replay.ts /private/tmp/r3-stage-inputs.json /private/tmp/r3-stage-actual.json
bun scripts/rust-migration/r3/compare.ts docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json /private/tmp/r3-stage-actual.json docs/helix/04-build/evidence/rust-migration/r3/baseline/receipt.json
```

The same `{id, operation, request}` records can be sent unchanged to a future
Rust replay binary. Stage-one requests use `{request, profile}` and remain
separate from the seven codegen entry operations.
Never overwrite the receipt to conceal a comparison difference. Review and
record an explicit compatibility decision before refreshing expectations.
