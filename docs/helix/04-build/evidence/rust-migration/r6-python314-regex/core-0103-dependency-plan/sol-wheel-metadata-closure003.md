# Core 0.10.3 WHEEL framing: WM-F1/F2 closure

SOURCE ACCEPT — only WM-F1/F2 from consolidated review676efc5cc3206964154a138a6062c717dd893839e210d33b1b631f74b25cc2b5 closed. Inherit all other reviewed checks; no residual finding.

Actual Core postimages in /Users/erik/.codex/worktrees/core-python314-release/umf:

- tools/qualify_python_release_wheel.py:22,806 bytes/SHA256d1d099785b2086dcd0820a68c7e51985a01249f09cc9a1a3932b405f80d77652.
- python/tests/test_distribution_artifact.py:38,369 bytes/SHA25657c2bc4de660798ac1028b93f480ddb77934b2110fce03a72d968039667ae8c1.

Leading LF now refuses before any normalization. Tag field counting uses exact colon-separated field identity with ASCII-insensitive comparison; the sole accepted line still must equal canonical Tag plus the validated value byte-for-byte. A following SP/HTAB continuation refuses. Both raw/repaired leading-section and continuation codes are present in the fixed diagnostic vocabulary; existing raw/repaired Tag-count/value codes cover malformed/case-variant duplicates. No invalid result falls back into success.

Four precise negative pairs invoke the actual comparator: leading empty section with an additional repaired terminal LF, canonical plus unchanged lowercase tag, and identical SP/HTAB Tag continuations. Existing four positive, ten earlier negative and two complete/oversize diagnostic controls remain exact. Reversing only the four added pair rows reconstructs the entire prior37,169-byte test SHA2568a1e746bea3c993bf796d05eededd6cf62d570e5b0003a91f97836f7880336fe. Reversing only the leading-LF guard, Tag-count expression, continuation guard and four fixed reason entries reconstructs the entire prior22,333-byte helper SHA256311681085a6c2438bb18f5d0b8daa10f5138d0edbc06d5033f711f7a3237d40a. This proves no other helper/test body or previously accepted payload/RECORD/ELF/native/policy/tool/sdist/family behavior changed in this correction.

Accepted framing remains limited to validated Tag removal and one optional terminal empty header/body-separator LF, preserving all other bytes/order/unknown non-Tag content. Bounded actual-byte diagnostic and original aggregate/caps/closed artifact controls remain intact. No metadata is rewritten inside a produced wheel.

Root must commit/freeze, run genuine unchanged dependent generation/R3 checks and review/adopt actual outputs, then qualify actual changed-source original producers/direct+sdist-rebuild/four installed cells and required normal gates. Source acceptance gives no installed/native/release/public claim. The failed old repaired WHEEL remains unretained/unknown; later actual raw/selected artifact bytes and bounded diagnostic must prove the new relation. Preserve old actual facts and all live/queued runs; no relabel or cancellation.

Only source text/stdlib hashes/reversal checks and this receipt; no candidate execution/import, AST/YAML parsing, lint/tests/generation, Git action or source edit. Root-owned factual docs were excluded.
