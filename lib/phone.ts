export function normalizeTanzaniaPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  const normalized = digits.startsWith("0")
    ? `255${digits.slice(1)}`
    : digits.startsWith("255")
      ? digits
      : `255${digits}`;

  return /^255[67]\d{8}$/.test(normalized) ? normalized : null;
}

/**
 * Public phone numbers are masked until a signed-in user requests the contact.
 * Example: 255712345678 -> 2557***678
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

/** Human-friendly display for a full number: 255712345678 -> 0712 345 678 */
export function formatTanzaniaPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("255")) {
    return `0${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return phone;
}
