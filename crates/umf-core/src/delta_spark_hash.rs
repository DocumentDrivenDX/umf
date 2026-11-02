// SPDX-License-Identifier: MIT OR Apache-2.0
//! Spark 4.0.1 legacy Murmur3 hashing for Delta multipart checkpoint names.
//!
//! This is only the scalar string hash used by the multipart adapter. It does
//! not validate checkpoint metadata or establish Delta snapshot equivalence.

/// Hash a nullable UTF-8 string using Spark's legacy Murmur3 implementation.
/// Null values return the seed unchanged. JavaScript strings with unpaired
/// UTF-16 surrogates cannot be represented by Rust `str` and are therefore
/// outside this function's input domain.
pub fn spark_string_hash(value: Option<&str>, seed: i32) -> i32 {
    let Some(value) = value else { return seed };
    let bytes = value.as_bytes();
    let mut hash = seed as u32;
    let mut chunks = bytes.chunks_exact(4);
    for chunk in &mut chunks {
        let word = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        hash = step(hash, word);
    }
    let tail = chunks.remainder();
    // The TypeScript predecessor and Spark's UTF8String implementation feed
    // every remaining byte separately, sign extending it to an i32.
    for byte in tail {
        hash = step(hash, *byte as i8 as i32 as u32);
    }
    hash ^= bytes.len() as u32;
    hash ^= hash >> 16;
    hash = hash.wrapping_mul(0x85ebca6b);
    hash ^= hash >> 13;
    hash = hash.wrapping_mul(0xc2b2ae35);
    (hash ^ (hash >> 16)) as i32
}

fn step(hash: u32, word: u32) -> u32 {
    let mixed = word.wrapping_mul(0xcc9e2d51).rotate_left(15).wrapping_mul(0x1b873593);
    (hash ^ mixed).rotate_left(13).wrapping_mul(5).wrapping_add(0xe6546b64)
}

#[cfg(test)]
mod tests {
    use super::spark_string_hash;

    // These vectors were frozen from the TypeScript predecessor's operation
    // corpus and independently recorded against Spark 4.0.1.
    #[test]
    fn spark_legacy_vectors() {
        for (value, seed, expected) in [
            (None, 42, 42),
            (None, -12345, -12345),
            (Some(""), 42, 142593372),
            (Some(""), -12345, -413722947),
            (Some("a"), 42, 1485273170),
            (Some("a"), -12345, 1371281559),
            (Some("ab"), 42, -97053317),
            (Some("ab"), -12345, 343097860),
            (Some("abc"), 42, 1322437556),
            (Some("abc"), -12345, 1641882836),
            (Some("abcd"), 42, -396302900),
            (Some("abcd"), -12345, -808320570),
            (Some("abcde"), 42, 814637928),
            (Some("abcde"), -12345, -368327786),
            (Some("é"), 42, 2119106806),
            (Some("é"), -12345, -61313194),
            (Some("中文"), 42, -1261019299),
            (Some("中文"), -12345, 851233592),
            (Some("🙂"), 42, -1519007075),
            (Some("🙂"), -12345, 1798060786),
            (Some("a.parquet"), 42, -1576595922),
            (Some("a.parquet"), -12345, -44943223),
            (Some("b.parquet"), 42, -748123555),
            (Some("b.parquet"), -12345, 715627711),
            (Some("uabc@7"), 42, 676890345),
            (Some("uabc@7"), -12345, -1661090234),
        ] {
            assert_eq!(spark_string_hash(value, seed), expected, "{value:?}");
        }
    }

    #[test]
    fn null_and_explicit_seed_are_preserved() {
        assert_eq!(spark_string_hash(None, -12345), -12345);
        assert_eq!(spark_string_hash(Some("a"), -12345), 1371281559);
    }
}
