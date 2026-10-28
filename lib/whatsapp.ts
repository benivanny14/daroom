const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;

export function buildWhatsAppLink(
  phone: string,
  listingTitle: string,
  neighborhood: string,
  priceTzs: number
): string {
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!PHONE_PATTERN.test(normalized)) {
    throw new Error("Invalid phone number.");
  }

  const message = `Hello, I saw your room for Tsh ${priceTzs.toLocaleString("en-TZ")} in ${neighborhood} on DarRoom. I would like more details about "${listingTitle}".`;
  return `https://wa.me/${normalized.replace("+", "")}?text=${encodeURIComponent(message)}`;
}
