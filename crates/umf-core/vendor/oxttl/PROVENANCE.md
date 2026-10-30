# Vendored `oxttl` source

This directory starts from the published crates.io package `oxttl` 0.2.5.

- Published crate checksum (SHA-256): `c2f5a5c0e82734bb66c9e2a82839bafca5cc129531c51b92f428a4f43405793d`
- Upstream repository: <https://github.com/oxigraph/oxigraph/tree/master/lib/oxttl>
- Upstream source revision recorded by the published package: `14813bfd1d41926af97875692ca46c3f97ed6d80`
- Upstream package license expression, preserved in `Cargo.toml`: `MIT OR Apache-2.0`

The published package's `README.md`, normalized `Cargo.toml`, original `Cargo.toml.orig`, and `src/` are preserved. Cargo cache bookkeeping files and the package's lockfile are intentionally omitted. UMF's local patch adds opt-in deterministic blank-node labels for Turtle/TriG parsing and an ordered inventory of declared TriG graph blocks; the default parser behavior remains unchanged.

The upstream LICENSE-MIT and LICENSE-APACHE texts are included from the same pinned revision. Local UMF parser hook changes are identified by the `umf_blank_labels` and `declared_graphs` APIs in terse.rs, turtle.rs and trig.rs.
