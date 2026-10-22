# YAML example default and JSON toggle

Owner direction: schema examples default to YAML with an accessible JSON toggle,
followed by live deployment. REF-15 / US-089-AC16 / CONTRACT-077 / TD-089 govern.

The reference build emits manifest-bound example.yaml through the existing
public UMF serializer and verifies a lossless read-back against the canonical
example object. Complete documents and inline itemType examples default to
YAML; per-example YAML/JSON buttons update only presentation and expose their
pressed state. Original schema records and API code examples retain their formats.

Local verification: 17 reference tests and 43 Chromium checks passed. This
includes YAML/JSON value parity, default selection, JSON switching, keyboard
return to YAML, unchanged routes, existing desktop/mobile journeys and source
integrity controls. Browser evidence binds manifest 5c2b730e661959e6883609ecb1eab3c52452548375aa724e6e0a97cb495340cc.
Typecheck, the 19-file boundary check and diff checks also passed. Screenshots
example-yaml.png and example-json.png were manually inspected.

Publication uses the existing main-branch Pages workflow and CI build signer.
Live verification will check the published YAML asset and both button states.
