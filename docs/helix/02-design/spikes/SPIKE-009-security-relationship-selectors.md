---
ddx:
  id: SPIKE-009
  type: spike
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: TD-056
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
    - id: US-056
      kind: informed_by
---

# SPIKE-009: Relationship-backed security association selectors

## Requirement and decision boundary

US-056-AC2/AC4 require the same logical security constraints over graph data as
US-056-AC1/AC3 require over ordinary tables. Current ontology 0.1 endpoints refer
to association Record member fields. A core Relationship can carry endpoints
without corresponding Record members, and can have no association Record at all.
The original compiler refusal retained in TD-056 demonstrates this admission gap.
The current ontology/policy versions remain unchanged.

A future version must distinguish member-field associations from qualified core
Relationship associations. The draft schema in
`security/relationship-selector.schema.json` exercises only the latter selection
form; it is not a complete ontology or a published version. The final version,
public APIs and migration/rollback operations remain unresolved.

## Draft relationship selection

A selector names the exact qualified Relationship and two role declarations.
Relationship references use relationshipId and remain distinct from Record
references using elementId; equal textual IDs cannot conflate the two domains.
Each role binds one directed source/target side to an explicit qualified Record
and stable Key. The source Role cannot be substituted for the target Role.
The selected Key must match any original authored endpoint Key and the eventual
ontology entity identity. The initial draft admits only directed, singular-type
endpoints. Undirected and multi-type endpoints require explicit future semantics;
they cannot be flattened into this subset.

For a Relationship with an association Record, witness identity is its original
selected Record Key; the Record and Key must correspond to original
associationRecord metadata. Original members retain their attributes and security
classifications. Key metadata such as primary=true remains preserved; compiler
admission must qualify its meaning rather than stripping it. The draft refuses
opaque identity as a replacement for that Record identity.

For a bare Relationship, an opaque existential witness is bound to exactly one
qualified Relationship and evaluation cut. It supports correlated endpoint access
and existential selection. It is not an entity identity, field-bearing Record,
cross-occurrence equality token, count/distinct key or disclosed native edge ID.
Such terms must refuse in the future type system. Native witness issuance,
completeness, uniqueness and cut custody remain physical admission obligations;
a selector cannot authenticate them. The existential witness variable still
correlates both endpoints in a single predicate occurrence.

The normalized logical model must preserve the existing member-field form for
junction tables. Both forms provide role-qualified endpoint identities on the
same association witness. A native graph locator is not a logical business Key;
full original tuple/namespace correspondence remains mandatory. No rule may
silently change the selected endpoint Key during normalization.

## Executed analysis and remaining work

`tools/security/relationship-selector-spike.ts` resolves the retained original
native graph model using the draft schema. Two positive cases cover the original
Record-backed WorksOn and bare BareWorksOn Relationship. Twelve refusals exercise
foreign/missing relationship identity, duplicate roles/sides, wrong endpoint
Record/Key, wrong association Record/Key, opaque replacement, unknown selector
content, invented endpoint fields and invented bare Record identity. This is
source selection analysis, not runtime ontology interpretation or enforcement.

The next implementation must define the public versioned reference/association
unions; type-check endpoint/identity/attribute terms; preserve unknown content
through serialization; define explicit migration/refusal; normalize both forms;
and update dependency derivation, evaluator, compiler IR and physical consumers.
The Record Key primary-metadata admission gap is separate. Required tests include
alternate entity Key mismatch, unknown/missing attributes, correlated bare-edge
selection, illegal witness operations, source mutation, undirected/multi-type
refusal, current source/cut admission and real backend reads. Bun/browser parity,
conditional formal refinement and native oracle execution remain required before
public support or backend acceptance can be claimed.

## Evidence qualification

The draft selector receipt records exact source digests and fourteen matching
observations. A strict TypeScript failure was corrected by specifying the Ajv
validation type parameter. The evidence gate previously checked component source
freshness without checking command outcomes; it now separately requires a passed
receipt, unchanged sources and zero non-timeout command outcomes. Running that
gate against the retained failed component receipt demonstrated refusal before
successful replay. These controls do not close any backend case.

Astra independently verified fourteen controls and 769 current source pins,
finding no actionable defect in the draft subset. Its public-integration
recommendations on distinct reference domains, opaque-witness restrictions and
Record-backed preservation are captured above. After component completion, fresh
phase validation passes all 115 checks; all forty component groups pass. Public
ontology interpretation and backend qualification remain unfinished.

## Portable draft normalizer

Latest reviewed checkpoint: the plans also retain complete selected
`sourceRelationship` and Record-backed `witness.sourceRecord` snapshots, deeply
frozen and isolated from caller mutation. These are selected-source archives,
not a complete pinned Document or semantic closure. Retaining unknown metadata
does not establish that it is irrelevant: future admission must resolve field
definitions, security classifications, extensions and all meaning that can affect
enforcement, or refuse the unsupported meaning.

Seven Bun tests pass 43 assertions. Additional controls refuse undirected and
plural-endpoint relationships, duplicate selected Relationships and Keys, unknown
Key qualifiers and nonboolean primary flags without mutating the original input.
Fourteen selector controls, 21 Chromium checks, 42 component groups and 116 phase
checks pass at this checkpoint. Astra independently confirmed archive isolation,
deep freezing and current evidence pins, with no actionable defect in this scope.
Public ontology admission, compiler refinement and ordinary native enforcement
remain unfinished; no backend acceptance case is promoted.

The private `src/extensions/security/relationship-candidate.ts` component now
snapshots selector, model and selected entity identities through the bounded JSON
copy routine. It resolves the selected Relationship, directed sides, original
association Record and ordered Keys, then produces a deeply frozen plan. Endpoint
Key IDs must equal the independently supplied entity identity selections even
when an alternate Key exists with the same field shape. Original primary flags
and Record member references remain in the output; no member field is invented
to represent a native endpoint. This does not validate the complete source
Document, scalar/facet semantics or authority; those remain caller obligations.

Issued plans expose draft witness-kind capabilities. Bare plans allow only
endpoint access and existence; identity, attributes, count, distinct and
disclosure refuse. Record-backed plans expose identity and attribute capability,
without granting authorization or validating a particular attribute expression.
Count/distinct/disclosure remain unsupported for both forms. Copied plans refuse;
issuance distinguishes this constructor's result and is not an authority proof.

The fourteen source-selection controls now invoke the portable component.
Five Bun tests pass 26 assertions, including original Key/attribute preservation,
caller mutation isolation, copied-plan refusal, a declared alternate Key with the
same field shape, duplicate entity identity and accessor non-execution. Chromium
153 independently executes the component: sixteen controls compare both plans to
retained source-selected output, check bare capabilities and test copied plans,
entity Key disagreement and accessors. The component is not exported as a public
ontology API; full policy typing, original compiler integration and native
enforcement remain unfinished. Astra reproduced a direct-call schema/component mismatch: endpoint and witness Key IDs over 4096 characters admitted in the first normalizer. All selected text now uses a bounded Unicode code-point count matching JSON Schema maxLength. Bun and Chromium exercise 4096 acceptance and 4097 refusal for supplementary Unicode Key IDs. Astra independently confirmed schema/normalizer agreement for ASCII and supplementary Unicode endpoint/witness Keys (4096 accepted, 4097 refused), the declared alternate-Key control, fourteen selector controls, sixteen Chromium checks and forty-two component groups with current pins. No remaining actionable finding was identified in this private scope. Final phase validation passes all 116 checks.

## Selected-term correspondence increment

The private `resolveCandidateRelationshipTerm` resolves an endpoint role to the
selected entity identity and original Key, a Record-backed identity to its
selected Record/Key, and an attribute to an exact qualified association member.
It rejects missing roles, foreign-document and wrong-owner fields, unknown term
qualifiers, copied plans and accessor inputs without invoking getters. Bare
witnesses still refuse identity and attributes. Outputs are deeply frozen and
caller-isolated. This establishes selected-term correspondence only; field
definitions, domains, classifications, dependency closure, source-cut custody
and authorization remain separate admission obligations.

Eight Bun tests pass 57 assertions and 42 component groups pass. Existing 21
Chromium controls were refreshed against the changed component but do not yet
exercise the new selected-term entrypoint; that browser coverage remains open.
No public ontology version, compiler refinement or backend case is promoted.

The selected-term entrypoint now has real Chromium coverage: 33 total controls
include exact endpoint, Record identity and qualified attribute results, freeze
and caller-isolation behavior, seven malformed/unsupported term refusals and
accessor non-execution. The evidence gate requires these exact observations and
source pins. Astra found no correctness defect in correspondence scope but
identified missing endpoint provenance as an integration limitation. Endpoint
results now retain qualified Relationship, role and side alongside target Key;
a self-relationship regression confirms equal target identities retain distinct
source/target descriptors. Runtime witness occurrence remains a separate binding
obligation. Nine Bun tests pass 63 assertions, all 42 component groups pass and
all 116 phase checks pass. No backend case is promoted.

## Compiler-facing term contract

The private resolver now returns a discriminated typed union rather than
`unknown`: entity identity, Record identity or Record attribute. Every variant
retains its selected qualified Relationship; endpoint identities additionally
retain exact role and source/target side. Original Key metadata remains opaque
to this correspondence layer. Consumers must establish interpreted ordered Key
domains separately rather than casting archived metadata into executable SQL.
The refreshed 33 Chromium controls require provenance for all three variants;
42 component groups, including strict TypeScript, and 116 phase checks pass.

The next public ontology revision must distinguish association selection from
entity identity. An existential association selector is a tagged union of a
Record reference with member-backed endpoint mappings and a qualified core
Relationship reference with side-backed endpoints. A graph association Record
provides optional identity/attributes of that witness, not an alternative
association reference. Bare Relationships have no stable Record identity.
Migration of 0.1.0 Record associations must preserve their original Record refs,
ordered endpoint member mappings and Keys; it must never infer a Relationship
from matching labels or fields. Policy `exists` bindings and dependency derivation
must carry the selected association plus a fresh lexical witness occurrence.
Selected-term provenance alone does not distinguish two occurrences of the same
Relationship. Compiler and runtime consumers must retain that occurrence through
correlated endpoint and attribute lowering. A versioned public schema, migration
implementation, full classification/domain admission and original compiler
changes remain required before this draft becomes a supported profile.

## Shared association grammar increment

`security/association-selector.schema.json` now supplies a draft structural union
of `record-members` and `core-relationship`. The first preserves the original
Record reference, selected Key and ordered endpoint member references; the
second retains the qualified Relationship reference and side-backed endpoints
from the existing draft grammar. Unknown qualifiers and mixed endpoint/ref
representations refuse. Neither branch infers a graph Relationship from a Record
ID, even when the ID text is equal. Two Bun tests pass 16 assertions using the
existing Staff/Project ontology's original associations and graph selector
controls. The component runner pins both draft schemas and passes 43 command
groups; 116 phase checks pass. This is structural evidence only: duplicate roles
are intentionally accepted by the schema and must be rejected by source semantic
admission. Public versioning, Record normalization, classification/domain typing,
compiler/runtime adoption and browser grammar coverage remain open.

## Member-backed source resolution increment

The private `association-candidate.ts` resolver selects the original junction
Record and Key, requires each endpoint target's independently selected entity
Key, verifies ordered mapping arity and exact qualified association member
ownership, and refuses duplicate roles, missing Keys and wrong-owner or
foreign-document member references. It preserves selected original Keys and the
complete association Record in frozen, caller-isolated output. No synthetic graph
endpoint field or Relationship is created. Three Bun tests pass 25 assertions
using original ontology associations. All 43 component groups, including strict
project type checking, and 116 phase checks pass.

Astra's preceding shared-grammar review found no actionable defect and confirmed
Record/Relationship ref separation. This new source resolver has not yet received
that independent review or real-browser coverage. Its correspondence checks do
not resolve referenced Field definitions, prove equality-domain equivalence,
classify members or establish source revision/cut custody; those remain mandatory
semantic admission obligations. Public ontology migration, compiler adoption and
backend acceptance remain open.

The member-backed resolver now has eight real Chromium controls with exact
source-plan correspondence, five source-mapping refusals, frozen caller-isolated
output and accessor non-execution. A new evidence gate requires those observations
and current source pins. Astra reproduced a schema/component bound mismatch:
a matching 257-field endpoint mapping admitted despite the schema's 256 ceiling.
The resolver now explicitly bounds mapping cardinality before arity comparison;
Bun checks both 256 acceptance and 257 refusal. Four tests pass 29 assertions.
Browser boundary coverage remains to be added; the existing browser controls
verify the corrected source but do not exercise that cardinality boundary.
Strict harness typing failures were corrected before successful replay. All 44
component groups and 117 phase checks pass. No semantic/domain, compiler or
backend qualification is inferred.

Chromium now executes both exact mapping boundaries: 256 components accept and
257 refuse. The member-backed browser receipt has ten required observations,
with current source pins; all 44 component groups and 117 phase checks pass.
The browser-cardinality coverage obligation from the preceding checkpoint is
closed. Domain admission remains open. The existing core Key tuple codec validates
current-core documents and relevant equality qualifiers, but it takes actual
values and proves encoding of one selected Key; it cannot alone prove endpoint
field/target-Key domain compatibility or security classification completeness.
The shared admission layer must resolve both ordered field definitions and their
interpreted equality domains before compiler lowering, while retaining source
metadata and refusing unresolved qualifiers.

## Selected equality-descriptor correspondence

`requireCandidateEndpointDomainCorrespondence` resolves ordered endpoint and
target-Key Field definitions from a private issuance snapshot, requires exact
required-singleton scalar/facet/allowed-value descriptor equality, and refuses
missing fields, unsupported scalar forms, unknown qualifiers and nonempty field
extensions. Copied plans refuse; later caller mutation cannot change the snapshot.
Five Bun tests pass 36 assertions. Existing ten Chromium source checks were
refreshed, but do not yet exercise this new operation; independent Astra review
is pending. All 44 component groups and 117 phase checks pass.

This is descriptor correspondence, not proof that those descriptors have valid
core semantics: full core validation remains mandatory, including facet value
validity and interpreted extension closure. Exact descriptor equality alone must
never qualify execution. Classification completeness, original compiler adoption,
source authority/cut and backend enforcement remain open.

The member-backed Chromium receipt now has 17 required observations, including
exact descriptor correspondence, scalar/missing-field/unknown-facet/extension
refusals, copied-plan refusal and issuance-snapshot isolation. Browser coverage
for the descriptor operation is now executed; core semantic validity remains a
separate obligation.

`requireCandidateAssociationClassifications` additionally requires exact explicit
coverage of every member in the selected association and endpoint Records.
Missing/duplicate declarations, wrong-owner refs and unknown protection/query-use
values refuse; the copied declaration archive is deeply frozen. Known query-use
values remain declarations, not execution permissions. Six Bun tests pass 45
assertions; 44 component groups and 117 phase checks pass. Classification browser
coverage and independent review remain open. Full core validity, domain typing of
non-endpoint attributes, public grammar migration, compiler adoption and backend
enforcement are still required before admission.

Classification coverage now runs in real Chromium: the member-backed receipt
has 24 required observations, including exact retained declarations, deep
freezing and missing-Record/missing-member/duplicate-member/unknown-protection/
unknown-query-use refusals. Source, descriptor and classification results remain
separate observations; the gate checks exact result coverage and current pins.
All 44 component groups and 117 phase checks pass. Astra independently confirmed
the descriptor operation's five scalar families, canonical property ordering,
snapshot isolation and mismatch refusal, finding no actionable defect within
correspondence scope. Its classifier review is pending. Public admission must
still compose full core validity and extension interpretation with these checks;
none is an execution permit or proof of backend enforcement.

## Composed core and association checks

The private `association-checks.ts` captures the complete selector/source/entity/
classification packet before calling the real core validator. Both valid and
complete core inspection are required before selected source correspondence,
endpoint descriptor matching and classification coverage run against captured
content. Matching invalid length facets now refuse rather than passing on equal
descriptors. Valid original `primary: true` Key metadata is retained. Seven Bun
tests pass 50 assertions; 44 component groups and 117 phase checks pass. Component
source pins now include all `src` and `spec` dependencies to cover the real core
validator and referenced schemas.

Astra found no classification coverage defect and independently exercised valid
query-use retention, duplicate/foreign declarations, copied plans, snapshot
isolation and accessor non-execution. The composed entrypoint's independent
review and real-browser coverage remain pending. Requiring complete core validity
is conservative across the captured Document; no unresolved unrelated extension
is silently treated as irrelevant. This increment is not full public ontology
admission: non-endpoint policy operand typing, revision authority/cut custody,
compiler adoption and native enforcement remain open.

The composed entrypoint now executes in real Chromium. The member-backed browser
receipt has 29 required observations: valid core composition and primary-Key
retention pass, matching invalid facets and unresolved extension content refuse.
The browser harness pins all `src` and `spec` dependencies used by its core
validator bundle, alongside the authored fixture and harness. All 44 component
groups and 117 phase checks pass. This closes real-browser coverage for the
current composed relational checks. Independent composed review is pending;
graph composition, full policy typing/public ontology migration and original
compiler/runtime integration remain unfinished. Backend acceptance remains
26/132, with no accepted Truss case.

## Graph composed checks and original qualifier refusal

The private graph composition now runs core validity, side-backed Relationship
resolution and shared exact Record classification coverage against one captured
packet. Record-backed witnesses require association classification; opaque
witnesses require only the selected endpoint Record classifications. No member
field is invented for an endpoint. Eight Bun tests pass 56 assertions, including
an independently authored complete-core graph positive and missing-classification
refusal. Graph composed browser coverage and independent review remain pending.

The original reversible graph source is still refused at complete-core admission:
`UNKNOWN_RELATIONSHIP_QUALIFIER` at
`/modules/0/relationships/1/associationRecord/key`. Its association Key qualifier
is preserved and checked by source selection but has no complete core
interpretation yet. The regression retains this original-source refusal without
changing its content. Supporting the authored positive does not establish
original compiler/native graph adoption. Resolving this qualifier's governed
meaning is the next admission obligation.

A changed Truss canonical-wire source invalidated retained native foundation
pins. The reviewed owned fixture reran all 59 native observations successfully;
selector/compiler source receipts and dependent Chromium controls were refreshed.
Final replay passes 44 component groups and 117 phase checks. Component pins
include the exact two retained receipts read by the original graph regression.
Astra's preceding relational-composition review found no actionable defect and
confirmed current browser/component closures. No backend case is promoted; full
acceptance remains 26/132.

Astra found a document-identity omission in the shared classification coverage
utility: a foreign scoped Record could match local module/element IDs and retain
local classifications. Scoped references now must match the captured Document ID
before any Record lookup. The exact otherwise-valid foreign-scope control
refuses in Bun and Chromium; the corresponding local scope accepts. Nine Bun
tests pass 58 assertions, 30 Chromium controls pass, and replay passes 44
component groups and 117 phase checks. This fixes the utility directly; no
composed-wrapper bypass was demonstrated.

CONTRACT-041 defines core associationRecord as `{module,element}` referring to a
separately keyed Record; it does not define a `key` member on that reference.
Therefore accepting the native source qualifier requires an explicit governed
interpretation, rather than merely adding it to a validator allow-list. The
private witness selector already supplies a stable Key choice. Original-source
qualifier admission remains open until the source qualifier's compatibility with
that choice and its version/profile meaning is specified and verified.

## Explicit draft association-Key agreement interpretation

A caller-selected private `association-record-key-agreement/0.1` interpretation
now defines the retained source `associationRecord.key` as an assertion of the
same stable Record Key selected by the witness selector. It does not assert
that core CONTRACT-041 or the original producer already interprets this member.
Default composed checks still refuse the original qualifier. With this explicit
profile, valid core inspection may have exactly one unresolved diagnostic: the
selected Relationship's precise associationRecord/key path. The selected witness
must be Record-backed and its original Key ID must equal the retained assertion.
The result records profile, qualified source path and Key ID; source content is
not changed. Unrelated qualifiers, wrong Keys, an unselected Relationship's
qualifier and malformed profile objects refuse. The profile is not a generic
warning suppression mechanism or execution permit.

Ten Bun tests pass 63 assertions, including the original reversible source under
explicit interpretation and default refusal. Existing 30 relational Chromium
controls were refreshed; they do not yet exercise graph composition or this
interpretation. All 44 component groups and 117 phase checks pass. Independent
review is pending. Public versioned interpretation, complete policy/attribute
typing, authenticated interpretation selection, compiler/native refinement and
backend acceptance remain unfinished.

Real Chromium now executes graph composition over the exact retained reversible
original source. The receipt has 37 required observations, including explicit
Key-agreement profile/path/Key retention and complete selected Relationship
preservation. Default admission, unrelated warnings, wrong witness Keys, bare
selection with the unselected association qualifier and malformed interpretation
objects refuse. The harness pins both original graph input receipts alongside
its source/core dependency closure. All 44 component groups and 117 phase checks
pass. This establishes browser behavior for the draft interpretation only;
authenticated profile selection, public ontology/compiler integration and native
enforcement remain unqualified.

## Shared checked entrypoint

`resolveCandidateAssociationChecks` now captures and dispatches both tagged
source forms, returning a typed Record/Relationship checked-result union. Unknown
forms and graph-specific interpretations supplied to the Record branch refuse.
The wrapper captures inputs before branch access, so accessor selectors do not
execute. Eleven Bun tests pass 69 assertions; the shared browser receipt now
requires 42 observations, including both checked kinds, wrong-branch/unknown-kind
refusals and zero-call accessor refusal. Its scope wording explicitly includes
shared graph/relational composition and the draft interpretation.

Astra independently replayed 21 Key-agreement controls, finding no actionable
warning-laundering or source-mismatch defect, and confirmed the document-identity
fix. A pinned Truss layout contract changed during replay; the original owned
native fixture was rerun successfully (59 observations). Dependent selector and
compiler receipts were regenerated before stable component replay, then all
three dependent browser harnesses refreshed. Final results are 44 successful
component groups and 117 passing phase checks. Public ontology migration, policy
normalization/type checking, original compiler/runtime adoption and authenticated
source/interpretation authority remain open; backend acceptance stays 26/132.

## Lexical witness custody increment

Private checked results now have constructor issuance guards. The new
`association-witness.ts` binds an issued checked association in an issued lexical
scope and returns a fresh occurrence object with a child scope. A name already
bound in the parent chain refuses; sibling occurrences with the same name and
checked source remain distinct. Each selected endpoint, Record identity or
attribute retains the exact occurrence reference. Graph terms delegate to the
selected Relationship term resolver; member-backed terms preserve original
endpoint member mappings and exact association member references. Copied scopes,
checked results and witness objects refuse.

One Bun test passes nine assertions for correlation, distinct sibling occurrences,
shadowing/copy refusal and wrong-owner attribute refusal. All 44 component groups
and 117 phase checks pass. Existing 42 shared Chromium checks were refreshed but
do not yet execute the lexical binder. Independent review is pending. Active
policy-AST scope checking, scalar operand typing, serialization/refinement to
compiler IR and enforcement of correlation during lowering remain mandatory.
These objects are normalization custody, not authenticated runtime witnesses or
execution permission; no backend acceptance case is promoted.

Lexical custody now runs in Chromium through one module instance containing both
check constructors and the binder. Raw/graph endpoint and attribute terms retain
their exact witness, siblings remain distinct, and copied/shadowed/wrong-owner
operations refuse. Astra independently replayed thirteen controls and found no
actionable custody defect; its active-scope qualification prompted a new scoped
term entrypoint. `resolveCandidateAssociationScopeTerm` looks up the name in the
issued active scope rather than accepting a witness from another branch. Root
unbound lookup refuses; sibling scope names resolve to their own occurrences.
Zero-call accessor refusal is retained in Bun and Chromium. The witness test now
has fifteen assertions and the shared browser receipt requires 54 observations.
All 44 component groups and 117 phase checks pass. Integration of these primitives
into actual policy-AST typing, operand domains and compiler serialization/lowering
remains open; runtime witness authenticity and enforcement are not established.

## Expression scope normalization increment

The private `association-expression.ts` now walks bounded literal/equality/
Boolean/existential expressions against issued checked associations and active
lexical scopes. Record association references and Relationship references use
distinct identity domains. Existential occurrences are fresh; each variable term
retains its exact occurrence. The original nested Staff/Project expression's
inner project/active terms bind to the inner assignment occurrence while its
outer project term binds to the outer ownership occurrence. Unbound/shadowed
variables, foreign associations, wrong-owner fields and copied checks refuse.

Non-variable operands are explicitly retained as unresolved-term archives with
path/reason residuals. The original expression has three such residuals for
resource, subject and constant typing. Empty residuals do not establish complete
policy typing: scalar equality compatibility and authorization remain unproved.
Two Bun tests pass ten assertions; all 44 component groups and 117 phase checks
pass. Existing 54 browser controls are refreshed but do not yet execute expression
normalization. Independent review, expression browser coverage, operand typing,
compiler serialization/refinement and runtime enforcement remain open.

