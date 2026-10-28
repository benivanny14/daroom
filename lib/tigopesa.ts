export interface TigoPesaCheckoutRequest {
  phoneNumber: string;
  amount: number;
  reference: string;
}

export async function initiateTigoPesaPayment(request: TigoPesaCheckoutRequest): Promise<string> {
  const apiKey = process.env.TIGO_PESA_API_KEY;
  const apiSecret = process.env.TIGO_PESA_API_SECRET;
  const merchantId = process.env.TIGO_PESA_MERCHANT_ID;

  if (!apiKey || !apiSecret || !merchantId) {
    throw new Error("Tigo Pesa credentials are not configured.");
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const response = await fetch("https://api.tigo.co.tz/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      merchantId,
      amount: request.amount,
      msisdn: request.phoneNumber,
      reference: request.reference,
      currency: "TZS"
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Tigo Pesa payment failed: ${data.message || "Unknown error"}`);
  }

  return data.transactionId;
}
