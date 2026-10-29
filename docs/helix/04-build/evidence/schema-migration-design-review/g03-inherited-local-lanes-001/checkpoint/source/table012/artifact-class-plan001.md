# Table012 finite artifact-class correction

This source-only derivative preserves table011's inputs, accepted Cargo cache007, command roster, P56 provenance, deadlines, output caps, and actual failed run. It repairs only the two selected-artifact class mismatches in the sealed Sol plan `/private/tmp/g03-table-cli-artifact-class-sol-plan001.md` (SHA-256 `567be99ba66ccd006b5116b1c5dd9529186d5e9db14dbdf2eddb4cabab5f32a0`).

The three identity checks for `/target/debug/examples/compile_table_operation` use the existing 256 MiB selected software-artifact bound. Immediately before each cap decision, the guest records a fixed-shape lstat observation (path, phase, size, permission mode, file type) into the bounded phase receipt. It rejects symlink/non-regular files and sizes outside the selected-artifact bound before hashing; stable hashing and cross-phase equality checks remain intact. No binary was measured or executed by this source-only change.

The generated `artifacts/operation-browser-cases.json` is treated as selected software: one guest consumer and three host read/hash/recheck consumers use the existing 128 MiB selected-artifact per-file limit, still within the existing 256 MiB aggregate selected-artifact cap. Full parse, 56-case roster, and byte/hash equality predicates remain unchanged. Public report/log caps are unchanged.

No product, command, corpus, expected result, phase order, cache, source/custody, or browser input changed. Table011's failed observations are preserved outside this derivative. This candidate is not executed; root may run a complete successor only after Sol source review.
