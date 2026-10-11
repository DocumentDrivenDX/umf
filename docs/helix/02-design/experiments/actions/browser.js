(() => {
  // src/model/types.ts
  class UmfError extends Error {
    code;
    path;
    constructor(code, message, path = "") {
      super(message);
      this.code = code;
      this.path = path;
      this.name = "UmfError";
    }
  }
  var pointer = (key) => key.replace(/~/g, "~0").replace(/\//g, "~1");

  // src/model/json.ts
  var LIMITS = { maxDepth: 128, maxValues: 1e5, maxTextLength: 4000000 };
  function copyJson(input) {
    const active = new Set;
    let values = 0;
    function visit(value, path, depth) {
      if (++values > LIMITS.maxValues || depth > LIMITS.maxDepth)
        throw new UmfError("LIMIT", "JSON structural limit exceeded", path);
      if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
      if (typeof value === "number") {
        if (!Number.isFinite(value) || Object.is(value, -0) || Number.isInteger(value) && !Number.isSafeInteger(value))
          throw new UmfError("NUMBER", "Number outside the core interoperable numeric profile", path);
        return value;
      }
      if (typeof value !== "object")
        throw new UmfError("NON_JSON", "Value is not JSON-compatible", path);
      if (active.has(value))
        throw new UmfError("CYCLE", "Cyclic value", path);
      const proto = Object.getPrototypeOf(value);
      if (Array.isArray(value) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
        throw new UmfError("NON_JSON", "Custom object prototype", path);
      if (Object.getOwnPropertySymbols(value).length)
        throw new UmfError("NON_JSON", "Symbol keys are not JSON-compatible", path);
      active.add(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const result = Array.isArray(value) ? [] : Object.create(null);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (Array.isArray(value) && key === "length")
          continue;
        if (!descriptor.enumerable || !("value" in descriptor))
          throw new UmfError("NON_JSON", "Hidden fields and accessors cannot be serialized faithfully", path + "/" + pointer(key));
        if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))
          throw new UmfError("NON_JSON", "Non-index array property", path);
        const item = visit(descriptor.value, path + "/" + pointer(key), depth + 1);
        Object.defineProperty(result, key, { value: item, enumerable: true, writable: true, configurable: true });
      }
      if (Array.isArray(value) && Object.keys(value).length !== value.length)
        throw new UmfError("NON_JSON", "Sparse arrays are not JSON values", path);
      active.delete(value);
      return result;
    }
    return visit(input, "", 0);
  }

  // docs/helix/02-design/experiments/actions/representation.ts
  function inspect(input) {
    const source = copyJson(input);
    if (!source || Array.isArray(source) || typeof source !== "object")
      throw Error("STRUCTURE");
    const required = ["id", "parameters", "preconditions", "postconditions", "reads", "writes", "binding"];
    if (required.some((k) => !Object.hasOwn(source, k)))
      throw Error("STRUCTURE");
    if (typeof source.id !== "string" || !source.id)
      throw Error("IDENTITY");
    for (const k of required.slice(1, -1))
      if (!Array.isArray(source[k]))
        throw Error("STRUCTURE");
    const known = new Set(required);
    const unchecked = Object.keys(source).filter((k) => !known.has(k));
    if (!["recipe", "handler"].includes(source.binding?.kind))
      unchecked.push("binding");
    for (const [i, r] of [...source.preconditions, ...source.postconditions].entries()) {
      if (typeof r?.language !== "string" || typeof r?.version !== "string" || typeof r?.expression !== "string")
        throw Error("RULE");
      unchecked.push("rule:" + i);
    }
    return { source, unchecked, declaredCompatible: false, executionVerified: false };
  }
  var candidates = [
    { id: "create-link", parameters: ["order", "customer", "product"], preconditions: [], postconditions: [], reads: ["customer", "product"], writes: ["order", "order-customer", "order-product"], binding: { kind: "recipe", effects: ["create order", "link customer", "link product"] } },
    { id: "approve", parameters: ["order"], preconditions: [], postconditions: [{ language: "spike.order", version: "1", expression: "post.order.status == approved" }], reads: ["order"], writes: ["order.status"], binding: { kind: "handler", id: "approve", version: "1" } },
    { id: "reserve", parameters: ["quantity", "order"], preconditions: [{ language: "spike.stock", version: "1", expression: "pre.stock >= quantity" }], postconditions: [{ language: "spike.stock", version: "1", expression: "post.stock == pre.stock - quantity" }], reads: ["stock"], writes: ["stock", "order"], binding: { kind: "handler", id: "reserve", version: "1" } }
  ];
  function probe() {
    const reports = candidates.map(inspect);
    const future = inspect({ ...candidates[0], future: { meaning: ["keep"] } });
    const retained = JSON.stringify(future.source) === JSON.stringify({ ...candidates[0], future: { meaning: ["keep"] } });
    let getterCalls = 0;
    const hostile = Object.defineProperty({}, "id", { enumerable: true, get() {
      getterCalls++;
      return "x";
    } });
    let refused = false;
    try {
      inspect(hostile);
    } catch {
      refused = true;
    }
    const copied = inspect(candidates[0]);
    copied.source.writes.push("unrelated");
    return { reports, retained, getterCalls, refused, isolated: candidates[0].writes.length === 3 };
  }

  // docs/helix/02-design/experiments/actions/browser-entry.ts
  globalThis.ActionSpike = { probe };
})();
