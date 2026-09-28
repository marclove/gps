//! Makes the rank keys that put rows in order.
//!
//! This module is the only place that makes rank keys. A rank key is lowercase
//! hexadecimal text. Compare two keys byte by byte, as `SQLite` and Rust compare
//! text, to get their order. There is always a new key between two different
//! keys, so a row can move without a change to the keys of other rows.

use std::fmt;

use fractional_index::FractionalIndex;

/// Tells why [`between`] cannot make a key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The key is not a valid rank key.
    Invalid(String),
    /// The bounds are equal, or `before` sorts after `after`.
    OutOfOrder {
        /// The key that must sort before the new key.
        before: String,
        /// The key that must sort after the new key.
        after: String,
    },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(key) => write!(f, "{key:?} is not a valid rank key"),
            Self::OutOfOrder { before, after } => {
                write!(f, "no rank key sorts after {before:?} and before {after:?}")
            }
        }
    }
}

impl std::error::Error for Error {}

/// Makes a rank key that sorts after `before` and before `after`.
///
/// `None` means that there is no bound on that side. Without bounds, the
/// result is the default key.
///
/// Returns [`Error::Invalid`] when a bound is not a valid rank key, and
/// [`Error::OutOfOrder`] when the bounds are equal or reversed.
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "initiatives use it from the rank task on")
)]
pub fn between(before: Option<&str>, after: Option<&str>) -> Result<String, Error> {
    let lower = before.map(parse).transpose()?;
    let upper = after.map(parse).transpose()?;
    FractionalIndex::new(lower.as_ref(), upper.as_ref())
        .map(|key| key.to_string())
        .ok_or_else(|| Error::OutOfOrder {
            before: before.unwrap_or_default().to_owned(),
            after: after.unwrap_or_default().to_owned(),
        })
}

/// Reads a rank key. The crate ignores a last odd character and can panic on
/// text that is not ASCII, so the text must first be pairs of lowercase
/// hexadecimal digits.
fn parse(key: &str) -> Result<FractionalIndex, Error> {
    let is_hex_pairs =
        key.len().is_multiple_of(2) && key.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    is_hex_pairs
        .then(|| FractionalIndex::from_string(key).ok())
        .flatten()
        .ok_or_else(|| Error::Invalid(key.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(before: Option<&str>, after: Option<&str>) -> String {
        between(before, after).expect("a key between valid bounds")
    }

    #[test]
    fn between_without_bounds_gives_a_key() {
        let k = key(None, None);
        assert!(!k.is_empty());
        assert!(k.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')), "{k}");
    }

    #[test]
    fn between_respects_each_bound() {
        let k = key(None, None);
        let later = key(Some(&k), None);
        let earlier = key(None, Some(&k));
        assert!(later > k, "{later} > {k}");
        assert!(earlier < k, "{earlier} < {k}");

        let (a, b) = (earlier, later);
        assert!(a < b);
        let middle = key(Some(&a), Some(&b));
        assert!(a < middle && middle < b, "{a} < {middle} < {b}");
    }

    #[test]
    fn appending_200_keys_keeps_them_in_order() {
        let mut last = key(None, None);
        for _ in 0..200 {
            let next = key(Some(&last), None);
            assert!(next > last, "{next} > {last}");
            last = next;
        }
    }

    #[test]
    fn dropping_200_times_into_one_gap_keeps_order_and_no_repeats() {
        let a = key(None, None);
        let mut b = key(Some(&a), None);
        let mut seen = std::collections::HashSet::new();
        for _ in 0..200 {
            let c = key(Some(&a), Some(&b));
            assert!(a < c && c < b, "{a} < {c} < {b}");
            assert!(seen.insert(c.clone()), "repeated key {c}");
            b = c;
        }
    }

    #[test]
    fn invalid_keys_and_bounds_out_of_order_are_errors() {
        let invalid = between(Some("xyz"), None).unwrap_err();
        assert!(matches!(invalid, Error::Invalid(_)), "{invalid:?}");
        assert!(invalid.to_string().contains("xyz"), "{invalid}");
        for bad in ["", "8", "801", "zz", "8A80", "a\u{e9}80"] {
            assert!(
                matches!(between(None, Some(bad)), Err(Error::Invalid(_))),
                "{bad:?} must be invalid"
            );
        }

        let k = key(None, None);
        let equal = between(Some(&k), Some(&k)).unwrap_err();
        assert!(matches!(equal, Error::OutOfOrder { .. }), "{equal:?}");
        assert!(equal.to_string().contains(&k), "{equal}");

        let later = key(Some(&k), None);
        let reversed = between(Some(&later), Some(&k)).unwrap_err();
        assert!(matches!(reversed, Error::OutOfOrder { .. }), "{reversed:?}");
        assert!(reversed.to_string().contains(&later), "{reversed}");
        assert!(reversed.to_string().contains(&k), "{reversed}");
    }
}
