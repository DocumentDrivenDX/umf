# Core 0.10.3: exact selected-artifact path emission repair

PLAN ACCEPT — exactly one workflow line, followed by literal affected review and genuinely changed-source original qualification. Actual run40436295678/Linux3.14 selected job121971783522 reaches successful closed test-cohort fetch and fresh venv creation, then pip cannot find the emitted selected wheel. Retained artifact12705830126 ZIP5,344 bytes/SHA256deb139e7829334eac69ecf5f60411a3bc0f9503dddc80639531bdf13e6258f3a independently verified. Actual004 log1,376 bytes/SHA256c07a6733403f695f609692ab44a9f0c626f48c4ea8625fa8a582de0d3c0c2c4e names the nonexistent /umf-release-linux/umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl. No installation/test acceptance follows from that failed cell.

The source already defines linux_root=linux_dir/"umf-release-selected" and mac_root=mac_dir/"umf-release-selected" and validates both exact wheel/fullhash/native/same-sdist identities from those roots. Its emitter then wrongly reverts to the parent download directory. In .github/workflows/python-action-runtime.yml replace only:

    root = linux_dir if platform_key == "linux" else mac_dir

with:

    root = linux_root if platform_key == "linux" else mac_root

The existing next line joins selection["selectedWheel"]["path"]; it must resolve to the same exact already validated wheel. Keep artifact directory structure intact: no flattening, search, fallback/copy/rebuild, invented filename or validation bypass. No public-proof change is proposed: its separate destination/path comes from verify_core_public_release. Keep the accepted CELL_ID py3 fix, py11/py14 artifact names/verifier expectations, all4 cells/interpreters, locks, tests254/profile14 controls, commands and original1800/180/60/10+2/1MiB/16MiB bounds.

Current native workflow56,609 bytes/SHA256c90fc9dbc91a07feb4fe591462557897e83b5ff048307aec0c99c136bc0c9f00. The exact one-line substitution predicts56,611 bytes/SHA256807fd5b6008f27263b2714459d8acdac2186b7a36b036f33dfa5242e36acd2ab. Luna edits only that file and freezes; Sol closes by full-file reversal. No test mirror is needed; actual original selected-cell install/probe/prepost/254-test gates must demonstrate the correction.

Generated/source-payload impact: this is a workflow-only inline variable reference. R3 source-cohort hashes do not include workflow bytes and the current inventory has no workflow source row. Its activation regex paths/commands are unchanged. TypeScript's workflowRuns does carry the changed multiline run string, but Python workflow_unittest_discovery_roots ignores multiline blocks unless they contain unittest discover; this block does not. Therefore it creates no changed commandSha/unresolved/discovery record. No product/source/schema/tool/package/lock or metamodel/Codegen/action input map changes, and workflows are outside the fixed sdist source payload. All35 adopted generated outputs are EXPECTED unchanged, not declared passed by inspection.

Root may commit/integrate the reviewed correction and update the exact changed workflow source-freeze row, then run the original genuinely changed-source producer+four selected cells in parallel with required unchanged-recipe consistency. Actual dependent15 outputs must equal committed roots and retained9+11 adoption hashes; if equal, retain actual consistency with no artificial re-adoption commit. Unexpected drift holds qualification/release for concrete output review. Do not hand-edit inventory or reuse a prior source receipt as current.

Retain sourcef4a producer successes and failed cells under their actual identities; preserve the other three running/queued cells and all existing runs without cancellation. New source/asset whole hashes must come from its actual producer selection, never be guessed from unchanged payloads. Four-cell/full normal/merge/release/public remain open; public packet stays HELD pending actual qualified tuple/publication. Root owns all commits/pushes/dispatch.

Planning used only source/log/stdlib ZIP/JSON/hash reads and expected-byte calculation. No local candidate execution/import, AST/YAML parsing, tests/generation, Git action or source edit.
