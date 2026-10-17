# Foundational non-temporal SDK r5 proofs — 2026-10-16

Exact SDK wheel SHA-256: `c360781c703b326d676c9e033e53b314502d6636fc3bbc00c6b555a83dab023c`.
The 33 runtime payloads match the fixed installed wheel and source. This packet
qualifies the named pure generator/runtime/typing controls, not native backends
or the complete SDK. Temporal qualification remains **HELD**.

- Actual seeded/fixed installed wheels share one unchanged generated package.
  Only `values.py` differs; the defective wheel accepts decimal 1.234 and the
  fixed wheel refuses its scale. Both public CLI drift checks pass.
- Public CLI matrix: 69 non-temporal core vectors, seven presence/default/mutation
  controls, generation and before/after drift checks pass. Three temporal vectors
  are explicitly held. Invalid binary hex has no bytes carrier; the exact token
  is tested as an invalid string carrier and is explicitly labeled in the receipt.
- Python 3.14 model/import/AST and generator-backed refactor suites pass three
  methods each; refactor spans five variants and all three pinned checkers.
- Final static corpus has 38 negative files; every expected rule, line and exact
  multiplicity passes on mypy 2.4.0, Pyright 1.1.414 and ty 0.0.88, as do positives.
  The added generated CustomerKey has the same string component carrier but is
  rejected as ShipOrderInput's selected OrderKey on all three checkers.
- `static-initial-missing-deps` retains the failed ty environment lookup; the
  same five pinned dependencies were installed locally before the successful
  `static-before-key` and `static-final-key` cohorts. Earlier receipts are distinct.
- Repository-only action suite fault controls and adoption packet tests pass;
  synthetic detection evidence establishes no native engine qualification.

Absolute scratch paths in receipts identify their original runs; copied receipts
are preserved verbatim. Runtime wheels/environments are not published by this packet.
