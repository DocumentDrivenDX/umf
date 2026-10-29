# Combined portable qualification: run 40567567226

Run attempt 1 completed with conclusion `success` for source `1bc0da3bd9cf43dc2a58ae69647a23eea330c1d4` (tree `ca9af66ad1d90c27868a2e69c2a7b1f6c5145757`). Job `combined-portable` (`122412796504`) succeeded through qualification, final artifact bounds, and upload.

Artifact `combined-migration-40567567226-1` (ID `12763422983`) is 74169 compressed bytes, SHA-256 `20c0c3d4a1f2d25252f7d6791e3f6b0a2e959ae9c95d5504d60f9f665b2c4af1`; 17 members expand to 1565262 bytes and ZIP integrity is clean. The cap receipt records 1,565,204 bytes before its final 58-byte self-record, while the complete ZIP member expansion is 1,565,262 bytes; both remain below the 16 MiB cap. Full member sizes and hashes are in `portable-inspection.json`.

The archived identity binds the run to `umf.combined-portable-migration/1`, exact push ref `refs/heads/codex/migration-integrated-qualification`, Bun 1.4.3, and pin manifest SHA-256 `6fd661b7cb0ae6a4dfd097ee6e88fa2bc1e8b3c503898373c17505bd8470854f`; all expected-pins checks passed. The four R2 source inputs were reproduced from archived run bytes:

- `src/generated/core-validators.ts`: 305070 bytes, SHA-256 `563602e0f21f6d6b0efd1ae069dbda28926e085585b4bf0430347b65ff2bd0ff`
- `spec/core/schema.json`: 45342 bytes, SHA-256 `c6004664eb93dcef28ce6e0583f91225b618aa0fb42967a892242402557cf71d`
- `spec/core/semantic-type-reference.schema.json`: 45463 bytes, SHA-256 `207abbad54ebf8c660a958e2deda072a5a3236b5b8df5af8a8656f90c3e46ba9`
- `spec/core/extension-package.schema.json`: 45001 bytes, SHA-256 `4df3c8f92c5baa2c52f965d83b681ff306392bf9ba333bd39213a8f1065ac766`

The generator emitted `core-validators-accounted.ts` at 1525352 bytes, SHA-256 `5fea0581cf706c5a76deeda4f2f8ca129935de48933c21a206e33dcefb550d29`; the archived source comparison command exited 0 and the pinned source output hash is `5fea0581cf706c5a76deeda4f2f8ca129935de48933c21a206e33dcefb550d29`.

The four Bun suites recorded 187 passing tests, 0 failures, and 1982 expectation calls. Pinned Chromium parity passed all 156 expected cases with no failures, page errors, or external requests (browser 153.0.8010.12, revision 1243). All qualification stages returned exit 0, and the script recorded 182 aggregate elapsed seconds.

Raw job log: `job-122412796504.log`, 38413 bytes, SHA-256 `ab427e3da7a9ed6eced2a4e958974cac60dbc27ac083e118b35f9592e3a998b2`.
