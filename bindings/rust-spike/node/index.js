// Host-only callback and UTF-16 conversion glue. All UMF operations execute in the Rust addon.
const addon = require('./umf_rust_spike_node.node');

function run(requestJson) {
  return addon.run(requestJson);
}

function run_with_validator(requestJson, callback) {
  return run_with_control(requestJson, () => false, callback);
}

function run_with_control(requestJson, shouldCancel, validator) {
  let cancelError;
  let validatorError;
  try {
    return addon.runWithControl(
      requestJson,
      () => {
        try { return shouldCancel ? shouldCancel() : false; }
        catch (error) { cancelError = error; throw error; }
      },
      validator
        ? (sourceText) => {
            try { return validator(sourceText); }
            catch (error) { validatorError = error; throw error; }
          }
        : undefined,
    );
  } catch (error) {
    if (cancelError !== undefined) throw cancelError;
    if (validatorError !== undefined) throw validatorError;
    throw error;
  }
}

module.exports = { run, run_with_validator, run_with_control, engine_version: addon.engineVersion };
