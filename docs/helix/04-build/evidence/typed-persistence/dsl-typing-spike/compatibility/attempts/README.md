# Failed attempts retained

1. Initial strict-presence tests failed importing the absent compatibility models.
2. Initial mypy red run reported an internal error; traceback established that
   its cache directory was unwritable. It is not evidence of intended typing
   rejection. The runner now sets a temporary cache directory.
3. First installed-wheel replay passed 32/64 commands (tool observation; that
   report was superseded before archival). The archived first-corrected report
   records 64/64 commands on its own source tuple. The nullable-only
   if_present negative was accepted by mypy, and pyright resolved a root
   calls.py template rather than emitted calls.py, causing unknown types.
   The template is now calls-template.txt and generated modules resolve explicitly.
4. The standalone overload probe shows the unsuppressed mypy overload-overlap
   diagnostic plus the intended invalid-marker rejection; pyright reports only
   intended rejection and reveals both MISSING-bearing positives as Predicate.
5. Dependency installation first failed under sandbox DNS restrictions; the
   authorized isolated-environment retry installed the exact pins successfully.

Historical attempt reports carry their original source digests; they do not
qualify current source bytes. The current results/report.json is the replay head.
