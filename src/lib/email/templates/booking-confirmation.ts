/**
 * Customer booking confirmation email template.
 * Sent to the customer immediately after a successful booking.
 */

export type BookingConfirmationData = {
  agencyName: string;
  agencyLogoUrl?: string;
  agencyEmail?: string;
  agencyPhone?: string;
  bookingId: string;
  customerName: string;
  paymentMethod: 'cash' | 'online';
  status: string;
  items: Array<{
    name: string;
    packageName?: string;
    adults?: number;
    children?: number;
    date?: string;
    price: number;
    /** Room-specific fields (optional). When present, a stay block is rendered instead of a tour-style date line. */
    nights?: number;
    checkIn?: string;
    checkOut?: string;
    units?: number;
    addonsLabel?: string;
  }>;
  subtotal: number;
  discountAmount?: number;
  totalPrice: number;
  currency?: string;
};

export function renderBookingConfirmationEmail(data: BookingConfirmationData): string {
  const {
    agencyName,
    agencyLogoUrl,
    agencyEmail,
    agencyPhone,
    bookingId,
    customerName,
    paymentMethod,
    status,
    items,
    subtotal,
    discountAmount = 0,
    totalPrice,
    currency = 'USD',
  } = data;

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const statusColor = status === 'Confirmed' ? '#16a34a' : '#d97706';
  const statusLabel = status === 'Confirmed' ? '✅ Confirmed' : '⏳ Pending Payment';

  const itemsHtml = items
    .map((item) => {
      const pax = [
        item.adults ? `${item.adults} adult${item.adults > 1 ? 's' : ''}` : '',
        item.children ? `${item.children} child${item.children > 1 ? 'ren' : ''}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      const stayLine =
        item.checkIn && item.checkOut
          ? `<br><span style="color:#666;font-size:13px;">🏨 ${item.checkIn} → ${item.checkOut}${item.nights ? ` · ${item.nights} night${item.nights > 1 ? 's' : ''}` : ''}${item.units && item.units > 1 ? ` · ${item.units} rooms` : ''}</span>`
          : '';
      const addonsLine = item.addonsLabel
        ? `<br><span style="color:#666;font-size:13px;">Add-ons: ${item.addonsLabel}</span>`
        : '';
      return `
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
            <strong style="color: #111;">${item.name}</strong>
            ${item.packageName ? `<br><span style="color:#666;font-size:13px;">Package: ${item.packageName}</span>` : ''}
            ${pax ? `<br><span style="color:#666;font-size:13px;">${pax}</span>` : ''}
            ${stayLine}
            ${addonsLine}
            ${item.date ? `<br><span style="color:#666;font-size:13px;">📅 ${new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</span>` : ''}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; text-align: right; white-space: nowrap; color: #111; font-weight: 600;">
            ${fmt(item.price)}
          </td>
        </tr>`;
    })
    .join('');

  const discountRow =
    discountAmount > 0
      ? `<tr>
          <td style="padding: 8px 0; color: #16a34a;">Discount Applied</td>
          <td style="padding: 8px 0; text-align: right; color: #16a34a; font-weight: 600;">−${fmt(discountAmount)}</td>
        </tr>`
      : '';

  const paymentNote =
    paymentMethod === 'cash'
      ? `<p style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;color:#166534;font-size:14px;margin:24px 0;">
           💵 <strong>Payment Method:</strong> Cash on arrival. Please bring the exact amount on the day of your tour.
         </p>`
      : `<p style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;color:#1e3a8a;font-size:14px;margin:24px 0;">
           💳 <strong>Payment Method:</strong> Online payment. Please complete your payment to confirm the booking.
         </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 40px;text-align:center;">
            ${agencyLogoUrl ? `<img src="${agencyLogoUrl}" alt="${agencyName}" style="max-height:50px;max-width:200px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;" />` : ''}
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${agencyName}</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">Booking Confirmation</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">

            <h2 style="font-size:22px;color:#111;margin:0 0 6px;">Hello, ${customerName}!</h2>
            <p style="color:#555;font-size:15px;margin:0 0 24px;">Your booking has been received. Here's your summary:</p>

            <!-- Booking ID + Status -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#f9fafb;border-radius:8px;padding:16px 20px;">
                  <table width="100%">
                    <tr>
                      <td>
                        <span style="font-size:12px;text-transform:uppercase;color:#888;letter-spacing:0.5px;">Booking Reference</span>
                        <br><strong style="font-size:18px;color:#111;font-family:monospace;">#${bookingId.substring(0, 8).toUpperCase()}</strong>
                      </td>
                      <td align="right">
                        <span style="background:${statusColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;">${statusLabel}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin:0 0 12px;">Items Booked</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              ${itemsHtml}
              ${discountRow}
              ${subtotal !== totalPrice ? `<tr><td style="padding:8px 0;color:#555;">Subtotal</td><td style="padding:8px 0;text-align:right;color:#555;">${fmt(subtotal)}</td></tr>` : ''}
              <tr>
                <td style="padding:12px 0;border-top:2px solid #111;font-size:16px;font-weight:700;color:#111;">Total</td>
                <td style="padding:12px 0;border-top:2px solid #111;text-align:right;font-size:18px;font-weight:700;color:#2563eb;">${fmt(totalPrice)}</td>
              </tr>
            </table>

            ${paymentNote}

            <!-- Contact info -->
            ${
              agencyEmail || agencyPhone
                ? `
            <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;font-size:14px;color:#555;">
              <strong style="color:#111;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Need Help?</strong>
              ${agencyEmail ? `<br>📧 <a href="mailto:${agencyEmail}" style="color:#2563eb;">${agencyEmail}</a>` : ''}
              ${agencyPhone ? `<br>📞 ${agencyPhone}` : ''}
            </div>`
                : ''
            }

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#aaa;font-size:12px;margin:0;">This email was sent by ${agencyName}. Please do not reply to this email.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
