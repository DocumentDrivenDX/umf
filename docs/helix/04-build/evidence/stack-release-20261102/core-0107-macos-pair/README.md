# Independent frozen 0.10.7 macOS Python pair check

The unchanged verifier passed against the original tracked checkout at
`9d92e38c39c35c598faeea8abbd2262760c8cb34` using existing candidate artifacts and
the local offline dependency cache. This supplied the tracked workflow recipe
missing from the isolated build-input snapshot. No original source/artifact changed.

[Custody](custody.json) binds the [pair receipt](receipt.json) to that source.
The receipt honestly retains `local-unpinned` and no workflow run; it is local
macOS Python core/codegen pair evidence, not SDK, Linux, later-source or publication
acceptance. The original failed batch remains separate.
