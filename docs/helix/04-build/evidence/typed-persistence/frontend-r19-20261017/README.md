# Installed R19 frontend — 2026-10-17

Temporal qualification remains **HELD**. Exact SDK freeze `7b206ef3b2720500c8409b17915629e4aac11448` builds
wheel `b1acf1978672c1f1ba7af0593d33bbbbc8c34f65a715839eed8b58f4dff5556c`. All47 SDK payloads match frozen Git, wheel and
installed bytes; both original Weft compiler payloads match its immutable wheel.
All three pinned checkers pass positive clients and74 exact negative files.
Installed discovery passes304 tests with no failures, errors or skips.

Native read/key and refactor-regeneration suites are separate and excluded from
these unit totals. Runtime/test/static inputs are retained from this exact Git
freeze; later working-tree changes do not relabel the cohort. Compiler source,
wheel and native binary are not included. Native backend, authorization, release,
signing, main merge and live deployment require their own evidence.

This cut fixes projected related-Key streams that previously returned a flat
transport row whenever tuple_fields was empty. Six regression controls fail
against the immutable R18 installed runtime and pass against the corrected
source: sync/async natural results, early close, and invalid projected-row
revalidation with original-stream cleanup. Three existing page-size controls
also pass. The existing mapping/cleanup wrappers are reused; no backend shim,
new timeout or transport coercion was introduced. The red and green logs are
retained alongside the installed304-test successor result.
