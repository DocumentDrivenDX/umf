# Merged-source generation artifact: run 40566692892

Run `40566692892` attempt 1 at `1e0d9545eb6e00dc4521a257be722cf336c3b741` completed as `GENERATED_ARTIFACT_ONLY`.

The actual receipt status is `GENERATED_ARTIFACT_ONLY`; phase `DEPENDENT_GENERATION_READY` has `dependentGenerationReady=true`, `companionInputsMatch=true`, and `committedOutputsMatch=true`. The `committedOutputsMatch` flag applies to the 11-row metamodel phase roster only; those 11 staged rows match that committed roster, and all four companion input rows equal the emitted companion inputs. Root's independent comparison of all 27 generated outputs against the source at this run found 25 byte-identical rows; `docs/helix/04-build/evidence/rust-migration/r3/inventory.json` and `src/extensions/actions/plan-identity.ts` differ. This is artifact-only source generation: `qualifiesMergedSource=false`; no qualification or automatic adoption is asserted.

Archive: 736368 bytes, SHA-256 `a9f2d266ade4393c41e02979b62664a90c28dd279ab5fce6728c374050a78010`, 51 members, 4723494 expanded bytes; ZIP integrity check: `None`.

`source-inputs.json` SHA-256 `a1ee8e583e505f944432aa5f085869bb93057e7e361b9e7ccb4f0dd51a0b0342` equals receipt `sourceInputsSha256`. The metamodel manifest records 224 source rows: 175 compiler inputs, 35 workspace inputs, and 14 backend inputs.

Bounds: 4625133/16777216 bytes for generated outputs; 7912/1048576 log bytes; 1800 aggregate work seconds with 60 seconds reserved. Receipt artifactBytes=4723494; sum of command-recorded durations=71590 ms.

Generation/custody command order from the archived command records: `bun install --frozen-lockfile --ignore-scripts` → `cargo fetch --locked` → placeholder/toolchain/staging records → `bun scripts/metamodel/build.ts --output-root ...` → metamodel stage `--check` → `metamodel-output-correspondence` → `bun run check:metamodel` (original self-check, before dependent generators) → `bun scripts/actions-plan-identity.ts` → `bun scripts/build-codegen.ts` → action/codegen `--check` commands → `python -I scripts/rust-inventory.py` → `python -I scripts/check-rust-boundaries.py` → stage and receipt finalization. All command records have zero exit and no truncation.

## All 27 generated outputs

