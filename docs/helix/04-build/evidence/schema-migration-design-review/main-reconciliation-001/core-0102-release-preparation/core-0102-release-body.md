UMF Core Python distribution 0.10.2 packages the extension-kind support in the current source while retaining semantic Core 0.10.0. The proposed publication is PyPI plus a GitHub release; typed migration SDK 0.5.7 remains a separate release.

Current candidate evidence includes a repaired Linux x86_64 `manylinux_2_34` wheel and a macOS arm64 wheel, with 254 installed-artifact tests and zero skips for direct and sdist-rebuilt artifacts on each platform. The raw Linux `linux_x86_64` wheel is retained as evidence and excluded from the distribution files. The repaired Linux wheel passed its hosted 254-test qualification and independent artifact review.

The Linux producer used source `a1b909d4f92da6604aeb21d3ea60e9a9943a7f87`; the macOS artifact came from `f4d22c6f0f9e308439e3646117e31239cf48bc07`. Both source trees are `f9f1655af59c4c030e58a19405fe22ae55db40bb`. The selected file set is the repaired manylinux wheel, the macOS wheel and one matching source distribution.

The final merged/tagged source identity, normal Mac gate, publisher PR50 merge, public GitHub/PyPI publication and fresh public-download verification remain pending. This release does not qualify UMF migrations, Weft SQL execution, managed-host execution, or SDK 0.5.7.
