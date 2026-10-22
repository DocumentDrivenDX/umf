# Astra review: private census transport

Disposition: **no blocking finding within the declared component scope**. This was a read-only implementation and retained-evidence audit. No native probe, Docker command, test suite or evidence producer was rerun by the reviewer. The eight saved SMT formulas were independently parsed and solved in fresh Z3 4.15.4 contexts.

## Final evidence verified

- Native run `d8eba9ba-b469-48bc-9ed4-f0adea11127a`: 59 unique observations with type-sensitive expected/observed equality; 71 declared source pins match both current bytes and their exact ZIP preimages. The duplicate-free archive contains those 71 entries and the three digest-matching executed build outputs. The actual build graph inputs, all three executed test files and their `native-wire.json` fixture are included. Host logs report 47 passing tests, zero failures and 116 assertions across three files; strict typechecking passed under the wrapper's checked exit status.
- Independently decoded all 180 retained binary-wire journals. Five returned images and the deliberately withheld late-journal image each reconstruct from 344 contiguous chunks and 28 complete original responses, including zero-row terminal FETCH, CLOSE and COMMIT. The baseline is exactly 11,250,105 bytes; the function-body change image is 11,250,107 bytes. Exact UTF-8 content survives reconstruction. The data-only update and both restorations equal the baseline byte-for-byte; the source-body change differs.
- Foreign-route and overflow attempts retain native NULL census rows followed by complete original ROLLBACK responses. Caller-owned transaction refusal retains status T and no helper rollback, with independently asserted pending-row and cursor results preserved until the caller's own rollback. The late completion fault occurs after the full COMMIT response is journaled: no image returns and the connection is destroyed. Its subsequent rollback attempt is retained as **uncertain**, not a successful rollback.
- Cleanup records successful owned-ID removal, then a separate successful container census with no remaining matching ID. The review audited these retained results without issuing new container commands.
- Final proof `e71a02c8-0850-4669-92a8-c051e36350a7`: all six source pins match current files and exact, duplicate-free archive entries; independent replay returns **5 UNSAT / 3 SAT**. The final correspondence law derives whole-image equality from separate faithful per-chunk and quotient/remainder copy premises. SAT controls admit fabricated complete bytes, a truthful observation differing from later execution source, and complete bytes lacking terminal completion. Retained and independently replayed byte witnesses use ordinary byte-range values.

## Source assessment and limits

The helper requires one host-exclusive idle client, owns only the transaction it starts, validates every original response and terminal boundary, and releases no image before successful CLOSE, COMMIT and local journal completion. The assembler enforces ordinal, size, exact chunk width, descriptor, fetch-count, terminal and UTF-8 checks. Synthetic well-shaped frame acceptance is explicitly a countercontrol, not proof of original source custody. Source-pinned SQL materializes one bounded observation; neither source pinning nor repeatable read establishes an authenticated provider or a held authority execution cut.

The 1 MiB frame, 4 MiB response, 16 MiB reconstructed image and 40 MiB cumulative wire limits are distinct. Exact image-size boundaries are assembler tests; this is not a total heap, CPU, deadline, temporary-storage or whole native limit qualification. Build evidence establishes the retained source/bundle correspondence under the recorded environment, not a hermetic compiler/configuration proof. Private journals and census images can contain sensitive routine bodies and configuration.

The formal model concerns bounded chunk arithmetic and conditional correspondence over abstract integer-indexed carriers. Faithful observation, copy relation, guarded completion and connection/SQL custody are premises. It does not prove the TypeScript, Buffer, TextDecoder, PostgreSQL cursor, journal or driver implementations, observer completeness/injectivity, source or issuer authentication, concurrency exclusion, Python 16.15 support, a public profile or backend acceptance. Earlier wrapper/model iterations remain historical. No original acceptance case is promoted; **26/132 remains unchanged**.

## Artifact digests

- Native `native.json`: `0c703761bd03f8ece40e5f6be3d7ec6ab76c256fede34f541786aa36fc3d5c7f`
- Native wrapper `receipt.json`: `b2fb48d8204c6d3a16eb7b104587834ded45e71a6dfefb2725e2716bde6b6ff1`
- Native `sources.zip`: `e34f16bda00631fb500806ed95da73ca7f3b3bbae1085a4a6e3f19508c4d46a3`
- Final `proof.json`: `9f642a5fbd4f6e7211e5d52a038a7101731f934c247a90ec436fa49a97745565`
- Formal `sources.zip`: `af3f91bd49e1a22a6e1620c2fef45880da292d69fa36d9480cd7fcb2c588e6a4`

Detailed checks and journal digests are in the native `astra-audit.json`; fresh-context results and exact SMT digests are in the formal `astra-replay.json`.
