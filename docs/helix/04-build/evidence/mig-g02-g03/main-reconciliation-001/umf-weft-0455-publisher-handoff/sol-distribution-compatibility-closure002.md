# Weft distribution compatibility: WC-F1 closure

SOURCE ACCEPT — only WC-F1 from reviewc143ce5f1b26f1544e4f91ebcfc642ef798d1c70a3c8883a055b25252b1082bf is closed. Actual primary worktree /Users/erik/.codex/worktrees/migration-integrated-candidate/umf:

- python/umf_access/tests/test_catalog_configuration.py:10,680 bytes/SHA256292fca21cb3410242b1cad67be8fa79b38eb648f0d02209b7cf1dc9096b0a1c8.
- python/umf_access/src/umf_access/build/catalog.py:73,994 bytes/SHA25602312f775de2197cfdca0ad8b11e5790e3f0ab37ebc8cfca4bab857c3bcb1afa, unchanged.

Both installed_version callbacks now explicitly default-bind selected=selected and other=other. Reversing exactly those two signature substitutions reconstructs the entire previously reviewed test file:10,616 bytes/SHA256f79a414a4a80357bb745537217d71f17ecb5a77a136ba9937bdd0976e16a3d8a. No assertions, fixture values or other test bytes changed. This closes the loop-variable capture issue while retaining meaningful selected-version/absence refusals and exact-name no-fallback assertions. Inherit the accepted exact guard, custody behavior and byte-preserved legacy tests from review001; no residual finding.

This is source acceptance for the two-file explicit distribution-name compatibility change only. It is not admission of the new18-wheel cohort or a native/compiler/public support claim. Complete Core0.10.3/Weft tuple selection, later coherent consumer pin/configuration transition, genuine generated closure and all original qualification gates remain required. No local candidate execution/import, AST/YAML parsing, tests/lint, Git operation or source edit occurred; only stdlib byte reads, hash/reversal checks and this receipt were produced.
