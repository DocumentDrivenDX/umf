# R6 exact length and allowed-value constraints

This checkpoint covers only `umf_access.values.validate_length` and
`validate_allowed`, with Rust capability profile `umf-access-constraints/0.1.0`.
It qualifies the locally installed macOS arm64 CPython 3.11.17 artifacts built
from the moving worktree; it is not a release-cohort or cross-platform claim.

Python retains `len`, carrier admission, iteration, original-object return, and
every custom/exotic comparison. Exact `int`/`bool` length bounds delegate to
Rust, one bound at a time, preserving minimum-before-maximum short-circuiting.
Allowed candidates are consumed in order and only compared after exact type
matching. Rust handles exact bool, arbitrary-size int, Unicode-scalar str,
bytes, and finite Decimal equality. Python keeps candidate-side equality and
truth conversion for custom values, nested/exotic values, non-finite floats and
Decimals, and strings containing surrogate code points. This preserves custom
Python equality behavior instead of narrowing the public helper.

`frozen-predecessor.json` records the installed predecessor wheel identity,
source identities and behavioral controls. Controls exercise Python
code-point lengths for supplementary and combining characters; custom rich
comparison and truthiness order; exception-object identity; generator
consumption; candidate-side equality; Decimal NaN/signaling-NaN behavior;
huge integers; and successful return identity. A separate Fraction oracle
checks finite Decimal numeric equality across alternate tuple spellings,
including signed zero. Raw binding controls reject wrong exact carriers,
surrogate strings and malformed Decimal tuples, and establish that failed
minimum comparison avoids converting the maximum.

Sol's first independent review found that a surrogate-containing candidate
string was sent to native equality when the input string was scalar-valid.
Python now checks both exact string operands before selecting the Rust path;
either surrogate-containing operand uses the predecessor's candidate-side
Python equality. The regression `validate_allowed("ok", ("\ud800", "ok"))`
returns the original input object as before. The correction has been rebuilt and
installed. Reopened independent Sol review found no remaining P1/P2; it
verified both wheel hashes, installed source bytes, the surrogate regression,
candidate-side custom equality and exception identity.

Installed artifact identities:

| Artifact | SHA-256 |
| --- | --- |
| `umf_core-0.11.0-cp311-abi3-macosx_11_0_arm64.whl` | `2d7e15456ee842da5df1663ba4232f2feaa78e11fcac6d4fbfd438495067e367` |
| `umf_access-0.1.0.dev6-py3-none-any.whl` | `80c33c8707503391448d3a58d362a636911457687127b03887f258ce064b3995` |

The fresh wheels were installed together in `/private/tmp/umf-r6-env`. Unittest
replay against those installed artifacts passed: constraints 9/9, numeric range
6/6, retained values controls 6/6, exact values 4/4, runtime-driven codecs 5/5,
and golden vectors 1/1. Focused `umf-core` constraint tests passed 2/2, and
`cargo check --offline --locked -p umf-core-python` succeeded. The binding build
emitted existing deprecation and dead-code warnings. The installed environment
does not include pytest, so pytest-discovered core test modules were not run in
this checkpoint. Independent Sol replay passed all 31 focused tests, nine
additional installed codec controls and two Delta projection checks, for 42
passing tests total. Two additional generated-codec/projection files
could not import their generated `commerce` module in this environment and are
not counted as passing.

The raw bridge has no host-facing meter, cancellation, deadline or hard resource
budget. Internal conversion accounting does not establish a resource ceiling.
No native PostgreSQL, Weft, Truss, Ashlar or TableSpec consumer path was reached;
generated FieldValidator/codec order was exercised locally, but no generated
client installation or native engine replay is claimed. Other Python access
algorithms, broader codecs/drivers, other platforms/interpreters, and the wider
R6 port remain open.