Expression normalization now executes in Chromium over the original nested
Staff/Project fixture. Correlated inner/outer occurrences, three explicit typing
residuals, frozen output and unbound/shadowed/wrong-owner/foreign-association/copy
refusals are retained. Astra reproduced three defects: collection-length coercion
could invoke proxy valueOf, residual paths used doubled slashes, and Boolean
argument/depth bounds differed from CONTRACT-062. The normalizer now captures a
primitive safe bounded integer length before comparisons, starts paths at the
empty root, and enforces nonempty <=64 arguments with root depth one. Bun and
Chromium retain exact boundary controls and zero-call coercion refusal. Three
expression tests pass 21 assertions; 72 shared Chromium observations, 44 component
groups and 117 phase checks pass. Equality-domain/subject/resource/constant typing,
compiler refinement and runtime enforcement remain unfinished.

## Association operand equality typing

Checked associations now retain a private captured source accessible only through
issued checked objects; callers receive a bounded copy. Expression normalization
indexes each source once per checked association. Variable identity operands use
the qualified Record, stable Key ID and ordered component source domains; scalar
attribute operands use exact required-singleton scalar/facet/allowed-value
descriptors. Record/Key nominal disagreement, identity/scalar mixing and unequal
scalar domains refuse. Boolean/string/integer/decimal/binary are considered, with
explicit decimal precision/scale; source extensions and record-valued operands
remain unsupported. Non-variable operands still produce explicit residuals.

Four expression tests pass 26 assertions. The shared Chromium receipt now has
77 observations, including three type refusals and matching identity/scalar
positives. All 44 component groups and 117 phase checks pass. Independent typing
review remains pending. These are logical selected-source type checks, not native
equality equivalence: authenticated model/revision context, subject/resource/
constant typing, compiler IR serialization/refinement and backend enforcement
remain unfinished.

## Constant source and literal typing

Constants now resolve their exact qualified field through selected Record
classification archives. Multiple candidate captured sources must have identical
field definitions; otherwise interpretation refuses rather than selecting one
meaning. The actual core `checkSchemaLiteral` validates each literal against its
source field, and equality uses the same scalar descriptor as association
attributes. Unclassified/missing fields remain explicit typing residuals.

The original active-assignment Boolean constant is now typed; the nested policy
has two remaining residuals for subject/resource operands. Five expression tests
pass 30 assertions; 79 Chromium observations, 44 component groups and 117 phase
checks pass. Invalid literals and incompatible domains refuse. Astra's preceding
operand review found no actionable defect across five scalar families and source
isolation; this constant increment's independent review is pending. Source/model
revision coherence, subject/resource/context typing, compiler/native equality
refinement and enforcement remain unqualified.

## Subject/resource declared types and literal structure

Optional closed subject/resource declarations now select an association reference
and endpoint role from issued available checks. Identity operands retain that
endpoint's exact Record/Key; field operands must belong to its classified Record
members. These declarations establish logical types, not authentication of a
subject or authority to select a resource. Without declarations the operands
remain explicit residuals. With correct declarations the original nested
Staff/Project expression has no remaining operand typing residuals; wrong role,
Record type, foreign association, unknown declaration member and wrong field owner
refuse. Empty residuals still do not establish full policy/compiler admission.

Astra found that checkSchemaLiteral assumes structurally valid literals and could
accept non-string carriers in `{string:...}`. The normalizer now validates the
actual core literal schema before field checking. Number, Boolean, object and
array string carriers refuse in Bun and Chromium. Constants reuse the cached
source index instead of copying whole documents per occurrence. Seven expression
tests pass 41 assertions; 89 Chromium controls, 44 component groups and 117 phase
checks pass. Independent context/fix review is pending. Model/revision coherence,
context fields, public ontology/compiler integration, native equality refinement
and runtime authorization remain unfinished.


## Eager declaration and composition coherence checks

Every supplied subject/resource declaration now resolves its association and
endpoint eagerly, including declarations unused by a literal expression. Captured
sources with the same Document ID must have canonically identical full content
throughout one expression. Astra independently verified these fixes, object-key
order equivalence, and preservation of array order; no actionable defect remained.
This establishes content coherence, not authenticated revision or source custody.

The expression checker additionally requires classification declarations for the
same qualified Record to agree across available association checks. Field order
is immaterial; protection and query-use declarations retain their meaning. A
conflicting protection declaration refuses in either association order, even when
unused. The reordered equivalent declaration passes. Nine expression tests pass
48 assertions and all 44 component groups pass. The existing 93 Chromium controls
were replayed against this changed source; the new classification composition
controls currently have Bun evidence only. Independent Astra review of this
increment is pending. Classification authority, public policy/compiler integration,
formal semantic refinement, and native runtime authorization remain unfinished.


## Exact Unicode ordering for classification composition

Astra found that localeCompare can compare distinct qualified field IDs as equal
(for example U+00E9 and U+0065 U+0301). Stable sorting then incorrectly made
classification agreement depend on declaration order. Exact lexical comparison
now orders IDs without locale collation or Unicode normalization. The regression
uses a shared multi-field Project, correcting the earlier one-field positive that
did not exercise this boundary. Equivalent reordered declarations pass in both
association orders; changed protection or queryUse refuses in both orders.

Nine expression tests pass 51 assertions. All six new controls pass in Chromium,
bringing its receipt to 99 observations. The evidence gate derives the required
count from its expected control set. All 44 component groups and 117 phase checks
pass after source refresh. Astra verified the comparator fix. These are semantic
implementation controls; they do not prove formal compiler refinement or grant
classification authority, public admission, or native enforcement.


## Private typed expression transport bridge

The checked expression previously retained process-local witness handles. The
private serializer now assigns unique preorder occurrence ordinals and resolves
witness terms through lexical scope, preserving nested inner/outer correlation
across JSON transport. Context and constant terms retain association ordinals;
the association table archives copied checked plans, classifications, and full
captured source Documents. Witness aliases remain data. Only issued normalization
results without residual terms can serialize; copied or residual results refuse.
The output is candidate-association-expression-transport/0.1, a private spike,
not a public policy version, compiler admission token, or authorization decision.

The original nested Staff/Project condition retains occurrences 0 and 1 and its
inner equality references occurrence 1 against occurrence 0. JSON round trips
retain the complete wire representation. Ten expression tests pass 59 assertions;
103 Chromium controls, 44 component groups, and 117 phase checks pass. Independent
Astra transport review is pending. This begins the semantic-to-compiler bridge;
a closed wire grammar, receiver validation, public version migration, original
compiler adoption, formal serialization/refinement correspondence, and native
runtime enforcement remain required. Empty residuals do not discharge those
obligations or authenticate subject, classification, revision, or source cut.


## Untrusted transport rechecking

The transport now archives the source expression and optional declarations as
well as every available association check, including unused context dependencies.
Its receiver snapshots untrusted JSON, reconstructs selectors and endpoint Key
choices, invokes actual core/source/classification checks, regenerates the typed
expression and wire representation, and requires canonical full-packet equality.
Descriptors are therefore checked against captured Documents rather than trusted
as issued handles. Altered occurrences, selected Keys, scalar definitions,
context selection, or unknown packet members refuse. A literal expression with
an unused valid subject declaration round trips with its dependencies retained.

Transported interpretedQualifier cannot authorize its own draft interpretation;
the receiver deliberately refuses it until independent interpretation selection
is supplied through a qualified design. This is an explicit limitation of the
receiver subset, not evidence that original graph producer semantics changed.
Self-consistent source/policy tampering is not detected without authenticated
revision/cut custody; canonical equality is consistency, not authenticity.

Twelve expression tests pass 67 assertions. All 109 Chromium controls, 44
component groups, and 117 phase checks pass. Astra found no defect in the earlier
serializer; receiver review remains pending. Formal normalization/serialization
refinement, a governed public ontology/policy migration, original compiler
integration, authority validation, and backend enforcement remain required.


## Bounded actual source-to-transport formula correspondence

Astra independently checked the receiver including graph round trips, direction
and occurrence tampering, interpretation refusal, accessor safety, and isolation;
no actionable defect remained. This review does not establish graph formal
correspondence or content authenticity.

The proof-input program now executes the actual relational fixture normalization,
serialization, and receiver. A separate Z3 harness translates the authored
Staff/Project condition through lexical aliases and the actual resulting wire
through occurrence ordinals. For complete finite association domains of one, two,
and three candidate rows each, arbitrary presence/active Boolean facts and
integer identity tokens yield unsatisfiable source-versus-wire inequivalence.
For every bound, a satisfying source population prevents vacuity and replacing
the outer Project witness reference with the inner occurrence produces a
satisfiable false-grant counterexample. All nine formulas and countermodels are
retained in association-transport-formal.json and independently replayed.

This result assumes faithful source facts, complete finite domains, required
singleton attributes, and shared exact identity equality. It does not prove
unbounded induction, graph correspondence, native domain equality, authenticated
revisions, public compiler integration, or runtime enforcement. Formula generator
correctness remains a separate review obligation. Astra proof review is pending.
There are now 420 replayed queries across 22 receipts; 45 component groups and
119 evidence gates pass. No backend acceptance criterion is promoted by this
bounded transport spike.


## Quantified actual-expression correspondence

The actual relational Staff/Project proof now additionally quantifies witness
variables over arbitrary integer-indexed association populations, with shared
presence predicates selecting the populations. Source and wire translators
independently introduce fresh existential variables and retain their respective
lexical-name and occurrence environments. Source/wire inequivalence is UNSAT;
positive population and the deliberately broken inner-for-outer correlation are
SAT. Astra independently replayed and reviewed all three quantified outcomes and
found no actionable defect. This removes fixed population bounds for this actual
expression under the retained source-fact, equality and completeness assumptions.

The result supports the relational correlation obligations of US-056-AC1/AC3
without promoting backend acceptance. It does not establish structural induction
for every admitted AST, graph correspondence, native identity domains, compiler
lowering, or runtime enforcement. The earlier bounded cases remain independently
retained. Twelve queries in this receipt and 423 across 22 formal receipts replay
successfully; 45 component groups and 119 evidence gates pass. No public policy
version or backend qualification changes.


## Graph transport and conditional shared logical meaning

The proof input additionally authors directed, singular core Relationships for
Ownership and Assignment, with original association Records and supported core
qualifiers. It uses the actual graph source checks, expression normalization,
serialization and receiver. The condition and subject/resource declarations use
qualified Relationship references; ordered native-side descriptors remain in the
transport. This independently authored semantic fixture does not substitute for
Truss original-source or native admission evidence.

Each raw and graph profile now has twelve correspondence/population/broken
correlation queries across finite bounds and quantified populations. Astra
verified all 24 source-to-transport formulas and current input/source pins. Three
additional quantified queries compare the raw and graph transports under an
explicit retained relationship-to-association fact mapping: faithful presence,
role values, attributes and identity equality are premises. Inequivalence is
UNSAT; joint valid population and a broken graph correlation false grant are SAT.
Independent review of those three additional queries is pending. The mapping is
fixture-local and does not prove native physical correspondence or reference
collision handling across arbitrary documents/modules.

These results support US-056-AC1 through AC4 shared correlation semantics without
promoting backend acceptance. This receipt has 27 queries; the independent replay
has 438 across 22 receipts. All 46 component groups, including strict proof-input
type checking, and 119 evidence gates pass. General AST induction, governed public
migration, original compiler adoption, authenticated fact custody, and native
runtime enforcement remain required.


## Draft ontology 0.2 shape and loss-aware 0.1 migration

The candidate ontology schema now resides alongside this spike as
security/ontology-v0.2.schema.json. It proposes version 0.2.0 while remaining
unpublished and unregistered: public CONTRACT-062 and the 0.1 interpreters are
unchanged. Entity declarations hold Record identities and complete field
classifications, including association Records. Association declarations become
tagged record-members or core-relationship selectors. Directed graph roles,
selected Keys, Record-backed versus opaque witnesses and ordered relational
member mappings retain the existing selector grammar. Schema validation alone
cannot establish source correspondence, complete classifications or authority.

The private migration snapshots valid 0.1 input and retains the complete source
archive. It projects association Record classifications into the common entity
list and emits member-backed selectors. Coherent exact duplicate Record
declarations merge; conflicting declarations yield explicit source-path residuals.
Unknown source qualifiers also yield residuals; unrepresentable candidate bounds
or structures yield candidate-structure-unresolved. This is an inspectable draft
projection, not an admissible ontology or compiler migration/rollback operation.
Unknown archive content remains intact even where the interpreted target omits it.

Astra reproduced inherited schema property names bypassing unknown-content
reporting and shared source/target objects permitting archive mutation. Own-property
lookup now handles constructor, toString and __proto__ as unknown content, including
nested endpoint qualifiers. The target is independently copied and the full result
is frozen. Source archive and target cannot corrupt each other. Three migration
tests pass 23 assertions. All 115 shared Chromium controls, refreshed 33 graph
semantic and 10 graph source browser controls, 46 component groups and 119 phase
gates pass. Astra independently verified both fixes with no remaining actionable
defect in this increment. Public policy version/association
reference migration, authenticated revision custody, whole-ontology semantic
admission, original compiler adoption and native enforcement remain unfinished.


## Whole draft ontology consistency

The candidate resolver snapshots the complete ontology and supplied document
revision entries, requires closed understood structure, unique pins and exact
revision/content supply, and validates each source Document through actual core
validation with no unresolved diagnostics. Record declarations are unique and
resolve original selected Keys. Selected Key fields use the required singleton
primitive subset, with explicit exact decimal domains and no unknown extension
meaning. Every declared Record has complete owned member classifications.
Subject resolves to a declared Record; context references resolve to classified
fields; actions and associations are unique. Association witness Keys must agree
with Record declarations and endpoint Records must be declared. Existing checked
association constructors establish the selected relational or graph source
correspondence. The frozen result retains ontology, supplied revisions/Documents,
and issued association checks.

This establishes supplied-content consistency, not authenticated revision custody
or full policy admission. It does not type every context/attribute operand or
validate action/rule/disclosure closure. Original graph sources needing unknown
qualifier interpretation remain refused; interpretation authority cannot be
silently inferred from ontology declarations. Cross-document associations outside
the underlying candidate source subset likewise remain refused.

Three ontology tests pass 20 assertions, including one mixed ontology with a
member association and either a Record-backed or opaque graph association. Thirteen
negative controls cover incoherent pins/declarations/classification/subject/context
and unknown semantics. All 120 shared Chromium controls, 33 graph semantic and
10 graph source controls, 46 component groups and 119 evidence gates pass. Astra
independently verified revisions, reserved names, selected Key domains, ownership,
accessor refusal and isolation; no actionable defect remained in the consistency
scope. Public version adoption, complete policy semantics, original compiler
integration and backend enforcement remain required.


## Draft policy 0.2 representation and explicit revision migration

The candidate policy schema security/policy-v0.2.schema.json retains the existing
rule/action/target/disclosure algebra while permitting existential association
references to either Records or Relationships. elementId and relationshipId remain
distinct selectors; a reference containing both cannot satisfy the union. Existing
field/entity references remain Record-domain references. Constant transform
profile version 0.1.0 retains its meaning independently of the draft policy version.
This schema is unpublished and public 0.1 inspection remains unchanged.

The private 0.1 policy projection retains the complete source archive, all rules,
disclosures and native opaque content. It requires explicit nonempty destination
ontology identity/revision and a different policy revision. The ontology migration
now likewise requires a different explicit ontology revision. Empty, reused or
non-string revisions refuse. The migration cannot silently claim changed source
content under an immutable original revision. These revisions are caller choices,
not authenticated publication or custody receipts.

Unknown-content detection follows the original schema's resolved definitions and
unique matching alternatives and reports nested source pointers, including
reserved qualifier names. Independent frozen source and target snapshots preserve
unknown data without converting it into executable meaning. Original Record
association references remain exact and are not inferred as graph references.
Unknown semantics remain residuals; empty residuals establish neither typed whole
policy closure nor backend admission.

Three policy migration tests pass 16 assertions; four ontology migration tests
pass 29 assertions. All 122 shared Chromium controls, 33 graph semantic controls,
10 graph source controls, 46 component groups and 119 evidence gates pass with
current pins. Astra verified the migration and revision checks with no
implementation defect. Syntax/rule preservation does not prove behavioral
equivalence against an independently chosen destination ontology. Whole-policy action/target,
operand/disclosure/dependency validation, governed public version adoption,
original compiler support and native enforcement remain required.


## Draft whole-policy source closure and target-specific conditions

The candidate policy checker composes actual draft ontology resolution with
closed policy structure and exact ontology identity/revision agreement. Rule IDs,
actions, targets and disclosure fields are unique; actions/types must be declared.
Only permit rules carry disclosures and each output field must belong to every
selected target. Constant transformations validate structurally exact literals
against captured core field domains in the required singleton primitive subset;
integer tokens remain exact. Native policy content is retained opaque data.

Explicit rule/target context declarations resolve subject endpoints to the ontology
subject Record and resource endpoints to the selected target. Unused declarations
are checked as well. Each target gets its own normalized condition and transport
when no typing residuals remain; unresolved terms remain explicit residuals.
The original Staff/Project condition passes for relational and mixed graph
selectors. This result is supplied-content consistency, not an authenticated
policy, backend admission, or execution decision. General context fields and
unassociated direct entity operands still need shared typing support; dependency
closure and original compiler adoption remain open.

Astra found that per-condition normalization reset the expression-node counter,
allowing a two-rule document above CONTRACT-062's 4096-node document bound.
The checker now counts all authored rule conditions once before per-target
normalization. Exactly 4096 nodes pass; 4097 and the reproduced 4226-node case
refuse. Multiple targets do not multiply the authored document count. Independent
fix review is pending. Six policy checks tests pass 27 assertions, including exact
9007199254740993 constant disclosure and invalid literal carriers. All 131 shared
Chromium controls, 33 graph semantic and 10 graph source controls, 46 component
groups and 119 evidence gates pass. Whole-policy formal refinement, public adoption,
authenticated custody, dependency derivation, native compiler integration and
backend enforcement remain required.


## Candidate policy dependency closure

A private dependency extractor now requires an issued, frozen whole-policy check
result with no typing residuals. Copied/proxied results refuse before property
access. Closure walks the actual typed per-target transports conservatively across
all rules, including negated existence. Live Record attributes, selected identity
Key components and relational endpoint member mappings are qualified field
references. Every existence adds its tagged exact Record association or Relationship
inventory. Constant literal-domain references and disclosure constant domains are
metadata rather than live policy-condition attribute reads.

Graph endpoint reads additionally retain relationship, role, source/target side,
selected target Record and Key. Record-backed graph existence contributes a separate
Record witness-owner inventory. Opaque witnesses do not invent Record owners,
identities or member fields. Record identity reads add the original Key fields
without inventing graph incidences. Exact lexical qualified-ID sorting and frozen
outputs retain determinism and distinct reference domains.

The Staff/Project raw condition produces eight live fields and two association
inventories. Its mixed graph counterpart retains both directed incidence reads
and the Assignment witness Record, while omitting nonexistent graph endpoint
member fields. Explicit Record identity adds assignmentId; opaque existence omits
the Record owner and unreferenced active attribute. Constant-only conditions have
no live dependencies. Eight policy checks tests pass 43 assertions. All 134 shared
Chromium controls, 33 graph semantic and 10 graph source controls, 46 component
groups and 119 evidence gates pass. Astra found no actionable defect in the
candidate dependency scope and independently checked graph identity, attributes,
negated existence and proxy refusal. It also verified the previous document-bound
fix. Physical writers/clocks, metadata authority, native dependencies and
backend policy-change mappings remain consumer obligations, not established by
this source inventory. Public adoption and original compiler/runtime integration
remain required.

## Original primary-Key metadata fidelity — 2026-10-09

The original Rust security 0.1 source path and public UMF 0.1 inspector now
preserve core 0.8 Boolean Key.primary metadata while retaining explicit keyId
selection. A different primary Key over an integer field does not replace the
selected string Key. The Rust regression checks both endpoint and resource IR
Key IDs; malformed selected or unselected primary carriers and duplicate primary
declarations refuse. No default identity selection or native activation is added.

Astra ultra's final review found no actionable defect in this increment. The
public policy tests pass 10 tests and 84 assertions, the original Rust admission
receipt passes with current source digests, and Chromium 153 passes ten added
original-primary controls within 144 shared controls. All 46 component groups
pass. Dependent native/compiler and browser receipts were rerun against the
rebuilt original handoff artifact. Acceptance-plan refresh remains in progress;
this checkpoint does not claim a fresh complete acceptance gate. Draft 0.2
compiler adoption, general refinement, authenticated fact custody and native
graph enforcement remain open.

## Intrinsic entity and context operand foundation — 2026-10-09

`entity-terms-candidate.ts` derives subject identity directly from the ontology
subject and resource identity from a declared target Record, independent of
association incidence. Context attributes must be explicitly declared in the
ontology. Subject/resource fields must belong to their selected Record, and
constants must use classified source fields and valid exact core literal
carriers. This supports standalone relational Records and Record-defined graph
types without fabricating an association just to establish operand types.

The current subset requires singleton, required primitive fields and retains
facets and allowed values in scalar domains. Identity domains retain the complete
qualified Record, explicitly selected Key ID and ordered member domains; equal
string carriers cannot identify Staff and Resource as the same nominal type.
Boolean primary metadata does not replace explicit keyId selection. Source
snapshots and issued scopes/terms are immutable. Copied scopes/terms and terms
from independently captured scopes refuse composition before property access.
These checks do not authenticate an identity, context value, or source revision.

Four Bun tests pass 27 assertions. Chromium 153 passes 22 controls with no
external requests; the retained entity-terms-browser.json was refreshed after
the final TypeScript narrowing correction. Full project type checking passes.
Astra ultra found no actionable defect and independently exercised decimal
scale, binary length, allowed values, distinct scalar domains and proxy refusal.
The evidence validator checks the exact browser control inventory and source
digests. All 47 component command groups and 120 evidence gates pass after
strict browser-harness type checking and its final source-bound replay.

Expression normalization, transported source reconstruction, live dependency
closure and original compiler consumption have not adopted this new foundation
yet. They remain required next steps, followed by formal refinement and backend
execution. The freshly rerun acceptance plan accepts 26 of 132 required cases;
the other 106 remain open. This foundation does not close a backend acceptance
case or change the shared security algebra.

## Intrinsic expression and transport integration — 2026-10-09

Whole-policy checks now create an intrinsic entity scope for each declared target.
The original Staff/Project correlated condition types without synthetic endpoint
context bindings. Explicit legacy bindings remain checked eagerly against the
intrinsic subject/resource type and selected Key. Supplied association checks must
match the complete ontology association set, classification descriptors and exact
captured documents, including unused declarations. Copied scopes cannot issue
typing authority. The association-only private transport 0.1 path is preserved.

Private transport 0.2 retains the complete intrinsic ontology/document/target
packet alongside the expression and association archives. Its receiver performs
core and ontology closure again, constructs a new checked scope, regenerates the
typed descriptors and lexical witness occurrences, and compares the complete
packet. Descriptor/domain, target, context, unknown-member and version tampering
controls refuse. A coherent replacement source packet is not authenticated by
this self-consistency check; external immutable revision custody remains a host
obligation. No new public package or original compiler source version is admitted.

Standalone Record policies can now compare a resource field with an exact typed
constant and use explicitly declared trusted context fields without any
association. Constant field references describe domains and do not become live
reads. Context reads are retained separately as contextFields; the same qualified
field read through both resource and context retains both dependencies. Physical
consumers must bind these distinct source channels and their authority cuts.

All 26 targeted tests pass 154 assertions; full project type checking passes.
Chromium 153 passes 31 intrinsic controls, 144 shared controls, 33 graph semantic
controls and 10 graph source controls. All 47 component groups and 120 evidence
gates pass, including a refreshed original Rust admission receipt. Astra ultra
found no actionable defect and independently checked omitted unused associations,
changed captured documents/classifications, copied scopes and dual-channel
dependencies. The existing 438 SMT queries retain their original qualified scope;
they do not prove this new intrinsic transport path or general AST refinement.
Original compiler consumption, intrinsic-path refinement, authenticated fact
custody and backend enforcement remain required. Acceptance remains 26/132.

## Intrinsic transport formal correspondence — 2026-10-09

The actual proof input now normalizes, serializes and receives both intrinsic
raw and directed Record-backed graph Staff/Project conditions, alongside the
original association-bound transport 0.1 profiles. For each intrinsic correlated
profile, finite witness bounds 1, 2 and 3 and quantified arbitrary witness
populations yield UNSAT source/transport inequivalence, SAT valid populations,
and SAT false grants when an outer witness reference is replaced with the inner
witness reference. These add 24 conditional queries to the original 27.

An association-free condition compares a stored resource salary with the exact
integer literal 9007199254740993 and requires a Boolean trusted context attribute.
Three additional queries prove fixture correspondence, exhibit a valid population
and produce a false grant when the stored salary read is changed into a context
salary read. The two channels use independent uninterpreted functions. The
counterexample contains stored salary 1, context salary 9007199254740993 and
context active true; channel substitution would authorize a resource that does
not satisfy the authored policy. The receiver's separate tampering controls
remain implementation evidence, rather than assumptions that this mutant is an
admitted transport.

Astra ultra independently regenerated the five-profile input exactly, verified
all 768 source digests and replayed all 54 formulas: 18 UNSAT and 36 SAT as
expected. No actionable defect remained within the stated fixture scope. The
aggregate independent audit now replays 465 formulas across 22 receipts. All 47
component groups and 120 evidence gates pass with retained current receipts.

