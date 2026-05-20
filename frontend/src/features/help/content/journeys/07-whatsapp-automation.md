---
title: WhatsApp Automation Setup
journey: Communication
order: 7
tags: [whatsapp, automation, reminder, template, message, notification, post-care, journey]
keywords: send automatic appointment reminders, create message template, set up post-care journey, enable whatsapp notifications, configure event triggers
video:
---

## WhatsApp Automation Setup

Send automatic appointment reminders, booking confirmations, and post-care follow-ups to patients — all triggered by events in the DMS without any manual effort.

---

### Step 1 — Enable WhatsApp & Set the Language

1. Go to **WhatsApp** in the sidebar.
2. Click the **Settings** tab.
3. Toggle **Enable WhatsApp Messaging** to ON.
4. Set your **Default Language** (English, Hindi, or Marathi) — this is the language used when no template is found in the patient's preferred language.
5. Click **Save Settings**.

---

### Step 2 — Turn On the Events You Want

Still on the Settings tab, you'll see a list of event triggers:

| Event | When it fires |
|-------|--------------|
| Appointment Booked | When any appointment is created |
| Appointment Reminder | Automatically X hours before appointment time |
| Appointment Rescheduled | When an appointment is moved to a new time |
| Treatment Completed | When a treatment is marked as done |
| Feedback Message | After treatment, to collect feedback |
| Post-Care Journey | Follow-up sequence after specific treatments |

Toggle on the ones you want. For **Appointment Reminder**, you can also set how many hours in advance to send it.

---

### Step 3 — Create a Message Template

The DMS sends messages using templates you define. Each event needs at least one template in each language you use.

1. Click the **Messages** tab.
2. In the **Templates** section, click **+ New Template**.
3. Fill in:
   - **Event** — which trigger this template is for (e.g. Appointment Booked)
   - **Language** — English / Hindi / Marathi
   - **Message** — write your message text. Use variables in double braces to personalise:

| Variable | Replaced with |
|----------|--------------|
| `{{name}}` | Patient's full name |
| `{{firstName}}` | Patient's first name |
| `{{date}}` | Appointment date |
| `{{time}}` | Appointment time |
| `{{doctorName}}` | Assigned doctor's name |
| `{{treatment}}` | Treatment name (for treatment events) |
| `{{clinicName}}` | Your clinic's name |

4. Click **Save Template**.

> **Example message:** `Hi {{firstName}}, your appointment at {{clinicName}} is confirmed for {{date}} at {{time}} with {{doctorName}}. See you soon!`

---

### Step 4 — Set Up a Post-Care Journey (Optional)

Post-care journeys send a sequence of follow-up messages after a specific treatment is completed. Useful for root canals, implants, extractions — anything with aftercare instructions.

1. On the **Messages** tab, scroll to the **Post-Care Journeys** section.
2. Click **+ New Journey**.
3. Set the **Treatment Name** — must match exactly what is entered in the treatment plan (e.g. "Root Canal Treatment").
4. Add steps: each step has a **message** and a **delay** (e.g. send after 2 hours, 1 day, 3 days).
5. Click **Save Journey**.

From this point, any time that treatment is marked Completed, the journey fires automatically.

---

### Step 5 — Monitor the Message Log

1. Click the **Logs** tab to see all messages sent by the system.
2. Use the filters to find messages by **event type**, **status**, or **date range**.
3. Status meanings:
   - **Scheduled** — queued and waiting to send at the set time
   - **Sent** — delivered to the gateway
   - **Failed** — something went wrong; check the patient's phone number is saved correctly

---

### Things to Keep in Mind

> **Templates must exist for each event you enable.** If an event is toggled on but has no matching template in the patient's language, the message is silently skipped. Create templates for every language you plan to use.

> **Phone number must be saved on the patient record.** If no mobile number is on the patient profile, WhatsApp messages will not be sent — no error is shown to the user.

> **Variables only work if the data exists.** If `{{doctorName}}` is in the template but no doctor is assigned to the appointment, the message will send with that field blank.

> **Appointment Reminder scheduling is automatic.** Once enabled, reminders are queued at the time the appointment is created. If you change the reminder window (hours before), the new setting only applies to appointments created after the change.

> **Post-care journeys are matched by treatment name.** The journey name must exactly match the treatment name in the plan (case-insensitive). A typo means the journey won't fire.
