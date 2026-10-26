# Core PR49 source-dbapi toolchain correction

Apply one narrow workflow correction in `.github/workflows/access-boundaries.yml`, native-sessions/source-dbapi only. Source reviewed at Core candidate cdebbc26896b9ed597ef0c7e634f674b2a5e09e3; workflow SHA-256 87f425501fe5ebefebdbed978c6abba7be38eac9db1058a7e122a14fb9c8bde0.

Actual job 121420137781 failed before tests. Retained `/private/tmp/core-source-dbapi-failure.log` shows the toolchain action successfully installed Rust 1.90.0 with its three minimal components. The subsequent unchanged maturin command triggered `cargo metadata`, which requested rustfmt and failed installing rustfmt-preview because `bin/cargo-fmt` already conflicted. This is toolchain provisioning failure; no evidence supports a Rust-version, dependency, DBAPI behavior or assertion change.

Immediately before the source-dbapi Rust setup, add a source-dbapi-conditional step exporting a fresh job-private RUSTUP_HOME through GITHUB_ENV:

```yaml
      - name: Isolate source DBAPI Rust toolchain from the runner image
        if: matrix.weft-cohort == 'source-dbapi'
        run: echo "RUSTUP_HOME=$RUNNER_TEMP/umf-native-sessions-rustup" >> "$GITHUB_ENV"
```

Retain the existing toolchain action and `toolchain: 1.90.0`; add `components: rustfmt`. The same file already uses this isolated-RUSTUP_HOME plus explicit rustfmt pattern in native-client-types. Carry the resulting environment unchanged into maturin and later Cargo calls. Do not delete runner files, repair a shared installation, change CARGO_HOME, suppress rustup failures, bypass the checked-in toolchain file or replace the locked source cohort with a published wheel. Both an uncontaminated component store and explicit required component provisioning belong in this single correction.

Keep the exact Weft source revision db1e0dc5b1ec6aec0f12646421cefc314989d974, maturin 1.9.6, `--locked`, wheel hashing/install, prepared table-operation API assertion, both cohort matrix entries, PostgreSQL 18.6 service and all subsequent native/session/lifecycle assertions and artifact collection unchanged. Preserve triggers and all current limits. The fix changes only YAML, not an inventoried script/source; no hand-edited or regenerated R3 inventory is required solely for this correction. The original R3 check remains a required normal gate.

Acceptance is the normal updated PR49 gate: provisioning must succeed, the exact source wheel must build and pass its API assertion, and all original tests must actually execute and pass. Preserve this failed attempt as historical evidence. Do not claim the job or native behavior passes from this plan. Root owns the concrete edit, commit and normal PR update; the unrelated untracked public-download workflow stays held.

This is a bounded source/evidence plan only. No candidate runtime, imports, tests, AST/typecheck, toolchain commands, Git mutations or source edits were performed.
