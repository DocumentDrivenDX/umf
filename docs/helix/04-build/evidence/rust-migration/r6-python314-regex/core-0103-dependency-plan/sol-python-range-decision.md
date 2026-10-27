# Core 0.10.3 Python metadata range

Decision: YES. Set the active Core0.10.3 project requires-python to >=3.11,<3.15 and update its owned metadata expectations and current release documentation. This matches the genuine versioned3.11–3.14 profiles and intentional15+ refusal. It prevents the ordinary installer from accepting an unsupported future interpreter before Document validation. It changes only the new0.10.3 release; immutable0.10.2 artifacts/receipts stay unchanged.

Retain the native from_minor refusal for15+ and invalid/older minors: packaging is an early admission bound, not a replacement for the real engine guard. Retain the exact original four installed Linux/Mac3.11/3.14 cells and old3.11–3.13 regression/oracle controls. The range is not a claim that every Python minor/platform combination received the same installed evidence, nor permission to shrink those cells.

Check the built direct/rebuilt wheels' Requires-Python and sdist PKG-INFO against the same intended range, allowing equivalent metadata specifier ordering rather than relying on string order. Keep focused owned assertions for supported11–14 metadata admission and rejection of3.10/3.15, and the existing genuine15+ native refusal test. Do not add a new product dependency/parser, custom profile fallback, new campaign or cap change merely for this metadata change. Include these expectations in the already required source/artifact qualification.

This is a bounded source-plan clarification to ca65010b367529a2344687e6233b339a16ebd46c36cb21685f1689e48285d5d7; no source edits/runtime/imports/tests/AST/Git actions performed. Family distribution renaming remains separately owned by Stack/Arras and does not expand this Core patch.
