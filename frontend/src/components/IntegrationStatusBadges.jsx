import { useIntegration } from '../Context/IntegrationContext';
import { CheckCircle, AlertCircle, XCircle, Lock } from 'lucide-react';

export function CloudStorageBadge() {
  const { integrations, storage } = useIntegration();
  const status = integrations.google_drive;

  if (!status) return null;

  if (!status.isVerified) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
        <XCircle size={14} />
        Connect Cloud not verified
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium">
      <CheckCircle size={14} />
      Cloud {status.storageGB || 'Ready'}
    </div>
  );
}

export function EmailIntegrationBadge() {
  const { integrations } = useIntegration();
  const status = integrations.gmail;

  if (!status) return null;

  if (!status.isVerified) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium">
        <AlertCircle size={14} />
        Email not verified
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium">
      <CheckCircle size={14} />
      Email Ready
    </div>
  );
}

export function WhatsAppIntegrationBadge() {
  const { integrations } = useIntegration();
  const status = integrations.whatsapp;

  if (!status) return null;

  if (!status.isVerified) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-medium">
        <AlertCircle size={14} />
        WhatsApp not verified
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-medium">
      <CheckCircle size={14} />
      WhatsApp Ready
    </div>
  );
}

export function IntegrationBlocker({ feature, requiredIntegration, children }) {
  const { integrations } = useIntegration();

  const featureMap = {
    'cloud_upload': 'google_drive',
    'email_send': 'gmail',
    'whatsapp_send': 'whatsapp',
  };

  const integrationKey = requiredIntegration || featureMap[feature];
  const isVerified = integrations[integrationKey]?.isVerified;

  if (isVerified) {
    return children;
  }

  const integrationNames = {
    google_drive: 'Connect Cloud',
    gmail: 'Email',
    whatsapp: 'WhatsApp',
  };

  const integrationName = integrationNames[integrationKey] || 'Integration';

  return (
    <div className="relative group">
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white border border-amber-200 rounded-lg p-3 shadow-lg text-center">
          <div className="flex items-center justify-center gap-2 text-amber-700 mb-1 font-medium text-sm">
            <Lock size={16} />
            {integrationName} Not Verified
          </div>
          <p className="text-xs text-amber-600">Go to Integration Settings to verify</p>
        </div>
      </div>
    </div>
  );
}

export function AllIntegrationsStatus() {
  const { integrations } = useIntegration();

  const allVerified =
    integrations.google_drive?.isVerified &&
    integrations.gmail?.isVerified &&
    integrations.whatsapp?.isVerified;

  const configured =
    (integrations.google_drive?.isConfigured ? 1 : 0) +
    (integrations.gmail?.isConfigured ? 1 : 0) +
    (integrations.whatsapp?.isConfigured ? 1 : 0);

  if (allVerified) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
        <CheckCircle size={16} className="text-green-600" />
        <span className="text-sm font-medium text-green-700">All integrations verified</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
      <AlertCircle size={16} className="text-amber-600" />
      <span className="text-sm font-medium text-amber-700">
        {configured}/3 integrations verified
      </span>
    </div>
  );
}
