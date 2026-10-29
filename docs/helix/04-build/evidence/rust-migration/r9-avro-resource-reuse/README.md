# Avro resource reuse and one-process replay

The focused source check at private `2e1d73179` passes all 139 frozen wire
outcomes, eight Cardinality unit tests and five document/resource tests. The
same changed source files are integrated at `7e2ab9c6b`; the receipt pins them.
The corpus calls the production dispatcher in one process and compares ordered
objects, arrays, scalar types and UTF-16. It takes 27.65 seconds after compilation.
The preserved red run caught a real root member-order difference, now repaired.

Only successful ordinary-profile immutable validator resources are reused.
Each invocation admits host controls before cache access and validates its own
input. Custom limits construct their own resources. No input, result or host
callback is cached. The retained parsed native tree is reused only after export
validation and exact UTF-16 compact-source equality.

Independent Sol source review found no actionable P1/P2 in these changes.
A preceding 300-second broad Avro test filter was interrupted and is not a pass.
These checks do not qualify current installed artifacts, default-route retirement
or the full Rust release. [Receipt](receipt.json) records the bounded claims.
