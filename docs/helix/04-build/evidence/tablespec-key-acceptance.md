# TableSpec Key binding acceptance

The TableSpec task under [TD-044](../../02-design/technical-designs/TD-044-core-key.md)
and [CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md) passes
qualified binding acceptance. This covers the TableSpec portions of
[US-044](../../01-frame/user-stories/US-044-core-key.md) AC2–6, AC11 and AC13.
The other four Key bindings and the separate admission/delivery gate remain open.
Native equivalence is not claimed.

## Implemented behavior

`classifyTableSpecKeys` retains raw `primary_key` and `unique_constraints`
declarations, resolved column references and explicit unknown enforcement/author
intent. It does not create core keys, adopt the native merge-key default, or
validate an entire native model. Malformed tuples and unresolved references stay
in residuals. Original JSON/YAML text, numeric lexemes and split-file sidecars
remain recoverable through `recoverTableSpecKeySource`.

`projectKeysToTableSpec` consumes an explicit core 0.6.0 Record, a verified author
declaration for every key, and explicit member-to-column bindings. It emits the
marked primary tuple and alternate tuples in their declared order. Every key
retains its own residual for stable ID, name, primary intent, equality and
unproven enforcement. Report mode can emit native declarations; strict mode
blocks these losses. Invalid native identifiers and incompatible scalar carriers
block both modes without a partial candidate. Unknown core/key/member/native
content stays in the retained source. `recoverKeysTableSpecIdeal` recovers that
source after checking the receipt and current native document.

Key-list reordering and verified renames preserve stable IDs. Changed ordered
components, component meaning or ownership qualifiers invalidate old author
receipts. Forged receipts and stale native representations cannot claim recovery.
Receipt verification establishes consistency, not authentication.

## Native limits and counterexamples

The native pin is TableSpec `647e8e566ad78b864282ec65c0b0b2237aa63084`.
Sixteen declaration probes and sixteen identifier-boundary probes distinguish
runtime-model acceptance from checked-schema acceptance. The checked schema
accepts trailing-newline identifiers that the runtime rejects; projection refuses
them. Both enforce the tested ASCII-name and 128-character boundaries otherwise.

All twelve emitted schemas pass the pinned model and checked schema, including
one primary plus multiple alternates. Generated row validation accepts duplicate
rows while rejecting invalid scalar controls. This does not establish collection
uniqueness, exact comparator behavior, or SQL/GX/merge execution enforcement.
When `primary_key` is absent or empty, the native model's effective merge key
falls back to `meta_checksum`; UMF does not turn that default into authored identity.

## Verification

The scoped compatibility command passes **226 tests / 21,024 assertions across
43 files**, covering TableSpec ingestion, projections, consumers, earlier ideals
and core operations. This is not a full repository regression or a refresh of
historical five-system gates. Typechecking, the browser build and the
291-schema / 49-package audit pass.

Chromium agrees with Bun on sixteen classification cases and 32 JSON/YAML native
recoveries. The projection matrix has 28 cases: twelve emitted candidates,
sixteen blocks, 24 ideal recoveries and 24 composed native recoveries. It covers
primary/alternate keys, zero primary, multiple alternates, compound order,
renames/list reordering, unknown content and identifier boundaries. Forged/stale
receipts are refused, with no getter calls, runtime host globals or external
browser requests.

Reproduce with `bun scripts/core-ideals/key-tablespec-oracle.ts`,
`bun scripts/core-ideals/key-tablespec-browser.ts`, and the exact commands in the
[compatibility command record](../../../../fixtures/validation/key-tablespec-compatibility-command.json).
The [acceptance record](../../../../fixtures/validation/key-tablespec-acceptance-evidence.json)
links the native/browser proofs and fingerprints. Earlier conformance records
retain their original execution scope and are not republished as current runs.
