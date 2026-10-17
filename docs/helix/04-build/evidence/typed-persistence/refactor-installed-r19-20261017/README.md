# Installed R19 refactor regeneration — 2026-10-17

Temporal qualification remains **HELD**. The original pinned suite passes all three tests in23.969s using installed SDK R19 (source7b206ef3, wheelb1acf197) and Python3.14.8. Actual generated snapshots cover rename, retype, removal and Python-name override with positive and negative callsites.

The suite runs in an isolated exact Git source copy because it writes historical evidence filenames. This preserves prior receipts. The initial preparation used system Python and failed before extraction because its tarfile API did not accept `filter`; the pinned Python preparation then succeeded. No test assertion or product source was weakened. This packet qualifies regeneration against the named installed runtime; native backend, release and deployment gates remain separate.
