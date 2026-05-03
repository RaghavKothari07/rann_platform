// Vercel Serverless Function — POST /api/razorpay/create-order
//
// Receives: { amount: number (rupees), receipt: string }
// Returns:  { order_id: string, amount: number, currency: "INR", key_id: string }
//
// The browser uses the returned order_id + key_id to open the Razorpay checkout modal.
// We never expose the secret to the browser — it's only used here, server-side.

export default async function handler(req, res) {
  // CORS for safety (Vercel routes same-origin already, but be explicit)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.error("Razorpay env vars missing");
    return res.status(500).json({ error: "Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel." });
  }

  // Parse body — Vercel auto-parses JSON for you
  const { amount, receipt } = req.body || {};

  if (!amount || typeof amount !== "number" || amount < 1) {
    return res.status(400).json({ error: "Invalid amount. Must be a positive number in rupees." });
  }

  // Razorpay wants amount in PAISE (₹1 = 100 paise). So multiply by 100.
  const amountInPaise = Math.round(amount * 100);

  try {
    // Razorpay's REST API requires HTTP Basic auth: base64(key_id:key_secret)
    const authHeader = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: receipt || `rann_${Date.now()}`,
        payment_capture: 1, // auto-capture on success (no manual capture needed)
      }),
    });

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      console.error("Razorpay order creation failed:", orderData);
      return res.status(500).json({ error: "Razorpay order creation failed", details: orderData });
    }

    // Return the order_id + the public key_id (safe to expose)
    return res.status(200).json({
      order_id: orderData.id,
      amount: orderData.amount, // still in paise — frontend doesn't need to convert back
      currency: orderData.currency,
      key_id: keyId,
    });
  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}
