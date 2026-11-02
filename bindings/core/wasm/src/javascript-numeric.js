import {encodeRequestWire, encodeWire, fromWire, resultError} from './wire.js';

export const JAVASCRIPT_NUMERIC_PROFILE = 'umf.javascript-numeric/1.0.0';

function coreError(code, message, path = '') {
  const error = new Error(message);
  error.name = 'UmfCoreError';
  error.code = code;
  error.path = path;
  return error;
}

function descriptor(value, name, optional = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError('Expected a plain JavaScript numeric descriptor');
  }
  const property = Object.getOwnPropertyDescriptor(value, name);
  if (!property) {
    if (optional) return undefined;
    throw new TypeError(`Missing JavaScript numeric property ${name}`);
  }
  if (!Object.hasOwn(property, 'value') || !property.enumerable) throw new TypeError(`JavaScript numeric property ${name} must be an enumerable data property`);
  return property.value;
}

function carrierToken(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw coreError('JAVASCRIPT_NUMERIC', 'Expected one numeric carrier');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw coreError('NON_JSON', 'Symbol keys are not JSON-compatible');
  for (const key of keys) {
    const item = Object.getOwnPropertyDescriptor(value, key);
    if (!item || !Object.hasOwn(item, 'value') || !item.enumerable) {
      const path = typeof key === 'string' ? `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}` : '';
      throw coreError('NON_JSON', 'Hidden fields and accessors cannot be serialized faithfully', path);
    }
  }
  if (keys.length !== 1 || !allowed.includes(keys[0])) throw coreError('JAVASCRIPT_NUMERIC', 'Expected one numeric carrier');
  const token = Object.getOwnPropertyDescriptor(value, keys[0]).value;
  if (typeof token !== 'string') throw coreError('JAVASCRIPT_NUMERIC', 'Expected numeric token text');
  return {carrier: keys[0], token};
}

function guardedContextCopy(input) {
  const active = new Set();
  let values = 0;
  function visit(value, path, depth) {
    if (++values > 100_000 || depth > 128) throw coreError('LIMIT', 'JSON structural limit exceeded', path);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        throw coreError('NUMBER', 'Number outside the core interoperable numeric profile', path);
      }
      return value;
    }
    if (typeof value !== 'object') throw coreError('NON_JSON', 'Value is not JSON-compatible', path);
    if (active.has(value)) throw coreError('CYCLE', 'Cyclic value', path);
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw coreError('NON_JSON', 'Custom object prototype', path);
    if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) throw coreError('NON_JSON', 'Symbol keys are not JSON-compatible', path);
    active.add(value);
    const output = array ? [] : Object.create(null);
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (array && key === 'length') continue;
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !property.enumerable || !Object.hasOwn(property, 'value')) {
        throw coreError('NON_JSON', 'Hidden fields and accessors cannot be serialized faithfully', `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`);
      }
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) throw coreError('NON_JSON', 'Non-index array property', path);
      Object.defineProperty(output, key, {value:visit(property.value, `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`, depth + 1), enumerable:true, writable:true, configurable:true});
    }
    if (array && Object.keys(value).length !== value.length) throw coreError('NON_JSON', 'Sparse arrays are not JSON values', path);
    active.delete(value);
    return output;
  }
  return visit(input, '', 0);
}

