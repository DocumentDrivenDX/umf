# Consolidation prerequisite evidence

Normal merge dc860176 preserves exact PR21/27/29/30 heads. The focused license fix preserves the actual case of one LICENSE basename and refuses missing/ambiguous names; module graph/replacement/output-name checks remain intact. Four controls pass14 assertions. The initially missing non-null index assertion failed TypeScript7 checking; the exact-one guard now justifies that static assertion and full typechecking passes.

Global Go1.27.2 correctly refused the exact1.27.1 build. Explicit GOTOOLCHAIN=go1.27.1 with pinned Bun1.4.2 builds the complete reference;12 tests/9939 assertions and deterministic regeneration pass. Guide build and all seven malformed-source/output negative controls pass. No native/browser cohort was automatically repinned. Changed-SDK native integration receipts are separately owned under typed-persistence/main-consolidation-20261016.

Configured Innsigle4185eb56 verification reports17VALID/7STALE reference claims. Re-sealing with the existing configured signer failed with1Password authorization timeout. The owned signer process was stopped to prevent duplicate attempts; no key/config/verification gate changed. Signing remains pending human1Password approval, so this packet claims neither successful signing nor publication/main completion.

The original PR27 dirty working tree is preserved unchanged at public branch codex/preserve-pr27-dirty-20261016 commit24543f6c0d5b050e208b4d73c339a10eba3b7b39 (32 modified/untracked files, temporary index; no owner-file/index changes). It is an unfinished snapshot, not accepted implementation evidence. Original preservation tags remain unchanged.
