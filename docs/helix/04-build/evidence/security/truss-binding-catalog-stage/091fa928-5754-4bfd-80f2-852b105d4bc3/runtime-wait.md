# Failed predecessor and interrupted cleanup — 2026-10-11

The frozen run session51247 (PID92405) completed362 observations but failed its final source-current check because source/control edits occurred during execution. failure.json retains that failure; no pass is claimed. It then waited on the installed pgserver shared runtime lock during cleanup. lsof observed the live process with the shared lock file open and no remaining database socket; that observation did not prove startup status. Multiple other live jobs used that mutex.

The owned process was deliberately interrupted twice to leave the blocking cleanup and atexit retry; terminal exit130 was observed. The exact pgdata was identified from its .handle_pids.json, which contained only92405. A targeted pg_ctl stop found that TemporaryDirectory atexit had already removed that pgdata. Further postmaster cleanup status is recorded separately. Replacement tests use a single-handle subclass preserving installed startup/cleanup code with private mutex/socket configuration and captured pgserver implementation sources.

Targeted SIGTERM stopped the exact leftover postmaster97429; subsequent ps verified that PID absent. Temporary pgdata already absent; frozen execution copy removed, original preimages.zip retained. owned socket directory removed (empty). This manual diagnostic cleanup does not convert the failed run into a pass.
