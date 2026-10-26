# Core 3.14 failure visibility: FV-F1 closure

Verdict: SOURCE ACCEPT. Exact workflow /private/tmp/umf-core-python314-generation/.github/workflows/core-python314-generation.yml is SHA-256 c868f0f634d7bb211283031c45d90c696f9f970809cbe8ff0d7dcf3de946488a, 80,011 bytes.

The sole added fixed_argv entry for generate-regex-table-profile exactly matches the actual argv retained in /private/tmp/core-314-generation-40414089598/command-records.jsonl. Its full multiline script also exactly matches the existing source-owned shell body after the literal block's common indentation removal, including initial/final newlines. No arbitrary Bash argument or prefix matching was admitted. Removing only this added line reconstructs the complete reviewed preimage SHA-256 83da9fee68703528d3d6b62ec550ce7a3db2e007afa08a69a32f467945a446d5, 78,892 bytes. FV-F1 is closed; all other conclusions in review001 ef2e5efe57cabcc4d0f27938655b800d7afd8ee7893a7183c2150ab9332027aa are inherited unchanged.

Root may commit/ref-check this exact visibility correction and perform one changed-source diagnostic run under the accepted metamodel-artifacts recipe. Preserve actual run40415380967 and its unknown underlying error; inspect newly retained exact diagnostics before any compiler/acquisition/pin/phase/adoption/budget change. No generated output, qualification or support claim follows from source acceptance.

Inspection used only text, stdlib JSON decoding of the fixed data literal/retained record, and hashes. No candidate execution/import, AST/YAML evaluation, tests, generation, Git action or source edit occurred; only this receipt was written.
