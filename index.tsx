import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, getAccessList } from './services/firebase';
import App from './App';
import { LoginPage } from './components/LoginPage';
import { AccessDeniedPage } from './components/AccessDeniedPage';

const AuthWrapper: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessList, setAccessList] = useState<string[]>([]);
  const [accessListLoading, setAccessListLoading] = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch access list when user is available
  useEffect(() => {
    if (user) {
      setAccessListLoading(true);
      getAccessList()
        .then((list) => {
          console.log("Access list fetched:", list);
          console.log("User email:", user.email);
          setAccessList(list);
        })
        .catch((error) => {
          console.error("Failed to fetch access list", error);
        })
        .finally(() => {
          setAccessListLoading(false);
        });
    } else {
      setAccessList([]);
      setAccessListLoading(false);
    }
  }, [user]);

  // Show loading while auth or access list is loading
  if (authLoading || accessListLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const isAuthorized = user && accessList.includes(user.email || '');

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to="/" replace /> : <LoginPage />} 
      />
      <Route 
        path="/access-denied" 
        element={<AccessDeniedPage />} 
      />
      <Route 
        path="/" 
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : !isAuthorized ? (
            <Navigate to="/access-denied" replace />
          ) : (
            <App />
          )
        } 
      />
    </Routes>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthWrapper />
    </BrowserRouter>
  </React.StrictMode>
);