var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = undefined;

  class _CodeOrName {
  }
  exports._CodeOrName = _CodeOrName;
  exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;

  class Name extends _CodeOrName {
    constructor(s) {
      super();
      if (!exports.IDENTIFIER.test(s))
        throw new Error("CodeGen: name must be a valid identifier");
      this.str = s;
    }
    toString() {
      return this.str;
    }
    emptyStr() {
      return false;
    }
    get names() {
      return { [this.str]: 1 };
    }
  }
  exports.Name = Name;

  class _Code extends _CodeOrName {
    constructor(code) {
      super();
      this._items = typeof code === "string" ? [code] : code;
    }
    toString() {
      return this.str;
    }
    emptyStr() {
      if (this._items.length > 1)
        return false;
      const item = this._items[0];
      return item === "" || item === '""';
    }
    get str() {
      var _a;
      return (_a = this._str) !== null && _a !== undefined ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
    }
    get names() {
      var _a;
      return (_a = this._names) !== null && _a !== undefined ? _a : this._names = this._items.reduce((names, c) => {
        if (c instanceof Name)
          names[c.str] = (names[c.str] || 0) + 1;
        return names;
      }, {});
    }
  }
  exports._Code = _Code;
  exports.nil = new _Code("");
  function _(strs, ...args) {
    const code = [strs[0]];
    let i = 0;
    while (i < args.length) {
      addCodeArg(code, args[i]);
      code.push(strs[++i]);
    }
    return new _Code(code);
  }
  exports._ = _;
  var plus = new _Code("+");
  function str(strs, ...args) {
    const expr = [safeStringify(strs[0])];
    let i = 0;
    while (i < args.length) {
      expr.push(plus);
      addCodeArg(expr, args[i]);
      expr.push(plus, safeStringify(strs[++i]));
    }
    optimize(expr);
    return new _Code(expr);
  }
  exports.str = str;
  function addCodeArg(code, arg) {
    if (arg instanceof _Code)
      code.push(...arg._items);
    else if (arg instanceof Name)
      code.push(arg);
    else
      code.push(interpolate(arg));
  }
  exports.addCodeArg = addCodeArg;
  function optimize(expr) {
    let i = 1;
    while (i < expr.length - 1) {
      if (expr[i] === plus) {
        const res = mergeExprItems(expr[i - 1], expr[i + 1]);
        if (res !== undefined) {
          expr.splice(i - 1, 3, res);
          continue;
        }
        expr[i++] = "+";
      }
      i++;
    }
  }
  function mergeExprItems(a, b) {
    if (b === '""')
      return a;
    if (a === '""')
      return b;
    if (typeof a == "string") {
      if (b instanceof Name || a[a.length - 1] !== '"')
        return;
      if (typeof b != "string")
        return `${a.slice(0, -1)}${b}"`;
      if (b[0] === '"')
        return a.slice(0, -1) + b.slice(1);
      return;
    }
    if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
      return `"${a}${b.slice(1)}`;
    return;
  }
  function strConcat(c1, c2) {
    return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
  }
  exports.strConcat = strConcat;
  function interpolate(x) {
    return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
  }
  function stringify(x) {
    return new _Code(safeStringify(x));
  }
  exports.stringify = stringify;
  function safeStringify(x) {
    return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }
  exports.safeStringify = safeStringify;
  function getProperty(key) {
    return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
  }
  exports.getProperty = getProperty;
  function getEsmExportName(key) {
    if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
      return new _Code(`${key}`);
    }
    throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
  }
  exports.getEsmExportName = getEsmExportName;
  function regexpCode(rx) {
    return new _Code(rx.toString());
  }
  exports.regexpCode = regexpCode;
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = undefined;
  var code_1 = require_code();

  class ValueError extends Error {
    constructor(name) {
      super(`CodeGen: "code" for ${name} not defined`);
      this.value = name.value;
    }
  }
  var UsedValueState;
  (function(UsedValueState) {
    UsedValueState[UsedValueState["Started"] = 0] = "Started";
    UsedValueState[UsedValueState["Completed"] = 1] = "Completed";
  })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
  exports.varKinds = {
    const: new code_1.Name("const"),
    let: new code_1.Name("let"),
    var: new code_1.Name("var")
  };

  class Scope {
    constructor({ prefixes, parent } = {}) {
      this._names = {};
      this._prefixes = prefixes;
      this._parent = parent;
    }
    toName(nameOrPrefix) {
      return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
    }
    name(prefix) {
      return new code_1.Name(this._newName(prefix));
    }
    _newName(prefix) {
      const ng = this._names[prefix] || this._nameGroup(prefix);
      return `${prefix}${ng.index++}`;
    }
    _nameGroup(prefix) {
      var _a, _b;
      if (((_b = (_a = this._parent) === null || _a === undefined ? undefined : _a._prefixes) === null || _b === undefined ? undefined : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
        throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
      }
      return this._names[prefix] = { prefix, index: 0 };
    }
  }
  exports.Scope = Scope;

  class ValueScopeName extends code_1.Name {
    constructor(prefix, nameStr) {
      super(nameStr);
      this.prefix = prefix;
    }
    setValue(value, { property, itemIndex }) {
      this.value = value;
      this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
    }
  }
  exports.ValueScopeName = ValueScopeName;
  var line = (0, code_1._)`\n`;

  class ValueScope extends Scope {
    constructor(opts) {
      super(opts);
      this._values = {};
      this._scope = opts.scope;
      this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
    }
    get() {
      return this._scope;
    }
    name(prefix) {
      return new ValueScopeName(prefix, this._newName(prefix));
    }
    value(nameOrPrefix, value) {
      var _a;
      if (value.ref === undefined)
        throw new Error("CodeGen: ref must be passed in value");
      const name = this.toName(nameOrPrefix);
      const { prefix } = name;
      const valueKey = (_a = value.key) !== null && _a !== undefined ? _a : value.ref;
      let vs = this._values[prefix];
      if (vs) {
        const _name = vs.get(valueKey);
        if (_name)
          return _name;
      } else {
        vs = this._values[prefix] = new Map;
      }
      vs.set(valueKey, name);
      const s = this._scope[prefix] || (this._scope[prefix] = []);
      const itemIndex = s.length;
      s[itemIndex] = value.ref;
      name.setValue(value, { property: prefix, itemIndex });
      return name;
    }
    getValue(prefix, keyOrRef) {
      const vs = this._values[prefix];
      if (!vs)
        return;
      return vs.get(keyOrRef);
    }
    scopeRefs(scopeName, values = this._values) {
      return this._reduceValues(values, (name) => {
        if (name.scopePath === undefined)
          throw new Error(`CodeGen: name "${name}" has no value`);
        return (0, code_1._)`${scopeName}${name.scopePath}`;
      });
    }
    scopeCode(values = this._values, usedValues, getCode) {
      return this._reduceValues(values, (name) => {
        if (name.value === undefined)
          throw new Error(`CodeGen: name "${name}" has no value`);
        return name.value.code;
      }, usedValues, getCode);
    }
    _reduceValues(values, valueCode, usedValues = {}, getCode) {
      let code = code_1.nil;
      for (const prefix in values) {
        const vs = values[prefix];
        if (!vs)
          continue;
        const nameSet = usedValues[prefix] = usedValues[prefix] || new Map;
        vs.forEach((name) => {
          if (nameSet.has(name))
            return;
          nameSet.set(name, UsedValueState.Started);
          let c = valueCode(name);
          if (c) {
            const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
            code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
          } else if (c = getCode === null || getCode === undefined ? undefined : getCode(name)) {
            code = (0, code_1._)`${code}${c}${this.opts._n}`;
          } else {
            throw new ValueError(name);
          }
          nameSet.set(name, UsedValueState.Completed);
        });
      }
      return code;
    }
  }
  exports.ValueScope = ValueScope;
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = undefined;
  var code_1 = require_code();
  var scope_1 = require_scope();
  var code_2 = require_code();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return code_2._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return code_2.str;
  } });
  Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
    return code_2.strConcat;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return code_2.nil;
  } });
  Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
    return code_2.getProperty;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return code_2.stringify;
  } });
  Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
    return code_2.regexpCode;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return code_2.Name;
  } });
  var scope_2 = require_scope();
  Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
    return scope_2.Scope;
  } });
  Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
    return scope_2.ValueScope;
  } });
  Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
    return scope_2.ValueScopeName;
  } });
  Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
    return scope_2.varKinds;
  } });
  exports.operators = {
    GT: new code_1._Code(">"),
    GTE: new code_1._Code(">="),
    LT: new code_1._Code("<"),
    LTE: new code_1._Code("<="),
    EQ: new code_1._Code("==="),
    NEQ: new code_1._Code("!=="),
    NOT: new code_1._Code("!"),
    OR: new code_1._Code("||"),
    AND: new code_1._Code("&&"),
    ADD: new code_1._Code("+")
  };

  class Node {
    optimizeNodes() {
      return this;
    }
    optimizeNames(_names, _constants) {
      return this;
    }
  }

  class Def extends Node {
    constructor(varKind, name, rhs) {
      super();
      this.varKind = varKind;
      this.name = name;
      this.rhs = rhs;
    }
    render({ es5, _n }) {
      const varKind = es5 ? scope_1.varKinds.var : this.varKind;
      const rhs = this.rhs === undefined ? "" : ` = ${this.rhs}`;
      return `${varKind} ${this.name}${rhs};` + _n;
    }
    optimizeNames(names, constants) {
      if (!names[this.name.str])
        return;
      if (this.rhs)
        this.rhs = optimizeExpr(this.rhs, names, constants);
      return this;
    }
    get names() {
      return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
    }
  }

  class Assign extends Node {
    constructor(lhs, rhs, sideEffects) {
      super();
      this.lhs = lhs;
      this.rhs = rhs;
      this.sideEffects = sideEffects;
    }
    render({ _n }) {
      return `${this.lhs} = ${this.rhs};` + _n;
    }
    optimizeNames(names, constants) {
      if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
        return;
      this.rhs = optimizeExpr(this.rhs, names, constants);
      return this;
    }
    get names() {
      const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
      return addExprNames(names, this.rhs);
    }
  }

  class AssignOp extends Assign {
    constructor(lhs, op, rhs, sideEffects) {
      super(lhs, rhs, sideEffects);
      this.op = op;
    }
    render({ _n }) {
      return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
    }
  }

  class Label extends Node {
    constructor(label) {
      super();
      this.label = label;
      this.names = {};
    }
    render({ _n }) {
      return `${this.label}:` + _n;
    }
  }

  class Break extends Node {
    constructor(label) {
      super();
      this.label = label;
      this.names = {};
    }
    render({ _n }) {
      const label = this.label ? ` ${this.label}` : "";
      return `break${label};` + _n;
    }
  }

  class Throw extends Node {
    constructor(error) {
      super();
      this.error = error;
    }
    render({ _n }) {
      return `throw ${this.error};` + _n;
    }
    get names() {
      return this.error.names;
    }
  }

  class AnyCode extends Node {
    constructor(code) {
      super();
      this.code = code;
    }
    render({ _n }) {
      return `${this.code};` + _n;
    }
    optimizeNodes() {
      return `${this.code}` ? this : undefined;
    }
    optimizeNames(names, constants) {
      this.code = optimizeExpr(this.code, names, constants);
      return this;
    }
    get names() {
      return this.code instanceof code_1._CodeOrName ? this.code.names : {};
    }
  }

  class ParentNode extends Node {
    constructor(nodes = []) {
      super();
      this.nodes = nodes;
    }
    render(opts) {
      return this.nodes.reduce((code, n) => code + n.render(opts), "");
    }
    optimizeNodes() {
      const { nodes } = this;
      let i = nodes.length;
      while (i--) {
        const n = nodes[i].optimizeNodes();
        if (Array.isArray(n))
          nodes.splice(i, 1, ...n);
        else if (n)
          nodes[i] = n;
        else
          nodes.splice(i, 1);
      }
      return nodes.length > 0 ? this : undefined;
    }
    optimizeNames(names, constants) {
      const { nodes } = this;
      let i = nodes.length;
      while (i--) {
        const n = nodes[i];
        if (n.optimizeNames(names, constants))
          continue;
        subtractNames(names, n.names);
        nodes.splice(i, 1);
      }
      return nodes.length > 0 ? this : undefined;
    }
    get names() {
      return this.nodes.reduce((names, n) => addNames(names, n.names), {});
    }
  }

  class BlockNode extends ParentNode {
    render(opts) {
      return "{" + opts._n + super.render(opts) + "}" + opts._n;
    }
  }

  class Root extends ParentNode {
  }

  class Else extends BlockNode {
  }
  Else.kind = "else";

  class If extends BlockNode {
    constructor(condition, nodes) {
      super(nodes);
      this.condition = condition;
    }
    render(opts) {
      let code = `if(${this.condition})` + super.render(opts);
      if (this.else)
        code += "else " + this.else.render(opts);
      return code;
    }
    optimizeNodes() {
      super.optimizeNodes();
      const cond = this.condition;
      if (cond === true)
        return this.nodes;
      let e = this.else;
      if (e) {
        const ns = e.optimizeNodes();
        e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
      }
      if (e) {
        if (cond === false)
          return e instanceof If ? e : e.nodes;
        if (this.nodes.length)
          return this;
        return new If(not(cond), e instanceof If ? [e] : e.nodes);
      }
      if (cond === false || !this.nodes.length)
        return;
      return this;
    }
    optimizeNames(names, constants) {
      var _a;
      this.else = (_a = this.else) === null || _a === undefined ? undefined : _a.optimizeNames(names, constants);
      if (!(super.optimizeNames(names, constants) || this.else))
        return;
      this.condition = optimizeExpr(this.condition, names, constants);
      return this;
    }
    get names() {
      const names = super.names;
      addExprNames(names, this.condition);
      if (this.else)
        addNames(names, this.else.names);
      return names;
    }
  }
  If.kind = "if";

  class For extends BlockNode {
  }
  For.kind = "for";

  class ForLoop extends For {
    constructor(iteration) {
      super();
      this.iteration = iteration;
    }
    render(opts) {
      return `for(${this.iteration})` + super.render(opts);
    }
    optimizeNames(names, constants) {
      if (!super.optimizeNames(names, constants))
        return;
      this.iteration = optimizeExpr(this.iteration, names, constants);
      return this;
    }
    get names() {
      return addNames(super.names, this.iteration.names);
    }
  }

  class ForRange extends For {
    constructor(varKind, name, from, to) {
      super();
      this.varKind = varKind;
      this.name = name;
      this.from = from;
      this.to = to;
    }
    render(opts) {
      const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
      const { name, from, to } = this;
      return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
    }
    get names() {
      const names = addExprNames(super.names, this.from);
      return addExprNames(names, this.to);
    }
  }

  class ForIter extends For {
    constructor(loop, varKind, name, iterable) {
      super();
      this.loop = loop;
      this.varKind = varKind;
      this.name = name;
      this.iterable = iterable;
    }
    render(opts) {
      return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
    }
    optimizeNames(names, constants) {
      if (!super.optimizeNames(names, constants))
        return;
      this.iterable = optimizeExpr(this.iterable, names, constants);
      return this;
    }
    get names() {
      return addNames(super.names, this.iterable.names);
    }
  }

  class Func extends BlockNode {
    constructor(name, args, async) {
      super();
      this.name = name;
      this.args = args;
      this.async = async;
    }
    render(opts) {
      const _async = this.async ? "async " : "";
      return `${_async}function ${this.name}(${this.args})` + super.render(opts);
    }
  }
  Func.kind = "func";

  class Return extends ParentNode {
    render(opts) {
      return "return " + super.render(opts);
    }
  }
  Return.kind = "return";

  class Try extends BlockNode {
    render(opts) {
      let code = "try" + super.render(opts);
      if (this.catch)
        code += this.catch.render(opts);
      if (this.finally)
        code += this.finally.render(opts);
      return code;
    }
    optimizeNodes() {
      var _a, _b;
      super.optimizeNodes();
      (_a = this.catch) === null || _a === undefined || _a.optimizeNodes();
      (_b = this.finally) === null || _b === undefined || _b.optimizeNodes();
      return this;
    }
    optimizeNames(names, constants) {
      var _a, _b;
      super.optimizeNames(names, constants);
      (_a = this.catch) === null || _a === undefined || _a.optimizeNames(names, constants);
      (_b = this.finally) === null || _b === undefined || _b.optimizeNames(names, constants);
      return this;
    }
    get names() {
      const names = super.names;
      if (this.catch)
        addNames(names, this.catch.names);
      if (this.finally)
        addNames(names, this.finally.names);
      return names;
    }
  }

  class Catch extends BlockNode {
    constructor(error) {
      super();
      this.error = error;
    }
    render(opts) {
      return `catch(${this.error})` + super.render(opts);
    }
  }
  Catch.kind = "catch";

  class Finally extends BlockNode {
    render(opts) {
      return "finally" + super.render(opts);
    }
  }
  Finally.kind = "finally";

  class CodeGen {
    constructor(extScope, opts = {}) {
      this._values = {};
      this._blockStarts = [];
      this._constants = {};
      this.opts = { ...opts, _n: opts.lines ? `
` : "" };
      this._extScope = extScope;
      this._scope = new scope_1.Scope({ parent: extScope });
      this._nodes = [new Root];
    }
    toString() {
      return this._root.render(this.opts);
    }
    name(prefix) {
      return this._scope.name(prefix);
    }
    scopeName(prefix) {
      return this._extScope.name(prefix);
    }
    scopeValue(prefixOrName, value) {
      const name = this._extScope.value(prefixOrName, value);
      const vs = this._values[name.prefix] || (this._values[name.prefix] = new Set);
      vs.add(name);
      return name;
    }
    getScopeValue(prefix, keyOrRef) {
      return this._extScope.getValue(prefix, keyOrRef);
    }
    scopeRefs(scopeName) {
      return this._extScope.scopeRefs(scopeName, this._values);
    }
    scopeCode() {
      return this._extScope.scopeCode(this._values);
    }
    _def(varKind, nameOrPrefix, rhs, constant) {
      const name = this._scope.toName(nameOrPrefix);
      if (rhs !== undefined && constant)
        this._constants[name.str] = rhs;
      this._leafNode(new Def(varKind, name, rhs));
      return name;
    }
    const(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
    }
    let(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
    }
    var(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
    }
    assign(lhs, rhs, sideEffects) {
      return this._leafNode(new Assign(lhs, rhs, sideEffects));
    }
    add(lhs, rhs) {
      return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
    }
    code(c) {
      if (typeof c == "function")
        c();
      else if (c !== code_1.nil)
        this._leafNode(new AnyCode(c));
      return this;
    }
    object(...keyValues) {
      const code = ["{"];
      for (const [key, value] of keyValues) {
        if (code.length > 1)
          code.push(",");
        code.push(key);
        if (key !== value || this.opts.es5) {
          code.push(":");
          (0, code_1.addCodeArg)(code, value);
        }
      }
      code.push("}");
      return new code_1._Code(code);
    }
    if(condition, thenBody, elseBody) {
      this._blockNode(new If(condition));
      if (thenBody && elseBody) {
        this.code(thenBody).else().code(elseBody).endIf();
      } else if (thenBody) {
        this.code(thenBody).endIf();
      } else if (elseBody) {
        throw new Error('CodeGen: "else" body without "then" body');
      }
      return this;
    }
    elseIf(condition) {
      return this._elseNode(new If(condition));
    }
    else() {
      return this._elseNode(new Else);
    }
    endIf() {
      return this._endBlockNode(If, Else);
    }
    _for(node, forBody) {
      this._blockNode(node);
      if (forBody)
        this.code(forBody).endFor();
      return this;
    }
    for(iteration, forBody) {
      return this._for(new ForLoop(iteration), forBody);
    }
    forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
      const name = this._scope.toName(nameOrPrefix);
      return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
    }
    forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
      const name = this._scope.toName(nameOrPrefix);
      if (this.opts.es5) {
        const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
        return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
          this.var(name, (0, code_1._)`${arr}[${i}]`);
          forBody(name);
        });
      }
      return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
    }
    forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
      if (this.opts.ownProperties) {
        return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
      }
      const name = this._scope.toName(nameOrPrefix);
      return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
    }
    endFor() {
      return this._endBlockNode(For);
    }
    label(label) {
      return this._leafNode(new Label(label));
    }
    break(label) {
      return this._leafNode(new Break(label));
    }
    return(value) {
      const node = new Return;
      this._blockNode(node);
      this.code(value);
      if (node.nodes.length !== 1)
        throw new Error('CodeGen: "return" should have one node');
      return this._endBlockNode(Return);
    }
    try(tryBody, catchCode, finallyCode) {
      if (!catchCode && !finallyCode)
        throw new Error('CodeGen: "try" without "catch" and "finally"');
      const node = new Try;
      this._blockNode(node);
      this.code(tryBody);
      if (catchCode) {
        const error = this.name("e");
        this._currNode = node.catch = new Catch(error);
        catchCode(error);
      }
      if (finallyCode) {
        this._currNode = node.finally = new Finally;
        this.code(finallyCode);
      }
      return this._endBlockNode(Catch, Finally);
    }
    throw(error) {
      return this._leafNode(new Throw(error));
    }
    block(body, nodeCount) {
      this._blockStarts.push(this._nodes.length);
      if (body)
        this.code(body).endBlock(nodeCount);
      return this;
    }
    endBlock(nodeCount) {
      const len = this._blockStarts.pop();
      if (len === undefined)
        throw new Error("CodeGen: not in self-balancing block");
      const toClose = this._nodes.length - len;
      if (toClose < 0 || nodeCount !== undefined && toClose !== nodeCount) {
        throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
      }
      this._nodes.length = len;
      return this;
    }
    func(name, args = code_1.nil, async, funcBody) {
      this._blockNode(new Func(name, args, async));
      if (funcBody)
        this.code(funcBody).endFunc();
      return this;
    }
    endFunc() {
      return this._endBlockNode(Func);
    }
    optimize(n = 1) {
      while (n-- > 0) {
        this._root.optimizeNodes();
        this._root.optimizeNames(this._root.names, this._constants);
      }
    }
    _leafNode(node) {
      this._currNode.nodes.push(node);
      return this;
    }
    _blockNode(node) {
      this._currNode.nodes.push(node);
      this._nodes.push(node);
    }
    _endBlockNode(N1, N2) {
      const n = this._currNode;
      if (n instanceof N1 || N2 && n instanceof N2) {
        this._nodes.pop();
        return this;
      }
      throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
    }
    _elseNode(node) {
      const n = this._currNode;
      if (!(n instanceof If)) {
        throw new Error('CodeGen: "else" without "if"');
      }
      this._currNode = n.else = node;
      return this;
    }
    get _root() {
      return this._nodes[0];
    }
    get _currNode() {
      const ns = this._nodes;
      return ns[ns.length - 1];
    }
    set _currNode(node) {
      const ns = this._nodes;
      ns[ns.length - 1] = node;
    }
  }
  exports.CodeGen = CodeGen;
  function addNames(names, from) {
    for (const n in from)
      names[n] = (names[n] || 0) + (from[n] || 0);
    return names;
  }
  function addExprNames(names, from) {
    return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
  }
  function optimizeExpr(expr, names, constants) {
    if (expr instanceof code_1.Name)
      return replaceName(expr);
    if (!canOptimize(expr))
      return expr;
    return new code_1._Code(expr._items.reduce((items, c) => {
      if (c instanceof code_1.Name)
        c = replaceName(c);
      if (c instanceof code_1._Code)
        items.push(...c._items);
      else
        items.push(c);
      return items;
    }, []));
    function replaceName(n) {
      const c = constants[n.str];
      if (c === undefined || names[n.str] !== 1)
        return n;
      delete names[n.str];
      return c;
    }
    function canOptimize(e) {
      return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== undefined);
    }
  }
  function subtractNames(names, from) {
    for (const n in from)
      names[n] = (names[n] || 0) - (from[n] || 0);
  }
  function not(x) {
    return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
  }
  exports.not = not;
  var andCode = mappend(exports.operators.AND);
  function and(...args) {
    return args.reduce(andCode);
  }
  exports.and = and;
  var orCode = mappend(exports.operators.OR);
  function or(...args) {
    return args.reduce(orCode);
  }
  exports.or = or;
  function mappend(op) {
    return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
  }
  function par(x) {
    return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = undefined;
  var codegen_1 = require_codegen();
  var code_1 = require_code();
  function toHash(arr) {
    const hash = {};
    for (const item of arr)
      hash[item] = true;
    return hash;
  }
  exports.toHash = toHash;
  function alwaysValidSchema(it, schema) {
    if (typeof schema == "boolean")
      return schema;
    if (Object.keys(schema).length === 0)
      return true;
    checkUnknownRules(it, schema);
    return !schemaHasRules(schema, it.self.RULES.all);
  }
  exports.alwaysValidSchema = alwaysValidSchema;
  function checkUnknownRules(it, schema = it.schema) {
    const { opts, self } = it;
    if (!opts.strictSchema)
      return;
    if (typeof schema === "boolean")
      return;
    const rules = self.RULES.keywords;
    for (const key in schema) {
      if (!rules[key])
        checkStrictMode(it, `unknown keyword: "${key}"`);
    }
  }
  exports.checkUnknownRules = checkUnknownRules;
  function schemaHasRules(schema, rules) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (rules[key])
        return true;
    return false;
  }
  exports.schemaHasRules = schemaHasRules;
  function schemaHasRulesButRef(schema, RULES) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (key !== "$ref" && RULES.all[key])
        return true;
    return false;
  }
  exports.schemaHasRulesButRef = schemaHasRulesButRef;
  function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
    if (!$data) {
      if (typeof schema == "number" || typeof schema == "boolean")
        return schema;
      if (typeof schema == "string")
        return (0, codegen_1._)`${schema}`;
    }
    return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
  }
  exports.schemaRefOrVal = schemaRefOrVal;
  function unescapeFragment(str) {
    return unescapeJsonPointer(decodeURIComponent(str));
  }
  exports.unescapeFragment = unescapeFragment;
  function escapeFragment(str) {
    return encodeURIComponent(escapeJsonPointer(str));
  }
  exports.escapeFragment = escapeFragment;
  function escapeJsonPointer(str) {
    if (typeof str == "number")
      return `${str}`;
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  exports.escapeJsonPointer = escapeJsonPointer;
  function unescapeJsonPointer(str) {
    return str.replace(/~1/g, "/").replace(/~0/g, "~");
  }
  exports.unescapeJsonPointer = unescapeJsonPointer;
  function eachItem(xs, f) {
    if (Array.isArray(xs)) {
      for (const x of xs)
        f(x);
    } else {
      f(xs);
    }
  }
  exports.eachItem = eachItem;
  function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
    return (gen, from, to, toName) => {
      const res = to === undefined ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
      return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
    };
  }
  exports.mergeEvaluated = {
    props: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
        gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
      }),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
        if (from === true) {
          gen.assign(to, true);
        } else {
          gen.assign(to, (0, codegen_1._)`${to} || {}`);
          setEvaluated(gen, to, from);
        }
      }),
      mergeValues: (from, to) => from === true ? true : { ...from, ...to },
      resultToName: evaluatedPropsToName
    }),
    items: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
      mergeValues: (from, to) => from === true ? true : Math.max(from, to),
      resultToName: (gen, items) => gen.var("items", items)
    })
  };
  function evaluatedPropsToName(gen, ps) {
    if (ps === true)
      return gen.var("props", true);
    const props = gen.var("props", (0, codegen_1._)`{}`);
    if (ps !== undefined)
      setEvaluated(gen, props, ps);
    return props;
  }
  exports.evaluatedPropsToName = evaluatedPropsToName;
  function setEvaluated(gen, props, ps) {
    Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
  }
  exports.setEvaluated = setEvaluated;
  var snippets = {};
  function useFunc(gen, f) {
    return gen.scopeValue("func", {
      ref: f,
      code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
    });
  }
  exports.useFunc = useFunc;
  var Type;
  (function(Type) {
    Type[Type["Num"] = 0] = "Num";
    Type[Type["Str"] = 1] = "Str";
  })(Type || (exports.Type = Type = {}));
  function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
    if (dataProp instanceof codegen_1.Name) {
      const isNumber = dataPropType === Type.Num;
      return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
    }
    return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
  }
  exports.getErrorPath = getErrorPath;
  function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
    if (!mode)
      return;
    msg = `strict mode: ${msg}`;
    if (mode === true)
      throw new Error(msg);
    it.self.logger.warn(msg);
  }
  exports.checkStrictMode = checkStrictMode;
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var names = {
    data: new codegen_1.Name("data"),
    valCxt: new codegen_1.Name("valCxt"),
    instancePath: new codegen_1.Name("instancePath"),
    parentData: new codegen_1.Name("parentData"),
    parentDataProperty: new codegen_1.Name("parentDataProperty"),
    rootData: new codegen_1.Name("rootData"),
    dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
    vErrors: new codegen_1.Name("vErrors"),
    errors: new codegen_1.Name("errors"),
    this: new codegen_1.Name("this"),
    self: new codegen_1.Name("self"),
    scope: new codegen_1.Name("scope"),
    json: new codegen_1.Name("json"),
    jsonPos: new codegen_1.Name("jsonPos"),
    jsonLen: new codegen_1.Name("jsonLen"),
    jsonPart: new codegen_1.Name("jsonPart")
  };
  exports.default = names;
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var names_1 = require_names();
  exports.keywordError = {
    message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
  };
  exports.keyword$DataError = {
    message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
  };
  function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error, errorPaths);
    if (overrideAllErrors !== null && overrideAllErrors !== undefined ? overrideAllErrors : compositeRule || allErrors) {
      addError(gen, errObj);
    } else {
      returnErrors(it, (0, codegen_1._)`[${errObj}]`);
    }
  }
  exports.reportError = reportError;
  function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error, errorPaths);
    addError(gen, errObj);
    if (!(compositeRule || allErrors)) {
      returnErrors(it, names_1.default.vErrors);
    }
  }
  exports.reportExtraError = reportExtraError;
  function resetErrorsCount(gen, errsCount) {
    gen.assign(names_1.default.errors, errsCount);
    gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
  }
  exports.resetErrorsCount = resetErrorsCount;
  function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
    if (errsCount === undefined)
      throw new Error("ajv implementation error");
    const err = gen.name("err");
    gen.forRange("i", errsCount, names_1.default.errors, (i) => {
      gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
      gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
      gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
      if (it.opts.verbose) {
        gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
        gen.assign((0, codegen_1._)`${err}.data`, data);
      }
    });
  }
  exports.extendErrors = extendErrors;
  function addError(gen, errObj) {
    const err = gen.const("err", errObj);
    gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
    gen.code((0, codegen_1._)`${names_1.default.errors}++`);
  }
  function returnErrors(it, errs) {
    const { gen, validateName, schemaEnv } = it;
    if (schemaEnv.$async) {
      gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
      gen.return(false);
    }
  }
  var E = {
    keyword: new codegen_1.Name("keyword"),
    schemaPath: new codegen_1.Name("schemaPath"),
    params: new codegen_1.Name("params"),
    propertyName: new codegen_1.Name("propertyName"),
    message: new codegen_1.Name("message"),
    schema: new codegen_1.Name("schema"),
    parentSchema: new codegen_1.Name("parentSchema")
  };
  function errorObjectCode(cxt, error, errorPaths) {
    const { createErrors } = cxt.it;
    if (createErrors === false)
      return (0, codegen_1._)`{}`;
    return errorObject(cxt, error, errorPaths);
  }
  function errorObject(cxt, error, errorPaths = {}) {
    const { gen, it } = cxt;
    const keyValues = [
      errorInstancePath(it, errorPaths),
      errorSchemaPath(cxt, errorPaths)
    ];
    extraErrorProps(cxt, error, keyValues);
    return gen.object(...keyValues);
  }
  function errorInstancePath({ errorPath }, { instancePath }) {
    const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
    return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
  }
  function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
    let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
    if (schemaPath) {
      schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
    }
    return [E.schemaPath, schPath];
  }
  function extraErrorProps(cxt, { params, message }, keyValues) {
    const { keyword, data, schemaValue, it } = cxt;
    const { opts, propertyName, topSchemaRef, schemaPath } = it;
    keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
    if (opts.messages) {
      keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
    }
    if (opts.verbose) {
      keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
    }
    if (propertyName)
      keyValues.push([E.propertyName, propertyName]);
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = undefined;
  var errors_1 = require_errors();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var boolError = {
    message: "boolean schema is false"
  };
  function topBoolOrEmptySchema(it) {
    const { gen, schema, validateName } = it;
    if (schema === false) {
      falseSchemaError(it, false);
    } else if (typeof schema == "object" && schema.$async === true) {
      gen.return(names_1.default.data);
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, null);
      gen.return(true);
    }
  }
  exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
  function boolOrEmptySchema(it, valid) {
    const { gen, schema } = it;
    if (schema === false) {
      gen.var(valid, false);
      falseSchemaError(it);
    } else {
      gen.var(valid, true);
    }
  }
  exports.boolOrEmptySchema = boolOrEmptySchema;
  function falseSchemaError(it, overrideAllErrors) {
    const { gen, data } = it;
    const cxt = {
      gen,
      keyword: "false schema",
      data,
      schema: false,
      schemaCode: false,
      schemaValue: false,
      params: {},
      it
    };
    (0, errors_1.reportError)(cxt, boolError, undefined, overrideAllErrors);
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getRules = exports.isJSONType = undefined;
  var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
  var jsonTypes = new Set(_jsonTypes);
  function isJSONType(x) {
    return typeof x == "string" && jsonTypes.has(x);
  }
  exports.isJSONType = isJSONType;
  function getRules() {
    const groups = {
      number: { type: "number", rules: [] },
      string: { type: "string", rules: [] },
      array: { type: "array", rules: [] },
      object: { type: "object", rules: [] }
    };
    return {
      types: { ...groups, integer: true, boolean: true, null: true },
      rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
      post: { rules: [] },
      all: {},
      keywords: {}
    };
  }
  exports.getRules = getRules;
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = undefined;
  function schemaHasRulesForType({ schema, self }, type) {
    const group = self.RULES.types[type];
    return group && group !== true && shouldUseGroup(schema, group);
  }
  exports.schemaHasRulesForType = schemaHasRulesForType;
  function shouldUseGroup(schema, group) {
    return group.rules.some((rule) => shouldUseRule(schema, rule));
  }
  exports.shouldUseGroup = shouldUseGroup;
  function shouldUseRule(schema, rule) {
    var _a;
    return schema[rule.keyword] !== undefined || ((_a = rule.definition.implements) === null || _a === undefined ? undefined : _a.some((kwd) => schema[kwd] !== undefined));
  }
  exports.shouldUseRule = shouldUseRule;
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = undefined;
  var rules_1 = require_rules();
  var applicability_1 = require_applicability();
  var errors_1 = require_errors();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var DataType;
  (function(DataType) {
    DataType[DataType["Correct"] = 0] = "Correct";
    DataType[DataType["Wrong"] = 1] = "Wrong";
  })(DataType || (exports.DataType = DataType = {}));
  function getSchemaTypes(schema) {
    const types = getJSONTypes(schema.type);
    const hasNull = types.includes("null");
    if (hasNull) {
      if (schema.nullable === false)
        throw new Error("type: null contradicts nullable: false");
    } else {
      if (!types.length && schema.nullable !== undefined) {
        throw new Error('"nullable" cannot be used without "type"');
      }
      if (schema.nullable === true)
        types.push("null");
    }
    return types;
  }
  exports.getSchemaTypes = getSchemaTypes;
  function getJSONTypes(ts) {
    const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
    if (types.every(rules_1.isJSONType))
      return types;
    throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
  }
  exports.getJSONTypes = getJSONTypes;
  function coerceAndCheckDataType(it, types) {
    const { gen, data, opts } = it;
    const coerceTo = coerceToTypes(types, opts.coerceTypes);
    const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
    if (checkTypes) {
      const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
      gen.if(wrongType, () => {
        if (coerceTo.length)
          coerceData(it, types, coerceTo);
        else
          reportTypeError(it);
      });
    }
    return checkTypes;
  }
  exports.coerceAndCheckDataType = coerceAndCheckDataType;
  var COERCIBLE = new Set(["string", "number", "integer", "boolean", "null"]);
  function coerceToTypes(types, coerceTypes) {
    return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
  }
  function coerceData(it, types, coerceTo) {
    const { gen, data, opts } = it;
    const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
    const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
    if (opts.coerceTypes === "array") {
      gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
    }
    gen.if((0, codegen_1._)`${coerced} !== undefined`);
    for (const t of coerceTo) {
      if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
        coerceSpecificType(t);
      }
    }
    gen.else();
    reportTypeError(it);
    gen.endIf();
    gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
      gen.assign(data, coerced);
      assignParentData(it, coerced);
    });
    function coerceSpecificType(t) {
      switch (t) {
        case "string":
          gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
          return;
        case "number":
          gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "integer":
          gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "boolean":
          gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
          return;
        case "null":
          gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
          gen.assign(coerced, null);
          return;
        case "array":
          gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
      }
    }
  }
  function assignParentData({ gen, parentData, parentDataProperty }, expr) {
    gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
  }
  function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
    const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
    let cond;
    switch (dataType) {
      case "null":
        return (0, codegen_1._)`${data} ${EQ} null`;
      case "array":
        cond = (0, codegen_1._)`Array.isArray(${data})`;
        break;
      case "object":
        cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
        break;
      case "integer":
        cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
        break;
      case "number":
        cond = numCond();
        break;
      default:
        return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
    }
    return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
    function numCond(_cond = codegen_1.nil) {
      return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
    }
  }
  exports.checkDataType = checkDataType;
  function checkDataTypes(dataTypes, data, strictNums, correct) {
    if (dataTypes.length === 1) {
      return checkDataType(dataTypes[0], data, strictNums, correct);
    }
    let cond;
    const types = (0, util_1.toHash)(dataTypes);
    if (types.array && types.object) {
      const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
      cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
      delete types.null;
      delete types.array;
      delete types.object;
    } else {
      cond = codegen_1.nil;
    }
    if (types.number)
      delete types.integer;
    for (const t in types)
      cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
    return cond;
  }
  exports.checkDataTypes = checkDataTypes;
  var typeError = {
    message: ({ schema }) => `must be ${schema}`,
    params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
  };
  function reportTypeError(it) {
    const cxt = getTypeErrorContext(it);
    (0, errors_1.reportError)(cxt, typeError);
  }
  exports.reportTypeError = reportTypeError;
  function getTypeErrorContext(it) {
    const { gen, data, schema } = it;
    const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
    return {
      gen,
      keyword: "type",
      data,
      schema: schema.type,
      schemaCode,
      schemaValue: schemaCode,
      parentSchema: schema,
      params: {},
      it
    };
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.assignDefaults = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  function assignDefaults(it, ty) {
    const { properties, items } = it.schema;
    if (ty === "object" && properties) {
      for (const key in properties) {
        assignDefault(it, key, properties[key].default);
      }
    } else if (ty === "array" && Array.isArray(items)) {
      items.forEach((sch, i) => assignDefault(it, i, sch.default));
    }
  }
  exports.assignDefaults = assignDefaults;
  function assignDefault(it, prop, defaultValue) {
    const { gen, compositeRule, data, opts } = it;
    if (defaultValue === undefined)
      return;
    const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
    if (compositeRule) {
      (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
      return;
    }
    let condition = (0, codegen_1._)`${childData} === undefined`;
    if (opts.useDefaults === "empty") {
      condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
    }
    gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var names_1 = require_names();
  var util_2 = require_util();
  function checkReportMissingProp(cxt, prop) {
    const { gen, data, it } = cxt;
    gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
      cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
      cxt.error();
    });
  }
  exports.checkReportMissingProp = checkReportMissingProp;
  function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
    return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
  }
  exports.checkMissingProp = checkMissingProp;
  function reportMissingProp(cxt, missing) {
    cxt.setParams({ missingProperty: missing }, true);
    cxt.error();
  }
  exports.reportMissingProp = reportMissingProp;
  function hasPropFunc(gen) {
    return gen.scopeValue("func", {
      ref: Object.prototype.hasOwnProperty,
      code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
    });
  }
  exports.hasPropFunc = hasPropFunc;
  function isOwnProperty(gen, data, property) {
    return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
  }
  exports.isOwnProperty = isOwnProperty;
  function propertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
    return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
  }
  exports.propertyInData = propertyInData;
  function noPropertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
    return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
  }
  exports.noPropertyInData = noPropertyInData;
  function allSchemaProperties(schemaMap) {
    return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
  }
  exports.allSchemaProperties = allSchemaProperties;
  function schemaProperties(it, schemaMap) {
    return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
  }
  exports.schemaProperties = schemaProperties;
  function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
    const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
    const valCxt = [
      [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
      [names_1.default.parentData, it.parentData],
      [names_1.default.parentDataProperty, it.parentDataProperty],
      [names_1.default.rootData, names_1.default.rootData]
    ];
    if (it.opts.dynamicRef)
      valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
    const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
    return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
  }
  exports.callValidateCode = callValidateCode;
  var newRegExp = (0, codegen_1._)`new RegExp`;
  function usePattern({ gen, it: { opts } }, pattern) {
    const u = opts.unicodeRegExp ? "u" : "";
    const { regExp } = opts.code;
    const rx = regExp(pattern, u);
    return gen.scopeValue("pattern", {
      key: rx.toString(),
      ref: rx,
      code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
    });
  }
  exports.usePattern = usePattern;
  function validateArray(cxt) {
    const { gen, data, keyword, it } = cxt;
    const valid = gen.name("valid");
    if (it.allErrors) {
      const validArr = gen.let("valid", true);
      validateItems(() => gen.assign(validArr, false));
      return validArr;
    }
    gen.var(valid, true);
    validateItems(() => gen.break());
    return valid;
    function validateItems(notValid) {
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      gen.forRange("i", 0, len, (i) => {
        cxt.subschema({
          keyword,
          dataProp: i,
          dataPropType: util_1.Type.Num
        }, valid);
        gen.if((0, codegen_1.not)(valid), notValid);
      });
    }
  }
  exports.validateArray = validateArray;
  function validateUnion(cxt) {
    const { gen, schema, keyword, it } = cxt;
    if (!Array.isArray(schema))
      throw new Error("ajv implementation error");
    const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
    if (alwaysValid && !it.opts.unevaluated)
      return;
    const valid = gen.let("valid", false);
    const schValid = gen.name("_valid");
    gen.block(() => schema.forEach((_sch, i) => {
      const schCxt = cxt.subschema({
        keyword,
        schemaProp: i,
        compositeRule: true
      }, schValid);
      gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
      const merged = cxt.mergeValidEvaluated(schCxt, schValid);
      if (!merged)
        gen.if((0, codegen_1.not)(valid));
    }));
    cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
  }
  exports.validateUnion = validateUnion;
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = undefined;
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var code_1 = require_code2();
  var errors_1 = require_errors();
  function macroKeywordCode(cxt, def) {
    const { gen, keyword, schema, parentSchema, it } = cxt;
    const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
    const schemaRef = useKeyword(gen, keyword, macroSchema);
    if (it.opts.validateSchema !== false)
      it.self.validateSchema(macroSchema, true);
    const valid = gen.name("valid");
    cxt.subschema({
      schema: macroSchema,
      schemaPath: codegen_1.nil,
      errSchemaPath: `${it.errSchemaPath}/${keyword}`,
      topSchemaRef: schemaRef,
      compositeRule: true
    }, valid);
    cxt.pass(valid, () => cxt.error(true));
  }
  exports.macroKeywordCode = macroKeywordCode;
  function funcKeywordCode(cxt, def) {
    var _a;
    const { gen, keyword, schema, parentSchema, $data, it } = cxt;
    checkAsyncKeyword(it, def);
    const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
    const validateRef = useKeyword(gen, keyword, validate);
    const valid = gen.let("valid");
    cxt.block$data(valid, validateKeyword);
    cxt.ok((_a = def.valid) !== null && _a !== undefined ? _a : valid);
    function validateKeyword() {
      if (def.errors === false) {
        assignValid();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => cxt.error());
      } else {
        const ruleErrs = def.async ? validateAsync() : validateSync();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => addErrs(cxt, ruleErrs));
      }
    }
    function validateAsync() {
      const ruleErrs = gen.let("ruleErrs", null);
      gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
      return ruleErrs;
    }
    function validateSync() {
      const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
      gen.assign(validateErrs, null);
      assignValid(codegen_1.nil);
      return validateErrs;
    }
    function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
      const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
      const passSchema = !(("compile" in def) && !$data || def.schema === false);
      gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
    }
    function reportErrs(errors) {
      var _a;
      gen.if((0, codegen_1.not)((_a = def.valid) !== null && _a !== undefined ? _a : valid), errors);
    }
  }
  exports.funcKeywordCode = funcKeywordCode;
  function modifyData(cxt) {
    const { gen, data, it } = cxt;
    gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
  }
  function addErrs(cxt, errs) {
    const { gen } = cxt;
    gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      (0, errors_1.extendErrors)(cxt);
    }, () => cxt.error());
  }
  function checkAsyncKeyword({ schemaEnv }, def) {
    if (def.async && !schemaEnv.$async)
      throw new Error("async keyword in sync schema");
  }
  function useKeyword(gen, keyword, result) {
    if (result === undefined)
      throw new Error(`keyword "${keyword}" failed to compile`);
    return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
  }
  function validSchemaType(schema, schemaType, allowUndefined = false) {
    return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
  }
  exports.validSchemaType = validSchemaType;
  function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
    if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
      throw new Error("ajv implementation error");
    }
    const deps = def.dependencies;
    if (deps === null || deps === undefined ? undefined : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
      throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
    }
    if (def.validateSchema) {
      const valid = def.validateSchema(schema[keyword]);
      if (!valid) {
        const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
        if (opts.validateSchema === "log")
          self.logger.error(msg);
        else
          throw new Error(msg);
      }
    }
  }
  exports.validateKeywordUsage = validateKeywordUsage;
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
    if (keyword !== undefined && schema !== undefined) {
      throw new Error('both "keyword" and "schema" passed, only one allowed');
    }
    if (keyword !== undefined) {
      const sch = it.schema[keyword];
      return schemaProp === undefined ? {
        schema: sch,
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`
      } : {
        schema: sch[schemaProp],
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
      };
    }
    if (schema !== undefined) {
      if (schemaPath === undefined || errSchemaPath === undefined || topSchemaRef === undefined) {
        throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
      }
      return {
        schema,
        schemaPath,
        topSchemaRef,
        errSchemaPath
      };
    }
    throw new Error('either "keyword" or "schema" must be passed');
  }
  exports.getSubschema = getSubschema;
  function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
    if (data !== undefined && dataProp !== undefined) {
      throw new Error('both "data" and "dataProp" passed, only one allowed');
    }
    const { gen } = it;
    if (dataProp !== undefined) {
      const { errorPath, dataPathArr, opts } = it;
      const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
      dataContextProps(nextData);
      subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
      subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
      subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
    }
    if (data !== undefined) {
      const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
      dataContextProps(nextData);
      if (propertyName !== undefined)
        subschema.propertyName = propertyName;
    }
    if (dataTypes)
      subschema.dataTypes = dataTypes;
    function dataContextProps(_nextData) {
      subschema.data = _nextData;
      subschema.dataLevel = it.dataLevel + 1;
      subschema.dataTypes = [];
      it.definedProperties = new Set;
      subschema.parentData = it.data;
      subschema.dataNames = [...it.dataNames, _nextData];
    }
  }
  exports.extendSubschemaData = extendSubschemaData;
  function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
    if (compositeRule !== undefined)
      subschema.compositeRule = compositeRule;
    if (createErrors !== undefined)
      subschema.createErrors = createErrors;
    if (allErrors !== undefined)
      subschema.allErrors = allErrors;
    subschema.jtdDiscriminator = jtdDiscriminator;
    subschema.jtdMetadata = jtdMetadata;
  }
  exports.extendSubschemaMode = extendSubschemaMode;
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS(function(exports, module) {
  module.exports = function equal(a, b) {
    if (a === b)
      return true;
    if (a && b && typeof a == "object" && typeof b == "object") {
      if (a.constructor !== b.constructor)
        return false;
      var length, i, keys;
      if (Array.isArray(a)) {
        length = a.length;
        if (length != b.length)
          return false;
        for (i = length;i-- !== 0; )
          if (!equal(a[i], b[i]))
            return false;
        return true;
      }
      if (a.constructor === RegExp)
        return a.source === b.source && a.flags === b.flags;
      if (a.valueOf !== Object.prototype.valueOf)
        return a.valueOf() === b.valueOf();
      if (a.toString !== Object.prototype.toString)
        return a.toString() === b.toString();
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length)
        return false;
      for (i = length;i-- !== 0; )
        if (!Object.prototype.hasOwnProperty.call(b, keys[i]))
          return false;
      for (i = length;i-- !== 0; ) {
        var key = keys[i];
        if (!equal(a[key], b[key]))
          return false;
      }
      return true;
    }
    return a !== a && b !== b;
  };
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS(function(exports, module) {
  var traverse = module.exports = function(schema, opts, cb) {
    if (typeof opts == "function") {
      cb = opts;
      opts = {};
    }
    cb = opts.cb || cb;
    var pre = typeof cb == "function" ? cb : cb.pre || function() {};
    var post = cb.post || function() {};
    _traverse(opts, pre, post, schema, "", schema);
  };
  traverse.keywords = {
    additionalItems: true,
    items: true,
    contains: true,
    additionalProperties: true,
    propertyNames: true,
    not: true,
    if: true,
    then: true,
    else: true
  };
  traverse.arrayKeywords = {
    items: true,
    allOf: true,
    anyOf: true,
    oneOf: true
  };
  traverse.propsKeywords = {
    $defs: true,
    definitions: true,
    properties: true,
    patternProperties: true,
    dependencies: true
  };
  traverse.skipKeywords = {
    default: true,
    enum: true,
    const: true,
    required: true,
    maximum: true,
    minimum: true,
    exclusiveMaximum: true,
    exclusiveMinimum: true,
    multipleOf: true,
    maxLength: true,
    minLength: true,
    pattern: true,
    format: true,
    maxItems: true,
    minItems: true,
    uniqueItems: true,
    maxProperties: true,
    minProperties: true
  };
  function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
    if (schema && typeof schema == "object" && !Array.isArray(schema)) {
      pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      for (var key in schema) {
        var sch = schema[key];
        if (Array.isArray(sch)) {
          if (key in traverse.arrayKeywords) {
            for (var i = 0;i < sch.length; i++)
              _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
          }
        } else if (key in traverse.propsKeywords) {
          if (sch && typeof sch == "object") {
            for (var prop in sch)
              _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
          }
        } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
          _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
        }
      }
      post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
    }
  }
  function escapeJsonPtr(str) {
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = undefined;
  var util_1 = require_util();
  var equal = require_fast_deep_equal();
  var traverse = require_json_schema_traverse();
  var SIMPLE_INLINED = new Set([
    "type",
    "format",
    "pattern",
    "maxLength",
    "minLength",
    "maxProperties",
    "minProperties",
    "maxItems",
    "minItems",
    "maximum",
    "minimum",
    "uniqueItems",
    "multipleOf",
    "required",
    "enum",
    "const"
  ]);
  function inlineRef(schema, limit = true) {
    if (typeof schema == "boolean")
      return true;
    if (limit === true)
      return !hasRef(schema);
    if (!limit)
      return false;
    return countKeys(schema) <= limit;
  }
  exports.inlineRef = inlineRef;
  var REF_KEYWORDS = new Set([
    "$ref",
    "$recursiveRef",
    "$recursiveAnchor",
    "$dynamicRef",
    "$dynamicAnchor"
  ]);
  function hasRef(schema) {
    for (const key in schema) {
      if (REF_KEYWORDS.has(key))
        return true;
      const sch = schema[key];
      if (Array.isArray(sch) && sch.some(hasRef))
        return true;
      if (typeof sch == "object" && hasRef(sch))
        return true;
    }
    return false;
  }
  function countKeys(schema) {
    let count = 0;
    for (const key in schema) {
      if (key === "$ref")
        return Infinity;
      count++;
      if (SIMPLE_INLINED.has(key))
        continue;
      if (typeof schema[key] == "object") {
        (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
      }
      if (count === Infinity)
        return Infinity;
    }
    return count;
  }
  function getFullPath(resolver, id = "", normalize) {
    if (normalize !== false)
      id = normalizeId(id);
    const p = resolver.parse(id);
    return _getFullPath(resolver, p);
  }
  exports.getFullPath = getFullPath;
  function _getFullPath(resolver, p) {
    const serialized = resolver.serialize(p);
    return serialized.split("#")[0] + "#";
  }
  exports._getFullPath = _getFullPath;
  var TRAILING_SLASH_HASH = /#\/?$/;
  function normalizeId(id) {
    return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
  }
  exports.normalizeId = normalizeId;
  function resolveUrl(resolver, baseId, id) {
    id = normalizeId(id);
    return resolver.resolve(baseId, id);
  }
  exports.resolveUrl = resolveUrl;
  var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
  function getSchemaRefs(schema, baseId) {
    if (typeof schema == "boolean")
      return {};
    const { schemaId, uriResolver } = this.opts;
    const schId = normalizeId(schema[schemaId] || baseId);
    const baseIds = { "": schId };
    const pathPrefix = getFullPath(uriResolver, schId, false);
    const localRefs = {};
    const schemaRefs = new Set;
    traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
      if (parentJsonPtr === undefined)
        return;
      const fullPath = pathPrefix + jsonPtr;
      let innerBaseId = baseIds[parentJsonPtr];
      if (typeof sch[schemaId] == "string")
        innerBaseId = addRef.call(this, sch[schemaId]);
      addAnchor.call(this, sch.$anchor);
      addAnchor.call(this, sch.$dynamicAnchor);
      baseIds[jsonPtr] = innerBaseId;
      function addRef(ref) {
        const _resolve = this.opts.uriResolver.resolve;
        ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
        if (schemaRefs.has(ref))
          throw ambiguos(ref);
        schemaRefs.add(ref);
        let schOrRef = this.refs[ref];
        if (typeof schOrRef == "string")
          schOrRef = this.refs[schOrRef];
        if (typeof schOrRef == "object") {
          checkAmbiguosRef(sch, schOrRef.schema, ref);
        } else if (ref !== normalizeId(fullPath)) {
          if (ref[0] === "#") {
            checkAmbiguosRef(sch, localRefs[ref], ref);
            localRefs[ref] = sch;
          } else {
            this.refs[ref] = fullPath;
          }
        }
        return ref;
      }
      function addAnchor(anchor) {
        if (typeof anchor == "string") {
          if (!ANCHOR.test(anchor))
            throw new Error(`invalid anchor "${anchor}"`);
          addRef.call(this, `#${anchor}`);
        }
      }
    });
    return localRefs;
    function checkAmbiguosRef(sch1, sch2, ref) {
      if (sch2 !== undefined && !equal(sch1, sch2))
        throw ambiguos(ref);
    }
    function ambiguos(ref) {
      return new Error(`reference "${ref}" resolves to more than one schema`);
    }
  }
  exports.getSchemaRefs = getSchemaRefs;
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getData = exports.KeywordCxt = exports.validateFunctionCode = undefined;
  var boolSchema_1 = require_boolSchema();
  var dataType_1 = require_dataType();
  var applicability_1 = require_applicability();
  var dataType_2 = require_dataType();
  var defaults_1 = require_defaults();
  var keyword_1 = require_keyword();
  var subschema_1 = require_subschema();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var resolve_1 = require_resolve();
  var util_1 = require_util();
  var errors_1 = require_errors();
  function validateFunctionCode(it) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        topSchemaObjCode(it);
        return;
      }
    }
    validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
  }
  exports.validateFunctionCode = validateFunctionCode;
  function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
    if (opts.code.es5) {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
        gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
        destructureValCxtES5(gen, opts);
        gen.code(body);
      });
    } else {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
    }
  }
  function destructureValCxt(opts) {
    return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
  }
  function destructureValCxtES5(gen, opts) {
    gen.if(names_1.default.valCxt, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
      gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
    }, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.rootData, names_1.default.data);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
    });
  }
  function topSchemaObjCode(it) {
    const { schema, opts, gen } = it;
    validateFunction(it, () => {
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      checkNoDefault(it);
      gen.let(names_1.default.vErrors, null);
      gen.let(names_1.default.errors, 0);
      if (opts.unevaluated)
        resetEvaluated(it);
      typeAndKeywords(it);
      returnResults(it);
    });
    return;
  }
  function resetEvaluated(it) {
    const { gen, validateName } = it;
    it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
  }
  function funcSourceUrl(schema, opts) {
    const schId = typeof schema == "object" && schema[opts.schemaId];
    return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
  }
  function subschemaCode(it, valid) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        subSchemaObjCode(it, valid);
        return;
      }
    }
    (0, boolSchema_1.boolOrEmptySchema)(it, valid);
  }
  function schemaCxtHasRules({ schema, self }) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (self.RULES.all[key])
        return true;
    return false;
  }
  function isSchemaObj(it) {
    return typeof it.schema != "boolean";
  }
  function subSchemaObjCode(it, valid) {
    const { schema, gen, opts } = it;
    if (opts.$comment && schema.$comment)
      commentKeyword(it);
    updateContext(it);
    checkAsyncSchema(it);
    const errsCount = gen.const("_errs", names_1.default.errors);
    typeAndKeywords(it, errsCount);
    gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
  }
  function checkKeywords(it) {
    (0, util_1.checkUnknownRules)(it);
    checkRefsAndKeywords(it);
  }
  function typeAndKeywords(it, errsCount) {
    if (it.opts.jtd)
      return schemaKeywords(it, [], false, errsCount);
    const types = (0, dataType_1.getSchemaTypes)(it.schema);
    const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
    schemaKeywords(it, types, !checkedTypes, errsCount);
  }
  function checkRefsAndKeywords(it) {
    const { schema, errSchemaPath, opts, self } = it;
    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
      self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
    }
  }
  function checkNoDefault(it) {
    const { schema, opts } = it;
    if (schema.default !== undefined && opts.useDefaults && opts.strictSchema) {
      (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
    }
  }
  function updateContext(it) {
    const schId = it.schema[it.opts.schemaId];
    if (schId)
      it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
  }
  function checkAsyncSchema(it) {
    if (it.schema.$async && !it.schemaEnv.$async)
      throw new Error("async schema in sync schema");
  }
  function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
    const msg = schema.$comment;
    if (opts.$comment === true) {
      gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
    } else if (typeof opts.$comment == "function") {
      const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
      const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
      gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
    }
  }
  function returnResults(it) {
    const { gen, schemaEnv, validateName, ValidationError, opts } = it;
    if (schemaEnv.$async) {
      gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
      if (opts.unevaluated)
        assignEvaluated(it);
      gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
    }
  }
  function assignEvaluated({ gen, evaluated, props, items }) {
    if (props instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.props`, props);
    if (items instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.items`, items);
  }
  function schemaKeywords(it, types, typeErrors, errsCount) {
    const { gen, schema, data, allErrors, opts, self } = it;
    const { RULES } = self;
    if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
      gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
      return;
    }
    if (!opts.jtd)
      checkStrictTypes(it, types);
    gen.block(() => {
      for (const group of RULES.rules)
        groupKeywords(group);
      groupKeywords(RULES.post);
    });
    function groupKeywords(group) {
      if (!(0, applicability_1.shouldUseGroup)(schema, group))
        return;
      if (group.type) {
        gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
        iterateKeywords(it, group);
        if (types.length === 1 && types[0] === group.type && typeErrors) {
          gen.else();
          (0, dataType_2.reportTypeError)(it);
        }
        gen.endIf();
      } else {
        iterateKeywords(it, group);
      }
      if (!allErrors)
        gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
    }
  }
  function iterateKeywords(it, group) {
    const { gen, schema, opts: { useDefaults } } = it;
    if (useDefaults)
      (0, defaults_1.assignDefaults)(it, group.type);
    gen.block(() => {
      for (const rule of group.rules) {
        if ((0, applicability_1.shouldUseRule)(schema, rule)) {
          keywordCode(it, rule.keyword, rule.definition, group.type);
        }
      }
    });
  }
  function checkStrictTypes(it, types) {
    if (it.schemaEnv.meta || !it.opts.strictTypes)
      return;
    checkContextTypes(it, types);
    if (!it.opts.allowUnionTypes)
      checkMultipleTypes(it, types);
    checkKeywordTypes(it, it.dataTypes);
  }
  function checkContextTypes(it, types) {
    if (!types.length)
      return;
    if (!it.dataTypes.length) {
      it.dataTypes = types;
      return;
    }
    types.forEach((t) => {
      if (!includesType(it.dataTypes, t)) {
        strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
      }
    });
    narrowSchemaTypes(it, types);
  }
  function checkMultipleTypes(it, ts) {
    if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
      strictTypesError(it, "use allowUnionTypes to allow union type keyword");
    }
  }
  function checkKeywordTypes(it, ts) {
    const rules = it.self.RULES.all;
    for (const keyword in rules) {
      const rule = rules[keyword];
      if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
        const { type } = rule.definition;
        if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
          strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
        }
      }
    }
  }
  function hasApplicableType(schTs, kwdT) {
    return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
  }
  function includesType(ts, t) {
    return ts.includes(t) || t === "integer" && ts.includes("number");
  }
  function narrowSchemaTypes(it, withTypes) {
    const ts = [];
    for (const t of it.dataTypes) {
      if (includesType(withTypes, t))
        ts.push(t);
      else if (withTypes.includes("integer") && t === "number")
        ts.push("integer");
    }
    it.dataTypes = ts;
  }
  function strictTypesError(it, msg) {
    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
    msg += ` at "${schemaPath}" (strictTypes)`;
    (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
  }

  class KeywordCxt {
    constructor(it, def, keyword) {
      (0, keyword_1.validateKeywordUsage)(it, def, keyword);
      this.gen = it.gen;
      this.allErrors = it.allErrors;
      this.keyword = keyword;
      this.data = it.data;
      this.schema = it.schema[keyword];
      this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
      this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
      this.schemaType = def.schemaType;
      this.parentSchema = it.schema;
      this.params = {};
      this.it = it;
      this.def = def;
      if (this.$data) {
        this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
      } else {
        this.schemaCode = this.schemaValue;
        if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
          throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
        }
      }
      if ("code" in def ? def.trackErrors : def.errors !== false) {
        this.errsCount = it.gen.const("_errs", names_1.default.errors);
      }
    }
    result(condition, successAction, failAction) {
      this.failResult((0, codegen_1.not)(condition), successAction, failAction);
    }
    failResult(condition, successAction, failAction) {
      this.gen.if(condition);
      if (failAction)
        failAction();
      else
        this.error();
      if (successAction) {
        this.gen.else();
        successAction();
        if (this.allErrors)
          this.gen.endIf();
      } else {
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
    }
    pass(condition, failAction) {
      this.failResult((0, codegen_1.not)(condition), undefined, failAction);
    }
    fail(condition) {
      if (condition === undefined) {
        this.error();
        if (!this.allErrors)
          this.gen.if(false);
        return;
      }
      this.gen.if(condition);
      this.error();
      if (this.allErrors)
        this.gen.endIf();
      else
        this.gen.else();
    }
    fail$data(condition) {
      if (!this.$data)
        return this.fail(condition);
      const { schemaCode } = this;
      this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
    }
    error(append, errorParams, errorPaths) {
      if (errorParams) {
        this.setParams(errorParams);
        this._error(append, errorPaths);
        this.setParams({});
        return;
      }
      this._error(append, errorPaths);
    }
    _error(append, errorPaths) {
      (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
    }
    $dataError() {
      (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
    }
    reset() {
      if (this.errsCount === undefined)
        throw new Error('add "trackErrors" to keyword definition');
      (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
    }
    ok(cond) {
      if (!this.allErrors)
        this.gen.if(cond);
    }
    setParams(obj, assign) {
      if (assign)
        Object.assign(this.params, obj);
      else
        this.params = obj;
    }
    block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
      this.gen.block(() => {
        this.check$data(valid, $dataValid);
        codeBlock();
      });
    }
    check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
      if (!this.$data)
        return;
      const { gen, schemaCode, schemaType, def } = this;
      gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
      if (valid !== codegen_1.nil)
        gen.assign(valid, true);
      if (schemaType.length || def.validateSchema) {
        gen.elseIf(this.invalid$data());
        this.$dataError();
        if (valid !== codegen_1.nil)
          gen.assign(valid, false);
      }
      gen.else();
    }
    invalid$data() {
      const { gen, schemaCode, schemaType, def, it } = this;
      return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
      function wrong$DataType() {
        if (schemaType.length) {
          if (!(schemaCode instanceof codegen_1.Name))
            throw new Error("ajv implementation error");
          const st = Array.isArray(schemaType) ? schemaType : [schemaType];
          return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
        }
        return codegen_1.nil;
      }
      function invalid$DataSchema() {
        if (def.validateSchema) {
          const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
          return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
        }
        return codegen_1.nil;
      }
    }
    subschema(appl, valid) {
      const subschema = (0, subschema_1.getSubschema)(this.it, appl);
      (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
      (0, subschema_1.extendSubschemaMode)(subschema, appl);
      const nextContext = { ...this.it, ...subschema, items: undefined, props: undefined };
      subschemaCode(nextContext, valid);
      return nextContext;
    }
    mergeEvaluated(schemaCxt, toName) {
      const { it, gen } = this;
      if (!it.opts.unevaluated)
        return;
      if (it.props !== true && schemaCxt.props !== undefined) {
        it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
      }
      if (it.items !== true && schemaCxt.items !== undefined) {
        it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
      }
    }
    mergeValidEvaluated(schemaCxt, valid) {
      const { it, gen } = this;
      if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
        gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
        return true;
      }
    }
  }
  exports.KeywordCxt = KeywordCxt;
  function keywordCode(it, keyword, def, ruleType) {
    const cxt = new KeywordCxt(it, def, keyword);
    if ("code" in def) {
      def.code(cxt, ruleType);
    } else if (cxt.$data && def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    } else if ("macro" in def) {
      (0, keyword_1.macroKeywordCode)(cxt, def);
    } else if (def.compile || def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    }
  }
  var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
  var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
  function getData($data, { dataLevel, dataNames, dataPathArr }) {
    let jsonPointer;
    let data;
    if ($data === "")
      return names_1.default.rootData;
    if ($data[0] === "/") {
      if (!JSON_POINTER.test($data))
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      jsonPointer = $data;
      data = names_1.default.rootData;
    } else {
      const matches = RELATIVE_JSON_POINTER.exec($data);
      if (!matches)
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      const up = +matches[1];
      jsonPointer = matches[2];
      if (jsonPointer === "#") {
        if (up >= dataLevel)
          throw new Error(errorMsg("property/index", up));
        return dataPathArr[dataLevel - up];
      }
      if (up > dataLevel)
        throw new Error(errorMsg("data", up));
      data = dataNames[dataLevel - up];
      if (!jsonPointer)
        return data;
    }
    let expr = data;
    const segments = jsonPointer.split("/");
    for (const segment of segments) {
      if (segment) {
        data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
        expr = (0, codegen_1._)`${expr} && ${data}`;
      }
    }
    return expr;
    function errorMsg(pointerType, up) {
      return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
    }
  }
  exports.getData = getData;
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });

  class ValidationError extends Error {
    constructor(errors) {
      super("validation failed");
      this.errors = errors;
      this.ajv = this.validation = true;
    }
  }
  exports.default = ValidationError;
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var resolve_1 = require_resolve();

  class MissingRefError extends Error {
    constructor(resolver, baseId, ref, msg) {
      super(msg || `can't resolve reference ${ref} from id ${baseId}`);
      this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
      this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
    }
  }
  exports.default = MissingRefError;
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = undefined;
  var codegen_1 = require_codegen();
  var validation_error_1 = require_validation_error();
  var names_1 = require_names();
  var resolve_1 = require_resolve();
  var util_1 = require_util();
  var validate_1 = require_validate();

  class SchemaEnv {
    constructor(env) {
      var _a;
      this.refs = {};
      this.dynamicAnchors = {};
      let schema;
      if (typeof env.schema == "object")
        schema = env.schema;
      this.schema = env.schema;
      this.schemaId = env.schemaId;
      this.root = env.root || this;
      this.baseId = (_a = env.baseId) !== null && _a !== undefined ? _a : (0, resolve_1.normalizeId)(schema === null || schema === undefined ? undefined : schema[env.schemaId || "$id"]);
      this.schemaPath = env.schemaPath;
      this.localRefs = env.localRefs;
      this.meta = env.meta;
      this.$async = schema === null || schema === undefined ? undefined : schema.$async;
      this.refs = {};
    }
  }
  exports.SchemaEnv = SchemaEnv;
  function compileSchema(sch) {
    const _sch = getCompilingSchema.call(this, sch);
    if (_sch)
      return _sch;
    const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
    const { es5, lines } = this.opts.code;
    const { ownProperties } = this.opts;
    const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
    let _ValidationError;
    if (sch.$async) {
      _ValidationError = gen.scopeValue("Error", {
        ref: validation_error_1.default,
        code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
      });
    }
    const validateName = gen.scopeName("validate");
    sch.validateName = validateName;
    const schemaCxt = {
      gen,
      allErrors: this.opts.allErrors,
      data: names_1.default.data,
      parentData: names_1.default.parentData,
      parentDataProperty: names_1.default.parentDataProperty,
      dataNames: [names_1.default.data],
      dataPathArr: [codegen_1.nil],
      dataLevel: 0,
      dataTypes: [],
      definedProperties: new Set,
      topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
      validateName,
      ValidationError: _ValidationError,
      schema: sch.schema,
      schemaEnv: sch,
      rootId,
      baseId: sch.baseId || rootId,
      schemaPath: codegen_1.nil,
      errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
      errorPath: (0, codegen_1._)`""`,
      opts: this.opts,
      self: this
    };
    let sourceCode;
    try {
      this._compilations.add(sch);
      (0, validate_1.validateFunctionCode)(schemaCxt);
      gen.optimize(this.opts.code.optimize);
      const validateCode = gen.toString();
      sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
      if (this.opts.code.process)
        sourceCode = this.opts.code.process(sourceCode, sch);
      const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
      const validate = makeValidate(this, this.scope.get());
      this.scope.value(validateName, { ref: validate });
      validate.errors = null;
      validate.schema = sch.schema;
      validate.schemaEnv = sch;
      if (sch.$async)
        validate.$async = true;
      if (this.opts.code.source === true) {
        validate.source = { validateName, validateCode, scopeValues: gen._values };
      }
      if (this.opts.unevaluated) {
        const { props, items } = schemaCxt;
        validate.evaluated = {
          props: props instanceof codegen_1.Name ? undefined : props,
          items: items instanceof codegen_1.Name ? undefined : items,
          dynamicProps: props instanceof codegen_1.Name,
          dynamicItems: items instanceof codegen_1.Name
        };
        if (validate.source)
          validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
      }
      sch.validate = validate;
      return sch;
    } catch (e) {
      delete sch.validate;
      delete sch.validateName;
      if (sourceCode)
        this.logger.error("Error compiling schema, function code:", sourceCode);
      throw e;
    } finally {
      this._compilations.delete(sch);
    }
  }
  exports.compileSchema = compileSchema;
  function resolveRef(root, baseId, ref) {
    var _a;
    ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
    const schOrFunc = root.refs[ref];
    if (schOrFunc)
      return schOrFunc;
    let _sch = resolve.call(this, root, ref);
    if (_sch === undefined) {
      const schema = (_a = root.localRefs) === null || _a === undefined ? undefined : _a[ref];
      const { schemaId } = this.opts;
      if (schema)
        _sch = new SchemaEnv({ schema, schemaId, root, baseId });
    }
    if (_sch === undefined)
      return;
    return root.refs[ref] = inlineOrCompile.call(this, _sch);
  }
  exports.resolveRef = resolveRef;
  function inlineOrCompile(sch) {
    if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
      return sch.schema;
    return sch.validate ? sch : compileSchema.call(this, sch);
  }
  function getCompilingSchema(schEnv) {
    for (const sch of this._compilations) {
      if (sameSchemaEnv(sch, schEnv))
        return sch;
    }
  }
  exports.getCompilingSchema = getCompilingSchema;
  function sameSchemaEnv(s1, s2) {
    return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
  }
  function resolve(root, ref) {
    let sch;
    while (typeof (sch = this.refs[ref]) == "string")
      ref = sch;
    return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
  }
  function resolveSchema(root, ref) {
    const p = this.opts.uriResolver.parse(ref);
    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, undefined);
    if (Object.keys(root.schema).length > 0 && refPath === baseId) {
      return getJsonPointer.call(this, p, root);
    }
    const id = (0, resolve_1.normalizeId)(refPath);
    const schOrRef = this.refs[id] || this.schemas[id];
    if (typeof schOrRef == "string") {
      const sch = resolveSchema.call(this, root, schOrRef);
      if (typeof (sch === null || sch === undefined ? undefined : sch.schema) !== "object")
        return;
      return getJsonPointer.call(this, p, sch);
    }
    if (typeof (schOrRef === null || schOrRef === undefined ? undefined : schOrRef.schema) !== "object")
      return;
    if (!schOrRef.validate)
      compileSchema.call(this, schOrRef);
    if (id === (0, resolve_1.normalizeId)(ref)) {
      const { schema } = schOrRef;
      const { schemaId } = this.opts;
      const schId = schema[schemaId];
      if (schId)
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      return new SchemaEnv({ schema, schemaId, root, baseId });
    }
    return getJsonPointer.call(this, p, schOrRef);
  }
  exports.resolveSchema = resolveSchema;
  var PREVENT_SCOPE_CHANGE = new Set([
    "properties",
    "patternProperties",
    "enum",
    "dependencies",
    "definitions"
  ]);
  function getJsonPointer(parsedRef, { baseId, schema, root }) {
    var _a;
    if (((_a = parsedRef.fragment) === null || _a === undefined ? undefined : _a[0]) !== "/")
      return;
    for (const part of parsedRef.fragment.slice(1).split("/")) {
      if (typeof schema === "boolean")
        return;
      const partSchema = schema[(0, util_1.unescapeFragment)(part)];
      if (partSchema === undefined)
        return;
      schema = partSchema;
      const schId = typeof schema === "object" && schema[this.opts.schemaId];
      if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      }
    }
    let env;
    if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
      const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
      env = resolveSchema.call(this, root, $ref);
    }
    const { schemaId } = this.opts;
    env = env || new SchemaEnv({ schema, schemaId, root, baseId });
    if (env.schema !== env.root.schema)
      return env;
    return;
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS(function(exports, module) {
  module.exports = {
    $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
    description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
    type: "object",
    required: ["$data"],
    properties: {
      $data: {
        type: "string",
        anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
      }
    },
    additionalProperties: false
  };
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS(function(exports, module) {
  var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
  var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
  var isPort = RegExp.prototype.test.bind(/^\d*$/u);
  var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
  var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
  var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
  var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
  var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
  var BYTE_HEX = new Array(256);
  {
    const HEX_DIGITS = "0123456789ABCDEF";
    for (let i = 0;i < 256; i++) {
      BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
    }
  }
  function percentEncodeNonAscii(cp) {
    if (cp < 2048) {
      return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
    }
    if (cp < 65536) {
      return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
    }
    return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
  }
  function stringArrayToHexStripped(input) {
    let acc = "";
    let code = 0;
    let i = 0;
    for (i = 0;i < input.length; i++) {
      code = input[i].charCodeAt(0);
      if (code === 48) {
        continue;
      }
      if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
        return "";
      }
      acc += input[i];
      break;
    }
    for (i += 1;i < input.length; i++) {
      code = input[i].charCodeAt(0);
      if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
        return "";
      }
      acc += input[i];
    }
    return acc;
  }
  var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
  var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
  var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
  var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
  function isZoneIdentifier(zone) {
    if (zone.length === 0)
      return false;
    for (let i = 0;i < zone.length; i++) {
      if (isZoneCharacter(zone[i]))
        continue;
      if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
        i += 2;
        continue;
      }
      return false;
    }
    return true;
  }
  function compressIPv6ZeroRun(hextets) {
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;
    let runLength = 0;
    for (let i = 0;i < hextets.length; i++) {
      if (hextets[i] === "0") {
        if (runStart === -1)
          runStart = i;
        runLength++;
        if (runLength > bestLength) {
          bestLength = runLength;
          bestStart = runStart;
        }
      } else {
        runStart = -1;
        runLength = 0;
      }
    }
    if (bestLength < 2)
      return hextets.join(":");
    const head = hextets.slice(0, bestStart).join(":");
    const tail = hextets.slice(bestStart + bestLength).join(":");
    return head + "::" + tail;
  }
  function normalizeIPv6Address(input) {
    const compression = input.indexOf("::");
    if (compression !== -1 && input.indexOf("::", compression + 1) !== -1)
      return;
    const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
    const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
    if (compression !== -1) {
      if (left.length === 1 && left[0] === "")
        left.length = 0;
      if (right.length === 1 && right[0] === "")
        right.length = 0;
    }
    const parts = left.concat(right);
    let hextetCount = 0;
    for (let i = 0;i < parts.length; i++) {
      const part = parts[i];
      if (part === "")
        return;
      if (part.indexOf(".") !== -1) {
        if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part))
          return;
        hextetCount += 2;
        continue;
      }
      if (!isHextet(part))
        return;
      parts[i] = parseInt(part, 16).toString(16);
      hextetCount++;
    }
    if (compression === -1) {
      if (hextetCount !== 8)
        return;
      return compressIPv6ZeroRun(parts);
    }
    if (hextetCount >= 8)
      return;
    const expanded = parts.slice(0, left.length);
    for (let i = hextetCount;i < 8; i++)
      expanded.push("0");
    for (let i = left.length;i < parts.length; i++)
      expanded.push(parts[i]);
    return compressIPv6ZeroRun(expanded);
  }
  function normalizeIPv6(host) {
    const bracketed = host[0] === "[" && host[host.length - 1] === "]";
    const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
    if (hasBracket && !bracketed)
      return { host, isIPV6: false, error: true };
    let input = bracketed ? host.slice(1, -1) : host;
    if (bracketed && isIPvFuture(input)) {
      input = input.toLowerCase();
      return { host: `[${input}]`, escapedHost: input, isIPV6: false, isIPVFuture: true };
    }
    if (findToken(input, ":") < 2) {
      return { host, isIPV6: false, error: bracketed };
    }
    let zoneIdentifier = "";
    const zoneSeparator = input.indexOf("%");
    if (zoneSeparator !== -1) {
      const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
      zoneIdentifier = input.slice(zoneSeparator + separatorLength);
      if (!isZoneIdentifier(zoneIdentifier))
        return { host, isIPV6: false, error: true };
      input = input.slice(0, zoneSeparator);
    }
    const address = normalizeIPv6Address(input);
    if (address === undefined)
      return { host, isIPV6: false, error: true };
    return {
      host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
      escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
      isIPV6: true
    };
  }
  function findToken(str, token) {
    let ind = 0;
    for (let i = 0;i < str.length; i++) {
      if (str[i] === token)
        ind++;
    }
    return ind;
  }
  function removeDotSegments(path) {
    let input = path;
    const output = [];
    let nextSlash = -1;
    let len = 0;
    while (len = input.length) {
      if (len === 1) {
        if (input === ".") {
          break;
        } else if (input === "/") {
          output.push("/");
          break;
        } else {
          output.push(input);
          break;
        }
      } else if (len === 2) {
        if (input[0] === ".") {
          if (input[1] === ".") {
            break;
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === "." || input[1] === "/") {
            output.push("/");
            break;
          }
        }
      } else if (len === 3) {
        if (input === "/..") {
          if (output.length !== 0) {
            output.pop();
          }
          output.push("/");
          break;
        }
      }
      if (input[0] === ".") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(3);
            continue;
          }
        } else if (input[1] === "/") {
          input = input.slice(2);
          continue;
        }
      } else if (input[0] === "/") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(2);
            continue;
          } else if (input[2] === ".") {
            if (input[3] === "/") {
              input = input.slice(3);
              if (output.length !== 0) {
                output.pop();
              }
              continue;
            }
          }
        }
      }
      if ((nextSlash = input.indexOf("/", 1)) === -1) {
        output.push(input);
        break;
      } else {
        output.push(input.slice(0, nextSlash));
        input = input.slice(nextSlash);
      }
    }
    return output.join("");
  }
  var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
  var HOST_DELIM_RE = /[@/?#:]/g;
  var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
  function reescapeHostDelimiters(host, isIP) {
    const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
    re.lastIndex = 0;
    return host.replace(re, (ch) => HOST_DELIMS[ch]);
  }
  function normalizePercentEncoding(input, decodeUnreserved = false) {
    if (input.indexOf("%") === -1) {
      return input;
    }
    let output = "";
    for (let i = 0;i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decodeUnreserved && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      output += input[i];
    }
    return output;
  }
  function normalizePathEncoding(input) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decoded !== "." && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isPathCharacter(ch)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function serializePathEncoding(input, pathNoScheme = false) {
    let output = "";
    let firstSegment = pathNoScheme && input[0] !== "/";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      if (ch === "/") {
        firstSegment = false;
      }
      if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function encodeComponent(input, isAllowed) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      if (isAllowed(ch)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function encodeUserinfo(input) {
    return encodeComponent(input, isUserinfoCharacter);
  }
  function encodeQuery(input) {
    return encodeComponent(input, isQueryFragmentCharacter);
  }
  function encodeFragment(input) {
    return encodeComponent(input, isQueryFragmentCharacter);
  }
  function isEscapeSafe(cp) {
    return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
  }
  function normalizeQueryFragmentEncoding(input) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isQueryFragmentCharacter(ch)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function escapePreservingEscapes(input) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      output += escape(input[i]);
    }
    return output;
  }
  function recomposeAuthority(component) {
    const uriTokens = [];
    if (component.userinfo !== undefined) {
      uriTokens.push(encodeUserinfo(component.userinfo));
      uriTokens.push("@");
    }
    if (component.host !== undefined) {
      let host = component.host;
      if (!isIPv4(host)) {
        let ipV6res = normalizeIPv6(host);
        if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
          host = normalizePercentEncoding(host, true);
          ipV6res = normalizeIPv6(host);
        }
        if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
          host = `[${ipV6res.escapedHost}]`;
        } else {
          host = reescapeHostDelimiters(host, false);
        }
      }
      uriTokens.push(host);
    }
    if (typeof component.port === "number" || typeof component.port === "string") {
      const port = String(component.port);
      if (!isPort(port)) {
        throw new TypeError("URI port is malformed.");
      }
      uriTokens.push(":");
      uriTokens.push(port);
    }
    return uriTokens.length ? uriTokens.join("") : undefined;
  }
  module.exports = {
    nonSimpleDomain,
    recomposeAuthority,
    reescapeHostDelimiters,
    normalizePercentEncoding,
    normalizePathEncoding,
    serializePathEncoding,
    normalizeQueryFragmentEncoding,
    encodeUserinfo,
    encodeQuery,
    encodeFragment,
    escapePreservingEscapes,
    removeDotSegments,
    isIPv4,
    isUUID,
    normalizeIPv6,
    stringArrayToHexStripped
  };
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS(function(exports, module) {
  var { isUUID } = require_utils();
  var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
  var supportedSchemeNames = [
    "http",
    "https",
    "ws",
    "wss",
    "urn",
    "urn:uuid"
  ];
  function isValidSchemeName(name) {
    return supportedSchemeNames.indexOf(name) !== -1;
  }
  function wsIsSecure(wsComponent) {
    if (wsComponent.secure === true) {
      return true;
    } else if (wsComponent.secure === false) {
      return false;
    } else if (wsComponent.scheme) {
      return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
    } else {
      return false;
    }
  }
  function httpParse(component) {
    if (!component.host) {
      component.error = component.error || "HTTP URIs must have a host.";
    }
    return component;
  }
  function httpSerialize(component) {
    const secure = String(component.scheme).toLowerCase() === "https";
    if (component.port === (secure ? 443 : 80) || component.port === "") {
      component.port = undefined;
    }
    if (!component.path) {
      component.path = "/";
    }
    return component;
  }
  function wsParse(wsComponent) {
    wsComponent.secure = wsIsSecure(wsComponent);
    wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
    wsComponent.path = undefined;
    wsComponent.query = undefined;
    return wsComponent;
  }
  function wsSerialize(wsComponent) {
    if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
      wsComponent.port = undefined;
    }
    if (typeof wsComponent.secure === "boolean") {
      wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
      wsComponent.secure = undefined;
    }
    if (wsComponent.resourceName) {
      const queryIndex = wsComponent.resourceName.indexOf("?");
      const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
      wsComponent.path = path && path !== "/" ? path : undefined;
      wsComponent.query = queryIndex === -1 ? undefined : wsComponent.resourceName.slice(queryIndex + 1);
      wsComponent.resourceName = undefined;
    }
    wsComponent.fragment = undefined;
    return wsComponent;
  }
  function urnParse(urnComponent, options) {
    if (!urnComponent.path) {
      urnComponent.error = "URN can not be parsed";
      return urnComponent;
    }
    const matches = urnComponent.path.match(URN_REG);
    if (matches && matches[0] === urnComponent.path) {
      const scheme = options.scheme || urnComponent.scheme || "urn";
      urnComponent.nid = matches[1].toLowerCase();
      urnComponent.nss = matches[2];
      const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      urnComponent.path = undefined;
      if (schemeHandler) {
        urnComponent = schemeHandler.parse(urnComponent, options);
      }
    } else {
      urnComponent.error = urnComponent.error || "URN can not be parsed.";
    }
    return urnComponent;
  }
  function urnSerialize(urnComponent, options) {
    if (urnComponent.nid === undefined) {
      throw new Error("URN without nid cannot be serialized");
    }
    const scheme = options.scheme || urnComponent.scheme || "urn";
    const nid = urnComponent.nid.toLowerCase();
    const urnScheme = `${scheme}:${options.nid || nid}`;
    const schemeHandler = getSchemeHandler(urnScheme);
    if (schemeHandler) {
      urnComponent = schemeHandler.serialize(urnComponent, options);
    }
    const uriComponent = urnComponent;
    const nss = urnComponent.nss;
    uriComponent.path = `${nid || options.nid}:${nss}`;
    options.skipEscape = true;
    return uriComponent;
  }
  function urnuuidParse(urnComponent, options) {
    const uuidComponent = urnComponent;
    uuidComponent.uuid = uuidComponent.nss;
    uuidComponent.nss = undefined;
    if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
      uuidComponent.error = uuidComponent.error || "UUID is not valid.";
    }
    return uuidComponent;
  }
  function urnuuidSerialize(uuidComponent) {
    const urnComponent = uuidComponent;
    urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
    return urnComponent;
  }
  var http = {
    scheme: "http",
    domainHost: true,
    parse: httpParse,
    serialize: httpSerialize
  };
  var https = {
    scheme: "https",
    domainHost: http.domainHost,
    parse: httpParse,
    serialize: httpSerialize
  };
  var ws = {
    scheme: "ws",
    domainHost: true,
    parse: wsParse,
    serialize: wsSerialize
  };
  var wss = {
    scheme: "wss",
    domainHost: ws.domainHost,
    parse: ws.parse,
    serialize: ws.serialize
  };
  var urn = {
    scheme: "urn",
    parse: urnParse,
    serialize: urnSerialize,
    skipNormalize: true
  };
  var urnuuid = {
    scheme: "urn:uuid",
    parse: urnuuidParse,
    serialize: urnuuidSerialize,
    skipNormalize: true
  };
  var SCHEMES = {
    http,
    https,
    ws,
    wss,
    urn,
    "urn:uuid": urnuuid
  };
  Object.setPrototypeOf(SCHEMES, null);
  function getSchemeHandler(scheme) {
    return scheme && (SCHEMES[scheme] || SCHEMES[scheme.toLowerCase()]) || undefined;
  }
  module.exports = {
    wsIsSecure,
    SCHEMES,
    isValidSchemeName,
    getSchemeHandler
  };
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS(function(exports, module) {
  var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
  var { SCHEMES, getSchemeHandler } = require_schemes();
  var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
  var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
  function decodeValidScheme(scheme) {
    const decodedScheme = unescape(String(scheme));
    if (!VALID_SCHEME.test(decodedScheme)) {
      throw new TypeError(MALFORMED_SCHEME_ERROR);
    }
    return decodedScheme;
  }
  function normalize(uri, options) {
    if (typeof uri === "string") {
      uri = normalizeString(uri, options);
    } else if (typeof uri === "object") {
      uri = parse(serialize(uri, options), options);
    }
    return uri;
  }
  function resolve(baseURI, relativeURI, options) {
    const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
    const {
      parsed: baseParsed,
      malformedAuthorityOrPort: baseMalformed,
      malformedPercentEncoding: baseMalformedPercentEncoding,
      malformedSchemeSpecific: baseMalformedSchemeSpecific,
      malformedHost: baseMalformedHost,
      malformedScheme: baseMalformedScheme
    } = parseWithStatus(baseURI, schemelessOptions);
    const {
      parsed: relativeParsed,
      malformedAuthorityOrPort: relativeMalformed,
      malformedPercentEncoding: relativeMalformedPercentEncoding,
      malformedSchemeSpecific: relativeMalformedSchemeSpecific,
      malformedHost: relativeMalformedHost,
      malformedScheme: relativeMalformedScheme
    } = parseWithStatus(relativeURI, schemelessOptions);
    if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
      throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
    }
    const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
    const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
    const resolvedHost = resolved.host;
    const resolvedHostIsIP = resolvedHost !== undefined && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
    canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
    const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !/\P{ASCII}/u.test(resolvedHost);
    if (resolved.error && !encodedASCIIHost) {
      throw new Error(resolved.error);
    }
    schemelessOptions.skipEscape = true;
    return serialize(resolved, schemelessOptions);
  }
  function resolveComponent(base, relative, options, skipNormalization) {
    const target = {};
    if (!skipNormalization) {
      base = parse(serialize(base, options), options);
      relative = parse(serialize(relative, options), options);
    }
    options = options || {};
    if (!options.tolerant && relative.scheme) {
      target.scheme = relative.scheme;
      target.userinfo = relative.userinfo;
      target.host = relative.host;
      target.port = relative.port;
      target.path = removeDotSegments(relative.path || "");
      target.query = relative.query;
    } else {
      if (relative.userinfo !== undefined || relative.host !== undefined || relative.port !== undefined) {
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (!relative.path) {
          target.path = base.path;
          if (relative.query !== undefined) {
            target.query = relative.query;
          } else {
            target.query = base.query;
          }
        } else {
          if (relative.path[0] === "/") {
            target.path = removeDotSegments(relative.path);
          } else {
            if ((base.userinfo !== undefined || base.host !== undefined || base.port !== undefined) && !base.path) {
              target.path = "/" + relative.path;
            } else if (!base.path) {
              target.path = relative.path;
            } else {
              target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
            }
            target.path = removeDotSegments(target.path);
          }
          target.query = relative.query;
        }
        target.userinfo = base.userinfo;
        target.host = base.host;
        target.port = base.port;
      }
      target.scheme = base.scheme;
    }
    target.fragment = relative.fragment;
    return target;
  }
  function equal(uriA, uriB, options) {
    const normalizedA = normalizeComparableURI(uriA, options);
    const normalizedB = normalizeComparableURI(uriB, options);
    return normalizedA !== undefined && normalizedB !== undefined && normalizedA === normalizedB;
  }
  function serialize(cmpts, opts) {
    const component = {
      host: cmpts.host,
      scheme: cmpts.scheme,
      userinfo: cmpts.userinfo,
      port: cmpts.port,
      path: cmpts.path,
      query: cmpts.query,
      nid: cmpts.nid,
      nss: cmpts.nss,
      uuid: cmpts.uuid,
      fragment: cmpts.fragment,
      reference: cmpts.reference,
      resourceName: cmpts.resourceName,
      secure: cmpts.secure,
      error: ""
    };
    const options = Object.assign({}, opts);
    const uriTokens = [];
    if (component.scheme) {
      component.scheme = decodeValidScheme(component.scheme);
    }
    const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
    if (schemeHandler && schemeHandler.serialize)
      schemeHandler.serialize(component, options);
    const hasAuthority = component.userinfo !== undefined || component.host !== undefined || component.port !== undefined;
    const pathNoScheme = !options.skipEscape && component.scheme === undefined && !hasAuthority;
    if (component.path !== undefined) {
      if (!options.skipEscape) {
        component.path = serializePathEncoding(component.path, pathNoScheme);
      } else {
        component.path = normalizePercentEncoding(component.path);
      }
    }
    if (options.reference !== "suffix" && component.scheme) {
      component.scheme = decodeValidScheme(component.scheme);
      uriTokens.push(component.scheme, ":");
    }
    const authority = recomposeAuthority(component);
    if (authority !== undefined) {
      if (options.reference !== "suffix") {
        uriTokens.push("//");
      }
      uriTokens.push(authority);
      if (component.path && component.path[0] !== "/") {
        uriTokens.push("/");
      }
    }
    if (component.path !== undefined) {
      let s = component.path;
      if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
        s = removeDotSegments(s);
      }
      if (pathNoScheme) {
        s = serializePathEncoding(s, true);
      }
      if (authority === undefined && s[0] === "/" && s[1] === "/") {
        s = "/%2F" + s.slice(2);
      }
      uriTokens.push(s);
    }
    if (component.query !== undefined) {
      uriTokens.push("?", encodeQuery(component.query));
    }
    if (component.fragment !== undefined) {
      uriTokens.push("#", encodeFragment(component.fragment));
    }
    return uriTokens.join("");
  }
  var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
  var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
  var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
  function getParseError(parsed, matches) {
    if (matches[2] !== undefined && parsed.path && parsed.path[0] !== "/") {
      return 'URI path must start with "/" when authority is present.';
    }
    if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
      return "URI port is malformed.";
    }
    return;
  }
  function hasMalformedPercentEncoding(component) {
    if (component === undefined)
      return false;
    let percent = component.indexOf("%");
    while (percent !== -1) {
      if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
        return true;
      }
      percent = component.indexOf("%", percent + 3);
    }
    return false;
  }
  function isIPLiteral(host) {
    return host[0] === "[" && host[host.length - 1] === "]";
  }
  function hasMalformedComponentPercentEncoding(matches) {
    const host = matches[4];
    return hasMalformedPercentEncoding(matches[3]) || host !== undefined && !isIPLiteral(host) && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
  }
  function canonicalizeHost(parsed, options, schemeHandler, isIP) {
    if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && !isIPLiteral(parsed.host) && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
      try {
        parsed.host = new URL("http://" + parsed.host).hostname;
      } catch (e) {
        parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
        return true;
      }
    }
    return false;
  }
  function parseWithStatus(uri, opts) {
    const options = Object.assign({}, opts);
    const parsed = {
      scheme: undefined,
      userinfo: undefined,
      host: "",
      port: undefined,
      path: "",
      query: undefined,
      fragment: undefined
    };
    let malformedAuthorityOrPort = false;
    let malformedPercentEncoding = false;
    let malformedSchemeSpecific = false;
    let malformedHost = false;
    let malformedIPLiteral = false;
    let malformedScheme = false;
    let isIP = false;
    if (options.reference === "suffix") {
      if (options.scheme) {
        uri = options.scheme + ":" + uri;
      } else {
        uri = "//" + uri;
      }
    }
    const authorityMatch = uri.match(AUTHORITY_PREFIX);
    if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
      parsed.error = "URI authority must not contain a literal backslash.";
      malformedAuthorityOrPort = true;
    }
    const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
    if (introducerMatch !== null) {
      const region = introducerMatch[1];
      const normalizedRegion = region.replace(/[\t\n\r]/g, "");
      if (normalizedRegion.length >= 2) {
        if (normalizedRegion.slice(0, 2) !== "//") {
          parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
          malformedAuthorityOrPort = true;
        } else if (region.length !== normalizedRegion.length) {
          parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
          malformedAuthorityOrPort = true;
        }
      }
    }
    const matches = uri.match(URI_PARSE);
    if (matches) {
      parsed.scheme = matches[1];
      parsed.userinfo = matches[3];
      parsed.host = matches[4];
      parsed.port = parseInt(matches[5], 10);
      parsed.path = matches[6] || "";
      parsed.query = matches[7];
      parsed.fragment = matches[8];
      if (parsed.scheme !== undefined) {
        const decodedScheme = unescape(parsed.scheme);
        if (VALID_SCHEME.test(decodedScheme)) {
          parsed.scheme = decodedScheme.toLowerCase();
        } else {
          parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
          malformedScheme = true;
        }
      }
      malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
      if (malformedPercentEncoding) {
        parsed.error = parsed.error || "URI contains malformed percent-encoding.";
      }
      if (isNaN(parsed.port)) {
        parsed.port = matches[5];
      }
      const parseError = getParseError(parsed, matches);
      if (parseError !== undefined) {
        parsed.error = parsed.error || parseError;
        malformedAuthorityOrPort = true;
      }
      if (parsed.host) {
        const ipv4result = isIPv4(parsed.host);
        if (ipv4result === false) {
          const bracketedIPLiteral = isIPLiteral(parsed.host);
          const hasIPLiteralBracket = parsed.host.indexOf("[") !== -1 || parsed.host.indexOf("]") !== -1;
          const ipv6result = normalizeIPv6(parsed.host);
          isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
          malformedIPLiteral = hasIPLiteralBracket && (!bracketedIPLiteral || ipv6result.error === true);
          parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
          if (malformedIPLiteral) {
            parsed.error = parsed.error || "URI host is malformed.";
            malformedAuthorityOrPort = true;
          }
        } else {
          isIP = true;
        }
      }
      if (parsed.scheme === undefined && parsed.userinfo === undefined && parsed.host === undefined && parsed.port === undefined && parsed.query === undefined && !parsed.path) {
        parsed.reference = "same-document";
      } else if (parsed.scheme === undefined) {
        parsed.reference = "relative";
      } else if (parsed.fragment === undefined) {
        parsed.reference = "absolute";
      } else {
        parsed.reference = "uri";
      }
      if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
        parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
      }
      const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
      if (!malformedIPLiteral) {
        malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
      }
      if (uri.indexOf("%") !== -1 && parsed.host !== undefined && !malformedIPLiteral) {
        let host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
        if (!isIP) {
          host = normalizePercentEncoding(host.toLowerCase());
        }
        parsed.host = reescapeHostDelimiters(host, isIP);
      }
      if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
        if (parsed.path) {
          parsed.path = normalizePathEncoding(parsed.path);
        }
        if (parsed.query) {
          parsed.query = normalizeQueryFragmentEncoding(parsed.query);
        }
        if (parsed.fragment) {
          parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
        }
      }
      if (schemeHandler && schemeHandler.parse) {
        schemeHandler.parse(parsed, options);
        if (schemeHandler === SCHEMES.urn && parsed.nid === undefined) {
          malformedSchemeSpecific = true;
        }
      }
    } else {
      parsed.error = parsed.error || "URI can not be parsed.";
    }
    return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
  }
  function parse(uri, opts) {
    return parseWithStatus(uri, opts).parsed;
  }
  function normalizeString(uri, opts) {
    return normalizeStringWithStatus(uri, opts).normalized;
  }
  function normalizeStringWithStatus(uri, opts) {
    const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
    return {
      normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
      malformedAuthorityOrPort,
      malformedPercentEncoding,
      malformedSchemeSpecific,
      malformedHost,
      malformedScheme
    };
  }
  function normalizeComparableURI(uri, opts) {
    if (typeof uri !== "string" && typeof uri !== "object") {
      return;
    }
    let value;
    try {
      value = typeof uri === "string" ? uri : serialize(uri, opts);
    } catch {
      return;
    }
    const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
    return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? undefined : normalized;
  }
  var fastUri = {
    SCHEMES,
    normalize,
    resolve,
    resolveComponent,
    equal,
    serialize,
    parse
  };
  module.exports = fastUri;
  module.exports.default = fastUri;
  module.exports.fastUri = fastUri;
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var uri = require_fast_uri();
  uri.code = 'require("ajv/dist/runtime/uri").default';
  exports.default = uri;
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = undefined;
  var validate_1 = require_validate();
  Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
    return validate_1.KeywordCxt;
  } });
  var codegen_1 = require_codegen();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return codegen_1._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return codegen_1.str;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return codegen_1.stringify;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return codegen_1.nil;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return codegen_1.Name;
  } });
  Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
    return codegen_1.CodeGen;
  } });
  var validation_error_1 = require_validation_error();
  var ref_error_1 = require_ref_error();
  var rules_1 = require_rules();
  var compile_1 = require_compile();
  var codegen_2 = require_codegen();
  var resolve_1 = require_resolve();
  var dataType_1 = require_dataType();
  var util_1 = require_util();
  var $dataRefSchema = require_data();
  var uri_1 = require_uri();
  var defaultRegExp = (str, flags) => new RegExp(str, flags);
  defaultRegExp.code = "new RegExp";
  var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
  var EXT_SCOPE_NAMES = new Set([
    "validate",
    "serialize",
    "parse",
    "wrapper",
    "root",
    "schema",
    "keyword",
    "pattern",
    "formats",
    "validate$data",
    "func",
    "obj",
    "Error"
  ]);
  var removedOptions = {
    errorDataPath: "",
    format: "`validateFormats: false` can be used instead.",
    nullable: '"nullable" keyword is supported by default.',
    jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
    extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
    missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
    processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
    sourceCode: "Use option `code: {source: true}`",
    strictDefaults: "It is default now, see option `strict`.",
    strictKeywords: "It is default now, see option `strict`.",
    uniqueItems: '"uniqueItems" keyword is always validated.',
    unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
    cache: "Map is used as cache, schema object as key.",
    serialize: "Map is used as cache, schema object as key.",
    ajvErrors: "It is default now."
  };
  var deprecatedOptions = {
    ignoreKeywordsWithRef: "",
    jsPropertySyntax: "",
    unicode: '"minLength"/"maxLength" account for unicode characters by default.'
  };
  var MAX_EXPRESSION = 200;
  function requiredOptions(o) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
    const s = o.strict;
    const _optz = (_a = o.code) === null || _a === undefined ? undefined : _a.optimize;
    const optimize = _optz === true || _optz === undefined ? 1 : _optz || 0;
    const regExp = (_c = (_b = o.code) === null || _b === undefined ? undefined : _b.regExp) !== null && _c !== undefined ? _c : defaultRegExp;
    const uriResolver = (_d = o.uriResolver) !== null && _d !== undefined ? _d : uri_1.default;
    return {
      strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== undefined ? _e : s) !== null && _f !== undefined ? _f : true,
      strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== undefined ? _g : s) !== null && _h !== undefined ? _h : true,
      strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== undefined ? _j : s) !== null && _k !== undefined ? _k : "log",
      strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== undefined ? _l : s) !== null && _m !== undefined ? _m : "log",
      strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== undefined ? _o : s) !== null && _p !== undefined ? _p : false,
      code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
      loopRequired: (_q = o.loopRequired) !== null && _q !== undefined ? _q : MAX_EXPRESSION,
      loopEnum: (_r = o.loopEnum) !== null && _r !== undefined ? _r : MAX_EXPRESSION,
      meta: (_s = o.meta) !== null && _s !== undefined ? _s : true,
      messages: (_t = o.messages) !== null && _t !== undefined ? _t : true,
      inlineRefs: (_u = o.inlineRefs) !== null && _u !== undefined ? _u : true,
      schemaId: (_v = o.schemaId) !== null && _v !== undefined ? _v : "$id",
      addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== undefined ? _w : true,
      validateSchema: (_x = o.validateSchema) !== null && _x !== undefined ? _x : true,
      validateFormats: (_y = o.validateFormats) !== null && _y !== undefined ? _y : true,
      unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== undefined ? _z : true,
      int32range: (_0 = o.int32range) !== null && _0 !== undefined ? _0 : true,
      uriResolver
    };
  }

  class Ajv {
    constructor(opts = {}) {
      this.schemas = {};
      this.refs = {};
      this.formats = Object.create(null);
      this._compilations = new Set;
      this._loading = {};
      this._cache = new Map;
      opts = this.opts = { ...opts, ...requiredOptions(opts) };
      const { es5, lines } = this.opts.code;
      this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
      this.logger = getLogger(opts.logger);
      const formatOpt = opts.validateFormats;
      opts.validateFormats = false;
      this.RULES = (0, rules_1.getRules)();
      checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
      checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
      this._metaOpts = getMetaSchemaOptions.call(this);
      if (opts.formats)
        addInitialFormats.call(this);
      this._addVocabularies();
      this._addDefaultMetaSchema();
      if (opts.keywords)
        addInitialKeywords.call(this, opts.keywords);
      if (typeof opts.meta == "object")
        this.addMetaSchema(opts.meta);
      addInitialSchemas.call(this);
      opts.validateFormats = formatOpt;
    }
    _addVocabularies() {
      this.addKeyword("$async");
    }
    _addDefaultMetaSchema() {
      const { $data, meta, schemaId } = this.opts;
      let _dataRefSchema = $dataRefSchema;
      if (schemaId === "id") {
        _dataRefSchema = { ...$dataRefSchema };
        _dataRefSchema.id = _dataRefSchema.$id;
        delete _dataRefSchema.$id;
      }
      if (meta && $data)
        this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
    }
    defaultMeta() {
      const { meta, schemaId } = this.opts;
      return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : undefined;
    }
    validate(schemaKeyRef, data) {
      let v;
      if (typeof schemaKeyRef == "string") {
        v = this.getSchema(schemaKeyRef);
        if (!v)
          throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
      } else {
        v = this.compile(schemaKeyRef);
      }
      const valid = v(data);
      if (!("$async" in v))
        this.errors = v.errors;
      return valid;
    }
    compile(schema, _meta) {
      const sch = this._addSchema(schema, _meta);
      return sch.validate || this._compileSchemaEnv(sch);
    }
    compileAsync(schema, meta) {
      if (typeof this.opts.loadSchema != "function") {
        throw new Error("options.loadSchema should be a function");
      }
      const { loadSchema } = this.opts;
      return runCompileAsync.call(this, schema, meta);
      async function runCompileAsync(_schema, _meta) {
        await loadMetaSchema.call(this, _schema.$schema);
        const sch = this._addSchema(_schema, _meta);
        return sch.validate || _compileAsync.call(this, sch);
      }
      async function loadMetaSchema($ref) {
        if ($ref && !this.getSchema($ref)) {
          await runCompileAsync.call(this, { $ref }, true);
        }
      }
      async function _compileAsync(sch) {
        try {
          return this._compileSchemaEnv(sch);
        } catch (e) {
          if (!(e instanceof ref_error_1.default))
            throw e;
          checkLoaded.call(this, e);
          await loadMissingSchema.call(this, e.missingSchema);
          return _compileAsync.call(this, sch);
        }
      }
      function checkLoaded({ missingSchema: ref, missingRef }) {
        if (this.refs[ref]) {
          throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
        }
      }
      async function loadMissingSchema(ref) {
        const _schema = await _loadSchema.call(this, ref);
        if (!this.refs[ref])
          await loadMetaSchema.call(this, _schema.$schema);
        if (!this.refs[ref])
          this.addSchema(_schema, ref, meta);
      }
      async function _loadSchema(ref) {
        const p = this._loading[ref];
        if (p)
          return p;
        try {
          return await (this._loading[ref] = loadSchema(ref));
        } finally {
          delete this._loading[ref];
        }
      }
    }
    addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
      if (Array.isArray(schema)) {
        for (const sch of schema)
          this.addSchema(sch, undefined, _meta, _validateSchema);
        return this;
      }
      let id;
      if (typeof schema === "object") {
        const { schemaId } = this.opts;
        id = schema[schemaId];
        if (id !== undefined && typeof id != "string") {
          throw new Error(`schema ${schemaId} must be string`);
        }
      }
      key = (0, resolve_1.normalizeId)(key || id);
      this._checkUnique(key);
      this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
      return this;
    }
    addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
      this.addSchema(schema, key, true, _validateSchema);
      return this;
    }
    validateSchema(schema, throwOrLogError) {
      if (typeof schema == "boolean")
        return true;
      let $schema;
      $schema = schema.$schema;
      if ($schema !== undefined && typeof $schema != "string") {
        throw new Error("$schema must be a string");
      }
      $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
      if (!$schema) {
        this.logger.warn("meta-schema not available");
        this.errors = null;
        return true;
      }
      const valid = this.validate($schema, schema);
      if (!valid && throwOrLogError) {
        const message = "schema is invalid: " + this.errorsText();
        if (this.opts.validateSchema === "log")
          this.logger.error(message);
        else
          throw new Error(message);
      }
      return valid;
    }
    getSchema(keyRef) {
      let sch;
      while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
        keyRef = sch;
      if (sch === undefined) {
        const { schemaId } = this.opts;
        const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
        sch = compile_1.resolveSchema.call(this, root, keyRef);
        if (!sch)
          return;
        this.refs[keyRef] = sch;
      }
      return sch.validate || this._compileSchemaEnv(sch);
    }
    removeSchema(schemaKeyRef) {
      if (schemaKeyRef instanceof RegExp) {
        this._removeAllSchemas(this.schemas, schemaKeyRef);
        this._removeAllSchemas(this.refs, schemaKeyRef);
        return this;
      }
      switch (typeof schemaKeyRef) {
        case "undefined":
          this._removeAllSchemas(this.schemas);
          this._removeAllSchemas(this.refs);
          this._cache.clear();
          return this;
        case "string": {
          const sch = getSchEnv.call(this, schemaKeyRef);
          if (typeof sch == "object")
            this._cache.delete(sch.schema);
          delete this.schemas[schemaKeyRef];
          delete this.refs[schemaKeyRef];
          return this;
        }
        case "object": {
          const cacheKey = schemaKeyRef;
          this._cache.delete(cacheKey);
          let id = schemaKeyRef[this.opts.schemaId];
          if (id) {
            id = (0, resolve_1.normalizeId)(id);
            delete this.schemas[id];
            delete this.refs[id];
          }
          return this;
        }
        default:
          throw new Error("ajv.removeSchema: invalid parameter");
      }
    }
    addVocabulary(definitions) {
      for (const def of definitions)
        this.addKeyword(def);
      return this;
    }
    addKeyword(kwdOrDef, def) {
      let keyword;
      if (typeof kwdOrDef == "string") {
        keyword = kwdOrDef;
        if (typeof def == "object") {
          this.logger.warn("these parameters are deprecated, see docs for addKeyword");
          def.keyword = keyword;
        }
      } else if (typeof kwdOrDef == "object" && def === undefined) {
        def = kwdOrDef;
        keyword = def.keyword;
        if (Array.isArray(keyword) && !keyword.length) {
          throw new Error("addKeywords: keyword must be string or non-empty array");
        }
      } else {
        throw new Error("invalid addKeywords parameters");
      }
      checkKeyword.call(this, keyword, def);
      if (!def) {
        (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
        return this;
      }
      keywordMetaschema.call(this, def);
      const definition = {
        ...def,
        type: (0, dataType_1.getJSONTypes)(def.type),
        schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
      };
      (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
      return this;
    }
    getKeyword(keyword) {
      const rule = this.RULES.all[keyword];
      return typeof rule == "object" ? rule.definition : !!rule;
    }
    removeKeyword(keyword) {
      const { RULES } = this;
      delete RULES.keywords[keyword];
      delete RULES.all[keyword];
      for (const group of RULES.rules) {
        const i = group.rules.findIndex((rule) => rule.keyword === keyword);
        if (i >= 0)
          group.rules.splice(i, 1);
      }
      return this;
    }
    addFormat(name, format) {
      if (typeof format == "string")
        format = new RegExp(format);
      this.formats[name] = format;
      return this;
    }
    errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
      if (!errors || errors.length === 0)
        return "No errors";
      return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
    }
    $dataMetaSchema(metaSchema, keywordsJsonPointers) {
      const rules = this.RULES.all;
      metaSchema = JSON.parse(JSON.stringify(metaSchema));
      for (const jsonPointer of keywordsJsonPointers) {
        const segments = jsonPointer.split("/").slice(1);
        let keywords = metaSchema;
        for (const seg of segments)
          keywords = keywords[seg];
        for (const key in rules) {
          const rule = rules[key];
          if (typeof rule != "object")
            continue;
          const { $data } = rule.definition;
          const schema = keywords[key];
          if ($data && schema)
            keywords[key] = schemaOrData(schema);
        }
      }
      return metaSchema;
    }
    _removeAllSchemas(schemas, regex) {
      for (const keyRef in schemas) {
        const sch = schemas[keyRef];
        if (!regex || regex.test(keyRef)) {
          if (typeof sch == "string") {
            delete schemas[keyRef];
          } else if (sch && !sch.meta) {
            this._cache.delete(sch.schema);
            delete schemas[keyRef];
          }
        }
      }
    }
    _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
      let id;
      const { schemaId } = this.opts;
      if (typeof schema == "object") {
        id = schema[schemaId];
      } else {
        if (this.opts.jtd)
          throw new Error("schema must be object");
        else if (typeof schema != "boolean")
          throw new Error("schema must be object or boolean");
      }
      let sch = this._cache.get(schema);
      if (sch !== undefined)
        return sch;
      baseId = (0, resolve_1.normalizeId)(id || baseId);
      const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
      sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
      this._cache.set(sch.schema, sch);
      if (addSchema && !baseId.startsWith("#")) {
        if (baseId)
          this._checkUnique(baseId);
        this.refs[baseId] = sch;
      }
      if (validateSchema)
        this.validateSchema(schema, true);
      return sch;
    }
    _checkUnique(id) {
      if (this.schemas[id] || this.refs[id]) {
        throw new Error(`schema with key or id "${id}" already exists`);
      }
    }
    _compileSchemaEnv(sch) {
      if (sch.meta)
        this._compileMetaSchema(sch);
      else
        compile_1.compileSchema.call(this, sch);
      if (!sch.validate)
        throw new Error("ajv implementation error");
      return sch.validate;
    }
    _compileMetaSchema(sch) {
      const currentOpts = this.opts;
      this.opts = this._metaOpts;
      try {
        compile_1.compileSchema.call(this, sch);
      } finally {
        this.opts = currentOpts;
      }
    }
  }
  Ajv.ValidationError = validation_error_1.default;
  Ajv.MissingRefError = ref_error_1.default;
  exports.default = Ajv;
  function checkOptions(checkOpts, options, msg, log = "error") {
    for (const key in checkOpts) {
      const opt = key;
      if (opt in options)
        this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
    }
  }
  function getSchEnv(keyRef) {
    keyRef = (0, resolve_1.normalizeId)(keyRef);
    return this.schemas[keyRef] || this.refs[keyRef];
  }
  function addInitialSchemas() {
    const optsSchemas = this.opts.schemas;
    if (!optsSchemas)
      return;
    if (Array.isArray(optsSchemas))
      this.addSchema(optsSchemas);
    else
      for (const key in optsSchemas)
        this.addSchema(optsSchemas[key], key);
  }
  function addInitialFormats() {
    for (const name in this.opts.formats) {
      const format = this.opts.formats[name];
      if (format)
        this.addFormat(name, format);
    }
  }
  function addInitialKeywords(defs) {
    if (Array.isArray(defs)) {
      this.addVocabulary(defs);
      return;
    }
    this.logger.warn("keywords option as map is deprecated, pass array");
    for (const keyword in defs) {
      const def = defs[keyword];
      if (!def.keyword)
        def.keyword = keyword;
      this.addKeyword(def);
    }
  }
  function getMetaSchemaOptions() {
    const metaOpts = { ...this.opts };
    for (const opt of META_IGNORE_OPTIONS)
      delete metaOpts[opt];
    return metaOpts;
  }
  var noLogs = { log() {}, warn() {}, error() {} };
  function getLogger(logger) {
    if (logger === false)
      return noLogs;
    if (logger === undefined)
      return console;
    if (logger.log && logger.warn && logger.error)
      return logger;
    throw new Error("logger must implement log, warn and error methods");
  }
  var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
  function checkKeyword(keyword, def) {
    const { RULES } = this;
    (0, util_1.eachItem)(keyword, (kwd) => {
      if (RULES.keywords[kwd])
        throw new Error(`Keyword ${kwd} is already defined`);
      if (!KEYWORD_NAME.test(kwd))
        throw new Error(`Keyword ${kwd} has invalid name`);
    });
    if (!def)
      return;
    if (def.$data && !(("code" in def) || ("validate" in def))) {
      throw new Error('$data keyword must have "code" or "validate" function');
    }
  }
  function addRule(keyword, definition, dataType) {
    var _a;
    const post = definition === null || definition === undefined ? undefined : definition.post;
    if (dataType && post)
      throw new Error('keyword with "post" flag cannot have "type"');
    const { RULES } = this;
    let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
    if (!ruleGroup) {
      ruleGroup = { type: dataType, rules: [] };
      RULES.rules.push(ruleGroup);
    }
    RULES.keywords[keyword] = true;
    if (!definition)
      return;
    const rule = {
      keyword,
      definition: {
        ...definition,
        type: (0, dataType_1.getJSONTypes)(definition.type),
        schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
      }
    };
    if (definition.before)
      addBeforeRule.call(this, ruleGroup, rule, definition.before);
    else
      ruleGroup.rules.push(rule);
    RULES.all[keyword] = rule;
    (_a = definition.implements) === null || _a === undefined || _a.forEach((kwd) => this.addKeyword(kwd));
  }
  function addBeforeRule(ruleGroup, rule, before) {
    const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
    if (i >= 0) {
      ruleGroup.rules.splice(i, 0, rule);
    } else {
      ruleGroup.rules.push(rule);
      this.logger.warn(`rule ${before} is not defined`);
    }
  }
  function keywordMetaschema(def) {
    let { metaSchema } = def;
    if (metaSchema === undefined)
      return;
    if (def.$data && this.opts.$data)
      metaSchema = schemaOrData(metaSchema);
    def.validateSchema = this.compile(metaSchema, true);
  }
  var $dataRef = {
    $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
  };
  function schemaOrData(schema) {
    return { anyOf: [schema, $dataRef] };
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var def = {
    keyword: "id",
    code() {
      throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.callRef = exports.getValidate = undefined;
  var ref_error_1 = require_ref_error();
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var compile_1 = require_compile();
  var util_1 = require_util();
  var def = {
    keyword: "$ref",
    schemaType: "string",
    code(cxt) {
      const { gen, schema: $ref, it } = cxt;
      const { baseId, schemaEnv: env, validateName, opts, self } = it;
      const { root } = env;
      if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
        return callRootRef();
      const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
      if (schOrEnv === undefined)
        throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
      if (schOrEnv instanceof compile_1.SchemaEnv)
        return callValidate(schOrEnv);
      return inlineRefSchema(schOrEnv);
      function callRootRef() {
        if (env === root)
          return callRef(cxt, validateName, env, env.$async);
        const rootName = gen.scopeValue("root", { ref: root });
        return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
      }
      function callValidate(sch) {
        const v = getValidate(cxt, sch);
        callRef(cxt, v, sch, sch.$async);
      }
      function inlineRefSchema(sch) {
        const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
        const valid = gen.name("valid");
        const schCxt = cxt.subschema({
          schema: sch,
          dataTypes: [],
          schemaPath: codegen_1.nil,
          topSchemaRef: schName,
          errSchemaPath: $ref
        }, valid);
        cxt.mergeEvaluated(schCxt);
        cxt.ok(valid);
      }
    }
  };
  function getValidate(cxt, sch) {
    const { gen } = cxt;
    return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
  }
  exports.getValidate = getValidate;
  function callRef(cxt, v, sch, $async) {
    const { gen, it } = cxt;
    const { allErrors, schemaEnv: env, opts } = it;
    const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
    if ($async)
      callAsyncRef();
    else
      callSyncRef();
    function callAsyncRef() {
      if (!env.$async)
        throw new Error("async schema referenced by sync schema");
      const valid = gen.let("valid");
      gen.try(() => {
        gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
        addEvaluatedFrom(v);
        if (!allErrors)
          gen.assign(valid, true);
      }, (e) => {
        gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
        addErrorsFrom(e);
        if (!allErrors)
          gen.assign(valid, false);
      });
      cxt.ok(valid);
    }
    function callSyncRef() {
      cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
    }
    function addErrorsFrom(source) {
      const errs = (0, codegen_1._)`${source}.errors`;
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
      gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
    }
    function addEvaluatedFrom(source) {
      var _a;
      if (!it.opts.unevaluated)
        return;
      const schEvaluated = (_a = sch === null || sch === undefined ? undefined : sch.validate) === null || _a === undefined ? undefined : _a.evaluated;
      if (it.props !== true) {
        if (schEvaluated && !schEvaluated.dynamicProps) {
          if (schEvaluated.props !== undefined) {
            it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
          }
        } else {
          const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
          it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
        }
      }
      if (it.items !== true) {
        if (schEvaluated && !schEvaluated.dynamicItems) {
          if (schEvaluated.items !== undefined) {
            it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
          }
        } else {
          const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
          it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
        }
      }
    }
  }
  exports.callRef = callRef;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var id_1 = require_id();
  var ref_1 = require_ref();
  var core = [
    "$schema",
    "$id",
    "$defs",
    "$vocabulary",
    { keyword: "$comment" },
    "definitions",
    id_1.default,
    ref_1.default
  ];
  exports.default = core;
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var ops = codegen_1.operators;
  var KWDs = {
    maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
  };
  var error = {
    message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
    params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
  };
  var def = {
    keyword: Object.keys(KWDs),
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode } = cxt;
      cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
    params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
  };
  var def = {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, schemaCode, it } = cxt;
      const prec = it.opts.multipleOfPrecision;
      const res = gen.let("res");
      const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
      cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  function ucs2length(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
      length++;
      value = str.charCodeAt(pos++);
      if (value >= 55296 && value <= 56319 && pos < len) {
        value = str.charCodeAt(pos);
        if ((value & 64512) === 56320)
          pos++;
      }
    }
    return length;
  }
  exports.default = ucs2length;
  ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var ucs2length_1 = require_ucs2length();
  var error = {
    message({ keyword, schemaCode }) {
      const comp = keyword === "maxLength" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  var def = {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode, it } = cxt;
      const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
      const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
      cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var util_1 = require_util();
  var codegen_1 = require_codegen();
  var error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
  };
  var def = {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const u = it.opts.unicodeRegExp ? "u" : "";
      if ($data) {
        const { regExp } = it.opts.code;
        const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
        const valid = gen.let("valid");
        gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
        cxt.fail$data((0, codegen_1._)`!${valid}`);
      } else {
        const regExp = (0, code_1.usePattern)(cxt, schema);
        cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message({ keyword, schemaCode }) {
      const comp = keyword === "maxProperties" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  var def = {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode } = cxt;
      const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
    params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
  };
  var def = {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, schema, schemaCode, data, $data, it } = cxt;
      const { opts } = it;
      if (!$data && schema.length === 0)
        return;
      const useLoop = schema.length >= opts.loopRequired;
      if (it.allErrors)
        allErrorsMode();
      else
        exitOnErrorMode();
      if (opts.strictRequired) {
        const props = cxt.parentSchema.properties;
        const { definedProperties } = cxt.it;
        for (const requiredKey of schema) {
          if ((props === null || props === undefined ? undefined : props[requiredKey]) === undefined && !definedProperties.has(requiredKey)) {
            const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
            const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
            (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
          }
        }
      }
      function allErrorsMode() {
        if (useLoop || $data) {
          cxt.block$data(codegen_1.nil, loopAllRequired);
        } else {
          for (const prop of schema) {
            (0, code_1.checkReportMissingProp)(cxt, prop);
          }
        }
      }
      function exitOnErrorMode() {
        const missing = gen.let("missing");
        if (useLoop || $data) {
          const valid = gen.let("valid", true);
          cxt.block$data(valid, () => loopUntilMissing(missing, valid));
          cxt.ok(valid);
        } else {
          gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
      function loopAllRequired() {
        gen.forOf("prop", schemaCode, (prop) => {
          cxt.setParams({ missingProperty: prop });
          gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
        });
      }
      function loopUntilMissing(missing, valid) {
        cxt.setParams({ missingProperty: missing });
        gen.forOf(missing, schemaCode, () => {
          gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error();
            gen.break();
          });
        }, codegen_1.nil);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message({ keyword, schemaCode }) {
      const comp = keyword === "maxItems" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  var def = {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode } = cxt;
      const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var equal = require_fast_deep_equal();
  equal.code = 'require("ajv/dist/runtime/equal").default';
  exports.default = equal;
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dataType_1 = require_dataType();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var equal_1 = require_equal();
  var error = {
    message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
    params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
  };
  var def = {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
      if (!$data && !schema)
        return;
      const valid = gen.let("valid");
      const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
      cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
      cxt.ok(valid);
      function validateUniqueItems() {
        const i = gen.let("i", (0, codegen_1._)`${data}.length`);
        const j = gen.let("j");
        cxt.setParams({ i, j });
        gen.assign(valid, true);
        gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
      }
      function canOptimize() {
        return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
      }
      function loopN(i, j) {
        const item = gen.name("item");
        const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
        const indices = gen.const("indices", (0, codegen_1._)`{}`);
        gen.for((0, codegen_1._)`;${i}--;`, () => {
          gen.let(item, (0, codegen_1._)`${data}[${i}]`);
          gen.if(wrongType, (0, codegen_1._)`continue`);
          if (itemTypes.length > 1)
            gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
          gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
            gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
            cxt.error();
            gen.assign(valid, false).break();
          }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
        });
      }
      function loopN2(i, j) {
        const eql = (0, util_1.useFunc)(gen, equal_1.default);
        const outer = gen.name("outer");
        gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
          cxt.error();
          gen.assign(valid, false).break(outer);
        })));
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var equal_1 = require_equal();
  var error = {
    message: "must be equal to constant",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
  };
  var def = {
    keyword: "const",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schemaCode, schema } = cxt;
      if ($data || schema && typeof schema == "object") {
        cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
      } else {
        cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var equal_1 = require_equal();
  var error = {
    message: "must be equal to one of the allowed values",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
  };
  var def = {
    keyword: "enum",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      if (!$data && schema.length === 0)
        throw new Error("enum must have non-empty array");
      const useLoop = schema.length >= it.opts.loopEnum;
      let eql;
      const getEql = () => eql !== null && eql !== undefined ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
      let valid;
      if (useLoop || $data) {
        valid = gen.let("valid");
        cxt.block$data(valid, loopEnum);
      } else {
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const vSchema = gen.const("vSchema", schemaCode);
        valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
      }
      cxt.pass(valid);
      function loopEnum() {
        gen.assign(valid, false);
        gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
      }
      function equalCode(vSchema, i) {
        const sch = schema[i];
        return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var limitNumber_1 = require_limitNumber();
  var multipleOf_1 = require_multipleOf();
  var limitLength_1 = require_limitLength();
  var pattern_1 = require_pattern();
  var limitProperties_1 = require_limitProperties();
  var required_1 = require_required();
  var limitItems_1 = require_limitItems();
  var uniqueItems_1 = require_uniqueItems();
  var const_1 = require_const();
  var enum_1 = require_enum();
  var validation = [
    limitNumber_1.default,
    multipleOf_1.default,
    limitLength_1.default,
    pattern_1.default,
    limitProperties_1.default,
    required_1.default,
    limitItems_1.default,
    uniqueItems_1.default,
    { keyword: "type", schemaType: ["string", "array"] },
    { keyword: "nullable", schemaType: "boolean" },
    const_1.default,
    enum_1.default
  ];
  exports.default = validation;
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateAdditionalItems = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  var def = {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { parentSchema, it } = cxt;
      const { items } = parentSchema;
      if (!Array.isArray(items)) {
        (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
        return;
      }
      validateAdditionalItems(cxt, items);
    }
  };
  function validateAdditionalItems(cxt, items) {
    const { gen, schema, data, keyword, it } = cxt;
    it.items = true;
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    if (schema === false) {
      cxt.setParams({ len: items.length });
      cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
    } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
      const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
      gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
      cxt.ok(valid);
    }
    function validateItems(valid) {
      gen.forRange("i", items.length, len, (i) => {
        cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
        if (!it.allErrors)
          gen.if((0, codegen_1.not)(valid), () => gen.break());
      });
    }
  }
  exports.validateAdditionalItems = validateAdditionalItems;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateTuple = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var code_1 = require_code2();
  var def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code(cxt) {
      const { schema, it } = cxt;
      if (Array.isArray(schema))
        return validateTuple(cxt, "additionalItems", schema);
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  function validateTuple(cxt, extraItems, schArr = cxt.schema) {
    const { gen, parentSchema, data, keyword, it } = cxt;
    checkStrictTuple(parentSchema);
    if (it.opts.unevaluated && schArr.length && it.items !== true) {
      it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
    }
    const valid = gen.name("valid");
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    schArr.forEach((sch, i) => {
      if ((0, util_1.alwaysValidSchema)(it, sch))
        return;
      gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
        keyword,
        schemaProp: i,
        dataProp: i
      }, valid));
      cxt.ok(valid);
    });
    function checkStrictTuple(sch) {
      const { opts, errSchemaPath } = it;
      const l = schArr.length;
      const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
      if (opts.strictTuples && !fullTuple) {
        const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
        (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
      }
    }
  }
  exports.validateTuple = validateTuple;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var items_1 = require_items();
  var def = {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var code_1 = require_code2();
  var additionalItems_1 = require_additionalItems();
  var error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  var def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { schema, parentSchema, it } = cxt;
      const { prefixItems } = parentSchema;
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      if (prefixItems)
        (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
      else
        cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { min, max } }) => max === undefined ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
    params: ({ params: { min, max } }) => max === undefined ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
  };
  var def = {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      let min;
      let max;
      const { minContains, maxContains } = parentSchema;
      if (it.opts.next) {
        min = minContains === undefined ? 1 : minContains;
        max = maxContains;
      } else {
        min = 1;
      }
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      cxt.setParams({ min, max });
      if (max === undefined && min === 0) {
        (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
        return;
      }
      if (max !== undefined && min > max) {
        (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
        cxt.fail();
        return;
      }
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        let cond = (0, codegen_1._)`${len} >= ${min}`;
        if (max !== undefined)
          cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
        cxt.pass(cond);
        return;
      }
      it.items = true;
      const valid = gen.name("valid");
      if (max === undefined && min === 1) {
        validateItems(valid, () => gen.if(valid, () => gen.break()));
      } else if (min === 0) {
        gen.let(valid, true);
        if (max !== undefined)
          gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
      } else {
        gen.let(valid, false);
        validateItemsWithCount();
      }
      cxt.result(valid, () => cxt.reset());
      function validateItemsWithCount() {
        const schValid = gen.name("_valid");
        const count = gen.let("count", 0);
        validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
      }
      function validateItems(_valid, block) {
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword: "contains",
            dataProp: i,
            dataPropType: util_1.Type.Num,
            compositeRule: true
          }, _valid);
          block();
        });
      }
      function checkLimits(count) {
        gen.code((0, codegen_1._)`${count}++`);
        if (max === undefined) {
          gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
        } else {
          gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
          if (min === 1)
            gen.assign(valid, true);
          else
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
        }
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var code_1 = require_code2();
  exports.error = {
    message: ({ params: { property, depsCount, deps } }) => {
      const property_ies = depsCount === 1 ? "property" : "properties";
      return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
    },
    params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
  };
  var def = {
    keyword: "dependencies",
    type: "object",
    schemaType: "object",
    error: exports.error,
    code(cxt) {
      const [propDeps, schDeps] = splitDependencies(cxt);
      validatePropertyDeps(cxt, propDeps);
      validateSchemaDeps(cxt, schDeps);
    }
  };
  function splitDependencies({ schema }) {
    const propertyDeps = {};
    const schemaDeps = {};
    for (const key in schema) {
      if (key === "__proto__")
        continue;
      const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
      deps[key] = schema[key];
    }
    return [propertyDeps, schemaDeps];
  }
  function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
    const { gen, data, it } = cxt;
    if (Object.keys(propertyDeps).length === 0)
      return;
    const missing = gen.let("missing");
    for (const prop in propertyDeps) {
      const deps = propertyDeps[prop];
      if (deps.length === 0)
        continue;
      const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
      cxt.setParams({
        property: prop,
        depsCount: deps.length,
        deps: deps.join(", ")
      });
      if (it.allErrors) {
        gen.if(hasProperty, () => {
          for (const depProp of deps) {
            (0, code_1.checkReportMissingProp)(cxt, depProp);
          }
        });
      } else {
        gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
        (0, code_1.reportMissingProp)(cxt, missing);
        gen.else();
      }
    }
  }
  exports.validatePropertyDeps = validatePropertyDeps;
  function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
    const { gen, data, keyword, it } = cxt;
    const valid = gen.name("valid");
    for (const prop in schemaDeps) {
      if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
        continue;
      gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties), () => {
        const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
        cxt.mergeValidEvaluated(schCxt, valid);
      }, () => gen.var(valid, true));
      cxt.ok(valid);
    }
  }
  exports.validateSchemaDeps = validateSchemaDeps;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: "property name must be valid",
    params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
  };
  var def = {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      const valid = gen.name("valid");
      gen.forIn("key", data, (key) => {
        cxt.setParams({ propertyName: key });
        cxt.subschema({
          keyword: "propertyNames",
          data: key,
          dataTypes: ["string"],
          propertyName: key,
          compositeRule: true
        }, valid);
        gen.if((0, codegen_1.not)(valid), () => {
          cxt.error(true);
          if (!it.allErrors)
            gen.break();
        });
      });
      cxt.ok(valid);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var util_1 = require_util();
  var error = {
    message: "must NOT have additional properties",
    params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
  };
  var def = {
    keyword: "additionalProperties",
    type: ["object"],
    schemaType: ["boolean", "object"],
    allowUndefined: true,
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, opts } = it;
      it.props = true;
      if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
        return;
      const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
      const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
      checkAdditionalProperties();
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function checkAdditionalProperties() {
        gen.forIn("key", data, (key) => {
          if (!props.length && !patProps.length)
            additionalPropertyCode(key);
          else
            gen.if(isAdditional(key), () => additionalPropertyCode(key));
        });
      }
      function isAdditional(key) {
        let definedProp;
        if (props.length > 8) {
          const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
          definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
        } else if (props.length) {
          definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
        } else {
          definedProp = codegen_1.nil;
        }
        if (patProps.length) {
          definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
        }
        return (0, codegen_1.not)(definedProp);
      }
      function deleteAdditional(key) {
        gen.code((0, codegen_1._)`delete ${data}[${key}]`);
      }
      function additionalPropertyCode(key) {
        if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
          deleteAdditional(key);
          return;
        }
        if (schema === false) {
          cxt.setParams({ additionalProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.name("valid");
          if (opts.removeAdditional === "failing") {
            applyAdditionalSchema(key, valid, false);
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.reset();
              deleteAdditional(key);
            });
          } else {
            applyAdditionalSchema(key, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
      }
      function applyAdditionalSchema(key, valid, errors) {
        const subschema = {
          keyword: "additionalProperties",
          dataProp: key,
          dataPropType: util_1.Type.Str
        };
        if (errors === false) {
          Object.assign(subschema, {
            compositeRule: true,
            createErrors: false,
            allErrors: false
          });
        }
        cxt.subschema(subschema, valid);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var validate_1 = require_validate();
  var code_1 = require_code2();
  var util_1 = require_util();
  var additionalProperties_1 = require_additionalProperties();
  var def = {
    keyword: "properties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === undefined) {
        additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
      }
      const allProps = (0, code_1.allSchemaProperties)(schema);
      for (const prop of allProps) {
        it.definedProperties.add(prop);
      }
      if (it.opts.unevaluated && allProps.length && it.props !== true) {
        it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
      }
      const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
      if (properties.length === 0)
        return;
      const valid = gen.name("valid");
      for (const prop of properties) {
        if (hasDefault(prop)) {
          applyPropertySchema(prop);
        } else {
          gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
          applyPropertySchema(prop);
          if (!it.allErrors)
            gen.else().var(valid, true);
          gen.endIf();
        }
        cxt.it.definedProperties.add(prop);
        cxt.ok(valid);
      }
      function hasDefault(prop) {
        return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== undefined;
      }
      function applyPropertySchema(prop) {
        cxt.subschema({
          keyword: "properties",
          schemaProp: prop,
          dataProp: prop
        }, valid);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var util_2 = require_util();
  var def = {
    keyword: "patternProperties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, data, parentSchema, it } = cxt;
      const { opts } = it;
      const patterns = (0, code_1.allSchemaProperties)(schema);
      const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
      if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
        return;
      }
      const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
      const valid = gen.name("valid");
      if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
        it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
      }
      const { props } = it;
      validatePatternProperties();
      function validatePatternProperties() {
        for (const pat of patterns) {
          if (checkProperties)
            checkMatchingProperties(pat);
          if (it.allErrors) {
            validateProperties(pat);
          } else {
            gen.var(valid, true);
            validateProperties(pat);
            gen.if(valid);
          }
        }
      }
      function checkMatchingProperties(pat) {
        for (const prop in checkProperties) {
          if (new RegExp(pat).test(prop)) {
            (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
          }
        }
      }
      function validateProperties(pat) {
        gen.forIn("key", data, (key) => {
          gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
            const alwaysValid = alwaysValidPatterns.includes(pat);
            if (!alwaysValid) {
              cxt.subschema({
                keyword: "patternProperties",
                schemaProp: pat,
                dataProp: key,
                dataPropType: util_2.Type.Str
              }, valid);
            }
            if (it.opts.unevaluated && props !== true) {
              gen.assign((0, codegen_1._)`${props}[${key}]`, true);
            } else if (!alwaysValid && !it.allErrors) {
              gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          });
        });
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    code(cxt) {
      const { gen, schema, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        cxt.fail();
        return;
      }
      const valid = gen.name("valid");
      cxt.subschema({
        keyword: "not",
        compositeRule: true,
        createErrors: false,
        allErrors: false
      }, valid);
      cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
    },
    error: { message: "must NOT be valid" }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var def = {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: true,
    code: code_1.validateUnion,
    error: { message: "must match a schema in anyOf" }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: "must match exactly one schema in oneOf",
    params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
  };
  var def = {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      if (it.opts.discriminator && parentSchema.discriminator)
        return;
      const schArr = schema;
      const valid = gen.let("valid", false);
      const passing = gen.let("passing", null);
      const schValid = gen.name("_valid");
      cxt.setParams({ passing });
      gen.block(validateOneOf);
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
      function validateOneOf() {
        schArr.forEach((sch, i) => {
          let schCxt;
          if ((0, util_1.alwaysValidSchema)(it, sch)) {
            gen.var(schValid, true);
          } else {
            schCxt = cxt.subschema({
              keyword: "oneOf",
              schemaProp: i,
              compositeRule: true
            }, schValid);
          }
          if (i > 0) {
            gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
          }
          gen.if(schValid, () => {
            gen.assign(valid, true);
            gen.assign(passing, i);
            if (schCxt)
              cxt.mergeEvaluated(schCxt, codegen_1.Name);
          });
        });
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: "allOf",
    schemaType: "array",
    code(cxt) {
      const { gen, schema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const valid = gen.name("valid");
      schema.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
        cxt.ok(valid);
        cxt.mergeEvaluated(schCxt);
      });
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
    params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
  };
  var def = {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, parentSchema, it } = cxt;
      if (parentSchema.then === undefined && parentSchema.else === undefined) {
        (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
      }
      const hasThen = hasSchema(it, "then");
      const hasElse = hasSchema(it, "else");
      if (!hasThen && !hasElse)
        return;
      const valid = gen.let("valid", true);
      const schValid = gen.name("_valid");
      validateIf();
      cxt.reset();
      if (hasThen && hasElse) {
        const ifClause = gen.let("ifClause");
        cxt.setParams({ ifClause });
        gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
      } else if (hasThen) {
        gen.if(schValid, validateClause("then"));
      } else {
        gen.if((0, codegen_1.not)(schValid), validateClause("else"));
      }
      cxt.pass(valid, () => cxt.error(true));
      function validateIf() {
        const schCxt = cxt.subschema({
          keyword: "if",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, schValid);
        cxt.mergeEvaluated(schCxt);
      }
      function validateClause(keyword, ifClause) {
        return () => {
          const schCxt = cxt.subschema({ keyword }, schValid);
          gen.assign(valid, schValid);
          cxt.mergeValidEvaluated(schCxt, valid);
          if (ifClause)
            gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
          else
            cxt.setParams({ ifClause: keyword });
        };
      }
    }
  };
  function hasSchema(it, keyword) {
    const schema = it.schema[keyword];
    return schema !== undefined && !(0, util_1.alwaysValidSchema)(it, schema);
  }
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code({ keyword, parentSchema, it }) {
      if (parentSchema.if === undefined)
        (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var additionalItems_1 = require_additionalItems();
  var prefixItems_1 = require_prefixItems();
  var items_1 = require_items();
  var items2020_1 = require_items2020();
  var contains_1 = require_contains();
  var dependencies_1 = require_dependencies();
  var propertyNames_1 = require_propertyNames();
  var additionalProperties_1 = require_additionalProperties();
  var properties_1 = require_properties();
  var patternProperties_1 = require_patternProperties();
  var not_1 = require_not();
  var anyOf_1 = require_anyOf();
  var oneOf_1 = require_oneOf();
  var allOf_1 = require_allOf();
  var if_1 = require_if();
  var thenElse_1 = require_thenElse();
  function getApplicator(draft2020 = false) {
    const applicator = [
      not_1.default,
      anyOf_1.default,
      oneOf_1.default,
      allOf_1.default,
      if_1.default,
      thenElse_1.default,
      propertyNames_1.default,
      additionalProperties_1.default,
      dependencies_1.default,
      properties_1.default,
      patternProperties_1.default
    ];
    if (draft2020)
      applicator.push(prefixItems_1.default, items2020_1.default);
    else
      applicator.push(additionalItems_1.default, items_1.default);
    applicator.push(contains_1.default);
    return applicator;
  }
  exports.default = getApplicator;
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.dynamicAnchor = undefined;
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var compile_1 = require_compile();
  var ref_1 = require_ref();
  var def = {
    keyword: "$dynamicAnchor",
    schemaType: "string",
    code: (cxt) => dynamicAnchor(cxt, cxt.schema)
  };
  function dynamicAnchor(cxt, anchor) {
    const { gen, it } = cxt;
    it.schemaEnv.root.dynamicAnchors[anchor] = true;
    const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
    const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
    gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
  }
  exports.dynamicAnchor = dynamicAnchor;
  function _getValidate(cxt) {
    const { schemaEnv, schema, self } = cxt.it;
    const { root, baseId, localRefs, meta } = schemaEnv.root;
    const { schemaId } = self.opts;
    const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
    compile_1.compileSchema.call(self, sch);
    return (0, ref_1.getValidate)(cxt, sch);
  }
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.dynamicRef = undefined;
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var ref_1 = require_ref();
  var def = {
    keyword: "$dynamicRef",
    schemaType: "string",
    code: (cxt) => dynamicRef(cxt, cxt.schema)
  };
  function dynamicRef(cxt, ref) {
    const { gen, keyword, it } = cxt;
    if (ref[0] !== "#")
      throw new Error(`"${keyword}" only supports hash fragment reference`);
    const anchor = ref.slice(1);
    if (it.allErrors) {
      _dynamicRef();
    } else {
      const valid = gen.let("valid", false);
      _dynamicRef(valid);
      cxt.ok(valid);
    }
    function _dynamicRef(valid) {
      if (it.schemaEnv.root.dynamicAnchors[anchor]) {
        const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
        gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
      } else {
        _callRef(it.validateName, valid)();
      }
    }
    function _callRef(validate, valid) {
      return valid ? () => gen.block(() => {
        (0, ref_1.callRef)(cxt, validate);
        gen.let(valid, true);
      }) : () => (0, ref_1.callRef)(cxt, validate);
    }
  }
  exports.dynamicRef = dynamicRef;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dynamicAnchor_1 = require_dynamicAnchor();
  var util_1 = require_util();
  var def = {
    keyword: "$recursiveAnchor",
    schemaType: "boolean",
    code(cxt) {
      if (cxt.schema)
        (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
      else
        (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dynamicRef_1 = require_dynamicRef();
  var def = {
    keyword: "$recursiveRef",
    schemaType: "string",
    code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dynamicAnchor_1 = require_dynamicAnchor();
  var dynamicRef_1 = require_dynamicRef();
  var recursiveAnchor_1 = require_recursiveAnchor();
  var recursiveRef_1 = require_recursiveRef();
  var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
  exports.default = dynamic;
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dependencies_1 = require_dependencies();
  var def = {
    keyword: "dependentRequired",
    type: "object",
    schemaType: "object",
    error: dependencies_1.error,
    code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dependencies_1 = require_dependencies();
  var def = {
    keyword: "dependentSchemas",
    type: "object",
    schemaType: "object",
    code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: ["maxContains", "minContains"],
    type: "array",
    schemaType: "number",
    code({ keyword, parentSchema, it }) {
      if (parentSchema.contains === undefined) {
        (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dependentRequired_1 = require_dependentRequired();
  var dependentSchemas_1 = require_dependentSchemas();
  var limitContains_1 = require_limitContains();
  var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
  exports.default = next;
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var names_1 = require_names();
  var error = {
    message: "must NOT have unevaluated properties",
    params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
  };
  var def = {
    keyword: "unevaluatedProperties",
    type: "object",
    schemaType: ["boolean", "object"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, props } = it;
      if (props instanceof codegen_1.Name) {
        gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
      } else if (props !== true) {
        gen.forIn("key", data, (key) => props === undefined ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
      }
      it.props = true;
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function unevaluatedPropCode(key) {
        if (schema === false) {
          cxt.setParams({ unevaluatedProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (!(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.name("valid");
          cxt.subschema({
            keyword: "unevaluatedProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          }, valid);
          if (!allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        }
      }
      function unevaluatedDynamic(evaluatedProps, key) {
        return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
      }
      function unevaluatedStatic(evaluatedProps, key) {
        const ps = [];
        for (const p in evaluatedProps) {
          if (evaluatedProps[p] === true)
            ps.push((0, codegen_1._)`${key} !== ${p}`);
        }
        return (0, codegen_1.and)(...ps);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  var def = {
    keyword: "unevaluatedItems",
    type: "array",
    schemaType: ["boolean", "object"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      const items = it.items || 0;
      if (items === true)
        return;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items });
        cxt.fail((0, codegen_1._)`${len} > ${items}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
        cxt.ok(valid);
      }
      it.items = true;
      function validateItems(valid, from) {
        gen.forRange("i", from, len, (i) => {
          cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var unevaluatedProperties_1 = require_unevaluatedProperties();
  var unevaluatedItems_1 = require_unevaluatedItems();
  var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
  exports.default = unevaluated;
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
  };
  var def = {
    keyword: "format",
    type: ["number", "string"],
    schemaType: "string",
    $data: true,
    error,
    code(cxt, ruleType) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const { opts, errSchemaPath, schemaEnv, self } = it;
      if (!opts.validateFormats)
        return;
      if ($data)
        validate$DataFormat();
      else
        validateFormat();
      function validate$DataFormat() {
        const fmts = gen.scopeValue("formats", {
          ref: self.formats,
          code: opts.code.formats
        });
        const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
        const fType = gen.let("fType");
        const format = gen.let("format");
        gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
        cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
        function unknownFmt() {
          if (opts.strictSchema === false)
            return codegen_1.nil;
          return (0, codegen_1._)`${schemaCode} && !${format}`;
        }
        function invalidFmt() {
          const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
          const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
          return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
        }
      }
      function validateFormat() {
        const formatDef = self.formats[schema];
        if (!formatDef) {
          unknownFormat();
          return;
        }
        if (formatDef === true)
          return;
        const [fmtType, format, fmtRef] = getFormat(formatDef);
        if (fmtType === ruleType)
          cxt.pass(validCondition());
        function unknownFormat() {
          if (opts.strictSchema === false) {
            self.logger.warn(unknownMsg());
            return;
          }
          throw new Error(unknownMsg());
          function unknownMsg() {
            return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
          }
        }
        function getFormat(fmtDef) {
          const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : undefined;
          const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
          if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
            return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
          }
          return ["string", fmtDef, fmt];
        }
        function validCondition() {
          if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
            if (!schemaEnv.$async)
              throw new Error("async format in sync schema");
            return (0, codegen_1._)`await ${fmtRef}(${data})`;
          }
          return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
        }
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var format_1 = require_format();
  var format = [format_1.default];
  exports.default = format;
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.contentVocabulary = exports.metadataVocabulary = undefined;
  exports.metadataVocabulary = [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples"
  ];
  exports.contentVocabulary = [
    "contentMediaType",
    "contentEncoding",
    "contentSchema"
  ];
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var core_1 = require_core2();
  var validation_1 = require_validation();
  var applicator_1 = require_applicator();
  var dynamic_1 = require_dynamic();
  var next_1 = require_next();
  var unevaluated_1 = require_unevaluated();
  var format_1 = require_format2();
  var metadata_1 = require_metadata();
  var draft2020Vocabularies = [
    dynamic_1.default,
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(true),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary,
    next_1.default,
    unevaluated_1.default
  ];
  exports.default = draft2020Vocabularies;
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.DiscrError = undefined;
  var DiscrError;
  (function(DiscrError) {
    DiscrError["Tag"] = "tag";
    DiscrError["Mapping"] = "mapping";
  })(DiscrError || (exports.DiscrError = DiscrError = {}));
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var types_1 = require_types();
  var compile_1 = require_compile();
  var ref_error_1 = require_ref_error();
  var util_1 = require_util();
  var error = {
    message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
    params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
  };
  var def = {
    keyword: "discriminator",
    type: "object",
    schemaType: "object",
    error,
    code(cxt) {
      const { gen, data, schema, parentSchema, it } = cxt;
      const { oneOf } = parentSchema;
      if (!it.opts.discriminator) {
        throw new Error("discriminator: requires discriminator option");
      }
      const tagName = schema.propertyName;
      if (typeof tagName != "string")
        throw new Error("discriminator: requires propertyName");
      if (schema.mapping)
        throw new Error("discriminator: mapping is not supported");
      if (!oneOf)
        throw new Error("discriminator: requires oneOf keyword");
      const valid = gen.let("valid", false);
      const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
      gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
      cxt.ok(valid);
      function validateMapping() {
        const mapping = getMapping();
        gen.if(false);
        for (const tagValue in mapping) {
          gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
          gen.assign(valid, applyTagSchema(mapping[tagValue]));
        }
        gen.else();
        cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
        gen.endIf();
      }
      function applyTagSchema(schemaProp) {
        const _valid = gen.name("valid");
        const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
        cxt.mergeEvaluated(schCxt, codegen_1.Name);
        return _valid;
      }
      function getMapping() {
        var _a;
        const oneOfMapping = {};
        const topRequired = hasRequired(parentSchema);
        let tagRequired = true;
        for (let i = 0;i < oneOf.length; i++) {
          let sch = oneOf[i];
          if ((sch === null || sch === undefined ? undefined : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
            const ref = sch.$ref;
            sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
            if (sch instanceof compile_1.SchemaEnv)
              sch = sch.schema;
            if (sch === undefined)
              throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
          }
          const propSch = (_a = sch === null || sch === undefined ? undefined : sch.properties) === null || _a === undefined ? undefined : _a[tagName];
          if (typeof propSch != "object") {
            throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
          }
          tagRequired = tagRequired && (topRequired || hasRequired(sch));
          addMappings(propSch, i);
        }
        if (!tagRequired)
          throw new Error(`discriminator: "${tagName}" must be required`);
        return oneOfMapping;
        function hasRequired({ required }) {
          return Array.isArray(required) && required.includes(tagName);
        }
        function addMappings(sch, i) {
          if (sch.const) {
            addMapping(sch.const, i);
          } else if (sch.enum) {
            for (const tagValue of sch.enum) {
              addMapping(tagValue, i);
            }
          } else {
            throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
          }
        }
        function addMapping(tagValue, i) {
          if (typeof tagValue != "string" || tagValue in oneOfMapping) {
            throw new Error(`discriminator: "${tagName}" values must be unique strings`);
          }
          oneOfMapping[tagValue] = i;
        }
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/schema",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/core": true,
      "https://json-schema.org/draft/2020-12/vocab/applicator": true,
      "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
      "https://json-schema.org/draft/2020-12/vocab/validation": true,
      "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
      "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
      "https://json-schema.org/draft/2020-12/vocab/content": true
    },
    $dynamicAnchor: "meta",
    title: "Core and Validation specifications meta-schema",
    allOf: [
      { $ref: "meta/core" },
      { $ref: "meta/applicator" },
      { $ref: "meta/unevaluated" },
      { $ref: "meta/validation" },
      { $ref: "meta/meta-data" },
      { $ref: "meta/format-annotation" },
      { $ref: "meta/content" }
    ],
    type: ["object", "boolean"],
    $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
    properties: {
      definitions: {
        $comment: '"definitions" has been replaced by "$defs".',
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        deprecated: true,
        default: {}
      },
      dependencies: {
        $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
        type: "object",
        additionalProperties: {
          anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
        },
        deprecated: true,
        default: {}
      },
      $recursiveAnchor: {
        $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
        $ref: "meta/core#/$defs/anchorString",
        deprecated: true
      },
      $recursiveRef: {
        $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
        $ref: "meta/core#/$defs/uriReferenceString",
        deprecated: true
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/applicator",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/applicator": true
    },
    $dynamicAnchor: "meta",
    title: "Applicator vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      prefixItems: { $ref: "#/$defs/schemaArray" },
      items: { $dynamicRef: "#meta" },
      contains: { $dynamicRef: "#meta" },
      additionalProperties: { $dynamicRef: "#meta" },
      properties: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        default: {}
      },
      patternProperties: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        propertyNames: { format: "regex" },
        default: {}
      },
      dependentSchemas: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        default: {}
      },
      propertyNames: { $dynamicRef: "#meta" },
      if: { $dynamicRef: "#meta" },
      then: { $dynamicRef: "#meta" },
      else: { $dynamicRef: "#meta" },
      allOf: { $ref: "#/$defs/schemaArray" },
      anyOf: { $ref: "#/$defs/schemaArray" },
      oneOf: { $ref: "#/$defs/schemaArray" },
      not: { $dynamicRef: "#meta" }
    },
    $defs: {
      schemaArray: {
        type: "array",
        minItems: 1,
        items: { $dynamicRef: "#meta" }
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
    },
    $dynamicAnchor: "meta",
    title: "Unevaluated applicator vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      unevaluatedItems: { $dynamicRef: "#meta" },
      unevaluatedProperties: { $dynamicRef: "#meta" }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/content",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/content": true
    },
    $dynamicAnchor: "meta",
    title: "Content vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      contentEncoding: { type: "string" },
      contentMediaType: { type: "string" },
      contentSchema: { $dynamicRef: "#meta" }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/core",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/core": true
    },
    $dynamicAnchor: "meta",
    title: "Core vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      $id: {
        $ref: "#/$defs/uriReferenceString",
        $comment: "Non-empty fragments not allowed.",
        pattern: "^[^#]*#?$"
      },
      $schema: { $ref: "#/$defs/uriString" },
      $ref: { $ref: "#/$defs/uriReferenceString" },
      $anchor: { $ref: "#/$defs/anchorString" },
      $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
      $dynamicAnchor: { $ref: "#/$defs/anchorString" },
      $vocabulary: {
        type: "object",
        propertyNames: { $ref: "#/$defs/uriString" },
        additionalProperties: {
          type: "boolean"
        }
      },
      $comment: {
        type: "string"
      },
      $defs: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" }
      }
    },
    $defs: {
      anchorString: {
        type: "string",
        pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
      },
      uriString: {
        type: "string",
        format: "uri"
      },
      uriReferenceString: {
        type: "string",
        format: "uri-reference"
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
    },
    $dynamicAnchor: "meta",
    title: "Format vocabulary meta-schema for annotation results",
    type: ["object", "boolean"],
    properties: {
      format: { type: "string" }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/meta-data": true
    },
    $dynamicAnchor: "meta",
    title: "Meta-data vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      title: {
        type: "string"
      },
      description: {
        type: "string"
      },
      default: true,
      deprecated: {
        type: "boolean",
        default: false
      },
      readOnly: {
        type: "boolean",
        default: false
      },
      writeOnly: {
        type: "boolean",
        default: false
      },
      examples: {
        type: "array",
        items: true
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS(function(exports, module) {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/validation",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/validation": true
    },
    $dynamicAnchor: "meta",
    title: "Validation vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      type: {
        anyOf: [
          { $ref: "#/$defs/simpleTypes" },
          {
            type: "array",
            items: { $ref: "#/$defs/simpleTypes" },
            minItems: 1,
            uniqueItems: true
          }
        ]
      },
      const: true,
      enum: {
        type: "array",
        items: true
      },
      multipleOf: {
        type: "number",
        exclusiveMinimum: 0
      },
      maximum: {
        type: "number"
      },
      exclusiveMaximum: {
        type: "number"
      },
      minimum: {
        type: "number"
      },
      exclusiveMinimum: {
        type: "number"
      },
      maxLength: { $ref: "#/$defs/nonNegativeInteger" },
      minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
      pattern: {
        type: "string",
        format: "regex"
      },
      maxItems: { $ref: "#/$defs/nonNegativeInteger" },
      minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
      uniqueItems: {
        type: "boolean",
        default: false
      },
      maxContains: { $ref: "#/$defs/nonNegativeInteger" },
      minContains: {
        $ref: "#/$defs/nonNegativeInteger",
        default: 1
      },
      maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
      minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
      required: { $ref: "#/$defs/stringArray" },
      dependentRequired: {
        type: "object",
        additionalProperties: {
          $ref: "#/$defs/stringArray"
        }
      }
    },
    $defs: {
      nonNegativeInteger: {
        type: "integer",
        minimum: 0
      },
      nonNegativeIntegerDefault0: {
        $ref: "#/$defs/nonNegativeInteger",
        default: 0
      },
      simpleTypes: {
        enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
      },
      stringArray: {
        type: "array",
        items: { type: "string" },
        uniqueItems: true,
        default: []
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS(function(exports) {
  Object.defineProperty(exports, "__esModule", { value: true });
  var metaSchema = require_schema();
  var applicator = require_applicator2();
  var unevaluated = require_unevaluated2();
  var content = require_content();
  var core = require_core3();
  var format = require_format_annotation();
  var metadata = require_meta_data();
  var validation = require_validation2();
  var META_SUPPORT_DATA = ["/properties"];
  function addMetaSchema2020($data) {
    [
      metaSchema,
      applicator,
      unevaluated,
      content,
      core,
      with$data(this, format),
      metadata,
      with$data(this, validation)
    ].forEach((sch) => this.addMetaSchema(sch, undefined, false));
    return this;
    function with$data(ajv, sch) {
      return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
    }
  }
  exports.default = addMetaSchema2020;
});

// node_modules/ajv/dist/2020.js
var require__2020 = __commonJS(function(exports, module) {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = undefined;
  var core_1 = require_core();
  var draft2020_1 = require_draft2020();
  var discriminator_1 = require_discriminator();
  var json_schema_2020_12_1 = require_json_schema_2020_12();
  var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";

  class Ajv2020 extends core_1.default {
    constructor(opts = {}) {
      super({
        ...opts,
        dynamicRef: true,
        next: true,
        unevaluated: true
      });
    }
    _addVocabularies() {
      super._addVocabularies();
      draft2020_1.default.forEach((v) => this.addVocabulary(v));
      if (this.opts.discriminator)
        this.addKeyword(discriminator_1.default);
    }
    _addDefaultMetaSchema() {
      super._addDefaultMetaSchema();
      const { $data, meta } = this.opts;
      if (!meta)
        return;
      json_schema_2020_12_1.default.call(this, $data);
      this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
    }
    defaultMeta() {
      return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : undefined);
    }
  }
  exports.Ajv2020 = Ajv2020;
  module.exports = exports = Ajv2020;
  module.exports.Ajv2020 = Ajv2020;
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = Ajv2020;
  var validate_1 = require_validate();
  Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
    return validate_1.KeywordCxt;
  } });
  var codegen_1 = require_codegen();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return codegen_1._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return codegen_1.str;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return codegen_1.stringify;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return codegen_1.nil;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return codegen_1.Name;
  } });
  Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
    return codegen_1.CodeGen;
  } });
  var validation_error_1 = require_validation_error();
  Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
    return validation_error_1.default;
  } });
  var ref_error_1 = require_ref_error();
  Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
    return ref_error_1.default;
  } });
});

// src/model/types.ts
var SCALAR_TYPES = ["boolean", "integer", "decimal", "float", "string", "binary", "date", "time", "timestamp"];
var ELEMENT_KINDS = ["field", "record", "group"];
var NULLABILITIES = ["required", "absent-allowed", "unspecified"];
var CARDINALITIES = ["one", "array", "map", "unspecified"];

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
  return copyJsonCharged(input);
}
function copyJsonCharged(input, charge) {
  const active = new Set;
  let values = 0;
  function visit(value, path, depth) {
    charge?.(1);
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
// spec/core/schema-properties-document.schema.json
var schema_properties_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.8.0",
  title: "UMF 0.8.0 schema properties",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.8.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    },
    title: {
      type: "string"
    },
    aliases: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1
      }
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        },
        nullability: {
          type: "string",
          minLength: 1,
          description: "Ideal value availability. Unknown labels remain uninterpreted. Missing and unspecified assert no availability constraint. Native absence carriers require explicit bindings."
        },
        cardinality: {
          type: "string",
          minLength: 1,
          description: "One ideal value, finite ordered sequence with duplicates allowed, finite exact string-key mapping with unique keys, or no assertion. Unknown labels remain uninterpreted."
        },
        itemType: {
          $ref: "#/$defs/itemType"
        },
        facets: {
          $ref: "#/$defs/facets"
        },
        members: {
          type: "array",
          uniqueItems: true,
          items: {
            $ref: "#/$defs/keyFieldReference"
          }
        },
        keys: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/key"
          }
        },
        title: {
          type: "string"
        },
        aliases: {
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1
          }
        },
        examples: {
          type: "array",
          items: {
            $ref: "#/$defs/literal"
          }
        },
        allowedValues: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/literal"
          }
        },
        default: {
          type: "object",
          required: [
            "value",
            "on"
          ],
          properties: {
            value: {
              $ref: "#/$defs/literal"
            },
            on: {
              enum: [
                "missing",
                "null",
                "missing-or-null"
              ]
            }
          },
          additionalProperties: true
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        },
        {
          if: {
            required: [
              "nullability"
            ],
            properties: {
              nullability: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          },
          then: {
            not: {
              required: [
                "scalarType"
              ]
            }
          }
        },
        {
          if: {
            required: [
              "itemType"
            ],
            properties: {
              itemType: {}
            }
          },
          then: {
            required: [
              "kind",
              "cardinality"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              },
              references: {
                type: "array",
                not: {
                  contains: {
                    type: "object",
                    required: [
                      "role"
                    ],
                    properties: {
                      role: {
                        const: "record-type"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                enum: [
                  "string",
                  "binary"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "unicode-scalar"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "string"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "byte"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "binary"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "precision"
                ],
                properties: {
                  precision: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "decimal"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "integerWidth"
                ],
                properties: {
                  integerWidth: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "integer"
              }
            }
          }
        },
        {
          if: {
            properties: {
              members: {}
            },
            required: [
              "members"
            ]
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "record"
              }
            }
          }
        },
        {
          if: {
            properties: {
              keys: {}
            },
            required: [
              "keys"
            ]
          },
          then: {
            required: [
              "kind",
              "members"
            ],
            properties: {
              kind: {
                const: "record"
              },
              members: {}
            }
          }
        },
        {
          if: {
            required: [
              "examples"
            ],
            properties: {
              examples: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "allowedValues"
            ],
            properties: {
              allowedValues: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "default"
            ],
            properties: {
              default: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        relationships: {
          type: "array",
          items: {
            $ref: "#/$defs/relationship"
          }
        },
        title: {
          type: "string"
        },
        aliases: {
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1
          }
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    },
    knownNullability: {
      enum: [
        "required",
        "absent-allowed",
        "unspecified"
      ]
    },
    knownCardinality: {
      enum: [
        "one",
        "array",
        "map",
        "unspecified"
      ]
    },
    itemType: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    facets: {
      type: "object",
      description: "Missing members impose no bound. Unknown members and qualifiers are retained without interpretation.",
      properties: {
        length: {
          type: "object",
          required: [
            "unit"
          ],
          anyOf: [
            {
              required: [
                "min"
              ],
              properties: {
                min: {}
              }
            },
            {
              required: [
                "max"
              ],
              properties: {
                max: {}
              }
            }
          ],
          properties: {
            min: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            },
            max: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            },
            unit: {
              type: "string",
              minLength: 1
            }
          },
          additionalProperties: true
        },
        precision: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "Decimal coefficient digit bound; requires scale. Absolute coefficient is less than 10^precision. No implicit rounding."
        },
        scale: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
          description: "Fixed fractional digit count; requires precision. Semantic validation requires scale <= precision. Value equals integer coefficient times 10^-scale."
        },
        integerWidth: {
          type: "object",
          required: [
            "bits",
            "signed"
          ],
          properties: {
            bits: {
              type: "integer",
              minimum: 1,
              maximum: 9007199254740991
            },
            signed: {
              type: "boolean"
            }
          },
          description: "Signed [-2^(bits-1),2^(bits-1)-1] or unsigned [0,2^bits-1]; mathematical domain, not a physical storage-width assertion."
        },
        collectionSize: {
          type: "object",
          anyOf: [
            {
              required: [
                "min"
              ],
              properties: {
                min: {}
              }
            },
            {
              required: [
                "max"
              ],
              properties: {
                max: {}
              }
            }
          ],
          properties: {
            min: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            },
            max: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            }
          },
          additionalProperties: true
        },
        range: {
          type: "object",
          anyOf: [
            {
              required: [
                "min"
              ],
              properties: {
                min: {}
              }
            },
            {
              required: [
                "max"
              ],
              properties: {
                max: {}
              }
            }
          ],
          properties: {
            min: {
              $ref: "#/$defs/literal"
            },
            max: {
              $ref: "#/$defs/literal"
            },
            minInclusive: {
              type: "boolean"
            },
            maxInclusive: {
              type: "boolean"
            }
          },
          additionalProperties: true
        }
      },
      dependentRequired: {
        precision: [
          "scale"
        ],
        scale: [
          "precision"
        ]
      }
    },
    keyFieldReference: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    key: {
      type: "object",
      required: [
        "id",
        "name",
        "fields"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          $ref: "#/$defs/id"
        },
        fields: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            $ref: "#/$defs/keyFieldReference"
          }
        },
        primary: {
          type: "boolean"
        }
      },
      additionalProperties: true
    },
    relationshipEndpoint: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    relationshipTarget: {
      type: "object",
      required: [
        "module",
        "element",
        "key"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        },
        key: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    relationshipMultiplicity: {
      type: "object",
      required: [
        "min",
        "max"
      ],
      properties: {
        min: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991
        },
        max: {
          anyOf: [
            {
              type: "integer",
              minimum: 1,
              maximum: 9007199254740991
            },
            {
              const: "*"
            }
          ]
        }
      },
      additionalProperties: true
    },
    relationship: {
      type: "object",
      required: [
        "id",
        "name",
        "source",
        "target",
        "sourceMultiplicity",
        "targetMultiplicity",
        "targetLifecycle",
        "directed"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          $ref: "#/$defs/id"
        },
        source: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/relationshipEndpoint"
          }
        },
        target: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/relationshipTarget"
          }
        },
        sourceMultiplicity: {
          $ref: "#/$defs/relationshipMultiplicity"
        },
        targetMultiplicity: {
          $ref: "#/$defs/relationshipMultiplicity"
        },
        targetLifecycle: {
          type: "string",
          minLength: 1
        },
        directed: {
          type: "boolean"
        },
        inverse: {
          $ref: "#/$defs/id"
        },
        associationRecord: {
          $ref: "#/$defs/relationshipEndpoint"
        }
      },
      additionalProperties: true
    },
    literal: {
      oneOf: [
        {
          type: "null"
        },
        {
          type: "object",
          required: [
            "boolean"
          ],
          properties: {
            boolean: {
              type: "boolean"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "integerToken"
          ],
          properties: {
            integerToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$(?![\\s\\S])"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "decimalToken"
          ],
          properties: {
            decimalToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$(?![\\s\\S])"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "string"
          ],
          properties: {
            string: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "binaryHex"
          ],
          properties: {
            binaryHex: {
              type: "string",
              pattern: "^([0-9a-fA-F]{2})*$(?![\\s\\S])"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "floatToken"
          ],
          properties: {
            floatToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$(?![\\s\\S])"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "date"
          ],
          properties: {
            date: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "time"
          ],
          properties: {
            time: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "timestamp"
          ],
          properties: {
            timestamp: {
              type: "string"
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "array"
          ],
          properties: {
            array: {
              type: "array",
              items: {
                $ref: "#/$defs/literal"
              }
            }
          },
          additionalProperties: false
        },
        {
          type: "object",
          required: [
            "map"
          ],
          properties: {
            map: {
              type: "object",
              additionalProperties: {
                $ref: "#/$defs/literal"
              }
            }
          },
          additionalProperties: false
        }
      ]
    }
  },
  description: "Shared annotations, literal defaults and exact value/collection bounds; semantic validator required.",
  $comment: "Exact endpoint/key resolution, unique IDs/names, inverse collisions, multiplicity bounds and lifecycle coherence require portable semantic validation."
};
// spec/core/relationship-document.schema.json
var relationship_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.7.0",
  title: "UMF 0.7.0 relationship envelope",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.7.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        },
        nullability: {
          type: "string",
          minLength: 1,
          description: "Ideal value availability. Unknown labels remain uninterpreted. Missing and unspecified assert no availability constraint. Native absence carriers require explicit bindings."
        },
        cardinality: {
          type: "string",
          minLength: 1,
          description: "One ideal value, finite ordered sequence with duplicates allowed, finite exact string-key mapping with unique keys, or no assertion. Unknown labels remain uninterpreted."
        },
        itemType: {
          $ref: "#/$defs/itemType"
        },
        facets: {
          $ref: "#/$defs/facets"
        },
        members: {
          type: "array",
          uniqueItems: true,
          items: {
            $ref: "#/$defs/keyFieldReference"
          }
        },
        keys: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/key"
          }
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        },
        {
          if: {
            required: [
              "nullability"
            ],
            properties: {
              nullability: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          },
          then: {
            not: {
              required: [
                "scalarType"
              ]
            }
          }
        },
        {
          if: {
            required: [
              "itemType"
            ],
            properties: {
              itemType: {}
            }
          },
          then: {
            required: [
              "kind",
              "cardinality"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "one",
                  "unspecified"
                ]
              },
              references: {
                type: "array",
                not: {
                  contains: {
                    type: "object",
                    required: [
                      "role"
                    ],
                    properties: {
                      role: {
                        const: "record-type"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                enum: [
                  "string",
                  "binary"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "unicode-scalar"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "string"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "byte"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "binary"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "precision"
                ],
                properties: {
                  precision: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "decimal"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "integerWidth"
                ],
                properties: {
                  integerWidth: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "integer"
              }
            }
          }
        },
        {
          if: {
            properties: {
              members: {}
            },
            required: [
              "members"
            ]
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "record"
              }
            }
          }
        },
        {
          if: {
            properties: {
              keys: {}
            },
            required: [
              "keys"
            ]
          },
          then: {
            required: [
              "kind",
              "members"
            ],
            properties: {
              kind: {
                const: "record"
              },
              members: {}
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        relationships: {
          type: "array",
          items: {
            $ref: "#/$defs/relationship"
          }
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    },
    knownNullability: {
      enum: [
        "required",
        "absent-allowed",
        "unspecified"
      ]
    },
    knownCardinality: {
      enum: [
        "one",
        "array",
        "map",
        "unspecified"
      ]
    },
    itemType: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    facets: {
      type: "object",
      description: "Missing members impose no bound. Unknown members and qualifiers are retained without interpretation.",
      properties: {
        length: {
          type: "object",
          required: [
            "max",
            "unit"
          ],
          properties: {
            max: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            },
            unit: {
              type: "string",
              minLength: 1,
              description: "Known units: unicode-scalar for string, byte for binary. Unknown units remain uninterpreted."
            }
          }
        },
        precision: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "Decimal coefficient digit bound; requires scale. Absolute coefficient is less than 10^precision. No implicit rounding."
        },
        scale: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
          description: "Fixed fractional digit count; requires precision. Semantic validation requires scale <= precision. Value equals integer coefficient times 10^-scale."
        },
        integerWidth: {
          type: "object",
          required: [
            "bits",
            "signed"
          ],
          properties: {
            bits: {
              type: "integer",
              minimum: 1,
              maximum: 9007199254740991
            },
            signed: {
              type: "boolean"
            }
          },
          description: "Signed [-2^(bits-1),2^(bits-1)-1] or unsigned [0,2^bits-1]; mathematical domain, not a physical storage-width assertion."
        }
      },
      dependentRequired: {
        precision: [
          "scale"
        ],
        scale: [
          "precision"
        ]
      }
    },
    keyFieldReference: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    key: {
      type: "object",
      required: [
        "id",
        "name",
        "fields"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          $ref: "#/$defs/id"
        },
        fields: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            $ref: "#/$defs/keyFieldReference"
          }
        },
        primary: {
          type: "boolean"
        }
      },
      additionalProperties: true
    },
    relationshipEndpoint: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    relationshipTarget: {
      type: "object",
      required: [
        "module",
        "element",
        "key"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        },
        key: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    relationshipMultiplicity: {
      type: "object",
      required: [
        "min",
        "max"
      ],
      properties: {
        min: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991
        },
        max: {
          anyOf: [
            {
              type: "integer",
              minimum: 1,
              maximum: 9007199254740991
            },
            {
              const: "*"
            }
          ]
        }
      },
      additionalProperties: true
    },
    relationship: {
      type: "object",
      required: [
        "id",
        "name",
        "source",
        "target",
        "sourceMultiplicity",
        "targetMultiplicity",
        "targetLifecycle",
        "directed"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          $ref: "#/$defs/id"
        },
        source: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/relationshipEndpoint"
          }
        },
        target: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/relationshipTarget"
          }
        },
        sourceMultiplicity: {
          $ref: "#/$defs/relationshipMultiplicity"
        },
        targetMultiplicity: {
          $ref: "#/$defs/relationshipMultiplicity"
        },
        targetLifecycle: {
          type: "string",
          minLength: 1
        },
        directed: {
          type: "boolean"
        },
        inverse: {
          $ref: "#/$defs/id"
        },
        associationRecord: {
          $ref: "#/$defs/relationshipEndpoint"
        }
      },
      additionalProperties: true
    }
  },
  description: "Authored schema-level relationships between keyed Records; native enforcement and storage are not inferred. Unknown qualifiers are retained.",
  $comment: "Exact endpoint/key resolution, unique IDs/names, inverse collisions, multiplicity bounds and lifecycle coherence require portable semantic validation."
};
// spec/core/key-document.schema.json
var key_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.6.0",
  title: "UMF 0.6.0 key envelope",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.6.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        },
        nullability: {
          type: "string",
          minLength: 1,
          description: "Ideal value availability. Unknown labels remain uninterpreted. Missing and unspecified assert no availability constraint. Native absence carriers require explicit bindings."
        },
        cardinality: {
          type: "string",
          minLength: 1,
          description: "One ideal value, finite ordered sequence with duplicates allowed, finite exact string-key mapping with unique keys, or no assertion. Unknown labels remain uninterpreted."
        },
        itemType: {
          $ref: "#/$defs/itemType"
        },
        facets: {
          $ref: "#/$defs/facets"
        },
        members: {
          type: "array",
          uniqueItems: true,
          items: {
            $ref: "#/$defs/keyFieldReference"
          }
        },
        keys: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/key"
          }
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        },
        {
          if: {
            required: [
              "nullability"
            ],
            properties: {
              nullability: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          },
          then: {
            not: {
              required: [
                "scalarType"
              ]
            }
          }
        },
        {
          if: {
            required: [
              "itemType"
            ],
            properties: {
              itemType: {}
            }
          },
          then: {
            required: [
              "kind",
              "cardinality"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "one",
                  "unspecified"
                ]
              },
              references: {
                type: "array",
                not: {
                  contains: {
                    type: "object",
                    required: [
                      "role"
                    ],
                    properties: {
                      role: {
                        const: "record-type"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                enum: [
                  "string",
                  "binary"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "unicode-scalar"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "string"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "byte"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "binary"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "precision"
                ],
                properties: {
                  precision: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "decimal"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "integerWidth"
                ],
                properties: {
                  integerWidth: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "integer"
              }
            }
          }
        },
        {
          if: {
            properties: {
              members: {}
            },
            required: [
              "members"
            ]
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "record"
              }
            }
          }
        },
        {
          if: {
            properties: {
              keys: {}
            },
            required: [
              "keys"
            ]
          },
          then: {
            required: [
              "kind",
              "members"
            ],
            properties: {
              kind: {
                const: "record"
              },
              members: {}
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    },
    knownNullability: {
      enum: [
        "required",
        "absent-allowed",
        "unspecified"
      ]
    },
    knownCardinality: {
      enum: [
        "one",
        "array",
        "map",
        "unspecified"
      ]
    },
    itemType: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    facets: {
      type: "object",
      description: "Missing members impose no bound. Unknown members and qualifiers are retained without interpretation.",
      properties: {
        length: {
          type: "object",
          required: [
            "max",
            "unit"
          ],
          properties: {
            max: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            },
            unit: {
              type: "string",
              minLength: 1,
              description: "Known units: unicode-scalar for string, byte for binary. Unknown units remain uninterpreted."
            }
          }
        },
        precision: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "Decimal coefficient digit bound; requires scale. Absolute coefficient is less than 10^precision. No implicit rounding."
        },
        scale: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
          description: "Fixed fractional digit count; requires precision. Semantic validation requires scale <= precision. Value equals integer coefficient times 10^-scale."
        },
        integerWidth: {
          type: "object",
          required: [
            "bits",
            "signed"
          ],
          properties: {
            bits: {
              type: "integer",
              minimum: 1,
              maximum: 9007199254740991
            },
            signed: {
              type: "boolean"
            }
          },
          description: "Signed [-2^(bits-1),2^(bits-1)-1] or unsigned [0,2^bits-1]; mathematical domain, not a physical storage-width assertion."
        }
      },
      dependentRequired: {
        precision: [
          "scale"
        ],
        scale: [
          "precision"
        ]
      }
    },
    keyFieldReference: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      },
      additionalProperties: true
    },
    key: {
      type: "object",
      required: [
        "id",
        "name",
        "fields"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          $ref: "#/$defs/id"
        },
        fields: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            $ref: "#/$defs/keyFieldReference"
          }
        },
        primary: {
          type: "boolean"
        }
      },
      additionalProperties: true
    }
  },
  description: "Candidate envelope for authored named primary/alternate keys and explicit Record membership, retaining earlier Field, availability, cardinality and facet ideals. Cross-reference and equality semantics require portable validation; native enforcement is not inferred.",
  $comment: "Key membership resolution, unique ownership, key IDs/names/component sets, primary count and component domains require portable semantic validation. Native enforcement is not inferred."
};
// spec/core/key-tuple-operation-v3.schema.json
var key_tuple_operation_v3_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:key-tuple-operation:3.0.0",
  title: "Current core key tuple encoding receipt",
  type: "object",
  required: [
    "operation",
    "version",
    "profile",
    "source",
    "identity",
    "values",
    "keyPath",
    "bytesHex"
  ],
  additionalProperties: false,
  properties: {
    operation: {
      const: "encode-core-key-tuple"
    },
    version: {
      const: "3.0.0"
    },
    profile: {
      const: "umf-key-tuple-v1"
    },
    source: {
      $ref: "urn:umf:core:0.8.0"
    },
    identity: {
      $ref: "#/$defs/identity"
    },
    values: {
      type: "array",
      minItems: 1,
      items: {
        $ref: "#/$defs/value"
      }
    },
    keyPath: {
      type: "string",
      pattern: "^/modules/[0-9]+/elements/[0-9]+/keys/[0-9]+$"
    },
    bytesHex: {
      type: "string",
      pattern: "^554d464b31([0-9a-f]{2})+$",
      maxLength: 8000000
    }
  },
  $defs: {
    identity: {
      type: "object",
      required: [
        "module",
        "element",
        "key"
      ],
      additionalProperties: false,
      properties: {
        module: {
          type: "string",
          minLength: 1
        },
        element: {
          type: "string",
          minLength: 1
        },
        key: {
          type: "string",
          minLength: 1
        }
      }
    },
    value: {
      oneOf: [
        {
          type: "object",
          required: [
            "boolean"
          ],
          additionalProperties: false,
          properties: {
            boolean: {
              type: "boolean"
            }
          }
        },
        {
          type: "object",
          required: [
            "integerToken"
          ],
          additionalProperties: false,
          properties: {
            integerToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$"
            }
          }
        },
        {
          type: "object",
          required: [
            "decimalToken"
          ],
          additionalProperties: false,
          properties: {
            decimalToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$"
            }
          }
        },
        {
          type: "object",
          required: [
            "string"
          ],
          additionalProperties: false,
          properties: {
            string: {
              type: "string"
            }
          }
        },
        {
          type: "object",
          required: [
            "binaryHex"
          ],
          additionalProperties: false,
          properties: {
            binaryHex: {
              type: "string",
              pattern: "^([0-9a-fA-F]{2})*$"
            }
          }
        }
      ]
    }
  },
  description: "Structural receipt validation is insufficient: verification recomputes exact tuple bytes from retained candidate source/values and checks current document context. This establishes neither authorship nor native enforcement."
};
// spec/core/dataset-value-operation.schema.json
var dataset_value_operation_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:dataset-value-operation:1.0.0",
  title: "Experimental supplied dataset value check receipt",
  type: "object",
  properties: {
    operation: {
      const: "validate-core-dataset-values"
    },
    version: {
      const: "1.0.0"
    },
    scope: {
      const: "supplied-dataset-only"
    },
    provenance: {
      const: "unverified"
    },
    source: {
      $ref: "urn:umf:core:0.8.0"
    },
    input: {
      $ref: "#/$defs/input"
    },
    documentValidation: {
      $ref: "#/$defs/validation"
    },
    records: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            minLength: 1
          },
          result: {
            $ref: "#/$defs/recordCheck"
          }
        },
        required: [
          "instanceId",
          "result"
        ],
        additionalProperties: false
      }
    },
    keys: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            minLength: 1
          },
          result: {
            $ref: "urn:umf:core:key-tuple-operation:3.0.0"
          }
        },
        required: [
          "instanceId",
          "result"
        ],
        additionalProperties: false
      }
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            minLength: 1
          },
          identity: {
            $ref: "#/$defs/relationshipIdentity"
          },
          sourceInstanceId: {
            type: "string",
            minLength: 1
          },
          targetInstanceId: {
            type: "string",
            minLength: 1
          },
          targetKey: {
            $ref: "urn:umf:core:key-tuple-operation:3.0.0"
          }
        },
        required: [
          "instanceId",
          "identity",
          "sourceInstanceId",
          "targetInstanceId",
          "targetKey"
        ],
        additionalProperties: false
      }
    },
    datasetValidation: {
      $ref: "#/$defs/validation"
    },
    obligations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            enum: [
              "dataset.keys",
              "dataset.relationships"
            ]
          },
          state: {
            enum: [
              "satisfied",
              "invalid",
              "unresolved"
            ]
          },
          scope: {
            const: "supplied-dataset-only"
          }
        },
        required: [
          "id",
          "state",
          "scope"
        ],
        additionalProperties: false
      }
    },
    residuals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string"
          },
          value: {},
          reason: {
            type: "string",
            minLength: 1
          }
        },
        required: [
          "path",
          "value",
          "reason"
        ],
        additionalProperties: false
      }
    }
  },
  required: [
    "operation",
    "version",
    "scope",
    "provenance",
    "source",
    "input",
    "documentValidation",
    "records",
    "keys",
    "relationships",
    "datasetValidation",
    "obligations",
    "residuals"
  ],
  additionalProperties: false,
  $defs: {
    identity: {
      type: "object",
      properties: {
        module: {
          type: "string",
          minLength: 1
        },
        element: {
          type: "string",
          minLength: 1
        }
      },
      required: [
        "module",
        "element"
      ],
      additionalProperties: false
    },
    relationshipIdentity: {
      type: "object",
      properties: {
        module: {
          type: "string",
          minLength: 1
        },
        id: {
          type: "string",
          minLength: 1
        }
      },
      required: [
        "module",
        "id"
      ],
      additionalProperties: false
    },
    validation: {
      type: "object",
      properties: {
        valid: {
          type: "boolean"
        },
        complete: {
          type: "boolean"
        },
        diagnostics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: {
                type: "string",
                minLength: 1
              },
              path: {
                type: "string"
              },
              message: {
                type: "string"
              },
              severity: {
                enum: [
                  "error",
                  "warning"
                ]
              }
            },
            required: [
              "code",
              "path",
              "message",
              "severity"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "valid",
        "complete",
        "diagnostics"
      ],
      additionalProperties: false
    },
    fieldValue: {
      oneOf: [
        {
          type: "object",
          properties: {
            field: {
              $ref: "#/$defs/identity"
            },
            state: {
              const: "absent"
            }
          },
          required: [
            "field",
            "state"
          ],
          additionalProperties: false
        },
        {
          type: "object",
          properties: {
            field: {
              $ref: "#/$defs/identity"
            },
            state: {
              const: "present"
            },
            value: {
              $ref: "urn:umf:core:0.8.0#/$defs/literal"
            }
          },
          required: [
            "field",
            "state",
            "value"
          ],
          additionalProperties: false
        }
      ]
    },
    input: {
      type: "object",
      properties: {
        scope: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1
            },
            closure: {
              const: "supplied-dataset-only"
            }
          },
          required: [
            "id",
            "closure"
          ],
          additionalProperties: false
        },
        records: {
          type: "array",
          items: {
            type: "object",
            properties: {
              instanceId: {
                type: "string",
                minLength: 1
              },
              identity: {
                $ref: "#/$defs/identity"
              },
              values: {
                type: "array",
                items: {
                  $ref: "#/$defs/fieldValue"
                }
              }
            },
            required: [
              "instanceId",
              "identity",
              "values"
            ],
            additionalProperties: false
          },
          maxItems: 1000
        },
        relationships: {
          type: "array",
          items: {
            type: "object",
            properties: {
              instanceId: {
                type: "string",
                minLength: 1
              },
              identity: {
                $ref: "#/$defs/relationshipIdentity"
              },
              sourceInstanceId: {
                type: "string",
                minLength: 1
              },
              target: {
                type: "object",
                properties: {
                  identity: {
                    $ref: "urn:umf:core:key-tuple-operation:3.0.0#/$defs/identity"
                  },
                  values: {
                    type: "array",
                    items: {
                      $ref: "urn:umf:core:key-tuple-operation:3.0.0#/$defs/value"
                    }
                  }
                },
                required: [
                  "identity",
                  "values"
                ],
                additionalProperties: false
              }
            },
            required: [
              "instanceId",
              "identity",
              "sourceInstanceId",
              "target"
            ],
            additionalProperties: false
          },
          maxItems: 1e4
        },
        context: {}
      },
      required: [
        "scope",
        "records",
        "relationships"
      ],
      additionalProperties: false
    },
    recordCheck: {
      type: "object",
      properties: {
        operation: {
          const: "validate-core-record-values"
        },
        version: {
          const: "1.0.0"
        },
        source: {
          $ref: "urn:umf:core:0.8.0"
        },
        identity: {
          $ref: "#/$defs/identity"
        },
        values: {
          type: "array",
          items: {
            $ref: "#/$defs/fieldValue"
          }
        },
        documentValidation: {
          $ref: "#/$defs/validation"
        },
        validation: {
          $ref: "#/$defs/validation"
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                $ref: "#/$defs/identity"
              },
              state: {
                enum: [
                  "absent",
                  "present"
                ]
              },
              validation: {
                $ref: "#/$defs/validation"
              }
            },
            required: [
              "field",
              "state",
              "validation"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "operation",
        "version",
        "source",
        "identity",
        "values",
        "documentValidation",
        "validation",
        "fields"
      ],
      additionalProperties: false
    }
  }
};
// spec/core/dataset-value-compact-operation.schema.json
var dataset_value_compact_operation_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:dataset-value-compact-operation:1.0.0",
  title: "Experimental compact supplied dataset value receipt",
  type: "object",
  properties: {
    operation: {
      const: "validate-core-dataset-values-compact"
    },
    version: {
      const: "1.0.0"
    },
    scope: {
      const: "supplied-dataset-only"
    },
    provenance: {
      const: "unverified"
    },
    source: {
      $ref: "urn:umf:core:0.8.0"
    },
    input: {
      $ref: "#/$defs/input"
    },
    documentValidation: {
      $ref: "#/$defs/validation"
    },
    records: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            minLength: 1
          },
          result: {
            $ref: "#/$defs/recordCheck"
          }
        },
        required: [
          "instanceId",
          "result"
        ],
        additionalProperties: false
      }
    },
    keys: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            minLength: 1
          },
          result: {
            $ref: "#/$defs/compactKey"
          }
        },
        required: [
          "instanceId",
          "result"
        ],
        additionalProperties: false
      }
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            minLength: 1
          },
          identity: {
            $ref: "#/$defs/relationshipIdentity"
          },
          sourceInstanceId: {
            type: "string",
            minLength: 1
          },
          targetInstanceId: {
            type: "string",
            minLength: 1
          },
          targetKey: {
            $ref: "#/$defs/compactKey"
          }
        },
        required: [
          "instanceId",
          "identity",
          "sourceInstanceId",
          "targetInstanceId",
          "targetKey"
        ],
        additionalProperties: false
      }
    },
    datasetValidation: {
      $ref: "#/$defs/validation"
    },
    obligations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            enum: [
              "dataset.keys",
              "dataset.relationships"
            ]
          },
          state: {
            enum: [
              "satisfied",
              "invalid",
              "unresolved"
            ]
          },
          scope: {
            const: "supplied-dataset-only"
          }
        },
        required: [
          "id",
          "state",
          "scope"
        ],
        additionalProperties: false
      }
    },
    residuals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: {
            type: "string"
          },
          value: {},
          reason: {
            type: "string",
            minLength: 1
          }
        },
        required: [
          "path",
          "value",
          "reason"
        ],
        additionalProperties: false
      }
    }
  },
  required: [
    "operation",
    "version",
    "scope",
    "provenance",
    "source",
    "input",
    "documentValidation",
    "records",
    "keys",
    "relationships",
    "datasetValidation",
    "obligations",
    "residuals"
  ],
  additionalProperties: false,
  $defs: {
    identity: {
      type: "object",
      properties: {
        module: {
          type: "string",
          minLength: 1
        },
        element: {
          type: "string",
          minLength: 1
        }
      },
      required: [
        "module",
        "element"
      ],
      additionalProperties: false
    },
    relationshipIdentity: {
      type: "object",
      properties: {
        module: {
          type: "string",
          minLength: 1
        },
        id: {
          type: "string",
          minLength: 1
        }
      },
      required: [
        "module",
        "id"
      ],
      additionalProperties: false
    },
    validation: {
      type: "object",
      properties: {
        valid: {
          type: "boolean"
        },
        complete: {
          type: "boolean"
        },
        diagnostics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: {
                type: "string",
                minLength: 1
              },
              path: {
                type: "string"
              },
              message: {
                type: "string"
              },
              severity: {
                enum: [
                  "error",
                  "warning"
                ]
              }
            },
            required: [
              "code",
              "path",
              "message",
              "severity"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "valid",
        "complete",
        "diagnostics"
      ],
      additionalProperties: false
    },
    fieldValue: {
      oneOf: [
        {
          type: "object",
          properties: {
            field: {
              $ref: "#/$defs/identity"
            },
            state: {
              const: "absent"
            }
          },
          required: [
            "field",
            "state"
          ],
          additionalProperties: false
        },
        {
          type: "object",
          properties: {
            field: {
              $ref: "#/$defs/identity"
            },
            state: {
              const: "present"
            },
            value: {
              $ref: "urn:umf:core:0.8.0#/$defs/literal"
            }
          },
          required: [
            "field",
            "state",
            "value"
          ],
          additionalProperties: false
        }
      ]
    },
    input: {
      type: "object",
      properties: {
        scope: {
          type: "object",
          properties: {
            id: {
              type: "string",
              minLength: 1
            },
            closure: {
              const: "supplied-dataset-only"
            }
          },
          required: [
            "id",
            "closure"
          ],
          additionalProperties: false
        },
        records: {
          type: "array",
          items: {
            type: "object",
            properties: {
              instanceId: {
                type: "string",
                minLength: 1
              },
              identity: {
                $ref: "#/$defs/identity"
              },
              values: {
                type: "array",
                items: {
                  $ref: "#/$defs/fieldValue"
                }
              }
            },
            required: [
              "instanceId",
              "identity",
              "values"
            ],
            additionalProperties: false
          },
          maxItems: 1000
        },
        relationships: {
          type: "array",
          items: {
            type: "object",
            properties: {
              instanceId: {
                type: "string",
                minLength: 1
              },
              identity: {
                $ref: "#/$defs/relationshipIdentity"
              },
              sourceInstanceId: {
                type: "string",
                minLength: 1
              },
              target: {
                type: "object",
                properties: {
                  identity: {
                    $ref: "urn:umf:core:key-tuple-operation:3.0.0#/$defs/identity"
                  },
                  values: {
                    type: "array",
                    items: {
                      $ref: "urn:umf:core:key-tuple-operation:3.0.0#/$defs/value"
                    }
                  }
                },
                required: [
                  "identity",
                  "values"
                ],
                additionalProperties: false
              }
            },
            required: [
              "instanceId",
              "identity",
              "sourceInstanceId",
              "target"
            ],
            additionalProperties: false
          },
          maxItems: 1e4
        },
        context: {}
      },
      required: [
        "scope",
        "records",
        "relationships"
      ],
      additionalProperties: false
    },
    recordCheck: {
      type: "object",
      properties: {
        operation: {
          const: "validate-core-record-values"
        },
        version: {
          const: "1.0.0"
        },
        identity: {
          $ref: "#/$defs/identity"
        },
        values: {
          type: "array",
          items: {
            $ref: "#/$defs/fieldValue"
          }
        },
        documentValidation: {
          $ref: "#/$defs/validation"
        },
        validation: {
          $ref: "#/$defs/validation"
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                $ref: "#/$defs/identity"
              },
              state: {
                enum: [
                  "absent",
                  "present"
                ]
              },
              validation: {
                $ref: "#/$defs/validation"
              }
            },
            required: [
              "field",
              "state",
              "validation"
            ],
            additionalProperties: false
          }
        },
        sourceRef: {
          const: "#/source"
        }
      },
      required: [
        "operation",
        "version",
        "sourceRef",
        "identity",
        "values",
        "documentValidation",
        "validation",
        "fields"
      ],
      additionalProperties: false
    },
    keyIdentity: {
      type: "object",
      required: [
        "module",
        "element",
        "key"
      ],
      additionalProperties: false,
      properties: {
        module: {
          type: "string",
          minLength: 1
        },
        element: {
          type: "string",
          minLength: 1
        },
        key: {
          type: "string",
          minLength: 1
        }
      }
    },
    keyValue: {
      oneOf: [
        {
          type: "object",
          required: [
            "boolean"
          ],
          additionalProperties: false,
          properties: {
            boolean: {
              type: "boolean"
            }
          }
        },
        {
          type: "object",
          required: [
            "integerToken"
          ],
          additionalProperties: false,
          properties: {
            integerToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$"
            }
          }
        },
        {
          type: "object",
          required: [
            "decimalToken"
          ],
          additionalProperties: false,
          properties: {
            decimalToken: {
              type: "string",
              pattern: "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$"
            }
          }
        },
        {
          type: "object",
          required: [
            "string"
          ],
          additionalProperties: false,
          properties: {
            string: {
              type: "string"
            }
          }
        },
        {
          type: "object",
          required: [
            "binaryHex"
          ],
          additionalProperties: false,
          properties: {
            binaryHex: {
              type: "string",
              pattern: "^([0-9a-fA-F]{2})*$"
            }
          }
        }
      ]
    },
    compactKey: {
      type: "object",
      required: [
        "operation",
        "version",
        "profile",
        "sourceRef",
        "identity",
        "values",
        "keyPath",
        "bytesHex"
      ],
      additionalProperties: false,
      properties: {
        operation: {
          const: "encode-core-key-tuple"
        },
        version: {
          const: "3.0.0"
        },
        profile: {
          const: "umf-key-tuple-v1"
        },
        identity: {
          $ref: "#/$defs/keyIdentity"
        },
        values: {
          type: "array",
          minItems: 1,
          items: {
            $ref: "#/$defs/keyValue"
          }
        },
        keyPath: {
          type: "string",
          pattern: "^/modules/[0-9]+/elements/[0-9]+/keys/[0-9]+$"
        },
        bytesHex: {
          type: "string",
          pattern: "^554d464b31([0-9a-f]{2})+$",
          maxLength: 8000000
        },
        sourceRef: {
          const: "#/source"
        }
      },
      description: "Structural receipt validation is insufficient: verification recomputes exact tuple bytes from retained candidate source/values and checks current document context. This establishes neither authorship nor native enforcement."
    }
  }
};

// src/validation/internal-schema.ts
function snapshotSchema(input) {
  const value = JSON.parse(JSON.stringify(input));
  const freeze = (v) => {
    if (v !== null && typeof v === "object") {
      for (const child of Object.values(v))
        freeze(child);
      Object.freeze(v);
    }
  };
  freeze(value);
  return value;
}

// src/model/internal/schema-work.ts
var core08 = snapshotSchema(schema_properties_document_schema_default);
var core07 = snapshotSchema(relationship_document_schema_default);
var core06 = snapshotSchema(key_document_schema_default);
var keyReceipt = snapshotSchema(key_tuple_operation_v3_schema_default);
var dataset = snapshotSchema(dataset_value_operation_schema_default);
var compact = snapshotSchema(dataset_value_compact_operation_schema_default);
function reserveSchemaWork(root, schema, value, work, category = "source-schema") {
  const charge = (part, n = 1) => {
    work.charge(category + "-meter-" + part, n);
    work.charge(category + "-validator-" + part, n);
  };
  const canonical = (value) => {
    charge("canonical");
    if (value !== null && typeof value === "object") {
      const children = Object.values(value);
      if (!Array.isArray(value))
        charge("key-sort", children.length * Math.ceil(Math.log2(children.length + 1)));
      for (const child of children)
        canonical(child);
    }
  };
  const reserve = (root, schema, value) => {
    charge("branch");
    if (typeof schema === "boolean")
      return;
    if (schema.$ref) {
      const [id, path] = schema.$ref.split("#");
      const targetRoot = id ? [core08, core07, core06, keyReceipt, dataset, compact].find((s) => s.$id === id) : root;
      if (!targetRoot)
        throw Error("Unregistered resource schema");
      const target = (path ?? "").split("/").slice(1).reduce((node, key) => node[key.replace(/~1/g, "/").replace(/~0/g, "~")], targetRoot);
      reserve(targetRoot, target, value);
    }
    for (const key of ["allOf", "anyOf", "oneOf"])
      for (const branch of schema[key] ?? [])
        reserve(root, branch, value);
    for (const key of ["if", "then", "else", "not"])
      if (schema[key])
        reserve(root, schema[key], value);
    if (Object.hasOwn(schema, "const")) {
      canonical(schema.const);
      canonical(value);
    }
    for (const candidate of schema.enum ?? []) {
      canonical(candidate);
      canonical(value);
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      if (schema.propertyNames)
        for (const key of Object.keys(value))
          reserve(root, schema.propertyNames, key);
      for (const [key, branch] of Object.entries(schema.properties ?? {}))
        if (Object.hasOwn(value, key)) {
          charge("property");
          reserve(root, branch, value[key]);
        }
      if (Object.keys(schema.patternProperties ?? {}).length || schema.additionalProperties === false || typeof schema.additionalProperties === "object")
        for (const [key, child] of Object.entries(value)) {
          charge("property");
          let matched = Object.hasOwn(schema.properties ?? {}, key);
          for (const [pattern, branch] of Object.entries(schema.patternProperties ?? {})) {
            charge("pattern");
            if (new RegExp(pattern).test(key)) {
              reserve(root, branch, child);
              matched = true;
            }
          }
          if (!matched && schema.additionalProperties && typeof schema.additionalProperties === "object")
            reserve(root, schema.additionalProperties, child);
        }
    }
    if (Array.isArray(value)) {
      for (let i = 0;i < value.length; i++) {
        if (schema.prefixItems?.[i])
          reserve(root, schema.prefixItems[i], value[i]);
        else if (schema.items && typeof schema.items === "object")
          reserve(root, schema.items, value[i]);
        if (schema.contains)
          reserve(root, schema.contains, value[i]);
      }
      if (schema.uniqueItems)
        for (const child of value)
          canonical(child);
    }
  };
  reserve(root, schema, value);
}
function reserveSourceSchemaWork(source, work) {
  for (const schema of [core08, core07, core07, core06])
    reserveSchemaWork(schema, schema, source, work);
}
var reserveLiteralSchemaWork = (value, work) => reserveSchemaWork(core08, core08.$defs.literal, value, work, "literal-schema");
var reserveInputSchemaWork = (value, work) => reserveSchemaWork(dataset, dataset.$defs.input, value, work, "input-schema");

// src/validation/schema.ts
var import__2020 = __toESM(require__2020(), 1);
// spec/core/schema.json
var schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.1.0",
  title: "UMF 0.1.0 document envelope",
  type: "object",
  required: ["umf", "id", "vocabularies", "modules"],
  properties: {
    umf: { const: "0.1.0" },
    id: { $ref: "#/$defs/id" },
    vocabularies: { type: "object", propertyNames: { $ref: "#/$defs/id" }, additionalProperties: { type: "object", required: ["version"], properties: { version: { $ref: "#/$defs/version" } } } },
    modules: { type: "array", items: { $ref: "#/$defs/module" } },
    extensions: { $ref: "#/$defs/extensions" }
  },
  $defs: {
    id: { type: "string", minLength: 1 },
    version: { type: "string", pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$" },
    knownScalarType: { enum: ["boolean", "integer", "decimal", "float", "string", "binary", "date", "time", "timestamp"], description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior." },
    scalarType: { anyOf: [{ $ref: "#/$defs/knownScalarType" }, { type: "string", minLength: 1, not: { $ref: "#/$defs/knownScalarType" }, description: "Unknown family retained with incomplete semantic validation." }] },
    extensions: { type: "object", propertyNames: { $ref: "#/$defs/id" }, additionalProperties: true },
    reference: { type: "object", required: ["role", "module", "element"], properties: { role: { $ref: "#/$defs/id" }, module: { $ref: "#/$defs/id" }, element: { $ref: "#/$defs/id" } } },
    element: { type: "object", required: ["id", "extensions"], properties: { id: { $ref: "#/$defs/id" }, name: { type: "string" }, description: { type: "string" }, scalarType: { $ref: "#/$defs/scalarType" }, extensions: { $ref: "#/$defs/extensions" }, references: { type: "array", items: { $ref: "#/$defs/reference" } } } },
    module: { type: "object", required: ["id", "namespace", "elements"], properties: { id: { $ref: "#/$defs/id" }, namespace: { type: "string" }, elements: { type: "array", items: { $ref: "#/$defs/element" } }, extensions: { $ref: "#/$defs/extensions" } } }
  }
};
// spec/core/field-document.schema.json
var field_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.2.0",
  title: "UMF 0.2.0 field envelope",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.2.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    }
  },
  description: "Opt-in field/record/group roles. No implicit upgrade from 0.1.0. Provenance, migration and binding evidence remain required."
};
// spec/core/nullability-document.schema.json
var nullability_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.3.0",
  title: "UMF 0.3.0 nullability envelope",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.3.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        },
        nullability: {
          type: "string",
          minLength: 1,
          description: "Ideal value availability. Unknown labels remain uninterpreted. Missing and unspecified assert no availability constraint. Native absence carriers require explicit bindings."
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        },
        {
          if: {
            required: [
              "nullability"
            ],
            properties: {
              nullability: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    },
    knownNullability: {
      enum: [
        "required",
        "absent-allowed",
        "unspecified"
      ]
    }
  },
  description: "Explicit ideal value availability on Fields. No implicit upgrade from older envelopes, native NULL mapping, or default execution."
};
// spec/core/cardinality-document.schema.json
var cardinality_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.4.0",
  title: "UMF 0.4.0 cardinality envelope",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.4.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        },
        nullability: {
          type: "string",
          minLength: 1,
          description: "Ideal value availability. Unknown labels remain uninterpreted. Missing and unspecified assert no availability constraint. Native absence carriers require explicit bindings."
        },
        cardinality: {
          type: "string",
          minLength: 1,
          description: "One ideal value, finite ordered sequence with duplicates allowed, finite exact string-key mapping with unique keys, or no assertion. Unknown labels remain uninterpreted."
        },
        itemType: {
          $ref: "#/$defs/itemType"
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        },
        {
          if: {
            required: [
              "nullability"
            ],
            properties: {
              nullability: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          },
          then: {
            not: {
              required: [
                "scalarType"
              ]
            }
          }
        },
        {
          if: {
            required: [
              "itemType"
            ],
            properties: {
              itemType: {}
            }
          },
          then: {
            required: [
              "kind",
              "cardinality"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    },
    knownNullability: {
      enum: [
        "required",
        "absent-allowed",
        "unspecified"
      ]
    },
    knownCardinality: {
      enum: [
        "one",
        "array",
        "map",
        "unspecified"
      ]
    },
    itemType: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    }
  },
  description: "Explicit Field shape and optional array-item/map-value Field reference; no native repetition, dimension or physical encoding inference."
};
// spec/core/facet-document.schema.json
var facet_document_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:0.5.0",
  title: "UMF 0.5.0 facet envelope",
  type: "object",
  required: [
    "umf",
    "id",
    "vocabularies",
    "modules"
  ],
  properties: {
    umf: {
      const: "0.5.0"
    },
    id: {
      $ref: "#/$defs/id"
    },
    vocabularies: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        type: "object",
        required: [
          "version"
        ],
        properties: {
          version: {
            $ref: "#/$defs/version"
          }
        }
      }
    },
    modules: {
      type: "array",
      items: {
        $ref: "#/$defs/module"
      }
    },
    extensions: {
      $ref: "#/$defs/extensions"
    }
  },
  $defs: {
    id: {
      type: "string",
      minLength: 1
    },
    version: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    knownScalarType: {
      enum: [
        "boolean",
        "integer",
        "decimal",
        "float",
        "string",
        "binary",
        "date",
        "time",
        "timestamp"
      ],
      description: "Basic value families; native refinements remain authoritative for ranges, precision, encoding and temporal behavior."
    },
    scalarType: {
      anyOf: [
        {
          $ref: "#/$defs/knownScalarType"
        },
        {
          type: "string",
          minLength: 1,
          not: {
            $ref: "#/$defs/knownScalarType"
          },
          description: "Unknown family retained with incomplete semantic validation."
        }
      ]
    },
    extensions: {
      type: "object",
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: true
    },
    reference: {
      type: "object",
      required: [
        "role",
        "module",
        "element"
      ],
      properties: {
        role: {
          $ref: "#/$defs/id"
        },
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    element: {
      type: "object",
      required: [
        "id",
        "extensions"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string"
        },
        description: {
          type: "string"
        },
        scalarType: {
          $ref: "#/$defs/scalarType"
        },
        extensions: {
          $ref: "#/$defs/extensions"
        },
        references: {
          type: "array",
          items: {
            $ref: "#/$defs/reference"
          }
        },
        kind: {
          type: "string",
          minLength: 1,
          description: "UMF role; unknown labels remain uninterpreted. Missing is unspecified, never inferred from scalarType."
        },
        nullability: {
          type: "string",
          minLength: 1,
          description: "Ideal value availability. Unknown labels remain uninterpreted. Missing and unspecified assert no availability constraint. Native absence carriers require explicit bindings."
        },
        cardinality: {
          type: "string",
          minLength: 1,
          description: "One ideal value, finite ordered sequence with duplicates allowed, finite exact string-key mapping with unique keys, or no assertion. Unknown labels remain uninterpreted."
        },
        itemType: {
          $ref: "#/$defs/itemType"
        },
        facets: {
          $ref: "#/$defs/facets"
        }
      },
      allOf: [
        {
          if: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                enum: [
                  "record",
                  "group"
                ]
              }
            }
          },
          then: {
            properties: {
              scalarType: false
            }
          }
        },
        {
          if: {
            required: [
              "nullability"
            ],
            properties: {
              nullability: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              }
            }
          }
        },
        {
          if: {
            required: [
              "cardinality"
            ],
            properties: {
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          },
          then: {
            not: {
              required: [
                "scalarType"
              ]
            }
          }
        },
        {
          if: {
            required: [
              "itemType"
            ],
            properties: {
              itemType: {}
            }
          },
          then: {
            required: [
              "kind",
              "cardinality"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "array",
                  "map"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {}
            }
          },
          then: {
            required: [
              "kind"
            ],
            properties: {
              kind: {
                const: "field"
              },
              cardinality: {
                enum: [
                  "one",
                  "unspecified"
                ]
              },
              references: {
                type: "array",
                not: {
                  contains: {
                    type: "object",
                    required: [
                      "role"
                    ],
                    properties: {
                      role: {
                        const: "record-type"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                enum: [
                  "string",
                  "binary"
                ]
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "unicode-scalar"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "string"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "length"
                ],
                properties: {
                  length: {
                    type: "object",
                    required: [
                      "unit"
                    ],
                    properties: {
                      unit: {
                        const: "byte"
                      }
                    }
                  }
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "binary"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "precision"
                ],
                properties: {
                  precision: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "decimal"
              }
            }
          }
        },
        {
          if: {
            required: [
              "facets"
            ],
            properties: {
              facets: {
                type: "object",
                required: [
                  "integerWidth"
                ],
                properties: {
                  integerWidth: {}
                }
              }
            }
          },
          then: {
            required: [
              "scalarType"
            ],
            properties: {
              scalarType: {
                const: "integer"
              }
            }
          }
        }
      ]
    },
    module: {
      type: "object",
      required: [
        "id",
        "namespace",
        "elements"
      ],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        namespace: {
          type: "string"
        },
        elements: {
          type: "array",
          items: {
            $ref: "#/$defs/element"
          }
        },
        extensions: {
          $ref: "#/$defs/extensions"
        }
      }
    },
    knownElementKind: {
      enum: [
        "field",
        "record",
        "group"
      ]
    },
    knownNullability: {
      enum: [
        "required",
        "absent-allowed",
        "unspecified"
      ]
    },
    knownCardinality: {
      enum: [
        "one",
        "array",
        "map",
        "unspecified"
      ]
    },
    itemType: {
      type: "object",
      required: [
        "module",
        "element"
      ],
      properties: {
        module: {
          $ref: "#/$defs/id"
        },
        element: {
          $ref: "#/$defs/id"
        }
      }
    },
    facets: {
      type: "object",
      description: "Missing members impose no bound. Unknown members and qualifiers are retained without interpretation.",
      properties: {
        length: {
          type: "object",
          required: [
            "max",
            "unit"
          ],
          properties: {
            max: {
              type: "integer",
              minimum: 0,
              maximum: 9007199254740991
            },
            unit: {
              type: "string",
              minLength: 1,
              description: "Known units: unicode-scalar for string, byte for binary. Unknown units remain uninterpreted."
            }
          }
        },
        precision: {
          type: "integer",
          minimum: 1,
          maximum: 9007199254740991,
          description: "Decimal coefficient digit bound; requires scale. Absolute coefficient is less than 10^precision. No implicit rounding."
        },
        scale: {
          type: "integer",
          minimum: 0,
          maximum: 9007199254740991,
          description: "Fixed fractional digit count; requires precision. Semantic validation requires scale <= precision. Value equals integer coefficient times 10^-scale."
        },
        integerWidth: {
          type: "object",
          required: [
            "bits",
            "signed"
          ],
          properties: {
            bits: {
              type: "integer",
              minimum: 1,
              maximum: 9007199254740991
            },
            signed: {
              type: "boolean"
            }
          },
          description: "Signed [-2^(bits-1),2^(bits-1)-1] or unsigned [0,2^bits-1]; mathematical domain, not a physical storage-width assertion."
        }
      },
      dependentRequired: {
        precision: [
          "scale"
        ],
        scale: [
          "precision"
        ]
      }
    }
  },
  description: "Candidate facet envelope: author-stated scalar bounds with explicit units. Requires semantic validation of scale <= precision, identities and references. Native enforcement, encoding and exactness require separate bindings."
};
// spec/core/extension-package.schema.json
var extension_package_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:extension-package:0.1.0",
  title: "UMF extension package declaration",
  type: "object",
  required: ["id", "version", "coreVersion", "description", "schema", "semantics", "scopes", "capabilities"],
  properties: {
    id: { type: "string", minLength: 1 },
    version: { type: "string", pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$" },
    coreVersion: { const: "0.1.0" },
    description: { type: "string", minLength: 1 },
    schema: { type: ["object", "boolean"] },
    semantics: { type: "string", minLength: 1 },
    scopes: { type: "array", minItems: 1, uniqueItems: true, items: { enum: ["document", "module", "element"] } },
    capabilities: {
      type: "object",
      required: ["validation", "directions", "evidence"],
      properties: {
        validation: { enum: ["structural", "semantic"] },
        directions: { type: "array", uniqueItems: true, items: { enum: ["import", "export"] } },
        evidence: { type: "array", items: { type: "string", minLength: 1 } },
        native: { type: "object", required: ["system", "version", "subset"], properties: { system: { type: "string", minLength: 1 }, version: { type: "string", minLength: 1 }, subset: { type: "string", minLength: 1 } } }
      },
      allOf: [{ if: { properties: { directions: { type: "array", minItems: 1 } } }, then: { properties: { native: true }, required: ["native"] } }]
    }
  }
};

// src/validation/schema.ts
function canonical(value) {
  if (Array.isArray(value))
    return "a[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return "o{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function createValidator(strict = true) {
  const validator = new import__2020.default({ allErrors: true, strict, allowUnionTypes: true, ownProperties: true, validateFormats: false });
  installJsonEquality(validator);
  return validator;
}
function installJsonEquality(validator) {
  validator.removeKeyword("uniqueItems").addKeyword({ keyword: "uniqueItems", type: "array", schemaType: "boolean", errors: false, validate: (unique, data) => !unique || new Set(data.map(canonical)).size === data.length });
  validator.removeKeyword("const").addKeyword({ keyword: "const", errors: false, validate: (expected, data) => canonical(expected) === canonical(data) });
  validator.removeKeyword("enum").addKeyword({ keyword: "enum", schemaType: "array", errors: false, validate: (expected, data) => expected.some((value) => canonical(value) === canonical(data)) });
}
var ajv = createValidator();
var checkCore = ajv.compile(snapshotSchema(schema_default));
var checkCoreFields = ajv.compile(snapshotSchema(field_document_schema_default));
var checkCoreNullability = ajv.compile(snapshotSchema(nullability_document_schema_default));
var checkCoreCardinality = ajv.compile(snapshotSchema(cardinality_document_schema_default));
var checkCoreFacets = ajv.compile(snapshotSchema(facet_document_schema_default));
var checkPackage = ajv.compile(snapshotSchema(extension_package_schema_default));
var checkCoreKeys = ajv.compile(snapshotSchema(key_document_schema_default));
var checkCoreRelationships = ajv.compile(snapshotSchema(relationship_document_schema_default));

// src/registry/registry.ts
function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value))
      freeze(child);
  }
}

class Registry {
  #entries = new Map;
  register(input, semantics) {
    const manifest = copyJson(input);
    if (!checkPackage(manifest))
      throw new UmfError("PACKAGE_STRUCTURE", JSON.stringify(checkPackage.errors));
    if (this.get(manifest.id, manifest.version))
      throw new UmfError("DUPLICATE_VERSION", "Extension version is already registered");
    let structure;
    try {
      structure = createValidator().compile(manifest.schema);
    } catch (error) {
      throw new UmfError("PACKAGE_SCHEMA", String(error));
    }
    freeze(manifest);
    const entry = { manifest, structure, ...semantics ? { semantics } : {} };
    Object.freeze(entry);
    if (!this.#entries.has(manifest.id))
      this.#entries.set(manifest.id, new Map);
    this.#entries.get(manifest.id).set(manifest.version, entry);
    return this;
  }
  get(id, version) {
    return this.#entries.get(id)?.get(version);
  }
}

// src/model/schema-literals.ts
var schemaPropertyNames = ["title", "aliases", "examples", "allowedValues", "default"];
var newFacetNames = ["collectionSize", "range"];
function schemaError(message, path = "") {
  throw new UmfError("CORE_SCHEMA_PROPERTIES", message, path);
}
var object = (v) => v;
function knownSchemaMembers(value, keys, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    schemaError("Expected object", path);
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      throw new UmfError("CORE_SCHEMA_PROPERTY_UNKNOWN", "Unknown relevant qualifier: " + key, path + "/" + key);
}
function schemaCoefficient(token, scale, precision) {
  const m = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  if (!m || m[0] !== token)
    schemaError("Expected exact JSON numeric token");
  const digits = (m[2] + (m[3] ?? "")).replace(/^0+/, "");
  if (!digits)
    return 0n;
  const exponent = m[4] ?? "0";
  if (exponent.length > 32)
    schemaError("Numeric exponent exceeds bounded domain");
  const shift = BigInt(exponent) - BigInt((m[3] ?? "").length) + BigInt(scale);
  let result = digits;
  if (shift < 0n) {
    const cut = -shift;
    if (cut > BigInt(digits.length))
      schemaError("Numeric value would require rounding");
    const at = digits.length - Number(cut);
    if (/[^0]/.test(digits.slice(at)))
      schemaError("Numeric value would require rounding");
    result = digits.slice(0, at);
  } else {
    if (BigInt(digits.length) + shift > BigInt(Math.min(precision ?? LIMITS.maxTextLength, LIMITS.maxTextLength)))
      schemaError("Numeric value exceeds precision/resource limit");
    result += "0".repeat(Number(shift));
  }
  if (precision !== undefined && result.length > precision)
    schemaError("Numeric value exceeds precision");
  return BigInt((m[1] ?? "") + (result || "0"));
}
function stringLength(value) {
  let count = 0;
  for (let i = 0;i < value.length; i++, count++) {
    const c = value.charCodeAt(i);
    if (c >= 55296 && c <= 56319) {
      const n = value.charCodeAt(++i);
      if (!(n >= 56320 && n <= 57343))
        schemaError("Unpaired Unicode surrogate");
    } else if (c >= 56320 && c <= 57343)
      schemaError("Unpaired Unicode surrogate");
  }
  return count;
}
function literalIdentity(field, value) {
  if (value === null)
    schemaError("Null has no allowed-value equality");
  const v = object(value), keys = Object.keys(v), kind = field.scalarType;
  const wrapper = { boolean: "boolean", integer: "integerToken", decimal: "decimalToken", string: "string", binary: "binaryHex" }[kind];
  if (!wrapper || keys.length !== 1 || keys[0] !== wrapper)
    schemaError("No exact equality for this literal/domain");
  const facets = object(field.facets ?? {});
  if (kind === "integer")
    return "integer:" + schemaCoefficient(v[wrapper], 0);
  if (kind === "decimal") {
    if (!Number.isSafeInteger(facets.scale) || !Number.isSafeInteger(facets.precision))
      schemaError("Decimal requires explicit precision/scale");
    return "decimal:" + schemaCoefficient(v[wrapper], facets.scale, facets.precision);
  }
  if (kind === "string") {
    stringLength(v.string);
    return "string:" + JSON.stringify(v.string);
  }
  if (kind === "binary") {
    if (typeof v.binaryHex !== "string" || !/^(?:[0-9a-fA-F]{2})*$(?![\s\S])/.test(v.binaryHex))
      schemaError("Expected hexadecimal bytes");
    return "binary:" + v.binaryHex.toLowerCase();
  }
  if (typeof v.boolean !== "boolean")
    schemaError("Expected boolean literal");
  return "boolean:" + v.boolean;
}
function checkSchemaLiteral(doc, field, value, refinements = true, depth = 0) {
  evaluateSchemaLiteral(doc, field, value, refinements, depth);
}
function checkSchemaLiteralTracked(doc, field, value, charge) {
  evaluateSchemaLiteral(doc, field, value, true, 0, charge);
}
function evaluateSchemaLiteral(doc, field, value, refinements = true, depth = 0, charge) {
  charge?.(doc, field, value);
  if (depth > LIMITS.maxDepth)
    schemaError("Literal recursion exceeds limit");
  if (field.kind !== "field")
    schemaError("Literal target must be a Field");
  if (field.references?.some((r) => r.role === "record-type"))
    schemaError("Record-valued literals require a separate contract");
  if (field.itemType)
    knownSchemaMembers(field.itemType, ["module", "element"], "/itemType");
  const facets = object(field.facets ?? {});
  knownSchemaMembers(facets, ["length", "precision", "scale", "integerWidth", "range", "collectionSize"], "/facets");
  for (const [group, keys] of Object.entries({ length: ["min", "max", "unit"], integerWidth: ["bits", "signed"], range: ["min", "max", "minInclusive", "maxInclusive"], collectionSize: ["min", "max"] }))
    if (facets[group])
      knownSchemaMembers(facets[group], keys, "/facets/" + group);
  if (value === null) {
    if (field.nullability !== "absent-allowed")
      schemaError("Null requires explicit absent-allowed");
    return;
  }
  const v = object(value);
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length !== 1)
    schemaError("Expected one typed literal wrapper");
  if (field.cardinality === "array" || field.cardinality === "map") {
    const kind = field.cardinality, items = v[kind];
    if (kind === "array" ? !Array.isArray(items) : !items || typeof items !== "object" || Array.isArray(items))
      schemaError("Container literal does not match Field");
    const ref = object(field.itemType);
    if (!ref)
      schemaError("Container literal requires explicit itemType");
    const item = doc.modules.find((m) => m.id === ref.module)?.elements.find((e) => e.id === ref.element);
    if (!item)
      schemaError("Unresolved itemType");
    const values = kind === "array" ? items : Object.values(items), size = facets.collectionSize;
    if (size) {
      knownSchemaMembers(size, ["min", "max"], "/facets/collectionSize");
      if (size.min !== undefined && values.length < size.min || size.max !== undefined && values.length > size.max)
        schemaError("Collection size outside bounds");
    }
    for (const entry of values)
      evaluateSchemaLiteral(doc, item, entry, refinements, depth + 1, charge);
  } else {
    if (field.cardinality !== undefined && !["one", "unspecified"].includes(field.cardinality))
      schemaError("Unknown cardinality");
    const kind = field.scalarType, wrapper = { boolean: "boolean", integer: "integerToken", decimal: "decimalToken", string: "string", binary: "binaryHex", float: "floatToken", date: "date", time: "time", timestamp: "timestamp" }[kind];
    if (!wrapper || !Object.hasOwn(v, wrapper))
      schemaError("Literal does not match scalar family");
    if (["float", "date", "time", "timestamp"].includes(kind)) {
      if (refinements)
        schemaError("Value/default semantics for float/temporal domain are not defined");
      if (typeof v[wrapper] !== "string")
        schemaError("Expected literal text");
      return;
    }
    literalIdentity(field, value);
    let count;
    if (kind === "string")
      count = stringLength(v.string);
    if (kind === "binary")
      count = v.binaryHex.length / 2;
    if (facets.length) {
      knownSchemaMembers(facets.length, ["min", "max", "unit"], "/facets/length");
      if (facets.length.unit !== (kind === "string" ? "unicode-scalar" : "byte"))
        schemaError("Unknown/incompatible length unit");
      if (count === undefined)
        schemaError("Length requires string/binary");
      if (facets.length.min !== undefined && count < facets.length.min || facets.length.max !== undefined && count > facets.length.max)
        schemaError("Literal length outside bounds");
    }
    if (facets.integerWidth) {
      knownSchemaMembers(facets.integerWidth, ["bits", "signed"], "/facets/integerWidth");
      const w = facets.integerWidth, n = schemaCoefficient(v.integerToken, 0), magnitude = n < 0n ? -n : n, bits = magnitude === 0n ? 0 : magnitude.toString(2).length;
      const fits = w.signed ? n < 0n ? bits < w.bits || bits === w.bits && (magnitude & magnitude - 1n) === 0n : bits < w.bits : n >= 0n && bits <= w.bits;
      if (!fits)
        schemaError("Integer outside width/signedness");
    }
    if (refinements && facets.range) {
      knownSchemaMembers(facets.range, ["min", "max", "minInclusive", "maxInclusive"], "/facets/range");
      const r = facets.range, scale = kind === "decimal" ? facets.scale : 0, n = schemaCoefficient(v[wrapper], scale, facets.precision);
      for (const end of ["min", "max"])
        if (r[end] !== undefined) {
          if (r[end] === null)
            schemaError("Numeric bounds cannot be null", "/facets/range/" + end);
          const bound = schemaCoefficient(object(r[end])[wrapper], scale, facets.precision);
          if (end === "min" ? n < bound || n === bound && r.minInclusive === false : n > bound || n === bound && r.maxInclusive === false)
            schemaError("Literal outside numeric range");
        }
    }
  }
  if (refinements && field.allowedValues) {
    if (!field.allowedValues.some((candidate) => literalIdentity(field, candidate) === literalIdentity(field, value)))
      schemaError("Literal is not an allowed value");
  }
}

// src/validation/schema-properties.ts
var validator = createValidator();
var checkSchemaProperties = validator.compile(snapshotSchema(schema_properties_document_schema_default));
var checkCoreLiteral = validator.compile(snapshotSchema({ $defs: schema_properties_document_schema_default.$defs, $ref: "#/$defs/literal" }));
function schemaPropertiesLegacyView(input) {
  const base = copyJson(input);
  base.umf = "0.7.0";
  for (const node of [base, ...base.modules])
    for (const key of ["title", "aliases"])
      delete node[key];
  for (const node of base.modules.flatMap((m) => m.elements))
    for (const key of schemaPropertyNames)
      delete node[key];
  for (const m of base.modules)
    for (const e of m.elements) {
      const f = e.facets;
      if (!f)
        continue;
      for (const key of newFacetNames)
        delete f[key];
      if (f.length) {
        delete f.length.min;
        if (f.length.max === undefined || f.length.max === 0)
          delete f.length;
      }
      if (["array", "map"].includes(e.cardinality))
        delete e.facets;
    }
  return base;
}
function atNumericDomainExtreme(field, value, end) {
  const facets = field.facets;
  if (field.scalarType === "decimal") {
    if (end === "min" ? value >= 0n : value <= 0n)
      return false;
    const digits = (value < 0n ? -value : value).toString();
    return digits.length === facets.precision && /^9+$/.test(digits);
  }
  const width = facets.integerWidth;
  if (!width)
    return false;
  if (end === "min") {
    if (!width.signed)
      return value === 0n;
    const magnitude = -value;
    return value < 0n && magnitude.toString(2).length === width.bits && (magnitude & magnitude - 1n) === 0n;
  }
  if (value < 0n)
    return false;
  const bits = value === 0n ? 0 : value.toString(2).length;
  return bits === width.bits - (width.signed ? 1 : 0) && (value & value + 1n) === 0n;
}
function validateSchemaPropertiesDocument(input, registry = new Registry) {
  const diagnostics = [];
  const add = (message, path, severity = "error", code = "CORE_SCHEMA_PROPERTIES") => diagnostics.push({ code, path, message, severity });
  let doc;
  try {
    doc = copyJson(input);
  } catch (error) {
    if (!(error instanceof UmfError))
      throw error;
    add(error.message, error.path);
    return { valid: false, complete: false, diagnostics };
  }
  if (!checkSchemaProperties(doc)) {
    for (const e of checkSchemaProperties.errors ?? [])
      add(e.message ?? "Invalid schema properties", e.instancePath);
    return { valid: false, complete: false, diagnostics };
  }
  const extensionRegistry = new class extends Registry {
    get(id, version) {
      const entry = registry.get(id, version);
      if (!entry?.semantics)
        return entry;
      const semantics = entry.semantics;
      return { ...entry, semantics: (payload, context) => semantics(payload, { ...context, document: copyJson(doc) }) };
    }
  };
  diagnostics.push(...validateDocument(schemaPropertiesLegacyView(doc), extensionRegistry).diagnostics);
  const unknownUnitPaths = new Set(diagnostics.filter((d) => d.code === "UNKNOWN_FACET_UNIT").map((d) => d.path));
  const unknown = (v, known, path) => {
    for (const key of Object.keys(v))
      if (!known.includes(key))
        add("Qualifier retained without interpretation", path + "/" + pointer(key), "warning", "UNKNOWN_SCHEMA_PROPERTY");
  };
  doc.modules.forEach((m, mi) => m.elements.forEach((e, ei) => {
    const path = `/modules/${mi}/elements/${ei}`, f = e.facets;
    const attempt = (fn, at) => {
      try {
        fn();
      } catch (error) {
        if (!(error instanceof UmfError))
          throw error;
        add(error.message, at + (error.path || ""), error.code === "CORE_SCHEMA_PROPERTY_UNKNOWN" ? "warning" : "error", error.code);
      }
    };
    if (f) {
      if (["array", "map"].includes(e.cardinality))
        unknown(f, ["length", "precision", "scale", "integerWidth", "collectionSize", "range"], path + "/facets");
      for (const group of ["length", "collectionSize"])
        if (f[group]) {
          const b = f[group];
          unknown(b, group === "length" ? ["min", "max", "unit"] : ["min", "max"], path + "/facets/" + group);
          const unitPath = path + "/facets/length/unit";
          if (group === "length" && !["unicode-scalar", "byte"].includes(b.unit) && !unknownUnitPaths.has(unitPath)) {
            add("Length unit retained without interpretation", unitPath, "warning", "UNKNOWN_FACET_UNIT");
            unknownUnitPaths.add(unitPath);
          }
          if (b.min !== undefined && b.max !== undefined && b.min > b.max)
            add("Minimum exceeds maximum", path + "/facets/" + group);
          if (group === "collectionSize" && (e.kind !== "field" || !["array", "map"].includes(e.cardinality)))
            add("Collection bounds require array/map Field", path + "/facets/" + group);
        }
      if (f.range) {
        const r = f.range;
        unknown(r, ["min", "max", "minInclusive", "maxInclusive"], path + "/facets/range");
        if (e.kind !== "field" || !["integer", "decimal"].includes(e.scalarType))
          add("Range requires integer/decimal Field", path + "/facets/range");
        else
          attempt(() => {
            const numericFacets = {};
            for (const key of ["precision", "scale"])
              if (Object.hasOwn(f, key))
                numericFacets[key] = f[key];
            if (f.integerWidth)
              numericFacets.integerWidth = { bits: f.integerWidth.bits, signed: f.integerWidth.signed };
            const unbounded = { ...e, facets: numericFacets };
            delete unbounded.allowedValues;
            delete unbounded.default;
            for (const end of ["min", "max"]) {
              if (r[end] !== undefined) {
                if (r[end] === null)
                  throw new UmfError("CORE_SCHEMA_PROPERTIES", "Numeric bounds cannot be null", "/" + end);
                checkSchemaLiteral(doc, unbounded, r[end]);
              } else if (r[end + "Inclusive"] !== undefined)
                add("Inclusive flag requires its bound", path + "/facets/range/" + end + "Inclusive");
            }
            const wrapper = e.scalarType === "integer" ? "integerToken" : "decimalToken", scale = e.scalarType === "integer" ? 0 : f.scale;
            const min = r.min === undefined ? undefined : schemaCoefficient(r.min[wrapper], scale, f.precision);
            const max = r.max === undefined ? undefined : schemaCoefficient(r.max[wrapper], scale, f.precision);
            if (min !== undefined && max !== undefined && min + (r.minInclusive === false ? 1n : 0n) > max - (r.maxInclusive === false ? 1n : 0n) || min !== undefined && r.minInclusive === false && atNumericDomainExtreme(e, min, "max") || max !== undefined && r.maxInclusive === false && atNumericDomainExtreme(e, max, "min"))
              add("Empty or inverted numeric interval", path + "/facets/range");
          }, path + "/facets/range");
      }
    }
    if (e.allowedValues)
      attempt(() => {
        const seen = new Set;
        for (const [i, value] of e.allowedValues.entries()) {
          const field = { ...e };
          delete field.allowedValues;
          checkSchemaLiteral(doc, field, value);
          const id = literalIdentity(field, value);
          if (seen.has(id))
            add("Duplicate equal allowed value", path + "/allowedValues/" + i);
          seen.add(id);
        }
      }, path + "/allowedValues");
    if (e.examples)
      for (const [i, value] of e.examples.entries())
        attempt(() => checkSchemaLiteral(doc, e, value, false), path + "/examples/" + i);
    if (e.default) {
      const d = e.default;
      unknown(d, ["value", "on"], path + "/default");
      attempt(() => checkSchemaLiteral(doc, e, d.value), path + "/default/value");
    }
  }));
  return { valid: !diagnostics.some((d) => d.severity === "error"), complete: diagnostics.length === 0, diagnostics };
}

// src/validation/keys.ts
var check = createValidator().compile(snapshotSchema(key_document_schema_default));
var identity = (ref) => JSON.stringify([ref.module, ref.element]);
function validateKeyCandidate(input, validateBase = true) {
  const diagnostics = [];
  const add = (code, path, message, severity = "error") => diagnostics.push({ code, path, message, severity });
  let document;
  try {
    document = copyJson(input);
  } catch (error) {
    if (!(error instanceof UmfError))
      throw error;
    add(error.code, error.path, error.message);
    return { valid: false, complete: false, diagnostics };
  }
  if (!check(document)) {
    for (const e of check.errors ?? [])
      add("KEY_STRUCTURE", e.instancePath, e.message ?? "Invalid key envelope");
    return { valid: false, complete: false, diagnostics };
  }
  const base = copyJson(document);
  base.umf = "0.5.0";
  for (const m of base.modules)
    for (const e of m.elements) {
      delete e.members;
      delete e.keys;
    }
  if (validateBase)
    diagnostics.push(...validateDocument(base).diagnostics);
  const unknown = (o, known, path) => {
    for (const key of Object.keys(o))
      if (!known.includes(key))
        add("UNKNOWN_KEY_QUALIFIER", path + "/" + pointer(key), "Qualifier retained without interpretation", "warning");
  };
  const definitions = new Map, owners = new Map;
  for (const m of document.modules)
    for (const e of m.elements)
      definitions.set(identity({ module: m.id, element: e.id }), e);
  document.modules.forEach((m, mi) => m.elements.forEach((record, ei) => {
    const path = `/modules/${mi}/elements/${ei}`, members = record.members;
    if (!members)
      return;
    const own = new Set;
    members.forEach((ref, ri) => {
      const at = path + `/members/${ri}`, id = identity(ref), field = definitions.get(id);
      unknown(ref, ["module", "element"], at);
      if (own.has(id))
        add("KEY_DUPLICATE_MEMBER", at, "Record membership repeats a Field identity");
      own.add(id);
      if (!field)
        add("KEY_MEMBER_MISSING", at, "Member Field does not exist");
      else if (field.kind !== "field")
        add("KEY_MEMBER_KIND", at, "Record members must be explicit Fields");
      const previous = owners.get(id);
      if (previous && previous !== path)
        add("KEY_MEMBER_OWNER", at, "Field already belongs to another Record: " + previous);
      else
        owners.set(id, path);
    });
    const ids = new Set, names = new Set, sets = new Set;
    let primaries = 0;
    record.keys?.forEach((key, ki) => {
      const at = path + `/keys/${ki}`;
      unknown(key, ["id", "name", "fields", "primary"], at);
      if (ids.has(key.id))
        add("KEY_DUPLICATE_ID", at + "/id", "Key ID is not unique within the Record");
      ids.add(key.id);
      if (names.has(key.name))
        add("KEY_DUPLICATE_NAME", at + "/name", "Key name is not unique within the Record");
      names.add(key.name);
      if (key.primary === true && ++primaries > 1)
        add("KEY_PRIMARY_COUNT", at + "/primary", "At most one key may be primary");
      const fieldIds = key.fields.map(identity), set = JSON.stringify([...fieldIds].sort());
      if (new Set(fieldIds).size !== fieldIds.length)
        add("KEY_DUPLICATE_FIELD", at + "/fields", "Key repeats a Field identity");
      if (sets.has(set))
        add("KEY_DUPLICATE_SET", at + "/fields", "Key component set duplicates another key, regardless of order");
      sets.add(set);
      key.fields.forEach((ref, ri) => {
        const location = at + `/fields/${ri}`, id = identity(ref), field = definitions.get(id);
        unknown(ref, ["module", "element"], location);
        if (!own.has(id))
          add("KEY_FIELD_OWNER", location, "Key component is not a member of its owning Record");
        if (!field) {
          add("KEY_FIELD_MISSING", location, "Key Field does not exist");
          return;
        }
        if (field.kind !== "field")
          add("KEY_FIELD_KIND", location, "Key component must be an explicit Field");
        if (field.nullability !== "required")
          add("KEY_FIELD_REQUIRED", location, "Key component must explicitly supply a value");
        if (field.cardinality !== "one")
          add("KEY_FIELD_SINGULAR", location, "Key component must explicitly be singular");
        if (!["boolean", "integer", "decimal", "string", "binary"].includes(field.scalarType ?? "") || field.references?.some((r) => r.role === "record-type"))
          add("KEY_EQUALITY", location, "Key equality is undefined for this component");
        if (field.scalarType === "decimal") {
          const facets = field.facets;
          if (!facets || facets.precision === undefined || facets.scale === undefined)
            add("KEY_DECIMAL_DOMAIN", location, "Decimal key equality requires explicit precision and scale");
        }
      });
    });
  }));
  return { valid: !diagnostics.some((d) => d.severity === "error"), complete: diagnostics.length === 0, diagnostics };
}

// src/validation/relationships.ts
var check2 = createValidator().compile(snapshotSchema(relationship_document_schema_default));
var identity2 = (ref) => JSON.stringify([ref.module, ref.element]);
function validateRelationshipCandidate(input, validateBase = true) {
  const diagnostics = [];
  const add = (code, path, message, severity = "error") => diagnostics.push({ code, path, message, severity });
  let document;
  try {
    document = copyJson(input);
  } catch (error) {
    if (!(error instanceof UmfError))
      throw error;
    add(error.code, error.path, error.message);
    return { valid: false, complete: false, diagnostics };
  }
  if (!check2(document)) {
    for (const e of check2.errors ?? [])
      add("RELATIONSHIP_STRUCTURE", e.instancePath, e.message ?? "Invalid relationship envelope");
    return { valid: false, complete: false, diagnostics };
  }
  const base = copyJson(document);
  base.umf = "0.6.0";
  for (const m of base.modules)
    delete m.relationships;
  diagnostics.push(...validateKeyCandidate(base, validateBase).diagnostics);
  const unknown = (value, known, path) => {
    for (const key of Object.keys(value))
      if (!known.includes(key))
        add("UNKNOWN_RELATIONSHIP_QUALIFIER", path + "/" + pointer(key), "Qualifier retained without interpretation", "warning");
  };
  const elements = new Map;
  for (const m of document.modules)
    for (const e of m.elements)
      elements.set(identity2({ module: m.id, element: e.id }), e);
  const presentations = new Map;
  const presentation = (ref, name, path, inverse) => {
    const id = JSON.stringify([ref.module, ref.element, name]), previous = presentations.get(id) ?? [];
    const collision = previous.find((p) => inverse || p.inverse);
    if (collision)
      add("RELATIONSHIP_PRESENTATION_COLLISION", path, "Inverse presentation collides on this endpoint with " + collision.path);
    previous.push({ path, inverse });
    presentations.set(id, previous);
  };
  const resolve = (ref, path) => {
    const record = elements.get(identity2(ref));
    if (!record) {
      add("RELATIONSHIP_ENDPOINT_MISSING", path, "Endpoint does not resolve by exact module and element IDs");
      return;
    }
    if (record.kind !== "record") {
      add("RELATIONSHIP_ENDPOINT_KIND", path, "Endpoint must be a Record");
      return;
    }
    if (!Array.isArray(record.keys) || !record.keys.length)
      add("RELATIONSHIP_ENDPOINT_KEY", path, "Endpoint must have authored Keys");
    return record;
  };
  document.modules.forEach((module, mi) => {
    const ids = new Set, names = new Set;
    (module.relationships ?? []).forEach((r, ri) => {
      const path = `/modules/${mi}/relationships/${ri}`;
      unknown(r, ["id", "name", "source", "target", "sourceMultiplicity", "targetMultiplicity", "targetLifecycle", "directed", "inverse", "associationRecord"], path);
      if (ids.has(r.id))
        add("RELATIONSHIP_DUPLICATE_ID", path + "/id", "Relationship ID must be unique in its module");
      ids.add(r.id);
      if (names.has(r.name))
        add("RELATIONSHIP_DUPLICATE_NAME", path + "/name", "Relationship name must be unique in its module");
      names.add(r.name);
      for (const end of ["source", "target"]) {
        const seen = new Set;
        r[end].forEach((ref, index) => {
          const at = path + `/${end}/${index}`;
          unknown(ref, end === "target" ? ["module", "element", "key"] : ["module", "element"], at);
          const id = identity2(ref);
          if (seen.has(id))
            add("RELATIONSHIP_DUPLICATE_ENDPOINT", at, "Endpoint Record repeats, regardless of qualifiers or target key");
          seen.add(id);
          const record = resolve(ref, at);
          if (end === "target" && record && !(record.keys ?? []).some((k) => k.id === ref.key))
            add("RELATIONSHIP_TARGET_KEY", at + "/key", "Target key must resolve by its stable ID");
          if (end === "source")
            presentation(ref, r.name, at, false);
          else if (r.inverse)
            presentation(ref, r.inverse, path + "/inverse", true);
        });
        const bounds = r[end + "Multiplicity"];
        unknown(bounds, ["min", "max"], path + "/" + end + "Multiplicity");
        if (bounds.max !== "*" && bounds.max < bounds.min)
          add("RELATIONSHIP_MULTIPLICITY", path + "/" + end + "Multiplicity", "Maximum must be at least the minimum");
      }
      if (r.targetLifecycle === "owned" && !r.directed)
        add("RELATIONSHIP_LIFECYCLE", path + "/targetLifecycle", "Owned target lifecycle requires a directed relationship");
      if (!["owned", "independent", "unspecified"].includes(r.targetLifecycle))
        add("UNKNOWN_RELATIONSHIP_LIFECYCLE", path + "/targetLifecycle", "Future lifecycle retained without interpretation", "warning");
      if (r.associationRecord) {
        unknown(r.associationRecord, ["module", "element"], path + "/associationRecord");
        resolve(r.associationRecord, path + "/associationRecord");
      }
    });
  });
  return { valid: !diagnostics.some((d) => d.severity === "error"), complete: diagnostics.length === 0, diagnostics };
}

// src/validation/facets.ts
var check3 = createValidator().compile({ $defs: facet_document_schema_default.$defs, $ref: "#/$defs/element" });
function validateFacetElement(input, path = "") {
  const diagnostics = [];
  const add = (code, at, message, severity = "error") => diagnostics.push({ code, path: path + at, message, severity });
  let element;
  try {
    element = copyJson(input);
  } catch (error) {
    if (!(error instanceof UmfError))
      throw error;
    add(error.code, error.path, error.message);
    return { valid: false, complete: false, diagnostics };
  }
  if (!check3(element)) {
    for (const error of check3.errors ?? [])
      add("FACET_STRUCTURE", error.instancePath, error.message ?? "Invalid facet element");
    return { valid: false, complete: false, diagnostics };
  }
  if (Object.hasOwn(element, "facets")) {
    const facets = element.facets;
    const unknown = (object, known, at) => {
      for (const key of Object.keys(object))
        if (!known.includes(key))
          add("UNKNOWN_FACET", at + "/" + pointer(key), "Facet member retained without interpretation", "warning");
    };
    unknown(facets, ["length", "precision", "scale", "integerWidth"], "/facets");
    if (Object.hasOwn(facets, "precision") && facets.scale > facets.precision)
      add("FACET_SCALE", "/facets/scale", "Scale must not exceed precision");
    if (Object.hasOwn(facets, "length")) {
      const length = facets.length;
      unknown(length, ["max", "unit"], "/facets/length");
      if (length.unit !== "unicode-scalar" && length.unit !== "byte")
        add("UNKNOWN_FACET_UNIT", "/facets/length/unit", "Length unit retained without interpretation", "warning");
    }
    if (Object.hasOwn(facets, "integerWidth"))
      unknown(facets.integerWidth, ["bits", "signed"], "/facets/integerWidth");
  }
  return { valid: !diagnostics.some((d) => d.severity === "error"), complete: diagnostics.length === 0, diagnostics };
}

// src/validation/document.ts
function validateDocument(input, registry = new Registry) {
  const diagnostics = [];
  const add = (code, path, message, severity = "error") => diagnostics.push({ code, path, message, severity });
  let value;
  try {
    value = copyJson(input);
  } catch (error) {
    if (!(error instanceof UmfError))
      throw error;
    add(error.code, error.path, error.message);
    return { valid: false, complete: false, diagnostics };
  }
  const version = value?.umf;
  if (version === "0.8.0")
    return validateSchemaPropertiesDocument(value, registry);
  const check = version === "0.7.0" ? checkCoreRelationships : version === "0.6.0" ? checkCoreKeys : version === "0.5.0" ? checkCoreFacets : version === "0.4.0" ? checkCoreCardinality : version === "0.3.0" ? checkCoreNullability : version === "0.2.0" ? checkCoreFields : checkCore;
  if (!check(value)) {
    for (const error of check.errors || [])
      add("STRUCTURE", error.instancePath, error.message || "Invalid structure");
    return { valid: false, complete: false, diagnostics };
  }
  const doc = value;
  const relationshipProfile = doc.umf === "0.7.0", keyProfile = doc.umf === "0.6.0" || relationshipProfile, facets = doc.umf === "0.5.0" || keyProfile, containers = doc.umf === "0.4.0" || facets;
  const availability = doc.umf === "0.3.0" || containers;
  const unknown = (obj, known, path) => {
    for (const key of Object.keys(obj))
      if (!known.includes(key))
        add("UNKNOWN_CORE_FIELD", `${path}/${pointer(key)}`, "Field retained without interpretation", "warning");
  };
  unknown(doc, ["umf", "id", "vocabularies", "modules", "extensions"], "");
  for (const [id, declaration] of Object.entries(doc.vocabularies)) {
    unknown(declaration, ["version"], `/vocabularies/${pointer(id)}`);
    if (!registry.get(id, declaration.version))
      add("UNKNOWN_EXTENSION", `/vocabularies/${pointer(id)}`, "Exact extension version unavailable; content retained", "warning");
  }
  const extensions = (payloads, scope, path) => {
    for (const [id, payload] of Object.entries(payloads || {})) {
      const location = `${path}/extensions/${pointer(id)}`;
      if (!Object.hasOwn(doc.vocabularies, id)) {
        add("UNDECLARED_EXTENSION", location, "Extension has no version declaration");
        continue;
      }
      const declaration = doc.vocabularies[id];
      const entry = registry.get(id, declaration.version);
      if (!entry)
        continue;
      if (!entry.manifest.scopes.includes(scope)) {
        add("EXTENSION_SCOPE", location, "Extension not permitted at this scope");
        continue;
      }
      if (!entry.structure(payload)) {
        for (const error of entry.structure.errors || [])
          add("EXTENSION_STRUCTURE", location + error.instancePath, error.message || "Invalid payload");
        continue;
      }
      if (entry.manifest.capabilities.validation !== "semantic" || !entry.semantics) {
        add("SEMANTICS_UNCHECKED", location, "Structure checked; semantics not validated", "warning");
      } else {
        try {
          diagnostics.push(...entry.semantics(copyJson(payload), { document: copyJson(doc), path: location, scope }));
        } catch (error) {
          add("VALIDATOR_FAILURE", location, String(error));
        }
      }
    }
  };
  extensions(doc.extensions, "document", "");
  const modules = new Map;
  const definitions = new Map;
  doc.modules.forEach((module, mi) => {
    const path = `/modules/${mi}`;
    unknown(module, ["id", "namespace", "elements", "extensions", ...relationshipProfile ? ["relationships"] : []], path);
    if (modules.has(module.id))
      add("DUPLICATE_MODULE", path + "/id", "Module id is not unique");
    const ids = new Set;
    modules.set(module.id, ids);
    definitions.set(module.id, new Map(module.elements.map((e) => [e.id, e])));
    extensions(module.extensions, "module", path);
    module.elements.forEach((element, ei) => {
      const location = `${path}/elements/${ei}`;
      unknown(element, ["id", "name", "description", "scalarType", "extensions", "references", ...doc.umf !== "0.1.0" ? ["kind"] : [], ...availability ? ["nullability"] : [], ...containers ? ["cardinality", "itemType"] : [], ...facets ? ["facets"] : [], ...keyProfile ? ["keys", "members"] : []], location);
      if (doc.umf !== "0.1.0" && element.kind !== undefined && !ELEMENT_KINDS.includes(element.kind))
        add("UNKNOWN_ELEMENT_KIND", location + "/kind", "Kind retained without interpretation", "warning");
      if (availability && element.nullability !== undefined && !NULLABILITIES.includes(element.nullability))
        add("UNKNOWN_NULLABILITY", location + "/nullability", "Availability label retained without interpretation", "warning");
      if (containers && element.cardinality !== undefined && !CARDINALITIES.includes(element.cardinality))
        add("UNKNOWN_CARDINALITY", location + "/cardinality", "Container label retained without interpretation", "warning");
      if (containers && element.itemType)
        unknown(element.itemType, ["module", "element"], location + "/itemType");
      if (facets && Object.hasOwn(element, "facets"))
        diagnostics.push(...validateFacetElement(element, location).diagnostics);
      if (element.scalarType !== undefined && !SCALAR_TYPES.includes(element.scalarType))
        add("UNKNOWN_SCALAR_TYPE", location + "/scalarType", "Scalar family retained without interpretation", "warning");
      if (ids.has(element.id))
        add("DUPLICATE_ELEMENT", location + "/id", "Element id is not unique within module");
      ids.add(element.id);
      extensions(element.extensions, "element", location);
      element.references?.forEach((ref, ri) => unknown(ref, ["role", "module", "element"], `${location}/references/${ri}`));
    });
  });
  doc.modules.forEach((module, mi) => module.elements.forEach((element, ei) => element.references?.forEach((ref, ri) => {
    if (!modules.get(ref.module)?.has(ref.element))
      add("UNRESOLVED_REFERENCE", `/modules/${mi}/elements/${ei}/references/${ri}`, "Target element does not exist in supplied document");
  })));
  if (containers)
    doc.modules.forEach((module, mi) => module.elements.forEach((element, ei) => {
      if (!Object.hasOwn(element, "itemType"))
        return;
      const ref = element.itemType, target = definitions.get(ref.module)?.get(ref.element), path = `/modules/${mi}/elements/${ei}/itemType`;
      if (!target)
        add("UNRESOLVED_ITEM_TYPE", path, "Item/value Field does not exist in supplied document");
      else if (target.kind !== "field")
        add("ITEM_TYPE_ROLE", path, "Item/value definition must be an explicit Field");
    }));
  if (relationshipProfile)
    diagnostics.push(...validateRelationshipCandidate(doc, false).diagnostics);
  else if (keyProfile)
    diagnostics.push(...validateKeyCandidate(doc, false).diagnostics);
  return { valid: !diagnostics.some((d) => d.severity === "error"), complete: diagnostics.length === 0, diagnostics };
}

// src/model/internal/field-body.ts
function evaluateFieldValue(fieldInput, valueInput, locateField, copy = copyJson, checkLiteral = checkSchemaLiteral, reserveLiteral) {
  const diagnostics = [];
  try {
    const field = copy(fieldInput);
    const value = copy(valueInput);
    reserveLiteral?.(value);
    if (!checkCoreLiteral(value))
      schemaError("Invalid typed literal");
    knownSchemaMembers(field, ["module", "element"], "/identity");
    const located = locateField(field);
    checkLiteral(located.source, located.node, value);
  } catch (error) {
    if (!(error instanceof UmfError))
      throw error;
    diagnostics.push({ code: error.code, path: error.path, message: error.message, severity: "error" });
  }
  return { valid: diagnostics.length === 0, complete: diagnostics.length === 0, diagnostics };
}

// src/model/internal/record-body.ts
function evaluateRecordBody(source, identity, values, documentValidation, validateField, lookupField = (identity) => source.modules.find((m) => m.id === identity.module)?.elements.find((e) => e.id === identity.element), hasRelationships = source.modules.some((m) => Array.isArray(m.relationships) && m.relationships.length)) {
  const checkIdentity = (value) => {
    knownSchemaMembers(value, ["module", "element"], "/identity");
    if (Object.keys(value).length !== 2 || typeof value.module !== "string" || !value.module || typeof value.element !== "string" || !value.element)
      throw new UmfError("CORE_RECORD_VALUE_IDENTITY", "Explicit qualified identity required");
  };
  checkIdentity(identity);
  if (!Array.isArray(values))
    throw new UmfError("CORE_RECORD_VALUE_INPUT", "Explicit field-state array required");
  const record = lookupField(identity);
  if (!record || record.kind !== "record")
    throw new UmfError("CORE_RECORD_VALUE_IDENTITY", "Record identity required");
  const diagnostics = [], fields = [];
  const add = (code, path, message, severity = "error") => diagnostics.push({ code, path, message, severity });
  for (const diagnostic of documentValidation.diagnostics)
    if (diagnostic.severity === "warning" && !diagnostic.code.startsWith("EXPERIMENTAL_"))
      diagnostics.push({ ...diagnostic });
  const key = (field) => JSON.stringify([field.module, field.element]);
  const supplied = new Map;
  values.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new UmfError("CORE_RECORD_VALUE_INPUT", "Explicit field-state object required");
    knownSchemaMembers(value, value.state === "present" ? ["field", "state", "value"] : ["field", "state"], "/values/" + index);
    if (!["absent", "present"].includes(value.state) || value.state === "present" && !Object.hasOwn(value, "value"))
      throw new UmfError("CORE_RECORD_VALUE_INPUT", "Explicit absent/present value required", "/values/" + index);
    checkIdentity(value.field);
    const id = key(value.field);
    if (supplied.has(id))
      add("DUPLICATE_RECORD_VALUE", "/values/" + index, "Duplicate qualified Field value");
    else
      supplied.set(id, value);
  });
  const members = record.members;
  if (!members)
    add("RECORD_MEMBERS_UNSPECIFIED", "/identity", "Record member inventory is not declared", "warning");
  const declared = new Set((members ?? []).map(key));
  for (const [id] of supplied)
    if (!declared.has(id))
      add("UNDECLARED_RECORD_VALUE", "/values", "Value is not a declared Record member: " + id);
  for (const member of members ?? []) {
    const field = lookupField(member);
    const value = supplied.get(key(member));
    const state = value?.state ?? "absent";
    const at = "/members/" + pointer(member.module) + "/" + pointer(member.element);
    const local = [];
    const issue = (code, message, severity = "error") => local.push({ code, path: at, message, severity });
    if (!field || field.kind !== "field")
      issue("RECORD_MEMBER_INTERPRETATION", "Member is not a supported Field", "warning");
    else {
      if (!(typeof field.nullability === "string" && ["required", "absent-allowed"].includes(field.nullability)))
        issue("RECORD_AVAILABILITY_UNKNOWN", "Complete availability requires explicit required or absent-allowed", "warning");
      if (!(typeof field.cardinality === "string" && ["one", "array", "map"].includes(field.cardinality)))
        issue("RECORD_CARDINALITY_UNKNOWN", "Complete shape requires explicit one/array/map", "warning");
      if (state === "absent") {
        if (field.nullability === "required")
          issue("REQUIRED_RECORD_VALUE", "Required Field is absent; defaults are not applied");
      } else {
        const result = validateField(member, value.value);
        local.push(...result.diagnostics.map((d) => ({ ...d, path: at + d.path })));
        if (!result.complete && !result.diagnostics.length)
          issue("FIELD_CHECK_INCOMPLETE", "Original Field checker is incomplete", "warning");
      }
    }
    diagnostics.push(...local);
    fields.push({ field: { module: member.module, element: member.element }, state, validation: { valid: !local.some((d) => d.severity === "error"), complete: local.length === 0, diagnostics: local } });
  }
  if (Array.isArray(record.keys) && record.keys.length)
    add("RECORD_KEY_CONTEXT_REQUIRED", "/identity", "Dataset key equality/uniqueness needs a separately qualified check", "warning");
  if (hasRelationships)
    add("RECORD_RELATIONSHIP_CONTEXT_REQUIRED", "/identity", "Relationship/endpoint constraints need a separately qualified dataset check", "warning");
  return { operation: "validate-core-record-values", version: "1.0.0", identity, values, documentValidation, validation: { valid: !diagnostics.some((d) => d.severity === "error"), complete: diagnostics.length === 0, diagnostics }, fields };
}

// src/model/key-tuple.ts
var validator2 = createValidator();
validator2.addSchema(schema_properties_document_schema_default);
var check4 = validator2.compile(key_tuple_operation_v3_schema_default);
var checkIdentity = validator2.compile(key_tuple_operation_v3_schema_default.$defs.identity);
var encoder = new TextEncoder;
var limit = LIMITS.maxTextLength;
function fail(code, message, path) {
  throw new UmfError(code, message, path);
}
var id = (r) => JSON.stringify([r.module, r.element]);
function leb(value) {
  const bytes = [];
  do {
    const rest = value % 128;
    value = Math.floor(value / 128);
    bytes.push(rest + (value ? 128 : 0));
  } while (value);
  return bytes;
}
function coefficient(token, scale, precision, path) {
  const m = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  if (!m)
    fail("KEY_TUPLE_TOKEN", "Expected exact JSON numeric token", path);
  let digits = (m[2] + (m[3] ?? "")).replace(/^0+/, "");
  if (!digits)
    return "0";
  const exponent = (m[4] ?? "0").replace(/^([+-]?)0+/, "$1") || "0";
  if (exponent.replace(/^[+-]/, "").length > 32)
    fail("LIMIT", "Nonzero exponent exceeds bounded tuple domain", path);
  const shift = BigInt(exponent === "+" || exponent === "-" ? "0" : exponent) - BigInt((m[3] ?? "").length) + BigInt(scale);
  if (shift < 0n) {
    const cut = -shift;
    if (cut > BigInt(digits.length))
      fail("KEY_TUPLE_ROUNDING", "Value is not exactly representable at declared scale", path);
    const split = digits.length - Number(cut);
    if (/[^0]/.test(digits.slice(split)))
      fail("KEY_TUPLE_ROUNDING", "Value is not exactly representable at declared scale", path);
    digits = digits.slice(0, split) || "0";
  } else {
    const length = BigInt(digits.length) + shift;
    if (precision !== undefined && length > BigInt(precision))
      fail("KEY_TUPLE_DOMAIN", "Decimal coefficient exceeds precision", path);
    if (length + BigInt(m[1].length) > BigInt(limit))
      fail("LIMIT", "Numeric expansion exceeds tuple limit", path);
    digits += "0".repeat(Number(shift));
  }
  if (precision !== undefined && digits.length > precision)
    fail("KEY_TUPLE_DOMAIN", "Decimal coefficient exceeds precision", path);
  return (m[1] && digits !== "0" ? "-" : "") + digits;
}
function scalarCount(text, path) {
  let count = 0, bytes = 0;
  for (let i = 0;i < text.length; i++, count++) {
    const c = text.charCodeAt(i);
    if (c >= 55296 && c <= 56319) {
      const next = text.charCodeAt(++i);
      if (!(next >= 56320 && next <= 57343))
        fail("KEY_TUPLE_UNICODE", "Unpaired high surrogate", path);
      bytes += 4;
    } else if (c >= 56320 && c <= 57343)
      fail("KEY_TUPLE_UNICODE", "Unpaired low surrogate", path);
    else
      bytes += c < 128 ? 1 : c < 2048 ? 2 : 3;
    if (bytes > limit)
      fail("LIMIT", "UTF-8 payload exceeds tuple limit", path);
  }
  return count;
}
function payload(field, value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.hasOwn(value, "absent"))
    fail("KEY_TUPLE_ABSENT", "Key component must be present and typed", path);
  const wrappers = { boolean: "boolean", integer: "integerToken", decimal: "decimalToken", string: "string", binary: "binaryHex" };
  const keys = Object.keys(value), expected = wrappers[field.scalarType];
  if (keys.length !== 1 || keys[0] !== expected)
    fail("KEY_TUPLE_VALUE", "Value wrapper does not match key component", path);
  const v = value[expected], facets = field.facets;
  if (expected === "boolean") {
    if (typeof v !== "boolean")
      fail("KEY_TUPLE_VALUE", "Expected boolean", path);
    return { tag: 1, bytes: new Uint8Array([v ? 1 : 0]) };
  }
  if (typeof v !== "string")
    fail("KEY_TUPLE_VALUE", "Numeric and binary values require exact lexical strings", path);
  if (expected === "integerToken") {
    const token = coefficient(v, 0, undefined, path), width = facets?.integerWidth;
    if (width) {
      const negative = token.startsWith("-"), magnitude = BigInt(negative ? token.slice(1) : token), bits = magnitude === 0n ? 0 : magnitude.toString(2).length;
      const fits = width.signed ? negative ? bits < width.bits || bits === width.bits && (magnitude & magnitude - 1n) === 0n : bits < width.bits : !negative && bits <= width.bits;
      if (!fits)
        fail("KEY_TUPLE_DOMAIN", "Integer exceeds declared width/signedness", path);
    }
    return { tag: 2, bytes: encoder.encode(token) };
  }
  if (expected === "decimalToken") {
    const token = coefficient(v, facets.scale, facets.precision, path), scale = leb(facets.scale), bytes = encoder.encode(token);
    const result = new Uint8Array(scale.length + bytes.length);
    result.set(scale);
    result.set(bytes, scale.length);
    return { tag: 3, bytes: result };
  }
  if (expected === "string") {
    const count = scalarCount(v, path);
    if (facets?.length && count > facets.length.max)
      fail("KEY_TUPLE_DOMAIN", "String exceeds Unicode scalar bound", path);
    return { tag: 4, bytes: encoder.encode(v) };
  }
  if (v.length % 2 || !/^[0-9a-fA-F]*$/.test(v))
    fail("KEY_TUPLE_VALUE", "Binary input must be whole hexadecimal bytes", path);
  if (facets?.length && v.length / 2 > facets.length.max)
    fail("KEY_TUPLE_DOMAIN", "Binary exceeds byte bound", path);
  const bytes = new Uint8Array(v.length / 2);
  for (let i = 0;i < bytes.length; i++)
    bytes[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
  return { tag: 5, bytes };
}
function encodeCoreKeyTupleBody(source, identity, values, validation, checkLiteral = checkSchemaLiteral, selection) {
  const originalSelection = () => {
    const modules = source.modules, mi = modules.findIndex((m) => m.id === identity.module), ei = modules[mi]?.elements.findIndex((e) => e.id === identity.element) ?? -1;
    const record = modules[mi]?.elements[ei], keys = record?.keys, ki = keys?.findIndex((k) => k.id === identity.key) ?? -1;
    if (!record || record.kind !== "record" || ki < 0)
      fail("KEY_TUPLE_MISSING", "Explicit Record/Key identity does not resolve", "/identity");
    const key = keys[ki], recordPath = `/modules/${mi}/elements/${ei}`, keyPath = recordPath + `/keys/${ki}`;
    const fields = key.fields.map((ref) => {
      const mi = modules.findIndex((m) => m.id === ref.module), ei = modules[mi].elements.findIndex((e) => e.id === ref.element);
      const member = record.members.findIndex((r) => id(r) === id(ref));
      return { field: modules[mi].elements[ei], path: `/modules/${mi}/elements/${ei}/facets`, member: recordPath + `/members/${member}` };
    });
    return { record, recordPath, key, keyPath, fields };
  };
  const { key, keyPath, fields } = selection ?? originalSelection();
  if (!Array.isArray(values) || values.length !== key.fields.length)
    fail("KEY_TUPLE_ARITY", "Expected one value per key component", "/values");
  let text = 0;
  for (const value of values)
    if (value && typeof value === "object") {
      for (const v of Object.values(value))
        if (typeof v === "string") {
          text += v.length;
          if (text > limit)
            fail("LIMIT", "Aggregate key value text exceeds limit", "/values");
        }
    }
  const relevant = [keyPath, ...fields.flatMap((f) => [f.path, f.member])];
  for (const d of validation.diagnostics)
    if (d.severity === "warning" && ["UNKNOWN_KEY_QUALIFIER", "UNKNOWN_FACET", "UNKNOWN_FACET_UNIT"].includes(d.code) && relevant.some((p) => d.path === p || d.path.startsWith(p + "/")))
      fail("KEY_TUPLE_UNKNOWN", "Relevant qualifier has no defined encoding meaning", d.path);
  const parts = [encoder.encode("UMFK1"), new Uint8Array(leb(values.length))];
  let length = parts.reduce((n, p) => n + p.length, 0);
  fields.forEach(({ field }, i) => {
    const p = payload(field, values[i], `/values/${i}`);
    checkLiteral(source, field, values[i]);
    const header = new Uint8Array([p.tag, ...leb(p.bytes.length)]);
    length += header.length + p.bytes.length;
    if (length > limit)
      fail("LIMIT", "Encoded tuple exceeds limit", "/values");
    parts.push(header, p.bytes);
  });
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  const chunks = [];
  for (let start = 0;start < bytes.length; start += 4096)
    chunks.push(Array.from(bytes.subarray(start, start + 4096), (b) => b.toString(16).padStart(2, "0")).join(""));
  return { operation: "encode-core-key-tuple", version: "3.0.0", profile: "umf-key-tuple-v1", identity, values, keyPath, bytesHex: chunks.join("") };
}

// src/model/internal/value-context.ts
class WorkExceeded extends Error {
}

class ValueWork {
  used = 0;
  categories = Object.create(null);
  charge(category, visits) {
    if (!Number.isSafeInteger(visits) || visits < 0 || this.used + visits > 1e6)
      throw new WorkExceeded("Compact dataset JSON traversal/copy/semantic budget exceeded");
    this.used += visits;
    this.categories[category] = (this.categories[category] ?? 0) + visits;
  }
  count(value) {
    let n = 0;
    const visit = (v) => {
      this.charge("count", 1);
      n++;
      if (v !== null && typeof v === "object")
        for (const child of Object.values(v))
          visit(child);
    };
    visit(value);
    return n;
  }
  walk(category, value, multiplier = 1) {
    const n = this.count(value);
    this.charge(category, n * multiplier);
    return n;
  }
  copy(value) {
    return copyJsonCharged(value, (n) => this.charge("copy", n));
  }
  snapshot() {
    return { used: this.used, categories: { ...this.categories } };
  }
}
function preflightBytes(value, work) {
  let bytes = 0;
  const add = (n) => {
    bytes += n;
    if (bytes > 4000000)
      throw new WorkExceeded("Compact source/input serialized bytes exceeded");
  };
  const string = (s) => {
    add(2);
    for (let i = 0;i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 34 || c === 92)
        add(2);
      else if (c < 32)
        add([8, 9, 10, 12, 13].includes(c) ? 2 : 6);
      else if (c >= 55296 && c <= 56319) {
        const next = s.charCodeAt(i + 1);
        if (next >= 56320 && next <= 57343) {
          add(4);
          i++;
        } else
          add(6);
      } else if (c >= 56320 && c <= 57343)
        add(6);
      else
        add(c < 128 ? 1 : c < 2048 ? 2 : 3);
    }
  };
  const visit = (v) => {
    work.charge("preflight-byte-traversal", 1);
    if (typeof v === "string") {
      string(v);
      return;
    }
    if (v === null || typeof v !== "object") {
      add(JSON.stringify(v).length);
      return;
    }
    if (Array.isArray(v)) {
      add(2 + Math.max(0, v.length - 1));
      for (const child of v)
        visit(child);
      return;
    }
    const entries = Object.entries(v);
    add(2 + Math.max(0, entries.length - 1));
    for (const [key, child] of entries) {
      string(key);
      add(1);
      visit(child);
    }
  };
  visit(value);
  return bytes;
}
function freeze2(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value))
      freeze2(child);
    Object.freeze(value);
  }
}
function createValueContext(sourceInput, inputInput, work = new ValueWork) {
  const source = work.copy(sourceInput), input = work.copy(inputInput);
  const sourceCount = work.count(source);
  if (preflightBytes(source, work) + preflightBytes(input, work) > 4000000)
    throw new WorkExceeded("Compact aggregate source/input serialized bytes exceeded");
  work.charge("source-copy-linear-semantics", 28 * sourceCount);
  reserveSourceSchemaWork(source, work);
  const modules = source !== null && typeof source === "object" && Array.isArray(source.modules) ? source.modules : [];
  const elements = modules.flatMap((m) => m !== null && typeof m === "object" && Array.isArray(m.elements) ? m.elements : []);
  const relationships = modules.flatMap((m) => m !== null && typeof m === "object" && Array.isArray(m.relationships) ? m.relationships : []);
  const endpoints = relationships.reduce((n, r) => n + (r !== null && typeof r === "object" ? (Array.isArray(r.source) ? r.source.length : 0) + (Array.isArray(r.target) ? r.target.length : 0) + (r.associationRecord ? 1 : 0) : 0), 0);
  const keyFieldOccurrences = elements.reduce((n, e) => n + (e !== null && typeof e === "object" && Array.isArray(e.keys) ? e.keys.reduce((a, k) => a + (k !== null && typeof k === "object" && Array.isArray(k.fields) ? k.fields.length : 0), 0) : 0), 0);
  const maxFieldReferences = elements.reduce((n, e) => Math.max(n, e !== null && typeof e === "object" && Array.isArray(e.references) ? e.references.length : 0), 0);
  work.charge("source-key-reference-scans", keyFieldOccurrences * maxFieldReferences);
  const maxKeys = elements.reduce((n, e) => Math.max(n, e !== null && typeof e === "object" && Array.isArray(e.keys) ? e.keys.length : 0), 0);
  work.charge("source-index-collision-bound", elements.length ** 2 + 2 * endpoints ** 2 + endpoints * maxKeys);
  for (const e of elements) {
    if (e === null || typeof e !== "object")
      continue;
    const declarations = [...Array.isArray(e.examples) ? e.examples : [], ...Array.isArray(e.allowedValues) ? e.allowedValues : [], ...e.default?.value !== undefined ? [e.default.value] : []];
    for (const value of declarations)
      work.charge("source-declaration-validation", sourceCount * work.count(value));
  }
  const documentValidation = validateDocument(source);
  if (!documentValidation.valid || source?.umf !== "0.8.0")
    throw new UmfError("CORE_DATASET_SOURCE", "Original valid core0.8 source required");
  work.walk("context-freeze", source);
  work.walk("context-freeze", input);
  freeze2(source);
  freeze2(input);
  work.walk("validation-freeze", documentValidation);
  freeze2(documentValidation);
  const locations = new Map;
  source.modules.forEach((m, mi) => m.elements.forEach((node, ei) => locations.set(JSON.stringify([m.id, node.id]), { node, path: `/modules/${mi}/elements/${ei}` })));
  work.walk("context-key-index", source);
  const keyLocations = new Map;
  source.modules.forEach((m, mi) => m.elements.forEach((record, ei) => {
    if (record.kind !== "record")
      return;
    const path = `/modules/${mi}/elements/${ei}`, members = new Map;
    for (const [index, ref] of (record.members ?? []).entries()) {
      const id = JSON.stringify([ref.module, ref.element]);
      if (!members.has(id))
        members.set(id, index);
    }
    for (const [ki, key] of (record.keys ?? []).entries())
      keyLocations.set(JSON.stringify([m.id, record.id, key.id]), { record, recordPath: path, key, keyPath: path + `/keys/${ki}`, fields: key.fields.map((ref) => {
        const id = JSON.stringify([ref.module, ref.element]), field = locations.get(id);
        return { field: field.node, path: field.path + "/facets", member: path + `/members/${members.get(id)}` };
      }) });
  }));
  const literal = (doc, field, value) => checkSchemaLiteralTracked(doc, field, value, (_d, _f, v) => {
    if (["array", "map"].includes(_f.cardinality))
      work.charge("literal-item-source-access", sourceCount);
    work.walk("literal-field-access", _f, 4);
    work.walk("literal-value", v, 4);
  });
  const field = (identity, value) => evaluateFieldValue(identity, value, (id) => {
    const found = locations.get(JSON.stringify([id.module, id.element]));
    if (!found)
      throw new UmfError("CORE_SCHEMA_PROPERTIES", "Element not found");
    work.walk("field-identity", id);
    return { source, node: found.node };
  }, (v) => work.copy(v), literal, (v) => reserveLiteralSchemaWork(v, work));
  const record = (identity, values) => {
    const found = locations.get(JSON.stringify([identity.module, identity.element]));
    if (!found || found.node.kind !== "record")
      throw new UmfError("CORE_RECORD_VALUE_IDENTITY", "Record identity required");
    work.walk("record-index", found.node);
    work.walk("record-values", values);
    work.walk("record-document-diagnostics", documentValidation);
    return work.copy({ ...evaluateRecordBody(source, identity, values, documentValidation, field, (ref) => {
      work.walk("record-member-lookup", ref);
      return locations.get(JSON.stringify([ref.module, ref.element]))?.node;
    }, relationships.length > 0), sourceRef: "#/source" });
  };
  const key = (identity, values) => {
    work.walk("key-index-identity", identity);
    work.charge("key-component-index", values.length);
    work.charge("key-relevant-diagnostic-scans", 3 * (1 + 2 * values.length) * documentValidation.diagnostics.length);
    work.walk("key-values", values);
    work.walk("key-document-diagnostics", documentValidation);
    const selected = keyLocations.get(JSON.stringify([identity.module, identity.element, identity.key]));
    if (!selected)
      throw new UmfError("KEY_TUPLE_MISSING", "Explicit Record/Key identity does not resolve", "/identity");
    return work.copy({ ...encodeCoreKeyTupleBody(source, identity, values, documentValidation, literal, selected), sourceRef: "#/source" });
  };
  return { source, input, documentValidation, work, record, key, reserveInput: () => reserveInputSchemaWork(input, work), copy: (v) => work.copy(v), literal };
}
// spec/core/evolution-policy.schema.json
var evolution_policy_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:evolution-policy:1.0.0",
  title: "Core evolution preservation policy",
  type: "object",
  additionalProperties: false,
  required: [
    "profile"
  ],
  properties: {
    profile: {
      const: "core-0.8-absent-string-additions/0.1"
    }
  }
};
// spec/core/evolution-operation.schema.json
var evolution_operation_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:umf:core:evolution-operation:1.0.0",
  title: "Experimental bounded core revision preservation receipt",
  type: "object",
  additionalProperties: false,
  required: [
    "operation",
    "version",
    "profile",
    "before",
    "after",
    "beforeValidation",
    "afterValidation",
    "classification",
    "complete",
    "changes",
    "presenceChecks",
    "diagnostics",
    "residuals"
  ],
  properties: {
    operation: {
      const: "inspect-core-evolution"
    },
    version: {
      const: "1.0.0"
    },
    profile: {
      const: "core-0.8-absent-string-additions/0.1"
    },
    before: {
      $ref: "urn:umf:core:0.8.0"
    },
    after: {
      $ref: "urn:umf:core:0.8.0"
    },
    beforeValidation: {
      type: "object",
      properties: {
        valid: {
          type: "boolean"
        },
        complete: {
          type: "boolean"
        },
        diagnostics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: {
                type: "string",
                minLength: 1
              },
              path: {
                type: "string"
              },
              message: {
                type: "string"
              },
              severity: {
                enum: [
                  "error",
                  "warning"
                ]
              }
            },
            required: [
              "code",
              "path",
              "message",
              "severity"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "valid",
        "complete",
        "diagnostics"
      ],
      additionalProperties: false
    },
    afterValidation: {
      type: "object",
      properties: {
        valid: {
          type: "boolean"
        },
        complete: {
          type: "boolean"
        },
        diagnostics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: {
                type: "string",
                minLength: 1
              },
              path: {
                type: "string"
              },
              message: {
                type: "string"
              },
              severity: {
                enum: [
                  "error",
                  "warning"
                ]
              }
            },
            required: [
              "code",
              "path",
              "message",
              "severity"
            ],
            additionalProperties: false
          }
        }
      },
      required: [
        "valid",
        "complete",
        "diagnostics"
      ],
      additionalProperties: false
    },
    classification: {
      enum: [
        "preserved",
        "breaking",
        "unsupported"
      ]
    },
    complete: {
      type: "boolean"
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "beforePath",
          "afterPath",
          "kind"
        ],
        properties: {
          beforePath: {
            type: [
              "string",
              "null"
            ]
          },
          afterPath: {
            type: [
              "string",
              "null"
            ]
          },
          kind: {
            enum: [
              "added-absent-string",
              "changed-definition",
              "removed-definition",
              "unsupported-change"
            ]
          }
        }
      }
    },
    presenceChecks: {
      type: "array",
      items: {
        $ref: "urn:umf:core:dataset-value-operation:1.0.0#/$defs/recordCheck"
      }
    },
    diagnostics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: {
            type: "string",
            minLength: 1
          },
          path: {
            type: "string"
          },
          message: {
            type: "string"
          },
          severity: {
            enum: [
              "error",
              "warning"
            ]
          }
        },
        required: [
          "code",
          "path",
          "message",
          "severity"
        ],
        additionalProperties: false
      }
    },
    residuals: {
      type: "array",
      items: {
        type: "string",
        minLength: 1
      }
    }
  },
  allOf: [
    {
      if: {
        properties: {
          classification: {
            const: "preserved"
          }
        }
      },
      then: {
        properties: {
          complete: {
            const: true
          },
          residuals: {
            maxItems: 0,
            type: "array"
          },
          beforeValidation: {
            properties: {
              valid: {
                const: true
              },
              complete: {
                const: true
              }
            },
            type: "object"
          },
          afterValidation: {
            properties: {
              valid: {
                const: true
              },
              complete: {
                const: true
              }
            },
            type: "object"
          }
        }
      },
      else: {
        properties: {
          complete: {
            const: false
          },
          residuals: {
            minItems: 1,
            type: "array"
          }
        }
      }
    }
  ]
};

// src/model/evolution.ts
var policySchema = snapshotSchema(evolution_policy_schema_default);
var receiptSchema = snapshotSchema(evolution_operation_schema_default);
var validator3 = createValidator();
for (const s of [schema_properties_document_schema_default, key_tuple_operation_v3_schema_default, dataset_value_operation_schema_default])
  validator3.addSchema(snapshotSchema(s));
var checkPolicy = validator3.compile(policySchema);
var checkReceipt = validator3.compile(receiptSchema);
function canonical2(value, work) {
  work.charge("evolution-canonical", 1);
  if (Array.isArray(value))
    return "[" + value.map((x) => canonical2(x, work)).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    work.charge("evolution-sort", keys.length * Math.ceil(Math.log2(keys.length + 1)));
    return "{" + keys.sort().map((k) => JSON.stringify(k) + ":" + canonical2(value[k], work)).join(",") + "}";
  }
  return JSON.stringify(value);
}
function equal(a, b, w) {
  return canonical2(a, w) === canonical2(b, w);
}
function bounded(value, w) {
  const n = w.count(value);
  if (n > 1e5)
    throw new WorkExceeded("Evolution aggregate value limit");
  preflightBytes(value, w);
}
function compose(beforeInput, afterInput, policyInput, work) {
  const policy = work.copy(policyInput);
  bounded(policy, work);
  reserveSchemaWork(policySchema, policySchema, policy, work, "evolution-policy");
  if (!checkPolicy(policy))
    throw new UmfError("CORE_EVOLUTION_POLICY", "Explicit bounded evolution profile required");
  const frozenBefore = work.copy(beforeInput), frozenAfter = work.copy(afterInput);
  bounded({ before: frozenBefore, after: frozenAfter, policy }, work);
  const beforeContext = createValueContext(frozenBefore, {}, work), afterContext = createValueContext(frozenAfter, {}, work);
  const before = beforeContext.source, after = afterContext.source;
  bounded({ before, after, policy }, work);
  const changes = [], presenceChecks = [], residuals = [];
  let broken = false;
  const changed = (kind, beforePath, afterPath) => {
    work.charge("evolution-change", 1);
    changes.push({ kind, beforePath, afterPath });
    residuals.push("Existing definition or unsupported structure differs: " + (afterPath ?? beforePath));
    if (kind !== "unsupported-change")
      broken = true;
  };
  const stripped = work.copy(after);
  const beforeModules = before.modules, afterModules = stripped.modules;
  if (beforeModules.length > afterModules.length)
    changed("removed-definition", "/modules", null);
  if (before.id !== after.id || before.umf !== after.umf)
    changed("changed-definition", "/id", "/id");
  for (let mi = 0;mi < beforeModules.length; mi++) {
    const bm = beforeModules[mi], am = afterModules[mi];
    work.charge("evolution-module", 1);
    if (!am || am.id !== bm.id) {
      changed("removed-definition", "/modules/" + mi, "/modules/" + mi);
      continue;
    }
    if (!equal(bm.relationships ?? [], am.relationships ?? [], work))
      changed("changed-definition", "/modules/" + mi + "/relationships", "/modules/" + mi + "/relationships");
    work.charge("evolution-element-index", 2 * bm.elements.length);
    const oldIds = new Set(bm.elements.map((e) => e.id));
    work.charge("evolution-appended-copy", Math.max(0, am.elements.length - bm.elements.length));
    const appended = am.elements.slice(bm.elements.length);
    const additions = new Map;
    for (const [additionIndex, field] of appended.entries()) {
      work.charge("evolution-added-field", 1);
      work.walk("evolution-field-key-scan", field, 8);
      const known = ["id", "name", "kind", "scalarType", "cardinality", "nullability", "extensions"];
      if (field.kind === "field" && field.scalarType === "string" && field.cardinality === "one" && field.nullability === "absent-allowed" && !oldIds.has(field.id) && Object.keys(field).every((k) => known.includes(k)) && equal(field.extensions ?? {}, {}, work))
        additions.set(field.id, field);
      else
        changed(field.kind === "field" && field.nullability === "required" ? "changed-definition" : "unsupported-change", null, "/modules/" + mi + "/elements/" + (bm.elements.length + additionIndex));
    }
    const used = new Set;
    for (let ei = 0;ei < bm.elements.length; ei++) {
      const old = bm.elements[ei], next = am.elements[ei];
      work.charge("evolution-existing-field", 1);
      if (!next || next.id !== old.id) {
        changed("removed-definition", "/modules/" + mi + "/elements/" + ei, null);
        continue;
      }
      if (old.kind === "field" && ["kind", "scalarType", "cardinality", "nullability", "facets", "default"].some((k) => !equal(old[k] ?? null, next[k] ?? null, work)))
        changed("changed-definition", "/modules/" + mi + "/elements/" + ei, "/modules/" + mi + "/elements/" + ei);
      if (old.kind === "record" && !equal(old.keys ?? [], next.keys ?? [], work))
        changed("changed-definition", "/modules/" + mi + "/elements/" + ei + "/keys", "/modules/" + mi + "/elements/" + ei + "/keys");
      if (old.kind === "record" && Array.isArray(old.members) && Array.isArray(next.members)) {
        work.charge("evolution-member-comparison-copy", Math.min(next.members.length, old.members.length));
        if (!equal(old.members, next.members.slice(0, old.members.length), work))
          changed("changed-definition", "/modules/" + mi + "/elements/" + ei + "/members", "/modules/" + mi + "/elements/" + ei + "/members");
        work.charge("evolution-member-suffix-copy", Math.max(0, next.members.length - old.members.length));
        const suffix = next.members.slice(old.members.length);
        for (const [suffixIndex, ref] of suffix.entries()) {
          work.charge("evolution-member", 1);
          if (ref.module !== bm.id || !additions.has(ref.element) || used.has(old.id + "\x00" + ref.element)) {
            changed("unsupported-change", null, "/modules/" + mi + "/elements/" + ei + "/members");
            continue;
          }
          used.add(old.id + "\x00" + ref.element);
          const compact = afterContext.record({ module: bm.id, element: old.id }, [{ field: ref, state: "absent" }]);
          const { sourceRef, ...body } = compact;
          const original = work.copy({ ...body, source: after });
          presenceChecks.push(original);
          work.charge("evolution-field-result-scan", compact.fields.length);
          const result = compact.fields.find((f) => f.field.module === ref.module && f.field.element === ref.element);
          if (!result?.validation.valid || !result.validation.complete)
            changed("changed-definition", null, "/modules/" + mi + "/elements/" + ei + "/members");
          changes.push({ kind: "added-absent-string", beforePath: null, afterPath: "/modules/" + mi + "/elements/" + ei + "/members/" + (old.members.length + suffixIndex) });
        }
        work.charge("evolution-member-prefix-copy", Math.min(next.members.length, old.members.length));
        next.members = next.members.slice(0, old.members.length);
      }
    }
    for (const id of additions.keys()) {
      work.charge("evolution-unused-scan", 2 * used.size);
      if (![...used].some((k) => k.endsWith("\x00" + id))) {
        changed("unsupported-change", null, "/modules/" + mi + "/elements");
      }
    }
    work.charge("evolution-element-prefix-copy", Math.min(am.elements.length, bm.elements.length));
    am.elements = am.elements.slice(0, bm.elements.length);
  }
  if (!equal(before, stripped, work))
    changed("unsupported-change", "/", "/");
  if (!beforeContext.documentValidation.complete || !afterContext.documentValidation.complete)
    residuals.push("Unknown retained source meaning is not classified");
  const classification = broken ? "breaking" : residuals.length ? "unsupported" : "preserved";
  work.charge("evolution-diagnostic-copy", beforeContext.documentValidation.diagnostics.length + afterContext.documentValidation.diagnostics.length);
  const receipt = { operation: "inspect-core-evolution", version: "1.0.0", profile: "core-0.8-absent-string-additions/0.1", before, after, beforeValidation: beforeContext.documentValidation, afterValidation: afterContext.documentValidation, classification, complete: classification === "preserved", changes, presenceChecks, diagnostics: [...beforeContext.documentValidation.diagnostics, ...afterContext.documentValidation.diagnostics], residuals };
  bounded(receipt, work);
  return receipt;
}
function limit2(error) {
  if (error instanceof WorkExceeded)
    throw new UmfError("LIMIT", error.message);
  throw error;
}
function inspectCoreEvolution(before, after, policy) {
  try {
    const work = new ValueWork, receipt = compose(before, after, policy, work);
    reserveSchemaWork(receiptSchema, receiptSchema, receipt, work, "evolution-result");
    if (!checkReceipt(receipt))
      throw new UmfError("CORE_EVOLUTION_RESULT", JSON.stringify(checkReceipt.errors));
    return work.copy(receipt);
  } catch (error) {
    return limit2(error);
  }
}
function verifyCoreEvolution(receiptInput, before, after, policy) {
  try {
    const work = new ValueWork, receipt = work.copy(receiptInput);
    bounded(receipt, work);
    reserveSchemaWork(receiptSchema, receiptSchema, receipt, work, "evolution-receipt");
    if (!checkReceipt(receipt))
      throw new UmfError("CORE_EVOLUTION_RECEIPT", "Closed original receipt required");
    const expected = compose(before, after, policy, work);
    if (!equal(receipt, expected, work))
      throw new UmfError("CORE_EVOLUTION_RECEIPT", "Original expected inputs or complete result differ");
    return work.copy(expected);
  } catch (error) {
    return limit2(error);
  }
}

// .cache/actions-merged-core-evolution/entry.ts
var before = { umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] };
var inputs = [{ umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] }, { umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }, { module: "domain", element: "products.evolution_note" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }, { id: "products.evolution_note", name: "evolution_note", kind: "field", scalarType: "string", cardinality: "one", nullability: "absent-allowed", extensions: {} }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] }, { umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }, { module: "domain", element: "products.evolution_note" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }, { id: "products.evolution_note", name: "evolution_note", kind: "field", scalarType: "string", cardinality: "one", nullability: "absent-allowed", extensions: {} }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] }, { umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }, { module: "domain", element: "products.evolution_note" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }, { id: "products.evolution_note", name: "evolution_note", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", extensions: {} }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] }, { umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }, { module: "domain", element: "products.evolution_note" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }, { id: "products.evolution_note", name: "evolution_note", kind: "field", scalarType: "string", cardinality: "one", nullability: "absent-allowed", extensions: {}, description: "Retained known annotation" }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] }, { umf: "0.8.0", id: "urn:umf:domain:commerce", title: "commerce ontology", vocabularies: {}, modules: [{ id: "domain", namespace: "urn:umf:domain:commerce:", elements: [{ id: "customers", kind: "record", name: "customers", title: "customers", description: "Synthetic customers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "customers.id" }, { module: "domain", element: "customers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "customers.id" }], primary: true }], extensions: {} }, { id: "customers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers id; synthetic reference scenario.", extensions: {} }, { id: "customers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored customers name; synthetic reference scenario.", extensions: {} }, { id: "suppliers", kind: "record", name: "suppliers", title: "suppliers", description: "Synthetic suppliers; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "suppliers.id" }, { module: "domain", element: "suppliers.name" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "suppliers.id" }], primary: true }], extensions: {} }, { id: "suppliers.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers id; synthetic reference scenario.", extensions: {} }, { id: "suppliers.name", name: "name", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored suppliers name; synthetic reference scenario.", extensions: {} }, { id: "products", kind: "record", name: "products", title: "products", description: "Synthetic products; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "products.id" }, { module: "domain", element: "products.supplier_id" }, { module: "domain", element: "products.sku" }, { module: "domain", element: "products.unit_price" }, { module: "domain", element: "products.evolution_note" }, { module: "domain", element: "products.second_note" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "products.id" }], primary: true }], extensions: {} }, { id: "products.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products id; synthetic reference scenario.", extensions: {} }, { id: "products.supplier_id", name: "supplier_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products supplier_id; synthetic reference scenario.", extensions: {} }, { id: "products.sku", name: "sku", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored products sku; synthetic reference scenario.", extensions: {} }, { id: "products.unit_price", name: "unit_price", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored products unit_price; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "orders", kind: "record", name: "orders", title: "orders", description: "Synthetic orders; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "orders.id" }, { module: "domain", element: "orders.customer_id" }, { module: "domain", element: "orders.ordered_at" }, { module: "domain", element: "orders.status" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "orders.id" }], primary: true }], extensions: {} }, { id: "orders.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders id; synthetic reference scenario.", extensions: {} }, { id: "orders.customer_id", name: "customer_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders customer_id; synthetic reference scenario.", extensions: {} }, { id: "orders.ordered_at", name: "ordered_at", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders ordered_at; synthetic reference scenario.", extensions: {} }, { id: "orders.status", name: "status", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored orders status; synthetic reference scenario.", extensions: {} }, { id: "order_lines", kind: "record", name: "order_lines", title: "order_lines", description: "Synthetic order_lines; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "order_lines.id" }, { module: "domain", element: "order_lines.order_id" }, { module: "domain", element: "order_lines.product_id" }, { module: "domain", element: "order_lines.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "order_lines.id" }], primary: true }], extensions: {} }, { id: "order_lines.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines order_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.product_id", name: "product_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored order_lines product_id; synthetic reference scenario.", extensions: {} }, { id: "order_lines.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored order_lines quantity; synthetic reference scenario.", extensions: {} }, { id: "fulfillments", kind: "record", name: "fulfillments", title: "fulfillments", description: "Synthetic fulfillments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "fulfillments.id" }, { module: "domain", element: "fulfillments.line_id" }, { module: "domain", element: "fulfillments.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "fulfillments.id" }], primary: true }], extensions: {} }, { id: "fulfillments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored fulfillments line_id; synthetic reference scenario.", extensions: {} }, { id: "fulfillments.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored fulfillments quantity; synthetic reference scenario.", extensions: {} }, { id: "invoices", kind: "record", name: "invoices", title: "invoices", description: "Synthetic invoices; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "invoices.id" }, { module: "domain", element: "invoices.order_id" }, { module: "domain", element: "invoices.amount" }, { module: "domain", element: "invoices.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "invoices.id" }], primary: true }], extensions: {} }, { id: "invoices.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices id; synthetic reference scenario.", extensions: {} }, { id: "invoices.order_id", name: "order_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices order_id; synthetic reference scenario.", extensions: {} }, { id: "invoices.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored invoices amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "invoices.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored invoices currency; synthetic reference scenario.", extensions: {} }, { id: "payments", kind: "record", name: "payments", title: "payments", description: "Synthetic payments; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "payments.id" }, { module: "domain", element: "payments.invoice_id" }, { module: "domain", element: "payments.amount" }, { module: "domain", element: "payments.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "payments.id" }], primary: true }], extensions: {} }, { id: "payments.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments id; synthetic reference scenario.", extensions: {} }, { id: "payments.invoice_id", name: "invoice_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments invoice_id; synthetic reference scenario.", extensions: {} }, { id: "payments.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored payments amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "payments.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored payments currency; synthetic reference scenario.", extensions: {} }, { id: "returns", kind: "record", name: "returns", title: "returns", description: "Synthetic returns; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "returns.id" }, { module: "domain", element: "returns.line_id" }, { module: "domain", element: "returns.quantity" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "returns.id" }], primary: true }], extensions: {} }, { id: "returns.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns id; synthetic reference scenario.", extensions: {} }, { id: "returns.line_id", name: "line_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored returns line_id; synthetic reference scenario.", extensions: {} }, { id: "returns.quantity", name: "quantity", kind: "field", scalarType: "integer", cardinality: "one", nullability: "required", description: "Authored returns quantity; synthetic reference scenario.", extensions: {} }, { id: "refunds", kind: "record", name: "refunds", title: "refunds", description: "Synthetic refunds; illustrative, not population-valid or native-standard conformance.", members: [{ module: "domain", element: "refunds.id" }, { module: "domain", element: "refunds.return_id" }, { module: "domain", element: "refunds.amount" }, { module: "domain", element: "refunds.currency" }], keys: [{ id: "identity", name: "Identity", fields: [{ module: "domain", element: "refunds.id" }], primary: true }], extensions: {} }, { id: "refunds.id", name: "id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds id; synthetic reference scenario.", extensions: {} }, { id: "refunds.return_id", name: "return_id", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds return_id; synthetic reference scenario.", extensions: {} }, { id: "refunds.amount", name: "amount", kind: "field", scalarType: "decimal", cardinality: "one", nullability: "required", description: "Authored refunds amount; synthetic reference scenario.", extensions: {}, facets: { precision: 18, scale: 2 } }, { id: "refunds.currency", name: "currency", kind: "field", scalarType: "string", cardinality: "one", nullability: "required", description: "Authored refunds currency; synthetic reference scenario.", extensions: {} }, { id: "products.evolution_note", name: "repeat", kind: "field", scalarType: "string", cardinality: "one", nullability: "absent-allowed", extensions: {} }, { id: "products.second_note", name: "repeat", kind: "field", scalarType: "string", cardinality: "one", nullability: "absent-allowed", extensions: {} }], relationships: [{ id: "products.supplier_id", name: "products.supplier_id", source: [{ module: "domain", element: "products" }], target: [{ module: "domain", element: "suppliers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "orders.customer_id", name: "orders.customer_id", source: [{ module: "domain", element: "orders" }], target: [{ module: "domain", element: "customers", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.order_id", name: "order_lines.order_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "order_lines.product_id", name: "order_lines.product_id", source: [{ module: "domain", element: "order_lines" }], target: [{ module: "domain", element: "products", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "fulfillments.line_id", name: "fulfillments.line_id", source: [{ module: "domain", element: "fulfillments" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "invoices.order_id", name: "invoices.order_id", source: [{ module: "domain", element: "invoices" }], target: [{ module: "domain", element: "orders", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "payments.invoice_id", name: "payments.invoice_id", source: [{ module: "domain", element: "payments" }], target: [{ module: "domain", element: "invoices", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "returns.line_id", name: "returns.line_id", source: [{ module: "domain", element: "returns" }], target: [{ module: "domain", element: "order_lines", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }, { id: "refunds.return_id", name: "refunds.return_id", source: [{ module: "domain", element: "refunds" }], target: [{ module: "domain", element: "returns", key: "identity" }], sourceMultiplicity: { min: 0, max: "*" }, targetMultiplicity: { min: 1, max: 1 }, targetLifecycle: "independent", directed: true }] }] }];
var policy = { profile: "core-0.8-absent-string-additions/0.1" };
window.result = inputs.map((after) => {
  const r = inspectCoreEvolution(before, after, policy);
  verifyCoreEvolution(r, before, after, policy);
  return r;
});
var original = before;
window.controls = function controls() {
  const out = [];
  for (const run of [() => inspectCoreEvolution(original, original, { profile: "x".repeat(8000000) }), () => verifyCoreEvolution({ ...inspectCoreEvolution(original, original, policy), opaque: "x".repeat(8000000) }, original, original, policy)])
    try {
      run();
      throw Error("Resource admitted");
    } catch (e) {
      if (e.code !== "LIMIT")
        throw e;
      out.push(e.code);
    }
  return out;
}();
