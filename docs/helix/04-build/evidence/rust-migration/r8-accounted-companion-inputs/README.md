# Accounted-validator predecessor inputs

These four files preserve the exact inputs used by the separately owned Stage A
accounted validator adopted on main. Their hashes and byte sizes remain checked
against the original adoption and producer records. They are historical input
bytes, not current generated outputs.

The Rust migration changes model/compiler provenance. The build checks that the
three current schemas differ only in their root provenance comments, then
reproduces both archived and current standalone validators with the same backend.
Any schema meaning, nested comment, executable code, or backend output drift
rejects reuse of the unchanged accounted companion. The manifest records current
compatibility separately from historical custody.

Sol independently reviewed the implementation and its positive and negative
controls. The local clean-generation test verifies that no current generated
output becomes a source dependency, and that changed/missing outputs and a
changed accounted companion are rejected. This establishes bounded compatibility;
it does not claim a new Stage A generation or Rust ownership of that validator.
