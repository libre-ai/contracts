//! Independent authority-vector oracle only; no producer, registry or signing key.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use curve25519_dalek::{
    constants::{ED25519_BASEPOINT_POINT, EIGHT_TORSION},
    edwards::CompressedEdwardsY,
    traits::IsIdentity,
};
use ed25519_dalek::{Signature, VerifyingKey};
use serde_json::{json, Value};
use std::{env, fs};

fn admissible(bytes: &[u8]) -> bool {
    let Ok(array) = <[u8; 32]>::try_from(bytes) else {
        return false;
    };
    let Some(point) = CompressedEdwardsY(array).decompress() else {
        return false;
    };
    point.compress().to_bytes() == array && !point.is_identity() && point.is_torsion_free()
}

fn strict_verify(public: &[u8], message: &[u8], signature: &[u8]) -> bool {
    let Some(r) = signature.get(..32) else {
        return false;
    };
    if !admissible(public) || !admissible(r) {
        return false;
    }
    let Ok(array) = <[u8; 32]>::try_from(public) else {
        return false;
    };
    let Ok(key) = VerifyingKey::from_bytes(&array) else {
        return false;
    };
    let Ok(signature) = Signature::from_slice(signature) else {
        return false;
    };
    key.verify_strict(message, &signature).is_ok()
}

fn field(value: &Value, name: &str) -> Result<Vec<u8>, &'static str> {
    let encoded = value.get(name).and_then(Value::as_str).ok_or("field")?;
    let decoded = URL_SAFE_NO_PAD.decode(encoded).map_err(|_| "encoding")?;
    if URL_SAFE_NO_PAD.encode(&decoded) != encoded {
        return Err("encoding");
    }
    Ok(decoded)
}

fn run() -> Result<(), &'static str> {
    let arg = env::args().nth(1).ok_or("argument")?;
    if arg == "--points" {
        let mut cases = Vec::new();
        cases.push(json!({"id":"base-point", "point":URL_SAFE_NO_PAD.encode(ED25519_BASEPOINT_POINT.compress().to_bytes()), "admissible":true}));
        for (index, torsion) in EIGHT_TORSION.iter().enumerate() {
            cases.push(json!({"id":format!("torsion-{index}"), "point":URL_SAFE_NO_PAD.encode(torsion.compress().to_bytes()), "admissible":false}));
            if index != 0 {
                let mixed = ED25519_BASEPOINT_POINT + torsion;
                cases.push(json!({"id":format!("mixed-order-{index}"), "point":URL_SAFE_NO_PAD.encode(mixed.compress().to_bytes()), "admissible":false}));
            }
        }
        println!(
            "{}",
            serde_json::to_string_pretty(&cases).map_err(|_| "output")?
        );
        return Ok(());
    }
    let bytes = fs::read(arg).map_err(|_| "input")?;
    if bytes.len() > 1024 * 1024 {
        return Err("input-size");
    }
    let document: Value = serde_json::from_slice(&bytes).map_err(|_| "json")?;
    if document.get("schemaVersion").and_then(Value::as_str)
        != Some("libre-ai.build-brief-strict-ed25519-vectors.v2")
    {
        return Err("version");
    }
    let points = document
        .get("points")
        .and_then(Value::as_array)
        .ok_or("points")?;
    let signatures = document
        .get("signatures")
        .and_then(Value::as_array)
        .ok_or("signatures")?;
    if points.is_empty() || signatures.is_empty() {
        return Err("empty-inventory");
    }
    for point in points {
        let expected = point
            .get("admissible")
            .and_then(Value::as_bool)
            .ok_or("expected")?;
        if admissible(&field(point, "point")?) != expected {
            return Err("point-verdict");
        }
    }
    for signature in signatures {
        let expected = signature
            .get("accepted")
            .and_then(Value::as_bool)
            .ok_or("expected")?;
        if strict_verify(
            &field(signature, "publicKey")?,
            &field(signature, "message")?,
            &field(signature, "signature")?,
        ) != expected
        {
            return Err("signature-verdict");
        }
    }
    println!("Strict Ed25519 oracle: {} points, {} signatures verified; ed25519-dalek 2.2.0 + curve25519-dalek 4.1.3.", points.len(), signatures.len());
    Ok(())
}

fn main() {
    if let Err(code) = run() {
        eprintln!("build-brief-crypto-oracle.{code}");
        std::process::exit(1);
    }
}
