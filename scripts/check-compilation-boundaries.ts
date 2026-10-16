// Host-side dependency checker. Keep policy synchronized with Architecture's module map.
import ts from "typescript-api";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--root")) throw new Error("Usage: bun scripts/check-compilation-boundaries.ts [--root path]");
const root = realpathSync(resolve(args[1] ?? import.meta.dir + "/.."));
const base = resolve(root, "src/compilation");
const errors: string[] = [];
const graph = new Map<string, string[]>();
const slash = (path: string) => path.split(sep).join("/");
const label = (path: string) => slash(relative(root, path));
function fail(file: string, code: string, message: string) { errors.push(`${label(file)}: ${code} ${message}`); }
function files(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(path, entry.name);
    if (entry.isSymbolicLink()) { fail(child, "SYMLINK", "scoped sources must be ordinary files"); return []; }
    return entry.isDirectory() ? files(child) : /\.[cm]?tsx?$/.test(entry.name) ? [child] : [];
  }).sort();
}
function moduleOf(file: string): string {
  const path = slash(relative(base, file));
  if (path === "index.ts") return "facade";
  if (path.startsWith("targets/python/")) return "python";
  return path.split("/")[0] ?? "unknown";
}
const allowed: Record<string, readonly string[]> = {
  facade: ["admission", "ir", "python", "bundle"],
  admission: ["ir"], ir: [], python: ["ir"], bundle: ["ir", "python"],
};
const sources = files(base);
if (!sources.length) fail(base, "EMPTY", "no compilation source modules discovered");
const configPath = resolve(root, "tsconfig.json");
const config = existsSync(configPath) ? ts.readConfigFile(configPath, ts.sys.readFile) : { config: {} };
if (config.error) fail(configPath, "CONFIG", ts.flattenDiagnosticMessageText(config.error.messageText, " "));
const options = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, root).options;
options.moduleResolution ??= ts.ModuleResolutionKind.Bundler;
const hostNames = new Set(["Bun", "process", "Buffer", "require", "module", "exports", "__dirname", "__filename", "Deno", "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "eval", "Function"]);
function edge(file: string, specifier: string, typeOnly = false) {
  const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
  if (!resolved) { fail(file, specifier.startsWith(".") ? "UNRESOLVED" : "HOST", `unapproved or unresolved import ${specifier}`); return; }
  const target = realpathSync(resolved.resolvedFileName);
  const targetLabel = label(target);
  if (target.startsWith(base + sep)) {
    const owner = moduleOf(file), dependency = moduleOf(target);
    graph.get(file)!.push(target);
    if (owner !== dependency) {
      if (!allowed[owner]?.includes(dependency)) fail(file, "DEPENDENCY", `${owner} -> ${dependency}`);
      if (!target.endsWith("/index.ts")) fail(file, "PRIVATE", `use public index.ts of ${dependency}`);
    }
    return;
  }
  // Existing semantic APIs are consumed only through src/index.ts. IR receives only types.
  if (targetLabel === "src/index.ts" && ["admission", "ir", "facade"].includes(moduleOf(file))) {
    if (moduleOf(file) === "ir" && !typeOnly) fail(file, "DEPENDENCY", "IR imports external values");
    return;
  }
  fail(file, "HOST", `dependency outside approved public boundary: ${specifier}`);
}
for (const file of sources) {
  graph.set(file, []);
  if (!(moduleOf(file) in allowed)) fail(file, "MODULE", "source has no module-map owner");
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  for (const diagnostic of diagnostics) fail(file, "SYNTAX", ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
      const named = clause?.namedBindings;
      const typeOnly = ts.isExportDeclaration(node) ? node.isTypeOnly
        : Boolean(clause?.isTypeOnly || (!clause?.name && named && ts.isNamedImports(named) && named.elements.length && named.elements.every(item => item.isTypeOnly)));
      edge(file, node.moduleSpecifier.text, typeOnly);
    }
    if (ts.isImportEqualsDeclaration(node)) fail(file, "HOST", "import-equals loading is forbidden");
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) edge(file, node.argument.literal.text, true);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) fail(file, "HOST", "dynamic loading is forbidden");
    if (ts.isIdentifier(node) && hostNames.has(node.text)) {
      const parent = node.parent;
      const propertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || ((ts.isPropertySignature(parent) || ts.isPropertyAssignment(parent) || ts.isMethodSignature(parent)) && parent.name === node);
      if (!propertyName) fail(file, "HOST", `host identifier ${node.text}`);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && hostNames.has(node.argumentExpression.text)) fail(file, "HOST", `host property ${node.argumentExpression.text}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const active = new Set<string>(), done = new Set<string>();
function cycle(file: string) {
  if (active.has(file)) { fail(file, "CYCLE", "dependency cycle"); return; }
  if (done.has(file)) return;
  active.add(file);
  for (const target of graph.get(file) ?? []) cycle(target);
  active.delete(file); done.add(file);
}
for (const file of sources) cycle(file);
for (const error of [...new Set(errors)].sort()) console.error(error);
console.log(`compilation boundaries: ${sources.length} files, ${errors.length} violations`);
process.exitCode = errors.length ? 1 : 0;
