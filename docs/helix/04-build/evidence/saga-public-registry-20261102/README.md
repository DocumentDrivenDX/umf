# Public Saga registry contract repair

CONTRACT-908 requires explicit registry arguments. Fresh installed SDK qualification
[41547142130](https://github.com/DocumentDrivenDX/umf/actions/runs/41547142130)
passed the existing 139 consumers, then rejected four public Saga calls at typecheck.
The V4 facade also ignored those arguments at runtime.

The thin facade now preserves its existing Rust defaults and delegates explicit
registries to the existing engine-binding/profile guards. The actual semantic
engine, protocol, fixtures and registry mutation refusal remain in place.

[Receipt](receipt.json) retains three host-dispatch tests/38 assertions, independent
old-source failures, the unchanged public consumer typecheck and boundary checks.
Actual fresh installed SDK and final artifact acceptance remain pending on the
coordinated source. These host controls do not substitute for native/WASM gates.
