# Original Truss manifest command catalogs

The SDK source candidate can retain an original portable action plan for a captured `@command` targeting Truss. It also supports a catalog containing separate raw SQL and Truss variants. This is an inert build and protocol path; a qualified native Truss plan provider and its attempt, seal, publication and recovery controls remain required. Source controls with recording targets do not qualify native execution.

[CONTRACT-902](../../02-design/contracts/CONTRACT-902-portable-action-plan.md) owns the portable Artifact and its original source/action/preparation meaning. [US-086](../../01-frame/user-stories/US-086-precompiled-bulk-commands.md) requires precompiled commands with typed runtime arguments, and [US-087](../../01-frame/user-stories/US-087-truss-target-adapter.md) keeps native Truss attempt and publication ownership in the engine.

Configure a Truss target with `manifestCommands`, keyed by the captured declaration name and presence-variant ordinal, such as `set_selected:0`. Each entry contains exactly `configuration` and `request`. `configuration` is the exact JSON text for the original `MutationCompiler` in-memory registry: original action pins, complete model Artifacts, actual owner-produced preparation Artifacts, and an empty `selectionBackends` array. `request` is the complete original `weft-mutation-compile/0.1.0` input. This data cannot supply connections, credentials, executable renderers or native registration authority.

Use the source-pinned catalog profile with explicit `weft` and `umf.documents` inputs. Every requested model and retained registry snapshot must equal one complete pinned source document. Build checks the captured logical SQL, selected Record/Key, generated ActionRef, model bytes and parameter inventory before invoking the original compiler. Original preparation producer pins must be current and accepted by that compiler; changing a producer label does not establish correspondence. Command-only targets need no `engineRequests`; a read declaration still requires its own original read request.

`ManifestProgram` retains exact registry, request and response text plus the stage-one bundle digest. Its `checked()` method checks retained byte/identity correspondence; `verify_original(compiler)` explicitly recompiles the retained witness inputs. Neither method establishes live registration or execution authority. A provider implementing `ManifestBulkTarget.plan` or its async counterpart receives the distinct `ManifestCommandVariant` and validated actual argument values. The engine must recompile the original source with those values under its current original registry. It must not patch or submit the catalog's witness plan as actual intent. The returned native plan may use the existing `ManifestBulkPlan` delegation protocol; it has no SDK `.execute()` shortcut.

The SDK build profile bounds each retained JSON text at 4 MiB, the combined retained registry/request/response text at 4 MiB, and every inspected Artifact at 1 MiB. The Artifact cap also applies to the portable plan and parameter Artifact and may be narrower than an original owner's maximum. JSON framing is limited to 64 nested objects/arrays and rejects unpaired Unicode before parsing. These are explicit SDK profile limits, not a claim to admit all owner maxima. Exceeding a bound produces a named refusal; data is never truncated. The retained source fixtures prove Boolean and string assignment templates, plus an integer selection cutoff. The original Truss U3/WR-A9 native assignment profile remains string/Boolean; these portable source controls do not qualify an integer native effect. Assignment admission and selection parameter admission remain separate original-owner checks.

The reusable source controls are:

```sh
bun scripts/generate-access-manifest-command-fixture.ts /private/tmp/manifest-fixture
python scripts/prepare-access-manifest-command-fixture.py /private/tmp/manifest-fixture
umf-access catalog --root /private/tmp/manifest-fixture --config /private/tmp/manifest-fixture/catalog-config.json
umf-access catalog --check --root /private/tmp/manifest-fixture --config /private/tmp/manifest-fixture/catalog-config.json
python scripts/verify-access-manifest-command-fixture.py /private/tmp/manifest-fixture
```

Use a fresh explicit output directory. Add `--mixed` to the generator for a genuine raw/manifest fixture using the existing complete original native-bulk-list sources. The verifier uses recording protocol targets and asserts invalid inputs, source mismatch, wrong target and ambiguity cause no target dispatch. Run it with the exact SDK/compiler environment being evaluated; these commands do not start a database.
