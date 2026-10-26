const [predecessorUrl, bindingUrl] = process.argv.slice(2);
if (!predecessorUrl || !bindingUrl) throw new Error('usage: security-not-parity.mjs <predecessor module URL> <Node binding module URL>');

const {securityNot} = await import(predecessorUrl);
const {createSecurityLogicEngine} = await import(bindingUrl);
const rust = createSecurityLogicEngine();

function outcome(fn, value, trace) {
  try {
    return {kind: 'return', value: fn(value), trace};
  } catch (error) {
    return {
      kind: 'throw',
      name: error.name,
      constructor: error.constructor?.name ?? null,
      code: error.code ?? null,
      message: String(error.message),
      path: error.path ?? null,
      trace,
    };
  }
}

function input(name, trace) {
  switch (name) {
    case 'T': return 'T';
    case 'F': return 'F';
    case 'U': return 'U';
    case 'null': return null;
    case 'number': return 1;
    case 'boolean': return true;
    case 'unknown-string': return 'X';
    case 'array': return [];
    case 'object': return {};
    case 'null-prototype': return Object.create(null);
    case 'accessor': return Object.defineProperty({}, 'member', {
      enumerable: true,
      get() { trace.push('getter'); return 'T'; },
    });
    case 'proxy-ownKeys': return new Proxy({}, {
      ownKeys() { trace.push('ownKeys'); throw new Error('ownKeys trap'); },
    });
    case 'proxy-getPrototype': return new Proxy({}, {
      getPrototypeOf() { trace.push('getPrototypeOf'); throw new Error('prototype trap'); },
    });
    case 'proxy-get': return new Proxy({}, {
      get() { trace.push('get'); return 'T'; },
    });
    default: throw new Error(`unknown case: ${name}`);
  }
}

const cases = ['T', 'F', 'U', 'null', 'number', 'boolean', 'unknown-string', 'array', 'object',
  'null-prototype', 'accessor', 'proxy-ownKeys', 'proxy-getPrototype', 'proxy-get'];
const runtime = typeof Bun === 'undefined' ? process.version : `Bun ${Bun.version}`;
const rows = cases.map(name => {
  const typescriptTrace = [];
  const rustTrace = [];
  return {
    name,
    typescript: outcome(securityNot, input(name, typescriptTrace), typescriptTrace),
    rust: outcome(rust.securityNot, input(name, rustTrace), rustTrace),
  };
});

process.stdout.write(`${JSON.stringify({runtime, profile: 'umf.security-logic/1.0.0', rows})}\n`);
