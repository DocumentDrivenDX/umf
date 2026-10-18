"""Include only the current generated UMF authority in the Python wheel."""

from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

CORE_RESOURCES = (
    "schema.json",
    "semantic-type-reference.schema.json",
    "extension-package.schema.json",
)


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        package_root = Path(self.root)
        repository = package_root if (package_root / "spec/core").is_dir() else package_root.parent
        core = repository / "spec/core"
        for name in CORE_RESOURCES:
            source = core / name
            if not source.is_file():
                raise FileNotFoundError(f"Current generated UMF schema is missing: {name}")
            build_data["force_include"][str(source)] = f"umf/spec/core/{name}"

        generated = repository / "spec/metamodel/generated"
        required = ("core-constraints.json", "domain-policy.json", "python-shapes.json", "manifest.json")
        for name in required:
            if not (generated / name).is_file():
                raise FileNotFoundError(f"Generated UMF resource is missing: {name}")
        build_data["force_include"][str(generated)] = "umf/spec/metamodel/generated"

        for path, name in (
            (repository / "spec/extensions/domain-pack/schema.json", "domain-pack"),
            (repository / "spec/extensions/dataset-source/schema.json", "dataset-source"),
        ):
            if not path.is_file():
                raise FileNotFoundError(f"Canonical {name} schema is missing")
            build_data["force_include"][str(path)] = f"umf/spec/extensions/{name}/schema.json"
