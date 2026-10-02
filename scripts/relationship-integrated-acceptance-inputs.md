# Final acceptance publisher input contract

Script: `scripts/relationship-integrated-acceptance.py` (Python standard library).
No repository files were edited or published while preparing it. Default mode
verifies everything and prints proposed JSON; `--publish` writes the proposed
`fixtures/validation/relationship-integrated-acceptance-evidence.json` plus any
required durable log/input byte snapshots under `relationship-integrated-final/`.

Run from the integration checkout:

```sh
python3 scripts/relationship-integrated-acceptance.py \
  --relationship-gate fixtures/validation/RELATIONSHIP_FINAL_RUNS.json \
  --versions fixtures/validation/RELATIONSHIP_PINNED_VERSIONS.json
```

Add `--publish` only after inspecting the dry-run result. This is an execution
switch, not an instruction to ask the user for additional permission.

Defaults consume the integrated compatibility manifest, durable integrated
regression result and old-five conformance-runs records already shaped by the
parent publisher. Override `--manifest`, `--regression`, `--old-gates`, `--root`
or `--output` as needed. No hard-coded passing counts or version values occur.

## Run records

All required runs: `{command: string[], exitCode: 0, log: path, logSha256: hex}`.
Bun records may include tests/failures/assertions/files: non-null counts must
match the final anchored Bun summary. Test commands must explicitly list test
files, with no flags. Filtering, --only, --todo, timeout flags and all other non-path arguments are refused for counted commands. Only the regression, old gate and relationship gate
TOP-LEVEL `bun test` records contribute counts. Focused compatibility test commands
and nested gate subprocess output do not. The last summary must cover exactly
the explicit files; overlapping top-level files are rejected rather than guessed
away. Their union must equal all discovered `tests/**/*.test.ts` files.

The current manifest uses `{complete,commands,runs,sha256,failedAttempts?}`;
regression uses `{command,exitCode,log,logSha256,refreshSha256,testInputs,
testInputsSha256,tests,files,assertions,failures}`. The test-input JSON is a
`{path:sha256}` map covering every discovered test. Old gate input has
`{complete:true,runs:[...]}`; all five conformance script commands are required.

Normalized new relationship gate input:

```json
{
  "complete": true,
  "idealAdmitted": true,
  "priorityDelivery": true,
  "nativeEquivalence": false,
  "runs": [],
  "sha256": {"path/to/current/gate-proof.json": "ACTUAL_SHA256"},
  "failedAttempts": []
}
```

Populate `runs` with successful final gate scripts and top-level test invocations.
The empty array above is a shape example and is rejected. Preserve failed timeout
attempts in `failedAttempts` using log/hash records; they never add to pass totals.
The parent's final relationship logging shape may be normalized into this object.

At least one successful typecheck/build/test:schemas command must occur across
supplied runs. If final static commands are separate from the compatibility
manifest, include their actual records in the normalized gate `runs`; do not
invent a command outcome from file existence. Current audit JSON must pass.

## Pinned versions and scopes

Supply `systems` entries for tablespec/postgresql/sqlserver/avro/parquet/graphql/
rdf/linkml, plus `browser`. Each native entry has:

```json
{
  "versions": {"nativeServerVersion": 170004},
  "scope": "Exact qualified subset supported by the cited record",
  "evidence": {"fixtures/validation/ACTUAL_NATIVE_RECORD.json": "ACTUAL_SHA256"},
  "checks": [
    {"path":"fixtures/validation/ACTUAL_NATIVE_RECORD.json", "pointer":"/serverVersion", "expected":170004}
  ]
}
```

That is a shape example, not a claimed current proof. Every published version
value must equal a value at a checked JSON pointer in hashed evidence. Browser
uses `version` instead of `versions`, with the same evidence/checks fields. Use
multiple checks for systems with multiple independent oracle versions. Native
version labels are not inferred from UMF extension package versions.

## Hash and publication behavior

Every supplied source hash, execution log hash, test snapshot and manifest link
must match current bytes before publishing. Final docs are fingerprinted after
placeholder resolution; defaults are README, architecture, test-plan and
implementation-plan. Repeat `--document` to override the exact final document set.
The publisher does not rewrite old proofs to make them match.

The final output never includes its own hash. Do not include that output in any
input `sha256` map. Final documents may link to the output normally; a link creates
no hash cycle. If a gate proof already fingerprints a document subsequently
edited, regenerate/qualify that proof deliberately; this publisher refuses drift.
Cache/dist inputs and cache logs are copied by original bytes into durable fixture
paths, and the final digest map refers to those durable copies. Existing durable
logs remain in place. Source files stay source paths. Input JSON snapshots retain
their original bytes even if internal paths describe earlier cache locations;
normalized execution records in the final output carry the durable log paths.

The tested revision is current HEAD, accompanied by authoritative working-tree
fingerprints because final source/docs may be committed immediately afterward.
Native equivalence remains false. No wider product completion is inferred.

## Required actual relationship proofs (review hardening)

Normalized flags alone cannot authorize publication. `runs` must include the exact
successful `['bun','scripts/core-ideals/relationship-conformance.ts']` command.
Its `sha256` map must include the four fixed current files under fixtures/validation:
relationship-admission.json, relationship-delivery.json, relationship-conformance.json,
and relationship-gate-refresh.json. The publisher reads their real shapes, requires
actual admission/delivery success and nativeEquivalence false, and compares the
combined proof to the separate results. Admission qualification.path/sha256 and
delivery evidence.refreshSha256 must match the exact fixed refresh; versions,
useful mappings, five-system inventory, sourceHashes and proofHashes must agree.
All refresh source/proof hashes and successful refresh command logs are verified.
These fixed proofs cannot be replaced by arbitrary nonempty normalized hashes.
