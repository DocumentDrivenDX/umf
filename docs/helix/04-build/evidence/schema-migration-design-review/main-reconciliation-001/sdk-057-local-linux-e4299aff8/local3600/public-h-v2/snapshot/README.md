# Local SDK 0.5.7 public-H evidence-reader staging bundle

This is a byte-preserving staging copy of the reviewed v2 reader, its held input packets, retained metadata preflight records, exact copied full18 harness, and the governing source plan. The reader postimage has source-review acceptance digest `79796d883e86bf0c84dff92fca5706764d1e34eb1511363778d50bb857c6c799`. The plan copy is SHA-256 `ee053ccc49394ce72b4fd770dc9e32a7a09476dbf884a06fae8119141a66fd73`.

The v2 reader SHA-256 is `5feed5ed5516b73838650b7c42e9121839e970cee130e49f1f7f479069f9938f`. The primary held packet is `local3600-public-h-inputs.held.json` (SHA-256 `0b4732e008715b292390c6382ea5c80594462be5eed3262ac476a14e78493ffd`); packet 002 is `local3600-public-h-inputs.002.held.json` (SHA-256 `c65547061a6eba1bc471ef102b98a3ab222ed0a8efdb44d55e31bba45971a25e`). Both remain `HELD`; D5 success and immutable SDK publication/asset identities remain unknown. Packet 002 changes only the continuation `harnessRoot` from a relative value to the absolute actual package root, without changing any evidence or receipt bytes.

`metadata-preflight-002.json` records a direct call to `validate_union_continuation` that returned successfully and matched the actual continuation receipt, aggregate index, operator wheel, and publisher metadata hashes. This is a pure metadata-binding result only. It is not a public-H run, SDK/D5 execution, public download/install, oracle check, or qualification. The earlier capture-script error report is preserved alongside it and explicitly identified as a reporting mistake after validator success.

`bundle-integrity.json` lists every payload file except itself and its detached checksum. `bundle-integrity.sha256` authenticates that manifest. No H command was run to prepare this bundle.
