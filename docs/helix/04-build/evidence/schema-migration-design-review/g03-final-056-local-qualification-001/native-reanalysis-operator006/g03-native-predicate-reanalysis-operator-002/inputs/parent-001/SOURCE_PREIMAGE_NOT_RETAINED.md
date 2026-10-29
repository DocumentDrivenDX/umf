# Parent 001 source preimage custody gap

Status: `SOURCE_PREIMAGE_NOT_RETAINED`.

The frozen 001 packet/integrity record identifies the managed predicate preimage SHA-256 as `e837d8664d5ae6a6ae8d4bd8b8456d257bdc9c6295fdba5d81d102d334f972d3` and the mutation-test preimage SHA-256 as `5a6f917656c5cf77d29ae352a56e8b24cb18fe6482c0082a9960b2d66c9bc8d7`. Those two source files were not copied into operator 001. The later authorized 002 source repair began before separate preimage copies were retained. A bounded reverse-patch reconstruction did not reproduce the original predicate hash; no reconstructed bytes are represented as the 001 preimage.

The 001 operator, packet, integrity manifest, source005 seal, and actual007 result/evidence remain unchanged. Operator 002 instead pins the exact current predicate and mutation-test bytes in its own `source/` directory and in the managed native worktree for subsequent review and PR preparation. This note records the custody gap; it does not change original native observations or claim missing native evidence.
