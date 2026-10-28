"use client";

import { FormEvent, useEffect, useState } from "react";

type RoomOption = {
  id: string;
  title: string;
  priceTzs: number;
  district: string;
  neighborhood: string;
};

type PaymentState = {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  amountTzs: number;
  orderId: string | null;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

const statusLabels: Record<PaymentState["status"], string> = {
  PENDING: "Waiting for your approval",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled"
};

export function RentPaymentForm({
  defaultPhone,
  rooms,
  initialListingId
}: {
  defaultPhone: string;
  rooms: RoomOption[];
  initialListingId?: string;
}) {
  const initialRoom = rooms.find((room) => room.id === initialListingId);
  const [listingId, setListingId] = useState(initialRoom?.id || "");
  const [amount, setAmount] = useState(initialRoom ? String(initialRoom.priceTzs) : "");
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const paymentId = payment?.id;
  const paymentStatus = payment?.status;

  // Poll our own database while the provider prompt is open. The webhook is the
  // source of truth; polling only refreshes the status the webhook wrote.
  useEffect(() => {
    if (!paymentId || paymentStatus !== "PENDING") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/payments/checkout?paymentId=${encodeURIComponent(paymentId)}`,
          { cache: "no-store", signal: controller.signal }
        );
        if (response.ok) {
          const body = await response.json();
          const next = body.payment as PaymentState | undefined;
          if (next) {
            setPayment(next);
            if (next.status === "PAID") {
              setMessage(`Payment received. TSh ${next.amountTzs.toLocaleString("en-TZ")} has been recorded.`);
              setBusy(false);
              return;
            }
            if (next.status === "FAILED" || next.status === "CANCELLED") {
              setError(
                next.failureReason ||
                  (next.status === "CANCELLED"
                    ? "The payment was cancelled on your phone."
                    : "The payment failed. You can try again.")
              );
              setBusy(false);
              return;
            }
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!stopped) timer = setTimeout(poll, 5000);
    };

    timer = setTimeout(poll, 5000);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, paymentStatus]);

  function selectRoom(value: string) {
    setListingId(value);
    const room = rooms.find((item) => item.id === value);
    if (room) setAmount(String(room.priceTzs));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setChecking(false);
    setError("");
    setMessage("");
    setPayment(null);

    const amountValue = Number(amount);
    if (!Number.isInteger(amountValue) || amountValue < 1_000 || amountValue > 10_000_000) {
      setError("Enter an amount between TSh 1,000 and TSh 10,000,000.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountValue,
          phoneNumber,
          listingId: listingId || undefined,
          rentId: reference.trim() || undefined
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The payment could not be started.");

      const next = body.payment as PaymentState;
      setPayment(next);
      setMessage(body.message || "A payment prompt was sent to your phone.");
      if (next.status === "PAID") {
        setMessage(`Payment received. TSh ${next.amountTzs.toLocaleString("en-TZ")} has been recorded.`);
        setBusy(false);
      }
      if (next.status === "FAILED" || next.status === "CANCELLED") {
        setError(next.failureReason || "The payment did not go through.");
        setBusy(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The payment could not be started.");
      setBusy(false);
    }
  }

  async function checkNow() {
    if (!payment || checking) return;
    setChecking(true);
    setError("");
    try {
      const response = await fetch(
        `/api/payments/checkout?paymentId=${encodeURIComponent(payment.id)}&refresh=1`,
        { cache: "no-store" }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The status could not be checked.");
      const next = body.payment as PaymentState;
      setPayment(next);
      if (next.status === "PAID") {
        setMessage(`Payment received. TSh ${next.amountTzs.toLocaleString("en-TZ")} has been recorded.`);
        setBusy(false);
      } else if (next.status === "FAILED" || next.status === "CANCELLED") {
        setError(next.failureReason || "The payment did not go through.");
        setBusy(false);
      } else {
        setMessage("Still waiting for the mobile-money provider. Approve the prompt on your phone.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The status could not be checked.");
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setPayment(null);
    setMessage("");
    setError("");
    setBusy(false);
  }

  return (
    <div className="panel">
      <span className="eyebrow">Mobile money</span>
      <h2>Pay rent</h2>
      <p>
        Enter the amount and the phone number registered with M-Pesa, Tigo Pesa, Airtel Money or
        Halopesa. SonicPesa will send a prompt to that phone; approve it with your mobile-money PIN.
      </p>

      <form className="account-form" onSubmit={submit}>
        <label htmlFor="rent-room">Room (optional)</label>
        <select
          id="rent-room"
          value={listingId}
          onChange={(event) => selectRoom(event.target.value)}
          disabled={busy}
        >
          <option value="">No specific room</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.title} · {room.neighborhood}, {room.district} · TSh{" "}
              {room.priceTzs.toLocaleString("en-TZ")}
            </option>
          ))}
        </select>

        <label htmlFor="rent-amount">Amount (TSh)</label>
        <input
          id="rent-amount"
          type="number"
          inputMode="numeric"
          min={1_000}
          max={10_000_000}
          step={1_000}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="e.g. 350000"
          required
          disabled={busy}
        />

        <label htmlFor="rent-phone">Mobile-money number</label>
        <input
          id="rent-phone"
          type="tel"
          autoComplete="tel"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          placeholder="0712 345 678"
          minLength={9}
          maxLength={24}
          required
          disabled={busy}
        />
        <small>Use the number that will approve the prompt, for example 0712 345 678 or 255712345678.</small>

        <label htmlFor="rent-reference">Rent reference (optional)</label>
        <input
          id="rent-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="e.g. July rent"
          maxLength={120}
          disabled={busy}
        />

        <button className="wide-button" type="submit" disabled={busy}>
          {busy ? "Waiting for approval..." : "Send payment prompt"}
        </button>
      </form>

      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="admin-warning" role="alert">{error}</p>}

      {payment && (
        <div className="status-row">
          <div>
            <span className={`status ${payment.status === "PAID" ? "live" : payment.status === "PENDING" ? "pending" : "flagged"}`}>
              {statusLabels[payment.status]}
            </span>
            <p className="fine-print">
              TSh {payment.amountTzs.toLocaleString("en-TZ")} · reference {payment.orderId || payment.id}
            </p>
          </div>
          <div className="appointment-actions">
            {payment.status === "PENDING" && (
              <button className="table-action" type="button" onClick={checkNow} disabled={checking}>
                {checking ? "Checking..." : "Check status now"}
              </button>
            )}
            {payment.status !== "PENDING" && (
              <button className="table-action" type="button" onClick={reset}>
                Start another payment
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
