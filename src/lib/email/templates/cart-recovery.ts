/**
 * Customer cart-recovery email. Sent by the /api/cron/cart-recovery
 * background job ~30 minutes after a checkout was abandoned with an email
 * captured. Includes a short summary and a one-click resume link.
 */

export type CartRecoveryEmailItem = {
  name: string;
  quantity?: number;
  price: number;
};

export type CartRecoveryEmailData = {
  agencyName: string;
  agencyLogoUrl?: string;
  customerName?: string;
  recoveryUrl: string;
  items: CartRecoveryEmailItem[];
  total: number;
  currency?: string;
};

export function renderCartRecoveryEmail(data: CartRecoveryEmailData): string {
  const {
    agencyName,
    agencyLogoUrl,
    customerName,
    recoveryUrl,
    items,
    total,
    currency = 'USD',
  } = data;

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const safe = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          ${safe(item.name)}${typeof item.quantity === 'number' ? ` × ${item.quantity}` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">
          ${fmt(item.price)}
        </td>
      </tr>`
    )
    .join('');

  const greeting = customerName ? `Hi ${safe(customerName)},` : 'Hi there,';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Your cart is waiting</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f6f7f9;color:#111;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f9;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table cellpadding="0" cellspacing="0" border="0" width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:100%;">
          <tr>
            <td style="padding:24px;text-align:center;border-bottom:1px solid #eee;">
              ${agencyLogoUrl ? `<img src="${safe(agencyLogoUrl)}" alt="${safe(agencyName)}" style="max-height:48px;" />` : `<strong style="font-size:18px;">${safe(agencyName)}</strong>`}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h1 style="margin:0 0 12px 0;font-size:20px;">Your cart is waiting</h1>
              <p style="margin:0 0 16px 0;line-height:1.5;">${greeting}</p>
              <p style="margin:0 0 16px 0;line-height:1.5;">We noticed you didn't finish checking out. Your items are still saved — pick up where you left off:</p>
              <p style="margin:0 0 24px 0;text-align:center;">
                <a href="${safe(recoveryUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">Resume checkout</a>
              </p>
              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #eee;margin-top:8px;">
                ${itemsHtml}
                <tr>
                  <td style="padding:12px 0 0 0;font-weight:600;">Total</td>
                  <td style="padding:12px 0 0 0;text-align:right;font-weight:600;">${fmt(total)}</td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:12px;color:#666;line-height:1.5;">If the button above doesn't work, copy this link into your browser: <br /><span style="word-break:break-all;">${safe(recoveryUrl)}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center;">
              Sent by ${safe(agencyName)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
