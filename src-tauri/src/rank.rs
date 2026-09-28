//! Makes the rank keys that put rows in order.
//!
//! This module is the only place that makes rank keys. A rank key is text made
//! only of the lowercase hexadecimal digits `0123456789abcdef`. It is never
//! empty, and its last digit is never `0`. Compare two keys byte by byte, as
//! `SQLite` and Rust compare text, to get their order. Read a key as the digits
//! of a fraction after the point: a new key between two keys is a value
//! between the two fractions.
//!
//! The last digit is never `0` so that there is always room before a key. If
//! `40` were a key, no key could sort between `4` and `40`.

use std::fmt;

/// The digits of a key, in sort order.
const DIGITS: &[u8; 16] = b"0123456789abcdef";

/// The key that [`between`] gives without bounds.
const FIRST: &str = "8";

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
/// result is `"8"`.
///
/// Returns [`Error::Invalid`] when a bound is not a valid rank key, and
/// [`Error::OutOfOrder`] when the bounds are equal or reversed.
pub fn between(before: Option<&str>, after: Option<&str>) -> Result<String, Error> {
    let lower = before.map(validate).transpose()?;
    let upper = after.map(validate).transpose()?;
    let out_of_order = || Error::OutOfOrder {
        before: before.unwrap_or_default().to_owned(),
        after: after.unwrap_or_default().to_owned(),
    };
    let key = match (lower, upper) {
        (None, None) => FIRST.to_owned(),
        (Some(a), Some(b)) if a >= b => return Err(out_of_order()),
        (a, b) => {
            let mut key = String::new();
            midpoint(
                a.unwrap_or_default().as_bytes(),
                b.map(str::as_bytes),
                &mut key,
            );
            key
        }
    };
    let above_lower = lower.is_none_or(|a| a < key.as_str());
    let below_upper = upper.is_none_or(|b| key.as_str() < b);
    if above_lower && below_upper {
        Ok(key)
    } else {
        Err(out_of_order())
    }
}

/// Returns the key when it is valid: not empty, only lowercase hexadecimal
/// digits, and a last digit that is not `0`.
fn validate(key: &str) -> Result<&str, Error> {
    let valid =
        key.bytes().all(|b| DIGITS.contains(&b)) && key.bytes().last().is_some_and(|b| b != b'0');
    if valid {
        Ok(key)
    } else {
        Err(Error::Invalid(key.to_owned()))
    }
}

/// Returns the value of one digit of a key.
fn value(digit: u8) -> usize {
    DIGITS
        .iter()
        .position(|&d| d == digit)
        .expect("a validated key has only hexadecimal digits")
}

/// Adds to `out` the digits of a key that sorts after `a` and before `b`.
///
/// `a` is a valid key or empty, which means the start of the range. `b` is a
/// valid key, or `None`, which means the end of the range. `a` must sort
/// before `b`.
fn midpoint(a: &[u8], b: Option<&[u8]>, out: &mut String) {
    if let Some(b) = b {
        let shared = b
            .iter()
            .enumerate()
            .take_while(|&(i, &digit)| a.get(i).copied().unwrap_or(b'0') == digit)
            .count();
        if shared > 0 {
            out.extend(b[..shared].iter().map(|&d| char::from(d)));
            midpoint(a.get(shared..).unwrap_or_default(), Some(&b[shared..]), out);
            return;
        }
    }
    let low = a.first().map_or(0, |&d| value(d));
    let high = b.map_or(DIGITS.len(), |b| value(b[0]));
    if high - low > 1 {
        out.push(char::from(DIGITS[low.midpoint(high)]));
    } else if let Some(b) = b.filter(|b| b.len() > 1) {
        out.push(char::from(b[0]));
    } else {
        out.push(char::from(DIGITS[low]));
        midpoint(a.get(1..).unwrap_or_default(), None, out);
    }
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
        assert_eq!(k, "8");
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
        for bad in ["", "80", "8a0", "zz", "8A", "a\u{e9}8"] {
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

    #[test]
    fn prepending_200_keys_then_dropping_between_each_adjacent_pair() {
        let mut keys = vec![key(None, None)];
        for _ in 0..200 {
            let first = key(None, Some(&keys[0]));
            assert!(first < keys[0], "{first} < {}", keys[0]);
            keys.insert(0, first);
        }
        for pair in keys.windows(2) {
            let (x, y) = (&pair[0], &pair[1]);
            let middle = key(Some(x), Some(y));
            assert!(x < &middle && &middle < y, "{x} < {middle} < {y}");
        }
    }

    #[test]
    fn many_random_inserts_stay_sorted_and_unique() {
        let mut state: u64 = 0x2545_f491_4f6c_dd1d;
        let mut next = move || {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            state >> 33
        };
        let mut keys: Vec<String> = Vec::new();
        for _ in 0..3000 {
            let index = usize::try_from(next()).unwrap() % (keys.len() + 1);
            let before = index.checked_sub(1).map(|i| keys[i].as_str());
            let after = keys.get(index).map(String::as_str);
            let new = key(before, after);
            keys.insert(index, new);
        }
        for pair in keys.windows(2) {
            assert!(pair[0] < pair[1], "{} < {}", pair[0], pair[1]);
        }
        assert!(keys.iter().all(|k| validate(k).is_ok()));
    }
}
