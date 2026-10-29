# SDK 0.5.7 local public-H preparation, v3

This staging snapshot preserves the v2 reader, its inputs and metadata-only preflight history, then adds a v3 reader, held packet increment 004, actual D5 metadata-only validation, exact v2-to-v3 source diff, and the accepted Sol source review. Packet status remains HELD; this is not a public-H execution or release qualification.

The v3 change closes the selected D5 upload roster over the actual `replay/candidate-009/` and `replay/g01/` directories, cross-binds retained originals to the immutable archive/custody hashes, and binds successors to the existing owner/custody hashes. The actual D5 profile and selected-evidence metadata validators pass on the retained D5 attempt. The recorded D5 scope remains 37 cases, 16 oracle groups, 19 no-default checks, three fault scenarios, and 30 commands. No product oracle, public download, SDK consumer, or public-H run was performed.

The SDK release tuple is still HELD. No release publication identity, published asset metadata, public-H receipt, or hosted qualification is asserted. D5 selected source/metadata and its external staging bundle are referenced by exact paths and hashes; release wheel binaries remain omitted from this staging bundle.
