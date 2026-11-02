# Vendored source provenance

This directory contains the exact `oxrdf` 0.3.5 source cached from the local
Cargo registry. The cached crates.io archive omitted the upstream license files;
`LICENSE-MIT` and `LICENSE-APACHE` are copied from the Oxigraph repository root
at the same pinned revision used for `vendor/oxttl` (`14813bfd1d41926af97875692ca46c3f97ed6d80`).
The cached crates.io archive SHA-256 is
`08037a3c3cf580d065caec6a864cf97f51be219862d95c691a48c7543406d675`.
The UMF portability adaptation makes `rand` optional behind the default-on
`random-blank-nodes` feature. With that feature enabled, `BlankNode::default`
retains the upstream random implementation. Without it, the implementation
uses a process-local atomic counter encoded through `BlankNode::new_from_unique_id`;
that fallback does not claim cross-process uniqueness or distinguish generated
IDs from authored labels.