| Member | Bytes | SHA-256 |
|---|---:|---|
| `docs/helix/04-build/evidence/rust-migration/r3/boundary-check.json` | 26687 | `5cbda712b86b3264f781a7df57d64b807659ff27afdbe165e589923d522d0a04` |
| `docs/helix/04-build/evidence/rust-migration/r3/inventory.json` | 2809433 | `a6a5132dfddb9bea62b4e5495b019445739bf330e59379ae75e2c34d3d3398e9` |
| `python/umf_access/src/umf_access/generated_core.py` | 360 | `5366ba6be1c2eb042b14f30723648686294e1f450d75a645e76806a4494593a1` |
| `python/umf_codegen/src/umf_codegen/_assets/generator.js.gz` | 925422 | `3f48410cb6013c2321ecb6f142779123730bfa9f85bbaabab1b412d5984cdd47` |
| `python/umf_codegen/src/umf_codegen/_assets/manifest.json` | 33447 | `ad326f5c95d4c9dde9ec09d9413aac156e50a1e0b1934cc357b249fd560a6e95` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/ajv/LICENSE` | 1090 | `a05350a88e318e4f5f2c2a1ff1e2e88daa4dd38e6e78b71cccae422bdc762cc3` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/ajv/package.json` | 4405 | `1f9033ee5a6515e7d76938b7072941862d1ed228a6879cc7fe10cdeb75107989` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/fast-deep-equal/LICENSE` | 1074 | `7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/fast-deep-equal/package.json` | 1496 | `a5c63940db0260739be9e2ac67f3aac268df4db5770420ee4e34e493152f97d2` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/fast-uri/LICENSE` | 1813 | `b010b0dfdfdb23d7396e03b82cd4621fc9bb8f95d6b0aea70b9c24e12074c786` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/fast-uri/package.json` | 1983 | `30cad05aad3d3596513706451dbfc7e0422f9c1d00f2903ecc34580327d54bc7` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/json-schema-traverse/LICENSE` | 1074 | `7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/json-schema-traverse/package.json` | 1004 | `156fb24af02845c190701360d06dfda35ef04282e34a734289ea9535ad9819ae` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/yaml/LICENSE` | 738 | `5bba27375d93e9119f76c1015f7672cf9ad5f70952296e0842fb2243d6376869` |
| `python/umf_codegen/src/umf_codegen/_assets/notices/yaml/package.json` | 3254 | `1c6441703d8204a23ded0d37ddf57c3b69d821dc392f20852d1f605bb9b8861c` |
| `python/umf_codegen/src/umf_codegen/_release.py` | 170 | `2ae57c276f24c6aa9e93402fb95a431369089aa42fb6eee851baf2ede612bfed` |
| `spec/core/extension-package.schema.json` | 45001 | `4df3c8f92c5baa2c52f965d83b681ff306392bf9ba333bd39213a8f1065ac766` |
| `spec/core/schema.json` | 45342 | `c6004664eb93dcef28ce6e0583f91225b618aa0fb42967a892242402557cf71d` |
| `spec/core/semantic-type-reference.schema.json` | 45463 | `207abbad54ebf8c660a958e2deda072a5a3236b5b8df5af8a8656f90c3e46ba9` |
| `spec/metamodel/generated/core-constraints.json` | 190252 | `e4e667c6a23ebcfe12a937730adfa60081475ad11d367b8986a9ea94429d5dcd` |
| `spec/metamodel/generated/domain-policy.json` | 14827 | `7827703fe00b4eb955e9a1d1632fec4e7b9e8c52df0d67eb700dbd7ce9a6d436` |
| `spec/metamodel/generated/manifest.json` | 58660 | `49d13a735d92c9db935fc9c7f5f804e0529c5bb374e4c98fe246e03d979353b6` |
| `spec/metamodel/generated/python-shapes.json` | 98734 | `884fb5d09e1cd512e32b188144aa0f9ac55d396cc5a3b10341b3aeb06093fde7` |
| `spec/metamodel/package.json` | 1265 | `5930c77eaa8308d76761cd93d5a58bd5b0a7b3f30b5bc56fdc7db6d961fb0b89` |
| `src/extensions/actions/plan-identity.ts` | 355 | `e88f87c9c9c186f2c91e75012a27531538879a144b68136a931069209d17103f` |
| `src/generated/core-model.ts` | 6714 | `55485912b78640ef970244ffd8d4cbd6f186e035efccd77259aadff6120b7106` |
| `src/generated/core-validators.ts` | 305070 | `563602e0f21f6d6b0efd1ae069dbda28926e085585b4bf0430347b65ff2bd0ff` |

## All 51 archive members

| Member | Bytes | SHA-256 |
|---|---:|---|
| `command-records.jsonl` | 5365 | `6188a06375e6f8e5224b091f4adb69e3cfa5b580306bda529605732cd7be9280` |
| `historical-placeholder-inputs.json` | 1935 | `399de5c98d9fd8cfb063a006dc2225db40de996730e7d187bcdf3631d1c93451` |
| `generated-source-receipt.json` | 7520 | `13982853e5b005f5cac2b4b396c95664678be39424164f8cfb8db14949cde034` |
| `logs/action-plan-identity-check.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/action-plan-identity.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/bun-install.log` | 1056 | `352b289d6c39fcd11f2e05feab486cbef5742377e23997a987b191d01aa57425` |
| `logs/cargo-fetch.log` | 5892 | `78e5bdebc503978f8ee66cd664ecc62da0f381dfbcc9ba05cda121918a617a2d` |
| `logs/check-adopted-metamodel-and-self.log` | 130 | `cdfec78cd381b0b011ab240602e4f18d127df3fb053c00991ccb0f5688724276` |
| `logs/codegen-assets-check.log` | 45 | `7deb1623aeba7ae1a32e7c96ec280148fda27d92eb74fd293c490e905704ba87` |
| `logs/codegen-assets.log` | 58 | `72a7fef4da20f96153504e4944b3ad0dc1d9a7e30ca2e38ac4fef6ba9590d043` |
| `logs/metamodel-output-correspondence.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/metamodel-output-generation.log` | 28 | `a17ba752d0908a9338faa1226fd65b71b8f6520ba0c26c33c703abef0a6bc947` |
| `logs/metamodel-output-stage-check.log` | 26 | `43e3788efea3f089bab832bb205ab8973317ac51128f3c3a0ff0548b1b63c6f9` |
| `logs/pre-generation-placeholders.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/prepare-metamodel-stage.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/r3-boundary-check.log` | 545 | `c542d43089ffee4a9f1d085f7ef78e564db066fb74de48cbce7ab44e664e5223` |
| `logs/r3-inventory.log` | 132 | `40f731f98492f8e3e63bf418a22bb2f3aff272eda7d415c577cd1896a94441a4` |
| `logs/toolchain-identity.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `metamodel-phase-ready` | 5 | `a17fcf0a2f50e2d495e4f90ce263410edc183add6c62699a2facbccf60410f74` |
| `metamodel-phase.json` | 5192 | `49fce0e0ec01a34a291c14ad521180e759f3f52dee01939d5b015dc088c45fad` |
| `monotonic-deadline-ms` | 8 | `8d7da68c44b369fc967a85f5833743a53d0b448bf5fad71e7ef6f68917af66bb` |
| `monotonic-start-ms` | 6 | `e9d074c508deb1421df1665e9797465fdbfdab2d33e4aa9e4ac7a60a4633285d` |
| `outputs/docs/helix/04-build/evidence/rust-migration/r3/boundary-check.json` | 26687 | `5cbda712b86b3264f781a7df57d64b807659ff27afdbe165e589923d522d0a04` |
| `outputs/docs/helix/04-build/evidence/rust-migration/r3/inventory.json` | 2809433 | `a6a5132dfddb9bea62b4e5495b019445739bf330e59379ae75e2c34d3d3398e9` |
| `outputs/python/umf_access/src/umf_access/generated_core.py` | 360 | `5366ba6be1c2eb042b14f30723648686294e1f450d75a645e76806a4494593a1` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/generator.js.gz` | 925422 | `3f48410cb6013c2321ecb6f142779123730bfa9f85bbaabab1b412d5984cdd47` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/manifest.json` | 33447 | `ad326f5c95d4c9dde9ec09d9413aac156e50a1e0b1934cc357b249fd560a6e95` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/ajv/LICENSE` | 1090 | `a05350a88e318e4f5f2c2a1ff1e2e88daa4dd38e6e78b71cccae422bdc762cc3` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/ajv/package.json` | 4405 | `1f9033ee5a6515e7d76938b7072941862d1ed228a6879cc7fe10cdeb75107989` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/fast-deep-equal/LICENSE` | 1074 | `7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/fast-deep-equal/package.json` | 1496 | `a5c63940db0260739be9e2ac67f3aac268df4db5770420ee4e34e493152f97d2` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/fast-uri/LICENSE` | 1813 | `b010b0dfdfdb23d7396e03b82cd4621fc9bb8f95d6b0aea70b9c24e12074c786` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/fast-uri/package.json` | 1983 | `30cad05aad3d3596513706451dbfc7e0422f9c1d00f2903ecc34580327d54bc7` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/json-schema-traverse/LICENSE` | 1074 | `7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/json-schema-traverse/package.json` | 1004 | `156fb24af02845c190701360d06dfda35ef04282e34a734289ea9535ad9819ae` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/yaml/LICENSE` | 738 | `5bba27375d93e9119f76c1015f7672cf9ad5f70952296e0842fb2243d6376869` |
| `outputs/python/umf_codegen/src/umf_codegen/_assets/notices/yaml/package.json` | 3254 | `1c6441703d8204a23ded0d37ddf57c3b69d821dc392f20852d1f605bb9b8861c` |
| `outputs/python/umf_codegen/src/umf_codegen/_release.py` | 170 | `2ae57c276f24c6aa9e93402fb95a431369089aa42fb6eee851baf2ede612bfed` |
| `outputs/spec/core/extension-package.schema.json` | 45001 | `4df3c8f92c5baa2c52f965d83b681ff306392bf9ba333bd39213a8f1065ac766` |
| `outputs/spec/core/schema.json` | 45342 | `c6004664eb93dcef28ce6e0583f91225b618aa0fb42967a892242402557cf71d` |
| `outputs/spec/core/semantic-type-reference.schema.json` | 45463 | `207abbad54ebf8c660a958e2deda072a5a3236b5b8df5af8a8656f90c3e46ba9` |
| `outputs/spec/metamodel/generated/core-constraints.json` | 190252 | `e4e667c6a23ebcfe12a937730adfa60081475ad11d367b8986a9ea94429d5dcd` |
| `outputs/spec/metamodel/generated/domain-policy.json` | 14827 | `7827703fe00b4eb955e9a1d1632fec4e7b9e8c52df0d67eb700dbd7ce9a6d436` |
| `outputs/spec/metamodel/generated/manifest.json` | 58660 | `49d13a735d92c9db935fc9c7f5f804e0529c5bb374e4c98fe246e03d979353b6` |
| `outputs/spec/metamodel/generated/python-shapes.json` | 98734 | `884fb5d09e1cd512e32b188144aa0f9ac55d396cc5a3b10341b3aeb06093fde7` |
| `outputs/spec/metamodel/package.json` | 1265 | `5930c77eaa8308d76761cd93d5a58bd5b0a7b3f30b5bc56fdc7db6d961fb0b89` |
| `outputs/src/extensions/actions/plan-identity.ts` | 355 | `e88f87c9c9c186f2c91e75012a27531538879a144b68136a931069209d17103f` |
| `source-inputs.json` | 68909 | `a1ee8e583e505f944432aa5f085869bb93057e7e361b9e7ccb4f0dd51a0b0342` |
| `outputs/src/generated/core-validators.ts` | 305070 | `563602e0f21f6d6b0efd1ae069dbda28926e085585b4bf0430347b65ff2bd0ff` |
| `toolchain-identity.json` | 1509 | `8a2d030c7a785d464861f8317cdc00deb56505456e1d3700f06b63af452605cc` |
| `outputs/src/generated/core-model.ts` | 6714 | `55485912b78640ef970244ffd8d4cbd6f186e035efccd77259aadff6120b7106` |

## Captured logs

| Member | Bytes | SHA-256 |
|---|---:|---|
| `logs/action-plan-identity-check.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/action-plan-identity.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/bun-install.log` | 1056 | `352b289d6c39fcd11f2e05feab486cbef5742377e23997a987b191d01aa57425` |
| `logs/cargo-fetch.log` | 5892 | `78e5bdebc503978f8ee66cd664ecc62da0f381dfbcc9ba05cda121918a617a2d` |
| `logs/check-adopted-metamodel-and-self.log` | 130 | `cdfec78cd381b0b011ab240602e4f18d127df3fb053c00991ccb0f5688724276` |
| `logs/codegen-assets-check.log` | 45 | `7deb1623aeba7ae1a32e7c96ec280148fda27d92eb74fd293c490e905704ba87` |
| `logs/codegen-assets.log` | 58 | `72a7fef4da20f96153504e4944b3ad0dc1d9a7e30ca2e38ac4fef6ba9590d043` |
| `logs/metamodel-output-correspondence.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/metamodel-output-generation.log` | 28 | `a17ba752d0908a9338faa1226fd65b71b8f6520ba0c26c33c703abef0a6bc947` |
| `logs/metamodel-output-stage-check.log` | 26 | `43e3788efea3f089bab832bb205ab8973317ac51128f3c3a0ff0548b1b63c6f9` |
| `logs/pre-generation-placeholders.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/prepare-metamodel-stage.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `logs/r3-boundary-check.log` | 545 | `c542d43089ffee4a9f1d085f7ef78e564db066fb74de48cbce7ab44e664e5223` |
| `logs/r3-inventory.log` | 132 | `40f731f98492f8e3e63bf418a22bb2f3aff272eda7d415c577cd1896a94441a4` |
| `logs/toolchain-identity.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
