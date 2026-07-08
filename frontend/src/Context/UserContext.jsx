import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../services/api';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [credits, setCredits] = useState(null); // AI report credits (1 credit = 1 min)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  // Fetch just the AI credit balance — cheap enough to call after a report debit
  // so the nav pill stays live without reloading the whole profile.
  const reloadCredits = async () => {
    try {
      const token = localStorage.getItem('dms_token');
      if (!token) return;
      const res = await API.get('/credits/balance');
      setCredits(res.data.credits ?? 0);
    } catch (err) {
      // Non-owners are still allowed to call this; only fails on network/auth.
      console.error('Failed to load credits:', err.message);
    }
  };

  const loadProfile = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('dms_token');
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await API.get('/users/profile');
      setUser(res.data.user);
      setTenant(res.data.tenant);
      reloadCredits();
    } catch (err) {
      console.error('Failed to load user profile:', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <UserContext.Provider value={{ user, tenant, credits, loading, reload: loadProfile, reloadCredits }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
}
