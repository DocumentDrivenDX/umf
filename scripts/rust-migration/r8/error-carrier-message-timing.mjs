import assert from 'node:assert/strict';

const capturedError = Error;
const sentinel = { tag: 'message getter throw' };
const trace = [];
Object.defineProperty(Error.prototype, 'message', {
  configurable: true,
  get() {
    trace.push({ stage: 'read', receiverIsCarrier: this instanceof capturedError, hasOwnMessage: Object.hasOwn(this, 'message') });
    throw sentinel;
  },
});

try {
  // This is the host primitive's construction stage for stringify(undefined).
  const carrier = new capturedError(undefined);
  assert.deepEqual(trace, []);
  assert.equal(Object.hasOwn(carrier, 'message'), false);

  let thrown;
  try {
    // The later ordinary property read is a separate stage.
    void carrier.message;
  } catch (error) {
    thrown = error;
  }
  assert.equal(thrown, sentinel);
  assert.deepEqual(trace, [{ stage: 'read', receiverIsCarrier: true, hasOwnMessage: false }]);
} finally {
  delete Error.prototype.message;
}

console.log(JSON.stringify({ constructionReadsMessage: false, laterReadPreservesThrowIdentity: true, trace }));
