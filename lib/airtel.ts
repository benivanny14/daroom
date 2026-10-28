export interface AirtelMoneyCheckoutRequest {
  phoneNumber: string;
  amount: number;
  reference: string;
}

export async function initiateAirtelMoneyPayment(request: AirtelMoneyCheckoutRequest): Promise<string> {
  const clientId = process.env.AIRTEL_MONEY_CLIENT_ID;
  const clientSecret = process.env.AIRTEL_MONEY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Airtel Money credentials are not configured.");
  }

  // Get access token
  const authResponse = await fetch("https://www.airtel.co.tz/api/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    })
  });

  const authData = await authResponse.json();
  if (!authResponse.ok) {
    throw new Error("Airtel Money authentication failed");
  }

  const accessToken = authData.access_token;

  // Initiate payment
  const response = await fetch("https://www.airtel.co.tz/api/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: request.amount,
      phone: request.phoneNumber,
      reference: request.reference,
      currency: "TZS"
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Airtel Money payment failed: ${data.message || "Unknown error"}`);
  }

  return data.transactionId;
}