This is the complete, well-typed two-valued fact slice of these authored
conditions. Boolean attributes, mathematical integer carriers, identity equality,
fixture-local qualified association correspondence and faithful complete fact
channels are premises. Missing/unknown facts, arbitrary primitive descriptors,
general AST induction, authenticated source/context custody, original compiler
refinement and native enforcement are not proved. The new profiles are private
transport 0.2, not public security extension or backend admission. Acceptance
remains 26/132; compiler and backend work remains required.

## Original Rust association-reference migration foundation — 2026-10-09

Inspection of the actual original compiler confirms that intrinsic subject,
resource and context terms already exist in its security 0.1 type/IR path. The
graph gap is the source ontology association grammar and Record-only reference
used by lexical binders, existential IR and endpoint terms. Merely accepting a
relationshipId while converting it to elementId would erase namespace meaning.

The original Rust core now defines SecurityAssociationRef with distinct Record
and Relationship variants. Original Record JSON retains the qualified elementId
shape; Relationship JSON retains relationshipId, documentId and moduleId.
Reference equality/ordering preserves all qualified components, variant identity
and exact Unicode spelling. Ambiguous mixed selectors, unknown members, empty
identifiers and non-object input refuse. Three original Rust unit tests cover
these boundaries and are executed by the retained original admission runner.

Astra reproduced a positional-array defect in the first implementation: Serde
could deserialize three strings into a Record struct. An object guard now runs
before Serde selection, and complete positional, mixed-scalar and nested arrays
are negative controls. Astra independently reproduced the corrected refusal
against the rebuilt original core and found no remaining defect in this parsing
scope. The original admission, version and handoff runners pass. Dependent
native/backend and Chromium receipts were refreshed against the rebuilt original
artifact; all 47 component groups and 120 evidence gates pass.

The governing original compiler CONTRACT-005 now records the coordinated source,
ontology closure, typed IR, evaluator/dependency, physical enforcement and binding
parity obligations. This reference parser does not issue an admitted source,
plan or authorization token. The current public source packet and logical plan
remain security 0.1/Record-only; request versions, blocked-only response and native
activation have not widened. The next required compiler step is adoption of the
tagged association reference throughout source closure and typed existential and
endpoint IR, followed by evaluator and consumer integration. All shared backend
cases remain required, with acceptance still 26/132.

## Original Rust existential and endpoint namespace adoption — 2026-10-09

The original Rust Expression::Exists and Term::Endpoint now carry the distinct
SecurityAssociationRef type. Admitted security 0.1 sources still produce Record
variants, with the same serialized qualified reference shape and lexical slots.
Relationship variants can retain relationshipId without conversion to elementId.
The admitted logical plan remains privately constructed through the existing
source/type closure; caller-created expression enums do not issue an admitted
plan. Core Relationship source closure and directional/witness typing remain open.

The current Record-only evaluator explicitly requires the Record variant before
preflight or value/existence lookup. Scan obligations require it before any
association inventory, key or member dependency is collected. Graph variants
must refuse rather than become empty relations or fabricated Record reads. The
existing graph source is not admitted, and these refusal branches are temporary
boundaries to be replaced only after graph facts and typed closure are supported.

Three new Rust regressions cover IR serialization/selected endpoint Key,
four evaluator paths and scan-inventory refusal. Astra identified a test-isolation
gap in the initial preflight controls: empty coverage would also refuse a valid
Record. The corrected regression supplies complete classifications and Assignment
fields, asserts successful same-qualified Record preflight/existence/endpoint
operations, and then asserts Relationship refusal under that same setup. Graph
existence also refuses after the fact inventory is cleared. Astra independently
reran the current original binary and found no remaining actionable defect.

Original admission, version and handoff runners pass. Existing raw native
predicate/existence/key/transport/type/query-use controls and dependent Chromium
receipts were refreshed against the final original artifact. All 47 component
groups and 120 evidence gates pass. The formal inventory remains 465 conditional
formula replays; no new general Rust compiler theorem is asserted. The original
compiler contract records source 0.2 closure, witness/side-specific endpoint IR,
graph fact evaluation, native dependencies, physical lowering and binding parity
as outstanding work. Public compiled output and graph activation remain closed;
shared backend acceptance remains 26/132.


## Separate original Rust draft source custody — 2026-10-09

Weft now has a separate `SecurityCandidateSourcePacket` for the private security
0.2 draft policy and ontology pair. Original authored JSON bytes, opaque native
content, complete model pins and catalog snapshots are retained. Strict selected
schema overlays, duplicate-key refusal, unique rule IDs and global expression
limits apply. The original admitted `SecuritySourcePacket` remains security 0.1;
the candidate has no conversion into that packet or admitted logical plan.

Three original Rust integration regressions exercise exact byte preservation,
mixed-version and malformed-source refusal, stale pins, graph selector shape
custody and expression depth bounds. A well-shaped Relationship can be captured
without proving that it exists in the catalog. This is intentionally source
custody only: draft ontology/type closure, directional endpoint and witness
semantics, graph IR and native admission are not established. Astra ultra found
no actionable code defect and requested an explicit split in the receipt scope;
the runner now distinguishes admitted 0.1 checks from draft 0.2 custody checks.

Original admission, version and mapping-handoff checks pass against the current
Rust source. Dependent PostgreSQL 17.9 component and Chromium 153.0.8010.12
receipts were refreshed. The first aggregate execution detected changed input
receipts; a stable rerun passes all 47 component groups, and the final validator
passes all 120 evidence gates. Formal scope remains 465 conditional queries
across 22 receipts. Backend acceptance remains 26/132; no graph/backend case
is promoted by this checkpoint. Next is original Rust draft ontology closure
against actual common entities and typed association selectors, followed by
policy/IR adoption, physical lowering and backend acceptance.


## Original Rust draft selected ontology correspondence — 2026-10-09

A separate `SecurityCandidateOntologyClosure` now consumes the original draft
source packet and rechecks catalog custody. A shared internal Record declaration
closer retains existing 0.1 behavior while resolving common 0.2 entities without
rewriting their sources. Draft context references must be classified Fields and
actions are unique. Raw selectors require owner Key agreement and ordered
member-to-target-Key domain correspondence. Graph selectors require an actual
qualified directed Relationship, one source and target reference, unique
roles/sides, exact target Key selection and actual Record witness ownership.
Opaque witnesses require the original associationRecord to be absent.

Three new original Rust integration tests cover raw membership, Record-backed
and opaque graph witnesses, semantic substitutions, absent/duplicate
Relationships, wrong direction/Key/owner, unsupported qualifiers, integral
decimal/exponent multiplicity spellings and inverted bounds. A two-document
common-entity baseline passes; raw cross-document endpoint substitution refuses
under the current shared candidate profile.

Astra ultra independently reproduced a selected Field ownership ambiguity: an
Assignment could also classify Resource salary under a different protection.
The corrected candidate tracks one global selected Record owner; a regression
asserts the valid baseline and rejects the otherwise-valid shared-owner mutant.
Astra also reproduced an integral multiplicity spelling refusal. The corrected
implementation uses the original exact numeric parser, with no floating-point
conversion or source rewriting. Unknown lifecycle labels refuse. Its final
review verified all 396 source pins and passing original suites, with no
remaining actionable finding within the stated selected-correspondence scope.

This is not complete core semantic validation. The draft currently restricts
all selected Record Fields to the original primitive singleton compiler profile;
broader unused attribute types remain required work. Recognized lifecycle,
multiplicity and inverse metadata is archival: edge population, inverse and
write/delete lifecycle enforcement is not established. Whole-core validation,
draft policy/IR admission, graph fact evaluation and native authorization remain
open. The candidate cannot enter an admitted 0.1 plan or activate the compiler.

Original admission/version/handoff and dependent PostgreSQL 17.9 and Chromium
153.0.8010.12 checks were refreshed. The initial component run correctly detected
changed compiler-input receipts; the stable rerun passes all 47 groups and the
final validator passes all 120 evidence gates. No new formal theorem is claimed:
the retained inventory remains 465 conditional queries across 22 receipts.
Backend acceptance remains 26/132. Next establish whole-core source semantic
closure and broader attribute-domain handling, then draft policy/IR and physical
lowering with formal refinement and acceptance evidence.


## Original draft alternate-Key integrity — 2026-10-09

The Rust draft closure now validates every Key on selected common entities,
including unselected alternatives: unique IDs/names/component sets, owning
Record membership and required primitive singleton component domains. Sorted
sets are used only to detect duplicate definitions; original Key order and
explicit ontology keyId selection are retained even if another Key is primary.

A new original regression passes a distinct primary salary Key while keeping
pk as identity, and refuses duplicate ID/name/set, wrong-owner and nullable
alternate components. The initial test incorrectly expected a repeated
component mutant to reach semantic closure; its existing WFT-MODEL envelope
refusal is now asserted separately. The final original admission runner passes
all three suites. Astra ultra independently verified the regression and all
396 retained source pins with no remaining actionable defect.

This closes another selected Record integrity gap, not whole-core semantic
validation. No new formal theorem, policy/IR admission or backend acceptance is
claimed. The prior aggregate/native receipts require refresh after this Rust
source change; their earlier green results do not qualify the new revision.
Backend acceptance remains 26/132, with whole-document source closure, broader
attribute typing and graph policy/IR adoption still required.


## Alternate-Key dependent evidence refresh — 2026-10-09

The original version and mapping-handoff runners and their dependent owned
PostgreSQL 17.9 and Chromium 153.0.8010.12 component receipts were refreshed
against the alternate-Key source change. All individual runs pass. The first
aggregate run had no failing command but detected changed original compiler
input receipts; a stable rerun passes all 47 component groups. The final
validator passes all 120 evidence gates. These current receipts supersede the
previous checkpoint's outstanding refresh limitation for this source revision.

The selected-correspondence limitations are unchanged. Formal inventory remains
465 conditional queries across 22 receipts, and backend acceptance remains
26/132. Complete native graph authorization, broader source/type closure and
draft policy/IR adoption remain required work.


## Original Rust draft declared policy typing — 2026-10-09

A separate `SecurityCandidatePolicyTypes` now checks the draft source through
selected ontology closure. Lexical variables bind qualified raw/graph association
references. Endpoint roles resolve selected entity/Key identities; Record
witnesses expose actual owner identities and classified attributes, while opaque
witnesses expose only existence and endpoints. Intrinsic subject/resource terms,
declared context, classified required scalar constants, exact literals, actions,
targets and disclosure declarations are checked without constructing an admitted
plan. Raw nested expressions retain outer bindings and refuse shadowing.

Three original Rust regressions cover the raw correlated fixture, intrinsic
integerToken 9007199254740993, graph endpoint typing, same-operand opaque identity
and attribute refusals paired with actual Record-witness positives, and isolated
classified/required operand and result declaration controls. Initial test grammar
errors were corrected rather than weakening source admission. Astra reproduced
unclassified constant descriptors and nullable operand acceptance in the first
implementation. Both defects are corrected; the nullable control removes
disclosure so independent result checks cannot hide the operand behavior.

Astra ultra independently ran all three final regressions and verified 397
source pins and passing original suites, with no remaining actionable finding
within this selected profile. The final runner also passes after its scope and
compiler contract were updated. This is declared type checking, not admitted
draft IR, evaluation, formal compiler refinement, whole-core semantic closure
or native authorization. No new formal theorem or backend case is claimed.
The previous aggregate/native receipts require refresh after this Rust source
change; prior green totals do not qualify the new revision. Backend acceptance
remains 26/132.

### Record membership and unknown lifecycle correction — 2026-10-09

Original0.7 validated Record members now form an explicit source assertion with
exact original digest, qualified module owner and members-array pointer. The
selected Record validation profile and governing Key membership semantics are
retained in its closed family manifest. Indexed references and their direct
module/element values are explicit components; unknown reference qualifiers
remain unavailable. Validation pins are computed once per document, and retained
entry artifact JSON is bounded before retention. Native target admission and
enforcement remain unqualified; no complete inventory is issued.

Astra independently reproduces an unknown relationship lifecycle token being
classified as understood despite the owner's uninterpretedPaths. Relationship
component classification now checks the exact original unknown path/subtree
before coverage, retaining the known lifecycle positive and adding an original
future-lifecycle unavailable regression. Fourteen Bun tests/107 assertions and
strict TypeScript pass. Record-membership review and the lifecycle correction
review are requested. Extensions, exact executable semantic profiles, complete
report0.3 comparison and native enforcement remain unfinished; affected native
receipts are stale and backend acceptance remains 26/132.

### Retained membership validation evidence — 2026-10-09

Astra independently passes fourteen tests/107 assertions and finds no remaining
membership or unknown-lifecycle defect. Its report-evidence qualification is
implemented: membership entries now reference one retained original validation
artifact per document instead of a digest resolvable only through the live
Prepared observation. The exact artifact binds Record producer, document identity,
original source digest and original validation result. Validation and entry
artifacts share the declared four-MiB retention guard. Actual reconciliation
exposes these validation artifacts for downstream report production.

Two independently authored Records, one with empty members and one with a Field
member, verify both assertion roots, one shared artifact, exact artifact hash,
original validation/source correspondence and all digest references. Fifteen Bun
tests/114 assertions and strict TypeScript pass. Astra review is requested.

Extension inspection confirms that original preserved payload inventory is not
assertion membership admission. The shared security0.1 package is document-scoped
and requires explicit ontology resolution for semantic interpretation; neither
unknown extension payloads nor unsupported policy versions can be silently
classified as metadata or known assertions. Exact owner-selected extension
boundaries, executable profile registration, global complete-report capacity and
nineteen-field report0.3 correspondence remain required. Affected native receipts
remain stale; backend acceptance remains 26/132.

### Explicit unresolved extension membership — 2026-10-09

Astra independently passes fifteen tests/114 assertions and finds no retained
membership-evidence defect. Actual reconciliation now derives the original
extension inventory and correlates every root to the issued original census by
source pin, qualified owner and escaped pointer, requiring the same frozen
payload reference. Missing or duplicate root correspondence refuses. A bounded
ancestor walk identifies extension descendants and records an explicit
extension_assertion_membership_not_admitted disposition, exact root and extension
identity. This is unavailable interpretation, not an opaque assertion-boundary
admission or a nonassertive-metadata default.

An independently authored escaped extension ID appears at document, module and
element scopes. Its nested kind/scalarType/members/rules/primary names all remain
unavailable and never acquire core assertion meaning. Sixteen Bun tests/122
assertions and strict TypeScript pass. Astra review is requested. Known extension
semantic registration, complete executable family profiles, full report0.3 and
global report-capacity admission remain required; no native receipt or backend
case is promoted, and acceptance remains 26/132.

### Composite Key evidence-cache control — 2026-10-09

Astra's requested corpus strengthening is implemented with two original Keys
sharing the exact issued inspector evidence object. The primary Key references
two Fields in deliberately reversed order; the secondary Key references one.
Independent ten/seven-component expectations verify fields/1 correspondence and
both parent identities through the cached-evidence path. Original w/v order is
retained, never normalized by identity. Seventeen Bun tests/129 assertions and
strict TypeScript pass. This adds evidence for the existing component family;
complete executable profiles, extension admission and report0.3/native enforcement
remain required. Backend acceptance remains 26/132.

### Original0.8 schema-property component entry — 2026-10-09

Original0.8 allowedValues and default assertions now classify indexed scalar
literal objects, exact direct typed token members, and default on/value as
components. The selected original declarations inspector must match operation
inspect-core-schema-properties/result1.0.0 and the exact observation profile;
each issued artifact decodes once. Source0.7 reversible-target observations are
not relabeled as authored0.8 occurrences. Nested collection-literal payloads
remain unresolved until their explicit family rule is implemented. No core0.8
domain/presence compatibility or complete inventory is inferred.

An independently authored two-value string set and literal default retain seven
original component pointers and exact red/blue tokens. Eighteen Bun tests/132
assertions and strict TypeScript pass before the closed family manifest is added.
Astra critical-path review is requested to identify the next executable admission
step rather than treating a collection of partial families as a complete report.
Complete source0.8, transition correspondence, extension meaning, exact executable
profiles, nineteen-field report0.3 and native enforcement remain required.
Backend acceptance remains 26/132; no native receipt is refreshed or promoted.

### Owner core0.8 inspection prerequisite — 2026-10-09

Astra's critical-path review finds that repinning the current assertion bundle
cannot supply core0.8 semantics: the six historical inspectors still select
result schemas and meaning dispatch for core0.7. The next dependency is explicit
read-only core0.8 inspection contracts, followed by the closed executable
disposition profile and exact original0.8/original0.7-with-migration inventories
in the actual nineteen-field report0.3 path. Historical authoring must remain
version-scoped. Truss cannot compensate by rewriting an original0.8 source.

The first owner change adds inspect-core-kind result7.0.0 with a dedicated
read-only core0.8 schema. Known, unknown and unspecified kinds preserve original
source; original0.7 still emits6.0.0. The initial implementation also extended
authoring; that expansion was removed after review clarified the read-only
boundary. Five Bun tests/138 assertions, TypeScript and browser build pass.
Chromium153.0.8010.12 executes the final bundle across sixty original source
validation decisions including core0.8, with36 kind lookups and the existing
legacy recovery/author checks; host globals are absent and no external requests
occur. The sandbox loopback launch refuses initially; the authorized owned
loopback replay completes. This proves the exercised kind path, not the other
five inspections, executable profile admission or native security enforcement.

Astra also identifies a downstream collision once facet inspection accepts0.8:
core.schema_properties.facets and core.facets currently select the same original
identity. The complete profile must choose one canonical assertion root and
attach both owner observations, preserving duplicate refusal rather than
concatenating collectors. Remaining owner inspections, this combined facet
fixture, complete semantic inventory/report and all backend cases remain open.

### Owner core0.8 nullability inspection — 2026-10-09

Astra independently verifies the kind increment, historical dispatch, qualified
lookup and six result-schema mutants, with no blocking defect. The next owner
change adds read-only inspect-core-nullability/result6.0.0 and its core0.8 result
schema. Known, unknown, missing and inapplicable availability preserve exact
original source and pointer. Historical inspection versions and authoring
restrictions remain intact; no native absence representation is inferred.

Ten Bun tests/209 assertions across the new original0.8 and existing authoring/
ideal suites pass, as do TypeScript and browser build. Chromium153.0.8010.12
executes200 original validation decisions,118 inspections and82 refusals with
the legacy recovery/transition checks and no external requests. This lightweight
browser receipt establishes the exercised parity, not independent source-hash
admission. Astra review is requested. Cardinality, Keys, relationships, full0.8
facets, the registered complete inventory and report0.3 remain required; native
enforcement and backend acceptance are unchanged at26/132.

### Owner core0.8 cardinality inspection — 2026-10-09

Astra independently verifies nullability with16tests/270assertions, six schema
mutants, qualified lookup, zero accessor calls and historical dispatch, finding
no blocking defect. Read-only inspect-core-cardinality/result5.0.0 now supports
original0.8 with a dedicated result schema. Known array/map item references
retain their exact original payload, including unknown qualifiers; unknown
shape, missing and inapplicable meanings remain distinct. Original0.7 still
emits4.0.0 and historical authoring excludes0.8.

Eleven Bun tests/536 assertions, TypeScript and browser build pass. The extended
Chromium operations check executes five original0.8 shape/item inspections
alongside the legacy serialization, migration and author-refusal controls with
no external requests. Its receipt includes the new result/source schema and
bundle fingerprints; those source observations do not establish full compiler
or native refinement. Astra review is requested. Keys, relationships and full0.8
facets remain owner prerequisites for complete registered inventory/report0.3;
backend acceptance remains26/132.

### Owner core0.8 Key inspection and lookup — 2026-10-09

Read-only inspect-core-keys and lookup-core-key now select result3.0.0 for
original0.8 with a dedicated inspection/lookup-only schema. Original ordered
components and uninterpreted qualifier paths are retained; historical Key/member
authoring restrictions and older result versions remain intact. Eight Bun
tests/97 assertions, TypeScript and browser build pass. Chromium executes both
original0.8 operations, exact original key/source equality and authoring refusal
alongside the legacy public Key corpus. This is exercised owner inspection, not
native uniqueness, executable inventory admission or complete report evidence.

Astra's cardinality review finds no implementation defect and independently
passes eleven tests/536 assertions, seven schema mutants, copy isolation and
historical dispatch. Its evidence improvements are implemented: the browser
scope identifies read-only0.8 and compares full meaning/item-reference payloads,
including opaque qualifiers. The strengthened browser replay passes. Relationship
and facet0.8 inspection, canonical combined facet identities, complete registered
inventory/report0.3 and native enforcement remain required; acceptance stays26/132.

### Owner core0.8 relationship inspection and result-contract correction — 2026-10-09

Read-only original0.8 relationship inspection/lookup now uses result2.0.0 and
recomputed verification, retaining exact source, endpoints and unknown lifecycle/
qualifier paths. Historical authoring restrictions remain intact. Seven Bun
tests/181 assertions including direct schema controls, TypeScript and build pass.
The Chromium fixture compares complete original0.8 inspection/lookup outputs and
recomputed verification alongside legacy operations. Its first replay exposed a
shallow fixture copy mutating the legacy source; a deep copy isolates the actual
original0.8 input and the replay completes successfully.

Astra's Key review reproduces a contract defect: the0.8-only Key result schema
accepts legacy meaning although the operation cannot emit it. That branch is
removed, as is the corresponding branch in the new relationship contract.
Direct original0.8 schema mutants now refuse legacy meaning. Key browser evidence
now records explicit0.8 checks and both new source/result schema fingerprints;
the refreshed Chromium replay passes. These controls qualify read-only owner
behavior, not complete inventory admission or native enforcement. Full0.8 facets,
canonical combined facet assertions, registered semantic profiles and report0.3
remain required; backend acceptance remains26/132.


## Draft policy typing dependent evidence refresh — 2026-10-09

Original compiler version and handoff checks and dependent PostgreSQL 17.9 and
Chromium 153.0.8010.12 receipts were refreshed against the new draft policy
checker. All individual commands pass. The first aggregate run had no command
failure but detected changed compiler-input receipts; the stable rerun passes
all 47 component groups. The final evidence validator passes all 120 gates.
This supersedes the previous checkpoint's pending refresh for this revision.

Formal scope remains 465 conditional queries across 22 receipts; no draft Rust
compiler refinement theorem is added. Backend acceptance remains 26/132. The
next IR change must retain qualified association references, directional endpoint
roles and Record-versus-opaque witness capabilities in a separately typed draft
plan, without allowing existing Record-only evaluation or physical consumers
to treat graph associations as empty relations or fabricated Record reads.
Whole-core source closure and native qualification remain separate obligations.


## Original Rust separate draft logical IR — 2026-10-09

`SecurityCandidateLogicalPlan` now privately constructs a separate draft IR
after selected ontology and declared policy term checks. Existing admitted 0.1
plan, Record-only evaluator and physical consumers cannot accept this plan type.
Existential nodes retain qualified association namespaces and RecordKey or
OpaqueExistential witness descriptors. Record descriptors clone actual selected
Key source metadata and ordered components. Endpoints retain role, target entity
and Key plus ordered raw member carriers or explicit source/target incidence.
No graph endpoint becomes a fabricated Record member. Exact intrinsic literal
and field-domain descriptors, effects/actions/targets and disclosures remain
in the separate rule structure. Original source bytes and catalog reuse checks
remain attached to the privately constructed plan.

Original regressions verify raw ownership/membership correlation at exact inner
slot 1 and outer slot 0, ordered member carriers, graph source and target sides,
opaque witness metadata, distinct sibling outer slots 0 and 2, original source
bytes and stale catalog refusal. The first correlation test inspected the
fixture's staff/subject equality instead of its following project/project
equality; it was corrected to assert the authored ordering. Astra ultra
independently verified both strengthened tests and all 398 current receipt
pins, with no remaining actionable finding within this draft IR scope. The
final original admission runner passes all three suites.

No graph fact evaluation, scan obligations, general compiler refinement proof,
full-core semantic closure or native authorization is claimed. Public compiler
admission remains closed; broad aggregate/native receipts require refresh after
this source revision. Formal inventory remains 465 conditional queries across
22 receipts and backend acceptance remains 26/132. Next implement draft graph
fact semantics and dependency obligations, alongside source-semantic closure
and formal source/IR correspondence, before physical lowering and acceptance.


## Draft logical IR dependent evidence refresh — 2026-10-09

Original compiler version/handoff checks and dependent PostgreSQL 17.9 and
Chromium 153.0.8010.12 component receipts were refreshed for the draft IR
revision. All individual runs pass. The first aggregate run detected changed
compiler-input receipts without a failing command; the stable rerun passes
all 47 component groups. The final evidence validator passes all 120 gates.
This supersedes the prior checkpoint's pending refresh for the current source.

Formal inventory remains 465 conditional queries across 22 receipts; these
refreshes do not establish graph evaluation, compiler refinement or native
authorization. Backend acceptance remains 26/132. Next implement separate
draft graph fact evaluation and scan dependency obligations, then validate
source/IR correspondence and original compiler/physical adoption.


