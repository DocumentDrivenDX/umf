# Table012 source derivative

Status: `FROZEN_SOURCE_ONLY_NOT_EXECUTED`. This fresh derivative leaves table011 and its failed raw observations untouched, and reuses the accepted inputs without copying prior run receipts. It contains only the finite artifact-class correction defined in `artifact-class-plan001.md`; no successor execution has occurred.

The prior actual table011 run is retained unchanged at `/private/tmp/g03-final-table-operations-operator-011/runs/8119c30c147e4c3d868999fb60ebc517/`. It failed during preparation when the generated native CLI exceeded its extra 64 MiB hash cap. Its exact size was not retained and is not inferred. The generated 56-case browser corpus was 2,537,368 bytes and would also exceed the prior 1 MiB consumers. Table012 uses existing selected-artifact bounds and records CLI lstat metadata before rejecting an over-limit binary.

Python files were checked with AST parsing only. No candidate import, tests, product commands, Docker, Git, network, compiler, browser, or runtime execution occurred. Root is the sole executor after Sol reviews the source package.
