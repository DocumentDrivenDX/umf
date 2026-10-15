# Astra scoped compiler review

No remaining actionable blocker found in the reviewed private canonical0.2 compiler prerequisite.

- Baseline: `7a94067835dcdb4c6c39b01660f16c88c329a6d4`;61 selected source fingerprints unchanged throughout final controls (`source-pins-before.json` / `source-pins-after.json`).
- Independent controls:111 compiler/source/recipe/boundary observations,128 prior typing/compact/shared-source regressions and460 pure-function observations; all699 pass in Bun1.4.2 and actual Chromium153.0.8010.12 with full row parity, zero external requests/page errors and no host globals.
- Exact4096 source nodes,4096 rule-target pairs and65536 expanded nodes succeed; over-bound controls refuse. Shared literal controls include exact100000 normalized units, one-over, cross-target/cross-rule accumulation and allowedValues comparisons.
- Original control plus7 actual source weakenings produce exactly the expected failure sets. Selectors, changed sources, logs and results retained under `mutants/`, with `mutation-exact-discrimination.json`.
-19 repository tests pass with127 assertions. Independent formal replay matches9 conditional queries (3UNSAT/6SAT); it assumes exact source/index correspondence and cost bounds, and is not program/native refinement.
- Complete cases.json is byte-identical to baseline. All158 cases, including the full unbound S24/S25 assertions, are preserved.

The review found a real missing compiler literal ledger: two short `1e100000` constants compiled while reported expanded text was only1368 units. Current code routes actual original literal checking through a compiler-owned scope-set budget and rejects that input. The original development observation is retained without claiming a complete historical source pin. `numeric-pinned-weakening.ts` independently reproduces the problem by removing only the final metering guard from captured source; the corrected comparison refuses. The compiler now also retains the exact frozen explicit binding input.

The implementation retains canonical0.2 sources, original graph/member witnesses, lexical occurrences, exact target membership, actual definition indices and unverified non-pure obligations. No fabricated catalog, selected rules or0.1 shadow interpretation is used by this compiler. Private issuance/caches were reviewed against frozen original source/root/table/scope identities.

Limits: selected static source provenance, not complete root SDK/dependency/runtime provenance. Browser checks are finite concrete observations. Source snapshot/descriptor and literal budgets are separately scoped; they do not establish total allocation or CPU bounds for core validation. Definition readiness is not total output-value applicability. The compiler supplies no facts/coverage, action runtime, true-permit disclosure composition, authenticated source/principal, native authority, blind/vault write grant or public0.2 admission. Full runtime and S24/S25 work remains required. Parent whole-gate results were reported, not independently rerun here.

One oracle setup expectation initially requested expanded-node refusal using a source forest already over its earlier source-node limit; the retained log is not counted. The corrected independent population keeps the source forest within its limit. No repository source edits or native lifecycle jobs were performed.
