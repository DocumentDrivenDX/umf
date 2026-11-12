# SPDX-License-Identifier: MIT OR Apache-2.0
"""Run the README quickstart against whatever `umf` packages are installed.

CI and the release workflow run this file in a fresh virtual environment after
installing the built wheels. tests/release/test_readme_quickstart.py keeps the
block between the markers identical to the Python block in README.md.
"""
import shutil
import subprocess
import sys
from pathlib import Path

# quickstart:start
from umf import (
    adapter_info,
    create_postgresql_sql_engine,
    execute_adapter,
    read_document,
    validate_document,
    write_document,
)

# 1. Read, validate and write a UMF document.
document = read_document('''
umf: "0.10.0"
id: orders
vocabularies: {}
modules: []
''', format="yaml")
result = validate_document(document)
assert result.valid and result.complete
text = write_document(document, format="yaml")
assert read_document(text, format="yaml").to_dict() == document.to_dict()

# 2. Import an OpenAPI description as UMF and export it again.
assert adapter_info("openapi")["operations"]
source_json = '{"openapi":"3.1.0","info":{"title":"Example","version":"1"},"paths":{}}'
api = execute_adapter("openapi", "import", source=source_json, id="api", format="json")
restored = execute_adapter("openapi", "export", document=api, format="json")

# 3. Import PostgreSQL SQL as UMF and export it again.
engine = create_postgresql_sql_engine()
sql_document = engine.import_sql("SELECT 1 AS value", "query")
restored_sql = engine.export_sql(sql_document)
# quickstart:end

assert restored and restored_sql


def check_installed_commands() -> None:
    """The console scripts that umf-codegen and umf-access install must start."""
    bindir = Path(sys.executable).parent
    for name in ("umf-codegen", "umf-table", "umf-sql-check"):
        exe = shutil.which(name, path=str(bindir))
        if exe is None:
            sys.exit(f"console script {name} is not installed next to {sys.executable}")
        done = subprocess.run([exe, "--help"], capture_output=True, text=True, timeout=120)
        if done.returncode != 0:
            sys.exit(f"{name} --help failed ({done.returncode}): {done.stderr[-500:]}")


if __name__ == "__main__":
    if "--no-commands" not in sys.argv:
        check_installed_commands()
    print("umf quickstart ok")
