# Live YAML example deployment

Commit: `bfcf9fb4c718111c547b0a662174fe00808f9c15`.
[Pages deployment](https://github.com/DocumentDrivenDX/umf/actions/runs/39096762789)
passed the full site pipeline, build signing and live publication.

Independent live Chromium verification passed nine checks, with zero page errors
or unexpected external requests. Complete documents and inline references open
in YAML; JSON switching preserves values, and keyboard return to YAML preserves
content and route. Mobile layouts, schema/API navigation and the latest workbench
also passed. The YAML asset and eight other critical assets match the tested
local bytes and live manifest. Both page signatures verify with the registered
build public key. Screenshots and exact hashes are in verification.json and
adjacent PNG files. No private key was read locally.

The live manifest matches the local 17-test/43-browser-check qualification:
`5c2b730e661959e6883609ecb1eab3c52452548375aa724e6e0a97cb495340cc`.
