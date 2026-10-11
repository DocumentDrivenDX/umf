# Astra review: conditional report-basis correspondence

Disposition: no blocker for this qualified formal analysis. Independent actual replay of all 18 retained SMT files passed in 18 fresh Z3 4.15.4 contexts: 5 UNSAT and 13 SAT. Every saved formula hash, all seven current source pins and exact source preimages match. They were rechecked before saving this review. Proof receipt SHA256: `0afb9117e16ebccb40aeaf37932e639e30524652e1020dd1bb414c177437834c`.

The reviewer executed only fresh-context SMT replay with `/private/tmp/umf-security-proof-venv/bin/python`; no producer, native probe or Cargo execution. Source/model review and recorded replay outcomes are independent of the producer's own replay.

The two model findings are resolved. Value parity is quantified only over selected identities, and a value-drift witness must belong to that selected set; the positive explicitly requires a nonempty selection and valid lower-bounded coordinates. The codec premise now concerns only packet-encoded projections. A separate SAT control shows equal packet bytes do not establish equality of remaining operation members. Full-operation equality explicitly includes input, generation, writer, ordinal and remaining opaque members; input/generation omission controls also remove the redundant full-operation guard and are named accordingly.

These results establish implications between authored abstract predicates. Original byte carriers and native values are uninterpreted; the analysis does not prove native field extraction, array/set representation, codec injectivity, UTF8/JSON semantics, complete physical inventory or actual SQL guard correspondence. Omission counterexamples isolate the modeled coordinates; they do not prove each native comparison is individually necessary when real decoding and source dependencies provide redundant constraints. Source pinning is evidence linkage, not automatic source-to-model refinement.

The endpoint-ABA SAT witness correctly exposes the gap in endpoint equality alone. Strict observation of a changed event plus a monotone tail and equal final generation is contradictory; dropping the monotone-tail premise permits a reset. This is conditional arithmetic about explicit observer/privilege premises, not proof that every native event is observed or that forbidden resets are impossible. Similarly, selected correspondence does not authenticate an owner or register a semantic profile.

Fresh replay results (each formula's retained hash was verified before parsing):

| Retained formula ID | Expected / observed |
| --- | --- |
| `complete-selected-cut-has-execution` | SAT / SAT |
| `complete-cut-forbids-source-substitution` | UNSAT / UNSAT |
| `complete-cut-forbids-arbitrary-value-substitution` | UNSAT / UNSAT |
| `complete-cut-forbids-coordinate-drift` | UNSAT / UNSAT |
| `generation-only-admits-coherent-source-substitution` | SAT / SAT |
| `identity-only-admits-full-value-substitution` | SAT / SAT |
| `omit-input-and-full-operation-comparisons-admits-input-substitution` | SAT / SAT |
| `omit-binding-comparison-admits-binding-substitution` | SAT / SAT |
| `omit-document-comparison-admits-document-substitution` | SAT / SAT |
| `omit-full-operation-comparison-admits-unmodeled-operation-change` | SAT / SAT |
| `omit-generation-and-full-operation-comparisons-admits-generation-change` | SAT / SAT |
| `exact-encoded-recheck-forbids-drift-under-codec-premise` | UNSAT / UNSAT |
| `encoded-equality-without-codec-premise-admits-collision` | SAT / SAT |
| `encoded-packet-equality-does-not-prove-remaining-operation-equality` | SAT / SAT |
| `selected-correspondence-does-not-prove-authority` | SAT / SAT |
| `endpoint-equality-admits-intermediate-aba` | SAT / SAT |
| `equal-generation-forbids-observed-change-under-monotone-closure` | UNSAT / UNSAT |
| `generation-reset-without-monotone-closure-admits-hidden-change` | SAT / SAT |

The earlier 15-query bfd28549 and 17-query 38eb64f0 receipts remain historical; their selected-value and full-operation/codec modeling inadequacies are not silently repaired by this review. No concurrency, liveness, resource bound, native trigger closure, report persistence, source promotion, publication or complete authority theorem is established. No backend acceptance case is promoted; the original 26/132 ledger remains unchanged.
