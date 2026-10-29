# Core public-download PD-F1 closure

The concrete source correction is ACCEPTED at workflow SHA-256 55bc5219ab40cd7d64c7d08009f543dfbdc244d50954ad8be7dd3e4b4185e047. Independently confirmed the only change from reviewed798d2bfe is the finalizer lookup `public.get('filename')` → `public.get('asset_filename')`. It now uses the actual producer schema without weakening any identity/digest/size assertion. PD-F1 is closed.

This supplements review /private/tmp/core-public-download-source-review.md SHA-256 af3bee44cf812f42f929f1d208bee40667275baaac9a32c62166d2084284f5e9. The harness remains HOLD for execution: actual publication, immutable release commit, repository identity and selected build-source/wheel/native tuple must be bound from genuine evidence; cde values remain historical until that selection. New a1b-built bytes cannot be inferred from old hashes. No release or public-byte qualification claim is made. No runtime, imports, AST/tests, Git mutation or source edits were performed.
