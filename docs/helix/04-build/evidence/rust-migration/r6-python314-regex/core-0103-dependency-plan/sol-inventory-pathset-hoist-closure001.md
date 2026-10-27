# Core 3.14 inventory path-set hoist: source closure

Verdict: SOURCE ACCEPT. Actual /private/tmp/umf-core-python314-generation/scripts/rust-inventory.py matches SHA-256 edf1e1bb1c3bf49ee637e15bfeb0abde1df56f9e1f71f5993072b44e07bdf931,54,967bytes.

The exact diff computes the full script_relative_paths={rel(p) for p in all_script_paths} once immediately before queue=list(roots), and replaces only the inner set reconstruction with membership in that local set. The source list is unchanged throughout this queue and rel is pure; the identical complete membership relation is retained. Reversing precisely those two changes reconstructs the entire prior source2ddc70900350dfdd613196e3e8a319150a2b5421fe4f2c0b41da6365777e8f85/54,917bytes exactly. All roots/import parsing/queue ordering/reachable updates/census/source reads/sorting/output/check semantics remain byte-identical. This closes sealed plan2c3499b884b27f2c59c2fef1e54fed9f3221401b45657d3f6d6420340edeb75b with no concrete residual.

Root may normal-commit/merge accepted facts, verify exact frozen source/ref/pins and perform one changed-source full dependent recipe under its unchanged diagnostic wrapper and original budgets. Retain the actual40420310871 stack/failure. The script's inventoried source identity requires genuine regeneration; no hand-edited inventory or partial output adoption. Actual complete-run fit and dependent output custody remain unproven. Original independent inventory --check/boundary/tests and all source/phase/adoption/native/wheel/publication gates remain.

Only text/difflib/hash inspection and this receipt write occurred. No candidate execution/import, AST/YAML parsing, tests, generation, Git action or source edit was performed.
