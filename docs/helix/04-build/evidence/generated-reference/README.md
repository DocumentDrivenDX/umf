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

Final local result: 2,492 reference entries cover 405 schema sources, 69 extension
versions, 1,857 public exports, 146 operation/declaration entries, five examples
and ten guides. The evidence census contains 7,382 paths; these counts are
inventory coverage, not support grades. Thirty Chromium 153.0.8010.12 checks pass
with zero page errors and zero unexpected external requests from the reference.
The report's tested manifest SHA-256 matches the final generated manifest.

The full reference suite passes 11 tests / 9,858 assertions, including isolated
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

Implementation, visual review and local qualification are complete for this
scope. After the user unlocked 1Password, the approved retry sealed all 23 pages
with the existing configured key: zero failures and zero skipped pages. The
public verifier reports `VALID all (23 claim(s))`; see `sealing.log` and
`signatures.log`. Public keys and claims were copied into the local site's
`.well-known/innsigle/` directory, and all 24 public artifacts match their
staging originals byte for byte. The reference manifest still matches the
Playwright-tested digest. Earlier key-access attempts timed out without
releasing the key; no key material is retained in the repository.

Production deployment has not been requested. No comparable token-usage
baseline or runtime per-turn usage meter is available; no measured token total
or enforced spending cap is claimed.
