// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure bounded reciprocal-rank fusion scoring.
use crate::{Context, EngineError, Utf16};
use num_bigint::BigUint;
use num_traits::ToPrimitive;

pub fn score(
    constant: &str,
    key_order: &[usize],
    legs: &[Vec<usize>],
    top_k: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<(usize, f64)>, EngineError> {
    if constant.len() > 4096 || constant.is_empty() || !constant.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(err("REQUEST", "constant must be a bounded decimal integer"));
    }
    let base = BigUint::parse_bytes(constant.as_bytes(), 10)
        .ok_or_else(|| err("REQUEST", "constant must be a decimal integer"))?;
    if base == BigUint::from(0u8) {
        return Err(err("REQUEST", "constant must be positive"));
    }
    let n = key_order.len();
    if n > 10_000 || top_k > 10_000 {
        return Err(err("RRF_LIMIT", "RRF identity or topK bound exceeded"));
    }
    let mut seen_order = vec![false; n];
    let mut tie_rank = vec![usize::MAX; n];
    for (position, &id) in key_order.iter().enumerate() {
        if id >= n || seen_order[id] {
            return Err(err("REQUEST", "keyOrder must be a permutation"));
        }
        seen_order[id] = true;
        tie_rank[id] = position;
    }
    let mut sums = vec![0.0f64; n];
    let mut observed = vec![false; n];
    let mut count = 0usize;
    for leg in legs {
        let mut seen = vec![false; n];
        for (i, &id) in leg.iter().enumerate() {
            count += 1;
            if count > 10_000 {
                return Err(err("RRF_LIMIT", "RRF observation bound exceeded"));
            }
            ctx.charge_work(1, Utf16::default())?;
            if id >= n || seen[id] {
                return Err(err("REQUEST", "leg identities must be unique and in range"));
            }
            seen[id] = true;
            observed[id] = true;
            let denominator = &base + BigUint::from(i + 1);
            let d = denominator
                .to_f64()
                .ok_or_else(|| err("RRF_CONSTANT_OVERFLOW", "int too large to convert to float"))?;
            if !d.is_finite() {
                return Err(err(
                    "RRF_CONSTANT_OVERFLOW",
                    "int too large to convert to float",
                ));
            }
            sums[id] += 1.0 / d;
        }
    }
    if observed.iter().any(|v| !v) {
        return Err(err(
            "REQUEST",
            "keyCount must equal the distinct observed identity count",
        ));
    }
    ctx.charge_work(n, Utf16::default())?;
    let mut ids: Vec<usize> = (0..n).collect();
    ids.sort_by(|a, b| {
        sums[*b]
            .total_cmp(&sums[*a])
            .then_with(|| tie_rank[*a].cmp(&tie_rank[*b]))
    });
    ids.truncate(top_k);
    Ok(ids.into_iter().map(|id| (id, sums[id])).collect())
}
fn err(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adds_rank_before_binary64_conversion() {
        let out = score(
            "9007199254740993",
            &[0, 1],
            &[vec![0, 1]],
            2,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(out[1].1.to_bits(), (1.0 / 9007199254740996f64).to_bits());
    }
    #[test]
    fn huge_constant_without_observations_does_not_overflow() {
        assert!(
            score(&"9".repeat(401), &[], &[], 10, &mut Context::ordinary())
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn charges_sort_work_after_observations() {
        let mut charges = Vec::new();
        let mut meter = |amount| {
            charges.push(amount);
            Ok(())
        };
        score(
            "2",
            &[0, 1],
            &[vec![0, 1]],
            2,
            &mut Context::ordinary().with_host_control(&mut meter),
        )
        .unwrap();
        assert_eq!(charges, vec![1, 1, 2]);
    }
}
