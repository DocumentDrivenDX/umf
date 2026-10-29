# Native qualification isolation affected closure

SOURCE ACCEPT exact `.github/workflows/python-action-runtime.yml` postimage SHA256 `b00d4382d5cc7ed94e9f2e4fee73a473971d76646fc39db6697ff76690ddb8b4`. Independently removing the single `&& github.ref != 'refs/heads/codex/migration-g02-g03-native-qualification'` term reconstructs complete preimage SHA256 `584f64a1e8e385f6b4fbf49243e8c2e4762afeb8ddb5ba2e34841e35fff453e5`. No step, matrix, case, command, cap or trigger otherwise changes.

The existing `github.event_name != 'push' || (...)` structure preserves PR/manual execution and tag/main pushes. Only the exact selected-native branch push now skips redundant Core artifact rebuilds; selected native workflow9d0d92c2 remains unchanged. R3 step.run/path activation records, hashed source inputs and97/32 manifests remain unchanged for the source-backed reasons sealed in generation reviewc9ce81a5.

This closes the one-hunk condition of `/private/tmp/sdk-057-final-generation-sol-review.md` without relabeling generation source41590 or predicting qualification results. Later qualification source must remain explicit. Read/hash only; no runtime, imports, AST, tests, Git or source edits.
