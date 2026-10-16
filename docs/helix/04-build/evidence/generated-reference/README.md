# Generated reference execution evidence

Scope: FEAT-032 / US-089 / TD-089 / CONTRACT-077. Implementation is a static
metadata consumer with fixed local operation workers. It does not refresh native
integration qualification or change UMF semantics.

The generated reference contains the discovered schema, extension-version and
public-export inventories, scoped operation records, checked examples and ten
supporting guides. Registration mappings are verified against actual public
factory results. Historical results retain unknown/incomplete source closures;
the independent JSON Schema oracle's mixed outcome remains visible.

## Verification artifacts

- `browser.json`: tested manifest digest, exact Chromium version, observed checks,
  desktop/mobile profiles, interaction measurements, page errors and external requests.
- `*-desktop.png`, `*-mobile.png`: actual Playwright captures of every new route.
- `unit.log`, `types.log`, `docs.log`: retained final command outputs when present.

Final local result: 2,499 reference entries cover 405 schema sources, 69 extension
versions, 1,864 public exports, 146 operation/declaration entries, five examples
and ten guides. The evidence census contains 7,512 paths; these counts are
inventory coverage, not support grades. Thirty Chromium 153.0.8010.12 checks pass
with zero page errors and zero unexpected external requests from the reference.
The report's tested manifest SHA-256 matches the final generated manifest.

The full reference suite passes 11 tests / 9,879 assertions, including isolated
regeneration, deliberate drift refusal and boundary injections. Focused final
record/runtime checks also pass. Both TypeScript configurations pass; action
guide generation, malformed-source controls and runnable examples pass. The
released schema browser passes 95 strict-CSP embedding checks. Final generation
check uses the pinned Bun 1.4.2 executable and leaves outputs unchanged.

The browser harness verifies seven new routes, pointer navigation, exact public
Bun/browser serialization parity, current-core validation, unknown retention,
default inspection, selection, compiled native projection, strict refusal,
Protobuf source compilation, cancellation, original downloads, mobile overflow,
keyboard activation and tampered-asset refusal. It also visits sixteen existing
public routes under the production `/umf/` base path.

Visual review checks the paper/forest/olive palette, serif heading hierarchy,
catalog/detail proportions, mobile navigation wrapping and table containment.
Loaded search and cancellation are measured over twenty trials; these are local
observations, not field Web Vitals or real-user monitoring claims.

## Reproduce and publication boundary

See [STP-089](../../../03-test/test-plans/STP-089-generated-reference.md) and
`scripts/reference/browser.ts`. Build commands and fixed-validator input custody
are in CONTRACT-077. The compiler is pinned to Go 1.27.1 and strips incidental
Git build metadata; repeated builds handle read-only toolchain output copies.

The reference's own verification directory is explicitly excluded from native
evidence discovery to avoid a build-evidence self-hash cycle. The generated
`evidence-inventory.json` retains this exclusion and its reason.

The user explicitly approved sealing with the existing 1Password signing key.
Local screenshot, asset-integrity and test results do not substitute for
Innsigle signatures or a production deployment. Key access uses the configured
1Password custody; no private key is written into these evidence artifacts.

## Repairs and continuation

Early worker startup exposed missing fixed native-payload validators; those are
now included in the generated validator census. A failure capture also showed
that loaded-record text legitimately produced two search matches; the test now
selects the named oracle. Metadata matches rank before loaded-source matches.
Navigation ownership is independently exercised with a deliberately delayed old
request. Its test route cleanup now waits for the held handler before unroute;
the earlier failed harness log remains in `browser-route-control-failed.log`.
Malformed pointer routes explicitly refuse instead of selecting the root.

Implementation, visual review and local qualification pass for the repaired
scope. The earlier main-integration snapshot had 24 valid signatures, but the
CI metadata reproducibility repair changes the seven reference pages. Their
new seals are pending: the configured 1Password CLI request timed out before
releasing the key. `sealing.log` records that refusal; `signatures.log` records
the present seven stale reference claims. Do not treat the prior snapshot's
seals or copied claims as qualification of the repaired output. Final sealing,
public-claim copy, integrity refresh, CI verification and merge remain pending.
No signing key material is retained in the repository.

Production deployment has not been requested. No comparable token-usage
baseline or runtime per-turn usage meter is available; no measured token total
or enforced spending cap is claimed.

## Current-main integration

PR #27 integrates main at `d40988e72406e35e2e9af75c47e77968d94b1957`.
The merge retains the newer prepared-action APIs, browser SQL-to-actions/store
flow, immutable schema-browser producer checks and SDK qualification evidence.
The homepage retains the upstream interactive compiler and the new reference;
the action guides are regenerated from the merged API source rather than
choosing a generated side of the conflict. HELIX artifact identities and draft
review status remain unchanged.

The refreshed SQL-to-actions browser check passes actual local catalog loading,
three-row batch execution, lost-acknowledgement recovery, replay/reopen, original
history and cancellation controls. Its scoped record is retained in
`../bulk-update/website-compiler-results.json`; it does not claim full native904
qualification. The reference was regenerated after that record was refreshed,
and final reference screenshots and results bind that final manifest.
Action-guide navigation covers ten routes at desktop/mobile widths. The
reusable installed browser package passes fourteen Chromium checks, and the
strict-CSP embedding, public protocols and standalone example pass again.
Both TypeScript configurations and browser-action types pass. Guide malformed
source/output controls and executable examples also pass after the merge.

## CI compiler-metadata reproducibility repair

The first merged CI run passed functional and visual qualification but refused
seven reference page signatures. Comparing the retained CI and local manifests
isolated the input differences to the compiler NOTICE and license inventory:
the notice contained local Go cache paths, and an unrelated cached yaml module
had left a stale license in the local build output. The compiler and browser
runtime payloads matched. The initial refusal is retained in
`ci-initial-signature-failure.log`.

The compiler build now emits a path-free pinned module graph and replaces its
owned license directory with the modules actually compiled for js/wasm.
`scripts/reference/protobuf-reproducibility.ts` runs the actual build twice,
injecting a stale license and host-specific notice between builds; the complete
output inventory and bytes must match. This gate runs in microsite CI before
reference generation. `protobuf-reproducibility.log` records the passing local
control. All final reference output, browser evidence and seals are regenerated
after this repair. The runtime guard also correctly refused an unpinned Bun
1.4.3 after the Homebrew 1.4.2 path disappeared; final generation uses a restored
task-local Bun 1.4.2. That refusal is retained in `runtime-guard-refusal.log`.
