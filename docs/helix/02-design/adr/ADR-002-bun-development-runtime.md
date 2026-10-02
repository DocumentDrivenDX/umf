---
ddx:
  id: ADR-002
  type: adr
  activity: design
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: umf.prd
      kind: informed_by
---

# ADR-002: Use Bun for development and testing

| Date | Status | Deciders | Related | Confidence |
| --- | --- | --- | --- | --- |
| 2026-09-20 | Accepted | Project owner, explicit instruction | FR-39; NFR-11–NFR-14, NFR-26 | Runtime choice and bounded Bun/browser compatibility confirmed |

## Context

UMF needs a default development and test runtime for its preferred TypeScript
implementation. The library must also execute in a browser as JavaScript, with
WebAssembly available where justified. The owner explicitly selects Bun for
development and testing; high throughput is not the reason for this choice.

## Decision

Use Bun as the default JavaScript runtime for local development, command-line
tooling, and automated tests. Use its package manager and test runner as the
default toolchain. Pin the chosen Bun and TypeScript versions and commit the
dependency lockfile when scaffolding the implementation.

Use `bun test` for the native unit/integration suites. Keep a separate TypeScript
type-check gate and an actual-browser test gate. Bun success does not establish
browser compatibility. Browser-facing core and adapters must not depend on
`Bun.*`, Node filesystem/process APIs, or runtime-specific global types; those
belong in development/test/CLI boundaries. Supply references and data explicitly.

The browser artifact is JavaScript; Bun is not required in the consuming browser.
Pin any separate runtime required by an independent native oracle or browser
automation tool. Such tools do not replace Bun as the default project runtime.

## Alternatives

| Option | Benefit | Cost | Disposition |
| --- | --- | --- | --- |
| Bun | Owner-selected runtime with TypeScript tooling and integrated test runner | Runtime-specific APIs could conceal browser incompatibility | Selected; enforce separate browser boundary and tests |
| Node.js | Alternative JavaScript tooling host | Does not follow the owner's default-runtime instruction | Not selected as default; tooling exceptions must be explicit |
| Browser-only development/testing | Directly exercises the consuming environment | Does not cover native compiler oracles and CLI workflows on its own | Required complementary validation, not the sole development environment |

## Consequences

Development commands and CI use the same pinned default runtime. The project
must maintain distinct browser and tooling type environments and validate the
packaged browser artifact. A dependency working under Bun remains provisional
until tested in its claimed browser scope. This decision does not make Bun APIs
part of the UMF specification or mandate Bun for independent implementations.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Bun-only dependency leaks into the library | Controlled in the tested scope | Browser import or execution fails | Separate entrypoints/types; browser build and runtime checks |
| Tool or native oracle requires another runtime | Present and bounded | Validation cannot run under Bun alone | Pin a narrow tooling exception and retain Bun as default |
| Runtime/compiler upgrades change behavior | Ongoing | Nonreproducible fidelity evidence | Locked dependencies, pinned versions, full corpus rerun |

The delivered core and adapter corpus has exercised the separate Bun and browser
boundaries. Compatibility remains version- and subset-qualified: a dependency
failure may change tool selection without changing portable UMF semantics.
Revisit this ADR if a required workflow cannot be supported with a bounded
tooling exception, or if a runtime/compiler upgrade changes recorded outcomes.

## Validation

Require reproducible installs, passing type checks and Bun suites, a browser
bundle without host-only imports, and actual-browser native round trips,
unknown-content retention, and projection diagnostics under TP-001. Record
versions and compare browser/Bun semantic results.

At the 2026-10-02 review, this gate is implemented. [`package.json`](../../../../package.json)
pins Bun 1.3.14 and TypeScript 7.0.2; `bun.lock` is committed;
[`tsconfig.json`](../../../../tsconfig.json) excludes host runtime types from the
portable source while [`tsconfig.tools.json`](../../../../tsconfig.tools.json)
admits Bun types for scripts and tests. The [implementation plan](../../04-build/implementation-plan.md)
records passing strict type checks, browser builds, actual Chromium 148.0.7778.0
execution without host globals, and scoped Bun/native corpus checks. The latest
[integrated relationship acceptance record](../../../../fixtures/validation/relationship-integrated-acceptance-evidence.json)
retains the tested revision, commands, versions, source fingerprints, and
limitations. These records establish the tested subsets only; they do not promise
compatibility for unexecuted browsers, runtimes, dependency revisions, or native
ecosystems.

## Supersession

Supersedes: none. Supplements ADR-001, which selected serialization only.
Superseded by: none.

## Concern Impact

Selects the HELIX library `typescript-bun` concern for the `language-runtime`
slot across all project areas. It applies reproducibility, portability, minimal
participation, and runtime-boundary concerns without changing NFR-12–NFR-14.

UMF overrides four catalog practices in the project concerns artifact: Bun-native
APIs stay outside browser-facing library code; the repository remains a single
package rather than a Bun workspace; Biome is not a current gate; and the checked-in
strict TypeScript configuration, rather than additional source-style restrictions,
defines the accepted compiler boundary. The actual-browser gate and separate
portable/tooling type environments mitigate the runtime-boundary override.

## References

- Authority: owner's 2026-09-20 instruction to use Bun for development/testing.
- [Architecture](../architecture.md), [PRD](../../01-frame/prd.md), and [TP-001](../../03-test/test-plan.md).
- [Bun TypeScript documentation](https://bun.com/docs/typescript) and [test runner documentation](https://bun.com/docs/test), accessed 2026-09-20; living docs, not project version pins.

## Review Checklist

- [x] One decision records explicit owner direction and alternatives.
- [x] Browser portability, consequences, and reconsideration conditions are explicit.
- [x] Versions are pinned and bounded development/browser compatibility checks are recorded.
