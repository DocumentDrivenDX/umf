"""Keep canonical schemas available when building a wheel from an sdist."""

from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        if self.target_name == "wheel":
            local = Path(self.root) / "spec/core"
            source = local if local.exists() else Path(self.root).parent / "spec/core"
            if not source.is_dir():
                raise FileNotFoundError("Canonical UMF schemas are missing")
            build_data["force_include"][str(source)] = "umf/spec/core"

            extension = source.parent / "extensions/domain-pack"
            if not extension.is_dir():
                raise FileNotFoundError("Canonical domain-pack schema is missing")
            build_data["force_include"][str(extension)] = (
                "umf/spec/extensions/domain-pack"
            )

            data_source = source.parent / "extensions/dataset-source"
            if not data_source.is_dir():
                raise FileNotFoundError("Canonical dataset-source schema is missing")
            build_data["force_include"][str(data_source)] = (
                "umf/spec/extensions/dataset-source"
            )
