---
ddx:
  id: umf.evidence.rust-migration.r8-read-plan-bind-rust-seam-design-20261028
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: evidence_for
    - id: ADR-006
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
    - id: umf.evidence.rust-migration.read-plan-bind-python-predecessor-20261028
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-target-pin-rust-candidate-20261028
      kind: informed_by
---

# Rust seam design for `ReadPlan.bind`

## Finding

The existing exact-carrier `umf_core::target_pin` matcher is not sufficient to
move `ReadPlan.bind` selection to Rust. It accepts already-materialized identity
and pin values. That erases the observable time and number of Python host
observations in `ReadPlan.bind`, and eagerly building an identity carrier could
raise at a different point. A complete bind port would also have to preserve
Python argument validation, continuation checks, parameter extraction, and
Pydantic model construction, none of which is owned by the matcher.

The frozen six-case direct Python packet records these ordering constraints:

| Case | Outcome boundary | Observed order |
|---|---|---|
| `two-variants` | Select second candidate | Both initial artifact reads; target identity; two platform observations; selected artifact read; strict parameter-model validation |
| `no-match` | `NotCompiledForTarget` | Initial artifact read; target identity; two platform observations |
| `identity-error` | Original `RuntimeError` | Initial artifact read; target identity raises |
| `artifact-error` | Original `RuntimeError` | Initial artifact reads stop at the failing second entry; identity is not observed |
| `inventory-error` | `CatalogError` | Reject before all host calls |
| `platform-error` | Original `RuntimeError` | Initial artifact; identity; first platform observation raises |

These are predecessor observations, not Rust parity evidence. The direct packet
and test remain authoritative for exact values and trace strings.

The packet remains historical: its pinned source digest is
`188e816ccad9ed609c1382ea8090471a5ed1266f412742e69b7800d32ed455ec`,
while the reviewed current `catalog.py` digest is
`00f464e929843b0fc3b711cefdcd90f29ac7d4996d3af3a3d273879811646f70`.
The initial duplicate-name fix caused an observed regression: `two-variants`
read `identity.platform` four times and `no-match` three times instead of the
packet's two. The matcher now obtains its observed platform once after the
existing length read, so it rejects duplicate names while restoring the
historical two-read order. The direct replay test asserts the packet's
unchanged six outcomes and complete traces against current Python source;
all six pass. The test verifies the packet's historical source and harness
digests without pretending they equal the revised files. A future Rust bind
route still needs its own current-source capture and callback parity.

## Candidate callback boundary

If a future slice moves bind orchestration, keep Python-owned behavior behind
callbacks and call them lazily at the corresponding point. Do not pass a fully
materialized target identity into Rust before the variant loop. A PyO3-facing
interface can use a request object plus a host callback object:

```rust
trait ReadPlanBindHost {
    type Error;
    type IdentityHandle;

    // Called once per declared variant, in order, before target identity.
    fn preflight_artifact(&mut self, variant: usize) -> Result<(), Self::Error>;
    fn target_identity(&mut self) -> Result<Self::IdentityHandle, Self::Error>;

    // Must preserve Python's individual identity-field/platform observations.
    // The callback may return the original Python exception as the PyErr.
    fn pin_matches(
        &mut self,
        identity: &Self::IdentityHandle,
        pin: &TargetPin,
    ) -> Result<bool, Self::Error>;

    // Called once after exactly one candidate is selected.
    fn selected_artifact(&mut self, variant: usize) -> Result<(), Self::Error>;
    fn build_parameters(&mut self, variant: usize) -> Result<(), Self::Error>;
}

fn select_variant<H: ReadPlanBindHost>(
    variants: &[ReadVariant],
    presence: &[String],
    host: &mut H,
) -> Result<usize, H::Error>;
```

`select_variant` would execute these steps in order: initial artifact callback
for every variant; one identity callback; presence filtering and one lazy
`pin_matches` callback for each eligible variant in declaration order, with the
callback itself preserving the source version's exact field/platform reads;
raise the existing no-unique-match error when selection cardinality is not one;
selected artifact callback; then native-parameter construction. Argument inventory,
argument validation, continuation validation, and final Pydantic construction
remain in Python in this first slice. The callback adapter must return original
Python exceptions unchanged. The target-pin callback may use the shared Rust
matcher only after it has obtained the exact identity fields and platform data
at the same observation points as the predecessor. If these observations cannot
be reproduced by a callback without changing behavior, matching itself stays in
Python and this slice is not eligible for Rust ownership.

The interface is a design boundary only. It is not implemented or exposed by
the public Python API, and the Python default route is unchanged.

## Required negative controls before implementation

An implementation must replay every case in the frozen packet against both the
direct Python predecessor and the opt-in Rust route, asserting the complete
result/error and callback trace. In addition, retain these causal controls:

1. An initial artifact callback throws: identity, matching, selected artifact,
   and parameter construction must not run.
2. Identity callback throws: no matcher or later callback may run.
3. A platform observation callback throws: preserve that exception and stop
   before later platform reads or candidates.
4. No candidate and multiple matching candidates both fail before selected
   artifact or parameter construction.
5. Selected artifact throws: strict parameter validation must not run.
6. Parameter construction throws: preserve its exception after the selected
   artifact observation.
7. Invalid argument inventory and invalid continuation fail before any host
   callback.

Compare ordered callbacks, returned variant identity, parameter model/value,
continuation, exception class, and exact exception message. A post-hoc callback
count is insufficient: the injected-throw controls must prove the causal stop
point. Only after these pass may an opt-in orchestration profile be considered;
public/default route retirement and installed-wheel qualification are separate
gates.

## Scope

This note establishes why the matcher-only seam cannot own `ReadPlan.bind` and
defines a reviewable callback design for a possible next slice. It does not
implement that slice, change Python behavior, qualify a Rust route, or claim
full bind ownership.
