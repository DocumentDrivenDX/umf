# Typed-access temporal profile evidence

CONTRACT-075 `umf-access-temporal/0.1.0` has scoped Bun1.4.2 and real
Chromium153.0.8010.12 evidence. `verification.json` records commands, source hashes,
versions and limits. `attempts.json` preserves failed attempts and corrections.

The focused regression passes120 tests/350 assertions, including existing exact
instant/date helpers and unchanged generic core temporal refusals. The new
profile has40 tests/57 assertions. `browser.ts` builds the portable semantic module
for a browser and checks38 golden tokens plus308 deterministic normalization
samples against Bun. Every accepted golden token has an explicit expected
canonical output. `oracle.py` separately checks the38 token verdicts and canonical
outputs using Python3.14.8 standard-library date arithmetic with explicit grammar
bounds. `normalization-sample.py` regenerates the308 independent date/offset
expectations. Run these scripts from the repository root.

The initial red run is a retained missing-module failure, with no behavioral
assertions executed. Python string parsing is deliberately not used as admission:
it accepted an hour24 counterexample until the independent oracle's explicit
clock bounds were added. The final oracle passes the profile grammar.

This evidence qualifies standalone token semantics and normalization only.
Generated models, Python runtime codecs, authored Field refinements, full SDK
acceptance and native/backend behavior require separate evidence. Native/backend
support remains UNTESTED. Python fixed offsets with seconds/microseconds normalize
to UTC before token production and are not constrained to the source token's
minute-offset grammar. Original tokens are retained by this parser; canonical
Python encoding claims value meaning rather than source spelling.
