# Local SDK 0.57 evidence staging — preparation only

This metadata-only staging bundle is outside the repository and has not been adopted into Git. It preserves selected source, reviews, receipts, bounded logs, hashes, and manifests. The integrity manifest covers every staged regular file except itself and reports the exclusion explicitly. The source map binds each copy to its original path and exact byte count/SHA-256.

Current qualification state:

- SDK 0.57 local package evidence and Linux full18 acquisition/assembly are accepted under their recorded source/runtime identities.
- The separate local Linux PR-fast Bun test and browser build pass on P e4299aff8e87e9d211f9d86df2f2013ab9c95945/tree 8b98c0d895983ba2b7637dd3aea567dab0943883. The available `node_modules` snapshot was fingerprinted before/after and all 39 direct versions matched the exact package/lock declarations. This is a local check of that available dependency snapshot; it is not evidence of a fresh locked install or independent transitive publisher verification.
- Python syntax compilation passed separately with Python 3.11.17 (721 pyc outputs outside source). This is not Python 3.12 evidence.
- Earlier 600-second local PR-fast attempt004 remains failed because its one `bun install --frozen-lockfile` timed out. Attempts001–003 preserve earlier harness/path failures. The later Bun-only pass does not relabel or erase attempt004’s failure. Python syntax and Bun checks were recorded in separate receipts.
- The new LOCAL_EMULATED_3600 D5 source proposal and public-H reader source are reviewed/accepted as source only. A D5 run is currently in progress at its original path and was deliberately not copied or inspected here. No D5 PASS or public-H proof is claimed. Original LOCAL_EMULATED_1800 failure remains unchanged.
- The private QEMU material is feasibility/preflight evidence only. The large QEMU binary and x64 root filesystem are excluded.

Release and workflow state: Actions remain off; PR 65 is unmerged; no tag or public URL is claimed. The carrier upload was user-approved and completed but remains unpublished: release 427244649, asset 687172460, SHA-256 aa02faa3696577de82f77d147c8ccdde2c0397556fd97bd365dff661f6b504e7. The three workflows remain paused/local-only; their definitions are unchanged. Mac 15.7.9 ARM64/Python 3.11 is historical evidence; Mac Python 3.14 remains unqualified and is not Mac CI evidence. This bundle does not modify Praxis or product/source files.

This staging contains no node_modules tree, virtualenv, pycache, full browser bundle, QEMU binary, QEMU root filesystem, or partial D5 run output. D5 actual complete results, when available, belong in a later staging increment rather than being mixed into this preparation snapshot.
