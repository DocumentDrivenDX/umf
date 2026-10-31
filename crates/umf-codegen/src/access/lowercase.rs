// SPDX-License-Identifier: MIT OR Apache-2.0
//! Retained Bun1.4.3 / Unicode17 default lowercase, independent of host case tables.
use umf_core::{Context, EngineError, Utf16};
include!("unicode_lowercase_data.rs");

fn in_ranges(cp: u32, ranges: &[(u32, u32)], ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    // Fixed trusted tables have fewer than512 intervals; reserve the complete
    // binary-search bound before comparing, with no copied strings.
    ctx.charge_work(12, Utf16::default())?;
    let index = ranges.partition_point(|(_, end)| *end < cp);
    Ok(ranges.get(index).is_some_and(|(start, _)| *start <= cp))
}

pub(super) fn lowercase(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(
        value.len().saturating_mul(3).saturating_add(1),
        Utf16::default(),
    )?;
    let mut scalars = Vec::with_capacity(value.len());
    let mut i = 0;
    while i < value.len() {
        ctx.charge_work(1, Utf16::default())?;
        let first = value.units()[i];
        if (0xd800..=0xdbff).contains(&first)
            && value
                .units()
                .get(i + 1)
                .is_some_and(|last| (0xdc00..=0xdfff).contains(last))
        {
            scalars.push(
                0x10000
                    + ((u32::from(first) - 0xd800) << 10)
                    + (u32::from(value.units()[i + 1]) - 0xdc00),
            );
            i += 2;
        } else {
            // Unpaired code units retain identity and break casing context.
            scalars.push(u32::from(first));
            i += 1;
        }
    }
    ctx.charge_work(scalars.len().saturating_add(1), Utf16::default())?;
    let mut final_sigma = Vec::with_capacity(scalars.len());
    let mut previous_cased = false;
    for &cp in &scalars {
        ctx.charge_work(1, Utf16::default())?;
        final_sigma.push(previous_cased);
        if !in_ranges(cp, CASE_IGNORABLE_RANGES, ctx)? {
            previous_cased = in_ranges(cp, CASED_RANGES, ctx)?;
        }
    }
    let mut following_cased = false;
    for index in (0..scalars.len()).rev() {
        ctx.charge_work(1, Utf16::default())?;
        let cp = scalars[index];
        final_sigma[index] = cp == 0x03a3 && final_sigma[index] && !following_cased;
        if !in_ranges(cp, CASE_IGNORABLE_RANGES, ctx)? {
            following_cased = in_ranges(cp, CASED_RANGES, ctx)?;
        }
    }
    // Captured default lowercase expands at most two UTF16 units per input unit.
    ctx.charge_work(
        value.len().saturating_mul(2).saturating_add(1),
        Utf16::default(),
    )?;
    let mut result = Vec::with_capacity(value.len().saturating_mul(2));
    for (index, &cp) in scalars.iter().enumerate() {
        ctx.charge_work(16, Utf16::default())?;
        if final_sigma[index] {
            result.push(0x03c2);
        } else if let Ok(index) =
            LOWERCASE_MAPPINGS.binary_search_by_key(&cp, |(source, _)| *source)
        {
            result.extend_from_slice(LOWERCASE_MAPPINGS[index].1);
        } else if cp <= 0xffff {
            result.push(cp as u16);
        } else {
            let n = cp - 0x10000;
            result.push(0xd800 + (n >> 10) as u16);
            result.push(0xdc00 + (n & 0x3ff) as u16);
        }
    }
    Ok(Utf16::new(result))
}

#[cfg(test)]
mod tests {
    use super::*;
    use umf_core::{
        serialization::{read_json_value, Format},
        Value,
    };
    fn get<'a>(value: &'a Value, name: &str) -> &'a Value {
        let Value::Object(items) = value else {
            panic!("object")
        };
        &items
            .iter()
            .find(|(key, _)| key == &Utf16::from(name))
            .unwrap()
            .1
    }
    fn units(value: &Value) -> Utf16 {
        let Value::Array(items) = value else {
            panic!("array")
        };
        Utf16::new(
            items
                .iter()
                .map(|value| {
                    let Value::Number(value) = value else {
                        panic!("number")
                    };
                    *value as u16
                })
                .collect(),
        )
    }
    #[test]
    fn captured_scalar_mapping_and_all_property_boundary_contexts_match_retained_bun() {
        let input=include_str!("../../../..//tests/rust-core/fixtures/r3/unicode-lowercase/source-data.json");
        let data = read_json_value(
            &input.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::catalog(),
        )
        .unwrap();
        let Value::Array(contexts) = get(&data, "contexts") else {
            panic!("contexts")
        };
        for (index, case) in contexts.iter().enumerate() {
            assert_eq!(
                lowercase(&units(get(case, "input")), &mut Context::ordinary()).unwrap(),
                units(get(case, "expected")),
                "context{index}"
            );
        }
        let mut ctx = Context::ordinary();
        for cp in 0..=0x10ffffu32 {
            let input = if cp <= 0xffff {
                Utf16::new(vec![cp as u16])
            } else {
                let n = cp - 0x10000;
                Utf16::new(vec![0xd800 + (n >> 10) as u16, 0xdc00 + (n & 0x3ff) as u16])
            };
            let expected = LOWERCASE_MAPPINGS
                .binary_search_by_key(&cp, |(source, _)| *source)
                .ok()
                .map(|index| Utf16::new(LOWERCASE_MAPPINGS[index].1.to_vec()))
                .unwrap_or_else(|| input.clone());
            assert_eq!(
                lowercase(&input, &mut ctx).unwrap(),
                expected,
                "scalar{cp:x}"
            );
        }
    }
    #[test]
    fn contextual_scans_preserve_late_terminal_host_origin() {
        let input = Utf16::from("AΣ\u{301}".repeat(128));
        let mut baseline = Context::ordinary();
        lowercase(&input, &mut baseline).unwrap();
        let stop = baseline.charged_work() * 3 / 4;
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut charged = 0u64;
            let mut meter = |amount: usize| {
                charged += amount as u64;
                if charged > stop {
                    Err(EngineError::new(
                        code,
                        Utf16::from("/host/lowercase"),
                        "late casing control",
                    ))
                } else {
                    Ok(())
                }
            };
            let error =
                lowercase(&input, &mut Context::ordinary().with_meter(&mut meter)).unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host/lowercase"));
        }
    }
}
