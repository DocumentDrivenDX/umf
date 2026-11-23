# SPDX-License-Identifier: MIT OR Apache-2.0
"""Print the test files that conftest.py `collect_ignore` lists exclude, as repository paths.

scripts/ci/plan.ts passes pytest explicit file paths, and pytest only applies collect_ignore while it collects
directories, so the planner leaves these files out itself. Only literal lists, names bound to literal lists,
and `+` of those are understood; anything else fails loudly rather than running an excluded file.
"""
import ast
import sys
from pathlib import Path


def value(node, names):
    if isinstance(node, (ast.List, ast.Tuple)):
        return [ast.literal_eval(item) for item in node.elts]
    if isinstance(node, ast.Name) and node.id in names:
        return names[node.id]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return value(node.left, names) + value(node.right, names)
    raise SystemExit(f"Unsupported collect_ignore expression: {ast.dump(node)}")


for root in sys.argv[1:]:
    for conftest in sorted(Path(root).rglob("conftest.py")):
        names = {}
        for statement in ast.parse(conftest.read_text()).body:
            if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
                name = statement.targets[0].id
                if name == "collect_ignore":
                    for entry in value(statement.value, names):
                        print((conftest.parent / entry).as_posix())
                elif isinstance(statement.value, (ast.List, ast.Tuple)):
                    try:
                        names[name] = value(statement.value, names)
                    except (ValueError, SystemExit):
                        pass
