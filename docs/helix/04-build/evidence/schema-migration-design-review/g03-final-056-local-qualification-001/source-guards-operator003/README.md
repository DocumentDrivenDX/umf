# P56 local source/package guard operator, revision 2

This derivative incorporates the sealed static Sol findings for operator 001.
It is prepared for review and has not been executed. The only validation run
while preparing revision 2 is Python AST parsing. No product check, Docker,
test, Git, network, Mac CI, or Praxis command has been run.

`inputs/source-p56.tar` is copied from the frozen operator 001 and remains
unchanged. The runner pins its size and SHA-256, checks it again after
extraction, and extracts an owned source copy with link/special-file and path
traversal rejection. A sorted physical file, mode, and content inventory is
recorded before commands. After every attempted container is proved absent,
the runner inventories the source copy again and compares it to that baseline.
If container absence cannot be established, final source equality is recorded
as unknown and no postinventory is taken.

The JavaScript input is pinned by `jsdeps-manifest.json`, whose digest is also
fixed in the runner. The manifest records all files, directories, modes, file
hashes, and in-root symlink targets in the exact mounted `node_modules` tree.
Its provenance binds the P56 `package.json` and `bun.lock` hashes, verifies the
same hashes at `/Users/erik/Projects/weft`, and records all locked dependency
versions. The physical dependency tree is verified before and after
execution. Symlinks that resolve outside the tree and special files are
rejected. The mounted tree remains read-only.

Every child process uses one selector-based supervisor. It tracks process exit
independently from pipe EOF, applies TERM/KILL, attempts reap, and always records
a terminal row with argv, status, elapsed time, raw stream byte counts and
hashes, and bounded captured prefixes. A shared raw-byte budget applies to all
Docker and tool calls, with an explicit cleanup reserve. One monotonic work
deadline covers source extraction, inventories, setup, commands, and capture;
cleanup and final receipt writing have separately reserved deadlines. The
work deadline is 1710 seconds inside an 1800-second total, with a 30-second
cleanup budget and a 60-second terminal reserve. The 16 MiB evidence limit
includes the receipt, retained logs, and frozen operator metadata. Evidence
overflow or any truncated stream prefix always produces failure; the runner
never truncates captured output and reports a pass.

All source commands receive `RUSTUP_TOOLCHAIN=1.90.0-x86_64-unknown-linux-gnu`,
the isolated Cargo home and target volume, `CARGO_NET_OFFLINE=true`, and the
temporary Python cache location. Setup records the selected Rust, Cargo, Bun,
Node, and Python paths and versions; it requires Rust/Cargo 1.90.0 and host
`x86_64-unknown-linux-gnu`. `WEFT_CARGO` is set to the exact resolved Cargo
binary for module checks, including the tiny synthetic Rust privacy control.
The pinned image's `/opt/cargo/registry` is linked read-only into the owned
Cargo home. Python 3.11.17 remains an explicit narrower replacement for the
planned 3.12 equivalence.

The exact command roster remains unchanged: two routine source checks, six
governed schema/scope checks, two module ownership checks, nine distribution
assembly/corpus regressions, and one source release metadata mapping guard.
There is no duplicate source metadata check, no duplicate internal
`modules:check` checker, and no candidate wheel, product Rust suite,
native/compiler/browser/Mac campaign, full conformance workflow, or publication
claim.

Execution requires `G03_SOURCE_GUARDS_EXECUTE=1`. Each attempt uses a fresh
UUID path and owner-labeled resources. Cleanup removes only resources whose
name and owner were verified, then checks every exact container and volume name
for absence. The producer checkout is never mounted or modified.
