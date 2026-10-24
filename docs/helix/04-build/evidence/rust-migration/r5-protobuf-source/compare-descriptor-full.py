# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compare same-protoc descriptor sets including SourceCodeInfo and presence."""
import importlib.metadata
import json
import sys
from pathlib import Path

from google.protobuf import descriptor_pb2

assert importlib.metadata.version("protobuf") == "7.36.2"

def read(path):
    result = descriptor_pb2.FileDescriptorSet()
    result.ParseFromString(Path(path).read_bytes())
    return result

before, after = map(read, sys.argv[1:3])
assert before == after, "Full native FileDescriptorSet message mismatch"
assert len(before.file) == len(after.file) == 4
assert all(left.HasField("source_code_info") == right.HasField("source_code_info")
           for left, right in zip(before.file, after.file))
print(json.dumps({
    "oracle": "Python protobuf " + importlib.metadata.version("protobuf"),
    "result": "full FileDescriptorSet message equality",
    "sourceCodeInfoCompared": True,
    "fileOrder": [file.name for file in before.file],
    "fileCount": len(before.file),
}, indent=2))
