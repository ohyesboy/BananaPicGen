import React from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, auth } from '../services/firebase';
import { AlertCircle } from 'lucide-react';

export const AccessDeniedPage: React.FC = () => {
  const navigate = useNavigate();
  const userEmail = auth?.currentUser?.email || 'Unknown';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
      <div className="bg-slate-800 p-8 rounded-lg shadow-xl max-w-md w-full text-center border border-slate-700">
        <div className="flex justify-center mb-6">
            <AlertCircle className="text-red-500 w-16 h-16" />
        </div>
        <h1 className="text-2xl font-bold mb-4 text-white">Access Denied</h1>
        <p className="text-slate-400 mb-2">
          Your account is not authorized to access this application.
        </p>
        <p className="text-slate-500 text-sm mb-8">
          Signed in as: <span className="text-slate-300">{userEmail}</span>
        </p>
        
        <button 
          onClick={handleLogout}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded transition"
        >
          Logout
        </button>
      </div>
    </div>
  );
};
