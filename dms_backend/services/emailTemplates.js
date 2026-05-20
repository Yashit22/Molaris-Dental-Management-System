/**
 * HTML email template functions.
 * All functions return { subject, html, text }.
 * Variables are passed as a plain object and substituted via {{key}} tokens.
 */

function sub(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// Base layout wrapper — clinic-branded header + footer
function layout({ clinicName, logoUrl, subject, body, ctaLabel, ctaUrl }) {
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="${clinicName}" style="max-height:48px;max-width:160px;object-fit:contain;" />`
    : `<span style="font-size:20px;font-weight:700;color:#137fec;">${clinicName}</span>`;

  const cta = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${ctaUrl}" style="background:#137fec;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;display:inline-block;">${ctaLabel}</a>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07);">
        <!-- Header -->
        <tr><td style="background:#137fec;padding:20px 32px;">
          ${logo}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:22px;">${subject}</h2>
          <div style="color:#374151;font-size:15px;line-height:1.6;">
            ${body}
          </div>
          ${cta}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${clinicName} · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function detailRow(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;">${value}</td>
  </tr>`;
}

function appointmentCard({ date, time, doctor, service, address }) {
  return `<table style="background:#f0f7ff;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;border-collapse:collapse;">
    <tbody>
      ${detailRow('Date', date)}
      ${detailRow('Time', time)}
      ${detailRow('Doctor', doctor)}
      ${detailRow('Service', service)}
      ${detailRow('Address', address)}
    </tbody>
  </table>`;
}

// ─── 1. Booking Request Received (to patient) ────────────────────────────────
export function bookingRequestReceived(vars) {
  const subject = sub('Your appointment request at {{clinic_name}} is received', vars);
  const body = `
    <p>Hi {{first_name}},</p>
    <p>We've received your appointment request. The clinic will review and confirm it shortly.</p>
    ${appointmentCard({ date: vars.appointment_date, time: vars.appointment_time, doctor: vars.doctor_name, service: vars.service_name, address: vars.clinic_address })}
    <p>We'll send you a confirmation once it's approved. If you have any questions, call us at <strong>{{clinic_phone}}</strong>.</p>
    <p>Thank you,<br><strong>{{clinic_name}}</strong></p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Hi {{first_name}},\n\nWe received your appointment request at {{clinic_name}}.\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\nService: {{service_name}}\n\nWe'll confirm it shortly.\n\n{{clinic_name}}`, vars),
  };
}

// ─── 2. New Booking Notification (to clinic owner) ───────────────────────────
export function newBookingNotification(vars) {
  const subject = sub('New appointment request from {{patient_name}}', vars);
  const body = `
    <p>A new online appointment request has been submitted.</p>
    ${appointmentCard({ date: vars.appointment_date, time: vars.appointment_time, service: vars.service_name })}
    <table style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:12px 0;width:100%;border-collapse:collapse;">
      <tbody>
        ${detailRow('Patient', vars.patient_name)}
        ${detailRow('Phone', vars.patient_phone)}
        ${detailRow('Notes', vars.notes)}
      </tbody>
    </table>
    <p>Log in to confirm or reschedule this appointment.</p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`New appointment request from {{patient_name}} ({{patient_phone}}).\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\nService: {{service_name}}\nNotes: {{notes}}`, vars),
  };
}

// ─── 3. Appointment Confirmed (to patient) ───────────────────────────────────
export function appointmentConfirmed(vars) {
  const subject = sub('Your appointment is confirmed — {{appointment_date}}, {{appointment_time}}', vars);
  const body = `
    <p>Hi {{first_name}},</p>
    <p>Great news! Your appointment has been <strong>confirmed</strong>.</p>
    ${appointmentCard({ date: vars.appointment_date, time: vars.appointment_time, doctor: vars.doctor_name, service: vars.service_name, address: vars.clinic_address })}
    <p>Please arrive 5-10 minutes early. If you need to reschedule, call us at <strong>{{clinic_phone}}</strong>.</p>
    <p>See you soon,<br><strong>{{clinic_name}}</strong></p>
  `;
  const html = layout({
    clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject,
    body: sub(body, vars),
    ctaLabel: vars.ics_available ? 'Add to Calendar' : null,
    ctaUrl:   vars.ics_url || null,
  });
  return {
    subject,
    html,
    text: sub(`Hi {{first_name}},\n\nYour appointment at {{clinic_name}} is confirmed.\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\nDoctor: {{doctor_name}}\n\nSee you soon!\n{{clinic_name}}`, vars),
  };
}

// ─── 4. Appointment Reminder (24h before) ───────────────────────────────────
export function appointmentReminder(vars) {
  const subject = sub('Reminder: Your appointment tomorrow at {{appointment_time}} — {{clinic_name}}', vars);
  const body = `
    <p>Hi {{first_name}},</p>
    <p>This is a friendly reminder about your appointment <strong>tomorrow</strong>.</p>
    ${appointmentCard({ date: vars.appointment_date, time: vars.appointment_time, doctor: vars.doctor_name, service: vars.service_name, address: vars.clinic_address })}
    <p>If you need to reschedule, please call us at <strong>{{clinic_phone}}</strong>.</p>
    <p>See you tomorrow!<br><strong>{{clinic_name}}</strong></p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Hi {{first_name}}, reminder: your appointment at {{clinic_name}} is tomorrow at {{appointment_time}}. Address: {{clinic_address}}`, vars),
  };
}

// ─── 5. Appointment Rescheduled (to patient) ────────────────────────────────
export function appointmentRescheduled(vars) {
  const subject = sub('Your appointment has been rescheduled — {{clinic_name}}', vars);
  const body = `
    <p>Hi {{first_name}},</p>
    <p>Your appointment has been rescheduled. Here are your new details:</p>
    ${appointmentCard({ date: vars.appointment_date, time: vars.appointment_time, doctor: vars.doctor_name, service: vars.service_name, address: vars.clinic_address })}
    <p>If this doesn't work for you, please call us at <strong>{{clinic_phone}}</strong>.</p>
    <p>Thank you,<br><strong>{{clinic_name}}</strong></p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Hi {{first_name}}, your appointment at {{clinic_name}} has been rescheduled to {{appointment_date}} at {{appointment_time}}.`, vars),
  };
}

// ─── 6. Appointment Cancelled (to patient) ──────────────────────────────────
export function appointmentCancelled(vars) {
  const subject = sub('Your appointment at {{clinic_name}} has been cancelled', vars);
  const body = `
    <p>Hi {{first_name}},</p>
    <p>Your appointment on <strong>{{appointment_date}} at {{appointment_time}}</strong> has been cancelled.</p>
    <p>To book a new appointment, call us at <strong>{{clinic_phone}}</strong> or visit our booking page.</p>
    <p>We're sorry for any inconvenience.<br><strong>{{clinic_name}}</strong></p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Hi {{first_name}}, your appointment at {{clinic_name}} on {{appointment_date}} at {{appointment_time}} has been cancelled. Call {{clinic_phone}} to rebook.`, vars),
  };
}

