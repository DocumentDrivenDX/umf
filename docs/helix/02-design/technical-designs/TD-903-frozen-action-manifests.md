---
ddx:
  id: TD-903
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-903
      kind: informed_by
    - id: SD-900
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
    - id: CONTRACT-903
      kind: informed_by
    - id: CONTRACT-904
      kind: informed_by
---

# TD-903: Inspect frozen work and bulk replay requirements

**User Story:** [US-903](../../01-frame/user-stories/US-903-frozen-action-manifests.md). **Feature:** FEAT-900. **Solution Design:** SD-900.

## Scope

One vertical journey defined by US-903; inherit the [parent solution design](../solution-designs/SD-900-declarative-actions.md) and architecture's portable/compiler/native boundaries. Shared surfaces live in CONTRACT-902, CONTRACT-903, CONTRACT-904.

## Technical Approach

Reuse original UMF core/actions identity, input, declaration and assessment semantics. Select pinned artifacts/registries explicitly. Preserve original intent and use source-qualified refusal; never make a local dialect, key codec or authority substitute. Pure copied data inspection; no execution or I/O.

## Component Changes

Planned source files: `src/extensions/actions/manifests.ts; spec/extensions/actions/manifest.schema.json; spec/extensions/actions/bulk.schema.json`. The pure implementation now exists; see the scoped execution evidence below.

| AC | Component realization |
| --- | --- |
| US-903-AC1 | complete partition through the governing contract and focused test below |
| US-903-AC2 | artifact integrity through the governing contract and focused test below |
| US-903-AC3 | empty and limits through the governing contract and focused test below |
| US-903-AC4 | no false attestation through the governing contract and focused test below |
| US-903-AC5 | bulk outcome shape through the governing contract and focused test below |
| US-903-AC6 | manifest browser parity through the governing contract and focused test below |

## API/Interface Design

CONTRACT-902, CONTRACT-903, CONTRACT-904 define the exact shared shapes and methods. New exports follow those contracts; no signatures are independently defined here. Upstream schemas/fixtures are original owner inputs. Construct adapters only in the host registration boundary. Core cannot import native I/O/credentials; compiler cannot import Truss storage.

### Boundary realization

Portable boundary gate: `bun run typecheck` and `bun run build`; new plan/manifest modules may import existing actions/core utilities only. Add a focused forbidden-host-import control under the allocated portable test command. Export through the existing actions module and preserve existing extension package identity.

## Data Model Changes

Add reusable schemas beside the existing actions package and preserve existing package/schema identities; package resource inclusion is a build step.

## Integration Points

US-902; native snapshot/guard/batch evidence belongs to Truss US-046–048. Unsupported/unavailable original dependencies refuse, with no fallback to fixtures or another executor.

## Security

Artifacts never load code or authenticate principals. Current protected read/execution/discovery authority remains executor-owned. Raw source/inputs stay out of diagnostics; retained manifests/outcomes require separately enforced access. Unknown relevant meaning blocks eligibility.

## Performance

Use the exact finite item/byte/node/deadline/result-capacity bounds in the contracts. Test both exact boundary and first overflow. No throughput/latency claim is made from structural tests.

## Testing

[STP-903](../../03-test/test-plans/STP-903-frozen-action-manifests.md) allocates each criterion once to a planned test with canonical citation. Command: `bun test tests/actions-manifest.test.ts`. Current scoped portable replay evidence is retained under `docs/helix/04-build/evidence/bulk-update/`; native execution remains unqualified. Independent exact effects/refusals are the oracle, not generated output snapshots alone.

## Migration & Rollback

New profiles are opt-in; existing action/read/group behavior remains intact. Disable new admission while retaining all original manifests, terminal outcomes/tombstones and unresolved recovery custody. Do not reverse committed batches or drop native homes to simulate rollback.

## Implementation Sequence

1. Create the planned red tests in `tests/actions-manifest.test.ts` with canonical citations.
2. Implement contract-owned pure/component behavior in the named source files.
3. Integrate original dependency boundaries and run portable/native witnesses.
4. Retain exact versions, failed attempts, residual gaps and verified source correspondence.

## Risks

Incomplete upstream/native admission must block dependent execution without blocking independent pure work. Namespace/guard changes require new reviewed intent; they cannot migrate pending work silently. Architecture boundary check and concrete dependency closure must be current before public source readiness.

US-903 additionally owns assessActionManifest, validateBulkOutcome, the complete result-union schemas and tests/actions-manifest-oracle.py independent consumer. Native seal/authority/recovery attestation remains executor-owned.

## Initial implementation execution

Implemented public manifest inspection/assessment and bulk result validation in `manifests.ts`, `bulk.ts`, `manifest-types.ts` and `framed-json.ts`. Reusable original tx result shapes are in `tx-results.schema.json`; manifest/inspection/bulk resources accompany them. [US-903 evidence](../../04-build/evidence/bulk-update/us903-implementation.md) records the framing/core distinction, negative controls, browser/Python verification and independent review. Native admission/authority/execution remains separate.

## Construction implementation boundary — 2026-10-15

The portable constructor uses existing plan inspection/preparation, original core Key verification and manifest inspection. It retains supplied row order and original receipt sidecars, derives inputs/frame versions/batches, and returns no native authority. This requires integrating the existing US-902 plan implementation first; current-main absence of that prerequisite must not be hidden by a substitute plan parser. CONTRACT-903 defines the exact bounded API. Truss owns native selection/order/guard/current authorization, sealing and custody; compiler output does not establish those duties.
