# Foundation r5b exact-wheel refresh — 2026-10-16

SDK wheel SHA-256: `9427c729c3e5ffe68f08e4c6e94cbdc0d478680a408ff769294f2eb61ad52adb`.
This is a distinct receipt cohort from foundation-r5. All 33 SDK payloads match
current source, the wheel and the isolated installed Python 3.14.8 environment.
The only runtime difference from r5 is the catalog Page import/re-export layout;
no old r5 or native Ashlar receipt is relabeled.

Fresh results:
- 145 installed unit tests pass with zero skips using the retained prefix
  compiler wheel `e1d4e2491a1e0d64617761e4efb16527d979e3d6c55bc7358693ceb7ac542bcf`.
- Three model/AST/import tests also pass in a separate clean environment containing
  only SDK/Pydantic profile pins; the compiler is absent there.
- Public CLI generation, before/after drift checks and 69 generated golden cases
  plus seven presence/default controls pass. Three temporal vectors remain held.
- Five schema refactor variants pass all three pinned checkers, source-pointer and
  manifest assertions (three test methods).
- All three pinned checkers pass generated positives and exactly the reviewed
  rule/line/multiplicity inventory for 38 negative files.

The r5 actual installed two-wheel seeded defect proof remains retained as its
original cohort. `values.py` is unchanged; that receipt is not called a new r5b
execution. This packet runs no native database or engine qualification. Temporal
qualification remains **HELD**, including when low-level temporal unit tests pass.
Absolute scratch paths retain the original run locations; receipts are copied verbatim.
