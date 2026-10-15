# PostgreSQL 18 projection expression prerequisite

Supports B-SFP-008 / US-056-AC6 preparation for pg-raw.P02; **P02 remains
unbound**. This packet is not a backend acceptance receipt. The existing full
case gate remains40 accepted bound cases and118 required unbound cases.

`tools/security/protection-pg18-expressions.ts` compiles closed private provider
recipes to one SQL expression. It accepts only an ASCII alias/column pair and
bounded parameters; arbitrary native SQL is refused. It implements text constant,
null-out, partial, fixed-length redaction, Unicode-scalar prefix, exact numeric
buckets, Gregorian date truncation, an explicit small regex provider, and unsalted
SHA256 UTF8 lowercase hex with mandatory equality/dictionary-warning declarations.
The constant primitive is currently text-only. This is a host compiler component,
not a public .2 interpreter, catalog compiler, installer or permission capability.
Every result has complete=false and authority=false; refusal clears SQL.

The caller must first establish **present typed input**, finite representable
numeric values (integer family has no fractional part), PostgreSQL UTF8 strings
without NUL/unpaired surrogates, and finite Gregorian dates in0001..9999. Native
carrier constraints, original catalog/policy/domain correspondence, nullability,
output facets and resource budgets remain installer obligations. Constant/null-out
expressions deliberately do not establish those preconditions by reading input.
Other recipes propagate admitted nulls. SQL functions, types, collation and
operators are qualified; explicit parentheses preserve arithmetic precedence.

Regex profile `umf.security.pg18-literal-regex/0.1` is global replacement under
pg_catalog.C collation. Pattern is either exactly[0-9]+ or a nonempty literal
containing no regex metacharacters. Replacement is literal, including backslashes.
No flags, lookaround, backreferences or alternate dialect is inferred. Parameter
text is at most4096 UTF16 units; scalar counts are0..4096. This provider does not
claim all public regex semantics or the reference interpreter's output budget.
SHA256 preserves equality and permits dictionary attacks; it proves no custody.

The independent Python oracle generated210 inputs/expected outputs and compiled
them through the actual Bun adapter before executing the original SQL on exact
PostgreSQL18.6 image recorded in `native-receipt.json`. Text/date/hash results
compare byte-exact; numeric results compare exact Fraction values with both
physical text forms retained. This **does not qualify P02's byte-exact disclosure
transport**. Dates use explicit numeric ISO formatting and timestamp without time
zone. DateStyle, TimeZone, standard_conforming_strings and search_path are hostile.
False shadow domains and text/numeric operators are installed. An unqualified
concatenation returns CAPTURED; qualified generated expressions retain results.
The numeric floor(division) mutant actually returns1 at a huge width-minus-one
boundary where exact quotient is0. SQL literals include quotes, backslashes and
statement-looking text. This native fixture executes as the excluded installer;
ordinary actors and row security are intentionally not claimed here.

`conditional-proof.json` retains Z3 three UNSAT coefficient laws (lower bound,
upper bound, bucket lattice membership), plus SAT without negative-remainder
correction. Assumptions: unbounded exact integer coefficients, positive width.
This is neither a PostgreSQL implementation proof nor a complete security proof.
Bun tests retain2 passes/129 assertions, including closed-signature, unknown
provider, SQL identifier, invalid Unicode, unsupported recipe and hash-warning
refusals. Strict project/tools TypeScript compilation passed.

Original result indices must be an exact ordered bijection; duplicate, omitted,
boolean or malformed indices and non-text/null values refuse evidence. The
executed import closure includes model/json.ts and model/types.ts.
Sources are hashed before and after native execution; compiled expressions and
original executed statements are retained. Exact image is checked before SQL.
Only the owned fixture and exclusively used anonymous volumes are removed.
Successful Docker inventories establish absence before publishing evidence;
daemon/access failures cannot establish cleanup. Initial runner/readiness and
OPERATOR precedence failures are preserved in `failures.json` and the preimage.

Before P02 can bind, integrate original catalog/domain/parameter pins, output
Field correspondence, owner-held barrier view with forced RLS and original
SESSION_USER membership, ordinary per-actor outputs, base/column SELECT refusal,
view owner/options/dependency inventory and disclosure metadata. BindingReceipt
storageEffect=disclosed-only and .2 Cell storageEffect=canonical are distinct
vocabularies requiring explicit correspondence. P03 query-use properties, P04
write-back and P05 generated carriers remain separate required cases. No native
activation, guarded selector, Subject/action/owner authority or lifecycle custody
is granted by this component. All Truss/Ashlar/Delta implementation gaps remain.
