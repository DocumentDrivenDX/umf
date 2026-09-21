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
| 2026-09-20 | Accepted | Project owner, explicit instruction | FR-39; NFR-11–NFR-14, NFR-26 | Runtime choice confirmed; dependency compatibility untested |

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
| Bun-only dependency leaks into the library | Unassessed | Browser import or execution fails | Separate entrypoints/types; browser build and runtime checks |
| Tool or native oracle requires another runtime | Unassessed | Validation cannot run under Bun alone | Pin a narrow tooling exception and retain Bun as default |
| Runtime/compiler upgrades change behavior | Unassessed | Nonreproducible fidelity evidence | Locked dependencies, pinned versions, full corpus rerun |

Provisional risk: adapter-library and browser-runner compatibility are not yet
tested. A dependency failure may change tool selection without changing portable
UMF semantics. Revisit this ADR only if a required workflow cannot be supported
with a bounded tooling exception.

## Validation

Require reproducible installs, passing type checks and Bun suites, a browser
bundle without host-only imports, and actual-browser native round trips,
unknown-content retention, and projection diagnostics under TP-001. Record
versions and compare browser/Bun semantic results. No such evidence exists yet.

## Supersession

Supersedes: none. Supplements ADR-001, which selected serialization only.
Superseded by: none.

## Concern Impact

Applies reproducibility, portability, minimal participation, and runtime-boundary
concerns. Selects the implementation tooling default without changing
NFR-12–NFR-14 or overriding a library concern practice.

## References

- Authority: owner's 2026-09-20 instruction to use Bun for development/testing.
- [Architecture](../architecture.md), [PRD](../../01-frame/prd.md), and [TP-001](../../03-test/test-plan.md).
- [Bun TypeScript documentation](https://bun.com/docs/typescript) and [test runner documentation](https://bun.com/docs/test), accessed 2026-09-20; living docs, not project version pins.

## Review Checklist

- [x] One decision records explicit owner direction and alternatives.
- [x] Browser portability, consequences, and reconsideration conditions are explicit.
- [ ] Pin versions and execute development/browser compatibility checks.
