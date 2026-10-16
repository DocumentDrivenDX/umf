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
- prepareActionIdentities(document: Document, action: Action): PreparedActionIdentities — copies and freezes core 0.8.0 declarations once; admitInputs checks each supplied input/output and select(frameId, inputs) interprets an exact declared frame. It grants no store authority.
- prepareCoreKeyTuples(source): PreparedCoreKeyTuples — prepares one immutable core 0.8.0 source for exact Key encoding and receipt verification. Every supplied value and receipt remains checked; current-store and authorization checks stay with the executor. This prepared profile does not select core 0.9.0 codecs.
- evaluateActionRule(document: Document, action: Action, rule: ActionRule, phase: ActionRulePhase, state: ActionRuleState): boolean — compiles and evaluates against explicitly supplied pre/post state and input/output copies. It does not fetch a store, authenticate state or execute effects.
- actionFieldValueKey(reference: ActionReference): string — encodes the module/Field pair for supplied state maps.
- actionExpressionLimits — constants depth 32, nodes 512, text 65536; limits are profile bounds, not a throughput guarantee.
- actionsPackage — the exact extension registration package; it is not a general executor feature manifest.

## Portable plans and frozen manifests

These operations implement the bounded portable surfaces in CONTRACT-902/903/904. Hosts supply the original artifacts, registry and qualified selection context. Inspection and construction do not issue native authority or execute business writes.

- prepareActionPlanModel(model: ActionPlanModelPin, action: PortableActionPin, context: ActionPlanInspectionContext): ActionPlanArtifact — resolves the original model/action and produces the bounded source-bound preparation artifact with exact producer/schema identity. Unsupported action/model meaning refuses.
- inspectActionPlan(input: ActionPlanArtifact, context: ActionPlanInspectionContext): ActionPlanInspection — checks original artifact bytes, exact model/action/profile bindings and the supported invocation template, retaining diagnostics and eligibility. It does not execute the selection or action.
- assessActionPlan(inspection: ActionPlanInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext): ActionPlanAssessment — reinspects the original source and compares exact supplied capabilities and obligations. executionVerified remains false; capability claims do not authenticate native behavior.
- constructActionManifest(input: ActionManifestConstruction, context: ActionPlanInspectionContext): ConstructedActionManifest — copies explicitly supplied selected rows into a source-bound candidate and returns Key receipts. sealed, complete and authority are false; the consumer still owns frozen selection, guards, sealing and admission.
- inspectActionManifest(input: ActionPlanArtifact, context: ActionPlanInspectionContext): ActionManifestInspection — checks manifest framing, the original plan, resolved action and retained item/batch consistency. It issues no guard, snapshot, seal or revision.
- assessActionManifest(inspection: ActionManifestInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext): ActionPlanAssessment — freshly checks the original manifest and exact guard/snapshot and action capability correspondence. It does not establish native execution or authorize submission.
- validateBulkOutcome(input: ActionPlanArtifact): BulkOutcomeValidation — validates bounded original bulk-result framing and known result semantics, retaining source and diagnostics. It does not submit, retry, reconcile or disclose a job.

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
- PreparedActionIdentities
- PreparedActionPlanModel
- SelectedActionIdentity
- SelectedActionRow
<!-- generated:public-types:end -->

The exported type inventory above is checked mechanically against src/index.ts. Consult src/extensions/actions/types.ts, expression.ts, selector.ts, evaluation.ts, plan-types.ts and manifest-types.ts for exact members; CONTRACT-900 through CONTRACT-904 own their respective semantics. Entity inputs contain a selected Key and ordered literal components, not database row IDs. Committed recipe outputs are empty; changed identities and receipts are consumer metadata.

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
