use js_sys::{Array, Function, Object, Reflect, TypeError};
use umf_core::{serialization::{read_typescript_json_value, Format}, Context, Utf16, Value};
use wasm_bindgen::{prelude::*, JsCast};

/// Rust-owned raw-host admission and parse route. The callback performs only
/// the host's `text.length > 100_000` expression, preserving engine TypeErrors,
/// getters, Proxy traps and thrown-value identity across the wasm boundary.
#[wasm_bindgen(js_name = readJsonValueRawPrototype)]
pub fn read_json_value_raw_prototype(
    source: JsValue,
    format: JsValue,
    over_limit: &Function,
    read_length: &Function,
) -> Result<JsValue, JsValue> {
    let length_arg = source.clone();
    let too_long = over_limit.call1(&JsValue::UNDEFINED, &length_arg)?;
    if too_long.as_bool() == Some(true) {
        return Err(TypeError::new("Source text exceeds limit").into());
    }

    // This duplicate host read matches the current parser's first `length`
    // observation before its non-string TypeError.
    let _parser_length = read_length.call1(&JsValue::UNDEFINED, &source)?;
    let Some(text) = source.as_string() else {
        return Err(TypeError::new("source is not a string").into());
    };
    let selected_format = if format.as_string().as_deref() == Some("json") {
        Format::Json
    } else {
        Format::Yaml
    };
    let text = Utf16::from(text);
    let mut context = Context::ordinary();
    let value = read_typescript_json_value(text.units(), Some(selected_format), &mut context)
        .map_err(|error| -> JsValue { TypeError::new(&error.message.to_utf8().unwrap_or_default()).into() })?;
    value_to_js(value)
}

fn value_to_js(value: Value) -> Result<JsValue, JsValue> {
    match value {
        Value::Null => Ok(JsValue::NULL),
        Value::Bool(value) => Ok(JsValue::from_bool(value)),
        Value::Number(value) => Ok(JsValue::from_f64(value)),
        Value::String(value) => value.to_utf8().map(|s| JsValue::from_str(&s)).map_err(|_| TypeError::new("Invalid UTF-16 result").into()),
        Value::Array(values) => {
            let output = Array::new();
            for value in values { output.push(&value_to_js(value)?); }
            Ok(output.into())
        }
        Value::Object(values) => {
            let null: Object = JsValue::NULL.unchecked_into();
            let output = Object::create(&null);
            for (key, value) in values {
                let key = key.to_utf8().map_err(|_| TypeError::new("Invalid UTF-16 key"))?;
                Reflect::set(&output, &JsValue::from_str(&key), &value_to_js(value)?)?;
            }
            Ok(output.into())
        }
    }
}
