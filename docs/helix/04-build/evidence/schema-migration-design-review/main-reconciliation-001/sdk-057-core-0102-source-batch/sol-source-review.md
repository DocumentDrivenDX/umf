# SDK 0.5.7 / Core 0.10.2 six-file source review

**SOURCE ACCEPT for the exact frozen six-file batch.** No concrete blocker found. This review read the complete six-path diff against normal main mergea92203244 and the relevant unchanged mirror/generation source. Only read-only Git metadata/source operations and standard-library hash/JSON reads were used; no candidate runtime/imports/AST/tests, Git mutations or source edits.

| Path | SHA256 |
|---|---|
| tests/codegen/acquire_offline_cohort.py | 3fce50c241afd5ef3e5dfa3ea2736c1fbe5b98f8788b98ac296db476395f8503 |
| python/packaging/embedder-wheel-lock.template.json | 5ce1f5a5f69132737d3710126921c085e4dadc751b20d827dd9d4f59c62c8c0f |
| package.json | c7b69fba001805dc9cd4e26e84a9b786be379c1413d020c34600c063d287101b |
| .github/workflows/access-boundaries.yml | e94235c9e027748fecfa218350ed82684ba5f6e33cf978728e4064125b01f50a |
| .github/workflows/g02-g03-native-qualification.yml | 9d0d92c26eab0fd19c000073d46c1c70d1b959115bd52f7b43e669d0222040c8 |
| docs/helix/04-build/evidence/mig-g02-g03/native-qualification-source-pins.json | 88a9de55e8d0134451a20e508ff60315ba4fd6844fcbc4abb472bfda7054bd7f |

## Plan match and provenance

The helper's closed two-platform mapping selects only after actual runner/cell/os/architecture and Python checks. The selected tuple consistently controls URL, filename, destination/cache/full SHA and source provenance. Ubuntu24.04/x86-64 selects qualified public Linux708f; macOS14/arm64 selects qualified public Mac99ff. Both original Python3.11/3.14 rows remain; unsupported cells refuse without an arbitrary fallback. Actual selected public artifacts and PyPI availability are supported by accepted final public-gates review61b6b5eb, not assumed from intended release names.

The shared template records distributionCore0.10.2 and actual Linux2.34 floor while preserving all four intended cells, Weft0.4.53 and MiniRacer0.14.1. The existing access workflow distribution assertion is correctly updated to0.10.2; no other assertion or matrix/case/timeout is changed. SemanticCore0.10.0 is not relabeled. SDK package metadata becomes0.5.7 and remains private:true; no publication follows from this version edit.

Actual mirror `capture_lock` carries the selected source dictionary into package and wheel rows, checks metadata versions and exact wheel closure, and its later lock/mirror path retains full hash/source equality before installation. New nativeSha256 source metadata is compatible with that existing dictionary handling; it does not itself create an independent installed-native hash assertion or capability. The helper's existing whole-wheel hash verification continues to bind the published native member transitively.

The selected native finalizer preserves its existing Core distribution-version and source full-wheel-SHA checks and adds exactly-one Core wheel-row filename equality to the Linux pin. No guard was removed or substituted. The same32 source-pin paths are retained, all32 actual current bytes match their pins, and only the helper/template/package source-hash rows changed, along with the declared dependency/cohort-profile metadata. Generated assets, native cases, five-domain split and original limits remain unchanged. This is not a passing native or four-cell execution claim; macOS14/Python3.14 behavior still requires the original gates.

## One canonical generation push

The existing `.github/workflows/merged-source-generation.yml` remains byte-identical to the accepted recipe, SHA256 `0e6e0b970d917c1bc25f15ebdc98c5c7ae2755c36291ee733d39caa345521a80`. Its exact branch/event/repository/clean-source/tool/Stage-A companion guards, identity → codegen → R3 generation/check ordering, original1800-second aggregate/60-second evidence reserve, bounded command/log/16MiB artifact handling and artifact-only/no-adoption claims are inherited unchanged. Read-only ancestry confirms old remote generation source55c6a895… and required adoption63762c9a…/Corecdebbc… are ancestors of the current source.

One normal push on existing `codex/migration-merged-generation` is source-acceptable after root commits these exact six files and incorporates the separately reported normal mainPR51 metadata/tooling merge, inspecting that final actual source/trigger/roster correspondence before freezing H. This receipt does not pre-attest unseen PR51 postimages. Preserve the existing exact generation-branch runtime exclusions and any legitimate small publisher-validation push checks; do not suppress normal gates. No new generation recipe, branch rewrite or additional campaign is required.

Retain historical R3 outputs as historical seeds only. Fresh generated outputs require actual output/provenance adoption and final source-pin review before native dispatch. Neither source acceptance nor the generation push closes native migration, the four-cell matrix, SDK merge/release, or any support beyond the recorded Core public cohorts. No runtime gain or generation success is predicted.
