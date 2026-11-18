export type PaymentLinkCheck =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: string };

const MAX_LENGTH = 500;

/**
 * Accepts only a plain https link. Players are sent to it from inside the app, so
 * it must not be able to point anywhere surprising: no other schemes, no spaces,
 * and no "https://tikkie.me@elsewhere.example" tricks, where the part before the
 * @ is a login rather than the site.
 */
export function checkPaymentUrl(raw: string): PaymentLinkCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "Paste the payment link." };
  if (value.length > MAX_LENGTH) return { ok: false, reason: "That link is too long." };
  if (/\s/.test(value)) return { ok: false, reason: "That link has a space in it." };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "That does not look like a link." };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "The link must start with https://." };
  if (url.username || url.password) return { ok: false, reason: "That link has a login in it, which is not allowed." };

  return { ok: true, url: url.toString(), host: url.hostname.replace(/^www\./, "") };
}
