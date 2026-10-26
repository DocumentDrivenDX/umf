UMF Core Python distribution 0.10.2 packages the extension-kind support added to the current source while retaining semantic Core 0.10.0. This is a GitHub-only distribution: the qualified Linux wheel uses the `linux_x86_64` tag, which is not accepted by PyPI. A future manylinux build would be a separate Rust/Stack release lane. Typed migration SDK 0.5.7 is separate.

The Linux x86_64 direct wheel and the wheel rebuilt from the source distribution each passed 254 installed-artifact tests with zero skips on source `a1b909d4f92da6604aeb21d3ea60e9a9943a7f87`. The Linux native binaries differ, and each was qualified independently. The matching source distribution is included once.

The macOS arm64 artifacts and qualification, the final merged/tagged source identity, and fresh public-download verification are still pending. This release does not qualify UMF migrations, Weft SQL execution, managed-host execution, or SDK 0.5.7.
