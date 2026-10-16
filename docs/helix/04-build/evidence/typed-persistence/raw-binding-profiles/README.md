# U-2 declarative raw-table binding profiles

PASS for `typed-access-columns/0.1` partial declarations on binding 0.2.0 and
logical core 0.8.0. Native Lakebase, Unity Catalog and Spark/Delta behavior is
UNTESTED. [Verification](verification.json) records commands, source fingerprints,
failed attempts and limits; [browser evidence](browser.json) pins Bun 1.4.2 and
Chromium 153.0.8010.12 for 12 cases and unknown-content JSON/YAML recovery.

`src/extensions/binding/raw-profiles.ts` exposes `inspectRawTableBinding`,
`rawTableBindingProfiles` and `RAW_TABLE_BINDING_SUBSET`. It checks exact authored
platform/version identity, explicit direct columns and Record ownership. The
existing generic target strings already admitted these systems; the new named
subset makes their interpretation explicit without changing other subsets.

65 binding tests / 4,832 assertions pass. Portable and tools TypeScript checks
pass. The browser observed no external requests or host runtime globals. These
results validate declarations, preservation and refusal behavior only.

The generator owns complete selected ColumnSet coverage and native type agreement.
A passing partial binding with `fields:[]` does not satisfy that gate. Weft owns
lowering; CONTRACT-072 native version observation and qualification remain separate.
The coordinator and generator owner received this boundary and API before integration.
