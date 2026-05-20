import { useLocation, useNavigate, Link } from 'react-router-dom';

function toISTFull(dt) {
  return new Date(dt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// Generate ICS file content for "Add to Calendar"
function generateICS({ title, start, end, location, description }) {
  const fmt = (d) =>
    new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Molaris DMS//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@molaris`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    description ? `DESCRIPTION:${description}` : '',
    'STATUS:TENTATIVE',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

function downloadICS(icsContent, filename) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BookingConfirmPage() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const { appointment, form, clinic } = state || {};

  // If no state (user navigated directly), show error
  if (!appointment) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">🔗</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Nothing to show here</h2>
          <p className="text-gray-500 text-sm mb-6">Please use the clinic's booking link to make an appointment.</p>
          <button onClick={() => navigate(-1)} className="text-[#137fec] font-semibold text-sm">← Go back</button>
        </div>
      </div>
    );
  }

  const startTime  = appointment.start_time;
  const endTime    = appointment.end_time;
  const clinicName = clinic?.name || 'Your Dental Clinic';
  const address    = [clinic?.address, clinic?.city].filter(Boolean).join(', ');

  function handleAddToCalendar() {
    const ics = generateICS({
      title:       `${form?.service_name || 'Dental Appointment'} at ${clinicName}`,
      start:       startTime,
      end:         endTime,
      location:    address,
      description: `Appointment at ${clinicName}. Please arrive 5-10 minutes early. Status: Requested - awaiting confirmation.`,
    });
    downloadICS(ics, `appointment_${new Date(startTime).toISOString().slice(0,10)}.ics`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-[#137fec] text-white px-4 py-5">
        <div className="max-w-md mx-auto flex items-center gap-3">
          {clinic?.logoUrl
            ? <img src={clinic.logoUrl} alt={clinicName} className="h-10 w-10 rounded-full object-cover bg-white" />
            : <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                {clinicName[0].toUpperCase()}
              </div>
          }
          <div>
            <h1 className="font-bold text-lg">{clinicName}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-8">
        {/* Success card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center mb-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Request Received!</h2>
          <p className="text-gray-500 text-sm">
            Your appointment request has been submitted. The clinic will confirm it shortly — you'll be notified via WhatsApp{form?.email ? ' and email' : ''}.
          </p>
        </div>

        {/* Appointment details */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Appointment Summary</h3>
          <div className="space-y-3">
            <DetailRow icon="👤" label="Name" value={`${form?.first_name} ${form?.last_name || ''}`.trim()} />
            <DetailRow icon="📅" label="Date & Time" value={toISTFull(startTime)} />
            <DetailRow icon="🦷" label="Service" value={form?.service_name || appointment.type || 'Consultation'} />
            {address && <DetailRow icon="📍" label="Address" value={address} />}
            {clinic?.phone && <DetailRow icon="📞" label="Phone" value={clinic.phone} />}
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-amber-500">⏳</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Pending Confirmation</p>
                <p className="text-xs text-amber-600">The clinic will review and confirm your appointment.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button onClick={handleAddToCalendar}
            className="w-full py-3 bg-white border border-[#137fec] text-[#137fec] font-semibold rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
            <CalendarIcon />
            Add to Calendar
          </button>

          {clinic?.phone && (
            <a href={`tel:${clinic.phone}`}
              className="w-full py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <PhoneIcon />
              Call {clinicName}
            </a>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Powered by <span className="font-semibold text-[#137fec]">Molaris DMS</span>
        </p>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-800 leading-snug">{value}</p>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}
