# Core 3.14 R3 diagnostic: RD-F1/F2 closure

Verdict: SOURCE ACCEPT. Actual workflow /private/tmp/umf-core-python314-generation/.github/workflows/core-python314-generation.yml matches SHA-256 bf68f1036a74c234a452ead3a1836863147a978e8fde4c8609a99867cefc757f,85,487bytes.

RD-F1 is closed: the fixed wrapper imports stdlib Path and uses str(Path(script).resolve().parent) for the original absolute script-directory import context; original script argv0 is retained. RD-F2 is closed: predecessor names are explicitly required to be strings before set membership, so malformed list/dict names reach the existing fixed unavailable-summary path. Reversing only these exact two repairs, including the needed stdlib import, reconstructs reviewed preimage c55e7a7670ef8b6220f611d2fdcab1f8f565c894d77ba13c82e0760a486791c7/85,388bytes exactly. No other delta exists. All other accepted conclusions in review001712c770a2ec952b535909063cc81b77c249a5493890abbb46298149bcd147365 are inherited unchanged.

Root may commit/merge/ref-check this exact diagnostic change and perform one changed-source dependent diagnostic run under the original isolated recipe. Combined180second ownership, all original inventory/Bun boundary checks, one90second nonrepeating nonexiting snapshot, exact matcher, bounded predecessor summaries, adopted9+11 bytes and all original pins/caps remain. Preserve40418623063; actual timeout cause, complete dependent outputs and their adoption remain unproven. No support/native/wheel/publication claim follows.

Only source text/hash inspection and this receipt write occurred. No candidate execution/import, AST/YAML parsing, tests, generation, Git action or source edit was performed.
