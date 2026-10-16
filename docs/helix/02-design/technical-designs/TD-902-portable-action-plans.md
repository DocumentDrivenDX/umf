---
ddx:
  id: TD-902
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-902
      kind: informed_by
    - id: SD-900
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
---

# TD-902: Inspect and assess portable action plans

**User Story:** [US-902](../../01-frame/user-stories/US-902-portable-action-plans.md). **Feature:** FEAT-900. **Solution Design:** SD-900.

## Scope

One vertical journey defined by US-902; inherit the [parent solution design](../solution-designs/SD-900-declarative-actions.md) and architecture's portable/compiler/native boundaries. Shared surfaces live in CONTRACT-900, CONTRACT-901, CONTRACT-902.

## Technical Approach

Reuse original UMF core/actions identity, input, declaration and assessment semantics. Select pinned artifacts/registries explicitly. Preserve original intent and use source-qualified refusal; never make a local dialect, key codec or authority substitute. Pure copied data inspection; no execution or I/O.

## Component Changes

Planned source files: `src/extensions/actions/plans.ts; spec/extensions/actions/plan.schema.json; src/extensions/actions/index.ts`. These additions are not present implementations.

| AC | Component realization |
| --- | --- |
| US-902-AC1 | registered action through the governing contract and focused test below |
| US-902-AC2 | retain unknown through the governing contract and focused test below |
| US-902-AC3 | capability assessment through the governing contract and focused test below |
| US-902-AC4 | exact values through the governing contract and focused test below |
| US-902-AC5 | portable boundary through the governing contract and focused test below |
| US-902-AC6 | strict_json_bounds through the governing contract and focused independent witness |

## API/Interface Design

CONTRACT-900, CONTRACT-901, CONTRACT-902 define the exact shared shapes and methods. New exports follow those contracts; no signatures are independently defined here. Upstream schemas/fixtures are original owner inputs. Construct adapters only in the host registration boundary. Core cannot import native I/O/credentials; compiler cannot import Truss storage.

### Boundary realization

Portable boundary gate: `bun run typecheck` and `bun run build`; new plan/manifest modules may import existing actions/core utilities only. Add a focused forbidden-host-import control under the allocated portable test command. Export through the existing actions module and preserve existing extension package identity.

## Data Model Changes

Add reusable schemas beside the existing actions package and preserve existing package/schema identities; package resource inclusion is a build step.

## Integration Points

Existing core0.8.0 and actions0.1.0 semantic APIs; no runtime executor dependency. Unsupported/unavailable original dependencies refuse, with no fallback to fixtures or another executor.

## Security

Artifacts never load code or authenticate principals. Current protected read/execution/discovery authority remains executor-owned. Raw source/inputs stay out of diagnostics; retained manifests/outcomes require separately enforced access. Unknown relevant meaning blocks eligibility.

## Performance

Use the exact finite item/byte/node/deadline/result-capacity bounds in the contracts. Test both exact boundary and first overflow. No throughput/latency claim is made from structural tests.

## Testing

[STP-902](../../03-test/test-plans/STP-902-portable-action-plans.md) allocates each criterion once to a planned test with canonical citation. Command: `bun test tests/actions-plan.test.ts`. Current scoped portable replay evidence is retained under `docs/helix/04-build/evidence/bulk-update/`; native execution remains unqualified. Independent exact effects/refusals are the oracle, not generated output snapshots alone.

## Migration & Rollback

New profiles are opt-in; existing action/read/group behavior remains intact. Disable new admission while retaining all original manifests, terminal outcomes/tombstones and unresolved recovery custody. Do not reverse committed batches or drop native homes to simulate rollback.

## Implementation Sequence

1. Create the planned red tests in `tests/actions-plan.test.ts` with canonical citations.
2. Implement contract-owned pure/component behavior in the named source files.
3. Integrate original dependency boundaries and run portable/native witnesses.
4. Retain exact versions, failed attempts, residual gaps and verified source correspondence.

## Risks

Incomplete upstream/native admission must block dependent execution without blocking independent pure work. Namespace/guard changes require new reviewed intent; they cannot migrate pending work silently. Architecture boundary check and concrete dependency closure must be current before public source readiness.

US-902 owns Registry-preserving prepareActionPlanModel and the umf.actions.plan-model/1 schema/export. Trusted original declaration inspection is required for each arbitrary new model/action; the Rust compiler consumes only its installed original preparation. Exact producer/schema versions and full interpreted binding/obligation coverage are retained with source hashes.

## Exact browser-local branch — 2026-10-15

CONTRACT-905 defines a complete local actor/policy/invocation pairing, independently selected local bulk claims and conditional reuse of the original data carriers. The declaration analyzer recognizes only that exact bundle; preparation rejects mixed native/local intent, and assessment chooses its fixed companion table from original invocation. No unchecked override or native human substitution is introduced. Actual browser Truss storage/lowering/capability/seal/flush/recovery qualification remains required and is not provided by portable metadata support.
