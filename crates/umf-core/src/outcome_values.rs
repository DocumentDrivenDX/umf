//! Narrow cryptographic primitives for authenticated table outcome values.
//!
//! Python retains domain construction and stage ordering. This module only
//! hashes caller-supplied bytes and compares fixed-width signature values.

use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub const PROFILE_VERSION: &str = "umf-r6-outcome-crypto/0.1.0";
pub const CAPABILITIES: &[&str] = &["hmac_sha256", "slot_sha256", "signature_matches"];

/// HMAC-SHA256 over the exact preimage prepared by the Python owner.
pub fn hmac_sha256(secret: &[u8], message: &[u8]) -> [u8; 32] {
    crate::operation_values::hmac_sha256(secret, message)
}

/// SHA-256 for an already-canonical slot preimage.
pub fn slot_sha256(message: &[u8]) -> [u8; 32] {
    Sha256::digest(message).into()
}

/// Compare two already-validated, fixed-width signatures without early exit.
pub fn signature_matches(left: &[u8; 32], right: &[u8; 32]) -> bool {
    bool::from(left.ct_eq(right))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[test]
    fn rfc_4231_hmac_sha256_vectors() {
        assert_eq!(
            hex(&hmac_sha256(&[0x0b; 20], b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        assert_eq!(
            hex(&hmac_sha256(b"Jefe", b"what do ya want for nothing?")),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        assert_eq!(
            hex(&hmac_sha256(&[0xaa; 20], &[0xdd; 50])),
            "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe"
        );
        let key = (1u8..=25).collect::<Vec<_>>();
        assert_eq!(
            hex(&hmac_sha256(&key, &[0xcd; 50])),
            "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b"
        );
        assert_eq!(
            hex(&hmac_sha256(
                &[0xaa; 131],
                b"Test Using Larger Than Block-Size Key - Hash Key First"
            )),
            "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54"
        );
    }

    #[test]
    fn hmac_empty_and_block_boundary_vectors() {
        assert_eq!(
            hex(&hmac_sha256(b"", b"")),
            "b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad"
        );
        let key = (0u8..64).collect::<Vec<_>>();
        for (length, expected) in [
            (
                55,
                "9b5169bed02434ee54cff1147388169500f7242400ec15761a0d29a2ebed4091",
            ),
            (
                56,
                "d7935e7c5fbbf3127caea658f45d6ad19ba98c6d0d746f6152c173a5bdd2d3bd",
            ),
            (
                64,
                "91e19c4e9b780eb4653d8005d05f78cc96cf19a9a6264e19abbe87601cb71a17",
            ),
        ] {
            assert_eq!(hex(&hmac_sha256(&key, &vec![b'a'; length])), expected);
        }
        assert_eq!(
            hex(&hmac_sha256(&[b'k'; 65], b"")),
            "41f1c4cc3107cd5b8d92460f61032902bfdb06484eef17e861b83a5012d3b7f3"
        );
        assert_eq!(
            hex(&hmac_sha256(
                &(0u8..=130).collect::<Vec<_>>(),
                &vec![b'a'; 129]
            )),
            "7c8b13b0600c03dfad71e31fc2883e5cb52c2042484f8eca8edfb3898c47b4c2"
        );
    }

    #[test]
    fn slot_sha256_vector() {
        assert_eq!(
            slot_sha256(b"abc"),
            [
                0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
                0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
                0xf2, 0x00, 0x15, 0xad,
            ]
        );
    }

    #[test]
    fn fixed_width_signature_comparison() {
        let left = [0x5a; 32];
        assert!(signature_matches(&left, &left));
        for position in [0, 15, 31] {
            let mut mismatch = left;
            mismatch[position] ^= 1;
            assert!(!signature_matches(&left, &mismatch), "position {position}");
        }
    }
}
