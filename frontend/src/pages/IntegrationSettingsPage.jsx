import { useState, useEffect } from 'react';
import { useIntegration } from '../Context/IntegrationContext';
import {
  CheckCircle, AlertCircle, HardDrive, Mail, MessageSquare,
  Loader2, Send, RefreshCw, ExternalLink, Eye, EyeOff
} from 'lucide-react';

export default function IntegrationSettingsPage() {
  const {
    integrations, loading, checkAllIntegrations, getStorageInfo,
    sendTestEmail, sendTestWhatsApp
  } = useIntegration();

  const [storage, setStorage] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [showSettings, setShowSettings] = useState({ google: false, gmail: false, whatsapp: false });

  useEffect(() => {
    const fetchStorage = async () => {
      const data = await getStorageInfo();
      setStorage(data);
    };
    fetchStorage();
  }, [getStorageInfo]);

  const handleTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmail) return;
    setTestingEmail(true);
    try {
      await sendTestEmail(testEmail);
      setTestResults(prev => ({ ...prev, email: { success: true, message: `Test email sent to ${testEmail}` } }));
      setTimeout(() => setTestEmail(''), 1000);
    } catch (error) {
      setTestResults(prev => ({ ...prev, email: { success: false, message: error.response?.data?.error || error.message } }));
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestWhatsApp = async (e) => {
    e.preventDefault();
    if (!testPhone) return;
    setTestingWhatsApp(true);
    try {
      await sendTestWhatsApp(testPhone);
      setTestResults(prev => ({ ...prev, whatsapp: { success: true, message: `Test message sent to ${testPhone}` } }));
      setTimeout(() => setTestPhone(''), 1000);
    } catch (error) {
      setTestResults(prev => ({ ...prev, whatsapp: { success: false, message: error.response?.data?.error || error.message } }));
    } finally {
      setTestingWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-[#137fec]" size={40} />
      </div>
    );
  }

  const IntegrationCard = ({ title, icon: Icon, integration, isVerified, isConfigured, onTest, testForm, children }) => (
    <div className="border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-[#137fec]/10 rounded-lg">
            <Icon size={24} className="text-[#137fec]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            <p className="text-sm text-slate-500 mt-1">
              {isConfigured ? (
                isVerified ? (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle size={14} /> Verified & Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertCircle size={14} /> Configured, not verified
                  </span>
                )
              ) : (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertCircle size={14} /> Not configured
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(prev => ({ ...prev, [integration]: !prev[integration] }))}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Toggle details"
        >
          {showSettings[integration] ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showSettings[integration] && (
        <>
          {children}
          {testForm && isConfigured && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              {testForm}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800">Integration Settings</h1>
        <p className="text-slate-500 mt-1">Verify and test your Connect Cloud connections</p>
      </div>

      {/* Google Drive Integration */}
      <IntegrationCard
        title="Connect Cloud (Google Drive)"
        icon={HardDrive}
        integration="google"
        isConfigured={integrations.google_drive?.isConfigured}
        isVerified={integrations.google_drive?.isVerified}
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p>Status: <span className="font-semibold">{integrations.google_drive?.isConfigured ? '✓ Configured' : '✗ Not configured'}</span></p>
          {storage && (
            <>
              <p>Storage: <span className="font-semibold text-[#137fec]">{storage.displayText}</span></p>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#137fec] h-full transition-all"
                  style={{ width: `${Math.min(storage.percentUsed, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">{storage.percentUsed}% used</p>
            </>
          )}
          {integrations.google_drive?.lastError && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-xs">
              {integrations.google_drive.lastError}
            </div>
          )}
        </div>
      </IntegrationCard>

      {/* Gmail Integration */}
      <IntegrationCard
        title="Email (Gmail/SMTP)"
        icon={Mail}
        integration="gmail"
        isConfigured={integrations.gmail?.isConfigured}
        isVerified={integrations.gmail?.isVerified}
        testForm={
          <form onSubmit={handleTestEmail} className="space-y-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Test Email Address</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none"
                />
                <button
                  type="submit"
                  disabled={testingEmail || !testEmail}
                  className="px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2 font-medium transition-colors"
                >
                  {testingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Send Test
                </button>
              </div>
              {testResults.email && (
                <p className={`text-xs mt-2 ${testResults.email.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResults.email.message}
                </p>
              )}
            </div>
          </form>
        }
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p>Status: <span className="font-semibold">{integrations.gmail?.isConfigured ? '✓ Configured' : '✗ Not configured'}</span></p>
          <p>Verified: <span className="font-semibold">{integrations.gmail?.isVerified ? '✓ Yes' : '✗ No - send test email'}</span></p>
          {integrations.gmail?.lastError && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-xs">
              {integrations.gmail.lastError}
            </div>
          )}
        </div>
      </IntegrationCard>

      {/* WhatsApp Integration */}
      <IntegrationCard
        title="WhatsApp (WAAPI)"
        icon={MessageSquare}
        integration="whatsapp"
        isConfigured={integrations.whatsapp?.isConfigured}
        isVerified={integrations.whatsapp?.isVerified}
        testForm={
          <form onSubmit={handleTestWhatsApp} className="space-y-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Test Phone Number</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+91 98765 43210 or 9876543210"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#137fec] outline-none"
                />
                <button
                  type="submit"
                  disabled={testingWhatsApp || !testPhone}
                  className="px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2 font-medium transition-colors"
                >
                  {testingWhatsApp ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Send Test
                </button>
              </div>
              {testResults.whatsapp && (
                <p className={`text-xs mt-2 ${testResults.whatsapp.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResults.whatsapp.message}
                </p>
              )}
            </div>
          </form>
        }
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p>Status: <span className="font-semibold">{integrations.whatsapp?.isConfigured ? '✓ Configured' : '✗ Not configured'}</span></p>
          <p>Verified: <span className="font-semibold">{integrations.whatsapp?.isVerified ? '✓ Yes' : '✗ No - send test message'}</span></p>
          {integrations.whatsapp?.lastError && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700 text-xs">
              {integrations.whatsapp.lastError}
            </div>
          )}
        </div>
      </IntegrationCard>

      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Integration Summary</h3>
        <ul className="space-y-1 text-sm text-blue-800">
          <li className="flex items-center gap-2">
            {integrations.google_drive?.isVerified ? (
              <CheckCircle size={16} className="text-green-600" />
            ) : (
              <AlertCircle size={16} className="text-amber-600" />
            )}
            <strong>Connect Cloud:</strong> {integrations.google_drive?.isVerified ? 'Ready' : 'Needs setup'}
          </li>
          <li className="flex items-center gap-2">
            {integrations.gmail?.isVerified ? (
              <CheckCircle size={16} className="text-green-600" />
            ) : (
              <AlertCircle size={16} className="text-amber-600" />
            )}
            <strong>Email:</strong> {integrations.gmail?.isVerified ? 'Ready' : 'Needs verification'}
          </li>
          <li className="flex items-center gap-2">
            {integrations.whatsapp?.isVerified ? (
              <CheckCircle size={16} className="text-green-600" />
            ) : (
              <AlertCircle size={16} className="text-amber-600" />
            )}
            <strong>WhatsApp:</strong> {integrations.whatsapp?.isVerified ? 'Ready' : 'Needs verification'}
          </li>
        </ul>
      </div>

      <button
        onClick={checkAllIntegrations}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium"
      >
        <RefreshCw size={16} /> Refresh Status
      </button>
    </div>
  );
}
