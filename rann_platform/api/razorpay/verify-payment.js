// Vercel Serverless Function — POST /api/razorpay/verify-payment
//
// Receives: {
//   razorpay_payment_id: string,
//   razorpay_order_id: string,
//   razorpay_signature: string,
//   event_id: string,
//   phone: string
// }
//
// Returns:  { verified: true } on success, { verified: false, error: ... } on failure.
//
// Why server-side verification:
//   The browser receives the payment_id/order_id/signature from Razorpay's checkout JS.
//   A malicious user could fake those values and call our verify endpoint with bogus data.
//   By computing HMAC-SHA256(order_id|payment_id, key_secret) and comparing to the signature
//   Razorpay sent, we mathematically prove the payment really happened on Razorpay's side.
//   The key_secret never leaves the server so only Razorpay and us can produce valid signatures.

import crypto from "crypto";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!keySecret) {
    return res.status(500).json({ verified: false, error: "Razorpay not configured (missing key secret)" });
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ verified: false, error: "Supabase not configured (missing service role key)" });
  }

  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    event_id,
    phone,
  } = req.body || {};

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return res.status(400).json({ verified: false, error: "Missing payment fields" });
  }
  if (!event_id || !phone) {
    return res.status(400).json({ verified: false, error: "Missing registration identifiers" });
  }

  // ─── Step 1: Verify the HMAC signature ──────────────────────────
  // Razorpay signs `${order_id}|${payment_id}` with our key_secret using HMAC-SHA256
  // and sends the hex-encoded result as razorpay_signature. We compute the same
  // and compare in constant time.
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  let signaturesMatch = false;
  try {
    signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(razorpay_signature, "utf8")
    );
  } catch (e) {
    // If lengths differ, timingSafeEqual throws — treat as mismatch
    signaturesMatch = false;
  }

  if (!signaturesMatch) {
    console.error("Signature mismatch", {
      received: razorpay_signature,
      expected: expectedSignature,
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
    });
    return res.status(400).json({ verified: false, error: "Invalid payment signature. This payment cannot be verified." });
  }

  // ─── Step 2: Update the registration in Supabase ───────────────
  // We use the Supabase service-role key (server-side only) to bypass RLS and write directly.
  try {
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/registrations?event_id=eq.${encodeURIComponent(event_id)}&phone=eq.${encodeURIComponent(phone)}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          payment_status: "verified",
          payment_note: razorpay_payment_id,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        }),
      }
    );

    if (!updateResponse.ok) {
      const errText = await updateResponse.text();
      console.error("Supabase update failed:", updateResponse.status, errText);
      return res.status(500).json({ verified: false, error: "Payment was valid but updating the registration failed. Admin will verify manually.", details: errText });
    }

    const updated = await updateResponse.json();
    if (!Array.isArray(updated) || updated.length === 0) {
      // Signature was valid but no registration row matched. Could be a timing issue
      // (verify-payment fired before registration was saved). Frontend should retry.
      return res.status(404).json({ verified: false, error: "No registration found yet. If you just registered, wait a moment and refresh." });
    }

    return res.status(200).json({ verified: true, registration: updated[0] });
  } catch (err) {
    console.error("verify-payment error:", err);
    return res.status(500).json({ verified: false, error: "Internal server error", message: err.message });
  }
}