## Original draft action dependency closure — 2026-10-09

`SecurityCandidateDependencies` now derives a separate target/action inventory
from the privately constructed draft plan after rechecking original source and
selected ontology closure. It retains ordered entity Keys, stored Field owner
reads, complete conservative raw/Record-backed witness inventories and exact
graph role/side/target/Key incidences. Opaque graph witnesses produce no fake
Record owner or attributes. Context stays separate from stored fields, including
a same-qualified Field read in both channels; constants add no live fact read.
These are action dependencies, not admitted query/per-scan obligations, matching
rule authorization, complete authenticated fact cuts or physical execution.

Original regressions cover raw association inventories, both opaque and actual
Record-backed graph dependencies, stored/context dual channels, constant-only
references and undeclared actions. Astra reproduced missing explicit identifier
text charges in the first collector. The corrected implementation charges each
retained association, incidence target, ordered Key component and owner copy
before insertion/allocation. A real collector-path regression independently
counts Key map 8 + Field map 6 + incidence 9 bytes: 22 refuses, 23 succeeds with
zero remaining. Work/text exhaustion also refuses without underflow. Astra
independently verified the corrected path and raw/context/constant and graph
controls with no further implementation defect.

The final original admission runner passes all three suites after the compiler
contract update; its contract digest was independently checked current. Broad
aggregate/native receipts require refresh after this source change. No new
formal theorem, graph evaluation or native admission is claimed. Formal scope
remains 465 conditional queries across 22 receipts and backend acceptance
remains 26/132. Graph fact evaluation, original query/scan integration, formal
refinement and native enforcement remain required.


## Draft dependency evidence refresh — 2026-10-09

Original compiler version/handoff and dependent PostgreSQL 17.9 and Chromium
153.0.8010.12 receipts were refreshed against the draft dependency collector.
The actual graph compiler-input receipt was refreshed before aggregate source
capture, avoiding the earlier changed-input rerun. All individual probes pass,
the stable aggregate passes all 47 component groups on its first execution,
and the final validator passes all 120 evidence gates. This supersedes the
prior checkpoint's outstanding refresh for the current source revision.

Formal inventory remains 465 conditional queries across 22 receipts. Dependency
inventories do not establish authenticated fact cuts, graph evaluation, native
physical mapping or execution authority. Backend acceptance remains 26/132;
those obligations and general source/IR refinement remain required.


## Shared pure original/draft rule composition — 2026-10-09

The admitted 0.1 and separately typed draft composition entrypoints now share
one private pure effect/disclosure fold. Each wrapper checks its own original
source/ontology, action and output ownership and selects exact target/action
rule metadata. No draft graph condition is rewritten into a Record-only plan.
The draft API takes caller-supplied truths; it does not derive graph fact truths
or authenticate membership.

The new draft regression matches all 27 independent TypeScript-generated
permit/require/forbid decision vectors. Existing original exact-mask, conflict,
withheld and missing protected-disposition tests still pass after extraction.
An opaque graph draft control verifies permit with withheld output under
supplied true membership and indeterminate/no disclosure under unknown
membership. Astra found no refactor defect and requested draft disclosure bridge
coverage. Additional controls now verify protected omission, equivalent exact
integerToken masks (9007199254740993 and 9007199254740993.0e0), unequal-value
conflict and withheld precedence through the draft source/type/IR bridge.
Astra independently ran the new bridge regression with no actionable finding.

The final original admission runner passes all three suites; an independent
post-run audit verifies all 399 source pins, including the final contract edit.
Broader aggregate/native evidence requires refresh for this source revision.
No new formal theorem or graph evaluation/native authorization is claimed.
Formal scope remains 465 conditional queries across 22 receipts; backend
acceptance remains 26/132. Graph facts must next supply correct same-witness
endpoint/owner values and completeness-qualified truth under the separate
draft plan before physical lowering or backend acceptance.


## Shared composition dependent evidence refresh — 2026-10-09

Original compiler version/handoff, graph compiler-input and dependent owned
PostgreSQL 17.9 and Chromium 153.0.8010.12 receipts were refreshed against the
shared original/draft composition fold. All individual runs pass; the aggregate
passes all 47 component groups with stable inputs, and the final validator
passes all 120 evidence gates. This supersedes the prior checkpoint's pending
refresh for this revision.

Formal inventory remains 465 conditional queries across 22 receipts. Supplied
truth composition does not establish graph fact truth, complete authenticated
inventories or native execution authority. Backend acceptance remains 26/132;
graph evaluation, source/IR refinement and native physical admission remain
required work.

## Original draft graph incidence normalization — 2026-10-09

The separate original Rust candidate now checks qualified Relationship role,
direction, target entity and selected ordered Key before normalizing endpoint
values with the original scalar/facet implementation. It retains component
domains and exact model source pins, checks catalog reuse, and exposes no
context-free incidence equality. Astra identified numeric carrier domain erasure
and aggregate exponent expansion; both findings have implementation corrections
and retained original regressions. Input scalar text and aggregate normalized
scalar storage each have a 4,000,000-byte limit. The normalized budget is charged
before each scalar is retained; one scalar normalization remains bounded by the
original literal parser.

Actual private graph plans establish two-component budget-one refusal versus
budget-two success and short exponent 1e1000 budget-ten refusal versus normal
bound success. Independently valid integer 1 and decimal(scale 1) 0.1 catalogs
produce equal numeric carriers with distinct domains and refuse cross-catalog
reuse. Existing qualified role, direction, namespace, arity and source-custody
controls remain passing. The current-source admission receipt passes all three
commands including 41 library and 42 security-admission tests; broader dependent
native/aggregate receipts require refresh after these original Rust changes.

This is selected endpoint value normalization. Witness grouping, complete
association populations, trusted fact custody, graph evaluation, query/scan
integration, formal compiler refinement and native enforcement remain required.
No new formal theorem or backend acceptance is claimed: the inventory remains
465 conditional queries and acceptance remains 26/132. Independent Astra ultra review
reran both regressions and checked all 400 current admission source pins; no
actionable defect remained in this selected normalization scope.

The dependent refresh subsequently passes 47 component groups and all 120
evidence gates with current receipts. Fresh owned PostgreSQL 17.9 observations
include compiler-Key 20, raw policy lowering 49, existential truth 78, type
selection 28, Key transport 17, namespace 23, native Key 44 and original query
use 418. Real Chromium 153.0.8010.12 verifies transport four, stored-Key nine,
predicates three, association candidate 144, native-Key five and original-use
ten programs/fifteen refusals. These retain each receipt's stated component
premises; they do not promote native graph acceptance. Formal inventory stays
465 conditional queries and backend acceptance stays 26/132.

## Original draft endpoint bundle correspondence — 2026-10-09

The original Rust CandidateIncidenceBundle now retains the qualified
Relationship, exact policy/ontology source byte digests, and individually
normalized role/side/target/Key components. Constructor validation requires all
declared endpoint roles exactly once, independent of input ordering, with a
shared 4,000,000-byte retained scalar-payload budget. Immutable role/side access
preserves the distinctions needed by future self-relationship consumption.

Original valid graph-plan controls pass complete bundles and input reordering;
missing/duplicate roles and reversed direction refuse. Astra requested isolated
source and aggregate controls: independently valid same-catalog changed policy
revision and changed ontology endpoint role both refuse bundle reuse, while
the baseline passes. A one-byte Staff integer plus two-byte Project string
refuses at budget two and passes at three in both endpoint orders. The final
current-source admission runner passes all three commands, including 42 library
tests and 42 security admission tests. Astra ultra independently reran all three
incidence tests, verified the isolated controls and all 400 current source
pins, and found no remaining actionable defect in the selected bundle scope.

This establishes caller-supplied endpoint correspondence and source custody,
not authenticated same-edge grouping. Record-backed witness identity, complete
edge populations, graph evaluation, query/scan integration, physical authority
and formal compiler refinement remain required. Dependent native/aggregate
receipts predate this new Rust module revision and require refresh. No formal
query or required backend case is promoted; inventory remains 465 conditional
queries and acceptance remains 26/132.

## Original same-bundle existential simulation — 2026-10-09

The original Rust draft graph kernel now normalizes one or two role-specific
endpoint constraints and evaluates their conjunction inside each supplied
source-bound bundle. It preflights all bundle plan/catalog/association custody
before observing truth. Split Staff/Project endpoints across two edges cannot
satisfy the same-edge conjunction. A witnessed match yields True; complete
no-match yields False; incomplete no-match yields Unknown. Completeness and
grouping are caller-supplied simulation premises, not authenticated facts.

An independent pair-set oracle compares all sixteen edge populations over two
Staff/two Project identities, all four requested pairs and both coverage states
(128 correspondences). Controls also cover split versus joined endpoints, empty
populations, duplicate constraints, scalar comparison boundary five/six bytes,
and two matching bundles whose boundary is six-byte refusal/twelve-byte success.
A matching first bundle cannot hide a later independently valid different-policy
source bundle: the whole simulation refuses. These are executable original Rust
regressions; no general AST induction or new formal theorem is claimed.

The kernel bounds 4096 bundles, two constraints, 4M normalized expected scalar
bytes and 16M scalar-comparison payload bytes. Source/catalog hashing and parsing
and domain-descriptor equality are outside the comparison budget; repeated
catalog checks remain a performance concern. This is not a runtime CPU bound.
Original admission passes all three commands with 45 library and 42 security
admission tests. Astra ultra independently reran all six incidence tests and
verified all 400 current pins with no stale source or actionable defect in the
selected endpoint-conjunction simulation scope. Dependent
backend/aggregate receipts need refresh after this new Rust source revision.

General candidate-policy evaluation, correlated raw/graph lexical scopes,
Record-backed witness identity/attributes, trusted complete cuts, query/scan
integration, formal compiler refinement and native enforcement remain required.
Formal inventory remains 465 conditional queries; backend acceptance stays
26/132 and no Truss graph case is promoted.

## Original opaque graph rule interpreter — 2026-10-09

The original Rust interpreter now consumes an actual admitted private draft
rule condition rather than a caller-authored endpoint conjunction. This selected
simulation supports literal/equality/and/or/not/exists over opaque graph endpoint
identities and preserves fresh lexical slots and outer witness references. An
authored nested query for one Staff working on two different Projects returns
True for same-Staff/different-Project bundles and False for different-Staff
bundles. Incomplete no-match and empty populations retain Unknown; complete
empty populations return False.

Astra found empty unused populations bypassed association checks. Every supplied
population now checks its declared qualified Relationship and supported opaque
witness before traversing any bundle. A literal-True valid rule accepts its
valid declared empty population and refuses undeclared Relationships and the
same-named Record namespace. Recursive preflight refuses independently valid
intrinsic equality and raw Ownership existential expressions beneath an empty
outer graph quantifier; empty population cannot hide unimplemented semantics.

An actual source-admitted staff endpoint self-equality Exists over two matching
bundles exercises the interpreter ledgers: two visits/four scalar bytes refuse,
three visits/three bytes refuse, and three visits/four bytes pass. It evaluates
both matching witnesses. Public limits remain 512 populations, 4096 total bundles,
1M expression visits and 16M scalar comparison payload bytes. Source hashing,
JSON parsing, domain equality and lexical environment copies remain outside
these ledgers; no CPU/runtime bound is claimed. Original admission passes three
commands with 49 library and 42 security admission tests. Astra independently
reran all ten incidence tests and checked all 400 current source pins, finding
no stale source or remaining actionable defect in this interpreter subset.

This is a conditional graph-only rule simulation, not general candidate policy
evaluation, authorization composition or physical admission. Intrinsic/raw/
Record-backed profiles still require implementation and explicitly refuse.
Authenticated same-edge grouping, complete fact cuts, original query/scan
integration, formal compiler refinement and backend enforcement remain required.
Dependent backend receipts need refresh after these Rust changes. Formal
inventory remains 465 conditional queries; backend acceptance remains 26/132.

## Shared logical identity in original graph rules — 2026-10-09

CandidateEntityIdentity now normalizes the common ontology Record's ordered
selected Key independently of association storage, retaining primitive domains,
model pins and exact policy/ontology source digests. An explicit identity-aware
entry point supports Subject and Resource identities in the original draft graph
IR. It eagerly checks supplied identities against the ontology subject and rule
target even when unused; recursive preflight refuses missing identities beneath
empty quantifiers. The no-identity entry point retains those explicit refusals.

An authored Project-targeted policy requires one WorksOn witness whose Staff
endpoint equals Subject and Project endpoint equals Resource. Joined Staff-1/
Project-1 yields True; Staff-1/Project-2 plus Staff-2/Project-1 yields False.
Wrong/swapped types, missing identities and independently valid other-policy
identities refuse. Exact integers 9007199254740993 and 9007199254740994 remain
distinct, composite Key order remains meaningful, and integer 1 versus
decimal(scale 1) 0.1 retain different domains despite equal numeric coefficients.
Both refuse cross-source reuse.

The identity constructor has separate input text and normalized scalar payload
limits of 4M bytes. Actual composite budget one refuses and two passes; short
exponent 1e1000 refuses at normalized budget ten and passes at the default bound.
A literal-True rule accepts a valid unused identity and refuses wrong-type and
independently valid stale-policy supplied identities, isolating eager checking.
Current original admission passes all three commands with 52 library and 42
security admission tests. Astra independently reran all thirteen incidence tests
and verified all 400 current source pins with no stale source or remaining
actionable defect in the identity-aware simulation scope.

These are common logical identities and conditional graph simulation, not
authenticated subjects, raw fact admission or complete candidate evaluation.
Scalar fields/context/constants, raw association evaluation, Record-backed
witness identity/attributes, complete fact cuts, query/scan integration, formal
compiler refinement and physical enforcement remain required. Dependent backend
receipts predate these Rust changes and require refresh. Formal inventory stays
465 conditional queries and backend acceptance stays 26/132.

## Conditional original Rust source/IR graph correspondence — 2026-10-09

A private original Weft executable now reads exact source packets and serializes
the actual separate draft IR. The retained formal harness exports two authored
nested Staff/Project graph conditions, including negation, and independently
interprets source lexical names and emitted IR slots. Over arbitrary witness
populations with complete faithful membership and exact role-specific nominal
Key mapping, both source/IR inequivalence queries are UNSAT. Each joint positive
control requires a nonempty population and is SAT. A broken outer-to-inner
reference produces a SAT false grant in the nested condition and a SAT false
denial under negation. These are six conditional formulas tied to actual
original compiler output, not a claim of arbitrary AST induction.

The receipt retains exact requests, original emitted rules, mutants, replayable
SMT and the executable digest. Astra found missing local build-input pins and
late executable digest capture. The corrected harness pins the core build
manifest, local vendor/ahash patch, Cargo configuration and relevant original
source/contracts. It captures binary bytes before execution and checks the
digest before/after each invocation, with a fixed self-path guard. Astra
independently reproduced both emitted rule arrays, replayed all six formulas
and verified all 75 current source pins and unchanged binary; no actionable
defect remained in this two-fixture scope.

The aggregate independent replay now passes 471 formulas across 23 receipts.
The new generator is registered before replay in the component commands; the
evidence validator checks its exact case/result inventory, original artifact
profiles and source freshness. All 48 component groups and 122 evidence gates
pass after the final stable-source dependent refresh. Original admission,
version/handoff, owned PostgreSQL 17.9 component probes and affected Chromium
153.0.8010.12 witnesses have current receipts. Their narrower component scope
and fixture authority premises remain unchanged.

The new proof does not establish executable interpreter refinement, unknown
facts, arbitrary scalar codecs, authenticated graph grouping/source/cuts or
native enforcement. Common intrinsic/raw/Record-backed evaluator completion,
query/scan integration, general compiler refinement and backend acceptance remain
required. Full acceptance stays 26/132 and no Truss graph case is promoted.

## Original graph ABAC entity facts — 2026-10-09

Source-bound CandidateEntityFact now combines common logical identity with
qualified selected nonnull scalar field values. Foreign/duplicate fields and
supplied Key-field contradictions refuse. Partial inventories are explicit at
construction; recursive original-IR preflight requires each used subject or
resource field even beneath an empty graph quantifier. The fact entry point
evaluates subject/resource fields and typed constants with original exact
normalization and charges stored scalar copies before cloning. Source and nominal
identity checking remains eager for unused supplied facts.

The authored graph ABAC control requires Staff membership, subject field one
and resource salary 9007199254740993. Changing the salary to the next integer
returns False. A separately admitted source changing only the subject constant
to two also returns False with unchanged matching membership and salary facts;
all supplied facts/bundles are rebuilt under that source. Missing subject or
resource fields under empty quantifiers refuse. Foreign fields, contradictory
Key fields and duplicates refuse independently of evaluation.

Field construction bounds 4096 entries, 4M aggregate carrier/qualified-field
identifier text and 4M normalized field payload, separately from identity bounds.
Original private controls check one-field six/seven-byte boundaries and coherent
resourceId r1 plus salary (nine normalized bytes): eight refuses/nine passes in
both field orders. Actual interpretation charges five visits and eighteen
scalar payload bytes; seventeen refuses/eighteen passes. These counters exclude
source hashing/parsing and domain equality and do not imply CPU/runtime limits.

Current original admission passes all three commands, with 54 library and 42
security admission tests. Astra independently reran all fifteen incidence tests
and verified all 400 current admission pins and 75 current formal pins with
no remaining actionable defect in the fact/scalar simulation subset.
The unchanged original graph source/IR proof regenerates six passing formulas
against the current Rust source; all 471 retained formulas replay across 23
receipts. This does not add a field-fact formal refinement theorem. Dependent
backend/aggregate receipts need refresh after the new original Rust changes.

Context, raw associations and Record-backed witness fields remain explicit
refusals and require implementation. General candidate evaluation, trusted fact
cuts, authored raw/graph correlation, query/scan integration, formal compiler
refinement and native enforcement remain required. Full acceptance stays
26/132; no native graph case is promoted by these simulation components.

## Independent original context channel — 2026-10-09

The checked draft ontology closure retains its validated context declarations.
CandidateContextValues now normalizes only those qualified nonnull scalar
attributes, independently of stored entity facts. Exact source model pins and
policy/ontology byte digests govern reuse. The explicit context entry point
preflights every used context field recursively even under empty quantifiers;
eager source checks also cover supplied unused context.

Actual authored stored/context salary controls pass stored one/context two,
fail stored two/context two and fail stored one/context one with the same
qualified field declaration. Stored facts cannot substitute for missing
context. Missing context beneath an empty graph quantifier refuses. Duplicate
and foreign attributes refuse; a literal-True rule accepts valid unused
context and refuses independently valid other-source context. The constructor
limits 256 entries and separate aggregate 4M reference/carrier text and 4M
normalized scalar payload budgets. Two-field budget two refuses and three
passes in both orders; short exponent expansion refuses at a small bound.
Actual interpretation charges context copies before cloning: scalar payload
three refuses/four passes for the paired stored/context equality condition.

Current original admission passes three commands with 55 library and 42
security admission tests. Astra ultra independently reran all sixteen incidence
tests, verified all 400 current source pins and found no actionable defect in
the selected context-channel simulation scope. Existing original graph source/
IR proof fixtures regenerate against current Rust source and all 471 retained
formulas replay across 23 receipts. No context interpreter refinement theorem
is added. Dependent backend/aggregate receipts require refresh after these
original Rust changes.

These are explicitly supplied simulation values, not authenticated session
context or native custody. Raw associations, Record-backed witness identity/
attributes, trusted complete cuts, full candidate evaluation, query/scan
integration, general compiler refinement and native enforcement remain required.
Acceptance remains 26/132 with no Truss graph case promoted.

## Original raw association witness projection — 2026-10-09

CandidateRecordWitness now retains one source-bound raw association Record fact
and projects every declared endpoint in ordered member-field/target-Key
correspondence. Its own Record identity remains distinct from projected common
entity identities. Namespace, owner, explicit selected Key and every required
endpoint field must agree. Immutable endpoint identity access exposes target,
selected Key, ordered components and component domains without context-free
equality. The constructor bounds 64 roles and 4M aggregate copied scalar payload,
charged before cloning; this is not a total memory or CPU bound.

The actual Ownership fixture projects Resource r1 and Project p1 from row o1.
Missing endpoint fields, wrong owner and same-named Relationship refuse, with
three-byte refusal/four-byte success for aggregate projection. Astra requested
compound-key and independent source controls. A separately revised model selects
Resource.resourceId followed by salary 9007199254740993 and maps Ownership's
ordered ownerResource/ownerSalary fields. The complete projected identity agrees
with independently constructed common identity: exact target, selected Key,
ordered values and domains. Reversing differently typed member mappings refuses
semantic admission. Independently valid changed policy and ontology plans both
refuse witness reuse while the baseline passes.

Astra independently reran all eighteen incidence tests and found no actionable
defect in this projection-only scope. Final current-source admission passes
three commands with 57 library and 42 security admission tests. The unchanged
original graph source/IR proof regenerates six queries and all 471 retained
formulas replay across 23 receipts; no raw projection theorem is added. Final
post-documentation Astra audit verifies all 400 current admission pins and 75
current formal pins with no new actionable finding. Dependent backend/aggregate
receipts require refresh after these original Rust changes.

Raw existential interpretation and mixed raw/graph lexical correlation remain
required next integration steps, followed by Record-backed graph witness fields,
trusted complete native cuts, query/scan integration, formal compiler refinement
and physical enforcement. This projection does not authenticate row provenance,
population completeness or authorization. Acceptance remains 26/132 with no
Truss graph case promoted.


## Original mixed raw/opaque graph interpreter — 2026-10-09

The original Rust draft interpreter now evaluates raw Record and opaque graph
populations together through a separate simulate_candidate_rule API. An actual
Resource/Ownership/WorksOn authored rule retains the outer owner's Project
while selecting Staff membership. Joined evidence returns True; independently
split graph assignments and split raw owners return False. Empty complete raw
evidence returns False and incomplete unmatched graph evidence returns Unknown.
Raw own-row identity, projected endpoints and raw fields remain distinct.
Missing used raw fields refuse recursively even with an empty inner population.

Astra found uncharged scalar comparisons in duplicate raw-Key detection.
Explicit pairwise checking now charges both payloads before comparison, with a
minimum charge per scalar for empty strings. An isolated literal rule refuses
at three bytes and succeeds at four. Equal own Keys refuse. Additional controls
cover distinct own IDs with identical endpoints, a later stale-policy row, and
unused empty unknown/same-named Relationship raw populations. Astra independently
verified twenty incidence tests, 59 library and 42 admission tests with no
remaining actionable finding in this scope.

The simulation bounds combined populations/rows and expression/payload work;
it does not authenticate facts, grouping or caller-declared completeness, or
prove total CPU/allocation bounds. Graph Record-backed witnesses remain refused.
The existing six original graph compiler formulas do not establish mixed
interpreter refinement. Source-dependent evidence is being refreshed after the
reviewed code and contract changes. Native fact custody, general compiler and
evaluator proof, query/scan integration and backend enforcement remain required.
Acceptance remains 26/132; no Truss graph case is promoted.


### Mixed interpreter evidence refresh

After final source/contract edits, original admission passes all three commands
with 59 library and 42 security admission tests. The actual original compiler
source/IR proof retains six conditional queries; the complete selected replay
passes 471 formulas across 23 receipts with unchanged captured sources.
Forty-eight component groups and all 122 consolidated evidence gates pass.
Fresh owned PostgreSQL 17.9 probes retain 20 compiler-Key, 49 lowering,
78 existence-truth, 28 type-selection, 17 key-transport, 23 key-namespace,
44 native-Key and 418 original-use observations. Browser refresh retains
Chromium 153.0.8010.12 key-transport four, stored-Key nine, predicate three,
association-candidate 144, native-Key five and original-use ten programs/fifteen
refusals. Stored-Key replay has eight checks and explicitly reports no fresh
native execution; typed-readiness has three qualified refusals. These are
current scoped component receipts, not accepted graph backend cases.

No mixed interpreter theorem or graph Record-backed fact support is inferred
from this refresh. Next implementation work must retain actual Record-backed
graph witness identity/fields and source/edge correlation, and establish formal
source-to-IR-to-evaluator obligations before native admission. Trusted native
facts, physical lowering, complete privacy paths and authority/lifecycle guards
remain required by the original 132-case plan; acceptance is still 26/132.


## Original Record-backed graph interpreter — 2026-10-09

Original Rust now has a separate source-bound CandidateGraphRecordWitness and
simulate_candidate_rule_with_graph_records API. An actual core Relationship's
associationRecord Assignment and selected record-key witness bind the fact
owner/Key to the selector. Bundle and fact must share exact original source
custody. Raw, opaque and Record-backed populations coexist through the shared
lexical evaluator. Record-backed own identity and scalar fields stay distinct
from endpoint identity and directional role carriers.

An actual authored active=true plus matching Staff rule succeeds for one joined
edge and fails when active and membership occur on different edges. Complete
empty coverage returns False; incomplete empty coverage returns Unknown.
Missing active, wrong owner, duplicate edge identity, stale fact source and a
later stale edge refuse. Astra requested isolated new-arm controls: literal
comparison budget three/four, equal-Key refusal, nested own-identity inequality
with identical endpoints/distinct Keys, and unused invalid graph populations.
All now pass: two own Keys yield True for inequality, one row yields False;
unknown, Record-namespace and opaque-selector populations refuse eagerly.
Scoped original admission passes three commands, 60 library and 42 security
admission tests. Final source/document receipt refresh and Astra review follow.

