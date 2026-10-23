# R5 RFC3339 exact-instant kernel

This bounded R5 slice ports the explicit
`umf-rfc3339-exact-instant/1.0.0` profile from CONTRACT-065 into `umf-core`.
It accepts only the contract's four-digit Gregorian date-time subset, preserves
the exact token and offset spelling, normalizes the whole UTC second with exact
integer arithmetic, retains arbitrary bounded decimal precision, and keeps
`-00:00`'s unknown-local-offset fact. It uses no host date/time conversion,
floating-point timestamp, clock, timezone database, or locale. Core timestamp
admission remains unchanged.

The [Python datetime matrix receipt](python-datetime-matrix.json) records a
full 800-year Gregorian date span, deterministic time/fraction values, and six
offset spellings compared exactly against the retained TypeScript helper under
Bun and the new Rust kernel. Focused Rust tests cover grammar/calendar/offset
refusals, arbitrary precision at the 1,048,576-unit bound, negative epoch
rounding, year-boundary normalization and equality. The matrix proves only this
declared parser subset; it does not establish core timestamp, database,
consumer, installed-binding or host-equivalence support.

Bindings integration and TS retirement remain open. The Rust module is
available inside `umf-core`, but no Python, Node/Bun, WASM, CLI, consumer or
storage API is cut over by this evidence.
