# Canonical catalog-aware graph write guard — design review

Baseline: aa997a81fa44cbb9b90ada2c4f2d9e8a53e7a293. This is a read-only design review, not qualification of an implemented write guard. The proposed use of the original issued program/action kernel, complete owner binding, all selected states and one operation ledger is sound subject to the boundaries below.

## Issues to resolve before implementation

1. **Association exceptions must not bypass Field protection.** Legacy write.ts:126–135 allows changes in declared ownership association inventories and adds ownership/policy actions. Transplanting that exception into the catalog guard could allow a masked witness attribute or stored token to change without its own ordinary Field, original-read/blind and vault checks. Either validate every changed association Record under an exact corresponding per-type write profile, or refuse auxiliary Record projection changes in this single-target operation. A flat endpoint is still a Record Field, not a privilege-free graph incidence. A selected association Record can use the ordinary single-target guard. Do not describe unsupported compound changes as qualified.

2. **Bind permitted incidence changes to the actual effect scope.** Declaring an association type alone permits its whole inventory to differ under legacy host-derived-state premises. For a stronger self-contained graph comparison, each changed incidence must be bound through an owner-declared endpoint to the selected target, or every affected target needs its own check. Otherwise a grant on resource A can be mistaken for permission to alter B's ownership. If the host remains responsible for this correspondence, state the premise explicitly and do not claim the comparator proves it.

3. **Comparison needs stronger completeness than action evaluation.** catalog-runtime-candidate.ts:78–82,101–114 deliberately accepts partial unused projections and demands completeness only where selected operations/conditions need it. Comparing equal partial observations does not establish equal inventories. Require complete population and exact projection/known-absence coverage for every source admitted into write comparison: selected target, every allowed ownership source, and every affected policy dependency. Graph comparison must have both declared endpoint roles and the selected Record witness attribute projections, even with no matching rows. Require equivalent coverage and exact value-profile selections across update states; reject projection removal instead of interpreting it as unchanged data. Native truth/completeness remains an explicit host premise.

4. **Preserve Subject data, not only the selector.** CONTRACT062 requires the same current Subject/context/authority. Legacy write.ts compares the full Subject facts. Preserve normalized typed Subject facts across update states even if the selected target has Subject type or is the Subject itself. Ordinary data writes must not mutate current authorization through that overlap. A distinct qualified authority-change protocol is outside this guard.

5. **Define ordinary action-purpose compatibility explicitly.** CONTRACT062:999–1003 does not assign CRUD/ownership/policy actions the Field purpose; it preserves their original owner contracts. Do not silently require field-only for all of them, or infer a role from an action name. The compatibility table below is a proposed explicit refinement, not an already existing implementation rule.

## Proposed purpose compatibility

| Owner slot | Required source purpose and independent constraints |
|---|---|
| readProtection.readAction | Includes read; ordinary combinations allowed; exact owner binding and real grant remain required. |
| ordinary fieldActions entry | Includes field; ordinary combinations allowed; exact Field/type map and existing distinctness remain required. |
| blindWriteActions entry | Exactly field-only; exact per-Field owner map; ID distinct from read and every CRUD/ordinary Field/ownership/policy ID. Classification alone is not a blind grant. |
| create/update/delete, ownershipAction, policyAction | Nonempty subset of ordinary purposes read/field/original-authorized; exclude other/reverse/vault-write. Preserve all existing object/special/Field distinctness and actual checks. This does not designate any Weft originalAction. |
| selected stored transform vaultWriteAction | Exactly vault-write-only, taken from the exact owner-selected catalog transform; real permission in every selected state, in addition to ordinary and read/blind checks. |
| reverseAction | Reverse-only source obligation; never a substitute for any write check. No reversal execution. |

Require exhaustive source purpose closure even for the genuine catalog=null branch: the compiler permits older draft sources without purposes there. Do not inherit purpose admission merely from successful compilation. Preserve allowed ordinary read/Field overlaps. The new write profile needs its own explicit version; do not relabel the legacy read-protection subprofile as general graph/catalog support.

## State and comparison invariants