Caller grouping is not authenticated native edge correspondence. The model
provides no implicit associationRecord-to-endpoint field mapping; none is
invented here. Full fact issuer/cut custody, source/IR/evaluator refinement,
query/scan integration, physical enforcement and backend acceptance remain
required. The existing six original compiler formulas concern opaque fixtures,
not this new interpreter arm. Previous aggregate/backend receipts are stale
against these changed Rust sources until explicitly refreshed. No backend case
is promoted: acceptance stays 26/132 of the original required plan.


### Record-backed graph final scoped evidence

Post-contract admission passes all three commands with 60 library and 42
security admission tests. Astra independently reruns the 21 incidence tests,
verifies all 400 current admission pins, and finds no remaining actionable issue
in the selected simulation scope. Original opaque graph source/IR proof
regenerates six conditional queries with all 75 pins current. All 471 retained
formulas replay across 23 receipts; this adds no Record-backed interpreter
theorem. The scoped proof/source receipts are current while dependent native
and aggregate receipts still require refresh after this source change.
Acceptance remains 26/132 with no Truss graph case qualified.


## Original mixed source/IR formal correspondence — 2026-10-09

The original Rust compiler proof generator now retains four actual emitted IR
fixtures and twelve queries. The two new fixtures combine raw Ownership with
opaque graph WorksOn: the selected Resource's owner Project must equal the
Project of the selected Staff's membership edge. A separately authored negated
fixture exercises the same nested binding under negation. Source translation
uses authored lexical names; compiled translation uses actual emitted slots.
Strict checks retain qualified associations/targets, ordered raw member carriers,
original Record witness Key metadata and directional graph carriers.

Unbounded raw and graph witness sorts, distinct nominal Resource/Staff/Project
Key sorts, complete faithful membership and exact endpoint projections are the
premises. Authored/compiled inequivalence is UNSAT for both new fixtures. Each
positive population is SAT with raw and graph populations explicitly nonempty,
including the negated profile. A retained mutant introduces an independent raw
owner only for the Project join while retaining the original Resource owner;
it yields a SAT false grant, and a SAT false denial under negation.

Astra independently reexecutes all four retained requests through the pinned
original Rust binary and matches emitted IR, replays all twelve formulas, and
verifies all 75 current source pins without an actionable finding. Selected
formal replay now covers 477 formulas across 23 receipts. The evidence gate
requires the exact twelve query IDs/outcomes and four retained profiles.

This proves conditional Boolean condition correspondence for these actual
source fixtures. It is not arbitrary AST induction or refinement of the Rust
interpreter, Record-backed graph property evaluation, authenticated native fact
correspondence, scalar codecs, incomplete facts or database enforcement.
Backend acceptance remains 26/132, with no Truss graph case promoted.


### Mixed compiler proof aggregate refresh

All 48 component groups and 122 consolidated evidence gates pass after the
Record-backed Rust changes and mixed proof-generator/gate changes. Original
admission retains 60 library/42 admission tests and current source custody.
Current-source original compiler version/handoff probes retain four observations
and ten checks/three artifacts. Fresh PostgreSQL 17.9 probes retain 20 compiler
Key, 49 lowering, 78 existence-truth, 28 type-selection, 17 key-transport,
23 key-namespace, 44 native-Key and 418 original-use observations. Chromium
153.0.8010.12 refresh passes key-transport four, stored-Key nine, predicate
three, association-candidate 144, native-Key five and original-use ten
programs/fifteen refusals. Stored-Key replay explicitly has no fresh native
execution; typed-readiness retains three qualified refusals. Full selected
formal replay passes 477 queries across 23 receipts with sources unchanged.
No new backend acceptance or native implementation proof is inferred.


## Truss draft endpoint/column boundary — 2026-10-09

The existing physical row lowerer only consumes Record-association IR 0.1.
It cannot consume the draft Relationship incidence carrier. A separate portable
bindCandidateSecurityEndpoint component now retains the actual draft endpoint's
lexical slot, nominal Record/Relationship association, role, target and selected
Key label. Raw ordered member fields and graph incidence side stay explicit;
no invented logical Record substitutes for an opaque Relationship. An explicit
caller mapping supplies ordered original target Key fields and native column
names. The result is a copied, deeply frozen snapshot with dense array bounds
and exact namespace/role/target/Key/carrier/arity correspondence checks.

This is preparation for US-056-AC2 physical lowering. It does not satisfy the
required native truss.B01/B02/B03/B13 cases. Target Key field custody, native
column domains/order, original inventory, graph tuple codecs, authenticated
source/cut authority and complete facts remain external obligations. SQL
emission and public compiler activation are not added by this component.

Four actual endpoint terms come from the retained mixed original Rust IR.
The browser harness independently reads their original selected Key fields
from the captured input Document. Compound member reversal, duplicate columns
and Key fields, slot/carrier preservation and copied snapshots have Bun controls.
Astra found a UTF-16-unit limit mismatch. Bounded Unicode scalar iteration now
accepts 4096 supplementary characters and refuses 4097 for role, Key label and
qualified target; lone surrogates refuse. Dense arrays pass 256/refuse 257,
column names pass 63/refuse 64 UTF-8 bytes, and nested reference/carrier/array
accessors refuse without invocation. Original nested mutations cannot change
the frozen output.

Astra independently reruns ten Bun tests/79 assertions and verifies 79 current
browser receipt source pins, without remaining actionable findings. Strict
TypeScript and thirteen real Chromium 153.0.8010.12 controls pass with no host
globals or external requests. The new receipt is retained as
truss-candidate-endpoint-browser.json. Aggregate registration now passes fifty
component groups and all 124 consolidated evidence gates. Existing selected
formal replay remains 477 queries across 23 receipts; no new physical theorem
or native qualification is inferred. Acceptance remains 26/132.


## Truss original draft SQL condition lowering — 2026-10-09

A separate lowerCandidateSecurityCondition component now lowers actual draft
endpoint/intrinsic/Record-own identity conditions, Boolean composition and
nested existence. It retains nominal association namespaces and lexical slots,
uses the shared endpoint mapper, and emits numbered native parameters for
intrinsic Keys. A native CASE/EXISTS fold distinguishes True, False and Unknown.
Scalar fields, constants and context remain unsupported here and refuse, even
inside otherwise false branches. It does not perform the policy effect or
field disclosure fold, install privileges or issue authorization permits.

Astra reproduced a caller-owned array method that changed False to True, plus
getter invocation. A bounded whole-packet data snapshot now rejects caller
methods, accessors, sparse/extra array properties, cycles and unsupported
prototypes before processing. It covers AST/scans/mappings/intrinsics with
4096 nodes, depth 32 and a 4M UTF-16-unit snapshot text budget. SQL expression
work separately bounds 4096 nodes, depth 16 and 250K characters per output.
No total CPU/allocation claim is made.

Astra also reproduced crossed equality from opposite component orders on the
same nominal Key, ignored Record key:null metadata and invalid unused intrinsic
parameters. One coherent ordered Key registry now covers every supplied
endpoint, intrinsic and own-record mapping. Original Record Key ID/ordered
qualified fields and column arity must agree. Eager intrinsic checks use
property presence, so null/false/zero/empty-string carriers cannot be omissions.
Ten Bun tests/39 assertions and strict TypeScript pass, including same-typed
compound reversal, original Key substitution/arity, caller-method false-grant,
getter invocation-zero and all eight falsy binding controls.

The retained truss-candidate-condition.json producer reexecutes both original
mixed/negated authored requests through the pinned Rust binary, checks exact
IR correspondence, reads ordered Key declarations from the original Document
and stores generated SQL/input artifacts. Astra independently verifies all
81 producer source pins and regenerates identical SQL without an actionable
finding. This supports US-056-AC2 implementation work; no required native
Truss graph case is promoted.

An owned PostgreSQL 17.9 fixture executes both actual generated conditions over
eight independently authored schedules, retaining sixteen observations: joined,
split graph, split raw owner, empty owner, empty edge, missing Project diagnostic,
irrelevant Unknown and True after Unknown. Nullable Project carriers deliberately
violate complete logical-Key admission in Unknown diagnostics. They are not
admitted graph facts. Limited bigint Staff samples, synthetic raw projections
and excluded administrator execution do not qualify graph codecs, native
inventory/domains, source/cut custody, ordinary actor RLS, effects/disclosure,
privacy or authorization. The native runner pins the reviewed helper, exact
case plan and every oracle/source input read by its prefix, uses a fixed
relative self-path guard and removes only its generated name/run-label fixture.

Chromium 153.0.8010.12 emits identical SQL for both retained native diagnostic
artifacts, with no host globals or external requests. The native and browser
receipts are refreshed after the aggregate producer's final receipt rewrite.
All 51 component groups and 130 consolidated evidence gates pass. Existing
formal replay remains 477 queries across 23 receipts; native tests do not add
an arbitrary compiler/evaluator/physical refinement theorem. Acceptance stays
26/132. Full scalar/context lowering, typed native graph scans, exact codecs,
complete authenticated cuts, policy folds and physical protection remain required.

## Shared-home typed condition selectors — 2026-10-09

The draft Truss condition lowerer now admits explicit text/int4/int8
association discriminators. Associations sharing a schema/table require the
same discriminator column/carrier and distinct canonical values. Home grouping
uses ordered schema/table values rather than caller object property order.
Integer selectors retain exact decimal strings and native bounds; text literals
escape quotes/backslashes and use explicit C collation. Both True and Unknown
EXISTS legs apply the selector. Separate homes may omit it; that does not
establish exclusive ownership of those homes.

Twelve Bun tests/57 assertions and strict TypeScript pass. The producer retains
four mappings of two actual original Rust mixed/negated requests. PostgreSQL
17.9 observes 32 truth schedules and two missing-selector fault controls: foreign
owner or membership rows produce false grants when the corresponding selector
is deliberately removed. Chromium 153.0.8010.12 regenerates all four SQL strings
with no host globals or external requests. The source-bound closure passes
51 component groups and 130 evidence gates before adding the unbounded fold
proof below. These remain synthetic fact projections, not qualified native
Truss graph scans or ordinary actor enforcement. Acceptance remains 26/132.

### Unbounded typed existential fold analysis

A new retained generator, tools/security/prove-candidate-typed-fold.py, removes
the earlier two-witness bound for conditional typed fold algebra. It quantifies
over an uninterpreted witness sort with arbitrary integer type tags and
True/False/Unknown child truth. Complete shared populations, identical child
truth and faithful logical/native tags are explicit premises. Eight queries
establish fold correspondence, empty-population False, True dominance over
Unknown and isolation of foreign Unknown witnesses. SAT controls demonstrate
false grants without the True selector, false Unknown without the Unknown
selector and false grants without faithful tag correspondence. A nonempty
selected-positive model checks satisfiability.

This is an algebra theorem, not translation of emitted SQL or arbitrary AST
induction. Pinning the candidate module records the associated implementation
revision; it does not prove code-to-formula refinement. Database semantics,
codecs, complete authenticated native facts, RLS and authorization remain open.

Astra identified post-solve SMT serialization introducing undeclared model
constants in SAT receipts. The generator now captures SMT before solving,
fresh-parses and replays each formula, freezes both source digests before
execution and verifies unchanged sources before publication. Astra independently
replayed all eight formulas and checked both source pins; the True-plus-Unknown
and foreign-Unknown hypotheses are satisfiable. No remaining actionable finding
was identified within this conditional algebra and synthetic native scope.
The native mutants remove both existential-leg selectors for each association;
they do not independently isolate True versus Unknown branch errors.

The final stable refresh passes 52 component groups, 485 selected formal queries
across 24 receipts, all 34 native observations, four Chromium SQL correspondences
and 132 consolidated evidence gates. The evidence-gate count is separate from
the 132 required backend cases: accepted backend cases remain 26/132. No new
native Truss graph case, public compiler activation or end-to-end enforcement
refinement is inferred.

## Original scalar/context condition lowering — 2026-10-09

The private Truss candidate condition lowerer now admits required singular
Boolean/string domains with empty facets and no allowed-values constraint.
Record scans declare owner-qualified field columns; subject/resource fields
use owner-qualified native parameters and context fields use a separate channel.
Constants preserve escaped exact text and native Boolean literals. String
comparisons explicitly use PostgreSQL C collation. Opaque witnesses cannot
supply scalar fields. Integer/decimal/binary, constrained or absent-allowed
domains remain refused; extending their exact codecs remains required.

Astra reproduced two contradictions during review: a stored key field could
use a different parameter from its intrinsic Key, and a qualified field could
have conflicting string/Boolean declarations across stored/context channels.
The lowerer now validates a qualified-field domain registry eagerly, including
unused mapping declarations and used terms/constants. Stored Key fields must
use the corresponding intrinsic parameter or record Key column. Raw endpoint
member fields must use the corresponding endpoint column. Context retains its
separate channel, while sharing the field's domain. These checks do not
authenticate field ownership, native metadata or parameter values.

Fifteen Bun tests/76 assertions and strict TypeScript pass, including owner
substitution, undeclared context, duplicate declarations, invalid unused
parameters, bound-record properties, opaque property refusal, Key carrier
contradictions and conflicting qualified domains. The producer sends a new
resourceId/context equality request to the actual pinned Rust compiler and
retains its request, emitted IR, mappings and SQL in scalarArtifacts. It reads
the emitted scalar domain rather than substituting a fixture domain. Existing
four mixed relationship artifacts remain separate from this scalar fixture.

An owned PostgreSQL 17.9 fixture executes the original scalar SQL for matching
values, resource mismatch, context mismatch and missing-context Unknown. The
last deliberately supplies NULL against a required logical domain; it is a
diagnostic, not admitted context. Combined diagnostics now retain 38 native
observations. Chromium 153.0.8010.12 matches all five generated SQL strings
without host globals or external requests. All 52 component groups and 133
consolidated evidence gates pass, with the existing 485-query/24-receipt formal
replay refreshed against the current sources. No scalar code-refinement theorem
or native actor/source/fact admission follows from these checks. Backend
acceptance remains 26/132; the full goal remains open.

Astra's final review reexecutes all five retained original Rust requests and
matches their rules/SQL, checks all current producer/native/browser source pins,
and independently runs the 15 tests/76 assertions. No blocking defect remains
in the corrected declared subset. Native scalar coverage is intrinsic
resource/context strings; bound Record Boolean lowering remains unit-only.
Receipt scope text was corrected to name the new scalar artifact and explicitly
exclude NULL required-context diagnostics from admitted context.

## Exact primitive scalar condition lowering — 2026-10-09

The private candidate lowerer now extends required singular scalar domains to
integer, decimal and binary. Integer literals normalize exact decimal/exponent
tokens using BigInt coefficient arithmetic, without routing values through
JavaScript numbers. Optional integerWidth is bounded to 4096 bits and checks
signed/unsigned literal limits. Unconstrained integers and normalized literal
coefficients are limited to 65536 digits. Decimal domains require precision
1..1000 and scale 0..precision; literal normalization refuses any nonzero
fraction discarded at declared scale or any coefficient exceeding precision.
Numeric SQL uses exact numeric literals and casts without typmod rounding.
Binary constants require even-length hexadecimal octets, normalize case and
use qualified pg_catalog.decode. Empty binary values are retained.

Qualified-field domain coherence now includes integer width and decimal
precision/scale. Other facets, allowed-values constraints, absent-allowed
fields and broader native domain admission remain unfinished. Metadata counts
use safe JavaScript numbers; scalar values and exponents remain exact textual
or BigInt carriers. Tokens and binary hex are limited to 65536 characters;
existing packet/expression/output budgets still apply. Zero with a large
syntactically valid exponent follows the original Rust zero-normalization
behavior. These bounds qualify this draft component, not the full UMF domain.

Seventeen Bun tests/100 assertions and strict TypeScript pass, including
9007199254740993, equivalent exponent forms, a 1001-digit integer, signed int64
extremes, overflow, fractional integer refusal, decimal precision/scale loss,
negative zero, malformed tokens, binary octets and empty binary. Astra reports
475 independent Python Fraction comparisons of integer/width/decimal acceptance
and normalized values with no mismatch. This is independent review evidence;
it is not an added SMT theorem or native source admission proof.

The actual Rust compiler emits five retained scalar fixtures. String/integer
use the original source domains; decimal/binary/Boolean deliberately change
only the salary declaration's scalarType/facets, serialize the edited Document
and recompute its module pin before invoking the original pinned compiler.
The producer retains all request bytes, emitted IR, native mappings and SQL.
The scalar input domains come from actual emitted IR. There are nine successful
producer commands: Bun, TypeScript, two mixed exporter calls and five scalar
exporter calls. Four mixed relationship artifacts remain separate from these
five scalar artifacts.

PostgreSQL 17.9 executes matching, resource mismatch, context mismatch and
missing-context diagnostics for each scalar profile. Exact integer and decimal
controls distinguish adjacent values above JavaScript's safe-integer range;
binary controls distinguish 00ff from 00fe. NULL required context is explicitly
invalid logical admission and remains an Unknown diagnostic. Combined native
observations number 54; Chromium 153.0.8010.12 regenerates all nine SQL programs
without host globals/external requests. All 52 component groups and 135
consolidated evidence gates pass. The selected formal replay remains 485 queries
across 24 receipts, freshly bound to the candidate source revision.

Casts alone do not establish native field/parameter domains: NaN/Infinity,
integer integrality/width, decimal precision/scale and complete required-value
admission must be enforced before protected policy evaluation. Bound Record
scalar columns remain unit-only here. No new backend case is accepted, no
public compiler profile is activated and no code-to-SQL refinement theorem is
claimed. Backend acceptance remains 26/132 and the full goal stays open.

### Retained independent numeric oracle

The independent review oracle is now retained as
 tools/security/candidate-numeric-rational-oracle.py and registered in the
component runner and evidence gate. Its full receipt records 475 authored
integer/width/decimal combinations, 207 accepts and 268 refusals, with independent
Python Fraction comparison of acceptance and every emitted numeric literal.
It freezes the generator, candidate condition module and imported endpoint
module before execution and verifies all unchanged before publication. The
endpoint dependency was added after Astra identified that importing the
condition module also evaluates it. The fixed worktree/self guard prevents
accidental execution under a different runner path. This finite executable
oracle does not prove arbitrary-token normalization, database execution,
physical domain admission or compiler refinement.

The final source-stable closure passes 53 component groups, all 475 retained
rational cases, 54 PostgreSQL observations, nine Chromium SQL comparisons and
137 consolidated evidence gates. Astra verifies all three oracle source hashes
and checks that missing/duplicated case IDs and failed exact-value outcomes are
rejected. No remaining actionable finding was identified. The selected SMT
replay stays 485 queries/24 receipts; the rational oracle is a separate finite
executable check. Required backend acceptance remains 26/132.

## Whole-condition declared-scalar validity guards — 2026-10-09

The draft lowerer now places native validity checks outside the complete
authored condition. All declared scalar parameter mappings must be non-null;
numeric values must be finite, integers integral and within declared width,
and decimals within precision/scale. Selected rows in declared Record scalar
homes are checked with NOT EXISTS over invalid rows before authored evaluation.
The same association type selector limits that preflight to the selected home
population. Invalid declared carriers produce diagnostic Unknown, so authored
NOT, a successful OR sibling or empty existential cannot hide invalid data.
This covers declared scalar mappings, not complete Key/endpoint admission.

Astra identified a decimal evaluation-order hazard: multiplying an extreme
out-of-domain native value before checking range could overflow. A nested CASE
now checks non-null/finiteness/range before scale-integrality multiplication.
The admitted precision/scale bound limits that multiplication. PostgreSQL 17.9
executes 1e131071 on both resource/context sides without overflowing the guard;
guarded results are Unknown while removing the guard makes authored negation
True. This validates these physical execution patterns, not all PostgreSQL
planner/function behavior or a general code-to-SQL theorem.

Eighteen Bun tests/115 assertions and strict TypeScript pass. Four new actual
Rust source/IR guard fixtures cover negated integer, decimal, width-constrained
integer and a raw Record scalar existential alongside authored OR True. The
width fixture deliberately edits and repins salary facets; the other fixtures
retain their previously qualified source domains. Native controls exercise
NaN, both infinities, fractional integers, signed width overflow, decimal scale
and precision violations, extreme numeric values and missing required values
on both intrinsic channels. Removing the guard demonstrates false grants for
non-null invalid numeric carriers. Six valid-domain controls preserve truth.

A raw selected Record with a missing required string produces Unknown despite
OR True; an invalid foreign-type row, empty selected population and valid
selected row retain True. Native observations now number 102. Astra reexecutes
the four original Rust guard requests, matches all thirteen SQL programs and
checks current producer/native/browser source pins. No remaining actionable
finding was identified in this declared-scalar subset. Chromium 153.0.8010.12
matches thirteen SQL programs with no host globals/external requests.

The new prove-candidate-scalar-guard.py retains seven unbounded SMT queries.
Complete stable declared-row populations, faithful logical/native type tags and
truthful native domain-validity results are premises. Parameter validity
summarizes all declared scalar parameters. Queries establish selected preflight
correspondence, invalid preflight preventing True, preservation of authored
truth for valid inputs, selected-invalid precedence over authored True, foreign
row exclusion and a nonempty positive population. A SAT removed-guard control
retains a selected invalid witness and authored True. Frozen sources and fresh
saved-formula replay protect receipt custody. This is conditional algebra;
it does not translate validity SQL or prove numeric predicates, native types,
source completeness, interpreter/emitter refinement or policy composition.

The Unknown result is not an admission permit or authenticated fact. Native
column types/codecs, complete Key/endpoint inventories, source/cut authority,
query/scan integration, policy effects/disclosure and protected backend
execution remain required. Backend acceptance remains 26/132.

Final source-stable refresh passes 54 component groups, 492 selected SMT queries
across 25 receipts, the retained 475-case rational oracle, all 102 PostgreSQL
observations, thirteen Chromium SQL comparisons and 140 consolidated evidence
gates. Astra independently replays all seven new formulas and confirms
nonvacuous foreign-only, mixed valid/foreign-invalid and invalid-parameter
populations. No new required backend case is promoted; the full goal remains
active with acceptance at 26/132.

## Scoped intermediate rule-truth fold — 2026-10-09

A private lowerCandidateSecurityRuleFold now consumes original compiler rule
shapes and shared condition mappings, scopes rules by exact target/action and
materializes every matching rule truth once. Any matching Unknown produces
indeterminate before permit/require/forbid decisions. Otherwise at least one
True permit is required, all requires must be True and no forbid may be True.
No matching rule defaults to deny. Duplicate rule ID/target pairs, invalid
metadata/actions, unsupported effects and nonempty disclosure arrays refuse.
This is an empty-disclosure intermediate truth-fold profile: its permit string
is not an authorization capability and cannot release any output fields.

The whole input packet is safely snapshotted before metadata traversal. All
shared condition mappings are validated even when no rule matches. Output SQL
is limited to 1M characters and rule/action populations to 64; existing
packet/condition budgets apply. Selected rule IDs and output are frozen.
Source authenticity, declared action registry and ontology admission remain
original-compiler/host premises; the helper does not replace them.

Astra reproduced a qualified-field coherence gap across separate rules:
per-condition domain registries accepted an integer and Boolean declaration of
the same qualified field in two otherwise True permit conditions. A shared
selected-condition registry now uses the same domain validator before folding,
so dividing a contradiction among rules cannot bypass validation. Twenty Bun
tests/127 assertions and strict TypeScript pass, including the reproduced
contradiction, target/action selection, duplicate metadata, unsupported
disclosure/effect refusal, getter invocation-zero and frozen matching IDs.

Six actual Rust source/IR fixtures feed this stage. Two add three required
Boolean context fields to Resource, recompute the edited module pin and emit
permit/require/forbid rules in forward/reverse order. Their 27 parameter
combinations use the pinned original Rust composition corpus for final
expectations. A missing shared required scalar parameter deliberately makes
all three condition guards Unknown. These are whole-input validity diagnostics,
not independent per-rule T/F/U combinations. Native receipts now retain actual
per-rule truth values so that distinction is explicit.

Two correlated fixtures instead keep permit/require literal True and derive
forbid from the original mixed raw Ownership/WorksOn condition. NULL Project,
nonmatching Project and matching Project produce independent forbid Unknown,
False and True in both rule orders. Thus True/True/Unknown yields indeterminate,
True/True/False permit and True/True/True deny. Two additional original source
fixtures place the forbid outside the selected action or target; it is excluded
and the matching permit/require remain True. The foreign-target source is
independently typed against Project rather than substituting a Resource binding.
Nullable Project remains deliberately invalid logical-Key admission diagnostic
input; no complete graph fact cut is inferred.

PostgreSQL 17.9 retains 168 matching observations, including 66 fold observations
and explicit rule truth maps. Chromium 153.0.8010.12 matches nineteen top-level
SQL programs without host globals or external requests. Astra reexecutes all
six fold packets through the pinned original Rust binary, regenerates all
nineteen top-level and sixteen selected per-rule programs, and verifies current
82/88/90 producer/native/browser source pins with no actionable finding.

