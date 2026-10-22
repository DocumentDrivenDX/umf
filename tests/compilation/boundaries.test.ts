// SPDX-License-Identifier: MIT OR Apache-2.0
import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, symlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = import.meta.dir + "/../..";
function check(language: "ts" | "py", files: Record<string, string>, python = "python3") {
  const fixture = mkdtempSync(join(tmpdir(), "umf-boundaries-"));
  try {
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(fixture, path, ".."), { recursive: true });
      writeFileSync(join(fixture, path), source);
    }
    return Bun.spawnSync(language === "ts"
      ? ["bun", join(root, "scripts/check-compilation-boundaries.ts"), "--root", fixture]
      : [python, join(root, "scripts/check-access-python-boundaries.py"), "--root", fixture],
      { cwd: root, env: process.env });
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}
function rejects(language: "ts" | "py", files: Record<string, string>, code: string) {
  const result = check(language, files);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain(code);
}

describe("actual compilation boundary checker", () => {
  test("allows public IR dependency", () => {
    expect(check("ts", {
      "src/compilation/targets/python/index.ts": 'import type { Node } from "../../ir/index"; export type Result = Node;',
      "src/compilation/ir/index.ts": "export type Node = string;",
    }).exitCode).toBe(0);
  });
  test("rejects forbidden direction and private reach-through", () => {
    rejects("ts", { "src/compilation/ir/index.ts": 'import "../targets/python/index";', "src/compilation/targets/python/index.ts": "" }, "DEPENDENCY");
    rejects("ts", { "src/compilation/targets/python/index.ts": 'import "../../ir/private";', "src/compilation/ir/private.ts": "" }, "PRIVATE");
  });
  test("rejects host imports, globals, dynamic loading and unresolved imports", () => {
    for (const source of ['import "node:fs";', 'export const x = process.env;', 'export const x = globalThis["Bun"];', 'export const x = require("fs");', 'export const x = import(name);']) {
      rejects("ts", { "src/compilation/ir/index.ts": source }, "HOST");
    }
    rejects("ts", { "src/compilation/ir/index.ts": 'import "./missing";' }, "UNRESOLVED");
  });
  test("rejects cycles including re-exports", () => {
    rejects("ts", { "src/compilation/ir/index.ts": 'export * from "./node";', "src/compilation/ir/node.ts": 'import "./index";' }, "CYCLE");
  });
  test("IR external dependencies are type-only, including relative imports", () => {
    rejects("ts", { "src/index.ts": "export const readDocument = () => {};", "src/compilation/ir/index.ts": 'import {readDocument} from "../../index";' }, "DEPENDENCY");
    expect(check("ts", { "src/index.ts": "export interface Document {}", "src/compilation/ir/index.ts": 'import {type Document} from "../../index";' }).exitCode).toBe(0);
  });
  test("admits direct public semantic symbols through renamed and star re-exports", () => {
    expect(check("ts", {
      "src/index.ts": 'export * from "./api";',
      "src/api.ts": 'export { inspect as inspectDocument, type Document } from "./model/document";',
      "src/model/document.ts": "export const inspect = () => {}; export interface Document {} export const privateValue = 1;",
      "src/compilation/admission/index.ts": 'import {inspect as inspectDocument, type Document} from "../../model/document"; export const inspect = inspectDocument;',
      "src/compilation/ir/index.ts": 'export type Document = import("../../model/document").Document;',
    }).exitCode).toBe(0);
  });
  test("refuses private or same-named impostor symbols and leaf module loading", () => {
    const api = {
      "src/index.ts": 'export { inspect } from "./model/document";',
      "src/model/document.ts": "export const inspect = () => {}; export const privateValue = 1;",
      "src/model/private.ts": "export const inspect = () => {};",
    };
    for (const source of [
      'import {privateValue} from "../../model/document";',
      'import {inspect} from "../../model/private";',
      'import * as document from "../../model/document";',
      'import document from "../../model/document";',
      'import "../../model/document";',
      'export * from "../../model/document";',
      'export {privateValue as publicValue} from "../../model/document";',
      'export type Module = typeof import("../../model/document");',
    ]) rejects("ts", { ...api, "src/compilation/admission/index.ts": source }, "HOST");
  }, 30_000);
  test("IR admits erased public type queries but refuses runtime use", () => {
    const api = {
      "src/index.ts": 'export { CURRENT_CORE_VERSION } from "./generated/core-model";',
      "src/generated/core-model.ts": 'export const CURRENT_CORE_VERSION = "current";',
    };
    expect(check("ts", { ...api, "src/compilation/ir/index.ts": 'import {CURRENT_CORE_VERSION as marker} from "../../generated/core-model"; export type Version = typeof marker;' }).exitCode).toBe(0);
    for (const source of [
      'import {CURRENT_CORE_VERSION} from "../../generated/core-model"; export const marker = CURRENT_CORE_VERSION;',
      'import {CURRENT_CORE_VERSION} from "../../generated/core-model"; export type Version = typeof CURRENT_CORE_VERSION; export const marker = CURRENT_CORE_VERSION;',
    ]) rejects("ts", { ...api, "src/compilation/ir/index.ts": source }, "DEPENDENCY");
  });
  test("Python metadata's generated marker seam admits no other generated or semantic APIs", () => {
    const api = {
      "src/index.ts": 'export * from "./generated/core-model"; export * from "./model/document";',
      "src/generated/core-model.ts": 'export const CURRENT_CORE_VERSION = "current"; export const corePolicy = {};',
      "src/model/document.ts": "export const inspect = () => {};",
    };
    expect(check("ts", { ...api, "src/compilation/targets/python/index.ts": 'import {CURRENT_CORE_VERSION} from "../../../generated/core-model"; export const metadata = CURRENT_CORE_VERSION;' }).exitCode).toBe(0);
    rejects("ts", { ...api, "src/compilation/targets/python/index.ts": 'import {corePolicy} from "../../../generated/core-model";' }, "HOST");
    rejects("ts", { ...api, "src/compilation/targets/python/index.ts": 'import {inspect} from "../../../model/document";' }, "HOST");
    rejects("ts", { ...api, "src/compilation/admission/index.ts": 'import {corePolicy} from "../../generated/core-model";' }, "PRIVATE");
    rejects("ts", { ...api, "src/compilation/bundle/index.ts": 'import {CURRENT_CORE_VERSION} from "../../generated/core-model";' }, "HOST");
  });
  test("rejects network and runtime code execution in portable modules", () => {
    for (const source of ['fetch("https://example.com")', 'new XMLHttpRequest()', 'new WebSocket("wss://example.com")', 'eval("1")', 'new Function("return 1")']) {
      rejects("ts", { "src/compilation/ir/index.ts": source }, "HOST");
    }
  });
});