- Create uses proposed only; delete uses original only; update uses both. In the available selected state, the exact target must be present as one unique normalized inventory fact. Prefer a selector to a duplicate resource payload. If a duplicate payload is accepted, prove full typed correspondence before evaluating it or excluding the selected fact from inventory comparison.
- Update keeps the original typed Key identity; equivalent integer/decimal/binary spellings do not invent a change. Key projection must match the original tuple. Null, known absence, and missing projection remain distinct; missing selected projections refuse.
- Create/delete treat every target Field as affected, including known absence/null. No-op update retains the object-level update check, but does not invent changed Fields/vault checks. Actual normalized value changes trigger checks independently of mask output equality.
- Immutable headers include Subject identity and values, context, policy/ontology/catalog/core/owner pins, authority generation and explicit value profiles. Compare typed semantic sets where order is not meaningful; preserve ordered Key components and exact opaque IDs.
- Compare graph relationships in their own tagged namespace. Identity is relationship plus Record witness type/normalized Key or exact opaque witness ID. Preserve parallel witnesses, role labels and normalized endpoint Keys. A changed endpoint under the same witness is a change; replacing one witness with another is delete+insert, not unchanged existence. A Record witness's attribute delta must also pass the Record Field rule above.
- Extract conservative dependencies from the actual issued compact IR and original association plans across every rule/target, including false branches and exists with literal bodies. Capture Record identity Key components, flat endpoint components, graph endpoint Key components, live witness attributes, and exact association inventories. Domain-only constants are not live attribute dependencies. Shared Field definitions must retain their owning type context.
- Changes to policy-used ownership sources require both ownership and policy actions in every selected state. Non-ownership fact changes refuse; additional owner policy classifications remain allowed. Create/delete preserve existing conservative ownership/policy inventory requirements.

## Read/blind/vault evaluation

Evaluate actual ordinary actions first under each original/proposed cut. For every changed Field, require a genuinely permitted exact mapped blind action OR a genuinely permitted read action with the original kernel's effective original disposition. Original null and known absence satisfy that guard; catalog/inline transformed, withheld and conflict do not. Never compare the proposed value to the mask. A real permitted OR branch may satisfy the Field guard despite uncertainty in the other branch; malformed source/profile always refuses. Preserve atomic disposition capture and do not reuse partial dispositions from a conflict row.

For stored-transformed Fields, check the actual canonical output-domain value, not the transform's pre-storage inputDomain. A well-typed opaque token/ciphertext plus ordinary/read-or-blind permission still needs the exact selected transform's vaultWriteAction grant in every state. Missing action, wrong transform/version, another transform's action, read/original/reverse grants, or a same-name foreign pin cannot substitute. This semantic admission does not claim a token came from a vault or that crypto occurred.

## Operation budget and lifetime

One private operation owns immutable captured inputs and the exact issued program. Validate each original maxSteps as a safe integer before taking the minimum. Comparison, Key normalization, full source traversals, action preflight and every state/action call charge one cumulative step/literal/text ledger; no reset after comparison, between states, on a retry branch, or per Field. Charge normalization before large expansion and repeated traversal before it occurs. Reuse private captured packets rather than taking an unmetered full snapshot for each call. A reusable internal entry must not accept a caller-provided resettable counter as proof of an operation budget. No total preallocation/CPU/heap claim follows from these selected bounds.

## Independent controls required next

1. All-state read/blind truth table, including original permit with unknown blind, blind permit with unknown read, neither permit, and actual forbid/require/conflict compositions.
2. Catalog masked/withheld values with proposed value equal to and different from the mask, original null, original absence, all create/update/delete states, and no-op normalized equivalent values.
3. Exact stored token output-domain positive with all grants; independently remove each ordinary/read-or-blind/vault grant in either state; wrong transform/action/purpose/pin and canonical downgrade refusals.
4. Detached target versus inventory, changed Key, duplicate normalized Key, changed Subject projection, changed context/value profile/coverage, and unrequested extra fact/graph mutations.
5. Flat association endpoints, graph Record/opaque witnesses, parallel edges, endpoint relabel/reversal, missing role/attribute coverage, same opaque ID under distinct relationships, and masked/stored auxiliary attribute changes.
6. Dependency in a false branch or empty exists; omitted policy classification; ownership versus policy-used inventory changes; target/source namespace collisions.
7. One combined operation that fits each action or state alone but exceeds the shared ledger; targeted resets after comparison and between states/actions must cause exact oracle failures.
8. Actual independently authored Bun and Chromium expected decisions, whole-input immutability, atomic failure, source mutation controls and original conditional proof premises. No native effects/credential claims.

S24/S25 can be evaluated against their unchanged full contract/browser assertions once this actual source-closed logical guard and independent controls exist. Neither declaration checks nor this design review qualify them. Native protected effects, authority issuance and the remaining backend/lifecycle cases stay separate and required.
