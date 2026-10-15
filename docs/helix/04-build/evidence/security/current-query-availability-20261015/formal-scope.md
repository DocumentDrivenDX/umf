# Formal applicability

The existing prove-fact-consistency.py model replays with Z3 4.15.4: two
UNSAT obligations and two SAT cases/counterexamples. It distinguishes unknown,
explicit absence, null and present values and proves a conditional unbounded
projection-fold invariant. The original formula text, models, source pins and
qualified scope are in core-null-absence-fold.json.

This model assumes exact original kind/domain classification. It does not prove
that Weft's source descriptor traversal or nullable:false report faithfully
classifies current UMF Fields. The observed pre-fix failure violates precisely
that unverified correspondence assumption; solver success cannot qualify it.
The independent before/after compiler regressions test the actual repaired
selected-domain boundary. No new compiler, SQL, native or whole-backend
refinement theorem is asserted by replaying the existing model.
