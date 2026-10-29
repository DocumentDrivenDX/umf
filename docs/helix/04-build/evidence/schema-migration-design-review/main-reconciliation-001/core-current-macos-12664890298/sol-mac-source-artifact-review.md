# Core 0.10.2 current macOS artifact review

**ACCEPT the actual macOS artifact/provenance closure**, limited to the recorded native cohort. This closes the current-mac artifact inspection hold from final source reviewfd117386; it does not close all CI or the manylinux/publication holds.

Artifact12664890298/run40338730518/attempt1/job121627226818 is actually built at synthetic PR merge f4d22c6f0f9e308439e3646117e31239cf48bc07. Keep that identity; do not relabel it as an a1b build. The retained primary GitHub REST git/commits response /private/tmp/core-a1b-f4d-github-commit-api.json (SHA-25641b63e0eece785aa52b82180b38234ea9a69fef9997c964dddf61dfe2d475e4e) records f4d parents f5f4b7dbef12a757bc0bba6ae2f581998fe50dba and a1b909d4f92da6604aeb21d3ea60e9a9943a7f87. Both complete trees are f9f1655af59c4c030e58a19405fe22ae55db40bb. I independently compared these retained objects and confirmed the a1b tree in local read-only Git metadata; local Git lacks f4d, so its retained authoritative API object is the explicit evidence for that side. This establishes full source-tree equivalence while preserving different commit provenance.

Original ZIP /private/tmp/core-a1b-mac-12664890298.zip hashes d0a2fdca56e715d0470ade79ffd124bb2ee0a61ec9156276570233a7e69fcc7c. Actual extracted receipts and archives under /private/tmp/core-a1b-mac-12664890298 agree with:

```
99ff1d1250c613a7b65bdd4dc6cf3ee9fec647e02ec34f8dc5ffb84285b0ac59  direct wheel (3294849 bytes)
49847a1e052e4337d414415e2e3fd3b752238df0238c20f936db7f7bebe7365a  direct inner native
5776aecda6cd2397042e0318f59249f364c0d8045e7fb178f0b759d6bb2427b5  sdist-rebuilt wheel (3295057 bytes)
c6548c79b836fe7adc76fa5cc57aa80d40bb02c6b003d78a4934094014522fd2  rebuilt inner native
90a107aaa507930e1d71c0cf208b77182d06c0bf2a1b13681fd5f7b6ed74cb9d  source archive (2652087 bytes)
```

Both wheel names/tags are cp311-abi3-macosx_11_0_arm64. Independent bounded static native-header/load-command reads confirm each is thin64-bit ARM64 Mach-O, with the single LC_BUILD_VERSION targetmacOS/minimum11.0.0 reflected by the actual pinned platform-helper receipts. This is metadata inspection, not executing a native module. The two native hashes differ, and each artifact is separately qualified; no binary-equivalence claim is made.

Each wheel has exactly34 umf package files:33 nonnative bytes match the previously checked current source payload and one native extension. Payload digestc68ed9c02ed3a0fc7d4618880705b8ed2512dadba80405568e1c812fb5c3bd78 and all nine runtime-resource bindings agree with current Linux/source evidence. Current verifier source SHA628bc0ea00eabca17e976b537ba2534c00a6fe53b09acb46399f74f3c0c85fb3 matches checkout. The source archive is byte-identical to the independently inspected Linux archive with all527 members bound in fd117386; no redundant semantic archive audit was needed.

Both original XML files independently total254tests/0errors/0failures/0skipped. Before/after installed payload receipts agree with each respective wheel/native hash, all files stay inside the isolated environment, and the final installed_qualification is passed. Cohort is actual macOS15.7.9 ARM64/Python3.11.9; interpreter's universal2 platform string does not turn the thin artifact into a universal wheel or qualify x86_64. Distribution0.10.2 and semantic Core0.10.0 remain distinct. Final qualification receipt SHA2d1b797fdf059a68924ef38e7f0fd052a17149aeb2ec3d1fb104e899a4732fc7; source-payload receipt2879dc04937c5a7a59c6481b61131fb9cf30074344addee15e1b2f4bb80619f2.

The prior Linux review remains valid for its actual raw direct/rebuilt bytes and sourcea1b; it does not make raw linux_x86_64 a final publisher input. Real manylinux repair/show/exact-byte254qualification remains open per plana9fe580c, together with any unfinished required normal CI, immutable release/publisher authorization and fresh public verification. Final selected top-level release archives must be the actually qualified manylinux wheel, this selected qualified Mac direct wheel, and the single qualified sdist; retain raw Linux/rebuilt evidence separately. This review makes no PyPI or release-success claim.

No local candidate runtime/imports/tests/AST, native execution, source edits or Git mutations were performed. Static archives, hashes, XML/JSON, bounded Mach-O metadata and read-only commit metadata only; no new broad audit.
