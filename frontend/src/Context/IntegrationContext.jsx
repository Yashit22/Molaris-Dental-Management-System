import React, { createContext, useState, useCallback, useEffect, useContext } from 'react';
import API from '../services/api';
import { useAuth } from './AuthContext.jsx';

export const IntegrationContext = createContext();

export function IntegrationProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [integrations, setIntegrations] = useState({
    google_drive: { isConfigured: false, isVerified: false, storageGB: null, lastError: null },
    gmail: { isConfigured: false, isVerified: false, lastError: null },
    whatsapp: { isConfigured: false, isVerified: false, lastError: null },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAllIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await API.get('/integrations/status/all');
      setIntegrations(data.status);
      return data;
    } catch (err) {
      console.error('[Integration Context] Error checking integrations:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkGoogleDrive = useCallback(async () => {
    try {
      const { data } = await API.get('/integrations/status/google-drive');
      setIntegrations(prev => ({ ...prev, google_drive: data.status }));
      return data.status;
    } catch (err) {
      console.error('[Integration Context] Error checking Google Drive:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const checkGmail = useCallback(async () => {
    try {
      const { data } = await API.get('/integrations/status/gmail');
      setIntegrations(prev => ({ ...prev, gmail: data.status }));
      return data.status;
    } catch (err) {
      console.error('[Integration Context] Error checking Gmail:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const checkWhatsApp = useCallback(async () => {
    try {
      const { data } = await API.get('/integrations/status/whatsapp');
      setIntegrations(prev => ({ ...prev, whatsapp: data.status }));
      return data.status;
    } catch (err) {
      console.error('[Integration Context] Error checking WhatsApp:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const getStorageInfo = useCallback(async () => {
    try {
      const { data } = await API.get('/integrations/storage');
      return data.storage;
    } catch (err) {
      console.error('[Integration Context] Error getting storage info:', err);
      return null;
    }
  }, []);

  const sendTestEmail = useCallback(async (email) => {
    try {
      const { data } = await API.post('/integrations/test/email', { email });
      setIntegrations(prev => ({ ...prev, gmail: { ...prev.gmail, isVerified: true } }));
      return data;
    } catch (err) {
      console.error('[Integration Context] Error sending test email:', err);
      throw err;
    }
  }, []);

  const sendTestWhatsApp = useCallback(async (phone) => {
    try {
      const { data } = await API.post('/integrations/test/whatsapp', { phone });
      setIntegrations(prev => ({ ...prev, whatsapp: { ...prev.whatsapp, isVerified: true } }));
      return data;
    } catch (err) {
      console.error('[Integration Context] Error sending test WhatsApp:', err);
      throw err;
    }
  }, []);

  // Check integrations on mount — only when authenticated.
  // Running this on public pages (e.g. /reset-password) would fire an
  // authenticated request, get a 401, and trigger the global redirect to /login.
  useEffect(() => {
    if (isAuthenticated) checkAllIntegrations();
  }, [isAuthenticated, checkAllIntegrations]);

  const value = {
    integrations,
    loading,
    error,
    checkAllIntegrations,
    checkGoogleDrive,
    checkGmail,
    checkWhatsApp,
    getStorageInfo,
    sendTestEmail,
    sendTestWhatsApp,
    isCloudVerified: integrations.google_drive?.isVerified || false,
    isEmailVerified: integrations.gmail?.isVerified || false,
    isWhatsAppVerified: integrations.whatsapp?.isVerified || false,
    allVerified:
      integrations.google_drive?.isVerified &&
      integrations.gmail?.isVerified &&
      integrations.whatsapp?.isVerified,
  };

  return <IntegrationContext.Provider value={value}>{children}</IntegrationContext.Provider>;
}

export function useIntegration() {
  const context = useContext(IntegrationContext);
  if (!context) {
    throw new Error('useIntegration must be used within IntegrationProvider');
  }
  return context;
}
