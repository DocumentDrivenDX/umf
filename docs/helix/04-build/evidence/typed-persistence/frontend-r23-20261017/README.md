# Installed R23 frontend — 2026-10-17

Temporal qualification remains **HELD**. Exact SDK freeze `bd548920a2e301ea2e025d4957d589df39cacdb2` builds
wheel `5743e97373edf2eaa43118cef114bbf221cfba43015db1b9cda6cad457aa1636`. All47 SDK payloads match frozen Git, wheel and
installed bytes; both original Weft compiler payloads match its immutable wheel.
All three pinned checkers pass positive clients and74 exact negative files.
Installed discovery passes317 tests with no failures, errors or skips.

Native read/key and refactor-regeneration suites are separate and excluded from
these unit totals. Runtime payloads are retained from the exact wheel Git freeze. Authored test inputs
are retained from `56d4ec89`: full native source facts replace legacy fixtures,
and the old mock compiler is explicitly refused instead of labeled exact.
The two successor search-decoder tests are excluded because that implementation
is absent from R23. Original pre-migration failures are retained; no skips,
assertions or production admission checks were weakened. Static generation and
checker inputs are unchanged between these commits. Compiler source,
wheel and native binary are not included. Native backend, authorization, release,
signing, main merge and live deployment require their own evidence.
