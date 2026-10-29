# PR48 primary source reconciliation review

Disposition: **five finite corrections required before source acceptance/commit**. Reviewed the concrete normal-merge worktree at HEAD `8570ebbed`, retaining the prior plan disposition `47bafc31229a2a1ad21b01d808e5f806c98f1c2b444887a0412d9ce66519c11b`. No candidate runtime/import/AST/YAML parsing/tests or Git mutation occurred. Historical evidence files were retained without re-auditing their old campaigns.

## PR-F1 — Enforce selected18 before filtering

`acquire_offline_cohort.py` resolves active dependencies, filters `template['packages']` to `selected_names`, deletes other wheels, then compares the lock against that filtered template. It has no explicit selected18 guard. The template test alone does not prevent a smaller active closure from silently becoming the default qualification profile.

Validate the unique fixed original18 catalog/profile, then require exact normalized selected-name equality with that profile **before** filtering/deleting/publishing. Keep genuine production/qualification roots and actual METADATA edge checking. Add a meaningful missing/17-package selection refusal, not merely a template count assertion. Do not transition to a 12-wheel cohort.

## PR-F2 — Auto-CLI refusal test stops at argparse

`test_automatic_core_selector_refuses_outside_exact_runner_cell_before_output` omits required Weft URL/filename/SHA and mini-racer arguments. Argparse therefore exits before the runner guard, contradicting its asserted diagnostic. Supply inert complete unrelated CLI arguments, retain omitted Core arguments, unsupported target architecture, exact guard diagnostic and no-output assertion.

## PR-F3 — Platform native hashes conflict in common provenance

Acquisition records platform-specific Core `source.nativeSha256` (Linux78dd vs Mac4984). `aggregate_cohort.canonical_source` retains that field, so assembly/validation rejects legitimate cross-platform children as conflicting source provenance.

Exclude nativeSha256 from the **common cross-cell provenance projection**, while preserving it in each original child lock/custody. Bind each child's declared native hash to its actual producer native receipt/member/installed hash and its exact full wheel identity; inconsistent child native metadata must refuse. Preserve shared release/tag/repository/source-commit/sdist/semantic contracts, version checks, full wheel hashes and union physical-byte validation. Add a genuine differing-platform-native-hash positive plus mismatching child-native and common-release/source negatives. The tag/source identity6337 is release metadata M; actual Core wheel producer remains S=a1b, linked by accepted public provenance rather than a claim of rebuilding at M.

## PR-F4 — Historical checkpoint and source traceability

The inserted schema-migration-plan section still calls itself `Final G02 integration checkpoint` and selects Core0.10.1 without a historical label. Add an explicit pre-reconciliation historical capture heading/note, preserving its original evidence and old producer. The release-notes block already labels its old text historical correctly. Refresh the wheel-mirror guide's `helix:source` hash prefixes to the final corrected source bytes; restored old prefixes currently name other helper/template/workflow images. This is provenance maintenance, not a new support claim.

## PR-F5 — New discovery block violates existing R3 admission

The new selector-controls workflow step combines two `python -m unittest discover` commands in one multiline run. `scripts/rust-inventory.py:449-454` explicitly records such a block as `multiline-unittest-discovery-run-block-not-admitted`. Split it into two single-command steps, preserving both original invocations. Do not relax the inventory generator. Genuine canonical regeneration/check is required after these inventoried selector/aggregate/helper changes.

## Retained conclusions / scope

The restored qualification roots correctly distinguish jsonschema/ruamel-yaml and their catalog dependencies from Core0.10.2 production dependencies. The helper's all-or-none explicit Core override equals the closed actual platform tuple; auto-selection follows exact runner/Python admission. Common release URL grammar, resolved tag/commit and full wheel/sdist hashes are checked. The aggregate enforces four exact cell IDs, child lock/receipt hashes, package/version/provenance consistency, physical wheel/member metadata, closed paths and complete shared mirror reconstruction; replay uses a selected child requirements file and OS network denial with missing/tamper controls. Full native Core import/installed-member correspondence remains selected.

The Git source delta contains no edits to current renderer/library or temporal runner/fixture source. Old native temporal invocation/control additions preserve those current bytes. SD-007/STP-085 retain the required NUL/surrogate refusal, absence of an8MiB private-memory guarantee, required-appended valid-source/command composition, and durable READY/fence distinction. No new qualification is inferred from those historical receipts.

After the five corrections, review only their affected closure, commit the real old-head merge, integrate separately accepted D5 source, refresh exact pins, and perform genuine canonical generation from that combined source. Original producer four cells, aggregate union replay and required PR/native/D5 gates remain pending; selected historical passes do not qualify changed source.

## Frozen review identities

```text
726108e5a03af52c24d3c1efc36b37f6bdd53bdcd698af97f5165f07b1a1ee30 python/packaging/embedder-wheel-lock.template.json
405567e49f9a2c2bf3893f95eb3a0465309c905994a6699f1fa4aeab6ac8a743 tests/codegen/acquire_offline_cohort.py
b2be39af06779f5ca34ff1b59ea03b2a3a22614a65caea7ebee9ac18dd53739c tests/codegen/test_cohort_selector.py
805a86c2cefce5f4fd511029076a520ddd3fe4e0e6af73c0abafaed4db2cecda .github/workflows/access-boundaries.yml
068d2b67797369a425e02895d5940feab91d361b4347f9176f77fd197870d5b2 tests/codegen/aggregate_cohort.py
f02a4009fcc3b39f974b691ffc60ace41d55c3ce5765dcd91bf360dac34a6d99 tests/codegen/cohort_selector.py
11d57f3b166728ffa75a6a2a7d19a740220f1a7f5ba3a2d45b302888c1daeb7f scripts/python-package-mirror.py
9f135a31b06eca07402b4ceaa33bc270de7cb2715126308b203755c1da4fac90 tests/codegen/offline_mirror_probe.py
1ede818a400a05fa7197b3862e37e434c4712972a2a6aeb9e29b27d870b73fd5 tests/codegen/test_aggregate_cohort.py
8e01356472c51861619f5dc243dc596006d58b0b63d0d7386761609c58f9e002 tests/codegen/offline_mirror_probe_legacy.py
239e57a9357163152a1aea2e715644bf0563fba1bd07a87572568c1ddb18a541 tests/codegen/README-aggregate-cohort.md
2ac5f4c25396c84b1bf7640792570a45fd17a8098f4b1340d09a4c90487ad3aa docs/helix/02-design/solution-designs/SD-007-schema-migrations.md
12e68c54da5bf5ac699e292cd539ebe944f0a17c65fe3b3ef08aaf34d3098266 docs/helix/03-test/test-plans/STP-085-typed-actions-on-raw-tables.md
44c56c46a81cd8acd56e250a6ace954d476331ecafba1e8c35647d4ce429180b docs/helix/04-build/guides/python-wheel-mirror.md
4a40e6da7b74a8db61328399b7fbf9695dc6674f8263a90e4dd49d4c34250bc2 docs/helix/04-build/schema-migration-plan.md
1a9f4cef3b5400169ce392df68f7e3a4dcb31cd94c3645eab496cfc52671d5ba docs/helix/05-deploy/sdk-release-notes-0.5.7.md
```
