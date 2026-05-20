import { X } from 'lucide-react';

function getDeviceInfo() {
  const ua = navigator.userAgent;
  return {
    isIOS:     /iPad|iPhone|iPod/.test(ua) && !window.MSStream,
    isAndroid: /Android/.test(ua),
  };
}

const STEPS = {
  'permission-denied': {
    iOS: [
      'Tap the "aA" icon in the Safari address bar',
      'Tap "Website Settings"',
      'Tap "Microphone" → select "Allow"',
      'Reload the page and try again',
    ],
    android: [
      'Tap the lock icon in the Chrome address bar',
      'Tap "Permissions"',
      'Tap "Microphone" → select "Allow"',
      'Reload the page and try again',
    ],
    desktop: [
      'Click the lock or info icon in the address bar',
      'Find "Microphone" in the permissions list',
      'Change it to "Allow"',
      'Reload the page and try again',
    ],
  },
  'no-microphone': {
    iOS: [
      'Check that your device has a working microphone',
      'Try removing and re-inserting any connected headset',
      'Restart Safari and try again',
    ],
    android: [
      'Check that no other app is using the microphone',
      'Try removing and re-inserting any connected headset',
      'Restart Chrome and try again',
    ],
    desktop: [
      'Check that a microphone is connected and recognised by your OS',
      'Open System Settings → Sound → Input and confirm the device appears',
      'Reload the page and try again',
    ],
  },
  'in-use': {
    iOS: [
      'Close other apps that may be using the microphone (calls, Voice Memos)',
      'Return to Safari and try again',
    ],
    android: [
      'Close other apps that may be using the microphone (calls, recorder apps)',
      'Return to Chrome and try again',
    ],
    desktop: [
      'Close any other app using the microphone (video calls, recording software)',
      'Reload the page and try again',
    ],
  },
  'interrupted': {
    iOS: [
      'End or decline the incoming call',
      'Return to the page and tap Dictate again',
    ],
    android: [
      'End or decline the incoming call',
      'Return to the page and tap Dictate again',
    ],
    desktop: [
      'Close any app that took over the microphone',
      'Reload and try again',
    ],
  },
  'browser-unsupported': {
    iOS: [
      'This feature requires Safari on iOS 14.5 or later',
      'Update iOS in Settings → General → Software Update',
    ],
    android: [
      'This feature requires Chrome 74 or later',
      'Update Chrome from the Play Store',
    ],
    desktop: [
      'Use Google Chrome, Firefox, or Microsoft Edge (latest version)',
      'Update your browser and reload the page',
    ],
  },
};

const TITLES = {
  'permission-denied':   'Microphone permission needed',
  'no-microphone':       'No microphone detected',
  'in-use':              'Microphone is in use',
  'interrupted':         'Recording was interrupted',
  'browser-unsupported': 'Browser not supported',
};

export default function MicPermissionHelp({ errorCode, onClose }) {
  const { isIOS, isAndroid } = getDeviceInfo();
  const platform = isIOS ? 'iOS' : isAndroid ? 'android' : 'desktop';
  const steps    = STEPS[errorCode]?.[platform] || STEPS['permission-denied'][platform];
  const title    = TITLES[errorCode] || 'Microphone issue';

  return (
    <div
      className="fixed inset-0 z-[500] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden mb-2"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 pb-6">
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#137fec]/10 text-[#137fec] text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-700 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <button
            onClick={onClose}
            className="mt-5 w-full py-3 bg-[#137fec] hover:bg-blue-600 text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