Final stable closure passes 54 component groups, the retained 475-case rational
oracle, refreshed selected SMT replay of 492 queries across 25 receipts, all
168 PostgreSQL observations, nineteen Chromium matches and 141 consolidated
evidence gates. No new SQL-emitter refinement theorem is inferred. Field
protection/disclosure/mask conflicts, authenticated source/context/fact cuts,
ordinary actor enforcement, query/scan integration and backend acceptance remain
required. Backend acceptance stays 26/132; no Truss graph case is promoted.

## Scoped disclosure SQL and conditional disclosure algebra — 2026-10-09

The private Truss candidate lowerer now composes field disposition metadata after
the scoped rule-truth fold. Only matching True permits contribute obligations.
Protected omissions produce indeterminate; explicitly unprotected fields default
to original. Active withholding dominates incompatible transforms. Constant
transform identities use exact numeric normalization and binary octet equality;
equivalent transforms retain the first active original payload. Missing protected
dispositions and conflicts follow requested-field order, matching the inspected
Rust composition implementation. Supplied field ownership, domains, protection,
transform version, output field and literal are checked eagerly, including
inactive rules. The result contains decisions and disposition metadata, not
released field values or authorization permits.

Seventeen retained original Rust compiler packets exercise protected/unprotected
defaults, original/withheld/constant masks, equivalent and conflicting masks,
withholding precedence, inactive/action-excluded obligations, deny/Unknown and
reversed requested-field failure order. Two packets add exactly 100 and 101
unprotected integer fields to the authored Resource and ontology, repin the
document, compile a literal True permit, and request all those fields in order.
These boundary profiles supply the requested field inventory only and need no
scans; they do not claim complete source inventory admission. Astra identified
that the earlier jsonb_build_array emission exceeded PostgreSQL's 100-argument
limit at 101 fields. Ordered JSONB arrays now use to_jsonb(ARRAY[...]); both
boundaries execute successfully on PostgreSQL 17.9 with complete ordered output.

`candidate-disclosure-fold-formal.json` retains twelve freshly parsed/replayed
SMT queries over an unbounded abstract rule population for one requested field.
Eight UNSAT violations establish universal transform consensus versus existential
unequal-pair conflict correspondence, withholding precedence, protected omission,
unprotected default, equivalent masks, original-versus-transform precedence and
inactive-obligation isolation. Three SAT weakened implementations expose omitted
active filtering, conflict-before-withhold and protected-original defaults; a
fourth SAT query retains a nonempty protected-original positive population.
Base policy permit, determinate scoped truth, complete faithful metadata and
exact semantic transform-identity equality are premises. This proves conditional
algebra, not emitted SQL, normalization, field ordering, compiler/interpreter
refinement, authenticated native facts, released values or enforcement.

Astra independently regenerates all seventeen compiler outputs and SQL programs,
checks actual ordered native boundary results, and replays all twelve formulas.
All eight property antecedents are separately satisfiable with an active permit.
Its second finding concerned evidence independence: an artifact-derived boundary
expectation admitted a shortened 101-field fixture. The gate now independently
specifies exact qualified requested-field lists and constant-mask metadata.
Baseline passes; shortened-boundary and substituted-mask gate mutants both fail.
Final review found no remaining actionable defect within the declared scope.

Final stable closure passes 22 Bun tests/140 assertions plus strict TypeScript,
55 component groups, the retained 475-case rational oracle, 504 selected SMT
queries across 26 receipts, 185 PostgreSQL observations, 36 real Chromium
153.0.8010.12 SQL matches and 144 consolidated evidence gates. Sources are pinned
at the producer/native/browser boundaries; no host globals or external browser
requests were observed. Backend acceptance remains 26/132, with no Truss graph
case promoted. The complete goal remains active.

Formal completion still requires the following distinct obligations; passing
algebra or synthetic native diagnostics cannot discharge them:

| Layer | Remaining obligation | Evidence needed |
| --- | --- | --- |
| Logical | General authored condition and disclosure semantics survive compiler normalization and lexical binding. | Compiler refinement beyond selected source fixtures, including refused/unknown constructs and arbitrary admitted AST shapes. |
| Semantic | Physical keys, endpoints, fields, types and mask identities mean the declared UMF facts. | Faithful native codec/identity correspondence, complete authenticated source cuts and independently verified transform equivalence. |
| Physical | Emitted SQL implements the logical rule and disclosure folds. | Translation/refinement analysis covering actual emitted operators, NULL/error behavior and every admitted carrier/profile, alongside native differential cases. |
| Release | Decisions govern actual returned cells and query-use channels through the final authority cut. | Ordinary actor execution, disposition-preserving transport, query-use privacy controls and lifecycle/revocation tests. |
| Backend acceptance | Every required backend case satisfies its original acceptance criteria. | All 132 required cases with current role-specific native evidence and complete AC traceability. |

## Actual parsed rule-decision SQL refinement — 2026-10-09

`candidate-rule-decision-proof-input.ts` regenerates six retained rule-fold
programs from the actual private emitter plus empty selection, then parses both
the full program and its separately returned decision SELECT. The decision AST
must equal the full SELECT after removing its WITH clause; the sole materialized
truth CTE has the original name, ordered rule_index/effect/truth columns and
selected row count. Location annotations alone are removed from retained ASTs.
This connects the analyzed decision expression to emitted SQL rather than a
separately authored algebra expression. It does not establish correctness of the
condition expressions producing the truth CTE.

The pinned parser is @libpg-query/parser 17.6.10 with PostgreSQL AST version
170004. Its observed Bun entry resolves to wasm/index.cjs in the installed UMF
dependency tree. Before dynamic import, the bridge freezes all installed files
in the recursive dependency-package closure, including package metadata and WASM.
Sixteen packages and 406 source pins cover all 25 observed loaded parser JS files;
newly loaded dependency files outside the frozen inventory refuse publication.
Sources are rechecked after parsing. Bun 1.4.2 and parser behavior remain trusted
runtime premises; this does not prove the parser or host runtime.

`prove-candidate-rule-decision-sql.py` interprets the actual retained decision AST
in a closed subset: CASE, EXISTS over the truth relation, total Boolean/NULL
tests, qualified pg_catalog text equality and explicitly C-collated effect
literals. It compares that expression with an independently stated semantic fold
over an unbounded abstract population of complete faithful truth rows, nonnull
known effect tokens and False/True/NULL truth. Eight saved queries establish
correspondence, empty-selection denial, Unknown priority and known no-permit
denial, with nonempty grant/denial controls. Two actual AST mutants remove the
Unknown CASE or invert the required-rule truth test and retain SAT disagreement.
Four executable refusal controls reject absent effect collation, unknown String
members and foreign relations/operators.

Astra identified two qualification defects during review: omitted transitive
parser dependencies and an AST interpreter that tolerated uncollated effects
and unknown identifier members. Both are corrected above. It independently
regenerates/reparses all seven programs, verifies the exact loaded parser closure,
replays all eight formulas, checks nonvacuity and reproduces the four refusals.
No remaining actionable finding was identified in the reviewed proof increment.

PostgreSQL 17.9 additionally executes the actual decision SELECT against all 27
independently supplied permit/require/forbid truth vectors plus empty selection.
The runner retains the executed program and original truth maps. These controls
isolate the decision fold from scalar guards: unlike the earlier shared-invalid
input diagnostics, an Unknown permit can coexist with independently True require
and False forbid. All 28 observations match independently specified outcomes.
The truth relation is synthetic and excludes condition compilation, fact custody
and ordinary actor enforcement. PostgreSQL minor-version parser correspondence
is witnessed for these programs; no arbitrary grammar/version equivalence is
claimed.

Final stable evidence passes 58 component groups, 512 selected SMT queries across
27 receipts, the existing 475-case rational oracle, 213 PostgreSQL observations,
36 real Chromium 153.0.8010.12 SQL matches and 148 consolidated evidence gates.
The previous 22 Bun tests/140 assertions and strict TypeScript remain passing;
the new bridge also passes strict TypeScript. Backend acceptance stays 26/132.
This advances conditional physical decision-body refinement; it does not prove
the AST interpreter's SQL denotation, arbitrary compiler inputs, condition or
disclosure SQL, operator resolution outside the admitted subset, authenticated
facts, released values or authorization. Next bind compiled conditions to
owner-backed native graph sources and their complete validity checks, then
enforce the decisions under ordinary roles through final release. The full
required backend matrix and goal remain open.

Astra's final native/evidence closure independently checks all 27 direct vectors
(19 indeterminate, seven deny, one permit), empty-selection denial, all 213
unique matching observations and 36 browser matches. All current source pins
are fresh: bridge 406, formal 408, producer 82, native 412, browser 414 and
components 960. Its read-only recomputation of all 148 validation checks exactly
matches the retained receipt, including 26 fresh accepted cases of 132 and open
production qualification. No actionable finding remained.

## Native endpoint source-admission strengthening — 2026-10-09

The private endpoint-key source wrapper now requires each original graph endpoint
to exist under its complete native `(id,type)` identity, in addition to its exact
selected Key bucket. Each selected endpoint type must be a live, nonprovisional,
nonretired record. These metadata checks remain global even when the edge
population is empty; projection does not silently filter invalid rows. The host
must still check complete validity and preserve its authority cut before using
the projected facts. No source authentication or execution permit is issued.

The selected native Project is temporarily changed to a constraint-valid
provisional definition within a savepoint. The retained control independently
checks provisional true and four absent definition-source fields, requires
validity false while both original key-projection rows remain, then rolls back
and verifies validity true plus exact restoration of the complete opaque native
type row. An initial flag-only update was correctly rejected by
type_def_definition_source_complete; its corrected form clears the required
definition fields. The next attempt exposed the strict native TEXT row decoder's
NULL refusal; the diagnostic now uses row_to_json text over explicitly TEXT/null
columns, preserving those absences without numeric value conversion. A subsequent
wrapper count still expected 59 observations; it now requires all 70 unique
matching observations before retaining a receipt.

Two further savepoints exercise typed-owner integrity without weakening native
constraints: assigning the existing Project-B ID as Alice's source while keeping
Employee type produces exact 23503/edge_source_fk; assigning Bob's existing ID as
the target while keeping Project type produces exact 23503/edge_target_fk. Both
restore complete opaque edge rows and the full Key-bucket/guard/operation state.
Astra independently decodes the native error journals, verifies no successful
data/command result for either failed mutation, and checks explicit rollback and
release recovery. All 70 graph observations and 768 source pins are current.
The object-existence guard's false branch is not exercised: the intact immediate
edge foreign keys and cascading bucket foreign key prevent preserving an orphan
with a matching bucket. These controls qualify native typed-owner integrity,
not a weakened-profile missing-object test or ordinary actor enforcement.

Ten graph-source Bun tests/39 assertions pass, including exact typed object and
live-record predicate construction; real Chromium matches ten graph-source
constructor/refusal controls against the executed native programs. The first
aggregate passes every command but refuses freshness when its own generators
update two previously captured input receipts. A source-stable rerun passes all
58 component groups and 512 selected SMT queries across 27 receipts. Affected
policy/Unknown/type-selection/native-Key/query-use native receipts and their
dependent browser/refusal receipts are refreshed; the actual condition/disclosure
receipt again passes 213 observations and 36 Chromium SQL matches. All 148
consolidated evidence gates pass. No new formal theorem is inferred from these
source-admission checks.

Backend acceptance stays 26/132, with no Truss graph case promoted. The native
graph stage remains rollback-only with an unchanged bootstrap catalog head and
the ALWAYS initially deferred runtime barrier retained. Its deliberate commit
barrier probe still reports that the complete runtime finalizer is not installed.
This is a concrete dependency for committed-catalog ordinary-role acceptance,
alongside original compiler condition binding, namespace/source/cut custody and
final release enforcement. These dependencies remain implementation work within
the full active goal; the acceptance matrix is not narrowed to this fixture.

## Native opaque-edge source binding — 2026-10-09

The private graph source constructor now represents an explicitly ownerless edge
with `propertyOwnerTypeId: null` and an empty field list. It requires the live
original relationship definition to have no association Record. It preserves
typed endpoints and native row identity without inventing Record fields or a
logical business Key. Object sources with a null owner, opaque edges with fields,
and Record-owned sources with empty field lists refuse. Record-backed edges
cannot pass the ownerless validity check even when their population is empty.
The existing endpoint wrapper retains exact selected Key namespaces, typed
object existence and live Record metadata checks.

Nine added native controls exercise the original installed BareWorksOn
relationship: empty validity/projection, rejection of the Record-backed WorksOn
owner, exact physical and selected-Key projections of a staged opaque edge, and
empty projection plus complete edge and key/guard/operation restoration after
savepoint rollback. The retained PostgreSQL 17.9 graph receipt passes 79 unique
matching observations with 768 current source pins. Native identifiers remain
exact strings beyond the JavaScript safe-integer boundary. This is source
binding evidence; the opaque native row identifier does not become a disclosed
identity or a cross-occurrence logical witness token.

Eleven Bun graph-source tests/45 assertions pass. Real Chromium 153.0.8010.12
passes 15 controls, including exact native opaque base/key SQL correspondence
and all three owner/field-shape refusals. Astra ultra independently regenerated
the opaque SQL, checked all browser and native source pins and reproduced the
refusals, finding no remaining actionable issue within this scope.

The first aggregate refresh times out during acceptance-ledger tests without a
failed assertion; all captured sources remain unchanged. The exact command
passes independently with 118 tests/2312 assertions, and the stable aggregate
rerun passes all 58 groups. Dependent native and Chromium receipts are refreshed;
condition/disclosure replay passes 213 native observations and 36 browser SQL
matches. All 148 consolidated evidence gates pass. The selected formal inventory
remains 512 queries across 27 receipts: no new formal theorem is inferred from
this source-constructor increment.

Backend acceptance remains 26/132 with no Truss graph case promoted. The native
stage is rollback-only, its bootstrap catalog head is unchanged and its ALWAYS
initially deferred barrier still reports that the complete runtime finalizer is
not installed. Original compiler condition binding, authenticated complete fact
cuts, namespace custody, ordinary actor enforcement and final release remain
required implementation work. The full acceptance matrix remains in scope.

## Issued-source condition integration in progress — 2026-10-09

The private condition scan now accepts either a raw table mapping or an immutable
locally issued graph source. Repeated condition/rule/disclosure snapshots preserve
that issuance and charge its SQL text against the packet bound. Copied source
objects, source accessors and mixed source/table homes refuse. Existential scans
and scalar preflight scans use the same projected relation. Every declared graph
source contributes a validity predicate outside the authored expression; invalid
validity yields Unknown even under NOT, beside a True OR branch, or when the
condition does not otherwise scan that source. This preserves fail-closed
composition but does not authenticate the supplied model-to-source binding.

Twenty-four Bun condition tests/151 assertions and strict TypeScript pass. New
controls cover opaque-source conditions, unused-source admission, rule and
metadata-disclosure composition, and copied/accessor/mixed-home refusals. The
existing raw fixture test narrows its raw home explicitly for the new union type.
Astra review and actual native execution of these composed conditions remain
pending. Existing dependent evidence receipts predate these source changes and
must be refreshed before another aggregate closure is claimed. The preceding
148-gate checkpoint is historical, not current evidence for this revision.
No additional formal theorem or backend acceptance case is claimed; the full
132-case acceptance objective remains active.

### Composed native diagnostics and review corrections

The first composed native replay passes 85 observations, including six explicit
truth controls: empty existential False, empty negation True, invalid-owner
negation Unknown, invalid-owner True-sibling OR Unknown, staged opaque existential
True and rollback existential False. These are authored diagnostic expressions,
not an original compiler-to-native graph enforcement qualification.

Astra identifies two defects. Projection SQL was used as shared-home identity,
allowing a base source and its keyed projection to evade the collision check.
A private native population identity now records object/edge kind and exact
native type ID at issuance and survives key wrappers. Identical, keyed and
alternative property projections of one population refuse ambiguous association
mapping; distinct native types remain distinct. The compiler foundation and
independent numeric oracle now include the executed graph-source module in their
frozen source inventories, and the numeric evidence gate requires it.

Twenty-five condition tests/155 assertions, strict TypeScript and all 475 exact
rational cases pass after these fixes. Native replay and final Astra review of
the corrections are pending, followed by browser and full dependent evidence
refresh. The prior 85-observation receipt predates the corrections and is not
current evidence for them. No backend case is promoted.

Astra independently verifies both corrections and all 25 tests/155 assertions,
36 producer runs/83 source pins and 475 rational observations/four source pins,
with no remaining actionable defect within this private conditional scope.
The corrected native replay passes all 85 graph observations, and the dependent
source-constructor Chromium replay passes all 15 controls. Aggregate and other
dependent receipts still require closure; these counts do not establish public
graph policy admission or ordinary actor enforcement.

### Issued-source condition evidence closure — 2026-10-09

Real Chromium 153.0.8010.12 now regenerates the six native-executed graph
condition programs in addition to the fifteen source-constructor checks: all 21
unique observations match. Its entrypoint is the actual condition module with
constructor reexports appended by the retained build plugin; constructors and
lowerer share one issuance registry in the browser bundle. The five-file source
closure includes the native receipt, browser tool and all three portable modules.
Zero external requests are observed. Astra independently regenerates all six
programs, confirms their native journal executions and current source pins, and
finds no actionable issue within this qualified parity scope. Empty, staged and
rollback controls deliberately reuse one program at different native states.

The final stable aggregate passes all 58 groups with unchanged captured sources,
including 512 selected SMT formulas across 27 receipts. Dependent native
policy/existential/type-selection/Key/query-use diagnostics and corresponding
Chromium receipts are refreshed. The actual condition/disclosure native replay
again passes 213 observations with 36 Chromium SQL matches. All 148 consolidated
evidence gates pass. No new SMT theorem is inferred from the composed graph
controls; the existing decision-SQL proof retains its declared truth-row premises.

Backend acceptance remains 26/132, with no Truss graph case promoted. This closes
the private issued-source condition component increment. Original compiler graph
binding, faithful authenticated complete fact cuts, committed catalog finalizer,
ordinary actor query/disclosure enforcement and final release remain required by
the original acceptance matrix; all remain within the active implementation goal.

## Original compiler-to-native opaque membership — 2026-10-09

The shared private request builder authors a draft security 0.2 ontology and
policy against the exact reversible native cohort document. Employee and Project
retain their original primary `code-key` metadata; BareWorksOn supplies source
staff and target project roles with an opaque existential witness. The condition
requires both endpoint equalities on the same witness: staff equals the supplied
subject identity and project equals the supplied resource identity. No native
storage ID is substituted for either business Key.

The native stage independently builds this request from the actual original UMF
interpretation target (core 0.8), invokes the original Rust candidate compiler
binary and lowers its emitted condition over the issued selected-Key source.
Twelve native pair results across three states match independently stated truth
maps: all four Alice/Bob and Project-A/Project-B pairs are False while the opaque
population is empty; only Alice/Project-B is True with the staged edge; all four
are False after rollback. All 88 graph observations pass. The selected namespace
and subject/resource parameters are installer-supplied diagnostic premises;
this is not ordinary actor enforcement or authenticated public graph binding.

Astra finds and closes two custody gaps. The native probe now verifies every
compiler proof source digest and the original executable hash before fixture
creation, then retains the existing post-run source freeze. The standalone
compiler result is captured as an aggregate input and receives both generic
freshness and a gate requiring full request/IR equality with the native result,
qualified status, no native qualification, an opaque witness and nonempty SQL.
Astra independently verifies the original emitted IR and all twelve native
results, preserves the primary Key metadata, and evaluates six gate mutants:
failed status, native qualification, changed request, changed IR, consistently
substituted nonopaque witness and empty SQL all refuse. No remaining actionable
finding is reported within the selected rollback-only scope.

Chromium 153.0.8010.12 passes 22 source/condition checks, including exact original
compiler-condition SQL parity, with zero external requests. Native source closure
has 846 pins; standalone compiler closure has 852; browser closure has five.
The first aggregate passes all commands but refuses freshness when the captured
selector receipt changes. Preparing its inputs and rerunning yields all 59
component groups with unchanged sources. Selected formal replay remains 512
queries across 27 receipts; no new theorem is inferred from this native fixture.
Final dependent condition/disclosure replay passes 213 native observations and
36 browser SQL matches, and all 150 consolidated evidence gates pass.

Backend acceptance remains 26/132 with no Truss graph case promoted. Committed
catalog admission/finalization, authenticated original mapping and complete fact
cuts, broader compiler conditions, disposition-preserving query/release and
ordinary actor/lifecycle qualification remain required by the original matrix.
The complete implementation goal remains active.

## Committed-catalog critical-path audit — 2026-10-09

The next graph acceptance dependency is the complete Truss installation/catalog
admission path. The current native `runtime_operation_commit_barrier` still
unconditionally raises 55000 and explicitly forbids replacing complete
row/non-row/journal/feed proof with a phase flag. Security-only commit enablement
cannot qualify SEC-TRUSS ordinary-role cases or satisfy the complete finalizer.

The current Truss acceptance exit sequence identifies eight incompletely
produced/admitted fields in its seventeen-field report partition:
interfaceVersion, reportProfile, originalExecution, umf, rebinds, assertions,
pending_indexes and extensions. Later report/codec candidates retain their own
versions and complete field sets; this historical partition cannot be treated
as a complete newer-report inventory. Profile byte resolution in
`acceptance-profiles.ts` explicitly supplies custody only, while
`catalog-epoch-context-basis.ts` supplies context4/epoch correspondence without
complete installed admission. Neither can authorize committed catalog publication.

The installed-context admission handoff requires original executor/assembly and
trusted incarnation, committed marker/archive evidence, locked native epoch,
complete current definition/entry/policy/resource inventory, configuration/binding
capture and original actor/origin facts before issuing operation-bound admission.
The acceptance handoff then requires original semantic/assertion producers,
actual rebind/index/lifecycle inventories, complete immutable report/head effects
and full finalization. These are implementation dependencies of the original
security acceptance matrix, not waived requirements or new accepted profiles.
Astra ultra is reviewing the earliest concrete implementation prerequisite in
this chain. No public barrier is weakened and no backend case is promoted.

### Complete assertion producer implementation entry — 2026-10-09

Astra identifies the complete original assertion-inventory producer as the next
implementable dependency. The acceptance handoff permits its A2 work before A1
installation qualification. The existing partial core collector remains
`complete:false`; byte recognition and observed-request coverage cannot replace
complete source membership or admitted enforcement. The destination remains the
complete report0.3 composition, with actual whole-field comparison and native
failure/rollback schedules; the finalization barrier remains until all other
mandatory producers and installation composition qualify.

Implementation starts with an original occurrence census in actual catalog report
preparation. It records every original JSON node, including containers, explicit
null, empty arrays/objects and opaque descendants, preserving original definition
digest, document/module owner and RFC 6901 escaping. Private issuance binds it to
the original preparation, with finite occurrence/depth/path-text bounds. It does
not claim resolved assertion membership or expose a completeness flag. An
independently enumerated 22-pointer original0.7 corpus exercises opaque children,
slash/tilde escaping, null/empty values, exact source ownership and copied custody
refusals; one Bun test/nine assertions passes. Semantic disposition registration,
complete inventory issuance, enforcement joins and exact report0.3 assertion
comparison remain the next implementation steps. Astra review is pending.

Truss source changes make affected native graph receipts stale. The preceding
150-gate closure is historical, not current evidence for the census revision.
The full 132-case security objective and 26 accepted cases remain unchanged.

### Census resource review corrections

Astra reproduces a resource mismatch: UTF-16 pointer length admitted an original
multibyte corpus whose retained pointers total over twelve MiB in UTF-8. The
census now charges UTF-8 bytes before retaining each occurrence. Its oversized
multibyte regression refuses. Additional original-preparation controls pass at
exactly 16,384 nodes and depth64; one extra node and depth65 refuse. The first
single-array node fixture is correctly refused by the upstream 4,096-member
bound, so the exact census node fixture uses four independently bounded arrays
rather than weakening ingress. Two original documents with distinct modules
verify separate indices, definition digests and qualified owners. Five Bun
tests/17 assertions and strict TypeScript pass. Exact UTF-8 byte-budget boundary
coverage and semantic disposition/report integration remain required; this is
not a complete assertion-inventory or native enforcement qualification.

### Exact occurrence reconciliation — 2026-10-09

The independently authored UTF-8 pointer accounting fixture now succeeds at
exactly 4,194,304 bytes and refuses at one additional byte. Its first padding
topology exceeded the upstream accepted-input work budget; increasing the
bounded descendant population reduces source padding without changing either
resource limit. The six census controls pass with 19 assertions.

Truss now joins the original issued census to original issued owner observations
inside actual catalog report preparation. The reconciler derives core assertion
identities itself, matches exact original digest/qualified owner/pointer, refuses
unmatched assertions and copied capabilities, and explicitly maps document owners
to the report discriminator. It never inherits a parent's interpretation for
descendants. The independently expected four inspected assertion roots reconcile;
all other 18 occurrences remain unavailable, including opaque facet descendants.
No metadata classification, opaque boundary admission, complete inventory or
enforcement is inferred. Missing declarations remain separate absence evidence.