function contextWire(context) {
  if (context === undefined) return undefined;
  context = guardedContextCopy(context);
  const document = descriptor(context, 'document');
  const field = descriptor(context, 'field');
  for (const key of Reflect.ownKeys(field)) {
    if (typeof key === 'symbol') throw coreError('NON_JSON', 'Symbol keys are not JSON-compatible');
    descriptor(field, key);
    if (key !== 'module' && key !== 'element') {
      const path = `/identity/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      throw coreError('JAVASCRIPT_NUMERIC', JSON.stringify([{code:'CORE_SCHEMA_PROPERTY_UNKNOWN', path, message:`Unknown relevant qualifier: ${key}`, severity:'error'}]));
    }
  }
  const module = descriptor(field, 'module');
  const element = descriptor(field, 'element');
  if (typeof module !== 'string' || typeof element !== 'string') throw new TypeError('Field context requires string module and element identities');
  return {document, field: {module, element}};
}

function run(native, runtime, op, args, context, controls) {
  const controlBridge = controls && Object.keys(controls).length ? createControlBridge(controls) : undefined;
  const invoke = (fn, ...args) => {
    try { return fn(...args, controlBridge); }
    catch (error) {
      throw mapNativeError(error);
    }
  };
  if (!runtime) {
    if (context !== undefined) throw coreError('RUST_NUMERIC_PREPARED_RUNTIME_MISSING', 'Field context requires explicit resources and a retained Rust runtime');
    const response = JSON.parse(native.executeJavascriptNumericWire(encodeRequestWire({profile:JAVASCRIPT_NUMERIC_PROFILE, op, ...args}, controlBridge), controlBridge));
    const failure = resultError(response);
    if (failure) throw coreError(failure.code, failure.message, failure.path);
    return fromWire(JSON.parse(response.wire));
  }
  const stage = invoke(runtime.prepare.bind(runtime), op, encodeWire(args, {work:(amount)=>chargeSerialization(controlBridge, amount)}));
  const takeOutput = stage.takeOutput ?? stage.take_output;
  const validateContext = stage.validateContext ?? stage.validate_context;
  if (context === undefined) return fromWire(JSON.parse(invoke(takeOutput.bind(stage))));
  const wire = invoke(validateContext.bind(stage), encodeWire(contextWire(context), {work:(amount)=>chargeSerialization(controlBridge, amount)}));
  const validation = fromWire(JSON.parse(wire));
  if (!validation.valid || !validation.complete) throw coreError('JAVASCRIPT_NUMERIC', JSON.stringify(validation.diagnostics ?? []));
  return fromWire(JSON.parse(invoke(takeOutput.bind(stage))));
}

/** Create the opt-in CONTRACT-049 numeric adapter over the Rust core. */
export function createJavascriptNumericEngine(native, resources, options = {}) {
  if (typeof native?.executeJavascriptNumericWire !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  const setupControls = options.setupControls;
  const setupBridge = setupControls && Object.keys(setupControls).length ? createControlBridge(setupControls) : undefined;
  let runtime;
  if (resources !== undefined) {
    try {
      runtime = new native.JavascriptNumericRuntime(
        encodeWire(resources, {work:(amount)=>chargeSerialization(setupBridge, amount)}), setupBridge,
      );
    } catch (error) { throw mapNativeError(error); }
  }
  const controls = options.controls;
  const invoke = (op, args, context) => run(native, runtime, op, args, context, controls);
  return Object.freeze({
    exactDecimal(token, context) {
      if (typeof token !== 'string') throw coreError('JAVASCRIPT_NUMERIC', 'Expected exact JSON numeric token');
      return invoke('exactDecimal', {token}, context);
    },
    integerFromBigInt(value, context) {
      if (typeof value !== 'bigint') throw coreError('JAVASCRIPT_NUMERIC', 'Expected bigint');
      return invoke('integerFromBigInt', {token: value.toString()}, context);
    },
    integerToBigInt(literal, context) {
      const {carrier} = carrierToken(literal, ['integerToken', 'decimalToken']);
      if (carrier !== 'integerToken') throw coreError('JAVASCRIPT_NUMERIC', 'Expected integerToken');
      return BigInt(invoke('integerToBigInt', {literal}, context));
    },
    admitJavascriptNumber(value, scalarType, context) {
      if (typeof value !== 'number') throw coreError('JAVASCRIPT_NUMERIC', 'Expected finite number without negative zero');
      if (!Number.isFinite(value) || Object.is(value, -0)) throw coreError('JAVASCRIPT_NUMERIC', 'Expected finite number without negative zero');
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, value, false);
      const numberBits = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return invoke('admitJavascriptNumber', {numberBits, scalarType}, context);
    },
    numericToNumberLossless(literal, context) {
      carrierToken(literal, ['integerToken', 'decimalToken']);
      return invoke('numericToNumberLossless', {literal}, context);
    },
  });
}

function createControlBridge(controls) {
  let charged = 0;
  return (amount) => {
    charged += amount;
    if (controls.maxWork !== undefined && charged > controls.maxWork) return encodeRequestWire({ok:false, code:'RESOURCE_LIMIT', message:'Host work budget exceeded'});
    try {
      controls.meter?.(amount);
      if (controls.isCancelled?.()) return encodeRequestWire({ok:false, code:'CANCELLED', message:'Operation cancelled by host'});
      if (controls.deadlineMs !== undefined) {
        const now = controls.now?.();
        if (typeof now !== 'number' || !Number.isFinite(now)) return encodeRequestWire({ok:false, code:'CLOCK_CAPABILITY_REQUIRED', message:'Host clock did not return a finite millisecond value'});
        if (now > controls.deadlineMs) return encodeRequestWire({ok:false, code:'DEADLINE', message:'Deadline elapsed'});
      }
    } catch { return encodeRequestWire({ok:false, code:'HOST_CONTROL', message:'Host control callback failed'}); }
    return '';
  };
}

function chargeSerialization(controlBridge, amount) {
  if (!controlBridge) return;
  const response = controlBridge(amount);
  if (!response) return;
  try {
    const failure = resultError(JSON.parse(response));
    if (failure) throw coreError(failure.code, failure.message, failure.path);
  } catch (error) {
    if (error?.code) throw error;
  }
  throw coreError('HOST_CONTROL', 'Host serialization control failed');
}

function mapNativeError(error) {
  let response;
  try { response = JSON.parse(typeof error === 'string' ? error : error?.message ?? ''); } catch {}
  const failure = response && resultError(response);
  if (failure) return coreError(failure.code, failure.message, failure.path);
  return error;
}
