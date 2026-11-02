// SPDX-License-Identifier: MIT OR Apache-2.0

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pointerSegments(pointer: string): string[] {
  if (!pointer.startsWith('/')) throw new TypeError('Schema alias path must be a JSON Pointer');
  return pointer.slice(1).split('/').map(segment => {
    if (/~(?:[^01]|$)/.test(segment)) throw new TypeError('Schema alias path has an invalid JSON Pointer escape');
    return segment.replace(/~1/g, '/').replace(/~0/g, '~');
  });
}

function arrayIndex(array: unknown[], segment: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) throw new TypeError('Schema alias array path has an invalid index');
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index >= array.length) throw new TypeError('Schema alias path does not resolve');
  return index;
}

function getAtPointer(root: unknown, pointer: string): unknown {
  let current = root;
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(current)) {
      current = current[arrayIndex(current, segment)];
    } else if (isObject(current) && Object.hasOwn(current, segment)) {
      current = current[segment];
    } else {
      throw new TypeError(`Schema alias path does not resolve: ${pointer}`);
    }
  }
  return current;
}

function setAtPointer(root: unknown, pointer: string, value: unknown): void {
  const segments = pointerSegments(pointer);
  if (!segments.length) throw new TypeError('Schema alias path cannot replace the schema root');
  const key = segments.pop()!;
  const parentPointer = segments.map(segment => segment.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
  const parent = segments.length ? getAtPointer(root, `/${parentPointer}`) : root;
  if (Array.isArray(parent)) {
    Object.defineProperty(parent, String(arrayIndex(parent, key)), {value, enumerable: true, writable: true, configurable: true});
  } else if (isObject(parent)) {
    Object.defineProperty(parent, key, {value, enumerable: true, writable: true, configurable: true});
  } else {
    throw new TypeError(`Schema alias parent is not a container: ${pointer}`);
  }
}

/** Parse a Rust-owned schema graph and restore its JSON Pointer identity classes. */
export function createGeneratedSchemaGraphOperation(schemaGraphJson: () => string) {
  if (typeof schemaGraphJson !== 'function') throw new TypeError('A Rust schema graph provider is required');
  return function generateSchema() {
    const wire = schemaGraphJson();
    if (typeof wire !== 'string') throw new TypeError('Rust schema graph provider returned a non-string resource');
    const graph: unknown = JSON.parse(wire);
    if (!isObject(graph) || !isObject(graph.schema) || !Array.isArray(graph.aliasGroups)) {
      throw new TypeError('Rust schema graph resource has an invalid shape');
    }
    const schema = graph.schema;
    const seen = new Set<string>();
    for (const group of graph.aliasGroups) {
      if (!Array.isArray(group) || group.length < 2 || group.some(path => typeof path !== 'string')) {
        throw new TypeError('Rust schema graph contains an invalid alias group');
      }
      const paths = group as string[];
      for (const path of paths) {
        pointerSegments(path);
        if (seen.has(path)) throw new TypeError(`Rust schema graph repeats an alias path: ${path}`);
        seen.add(path);
      }
      const shared = getAtPointer(schema, paths[0]!);
      if (typeof shared !== 'object' || shared === null) {
        throw new TypeError(`Rust schema graph alias source is not an object: ${paths[0]}`);
      }
      const sharedJson = JSON.stringify(shared);
      for (const path of paths.slice(1)) {
        const target = getAtPointer(schema, path);
        if (typeof target !== 'object' || target === null) {
          throw new TypeError(`Rust schema graph alias target is not an object: ${path}`);
        }
        if (JSON.stringify(target) !== sharedJson) {
          throw new TypeError(`Rust schema graph alias values differ: ${path}`);
        }
        setAtPointer(schema, path, shared);
      }
    }
    return schema;
  };
}
