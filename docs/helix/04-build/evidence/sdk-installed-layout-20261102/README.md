# Current Rust SDK installed-layout qualification

The SDK producer emits separate declared Node and browser entries. The portable
installer and collector still expected the retired `dist/umf.js`, preventing
installed qualification of the valid source-built archive.

The correction binds both declared exports, the native addon, build manifest and
WASM runtime members to exact archive/installed bytes. Retired or redirected
entries and missing/changed native or browser members refuse. The collector uses
the same public Node entry as the installer receipt. Product code and operation
budgets are unchanged.

[Receipt](receipt.json) retains the prior failed run separately, including its
passing native/browser/CLI vectors. Thirteen custody controls and typechecking
pass; the actual retained archive passes member/export/manifest verification.
Fresh hosted installed-consumer and Python wheel/source-rebuild gates remain
required. The archive is a private SDK0.10.3 candidate, not the separately owned
unified0.10.7 release. No prior receipt is relabeled as a new source cohort.
