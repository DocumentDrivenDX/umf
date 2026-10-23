# R5 Gregorian civil-date kernel

This bounded R5 slice ports the explicit `umf-gregorian-date/1.0.0` profile
from CONTRACT-066 into `umf-core`. The Rust module preserves UMF UTF-16 input
length and text, distinguishes type and range refusals, validates years 0001–9999
with Gregorian leap rules, and implements year/quarter/month/day truncation
without host date, clock, timezone, or locale APIs. It does not assign calendar
semantics to an unqualified core date value.

The [Python datetime matrix receipt](python-datetime-matrix.json) records the
independent `datetime.date` oracle over every date from 0001-01-01 through
9999-12-31 and its exact comparisons with the retained TypeScript helper under
Bun and the new Rust kernel. The matrix proves acceptance/components for valid
civil dates only; focused Rust tests cover refusal classes, precedence, UTF-16,
truncation and idempotence. It is not authority for broader UMF temporal
semantics or installed bindings.

The [opt-in temporal binding packet](../r5-temporal-binding/README.md) now
qualifies Node/Bun and real-browser WASM exports for its stated subset.
Python and CLI exposure, default API cutover and retirement of the TypeScript
implementation remain open. No native database equivalence is claimed.
