# Independent Astra review — finite history, ABA and disclosure

No remaining blocker for this scoped evidence checkpoint. The two formal findings are resolved: ABA and generation-race values are now derived from time-indexed transitions, and an explicit disclosure event has its own preservation and early-release queries. No native backend, authority implementation or accepted-case promotion follows.

Final native: `python-catalog-cut/8faf405c-05eb-47a0-b2a2-e7353f70f0c7`. Final formal: `catalog-cut-history-formal/a3f69385-9520-43ec-8c54-3dc11a460862`. Review was read-only; no native probes, Cargo tests or producers were executed.

Native evidence independently verified:

- 58 unique, recursively type-sensitive matching observations; all 129 current source pins match the exact duplicate-free ZIP; all 1,614 retained binary digests match current bytes.
- Twelve retained host tests, the 469-import boundary check, fourteen full source images, the 43 initial granted catalog ShareLocks and eight retained server lock timeouts pass their independent checks.
- The ABA images are exactly byte-equal before/after, SHA256 `ed4a0057606fd9be9a38504364c5f0fbd9f0790fcb88739e986dc5a8d41ea609`. The intermediate image SHA256 is `e77c59012837d614d554de470518aab216c1408a92cba1a1758c4857480f09ef`. Only `pg_proc` changes; the same qualified function OID 16390 changes only `prosrc`, from 666 to 777 and back. Native calls return 777 in between and 666 after restoration.
- Updating the fixture table to `changed-without-source-change` is visible to the reader while the entire source census remains byte-identical; restoration returns `changed`. This demonstrates omitted application data. That table is not an authorization provider and the test does not prove a real permission-revocation path.
- Earlier pending-commit, old-snapshot, cooperative advisory and cross-database controls remain intact. The same-key cross-database grant changes only `pg_auth_members` and native membership false-to-true while the reader's local advisory key remains held.
- Owned Unix-only PostgreSQL 16.15 cleanup reports stop 0, status 3 and socket absence. Retained logs confirm shutdown; the socket path is absent. Private native artifact permissions are preserved.

Native receipt SHA256: `5baa873a0393709b23acfd4579a425e5aa50e8a1666b08c59524494a2dafd442`. Native observation packet SHA256: `597d6ed347f3ad8a9eb07db17056a760989a74caf14570f21c8340e40099fcf0`. ZIP SHA256: `14a64eb4c75d329586ae73ea2575ac1988ce3fe62956f2e414a4cae8c8e53466`.

All 13 saved SMT strings replay independently in fresh Z3 4.15.4 contexts: **4 UNSAT / 9 SAT**. All four current source pins match the formal ZIP. Every SAT control also permits nonnegative times/generations. The complete disclosure premises admit a populated history with snapshot 2, execution 3, unrelated step 4, disclosure 5 and release 6. Proof SHA256: `9061e2dde6c2a80faeae6e580e4529518f4c26034d011bc44f4c0f49a8efcfde`.

The induction is mathematically sound for every finite ordered history admitted by the stated closed transition relation: supplied fresh-state equality is the base; the arbitrary step preserves values and generations under complete source and authority commit exclusion. It does not derive snapshot freshness from a database operation. The separate step through disclosure extends the argument to `execution <= disclosure < release`; release after execution but before disclosure admits the modeled authority change. Disclosure actually using that verified state remains a premise. This is not a bounded unrolling, nor an unbounded native refinement theorem.

The two-commit ABA countermodel now computes snapshot, intermediate execution and final capture from the same piecewise state function. The generation race similarly derives observed/execution generations from a commit-time function. Integer generations are unbounded and nonrewinding by assumption; overflow, reset, authenticity and complete observer coverage are not proved.

The merged capture adds `_installation_metadata.py` and changes `_catalog_installation.py`, `_construction_recovery.py` and the boundary checker. Worker, wrapper and census SQL remain unchanged from the pre-merge run. No installation/report/native-edge semantics are independently qualified by this experiment. Earlier pre-merge and model-iteration packets remain historical. The historical reused-call 555 result after a 666 replacement remains unresolved: changed SQL text and an intervening census prevent causal attribution to a cache or invalidation mechanism.

Remaining obligations include faithful complete transition/state coverage, every relevant writer across database scopes, current-call correspondence, a real authorization/data cut through final disclosure, authenticated custody and protected handback. Native evidence uses materialized administrative pg8000 rows, not new bounded original-response/provider qualification. No full acceptance-gate outcome was audited here.