Seven Bun tests/27 assertions and strict TypeScript pass. The closed semantic
family profile, original-to-target correspondence, complete nineteen-field
report0.3 comparison and native enforcement joins remain required. Astra review
of this increment is requested. Affected native receipts remain stale; backend
acceptance remains 26/132 and the full goal stays active.

### Original scalar-family disposition entry — 2026-10-09

Astra independently repeats seven tests/27 assertions and finds no reconciliation
custody or correlation defect. Its test portability finding is implemented:
Record, declaration and Field producer directories now use the existing harness
environment inputs, with an explicit dependency-package input. No temporary
directory name or workspace package path is embedded in the test source.

The next executable rule inventories direct original0.7 Field scalarType
declarations. The selected original Record schema's knownScalarType enumeration
and src/model/types.ts SCALAR_TYPES establish nine basic value families; unknown
nonempty tokens remain authored opaque family assertions. Original source
validation and Record profile pins accompany each source digest, module owner
and exact pointer. Known families remain none/unqualified and unknown families
none/opaque. Missing scalarType invents no assertion. Source0.8 is deliberately
left unresolved by this version-specific rule, rather than assuming compatibility.
Native ranges, precision, encoding and temporal behavior remain unqualified.

Actual report-preparation reconciliation now resolves five independently expected
roots in the original corpus and leaves the other seventeen occurrences
unavailable. Eight Bun tests/70 assertions cover all nine known families, an
unknown token, absence, source0.8 non-admission and copied census refusal, together
with the prior exact resource/custody controls. Strict TypeScript passes. The
rule manifest captures its closed selector and selected Record profile; exact
executable semantic-profile registration and the remaining complete families
remain required before issuing a complete report. Astra review is requested for
this increment. Native receipts remain stale; no backend case is promoted.

### Scalar evidence correction and collection-item disposition — 2026-10-09

Astra reproduces quadratic validation-evidence amplification: 300 original
unknown scalar declarations retain over fourteen MiB of decoded evidence when
the full diagnostics repeat in every assertion artifact. The producer now
retains one source-bound validation artifact per document, references its digest
from entries, and charges cumulative artifact JSON UTF-8 bytes against four MiB
before retention. The same 300-declaration regression produces one shared
validation artifact and less than one MiB of retained evidence. Digest references
are independently checked against the original source pin. Exact aggregate-bound
controls and executable profile registration still remain required.

An additional original0.7 family uses the issued Field cardinality observation
with operation inspect-core-cardinality/result4.0.0 to inventory array/map
itemType declarations. It requires exact source, identity, cardinality pointer
and original item value correspondence. Only direct module/element members are
explicit components of that assertion; unknown qualifier descendants remain
unavailable. The first collection fixture correctly fails upstream because it
retains scalar facets on an array; removing those inapplicable facets produces a
valid original collection source without weakening validation. No native shape,
target admission or enforcement is inferred. Ten Bun tests/80 assertions and
strict TypeScript pass. Astra review of both increments is requested. Complete
families/report0.3/native joins remain unfinished, affected native receipts are
stale, and backend acceptance remains 26/132.

### Interpreted facet components — 2026-10-09

The original0.7 facet rule binds the issued Field inspector's exact source,
owner/path and operation inspect-core-facets/result3.0.0. It selects only its
interpreted projection: length/max/unit, integerWidth/bits/signed and
precision/scale. These are explicit components of the retained original facets
assertion, not inferred subtree coverage. Original component values must match
the projection; unknown nested qualifiers and unknown length units remain
unavailable. Four independently authored string/integer/decimal/unknown-unit
specimens verify exact component sets and unresolved descendants. Eleven Bun
tests/92 assertions and strict TypeScript pass. No complete inventory, executable
profile admission or physical enforcement is inferred; Astra review is pending.

Real scalar capacity probes with 3,200 minimal original Fields retain 16,010
census occurrences and 3,795,764 evidence bytes for ten-byte unknown tokens;
forty-byte tokens retain 3,923,764 bytes. Eighty-byte tokens instead reach an
upstream resource refusal, so that refusal is not evidence for the scalar limit.
Astra confirms the shared-validation and collection-item corrections and is
deriving a document-ID-based exact evidence fixture that respects ingress.
Affected native receipts remain stale; backend acceptance remains 26/132.

### Exact scalar evidence bound and Key components — 2026-10-09

Astra independently derives an accepted original0.7 input with document ID
length233, 2,800 minimal unknown-family Fields and 5,203 additional characters
on the last scalar token. The retained artifact JSON totals exactly 4,194,304
UTF-8 bytes with 14,010 census nodes. Three further source characters cause a
four-byte base64-sized artifact increment and the scalar-specific capacity
refusal. Both controls now pass in the harness; neither depends on the producer
choosing its own expected input sizes. The shared-validation, item-reference and
facet-component review has no remaining actionable defect.

Original0.7 Key components now use a closed exact occurrence grammar for
id/name/primary, the fields container, individual references and their direct
module/element members. The original parent assertion and selected declarations
profile are required, with inspect-core-keys/result2.0.0 correspondence. Evidence
decodes once per original issued artifact, avoiding repeated full-source parsing
for every component. An independently enumerated seven-component Key corpus
retains unknown nested reference and primary qualifiers as unavailable and leaves
Record membership unresolved. Thirteen Bun tests/101 assertions and strict
TypeScript pass. Astra review is requested. Complete Record/relationship/extension
families, exact executable profile admission, report0.3 comparison and physical
enforcement remain required; no native receipt or backend case is promoted.

### Original relationship components — 2026-10-09

Astra independently passes the thirteen-test/101-assertion Key increment and
finds no required implementation fix. Original0.7 relationship components now
bind the selected declarations inspector operation inspect-core-relationships
and result1.0.0, checking each issued evidence artifact once per reconciliation.
The closed occurrence grammar selects declared identity/name/direction/inverse,
endpoint arrays and reference module/element/target-key, multiplicity min/max,
target lifecycle and association-record reference. Unknown qualifiers cannot
inherit parent coverage. An independently authored nineteen-component relationship
corpus keeps nested endpoint and multiplicity qualifiers unavailable. Fourteen
Bun tests/105 assertions pass; strict TypeScript passes after retaining the
closed family manifest. The added manifest still requires executable profile
admission and does not establish complete inventory or physical enforcement.
Record membership, extensions, complete report0.3 correspondence and backend
qualification remain required; affected native receipts are stale and acceptance
remains 26/132.


## Owner core0.8 read-only facet prerequisite — 2026-10-09

`inspectCoreFacets` now emits dedicated result4.0.0 for independently authored
core0.8 sources. It interprets length.min/max, collectionSize and exact typed
range endpoints/inclusive flags together with the historical integerWidth and
precision/scale groups. Full source/facet payloads remain attached. Unknown
qualifiers and unknown length units remain partial with original escaped paths.
The dedicated schema admits only inspection, with no legacy-meaning branch.
Authoring remains on historical envelopes. Five historical projection consumers
use an explicit bridge that refuses newer bounds rather than dropping them.

Selected facet and relationship checks pass19tests/1354assertions. The original
facet-only regression passes10tests/1116assertions. New Chromium153 parity
passes10original0.8 inspections,10specific author-version refusals and20JSON/YAML
recoveries with zero accessor execution and no external requests; its receipt
pins the actual bundle, result/core schemas and implementation sources. Historical
facet browser replay passes99cases/62document recoveries/18migration recoveries,
8author recoveries/8prior recoveries/4selection recoveries/15refusals. Library
TypeScript and browser build pass. Initial new fixtures incorrectly used scalar
itemType objects rather than qualified references; corrected without weakening
validation. A strictRequired schema compilation failure was corrected by defining
branch-local bound properties.

Astra relationship/Key review found no implementation defect after independent
15tests/278assertions,36relationship cases and6schema mutants. Its evidence
feedback is implemented: Key browser now actually pins key-operation-v3 and
schema-properties-document, and the relationship author test uses a valid known
request and asserts RELATIONSHIP_VERSION. Key browser refreshed successfully.
Astra facet review identified a public bridge input-boundary defect: caller
accessors could execute before copying. The bridge now snapshots with copyJson
and validates a closed interpreted schema before reading properties. Regression
checks refuse accessors without execution, unknown groups/qualifiers and lone
scale, while accepting empty and valid historical groups. Final TypeScript
(including tools) and build pass; new/historical facet, Key and cardinality
Chromium receipts refreshed against the final built bundle. Astra independently confirms the correction: current focused facet checks pass
3tests/61assertions,5invalid original0.8 source/bound cases refuse and4result
schema mutants refuse; top-level and nested accessors execute zero times. No
remaining implementation defect was established in this scoped review.

These are owner inspection prerequisites for complete original-source assertion
inventory, not database enforcement or an additional formal theorem. Backend
acceptance remains26/132 with no Truss graph case admitted. Native receipts
affected by ongoing source changes require refresh after the profile is complete.

Final post-fix historical projection replay passes20tests/4556assertions across
PostgreSQL, SQLServer, Avro, Parquet and TableSpec projection suites. All test
processes and the four refreshed Chromium runs are terminal-passed.


## Truss explicit original Record/current inspection composition — 2026-10-09

Truss now registers one exact owner inspection snapshot against the retained
original Record bundle, rather than silently repinning Record semantics or
removing the same-source compatibility requirement. The selected snapshot
is d27f40893073ee8e51e1fb3b0af4da8446ba9e76eff35b53330eb5421ac18b2c,
with reproducible minified bundle
8e1cbe761190fc6d3f1af47cf1e88ff1a54e9ba4312c4c0c2fd192de52bb0c42.
The registration binds original c45c72 Record bundle81e99f9a812ad3f61647f0c1d69c8e5640853f876127b7ee25a85efecaf00b68,
all six inspector/result-version pairs for original0.7 and0.8, and original0.8
schema-property inspection. Caller manifests/hashes and copied wrappers cannot
register another implementation. Browser parity checks the exact registered
bundle, not the unrelated full public build.

Original0.8 facets now have one canonical core.facets assertion identity with
both original facet and schema-property evidence; unmatched corroboration and
duplicate source identities still refuse. This addresses the identity collision
that arose after owner0.8 inspection support. Newly reserved original0.7
properties are explicitly tested against promotion through migration.

Astra identified and independently reproduced an inherited cached-path Record
loader defect: newly verified bytes could be paired with previously cached code.
All pinned-function loaders now import their verified bytes directly. The
regression preloads a substituted wrapper, replaces it with exact registered
Record bytes, then verifies zero substituted readDocument calls. Astra confirms
the correction and independently verifies769 source snapshot hashes, deterministic
bundle hashes, qualified multiple-document facet roots and retained unknown data.

Final retained Truss component evidence passes22tests/198assertions and strict
TypeScript with source digests unchanged. Exact bundle Chromium153 parity
passes13 comparisons, zero getter calls and no external requests. See Truss
acceptance-runtime-handoff and its umf-inventory-composition receipts for the
exact pins and command output. This is read-only inspection composition only:
complete original-source inventory, full0.3 report/nineteen-field correspondence,
native enforcement and committed ordinary-writer qualification remain open.
No new formal theorem or backend acceptance follows; acceptance remains26/132.

## Original0.8 assertion/component reconciliation — 2026-10-09

Truss extends its selected original-source rules to original0.8 scalar families,
Record memberships, collection item references, facet bounds, Key components
and relationship components. Each family retains the original source hash,
qualified owner and exact pointer. Version-specific owner results are checked;
original0.7 never inherits newly reserved0.8 facet meaning through migration.
The canonical facet root remains one assertion with both owner observations.

Range endpoint objects and exact integerToken/decimalToken leaves, inclusive
flags, length.min/max and collectionSize.min/max are explicit components only
when present in the owner's interpreted projection. Unknown units and unknown
qualifier siblings/descendants remain unresolved. Declared unknown kind,
nullability and cardinality tokens are opaque assertions, unenforced; missing
and inapplicable observations do not invent assertions. No JS number conversion
of the numeric tokens is involved.

The independent original0.8 fixture enumerates the full expected assertion and
component sets for seven elements plus one relationship, with unknown siblings
and exact large numeric bounds. Final Truss evidence passes24tests/230assertions
plus strict TypeScript, with source digests unchanged during both commands.
Astra independently verifies those results and a mixed-version range control:
the same9007199254740993 token remains unavailable in original0.7 and acquires
exact component meaning in original0.8, with distinct retained original hashes.
No actionable defect was established within this incomplete source-component
scope. The exact registered owner bundle's13Chromium parity comparisons are
refreshed against current component pins.

This is not complete inventory or an additional formal theorem. Total source
disposition (including metadata, references and nested literals), whole-report
capacity, the full0.3 report/nineteen-field correspondence, native enforcement
and ordinary committed runtime qualification remain open. Acceptance stays26/132.

## Closed source metadata disposition prerequisite — 2026-10-09

Truss's actual occurrence reconciliation now includes an explicit source-metadata
manifest under the registered original Record/current inspector composition.
It classifies only declared structural containers/identities, module namespace,
element name/description, version-scoped0.8 title/aliases and vocabulary registry
objects/direct version fields. Unknown children and their descendants receive no
inherited meaning. Extension payload membership remains unavailable. Original0.7
newly-reserved annotations remain unresolved; they are not promoted by migration.

The independent expected metadata set covers all source scopes and an escaped
vocabulary ID. Final retained Truss component replay passes25tests/242assertions
and strict TypeScript with unchanged source digests. Astra independently confirms
those totals and verifies trailing-newline near-match keys remain unavailable.
No actionable defect was established within this closed metadata grammar. Exact
owner bundle Chromium parity is refreshed, qualifying owner inspection only.

Reference assertions, examples and nested constraint literals need separate
semantic disposition. Global report capacity and the complete0.3 report/native
correspondence remain open. Reconciliation still returns complete:false; no new
formal theorem or native enforcement follows. Backend acceptance remains26/132.

## Original generic reference inventory prerequisite — 2026-10-09

Truss's actual reconciler now inventories each indexed generic reference in
original0.7/0.8 sources using the retained original Record validation and source
census. Role/module/element members are explicit components; unknown qualifiers
and descendants stay unresolved. Generic role meaning remains none/opaque,
including record-type labels, without fabricating authored/native Record-type
semantics. Identical values at distinct indices retain distinct identities;
empty arrays invent no reference. Original UMF validation rejects unresolved
targets before this inventory runs.

Final component evidence passes26tests/270assertions and strict TypeScript with
unchanged source digests. Astra independently confirms those totals and checks
4,000 identical references with one original validation artifact and independently
recomputed3,836,895-byte evidence accounting. A longer valid document ID causes
the selected evidence capacity to refuse explicitly. No actionable defect was
established. This per-family budget does not prove aggregate report capacity.

Nested constraint literals/examples, total inventory disposition, full0.3 report
correspondence, installed enforcement and ordinary committed runtime remain
unfinished. No new formal theorem is claimed; backend acceptance stays26/132.

## Original typed-literal disposition and scope correction — 2026-10-09

Truss now walks admitted original0.8 Field literal syntax under exact registered
owner schema-property observations and original source census custody. Explicit
closed scalar/null/array/map traversal retains exact escaped map-data paths.
Default and allowed-value nodes are assertion components; examples are annotation
metadata. Unknown default qualifiers stay unresolved. The original Record
profile refuses collection-valued allowed sets because it lacks exact domain
equality; that refusal is retained, rather than bypassing owner validation.
Nested collection defaults without those sets and nested examples pass.

Astra found a scope-laundering defect: the literal walker and earlier schema-
property assertion selector could apply Field semantics to matching names at
root/module scope despite original-owner UNKNOWN_CORE_FIELD diagnostics. Both
paths now require an exact original element location and explicit Field role.
The negative controls cover examples, default, allowedValues and facets at both
scopes and all their descendants. Astra independently confirms that all28
selected collision nodes/descendants remain unavailable while admitted Field
literals still pass; no remaining actionable defect was established.

Final retained Truss component replay passes28tests/305assertions and strict
TypeScript with unchanged source digests. Exact owner bundle Chromium parity
passes13comparisons with zero getter calls and no external requests, refreshed
against current pins. Literal traversal's16,384-node/4MiB-path/depth64 limits are
local bounds, not aggregate report capacity. Whole-source closure and the full0.3
report/nineteen-field/native correspondence remain open. No new formal theorem
or enforcement qualification is claimed; backend acceptance remains26/132.

## Source-partition closure and conditional gate proof — 2026-10-09

Truss now exposes source `dispositionComplete` separately from unchanged full
admission `complete:false`. Closure requires the exact registered inspection
composition and zero unavailable occurrences. A private source-custody guard
refuses copied results and source reuse against another prepared instance. The
actual report preparation already retains this reconciliation; the marker does
not grant report/native acceptance.

Independent clean original0.7/0.8 fixtures enumerate complete assertion sets and
all source partition counts:46occurrences (10assertions/15components/21metadata)
and57 (12/21/24). Adding an unknown nested property breaks both partitions.
Final retained component evidence passes29tests/325assertions plus strict
TypeScript with unchanged source digests. Astra independently confirms those
totals and six controls for missing observations, cross-preparation reuse and
unknown empty/scalar/container content. No actionable defect was established.

`tools/security/prove-source-disposition-closure.py` binds to the actual selected
Boolean gate source bytes and retains6SMT queries in
`source-disposition-closure-formal.json`:4UNSAT invariants and2SAT counterexamples
for weakened gates. Under an exact total disjoint original-occurrence partition
and faithful classifications, closure requires registration, excludes unresolved
membership and accounts for all occurrences by assertions/components/metadata.
The proof assumes census/partition/classification correctness; it does not prove
those premises, general semantic refinement, report capacity, full enforcement,
publication or native authorization. This is a separate conditional receipt;
it does not silently update the prior consolidated512-query checkpoint.

The remaining report work includes executable inventory profile/correspondence,
aggregate capacity reservation, complete0.3/nineteen-field report production and
native installed enforcement/ordinary committed qualification. Backend acceptance
remains26/132; no Truss graph case is promoted by source partition closure.

### Complete original UMF assertion inventory component — 2026-10-09

Truss now consumes the privately issued closed source partition through a
complete UMF assertion-inventory producer. Its exact profile artifact binds the
semantic-family manifests and registered inspector composition. Original source
artifacts, owner/pointer identities, absence observations and opaque none/opaque
entries survive; copies and cross-input reuse refuse. Present binding artifacts
refuse until binding assertion membership is implemented. The actual report
preparation uses this inventory, but remains a preparation rather than accepted
report production or semantic support-profile admission.

Independent component evidence passes33tests/418assertions and strict TypeScript
with unchanged source digests. Astra found an initial pre-refusal allocation
defect: repeated source artifacts allowed an11,117,740-byte whole-payload string
despite a4MiB output bound. The implementation now charges retained evidence,
entries and dispositions before whole serialization. A genuine400-reference
closed-source regression verifies refusal without serializing the whole
inventory. The full report still needs a separate aggregate pre-effect budget.

Astra also identified an absence-heavy whole-array allocation. Individual
absence observations now charge before retention; the100element/503observation
control verifies that no oversized serialization occurs. Final exact wire size
uses bounded constituent sizes and wrapper/separator/count-field overhead,
without whole-payload serialization. These are implementation tests, not a
formal proof of allocation or size arithmetic.

The conditional source-closure gate proof was replayed against the revised
reconciler and retains its6queries (4UNSAT/2SAT) and explicit premises. It
freezes and rechecks its own generator bytes and retains standard saved SMT plus
fresh parser/solver replay results for each query. This receipt remains separate
from the prior consolidated checkpoint. The proof does
not prove the new inventory producer, capacity implementation, full report or
native enforcement. No backend acceptance count changes:26/132 remains the
qualified checkpoint. The next exit remains the complete independently expected
nineteen-field report, support-profile correspondence and native/public-runtime
qualification under the original full objective.

Astra's final focused review independently confirms33tests/418assertions,
both capacity-refusal controls and all6proof replays with current source hashes.
No actionable finding remains in the private source-inventory scope. This does
not qualify the remaining full report or native enforcement.

### Assertion-field report correspondence — 2026-10-09

Truss now binds the assertion field to exact bytes of its privately issued
complete original inventory. The selected inventory manifest explicitly defines
the compact UTF-8 JSON output digest; this is emitted-byte identity, not semantic
canonical equality. Entries preserve original sources, qualified owners and
pointers, with none/opaque or none/unqualified enforcement. Independent controls
reject omission, duplication, ordering/source/owner/pointer substitutions and
fabricated database/engine classifications. Both0.1 and explicit0.3 wire paths
are exercised while their remaining fixture fields stay untrusted.

Actual report preparation now passes the exact registered original Record plus
inspection composition through the coverage assessor; the prior same-source
version check had blocked that integration. The registered-profile/assertion
path compares twelve report fields; the execution-combined path has thirteen,
with unissued execution custody refusal. These are partial correspondence paths,
not a complete nineteen-field producer or installed support profile.

Astra found direct-helper sparse-array/method and revision-coercion defects;
descriptor-based dense comparison and a strict string revision guard fix them.
Controls require zero supplied getter/method/coercion calls. Final retained
component evidence passes54tests/659assertions plus strict TypeScript with all
968captured source/contract/schema digests unchanged. Astra independently confirms
focused5tests/99assertions and current digests, with no remaining actionable
finding in this scope. Synthetic native read rows are not backend evidence.

Full original support meaning/version-specific subset artifacts, source/report
pre-effect reservation, lifecycle/history/index inventories and installed public
runtime admission remain required. No formal refinement proof of this new
correspondence is claimed. Backend acceptance remains26/132, and the original
full implementation objective stays active.

### Source report preparation ahead of effects — 2026-10-09

Truss extracts the existing source-only report producers into one privately
issued preparation bound to the original input and exact inspection owners.
The new provisional staging composition prepares and requires a closed inventory
before its first database call; report collection can later reuse the original
objects. Unknown membership and genuine inventory-capacity failure each refuse
with zero synthetic native calls. Copies, cross-input reuse and wrong/missing
owner selectors refuse before report reads. This establishes component call
order, not complete report resource reservation or native acceptance.

Retained evidence passes56tests/676assertions and strict TypeScript with985source,
contract and schema digests unchanged. Astra independently passes18focused tests/
336assertions and found no custody or ordering defect. Its missing-executable-pin
finding is fixed by capturing all local PostgreSQL helper source dependencies.
The historical low-level staging helper remains provisional, and the full
public-runtime/finalizer admission barrier is unchanged.

Executable support semantics and distinct version-specific subset artifacts,
every original document's membership, complete report pre-effect reservation,
lifecycle/history/index inventories and native/public-runtime evidence remain
required. No formal proof of this new source-preparation composition is claimed.
Backend acceptance remains26/132 under the original complete goal.

A post-run Astra audit found one external contract edit after capture. The
contract's private receipt-position decoder note does not admit the report path;
the component replay was refreshed rather than retaining stale pins. Final
56tests/676assertions and strict TypeScript pass, and the post-run direct digest
audit matches all985captured files. This refresh preserves the same limited
source-preparation/correspondence qualification.

### Finite dataset owner and resource arithmetic proof checkpoint

Truss now loads the original finite dataset checker/verifier from immutable UMF commit `c7c95e1c4ea5b72541f47fa0350ca467ff02f395` under an exact executable pin. Its component receipt records 60 tests / 693 assertions, strict TypeScript success and 993 unchanged captured pins. Nonempty keys and directed monomorphic independent-lifecycle relationships execute actual owner semantics; source warnings and unsupported association declarations remain visible. Supplied-dataset validity does not establish complete native population, supported backend interpretation or unavoidable enforcement. The existing 132-case goal is unchanged (26 accepted).

`tools/security/prove-inventory-wire-size.py` retains nine source-bound Z3 queries in `../../04-build/evidence/security/inventory-wire-size-formal.json`: six UNSAT properties and three SAT boundary/negative controls. Under explicit faithful charging, JSON encoding and exact bounded integer arithmetic premises, the proof establishes monotone fixed-point size computation, convergence within three recomputations, exact digit accounting and refusal above 4 MiB. It does not prove those encoding/classification premises, full process memory/work bounds, enclosing report reservation, native authorization or publication. This separate receipt is not added silently to historical consolidated proof counts.

### Original compact dataset semantic prerequisite

Truss has now registered a separate exact-pinned compact dataset checker/verifier from UMF `a95c3ec18a8f904decde884a4fa252988d2a5b0f` (experimental CONTRACT-056). Its shared original source avoids repeated-source output growth without removing declarations, diagnostics, residuals or global supplied-dataset checks. A nonempty40-record/20-relationship component remains one dataset, succeeds compact validation/recomputation and exceeds the historical full receipt guard. Expanded compact fragments match original full Record/Key/endpoint results on the smaller fixture. Retained Truss evidence passes64 tests/728 assertions, strict TypeScript and998 unchanged pins; both full/compact exact bundles have Chromium receipt parity and original verifier evidence. Source0.7 transition admission, association/lifecycle meaning, native population completeness, backend support and all-writer enforcement remain required and unqualified. No change to26/132 acceptance.

### Source-bound dataset custody checkpoint

