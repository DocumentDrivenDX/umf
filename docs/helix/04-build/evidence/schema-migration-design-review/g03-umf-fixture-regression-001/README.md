# G03 fixture regression checks

Two stale N12 status expectations in `tests/lifecycle/g03-defaults.test.ts`
now match the previously integrated native fixture. No product behavior or
native evidence changed.

Attempt001 preserves both failures: TypeScript could not find its Linux native
package in the host dependency tree, and the focused suite reported 22 passes
and one stale expectation failure. Attempt002 uses the existing Linux dependency
volume whose package and lock files match the current repository. Both mounts
are read-only; execution is network-disabled Linux amd64 in the pinned image
recorded by its receipt. TypeScript 7.0.2 typechecking and all 23 focused tests
pass (204 expectations), with unchanged selected source hashes and absent owned
containers. The two commands took 15.640 seconds in total.

Sol independently accepted the exact assertion change and actual receipts in
[the review](sol-review001.md). These focused checks add no browser, database,
macOS runtime, managed-adoption or release qualification. Initial failures and
all original logs remain unchanged. Host Python performed orchestration only.

`custody.json` inventories every retained file except itself. Absolute temporary
paths in historical receipts identify original execution locations; the local
copies preserve their original bytes.
