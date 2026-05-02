/**
 * Admin (agency) notification email template.
 * Sent to the agency's contactEmail whenever a new booking is created.
 */

export type BookingNotificationData = {
  agencyName: string;
  bookingId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerNationality?: string;
  paymentMethod: 'cash' | 'online';
  items: Array<{
    name: string;
    packageName?: string;
    adults?: number;
    children?: number;
    date?: string;
    price: number;
    nights?: number;
    checkIn?: string;
    checkOut?: string;
    units?: number;
    addonsLabel?: string;
  }>;
  totalPrice: number;
  discountAmount?: number;
  currency?: string;
  adminBookingUrl?: string;
};

export function renderBookingNotificationEmail(data: BookingNotificationData): string {
  const {
    agencyName,
    bookingId,
    customerName,
    customerEmail,
    customerPhone,
    customerNationality,
    paymentMethod,
    items,
    totalPrice,
    discountAmount = 0,
    currency = 'USD',
    adminBookingUrl,
  } = data;

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const itemsHtml = items
    .map((item) => {
      const pax = [
        item.adults ? `${item.adults} adult${item.adults > 1 ? 's' : ''}` : '',
        item.children ? `${item.children} child${item.children > 1 ? 'ren' : ''}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">
            <strong>${item.name}</strong>
            ${item.packageName ? `<br><small style="color:#666;">Package: ${item.packageName}</small>` : ''}
            ${pax ? `<br><small style="color:#666;">${pax}</small>` : ''}
            ${item.date ? `<br><small style="color:#666;">📅 ${new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</small>` : ''}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${fmt(item.price)}</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>New Booking Alert</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:24px 40px;">
            <h1 style="color:#fff;margin:0;font-size:20px;">🔔 New Booking — ${agencyName}</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px;">A new booking has been submitted and requires your attention.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 40px;">

            <!-- Booking ID -->
            <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
              <span style="font-size:12px;color:#0c4a6e;text-transform:uppercase;letter-spacing:0.5px;">Booking Reference</span>
              <br><strong style="font-size:20px;font-family:monospace;color:#0c4a6e;">#${bookingId.substring(0, 8).toUpperCase()}</strong>
              <br><small style="color:#666;">Full ID: ${bookingId}</small>
            </div>

            <!-- Customer info -->
            <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:0 0 12px;">Customer Details</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <tr style="background:#f9fafb;">
                <td style="padding:10px 16px;font-size:13px;color:#555;width:40%;">Name</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111;">${customerName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;font-size:13px;color:#555;border-top:1px solid #f0f0f0;">Email</td>
                <td style="padding:10px 16px;font-size:13px;border-top:1px solid #f0f0f0;"><a href="mailto:${customerEmail}" style="color:#2563eb;">${customerEmail}</a></td>
              </tr>
              ${customerPhone ? `<tr style="background:#f9fafb;"><td style="padding:10px 16px;font-size:13px;color:#555;border-top:1px solid #f0f0f0;">Phone</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111;border-top:1px solid #f0f0f0;">${customerPhone}</td></tr>` : ''}
              ${customerNationality ? `<tr><td style="padding:10px 16px;font-size:13px;color:#555;border-top:1px solid #f0f0f0;">Nationality</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111;border-top:1px solid #f0f0f0;">${customerNationality}</td></tr>` : ''}
              <tr style="${customerPhone || customerNationality ? '' : 'background:#f9fafb;'}">
                <td style="padding:10px 16px;font-size:13px;color:#555;border-top:1px solid #f0f0f0;">Payment</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:600;border-top:1px solid #f0f0f0;color:${paymentMethod === 'cash' ? '#166534' : '#1e3a8a'};">${paymentMethod === 'cash' ? '💵 Cash' : '💳 Online'}</td>
              </tr>
            </table>

            <!-- Items -->
            <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:0 0 12px;">Booked Items</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#888;text-align:left;">Item</th>
                  <th style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#888;text-align:right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                ${discountAmount > 0 ? `<tr><td style="padding:10px 12px;border-top:1px solid #e5e7eb;color:#16a34a;">Discount</td><td style="padding:10px 12px;border-top:1px solid #e5e7eb;text-align:right;color:#16a34a;font-weight:600;">−${fmt(discountAmount)}</td></tr>` : ''}
                <tr style="background:#f9fafb;">
                  <td style="padding:12px;border-top:2px solid #e5e7eb;font-weight:700;font-size:15px;">Total</td>
                  <td style="padding:12px;border-top:2px solid #e5e7eb;text-align:right;font-weight:700;font-size:16px;color:#2563eb;">${fmt(totalPrice)}</td>
                </tr>
              </tbody>
            </table>

            ${
              adminBookingUrl
                ? `
            <div style="text-align:center;margin-top:8px;">
              <a href="${adminBookingUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Booking in Dashboard →</a>
            </div>`
                : ''
            }
          </td>
        </tr>

        <tr>
          <td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#aaa;font-size:12px;margin:0;">This notification was sent automatically by your ${agencyName} booking system.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
