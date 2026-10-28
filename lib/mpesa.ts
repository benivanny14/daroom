import { createHmac } from "crypto";

export interface MpesaCheckoutRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export async function initiateMpesaSTKPush(request: MpesaCheckoutRequest): Promise<string> {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const passkey = process.env.MPESA_PASSKEY;
  const shortcode = process.env.MPESA_SHORTCODE;

  if (!consumerKey || !consumerSecret || !passkey || !shortcode) {
    throw new Error("M-Pesa credentials are not configured.");
  }

  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const response = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: request.amount,
      PartyA: request.phoneNumber,
      PartyB: shortcode,
      PhoneNumber: request.phoneNumber,
      CallBackURL: `${process.env.APP_URL}/api/payments/mpesa/callback`,
      AccountReference: request.accountReference,
      TransactionDesc: request.transactionDesc
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`M-Pesa STK Push failed: ${data.errorMessage || "Unknown error"}`);
  }

  return data.CheckoutRequestID;
}

export function verifyMpesaCallback(body: string, signature: string): boolean {
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(body).digest("base64");
  return expected === signature;
}
