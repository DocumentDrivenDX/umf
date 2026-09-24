# ODCS conformance evidence

Public code is TypeScript for Bun/browser JavaScript. The independent development oracle uses
jsonschema 4.25.1 and PyYAML 6.0.3 from the existing pinned native/dbt/oracle-requirements.txt
environment; there is no public dbt runtime dependency.

```sh
python3 scripts/odcs-sources.py
bun scripts/odcs-schema.ts
bun scripts/odcs-roundtrip.ts
.cache/dbt-venv/bin/python scripts/odcs-oracle.py
bun test tests/odcs/odcs.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/odcs-browser.ts
```

The collector clones the public v3.2.0 release if absent, verifies its immutable commit and
copies the entire YAML example subtree with license and hashes. Refreshing schemas or examples
is explicit. All 42 examples preserve; three fail their declared native schema and remain
recorded evidence. Regenerated YAML uses exact JSON syntax; original formatting remains archived
in UMF. No servers, quality rules, SQL expressions or SLA checks are executed.


Local reference evidence uses pinned docs/references.md and authored expected locations in the
release relationship example:

```sh
bun scripts/odcs-reference-schema.ts
bun scripts/odcs-references.ts
bun test tests/odcs/references.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/odcs-reference-browser.ts
```

These are specification-derived lookup vectors, not data-constraint checks. External references
remain blocked without fetching. The release example's addresses.address_street name mismatch
is recorded rather than repaired.


Relationship pairing evidence keeps official shape validation separate from runtime reference
and arity rules:

```sh
bun scripts/odcs-relationship-schema.ts
bun scripts/odcs-relationships.ts
.cache/dbt-venv/bin/python scripts/odcs-relationship-oracle.py
bun test tests/odcs/relationships.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/odcs-relationship-browser.ts
```

The corrected-name fixture is a separately labeled authored copy; the upstream example remains
unchanged. Property-level array targets remain explicit unsupported cases even though the native
schema accepts them. No data constraints are executed.


ID-selected rename evidence extends the corrected relationship fixture with nested paths and
an ID-based reference:

```sh
bun scripts/odcs-rename-schema.ts
bun scripts/odcs-rename.ts
.cache/dbt-venv/bin/python scripts/odcs-rename-oracle.py
bun test tests/odcs/rename.test.ts
UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/odcs-rename-browser.ts
```

The candidate rewrites known local shorthand only. Expression-like custom metadata remains
unchanged and is explicitly outside the rename-equivalence claim. Collisions/unresolved known
relationships block without returning a partial candidate.
