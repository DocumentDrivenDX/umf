# D5 observation-successor affected review

Disposition: **two concrete workflow corrections required; successor observation semantics accepted at source level.** This closes the finite review against `/private/tmp/g02-d5-source-sol-review001.md`. No candidate execution/import/AST/YAML parsing/tests or Git mutation occurred.

Actual frozen hashes:

- access workflow: `1e2c6eeb2f92991b3e3fb7af6b4b429b1d20f8c8964bd6fa598394761815dcaa`.
- expected-pins: `33c4ef0ec69921f9ea2cb5d396327b8b776f5b400f3b23c07133955195b39898` (only matching workflow row changed).
- successor custody: `0865f14764f68dfc6e2818a54e336e2034720c696f797a6066816fdf5414957e`.
- successor gzip: `1f2e5d676a8480838d973962e23a5cb3687c6798beecb038d5a31e324d40875e`.
- decompressed successor: `89ba88c6187bee2f350e4448266f6aa470a42862fc146f97e1b43edccdd41639` (39301 bytes).
- original-to-successor patch: `660733be45ea13036d1aa8b29bb858803c606bcd15ac0963933d1483b38bead6`.

## DS-F1 — Missing json import

The `safe-extract-retained-fixtures` Python heredoc imports hashlib/pathlib/tarfile, later difflib/gzip, then calls `json.loads(custody)`. It does not import json in that interpreter. Add json to that heredoc's imports; otherwise the replay stops before any oracle execution. Other heredocs' imports do not carry across processes.

## DS-F2 — Release-payload cap is checked after growth

`assemble-sdk-release-wheel-payload` reads both source wheel bodies and copies them before the sole 2 MiB check. Preselect the exact two lock rows; reject duplicate/missing rows; compute the exact bounded receipt bytes first. Before body reads/copies, stat both non-symlink regular source files, assert each size equals its selected lock size, and assert combined source sizes plus receipt bytes <=2097152. Then retain the existing actual hash, copy, copied-byte/hash assertions and final cap. Stage from these exact same paths/rows. This enforces the already planned cap before allocation/copy; it needs no new source framework, rebuild, job or larger limit.

## Accepted affected source behavior

Stdlib hash/gzip/tar/text comparison confirms the retained patch is exactly the unified original-5df-to-successor diff. The original archive/oracle/fixture remain intact. The patch adds only the closed observed-value encoder, original-runner provenance, one actual SELECT * ordered by id after RESET ROLE, actual cursor column names/fetched rows, and a local retaining the existing future-default fetch before its unchanged assertion. All original manual expected rows, assertions, 16 groups/37 cases, phase/fault/NULL controls, cleanup and fixture semantics remain. Actual rows are not constructed from expectations. Decimal/date/float values use explicit lossless finite-domain tags; unknown types refuse. Valid empty rows and invalid appended rollback are represented truthfully.

The workflow uses the distinct successor path/hash and binds gzip/patch/custody plus original archive/oracle/fixture; finalization requires actual row/column/future-default fields across all 37 cases. PR branch and venv-parent owner-manifest copy fixes remain correct. The full 18-wheel filename/hash/size map now equals all lock rows, with duplicate refusal at custody publication. The separately uploaded Access/Codegen wheels are selected from the exact current job wheelhouse, bound to lock/owner hashes and source/tree/workflow/run identities, with success-only upload after D5 finalization. DS-F2 is the remaining defect in that assembly.

The fixed command roster includes the new bounded assembly command without dropping any replay. Existing 180-second child maxima, one 1800-second monotonic replay deadline, grace/reserve, 1 MiB log and 16 MiB D5 evidence bounds remain. The release-payload cap remains separate at 2 MiB. Source controls and prior runtime evidence are not a current D5 pass.

R3 conclusion remains unchanged for this exact batch: no new activation-path regex matches or unittest-discovery command, no inventoried source change, and the successor is retained under docs/helix/04-build/evidence and executed through its temporary path. No regeneration is required merely for these workflow/custody changes. The separate old-PR source reconciliation does require its actual source-driven regeneration/gates as previously identified.

No additional concrete blocker was found in this affected review. After DS-F1/F2 correction, review only those hunks and refreshed workflow/pin identities. Current-cohort native D5 execution, raw row/custody review and release-payload selection remain pending the real PR gate.
