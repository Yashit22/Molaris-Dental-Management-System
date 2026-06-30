export const NODES = {
  root: {
    smilo: "Hi! 👋 What do you need help with today?",
    avatarState: 'idle',
    options: [
      { id: 'go-patient',   label: 'Add or find a patient',          emoji: '🧑', next: 'patient' },
      { id: 'go-appt',      label: 'Book or manage appointments',     emoji: '📅', next: 'appt' },
      { id: 'go-billing',   label: 'Billing & payments',              emoji: '🧾', next: 'billing' },
      { id: 'go-clinical',  label: 'Clinical records & treatment',    emoji: '🦷', next: 'clinical' },
      { id: 'go-lab',       label: 'Lab orders',                      emoji: '🧪', next: 'lab' },
      { id: 'go-whatsapp',  label: 'WhatsApp & messages',             emoji: '💬', next: 'whatsapp' },
      { id: 'go-email',     label: 'Email setup',                     emoji: '📧', next: 'email' },
      { id: 'go-reports',   label: 'Reports & analytics',             emoji: '📊', next: 'reports' },
      { id: 'go-settings',  label: 'Settings & clinical data',        emoji: '⚙️', next: 'settings' },
      { id: 'go-broken',    label: "Something's not working",         emoji: '🔧', next: 'broken' },
      { id: 'free',         label: 'Something else...',               emoji: '🔍', freeText: true },
    ],
  },

  patient: {
    smilo: "Got it — patients. What do you need?",
    avatarState: 'thinking',
    options: [
      { id: 'p-register', label: 'Register a new patient',         slug: '01-patient-registration' },
      { id: 'p-search',   label: 'Search for an existing patient', slug: '01-patient-registration', hint: 'Search by phone number — it\'s the unique key per patient and the fastest way to find them.' },
      { id: 'p-update',   label: 'Update patient details',         slug: '01-patient-registration', hint: 'Open the patient profile and click Edit to update any field.' },
      { id: 'p-history',  label: "View a patient's history",       slug: '03-clinical-charting' },
      { id: 'back',       label: '← Back',                        back: true },
    ],
  },

  appt: {
    smilo: "Appointments — what specifically?",
    avatarState: 'thinking',
    options: [
      { id: 'a-book',        label: 'Book a new appointment',    slug: '02-book-appointment' },
      { id: 'a-reschedule',  label: 'Reschedule an appointment', slug: '02-book-appointment', hint: 'Open the appointment → click Reschedule → pick a new date and time.' },
      { id: 'a-cancel',      label: 'Cancel an appointment',     slug: '02-book-appointment', hint: "Open the appointment → click Cancel. Add a reason — it helps your reports." },
      { id: 'a-noshow',      label: 'Mark a no-show',            slug: '02-book-appointment', hint: "Open the appointment and change the status to 'No Show'. This keeps your reports accurate." },
      { id: 'back',          label: '← Back',                   back: true },
    ],
  },

  billing: {
    smilo: "Billing — what do you need to do?",
    avatarState: 'thinking',
    options: [
      { id: 'b-create',   label: 'Create an invoice',               slug: '04-invoicing-billing' },
      { id: 'b-payment',  label: 'Record a payment / clear balance', slug: '04-invoicing-billing', hint: 'Go to Billing → Outstanding tab → find the patient → click Record Payment.' },
      { id: 'b-discount', label: 'Apply a discount',                slug: '04-invoicing-billing', hint: 'Add the discount on the invoice before saving. A reason is required for audit trail.' },
      { id: 'b-receipt',  label: 'Send receipt to patient',         slug: '04-invoicing-billing', hint: "On any invoice, click 'Send via WhatsApp' to send directly to the patient's number." },
      { id: 'b-fix',      label: 'Fix or refund a paid invoice',    slug: 'billing', hint: "Paid invoices are locked. Use Credit Note to reverse and correct — don't edit the original." },
      { id: 'b-gst',      label: 'Set up GST / tax',               slug: 'billing', hint: 'Go to Settings → Billing → Tax Settings to configure your GST rate and GSTIN.' },
      { id: 'back',       label: '← Back',                        back: true },
    ],
  },

  clinical: {
    smilo: "Clinical records — what are you working on?",
    avatarState: 'thinking',
    options: [
      { id: 'c-treatment',    label: "Record today's treatment",   slug: '03-clinical-charting' },
      { id: 'c-prescription', label: 'Add a prescription',        slug: '03-clinical-charting', hint: 'Open the visit → Prescription section → add drug name, dosage, frequency and duration.' },
      { id: 'c-notes',        label: 'Write clinical notes',      slug: '03-clinical-charting', hint: 'Clinical notes are permanent once saved — write accurately. Add a dated correction note to fix errors.' },
      { id: 'c-xray',         label: 'Attach X-rays or documents', slug: '03-clinical-charting', hint: 'Open the visit → Attachments → upload the file directly to that visit record.' },
      { id: 'back',           label: '← Back',                   back: true },
    ],
  },

  lab: {
    smilo: "Lab orders — what do you need?",
    avatarState: 'thinking',
    options: [
      { id: 'l-create',  label: 'Create a new lab order',      slug: '06-lab-orders' },
      { id: 'l-status',  label: 'Update lab order status',     slug: '06-lab-orders', hint: 'Open the order → change status: Sent → In Progress → Ready for Trial → Received → Fitted.' },
      { id: 'l-receive', label: 'Mark lab work as received',   slug: '06-lab-orders', hint: "Open the order → click 'Mark Received' → note any adjustments needed before fitting." },
      { id: 'back',      label: '← Back',                     back: true },
    ],
  },

  whatsapp: {
    smilo: "WhatsApp — what do you need help with?",
    avatarState: 'thinking',
    options: [
      { id: 'w-enable',   label: 'Enable WhatsApp messaging',         slug: '07-whatsapp-automation', hint: 'Go to WhatsApp → Settings → toggle Enable WhatsApp Messaging to ON, then Save Settings.' },
      { id: 'w-template', label: 'Create or edit a message template', slug: '07-whatsapp-automation' },
      { id: 'w-journey',  label: 'Set up a post-care journey',        slug: '07-whatsapp-automation', hint: 'WhatsApp → Messages tab → Post-Care Journeys → New Journey. Match the treatment name exactly.' },
      { id: 'w-silent',   label: "Patients not receiving messages",   slug: '07-whatsapp-automation', hint: 'Check: (1) WhatsApp is enabled in Settings, (2) the event is toggled on, (3) a template exists for that event and language, (4) patient has a mobile number saved.' },
      { id: 'w-logs',     label: 'Check message delivery logs',       slug: '07-whatsapp-automation', hint: 'Go to WhatsApp → Logs tab to see Scheduled / Sent / Failed messages. Filter by event or date.' },
      { id: 'back',       label: '← Back',                           back: true },
    ],
  },

  email: {
    smilo: "Email — what do you need help with?",
    avatarState: 'thinking',
    options: [
      {
        id: 'e-smtp',
        label: 'Connect SMTP',
        slug: 'email-setup',
        hint: 'Go to Settings → Email → Connection tab. Enter your SMTP host, port, login and password, then click Save & Test. Gmail users should use an App Password, not their main account password.',
      },
      {
        id: 'e-auto-booked',
        label: 'Automation: appointment booked',
        slug: 'email-setup',
        hint: 'Settings → Email → Automation → Appointment Booked. Toggle it on, pick a preset or write a custom subject and body, then Save. The email fires automatically whenever a new appointment is created.',
      },
      {
        id: 'e-auto-completed',
        label: 'Automation: appointment completed',
        slug: 'email-setup',
        hint: 'Settings → Email → Automation → Appointment Completed. Choose which documents to include (Smart Report, Invoice, AI Report) and set your subject and body. The email is sent when the appointment status is marked Completed.',
      },
      {
        id: 'e-send-docs',
        label: 'Send documents to a patient',
        slug: 'email-setup',
        hint: 'On the patient profile or appointment card, click "Send Mail". Choose which documents to attach, pick a preset template or type your own message, confirm the email address, and click Send Email.',
      },
      {
        id: 'e-share',
        label: 'Configure Share with Patient',
        slug: 'email-setup',
        hint: 'Settings → Share with Patient. Set default delivery channels (email, WhatsApp) and toggle branded PDF on or off. These become the defaults every time you share documents with a patient.',
      },
      {
        id: 'e-troubleshoot',
        label: 'Troubleshoot delivery',
        slug: 'email-setup',
        hint: 'Settings → Email → Logs shows every outbound email with status and any error message. Common fixes: (1) verify SMTP credentials with Test button, (2) confirm the patient has an email saved, (3) check spam folder on the patient side.',
      },
      {
        id: 'e-wa-alt',
        label: 'WhatsApp alternative',
        slug: '07-whatsapp-automation',
        hint: 'WhatsApp is text-only in this plan — it cannot send PDF attachments. Use Email to deliver invoices, prescriptions and clinical reports as files. WhatsApp is still great for quick appointment reminders and follow-ups.',
      },
      { id: 'back', label: '← Back', back: true },
    ],
  },

  reports: {
    smilo: "Reports — what would you like to see?",
    avatarState: 'thinking',
    options: [
      { id: 'r-revenue',     label: 'Revenue & collections',        slug: '08-analytics-reports', hint: 'Go to Insights → Revenue Report. Watch both Billed and Collected — they are not the same.' },
      { id: 'r-appts',       label: 'Appointment statistics',       slug: '08-analytics-reports', hint: 'Filter by provider to see individual productivity and no-show rates.' },
      { id: 'r-outstanding', label: 'See all outstanding payments', slug: '04-invoicing-billing', hint: 'Go to Billing → Outstanding tab. Review the 30+ day bucket first.' },
      { id: 'r-export',      label: 'Export data to Excel / CSV',   slug: '08-analytics-reports', hint: "On any report, click 'Export'. The CSV format is clean and ready for your accountant." },
      { id: 'back',          label: '← Back',                      back: true },
    ],
  },

  settings: {
    smilo: "Settings — what would you like to set up?",
    avatarState: 'thinking',
    options: [
      { id: 's-findings',    label: 'Add Clinical Findings',           slug: '09-clinical-data-setup', hint: 'Settings → Clinical Data → Findings → click "Add Findings". Pick one of four options: Add One, Quick Entry, Bulk Upload, or Import from Library.' },
      { id: 's-diagnoses',   label: 'Add Diagnoses',                   slug: '09-clinical-data-setup', hint: 'Settings → Clinical Data → Diagnoses → click "Add Diagnoses". You can add one at a time, paste rows quickly, upload a CSV, or import from our library.' },
      { id: 's-treatments',  label: 'Add Suggested Treatments',        slug: '09-clinical-data-setup', hint: 'Settings → Clinical Data → Treatments → click "Add Treatments". Include the default cost — you can override per-patient later.' },
      { id: 's-bulk',        label: 'Bulk upload via CSV / Google Sheet', slug: '09-clinical-data-setup', hint: 'In any "Add" modal, pick Bulk Upload. Download the sample CSV first — it has the exact column names we expect.' },
      { id: 's-library',     label: 'Import from the starter library', slug: '09-clinical-data-setup', hint: 'Settings → Clinical Data → Add → Import from Library. Pick the items you want, edit before importing, click Import.' },
      { id: 's-errors',      label: 'Fix bulk upload errors',          slug: '09-clinical-data-setup', hint: 'The result modal shows every failed row with its row number, the column that failed, the value you typed, and the reason. Open your sheet at those rows, fix, then re-upload — duplicates from the first pass are skipped.' },
      { id: 's-doctor',      label: 'Add or edit a doctor',            slug: '09-clinical-data-setup', hint: 'Settings → Doctors → Add Doctor. You can save up to 10 doctors per clinic.' },
      { id: 'back',          label: '← Back',                          back: true },
    ],
  },

  broken: {
    smilo: "Sorry to hear that — let's fix it. What's the issue?",
    avatarState: 'concerned',
    options: [
      { id: 'br-login', label: "Can't log in / forgot password",   slug: 'general', hint: "Click 'Forgot Password' on the login page. Check spam if the reset email doesn't arrive." },
      { id: 'br-menu',  label: "Can't see a menu or page",        slug: 'general', hint: 'This is usually role-based access. Ask your clinic admin to check your role permissions under Settings → Users.' },
      { id: 'br-load',  label: 'Page not loading correctly',      slug: 'general', hint: 'Try: (1) Ctrl+Shift+R to hard refresh, (2) clear browser cache, (3) switch to Chrome.' },
      { id: 'br-wa',    label: 'WhatsApp messages not sending',   slug: '07-whatsapp-automation', hint: 'Go to WhatsApp → Settings: is messaging enabled? Is the event toggled on? Does a template exist for that event? Is the patient\'s phone number saved?' },
      { id: 'back',     label: '← Back',                         back: true },
    ],
  },

  // Context-aware entry nodes (shown when opening from a specific page)
  'ctx-appointments': {
    smilo: "I see you're on Appointments — what can I help with?",
    avatarState: 'idle',
    options: [
      { id: 'ca-book',       label: 'Book a new appointment',    slug: '02-book-appointment' },
      { id: 'ca-reschedule', label: 'Reschedule an appointment', slug: '02-book-appointment', hint: 'Open the appointment → Reschedule → pick a new slot.' },
      { id: 'ca-cancel',     label: 'Cancel an appointment',     slug: '02-book-appointment', hint: "Open the appointment → Cancel and add a reason." },
      { id: 'ca-noshow',     label: 'Mark a no-show',            slug: '02-book-appointment', hint: "Change the status to 'No Show' on the appointment." },
      { id: 'other',         label: 'Something else',            next: 'root' },
    ],
  },

  'ctx-patients': {
    smilo: "I see you're on Patients — what do you need?",
    avatarState: 'idle',
    options: [
      { id: 'cp-register', label: 'Register a new patient',         slug: '01-patient-registration' },
      { id: 'cp-search',   label: 'Search for an existing patient', slug: '01-patient-registration', hint: 'Search by phone — it\'s the fastest way to find a patient.' },
      { id: 'cp-history',  label: "View patient history",           slug: '03-clinical-charting' },
      { id: 'other',       label: 'Something else',                 next: 'root' },
    ],
  },

  'ctx-billing': {
    smilo: "I see you're on Billing — what do you need?",
    avatarState: 'idle',
    options: [
      { id: 'cb-create',  label: 'Create a new invoice',             slug: '04-invoicing-billing' },
      { id: 'cb-payment', label: 'Record a payment / clear balance', slug: '04-invoicing-billing', hint: 'Outstanding tab → find patient → Record Payment.' },
      { id: 'cb-fix',     label: 'Fix or refund a paid invoice',     slug: 'billing', hint: 'Use a Credit Note — paid invoices cannot be edited.' },
      { id: 'other',      label: 'Something else',                   next: 'root' },
    ],
  },

  'ctx-lab': {
    smilo: "I see you're on Lab Orders — what do you need?",
    avatarState: 'idle',
    options: [
      { id: 'cl-create',  label: 'Create a lab order',      slug: '06-lab-orders' },
      { id: 'cl-status',  label: 'Update an order status',  slug: '06-lab-orders' },
      { id: 'cl-receive', label: 'Mark work as received',   slug: '06-lab-orders' },
      { id: 'other',      label: 'Something else',          next: 'root' },
    ],
  },

  'ctx-whatsapp': {
    smilo: "I see you're on WhatsApp — need help?",
    avatarState: 'idle',
    options: [
      { id: 'cw-enable',   label: 'Enable WhatsApp messaging',     slug: '07-whatsapp-automation', hint: 'Settings tab → toggle Enable WhatsApp Messaging → Save Settings.' },
      { id: 'cw-template', label: 'Create a message template',     slug: '07-whatsapp-automation' },
      { id: 'cw-journey',  label: 'Set up a post-care journey',    slug: '07-whatsapp-automation', hint: 'Messages tab → Post-Care Journeys → New Journey. Treatment name must match exactly.' },
      { id: 'cw-silent',   label: 'Messages not being sent',       slug: '07-whatsapp-automation', hint: 'Check: WhatsApp enabled? Event toggled on? Template exists? Patient has phone number?' },
      { id: 'other',       label: 'Something else',                next: 'root' },
    ],
  },

  'ctx-reports': {
    smilo: "I see you're on Reports — what are you looking for?",
    avatarState: 'idle',
    options: [
      { id: 'cr-revenue',     label: 'Revenue & collections',  slug: '08-analytics-reports' },
      { id: 'cr-outstanding', label: 'Outstanding payments',   slug: '04-invoicing-billing' },
      { id: 'cr-export',      label: 'Export to CSV',          slug: '08-analytics-reports' },
      { id: 'other',          label: 'Something else',         next: 'root' },
    ],
  },

  'ctx-settings': {
    smilo: "I see you're on Settings — what are you setting up?",
    avatarState: 'idle',
    options: [
      { id: 'cs-findings',   label: 'Add clinical findings',        slug: '09-clinical-data-setup', hint: 'Open the Clinical Data tab → Findings → click Add Findings. Pick Add One, Quick Entry, Bulk Upload, or Import from Library.' },
      { id: 'cs-diagnoses',  label: 'Add diagnoses',                slug: '09-clinical-data-setup', hint: 'Clinical Data tab → Diagnoses → Add Diagnoses. Same four options.' },
      { id: 'cs-treatments', label: 'Add suggested treatments',     slug: '09-clinical-data-setup', hint: 'Clinical Data tab → Treatments → Add Treatments. Default cost can be overridden per patient.' },
      { id: 'cs-bulk',       label: 'Upload a CSV / Google Sheet',  slug: '09-clinical-data-setup', hint: 'Click Add → Bulk Upload → download the sample CSV first so the headers match exactly.' },
      { id: 'cs-errors',     label: 'Bulk upload showed errors',    slug: '09-clinical-data-setup', hint: 'The error table shows the row number, column, value and reason for each skipped row. Header is row 1, first data row is row 2.' },
      { id: 'cs-doctor',     label: 'Add or edit a doctor',         slug: '09-clinical-data-setup' },
      { id: 'other',         label: 'Something else',               next: 'root' },
    ],
  },
};