describe("actual Python boundary checker", () => {
  test("SQL containment separates pure admission from optional pinned parser and host I/O",()=>{
    const prefix="python/umf_access/src/umf_access/lifecycle/";
    expect(check("py",{[prefix+"sql_containment.py"]:"from dataclasses import dataclass\nimport hashlib\nimport json\nfrom typing import Protocol"}).exitCode).toBe(0);
    expect(check("py",{[prefix+"sql_containment_parser.py"]:"from pglast.parser import parse_sql_json\nfrom importlib.metadata import version, PackageNotFoundError"}).exitCode).toBe(0);
    for(const source of ["import socket","from pathlib import Path","from pglast.parser import parse_sql_json","from psycopg import Error"])
      rejects("py",{[prefix+"sql_containment.py"]:source},"HOST");
    rejects("py",{[prefix+"sql_containment_parser.py"]:"import importlib\nimportlib.import_module('anything')"},"DYNAMIC");
    rejects("py",{[prefix+"sql_containment_cli.py"]:"from pglast.parser import parse_sql_json"},"DEPENDENCY");
  });
  for (const python of ["python3", "python3.14"]) {
    test.skipIf(!Bun.which(python))(`stdlib extensions pass and third-party imports refuse under ${python}`, () => {
      const path = "python/umf_access/src/umf_access/values.py";
      const valid = check("py", { [path]: "import math\nimport struct\n" }, python);
      expect(valid.exitCode).toBe(0);
      expect(valid.stdout.toString()).toContain("1 modules");
      const invalid = check("py", { [path]: "import numpy\n" }, python);
      expect(invalid.exitCode).toBe(1);
      expect(invalid.stderr.toString()).toContain("DEPENDENCY numpy");
    });
  }
  test("allows runtime to DSL public boundary", () => {
    expect(check("py", { "python/umf_access/runtime/__init__.py": "from umf_access.dsl import Column\n", "python/umf_access/dsl/__init__.py": "class Column: pass\n" }).exitCode).toBe(0);
  });
  test("rejects drivers and Weft outside owned integrations", () => {
    for (const source of ["import psycopg", "import weft", "from umf_access.targets import postgresql"]) {
      rejects("py", { "python/umf_access/dsl/__init__.py": source, "python/umf_access/targets/__init__.py": "" }, "DEPENDENCY");
    }
  });
  test("rejects private access and relative-import cycles", () => {
    rejects("py", { "python/umf_access/runtime/__init__.py": "from ..dsl.private import value", "python/umf_access/dsl/private.py": "value = 1" }, "PRIVATE");
    rejects("py", { "python/umf_access/dsl/__init__.py": "from . import node", "python/umf_access/dsl/node.py": "from . import value" }, "CYCLE");
  });
  test("bulk exception is narrow; target cannot import generated packages or engines", () => {
    expect(check("py", { "python/umf_access/runtime/bulk.py": "import weft" }).exitCode).toBe(0);
    rejects("py", { "python/umf_access/runtime/read.py": "import weft" }, "DEPENDENCY");
    for (const dependency of ["shop.models", "truss", "ashlar"]) rejects("py", { "python/umf_access/targets/postgresql.py": `import ${dependency}` }, "DEPENDENCY");
  });
  test("rejects dynamic imports and malformed syntax", () => {
    rejects("py", { "python/umf_access/dsl/__init__.py": '__import__("psycopg")' }, "DYNAMIC");
    rejects("py", { "python/umf_access/dsl/__init__.py": "from" }, "SYNTAX");
  });
  test("discovers src layout and rejects host I/O and dynamic import APIs", () => {
    const path = "python/umf_access/src/umf_access/dsl/__init__.py";
    for (const source of ['open("data")', 'input("prompt")', 'eval("1")', 'exec("x = 1")', 'import os\nx = os.environ', 'import socket', 'import importlib\nimportlib.import_module("psycopg")']) {
      rejects("py", { [path]: source }, source.includes("importlib") || source.startsWith("eval") || source.startsWith("exec") ? "DYNAMIC" : "HOST");
    }
    const result = check("py", { [path]: "from decimal import Decimal\ndef invoke(input):\n    return input" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("1 modules");
  });
  test("rejects empty scans and scans both source layouts", () => {
    rejects("py", {}, "EMPTY");
    const result = check("py", {
      "python/umf_access/dsl/__init__.py": "from decimal import Decimal",
      "python/umf_access/src/umf_access/runtime/__init__.py": "from umf_access.dsl import Decimal",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("2 modules");
  });
  test("named runtime foundations have explicit ownership; arbitrary helpers refuse", () => {
    const prefix = "python/umf_access/src/umf_access/";
    expect(check("py", {
      [prefix + "types.py"]: "from pydantic import BaseModel",
      [prefix + "values.py"]: "from decimal import Decimal",
      [prefix + "codec_support.py"]: "from .types import BaseModel",
      [prefix + "capture.py"]: "from .dsl import Query",
      [prefix + "dsl/__init__.py"]: "from ..types import BaseModel\nclass Query: pass",
      [prefix + "pages.py"]: "from .types import BaseModel",
      [prefix + "protocols.py"]: "from .types import BaseModel",
      [prefix + "adoption.py"]: "from .protocols import BaseModel",
    }).exitCode).toBe(0);
    rejects("py", { [prefix + "surprise.py"]: "" }, "MODULE");
    rejects("py", { [prefix + "types.py"]: "from .dsl import Query", [prefix + "dsl/__init__.py"]: "class Query: pass" }, "DEPENDENCY");
  });
  test("lifecycle administration owns only its public compiler verifier and native exception imports",()=>{
    const prefix="python/umf_access/src/umf_access/";
    expect(check("py",{[prefix+"lifecycle/catalog.py"]:"from umf_codegen import verify_table_deployment, verify_table_migration\nfrom psycopg import Error\nfrom psycopg.rows import tuple_row\nfrom psycopg.types.json import Jsonb"}).exitCode).toBe(0);
    for(const source of ["import umf_codegen._embedded","from umf_codegen import generate_python_client","import psycopg","from psycopg import Connection","from psycopg.types.json import set_json_loads"])
      rejects("py",{[prefix+"lifecycle/catalog.py"]:source},"PRIVATE");
    rejects("py",{[prefix+"runtime/read.py"]:"from umf_codegen import verify_table_deployment"},"DEPENDENCY");
    rejects("py",{[prefix+"dsl/__init__.py"]:"from umf_access.lifecycle import verify_native_catalog",[prefix+"lifecycle/__init__.py"]:"def verify_native_catalog(): pass"},"DEPENDENCY");
  });
  test("ordinary head observations cannot import migration authority or general Psycopg2 APIs",()=>{
    const prefix="python/umf_access/src/umf_access/";
    const lifecycle="class CatalogError(Exception): pass\ndef prepare_table_head(): pass\ndef prepare_table_correspondence(): pass\ndef apply_table_migration(): pass";
    expect(check("py",{[prefix+"unified/head_session.py"]:"from umf_access.lifecycle import CatalogError, prepare_table_head, prepare_table_correspondence",[prefix+"lifecycle/__init__.py"]:lifecycle}).exitCode).toBe(0);
    rejects("py",{[prefix+"unified/head_session.py"]:"from umf_access.lifecycle import apply_table_migration",[prefix+"lifecycle/__init__.py"]:lifecycle},"DEPENDENCY");
    for(const consumer of ['dsl/__init__.py','unified/other.py'])
      rejects("py",{[prefix+consumer]:"from umf_access.lifecycle import prepare_table_head",[prefix+"lifecycle/__init__.py"]:lifecycle},"DEPENDENCY");
    for(const consumer of ['dsl/__init__.py','unified/other.py'])
      rejects("py",{[prefix+consumer]:"from umf_access.lifecycle import prepare_table_correspondence",[prefix+"lifecycle/__init__.py"]:lifecycle},"DEPENDENCY");
    expect(check("py",{[prefix+"unified/session_psycopg2.py"]:"from psycopg2.extensions import cursor"}).exitCode).toBe(0);
    rejects("py",{[prefix+"unified/session_psycopg2.py"]:"from psycopg2 import connect"},"DEPENDENCY");
    rejects("py",{[prefix+"runtime/read.py"]:"from psycopg2.extensions import cursor"},"DEPENDENCY");
  });
  test("declared native reads own only the prepared Weft module entry point",()=>{
    const prefix="python/umf_access/src/umf_access/";
    expect(check("py",{[prefix+"unified/table_reads.py"]:"from weft import prepare_table_operation_module_json"}).exitCode).toBe(0);
    for(const source of ['import weft','from weft import compile_engine_page_json','from weft import connect','from weft import compile_table_operation_json','from weft import check_table_operation_json'])
      rejects("py",{[prefix+"unified/table_reads.py"]:source},"DEPENDENCY");
    rejects("py",{[prefix+"unified/other.py"]:"from weft import prepare_table_operation_module_json"},"DEPENDENCY");
  });
});

test("local command and installed pre-commit hook reject real violations", () => {
  const fixture = mkdtempSync(join(tmpdir(), "umf-boundary-hook-"));
  const run = (command: string[]) => Bun.spawnSync(command, { cwd: fixture, env: process.env });
  try {
    for (const directory of ["scripts", ".githooks", "src/compilation/ir", "python/umf_access/dsl"]) mkdirSync(join(fixture, directory), { recursive: true });
    for (const path of ["package.json", ".githooks/pre-commit", "scripts/check-compilation-boundaries.ts", "scripts/check-access-python-boundaries.py"]) copyFileSync(join(root, path), join(fixture, path));
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"));
    chmodSync(join(fixture, ".githooks/pre-commit"), 0o755);
    writeFileSync(join(fixture, "src/compilation/ir/index.ts"), "export type Value = string;");
    writeFileSync(join(fixture, "python/umf_access/dsl/__init__.py"), "from decimal import Decimal\n");
    expect(run(["git", "init", "-q"]).exitCode).toBe(0);
    expect(run(["git", "config", "core.hooksPath", ".githooks"]).exitCode).toBe(0);
    expect(run(["bun", "run", "check:access-boundaries"]).exitCode).toBe(0);
    const commit = ["git", "-c", "user.name=Boundary Test", "-c", "user.email=boundary@example.invalid", "commit", "--allow-empty", "-m", "boundary control"];
    expect(run(commit).exitCode).toBe(0);
    for (const [path, source, reset] of [
      ["src/compilation/ir/index.ts", 'fetch("https://example.invalid")', "export type Value = string;"],
      ["python/umf_access/dsl/__init__.py", "import socket", "from decimal import Decimal\n"],
    ] as const) {
      writeFileSync(join(fixture, path), source);
      expect(run(["bun", "run", "check:access-boundaries"]).exitCode).toBe(1);
      const rejected = run(commit);
      expect(rejected.exitCode).toBe(1);
      expect(rejected.stderr.toString()).toContain("HOST");
      writeFileSync(join(fixture, path), reset);
    }
  } finally { rmSync(fixture, { recursive: true, force: true }); }
}, 15000);