// ─── 7. Invoice Receipt (to patient) ────────────────────────────────────────
export function invoiceReceipt(vars) {
  const subject = sub('Receipt from {{clinic_name}} — ₹{{amount}}', vars);
  const body = `
    <p>Hi {{first_name}},</p>
    <p>Thank you for your payment. Here's your receipt.</p>
    <table style="background:#f0f7ff;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;border-collapse:collapse;">
      <tbody>
        ${detailRow('Invoice #', vars.invoice_id)}
        ${detailRow('Amount Paid', `₹${vars.amount}`)}
        ${detailRow('Date', vars.invoice_date)}
        ${vars.outstanding ? detailRow('Outstanding', `₹${vars.outstanding}`) : ''}
      </tbody>
    </table>
    <p>Your full invoice is attached to this email.</p>
    <p>Thank you for choosing <strong>{{clinic_name}}</strong>.<br>If you have any questions, call us at <strong>{{clinic_phone}}</strong>.</p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Hi {{first_name}}, receipt from {{clinic_name}}: ₹{{amount}} paid. Invoice #{{invoice_id}}.`, vars),
  };
}

// ─── 8. Staff Invitation (to new staff member) ──────────────────────────────
export function staffInvitation(vars) {
  const subject = sub("You've been invited to {{clinic_name}} on Molaris DMS", vars);
  const body = `
    <p>Hi {{staff_name}},</p>
    <p>You've been added as <strong>{{role}}</strong> at <strong>{{clinic_name}}</strong> on Molaris Dental Management System.</p>
    <table style="background:#f0f7ff;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;border-collapse:collapse;">
      <tbody>
        ${detailRow('Email',    vars.email)}
        ${detailRow('Password', vars.temp_password)}
        ${detailRow('Clinic',   vars.clinic_name)}
      </tbody>
    </table>
    <p>Please log in and change your password immediately.</p>
  `;
  const html = layout({
    clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject,
    body: sub(body, vars),
    ctaLabel: 'Log In Now',
    ctaUrl: vars.login_url || '#',
  });
  return {
    subject,
    html,
    text: sub(`Hi {{staff_name}}, you've been invited to {{clinic_name}} on Molaris DMS. Login: {{email}} / Password: {{temp_password}}`, vars),
  };
}

// ─── 9. Low Stock Alert (to clinic owner) ────────────────────────────────────
export function lowStockAlert(vars) {
  const subject = sub('Low stock alert: {{item_name}} — {{clinic_name}}', vars);
  const body = `
    <p>Hi,</p>
    <p>This is an automated alert: <strong>{{item_name}}</strong> is running low.</p>
    <table style="background:#fff3f0;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;border-collapse:collapse;">
      <tbody>
        ${detailRow('Item', vars.item_name)}
        ${detailRow('Current Stock', vars.current_stock)}
        ${detailRow('Minimum Level', vars.min_stock)}
        ${detailRow('Status', vars.stock_status)}
      </tbody>
    </table>
    <p>Log in to place a purchase order before stock runs out.</p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Low stock alert: {{item_name}} at {{clinic_name}}. Current: {{current_stock}}, Min: {{min_stock}}.`, vars),
  };
}

// ─── 10. Lab Order Ready (to assigned doctor) ────────────────────────────────
export function labOrderReady(vars) {
  const subject = sub('Lab work received for {{patient_name}} — {{clinic_name}}', vars);
  const body = `
    <p>Hi Dr. {{doctor_name}},</p>
    <p>Lab work for patient <strong>{{patient_name}}</strong> has been received.</p>
    <table style="background:#f0f7ff;border-radius:8px;padding:16px 20px;margin:20px 0;width:100%;border-collapse:collapse;">
      <tbody>
        ${detailRow('Patient',  vars.patient_name)}
        ${detailRow('Lab',      vars.lab_name)}
        ${detailRow('Items',    vars.items)}
        ${detailRow('Received', vars.received_date)}
      </tbody>
    </table>
    <p>Please log in to update the patient's treatment plan.</p>
  `;
  const html = layout({ clinicName: vars.clinic_name, logoUrl: vars.logo_url, subject, body: sub(body, vars) });
  return {
    subject,
    html,
    text: sub(`Lab work for {{patient_name}} has been received at {{clinic_name}}.`, vars),
  };
}