Truss's original compact dataset evidence now carries exact prepared document membership and original source artifact custody. Its private guard binds the issuing preparation, loaded original owner and document index; copies, cross-preparation reuse and unqualified original0.7 transitions refuse. Complete original unsupported source declarations remain visible, and receipt/input copies are immutable. This provides per-document supplied-dataset evidence, not independently collected native population or backend support. The retained component checkpoint passes67 tests/746 assertions plus strict TypeScript with1000 unchanged pins; the historical capacity negative control now requires its exact LIMIT reason. Full source-to-native refinement and the original132 acceptance cases remain required (26accepted).

### Source interpretation refinement regression

Astra's executable review counterexample removed an original required WorksOn declaration through a self-consistent replacement historical Record parser. The original artifact remained intact, but genuine compact validation of the substituted source could report a dataset complete. The new source-bound dataset wrapper now requires the exact registered original Record profile in both issuance and custody checks. The retained regression demonstrates the original-invalid/substituted-complete verdict difference and gate refusal. Current component evidence passes68 tests/752 assertions, strict TypeScript and1000 unchanged pins. This establishes a necessary source-interpretation binding control; native population completeness, authenticated cuts and unavoidable writer coverage remain separate proof/test obligations.

### Native visible owner enumeration and physical semantic mismatch

A new internal Truss PostgreSQL invoker-visible inventory retains all object/edge typed identities and endpoints without inner joins, counting bounded population before output and refusing overflow instead of truncating. Six owned PostgreSQL17.9 observations are retained in `../../04-build/evidence/security/truss-visible-owner-inventory.json`. They cover kind/discriminator collisions, exact large textual ID,1000/1001-object boundary,10001-edge refusal and an RLS role whose visible edge has invisible endpoint owners. Invoker-visible inventory is not complete population evidence: assessor visibility, exact source mappings, coherent cuts, property/presence/key collection and unavoidable writer coverage remain required.

The same original qualified-property0.15 owner export rejects a parallel relationship with identical endpoint IDs via edge_out uniqueness23505. The native layer therefore cannot claim the original compact owner's parallel-occurrence semantics under that layout without an explicitly designed physical change and corresponding qualification. Retain the unsupported meaning; do not silently collapse logical occurrences. No native backend acceptance case is closed by these observations (26/132 unchanged).

### Volatile visibility resource counterexample

The initial native inventory count/rescan resource gate was insufficient under volatile RLS. Astra's proposed nextval policy was exercised on PostgreSQL17.9: a double-scan mutant counted zero objects and later emitted1001. The corrected native producer buffers each bounded typed-ID projection once, checks its captured count and emits the same rows. The final native receipt retains10 observations (including exact10000-edge success and ordinary42501 denial),9 current frozen source/plan/closure pins and exact negative error/output controls. This removes a concrete physical resource bypass without assuming stable RLS predicates. It does not establish complete visibility or bounded policy evaluation cost; those remain admitted authority/resource requirements.

### Captured row-count formal admission

`tools/security/prove-visible-owner-inventory-bound.py` binds the corrected native SQL and retains seven fresh-replayed SMT queries in `../../04-build/evidence/security/visible-owner-inventory-bound-formal.json` (four UNSAT, three SAT). The proof establishes individual and combined admitted output bounds and overflow refusal under explicit faithful bounded-buffer/emission premises; it includes exact/empty satisfiability controls and a satisfiable later-scan overflow mutant. SQL execution correctness, bytes/work, RLS policy evaluation cost, source/cut authority and complete visibility are not proven. Astra independently reviewed the associated10 native observations and9 source pins with no additional actionable finding. Acceptance stays26/132; these component properties do not replace full source-to-native refinement.

### Visible native owner wire interpretation

A browser-compatible Truss decoder now retains original visible-owner wire text, exact textual IDs and typed owner/endpoint identity, rejecting duplicate JSON members, numeric nodes, malformed rows, wrong native ranges, duplicate typed objects/global edge IDs and count overflow. Hidden endpoint owners are not dropped or declared complete. A separate fixed JSON resource profile admits larger owner arrays without changing historical acceptance-wire limits; byte/node/work ceilings remain conjunctive with row-count bounds. The retained component suite passes93 tests/832 assertions plus strict TypeScript with1005 unchanged pins, including22 historical scanner tests. Decoder browser parity and original native wire/cut/source correspondence remain unqualified. Backend acceptance stays26/132.

### Reviewed owner decoder browser parity

The original native inventory samples now have full Bun/Chromium decoder parity: two accepted populations and three malformed/duplicate refusal cases. Truss `visible-owner-browser.json` retains verified native receipt/closure pins and a served bundle built from isolated hash-verified source copies. Astra's independent decoder review found no actionable defect; signed carrier and exact2MiB boundary controls are now retained in the94-test/835-assertion strict-TypeScript component receipt with1006 unchanged pins. These establish portable visible-wire interpretation only, not fresh native collection, complete authority/cut/property/source refinement or accepted backend coverage.26/132 remains unchanged.

### Retained native wire to portable interpretation

The visible-owner probe now captures556 exact native psql UTF8 stdout bytes (including trailing LF), hashes them and invokes a decoder from frozen source copies. Decoded originalText/hash/rows equal that native capture. Chromium's first positive decoder case consumes the same verified retained bytes; parity remains2 accepted/3 refused cases. Native receipt retains12 source/closure pins; aggregate component evidence remains94 tests/835 assertions with strict TypeScript and1006 unchanged pins. This is an original visible-row text interpretation link, not PostgreSQL protocol attestation, admitted assessor authority, coherent cut or complete source/property/key population.26/132 remains unchanged.

### Binary capture and observation binding correction

Astra's wire-link review required replacing helper text-mode re-encoding with binary stdout capture and rejecting wire that merely hashes itself. The native probe now retains raw binary stdout before strictUTF8 decoding, checks the original digest before portable parsing and exercises truncation plus valid-byte substitution refusal (12 native observations). Browser qualification compares decoded hash/text/rows with both retained native expected/observed population and decoder receipt, refusing an empty-array mutation even when its wire and decoded fields agree internally. Chromium2accept/3refuse and94-test/835-assertion strict-TypeScript evidence remain green with1006 unchanged pins. Visibility/source/cut/full population remain separate unqualified obligations;26/132 unchanged.

### Parallel relationship preservation analysis

The retained `parallel-relationship-preservation-formal.json` analysis uses Z3
4.15.4 and eleven replayed queries. For one fixed typed endpoint/relationship tuple,
collapsing a bag to presence preserves tuple-only existence (UNSAT violation),
and preserves counts if the original tuple has at most one occurrence (UNSAT).
SAT witnesses demonstrate lost occurrences, false admission of a maximum-one
bound, false refusal of a minimum-two bound, and lost membership when the
retained representative is inactive while another original edge is active.
The existence theorem explicitly excludes edge identity and attributes.

This models hypothetical deduplication, not the current native behavior: the
source-pinned qualified-property0.15 `edge_out` unique index rejects the second
same-tuple insert. Native rejection is already retained in the visible-owner
probe. Truss's relationship binding proposal explicitly requires counting edge
occurrences. Therefore a compiler must preserve occurrences in a qualified
physical profile or refuse incompatible source/dataset admission. Silent
canonicalization cannot bridge this gap. No layout constraint is removed by
this analysis; no native/backend acceptance is added.

The original compact dataset producer at a95c3ec18a8f904decde884a4fa252988d2a5b0f
counts **distinct related Records**, not edge occurrences, for multiplicity:
`src/model/dataset-values.ts` builds outgoing/incoming Sets of opposite endpoint
instance IDs and checks their sizes. A Truss source-bound regression preserves
two distinct same-tuple edge identities and confirms that maximum-one still
passes this UMF operation. This is faithful pinned-producer behavior, not evidence
that Truss's occurrence-based participation requirement passes. The earlier
formal maximum/minimum witnesses apply to occurrence bounds explicitly; those
bounds cannot be inferred from this UMF receipt without a separately specified
semantic composition. Both meanings must remain explicit. The five source-bound
dataset tests pass with29 assertions; the historical aggregate receipt predates
this added test and must be rerun before a current aggregate claim.

Astra ultra identified that the formal receipt itself also needed an explicit
occurrence-bound premise. That premise is now retained: the false-admission and
false-refusal controls are **Truss occurrence-count profile** witnesses, not UMF
multiplicity defects. The analysis now has eleven replayed queries. General
count-transfer checks establish that an occurrence maximum implies the same
distinct-record maximum, and a distinct-record minimum implies the same
occurrence minimum. Both converse implications have SAT counterexamples.
Complete equality follows only under the separately established no-parallel
premise. These conditional implications do not supply native mapping evidence.

The original Truss component runner was executed afresh after the new regression:
95 tests /841 assertions and strict TypeScript pass, with unchanged captured
sources. It does not close a backend acceptance case. Explicit count semantics,
no-parallel qualification or separately enforced native occurrence bounds must
precede any use of the dataset receipt for physical admission.

### Source-bound endpoint uniqueness inspection

Truss now provides `inspectOriginalDatasetEndpointUniqueness`, requiring the
privately issued original dataset receipt and its exact preparation/owner/index
custody. Incomplete or invalid receipts refuse. Inspection uses the producer's
resolved relationship identities and endpoint instance IDs, not consumer input
labels or unresolved target keys. Every parallel occurrence is retained with its
first and subsequent edge identities; frozen results preserve original artifact
and producer correspondence. This detects supplied-dataset incompatibility with
an endpoint-unique representation without losing meaning.

It does not prove complete native population, native ID mapping, count-domain
composition, future writer uniqueness or physical admission; both native and
admission qualification flags remain false. Tests include three same-tuple
occurrences, one unique occurrence, copied/foreign custody and unresolved original
association meaning. Fresh aggregate component checks and strict TypeScript pass.
Astra ultra review is requested before integration into a native admission path.

Preflight placement review: `stageNewCatalogCohortWithSourceReport` stages original
schema declarations, property homes and keys; it has no supplied dataset or native
population collector. Inserting endpoint inspection there would falsely couple
schema-only staging to a sample dataset and still fail to establish native
integrity. The inspection belongs in dataset/native-population correspondence
before physical admission, after original endpoint/key resolution and complete
population custody. Existing staging remains provisional, and finalization stays
closed until that path is qualified.

Additional controls independently confirm that different relationship domains
and distinct resolved target Records do not produce false tuple conflicts. Fresh
aggregate execution passes97 tests /855 assertions and strict TypeScript with
unchanged captured sources. These controls exercise the supplied-only diagnostic;
complete native integrity visibility and future writer closure remain required.

### Candidate unfiltered-owner prerequisite

Truss's new `dataset-unfiltered-owner-inventory.sql` is a SECURITY INVOKER SQL
wrapper with fixed search path and `row_security=off`. It does not acquire bypass
authority: an identity subject to RLS must refuse rather than silently return a
filtered integrity population. PUBLIC execution is revoked. The original bounded
single-capture collector and visible-only scope remain separately available.

The initial owned PostgreSQL17.9 run contained14 observations with13 source pins; the later eighteen-observation checkpoint below supersedes its count.
An ordinary fixture role with SELECT and execution of both routines refuses42501
`query would be affected by row-level security policy for table "object"`, with
empty output. The excluded administrator obtains exactly the original typed
four-owner inventory. Raw binary-wire custody and decoder controls remain, and
Chromium153.0.8010.12 replays2accepted/3refused outcomes against the fresh receipt.

This is a candidate unfiltered projection prerequisite, not authenticated complete
population admission. Installation/role/dependency closure, private protected
integrity identity, original cut/epoch, all property homes, source-to-native mapping
and future writer enforcement remain open. No backend acceptance case closes.
Astra ultra review is requested.

The expanded native collector run now passes16 observations: separate object-RLS
and edge-RLS controls each refuse42501 with empty output. An ordinary fixture
NOSUPERUSER/NOBYPASSRLS role with explicit grants obtains exact owners when both
RLS policies are disabled; no bypass privilege is granted. Object RLS is restored
before the existing volatile-policy controls. Chromium byte correspondence is
refreshed against this source-current receipt. These remain SET ROLE fixture
controls, not authenticated integrity identity qualification. Astra independently
verified the supplied uniqueness tests and all eleven retained formulas; its
unfiltered native-wrapper review remains pending.

The source-current native checkpoint now has18 observations. Temporary table
ownership under non-forced RLS returns exact owners; FORCE ROW LEVEL SECURITY
then makes that same non-superuser owner refuse42501 with empty output. Ownership,
non-forced RLS and the original explicit SELECT grant are restored before the
remaining controls. The first attempted expanded run failed because ownership
transfer removed the old explicit-grant path on restoration; the fixture now
restores that grant and the fresh full run passes. Owned cleanup completed for
both attempts. This reinforces why role/owner/FORCE state must be part of native
installation custody. Astra's prior sixteen-observation review found no actionable
implementation defect; review of the two additional controls is pending.

### Installed collector correspondence

The source-current owned PostgreSQL17.9 probe passes20 observations. Native
pg_proc enumeration for both collector names retains exact installed body text,
SECURITY INVOKER mode, configuration settings, owner and absence of PUBLIC
execution. The expected bodies are extracted from the frozen source files used
for installation. Any additional overload sharing either selected name enlarges
the observed array and refuses the exact two-routine correspondence.

A rollback-isolated control replaces only the unfiltered body with a false-filter
query while keeping its routine name and authority settings. Exact correspondence
rejects that body, matches the independently authored mutation and confirms
rollback restores both original routines. This detects source drift; it does not
prove semantic correctness of the SQL, native dependency resolution, installed
identity authentication, complete schema inventory or public admission.

Astra ultra verified the prior eighteen-observation owner/FORCE-RLS checkpoint
without actionable findings. Review of these two installed-source controls is
requested. Backend acceptance remains26/132.

### Authenticated native collector actors

The fresh native checkpoint passes24 observations. Ordinary execution/refusal,
RLS/forced-owner and volatile-visibility controls now use authenticated TCP
connections, replacing SET ROLE from the excluded administrator. The owned
container explicitly selects SCRAM host authentication. Each actor has a fresh
private password transmitted through stdin; credentials are excluded from source
pins and receipts. Native session_user/current_user match the actor, host(client
address) is127.0.0.1 and superuser/bypass flags are false. Independent wrong-password
connections refuse with empty output, showing that successful connections are
not a trust-authentication artifact.

Two interim attempts failed on the address assertion because inet::text retains
its /32 mask; the corrected assertion uses native host() and the complete fresh
run passes. Owned cleanup completed after every attempt. Exact source/body and
RLS controls remain intact; the browser correspondence receipt is refreshed.
This qualifies these fixture actor connections, not a protected integrity service,
complete authenticated authority cut or full backend acceptance. Astra review of
the authenticated controls is requested; prior20-observation review was clean.

### Executable routine metadata and overload controls

The current collector fixture checkpoint passes26 observations. Installed routine
correspondence now additionally retains original identity arguments, TABLE result
signature, language, volatility, parallel mode and set-returning flag. The two
zero-argument routines are SQL/plpgsql, STABLE, PARALLEL UNSAFE and set-returning
with the exact seven text output names/types. These native descriptors supplement
exact body, owner, invoker/configuration and PUBLIC-grant evidence.

One transaction mutates only the unfiltered routine's volatility to IMMUTABLE,
definer mode to true and parallel mode to SAFE. Exact metadata correspondence
rejects it and verifies rollback. A separate transaction adds an integer-argument
same-name overload; complete ordered enumeration detects the third descriptor,
including its default PUBLIC grant, then verifies exact rollback. Both controls
retain authored expected and actual descriptor arrays. The browser receipt is
refreshed against this checkpoint. Native dependency/role/cut closure and complete
population admission remain open; no accepted backend case is added.

### Native property transport boundary

The current owned PostgreSQL17.9 checkpoint passes28 observations. A
rollback-isolated update to the actual object.props JSONB column confirms absent
and explicit-null presence differ, null transports as exact text `null`, the
integer9007199254740993 remains exact, and numeric1.2300 preserves native scale.
Exponent1e3 transports as native text1000: original lexical notation is not
recoverable from this column. Numeric tokens are captured as strings inside the
observation envelope, preventing host JSON number rounding.

A separate negative witness demonstrates that original duplicate-member text
{"x":1,"x":2} becomes the same native JSONB value as {"x":2}. Consequently
native property collection can attest admitted native value semantics, never
original token/member/formatting preservation from JSONB alone. Original source
bytes and uniqueness admission must be separately retained before this cast;
complete dataset/property correspondence must identify which representation it
proves. These observations do not qualify an all-home property collector or source
custody. Browser wire correspondence is refreshed; no acceptance case closes.
Astra's prior26-observation descriptor review is clean; these two property
controls await review.

### Protected-field query fixture source/readiness correction

Review of the still-unregistered pg-raw.B08 path found the existing mask-query
component used pg_isready and installed SQL by rereading it after source capture.
It now requires authenticated TCP readiness, freezes the original helper case
source closure plus plan/oracle and native fixture SQL, verifies helper
correspondence and installs that frozen SQL. Final unchanged-source checking
covers the expanded closure. The fresh owned PostgreSQL17.9 replay passes57
observations, retaining filter/sort/group/join/aggregate, empty selection,
prepared-plan grant revocation and weakened pre-mask hidden-value inference.

The original B08 acceptance obligation additionally requires exact source-bound
separate actions, changed bindings and incomplete dependency refusal before
execution. Those compiler/profile-lineage obligations are not supplied by these
fixed views and remain unregistered. This run strengthens executable evidence,
not a substitution of native grants for the required semantic action model.

### Actual original-action native replay custody

The actual original compiler-to-Truss query-use probe had the same temporary
pg_isready/read-after-capture gap. It now freezes all explicit consumer sources,
reused fixture/plan/oracle closure and the original Weft foundation's source
closure, checks foundation bytes are unchanged during capture, installs frozen
native SQL and requires authenticated TCP readiness. The existing independent
foundation hash checks remain mandatory; no producer pins were silently updated.

Fresh PostgreSQL17.9 execution passes418 observations: original operator/action
lineage lowers through the actual portable Truss consumer into private native
routines; compiler-derived membership and separately bound resource-independent
original-value authorization precede execution even for empty results. Exact
signed64 source/output, private carrier denials, unrelated profile refusal and
release controls remain scoped to the authored fixture. Public compiler issuer,
complete privacy/dependency closure and generalized backend B08 admission remain
open. Astra verified the separate57-observation mask fixture custody fix; this
expanded actual-owner replay awaits its review.

### Issued pre-execution query check emission

The actual portable Truss consumer now privately registers each immutable lowered
original-use program. `lowerOriginalUsePreExecutionChecks` emits action-admission
checks followed by source-completeness checking only for that issued program;
copied programs with removed admission arrays refuse. This is lowering custody,
not authenticated compiler provenance or native authority. Cut/publication guards
remain separate mandatory installer obligations.

The original-owner bridge emits these checks, and the native probe installs that
output before application SQL. Independently authored expected check text must
match, and all ten nonempty/empty programs exercise copied-program refusal. Fresh
PostgreSQL17.9 execution passes438 observations. Strict TypeScript passes; real
Chromium153.0.8010.12 matches all ten native programs and15 refusal controls,
including issued check text and copied-program refusal without host globals or
external requests.

Astra identified an omitted runtime dependency: authority-guard imports UmfError
from src/model/types.ts. That dependency is now frozen and source-pinned, and the
complete native438-observation run was replayed after the correction. No upstream
foundation hash was donated or repinned. Issued-check emission and the corrected
closure await review; public issuer/dependency/privacy/backend B08 obligations
remain open and acceptance remains26/132.

### Evidence audit after issued query check integration

The fresh Truss aggregate component run passes97 tests/855 assertions and strict
TypeScript. The complete security evidence validator initially reports18 failures
among150 checks. Rather than rewriting retained hashes, the changed-source
mask-query, original-source-completeness and carrier-error-isolation proof tools
were executed again (5/4/4 conditional checks), and typed-query readiness replay
again observes all three required unsupported-carrier refusals.

The retained-formula auditor then replays545 formulas across31 receipts, including
the new wire-bound and parallel-preservation analyses. Its qualified scope is
parser/solver agreement for recognized retained formulas, not proof of assumptions
or implementation refinement. The full validator now reports13 failures among150
checks; graph/admission/component/key/readiness/browser and the historical B07
case freshness remain open. No receipt was silently repinned and no complete
acceptance criterion was closed.

Astra ultra independently regenerated all ten issued query programs and120
ownership/reflection controls, found no actionable issuance defect, verified438
native observations/84 current pins including UmfError, and confirmed current
browser10matches/15refusals. Local issuance still does not authenticate the compiler
or native authority. Full backend acceptance remains26/132 and the goal is active.

### Fresh acceptance replay after source migration

Fresh registered pg-raw.B07 native execution passes and retains current source
pins, but the aggregate acceptance.json still references its older execution
fingerprints; the broader validator correctly refuses that historical gate entry.
The original complete acceptance runner has therefore been started afresh, with
all132 required cases unchanged. Required unimplemented cases must remain red;
this run does not redefine acceptance around registered runners. Previously
reported26/132 is the earlier aggregate checkpoint until the new gate completes.

Additional fresh tooling executes54 association-transport formula queries, three
Weft admission checks with canonical-schema equality,17 native key-transport
observations and23 native key-namespace observations. These preserve their explicit
subset/authority limitations and require downstream browser/candidate replays
before broader freshness claims. Retained-formula replay again passes545 formulas
across31 receipts. No source hashes were simply rewritten to refresh receipts.

### Completed freshness replay and acceptance boundary

The complete acceptance runner is terminal: 26 registered cases execute and pass,
while 106 of the original 132 required cases lack reviewed runner/oracle/
implementation bindings. The aggregate remains failed. None of the 28 complete
acceptance criteria is closed by this checkpoint.

Four stale graph/selector receipts traced to the changed Truss operation-control
declaration. Fresh execution, rather than hash replacement, restores the native
rollback-only staging evidence (88 observations), public compiler source refusal,
draft condition IR and selector analysis (14 checks). The component suite passes
59 command groups. Chromium 153.0.8010.12 passes 144 association checks, 33
relationship checks and 22 graph-correspondence checks. After regenerated proof
inputs, fresh PostgreSQL 17.9 candidate-condition execution passes 213 observations
and Chromium matches all 36 retained condition artifacts.

The final evidence validator reports 150 checks with zero failures. This proves
the validator's scoped receipt checks and freshness predicates; it does not
replace the failed 132-case acceptance gate, authenticate compiler/native
authority, admit the graph binding or prove implementation refinement. The active
goal retains all backend, lifecycle and public activation obligations. The next
implementation work must close those obligations with exercising native runners,
not promote these component receipts into backend acceptance.

### Issued preflight and application return fragment

The portable Truss consumer now exposes `lowerOriginalUseTextRowsReturn`, which
requires the privately issued immutable program before reading its properties.
It emits the original-action checks, complete-source check and captured query as
one PL/pgSQL return fragment. Each output cell uses an explicit native text cast
before JSONB wrapping. The native installer supplies the enclosing epoch/lock and
error-normalization boundary; the fragment does not authenticate compiler or
native authority and does not supply publication custody.

Fresh PostgreSQL 17.9 execution passes 489 observations across twelve populated/
empty programs. Expected return fragments are independently reconstructed before
installation. Copied programs with substituted SQL/admission refuse. Astra's
review requested positional coverage; an original-compiler query selecting
resourceId and SUM(salary), grouped by resourceId, now exercises distinct cells,
signed64 extrema and the empty result. Chromium 153.0.8010.12 matches all twelve
programs and fifteen refusal controls; strict TypeScript passes. Four conditional
source-completeness and four carrier-isolation checks replay, and the formal
auditor again passes 545 formulas across 31 receipts.

The broader validator now has five stale component/graph/selector checks because
their source closures include the changed consumer; the prior 150/150 checkpoint
is historical. Those dependent native/component replays remain required. No full
B08 or graph/backend criterion closes, and acceptance remains 26/132 with the
original 106 unimplemented required cases preserved.

Astra independently replays both two-column original compiler requests and the
Truss bridge, verifies all 489 unique native observations/84 current pins and
twelve browser matches/fifteen refusals/five current pins, and reports no
actionable defect. Its earlier independent checks cover 110 forged/copy/proxy/
primitive refusals without getter access, 30 immutable-state mutation refusals,
two/32-output host acceptance and 33-output refusal. These controls qualify the
private emitter, not public compiler authentication or production admission.

### Dependent replay after issued-return implementation

Fresh rollback-only graph staging passes 88 observations against the changed
consumer source. Original public compiler refusal, draft condition generation and
14 selector checks replay before the 59-group component suite. Chromium then
passes 22 graph-correspondence, 144 association and 33 relationship checks.
Regenerated condition proof inputs receive a fresh PostgreSQL 17.9 replay with
213 observations and Chromium parity for 36 artifacts. The final broader evidence
validator reports 150 checks with zero failures.

The issued-return native receipt independently retains twelve programs and 489
unique matching observations with all original source pins current. This restores
the dependent freshness checks recorded as stale above without replacing source
digests by hand. Acceptance remains 26/132; the original compiler's unsupported
graph source outcome remains a refusal. Complete installed profile admission,
original source/assertion producers and protected atomic publication are required
before graph/backend acceptance can close. No component total substitutes for
those production obligations or the 106 unimplemented required cases.
