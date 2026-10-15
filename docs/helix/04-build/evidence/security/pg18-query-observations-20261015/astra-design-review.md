# P03 design review — existing owner integration required

The revised observation-only PostgreSQL18 component is faithful progress. It does not satisfy the whole unchanged pg-raw.P03 assertion and must not bind or promote that case. No source edit or native execution was performed by this design review. New untracked query-observation files were noticed during review; their implementation/results are outside this completed design review.

## Governing boundary

- CONTRACT062, Query-action profile boundary (around400): Weft owns target/Field/operator/designated-original-action lineage. UMF must not introduce a competing compiler/profile designation. TD079, Protection catalog wire boundary (around150), also assigns predicate/aggregate dependencies to the existing profile-bound compiler; TD056 API design requires pinned owner agreement.
- P03 remains required/native/not-run with its exact original assertion, US056AC6 allocation and60000ms timeout. B08 remains unbound. This review preserves both original case objects in unchanged-requirements.json.
- This does not require claiming every B08 or native lifecycle obligation is finished before any P03 work: the selected P03 query route itself must be genuinely integrated with its existing owner and evaluated against every P03 conjunct. Broader B08/current-authority requirements remain separate.

## Concrete gaps in an admission implementation

1. A private UMF SQL query compiler taking caller-supplied requiredProperties is not the governed dependency producer. The existing conditional helper explicitly retains assumptions and returns authority:false. Connect the existing Weft profile-bound query lineage to the native producer; do not create an alternative designation API. Derive dependencies from the actual selected predicate/aggregate, not a convenient equality list.
2. Ordinary SELECT on a disclosed DTO view permits ordinary SQL computation on that DTO. A successful GROUP/JOIN/ORDER of released values cannot be recorded as a prohibited-operation refusal. The full P03 boundary must distinguish source-bound semantic Field requests from subsequent DTO computation and must actually refuse the prohibited request before native execution/output. An observation-only helper refusal beside successful DTO SQL demonstrates this missing boundary rather than closing it.
3. queries.ts selects an actual transformed policy disposition. P08 stores a canonical ORIGINAL token Field with owner.storageTransform. Fabricating a read-time tokenize disposition on a cleartext DTO changes the selected meaning. The existing owner needs an exact original stored Field -> storage transform resolution, with token outputDomain as canonical query value domain; no plaintext-input override, re-tokenization or reverse action follows.
4. P02 catalog compiler0.1 requires all five queryUse modes explicitly disclosed. It cannot install a source with mixed modes by stripping or rewriting those modes. Any selected read/projection integration must preserve catalog bytes and be explicitly governed with the existing owner. Reusing unchanged all-disclosed P02 carriers for observations is valid, but does not qualify mixed-mode admission.
5. P03 explicitly requires authored equality acknowledgment for deterministic hash/token joins. The helper's implied equality reports leakage even when unauthored; it cannot by itself satisfy this case's acknowledgment condition. Also retain fixed transform/parameter/key scope and exact domains on both join arms. Determinism does not prove injectivity or canonical equality reflection.

## Useful scope for the observation component

Retain exact P02 catalog/core/carrier sources, P08 original stored-token declaration, ordinary SCRAM identities and unchanged membership eligibility. Observe native predicate/order/group/join/aggregate results with an independently authored per-actor oracle, including duplicates, nulls, empty actors and stable tie/null ordering. Metadata helper results may be compared only for their real selection and stated dependency assumptions. A newly authored diagnostic policy is a retained probe source, not an original Weft profile or permission credential. Do not present the stored-token helper selection as resolved.

Report three different outcomes separately: (a) ordinary disclosed DTO SQL success, (b) conditional property helper refusal, (c) native raw-carrier privilege refusal. Neither (b) nor (c) establishes that the actual semantic query producer enforces prohibited Field use. Keep direct DTO computation succeeding when a diagnostic source mode says prohibited as an explicit counterexample to an overbroad SQL-ban claim.

For hidden-input invariance, preserve membership and every disclosed value while changing hidden inputs within the same disclosed equivalence class. Compare successful/error outcomes and rows, not only cell contents. Changing a disclosed class may legitimately change results. The fresh weakened native control should introduce a raw threshold before masking, keep displayed values fixed, and demonstrate changed selection; simply toggling security_barrier is not guaranteed to discriminate. The historical17.9 control already demonstrates a weak view that still has the barrier flag, so retain it only as historical source guidance.

## Required integration/control matrix before full P03 qualification

- Actual existing-owner typed query and exact source/profile/Field/native carrier lineage consumed by the native producer; no caller dependency or action substitution.
- Real stored-token source selection, separate from read-time transformed selection; exact token output domain and fixed key/transform scope.
- Source-preserving mixed modes, unknown/omitted-mode refusal, source drift/substituted Field/pin refusal; no hidden all-disclosed fallback.
- Each selected prohibited query refuses before dispatch/output even for an empty actor, WHEREfalse/LIMIT0 or an omitted output Field; retain zero-executor-invocation evidence for an admission refusal rather than pretending it is a PostgreSQL42501.
- Explicit authored equality acknowledgment and separately reported implied leakage; random-token join/group refusal even with an authored equality claim. No inferred order on hashes/tokens or canonical equality rewrite.
- Actual predicate and aggregate dependencies, including exact value domain, SQLNULL/absence/three-valued semantics, collation, bag multiplicity and both join-arm eligibility. Field-free count is not a substitute for a selected Field aggregate.
- Independent native per-actor positive results plus raw-carrier denial, hidden-value invariance and fresh PG18 raw-threshold weakening/restoration. Errors and counts are output, not invisible side effects.
- Exact successful-before/after source/runtime pins, installed owner/RLS/view/dependency/role inventory, bounded receipt and verified owned cleanup. No receipt from17.9 becomes18evidence.

## Counterexample sketches

- Let f(x)='masked'. SQLCOUNT/GROUP on released f(x) remains computable even if a catalog marks the corresponding semantic Field operation prohibited. A local helper saying prohibited cannot revoke previously released information.
- f(1)=f(2) for a constant mask, or a colliding hash, satisfies determinism but disproves equality reflection. A disclosed-value join must never be rewritten to canonical equality without an additional qualified law.
- Two equal tokens under different transform/key scopes do not establish comparable original inputs; a join admitted only by matching output string types is insufficient.
- A view emitting (id,'masked') with a hidden condition salary>=200 changes its id bag when salary changes200->100. A security_barrier flag does not make that unauthorized canonical predicate safe.

## Qualification limits

This is a read-only requirements/source design review, not a native test, acceptance receipt, formal theorem, compiler implementation review, current-authority proof or PostgreSQL-wide operator prohibition. Original P03 and B08 remain open. Existing P02/P08 evidence retains its own exact scope and all custody/propagation obligations remain unverified. PostgreSQL's security-barrier option orders view/user predicates; it does not implement catalog queryUse modes: https://www.postgresql.org/docs/18/sql-createview.html .
