# Action requirements/design review — 2026-10-08

Scope: FR-45, FEAT-008, US-055, CONTRACT-052, SD-008, TD-055 and STP-055 in the
owner-requested `actions-requirements-design` worktree. This records document
review, not implementation execution or artifact approval.

## Reviewed Decisions

- Independent `umf.actions` 0.1.0 proposal over local core 0.8.0 references;
  no core admission, DDD reinterpretation or dependency on unfinished US-050.
- First library slice authors/inspects declarations and compares exact supplied
  executor claims. It does not evaluate expressions, invoke handlers or write.
- Ordered closed effects, explicit-key creates, optional caller replay key,
  required human attribution/role policy and single-store atomicity obligations.
- Unsupported domains/layouts, native side effects and relevant unknown content
  cannot silently acquire support through report mode or a handler fallback.
- Instance set semantics apply only to this action profile without association
  Records. Association identity and core multiplicity remain distinct.
- Exact source snapshots qualify profiles; evidence locators are inert and
  self-declared. Compatibility is not verified execution or authorization.

## Review Corrections

Placed FR-45 in Extensions and Partial Participation and its coverage matrix.
Kept requirements, interface surface, feature design and story implementation
in their respective artifacts. Made obligation IDs absolute document pointers
with deduplicated dependencies. Distinguished missing profile claims from
invalid duplicate/extra claims and unknown future effect variants from malformed
known effects. Preserved original frontmatter, upstream IDs and source proposal.

## Document Checks

Six new artifact IDs are unique; their frontmatter links resolve. Relative file
links resolve. All eight ACT requirements map to SD-008; all nine US-055 criteria
map to planned tests with canonical citations. The contract JSON example parses.
`git diff --check` passes. These checks establish document consistency only.

## Remaining Qualification

All action tests remain planned/UNTESTED and all artifacts remain draft. No
package, schema, public API, executor or passing runtime evidence is delivered.
Contract/interface review and existing current-core acceptance qualification
precede library acceptance. Executor/store, role/rule/handler profiles, result
transport/receipt encoding and real consumer witnesses remain consumer-owned.
Build release ordering and downstream adoption are unselected. The broader
consumer proposal's remaining sections are unchanged and not silently adopted.

## Iteration 2: system-comparison gap closure

The owner requested further design improvement. CONTRACT-053 is a new draft
consumer profile/protocol; CONTRACT-052, FR-45, ACT-09–13, SD-008, TD-055 and
STP-055 now allocate the added semantics. This iteration has document consistency
checks, not new runtime evidence or an additional Astra review.

Decisions: a bounded typed JSON rule AST and explicit-input Key selectors;
role/policy authorization union; immutable full-snapshot revision registry;
lookup without execution; expiry horizon and protected retained interpretation;
qualified native invariant boundary; controlled handler access plus ambient
isolation; validation-only preview; transactional terminal audit and qualified
receipt epochs. Exact-snapshot qualification remains conservative; compatibility
review does not infer logical implication.

Earlier investigation closure remains valid for the original bounded cases.
Expanded-profile readiness requires EX-01–EX-05 native/runtime witnesses and
full normative fixtures before executable support. Handler isolation mechanism,
consumer owner/store adapter, policy implementation and audit durability/retention
configuration remain named implementation choices, not established guarantees.
Batch, identity allocation, typed recipe outputs, cross-document references,
events and workflow/external effects remain explicitly deferred.

Iteration 2 consistency result: seven governed IDs are unique; thirteen checked
relative links and ddx targets resolve; ACT-01–13 are retained, ACT-09–13 map to
five executor witness groups, and all nine public criteria retain allocations.
JSON examples parse and `git diff --check` passes. An initial allocation check
caught shorthand ACT-10/11 and ACT-12/13 labels; they were expanded before the
passing run. This is static document verification, not runtime acceptance.
The first isolation approach is now selected in SD-008: a credential-free,
network-disabled process with a bounded transaction-capability RPC. Its native
enforcement and RPC contract remain implementation prerequisites.
