# SDK public-H storage-backed local operator proposal 007-r2

Prepared for source review only. No Docker or H execution occurred. The accepted v4 reader and READY packet008 are unchanged. The runner uses the existing qualified producer volume read-only, the one-path read-only safe-directory config, a fresh evidence volume, and a bounded offline exporter. A reader failure can export only safe bounded partial evidence; only the unchanged H success receipt plus complete evidence closure can yield a pass. The outer result now includes elapsed time through export and cleanup and refuses pass beyond 1,800 seconds.

See `PLAN.md` for mounts, constraints, the nested producer mount review item, and all preserved limits. `runner-v006-r2.diff` is the full runner delta from v006. `source-preparation/` contains actual Git metadata preparation evidence only. Proposal007 itself remains untouched; proposal007-r2 is a separate copy.
