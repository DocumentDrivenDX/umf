# Public action API reference

Import from the repository public entry point, src/index.ts, or from the built browser ESM dist/umf.js. The package is private and not available through npm installation. Create the normal SDK registry with createUmfRegistry(); action support is included. All declaration operations receive that registry explicitly; they do not replace other installed vocabularies. A bare new Registry() remains available for consumers that deliberately choose their interpreted vocabularies.

## Declaration operations

- createUmfRegistry(): Registry — creates a fresh SDK registry with the bundled action vocabulary and semantic validator. It installs no executor, credentials or business roles.
- registerActions(registry: Registry): Registry — installs the exact package and semantic callback. Duplicate-version registration refuses; no dynamic loading or authorization is performed.
- declareAction(source: Document, module: string, action: Action, registry: Registry): Document — adds a fresh action ID to an existing module, validates the whole document and returns a JSON-safe isolated copy. Unknown opaque rule text can be retained; known errors refuse.
- inspectActions(source: Document, registry: Registry): ActionInspection — returns copied source, validation and ordered actions with their module, path and obligation inventory. Structural errors throw UmfError; semantically invalid admitted declarations remain inspectable with diagnostics. It evaluates no business state.
- editAction(source: Document, identity: ActionIdentity, replacement: Action, registry: Registry): Document — replaces the same stable action ID atomically. Relevant unchecked old/new/model meaning blocks edits. It leaves the supplied source unchanged on success or failure.
- assessAction(source: Document, identity: ActionIdentity, profile: ActionExecutorProfile, registry: Registry): ActionAssessment — compares exact source/identity and obligation claims. Missing claims are unknown. Supported claims require evidence locator strings, but the library never fetches or authenticates them. executionVerified is always false.

Obligation IDs are absolute JSON Pointers, including selected attachment/model paths. Dependency entries deduplicate by exact pointer. Arrays retain authored order. Unknown relevant members cannot be overridden into compatibility. Unrelated unknown extension content is preserved without automatically blocking assessment.

## Explicit interpretation operations

These are separate from inspection. Narrow rule/selector helpers do not prove an entire declaration eligible for native execution.

- compileActionRule(document: Document, action: Action, rule: ActionRule, phase: ActionRulePhase): CompiledActionRule — checks exact rules/1 syntax, every branch, types, phase, dependency coverage and limits without evaluating stored state.
- compileActionSelector(document: Document, action: Action, frame: ActionFrame): CompiledActionSelector — checks keys/1 input-based selector syntax and exact Key/Field identities. No scans, joins or database lookup.
- admitActionInputs(document: Document, action: Action, inputs: ActionInputs, outputs = false): ActionInputs — validates and copies typed input values or outputs under the declared model, preserving omission versus null.
- selectActionIdentity(document: Document, action: Action, frame: ActionFrame, inputs: ActionInputs): SelectedActionIdentity — returns the selected entity Key tuple and tupleHex. Native canonical alias resolution is still consumer-owned.
- evaluateActionRule(document: Document, action: Action, rule: ActionRule, phase: ActionRulePhase, state: ActionRuleState): boolean — compiles and evaluates against explicitly supplied pre/post state and input/output copies. It does not fetch a store, authenticate state or execute effects.
- actionFieldValueKey(reference: ActionReference): string — encodes the module/Field pair for supplied state maps.
- actionExpressionLimits — constants depth 32, nodes 512, text 65536; limits are profile bounds, not a throughput guarantee.
- actionsPackage — the exact extension registration package; it is not a general executor feature manifest.

## Portable plans and frozen manifests

These operations inspect supplied artifacts and construct inert bytes. They do not install an executor, authenticate a selection cut, issue a read grant or authorize business writes. Current-main API contracts and the separately pinned browser-local demonstration are different source cohorts.

- prepareActionPlanModel(model: ActionPlanModelPin, action: PortableActionPin, context: ActionPlanInspectionContext): ActionPlanArtifact — returns the exact preparation artifact for the admitted explicit-Key constant-set subset, bound to original supplied model/action source, schema and this producer build. It does not register the action with a store.
- inspectActionPlan(input: ActionPlanArtifact, context: ActionPlanInspectionContext): ActionPlanInspection — checks artifact integrity, original model/action binding, input constants and the caller-installed selection interpreter. It retains source and diagnostics; eligibility is portable interpretation, not executed selection or current authorization.
- assessActionPlan(inspection: ActionPlanInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext): ActionPlanAssessment — freshly reinspects the original plan and checks exact companion capability claims. Unknown or unsupported obligations block compatibility. Evidence locators are not fetched or authenticated; executionVerified remains false.
- constructActionManifest(input: ActionManifestConstruction, context: ActionPlanInspectionContext): ConstructedActionManifest — constructs invocation and batch bytes from the exact plan, supplied ordered rows, guards and original core Key receipts. The result explicitly has sealed:false, complete:false and authority:false. It does not select rows, issue guards, seal work or execute changes.
- inspectActionManifest(input: ActionPlanArtifact, context: ActionPlanInspectionContext): ActionManifestInspection — checks the retained plan, action source, complete typed inputs, identity/version correspondence and exact batch partition. It does not establish native seal custody or the authenticity of a store-issued cut.
- assessActionManifest(inspection: ActionManifestInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext): ActionPlanAssessment — freshly inspects the manifest and assesses its original plan against companion capabilities. Compatibility does not verify stored execution, a current principal or replay authority.
- validateBulkOutcome(input: ActionPlanArtifact): BulkOutcomeValidation — checks artifact integrity and the known bulk result union, including embedded manifest artifacts and ordered item verification carriers. Structural validity does not establish original control custody, a business commit, rollback or permission to redispatch.

