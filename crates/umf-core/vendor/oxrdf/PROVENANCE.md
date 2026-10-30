# Vendored source provenance

This directory contains the exact `oxrdf` 0.3.5 source cached from the local
Cargo registry, with its upstream MIT and Apache-2.0 license files retained.
The cached crates.io archive SHA-256 is
`08037a3c3cf580d065caec6a864cf97f51be219862d95c691a48c7543406d675`.
The UMF portability adaptation makes `rand` optional behind the default-on
`random-blank-nodes` feature. With that feature enabled, `BlankNode::default`
retains the upstream random implementation. Without it, the implementation
uses a process-local atomic counter encoded through `BlankNode::new_from_unique_id`;
that fallback does not claim cross-process uniqueness or distinguish generated
IDs from authored labels.
