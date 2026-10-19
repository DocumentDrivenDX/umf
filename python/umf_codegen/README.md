# UMF Python client generator

Local `0.1.0a1` candidate; publication and platform qualification are pending.
The installed wheel runs the original portable TypeScript generator inside
embedded V8. Authors need Python and `mini-racer==0.14.1`, without Bun, Node,
a JavaScript subprocess, an SDK tarball or a network connection during generation.
Generated clients use the Python standard library only.

```sh
python -m umf_codegen generate --schema plugin.json --package plugin_client --output generated
python -m umf_codegen check --schema plugin.json --package plugin_client --output generated
```

`check` is read-only and exits nonzero for drift or refusal. `generate` refuses
hand-edited output and unsafe paths. Pin release wheel hashes and the embedded
runtime version in your build lock; a candidate wheel is not a release guarantee.
First-party files use MIT OR Apache-2.0. Bundled dependencies retain the notices
in `_assets/notices/`; mini-racer retains its own ISC license and V8 notices.
