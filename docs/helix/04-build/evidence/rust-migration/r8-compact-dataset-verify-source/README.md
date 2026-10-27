---
ddx:
  id: umf.evidence.rust-migration.r8-compact-dataset-verify-source
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-056
      kind: informed_by
    - id: umf.evidence.rust-migration.r5-dataset-values-compact-verify
      kind: extends
---

# Compact Dataset verifier V4 source and installed replay

Node, Bun, and real headless Chromium replayed the five frozen predecessor
cases through the V4 default route and matched the TypeScript reference
outcomes and errors. The fresh Node/WASM artifacts and complete deterministic
source closure are bound to immutable [`build-manifest.json`](build-manifest.json).
The closure walks implementation roots, bindings, specs, and configuration,
excludes build caches, and rejects symlinks. The builder pins sources before
compilation and rejects drift before publishing the manifest; each replay
checks the exact closure and all six compiled artifacts. Negative controls
cover transitive Rust changes, build-time drift, and stale artifacts.

The current source-closure SHA-256 is
`2f83e19ace175ceb538d0b7aba94926a41a868c3af4ad87d52d73a996b88fd31`; manifest
SHA-256 is
`4d25c856fdac60bd5e0ae9c0bf7ac9afeda235251c13c05f313e3c6da96e5f3e`. Node
26.12.1 and Bun 1.4.3 each passed all five cases and made 14 native Rust calls.
Chromium 153.0.8010.12 passed all cases, loaded the manifest-pinned WASM, and
had no Node globals. Receipt SHA-256 values are Node
`d4e38ca0dcf797724bdbb7c28d57759bd62df86b1b97b5b1ded0c79bd89d7fd3`, Bun
`48484f7fafd6f47c0fe602b98112292d2f6bc5484e86c97e704cde47b9e1d47b`, and
Chromium `7f0e9b5550a100d024e277365b726588e928a46a4f9136e7b4c705c31790d015`.

The five frozen payloads remain byte-identical. Their hashes, current manifest,
receipts, and preserved historical artifacts are in [`SHA256SUMS`](SHA256SUMS).
The previous index remains available as
[`historical-index-pre-metamodel-refresh.json`](historical-index-pre-metamodel-refresh.json).

The exact fixed-point installed SDK archive was also replayed. The separate
[installed evidence](../r8-compact-dataset-verify-installed-499d13c2/README.md)
records `qualified-pass` for archive SHA-256
`5ec44a154649cc0ddfd17279f9d686f7f87bcc92277ff113721c45d6173b4f89` and source
closure
`499d13c2e4a4a2373eea763ab3fe359861fb1218a24ae030bddf4f405bf18df5`, with zero
transforms. It checks all archive members and confirms the packaged closure
pins the replay harness and all packet inputs. For every case, `./reference`
made zero native/WASM calls and the default route made two; browser requests
were local only, and packaged roots were identified.

This evidence is bounded to the listed compact verifier cases and host
controls. It does not cover every Dataset semantic or declaration retirement.
Prior source cohorts remain preserved under
[`historical-pre-semantic-error-fix/`](historical-pre-semantic-error-fix/),
[`historical-pre-semantic-types-public-typing-fix/`](historical-pre-semantic-types-public-typing-fix/),
and
[`historical-typed-cohort-pre-canonical-action-generator/`](historical-typed-cohort-pre-canonical-action-generator/).

Use `--build <fresh-private-output-dir>` once, then run Node, Bun, and browser
replay modes against that same directory. See
[`compact-dataset-verify-v4-source-replay.mjs`](../../../../../../scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs).