[CONTRACT-902](../../../02-design/contracts/CONTRACT-902-portable-action-plan.md), [CONTRACT-903](../../../02-design/contracts/CONTRACT-903-frozen-action-manifest.md) and [CONTRACT-904](../../../02-design/contracts/CONTRACT-904-bulk-action-coordination.md) own these proposed versioned companion profiles. Exact types live in plan-types.ts, manifest-types.ts, manifest-construction.ts and bulk.ts alongside the public exports. Capability assessment and source inspection remain separate from an executor's current authority and durable outcomes.

## Public types

<!-- generated:public-types:start -->
- Action
- ActionAssessment
- ActionAssignment
- ActionAuthorization
- ActionBinding
- ActionBusinessState
- ActionCondition
- ActionEffect
- ActionEntityBinding
- ActionEntityInput
- ActionExecutorProfile
- ActionExpression
- ActionExpressionType
- ActionFrame
- ActionFrameState
- ActionIdentity
- ActionInputs
- ActionInspection
- ActionKeyReference
- ActionManifest
- ActionManifestConstruction
- ActionManifestInspection
- ActionObligation
- ActionObligationKind
- ActionParameter
- ActionPlanArtifact
- ActionPlanAssessment
- ActionPlanCapabilities
- ActionPlanCapability
- ActionPlanDiagnostic
- ActionPlanInspection
- ActionPlanInspectionContext
- ActionPlanModelPin
- ActionPlanSelectionInspector
- ActionReference
- ActionRelationshipReference
- ActionRule
- ActionRulePhase
- ActionRuleReference
- ActionRuleState
- ActionValueBinding
- BulkOutcomeValidation
- CompiledActionRule
- CompiledActionSelector
- ConstructedActionManifest
- InspectedAction
- PortableActionPin
- PortableActionPlan
- PreparedActionPlanModel
- SelectedActionIdentity
- SelectedActionRow
<!-- generated:public-types:end -->

The exported type inventory above is checked mechanically against src/index.ts. Consult src/extensions/actions/types.ts, expression.ts, selector.ts and evaluation.ts for exact members; CONTRACT-900/901 own their semantics. Entity inputs contain a selected Key and ordered literal components, not database row IDs. Committed recipe outputs are empty; changed identities and receipts are consumer metadata.

## Errors and diagnostics

UmfError aborts malformed public inputs or refused mutations; supplied sources remain unchanged. Known semantic diagnostics are errors. Unchecked meaning warns and sets interpretation completeness false. Diagnostic identity is code/path/severity; message text is explanatory.

- ACTION_STRUCTURE: malformed known declaration/profile shape.
- ACTION_IDENTITY: duplicate IDs or conflicting edit identity.
- ACTION_REFERENCE: missing or wrong-kind model target.
- ACTION_EFFECT: invalid effect membership, ordering or permission.
- ACTION_UNCHECKED: unknown or unsupported relevant meaning.
- ACTION_PROFILE: mismatched snapshot/version or malformed claims.
- ACTION_CAPABILITY: unsupported or missing capability claim.
- LIMIT: a core/action bound exceeded; no partial output.

Existing core and Registry diagnostics propagate. Each action is bounded to 128 parameters, 128 combined pre/postconditions, 128 frames per list, 128 outputs, 128 failures, 256 effects, 256 assignments per effect and 64 roles. Rule text is limited to 65536 UTF-16 code units. Core document and value bounds also apply.

## Consumer operations are not portable exports

invoke, lookup, preview and readAtLeast belong to the separate trusted consumer. They are logical methods, not specified HTTP endpoints. Lookup never executes. Preview persists no business or terminal state. A committed result includes verified effects or handler checks, exact net changes, opaque version and receipt; runtime observations are not equivalent to declaration validation.

[Start with execution](execution.md) for trusted setup. [Check support](support-and-evidence.md) before applying a model to a native store.
