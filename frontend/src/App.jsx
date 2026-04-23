import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TemporalAnalysisPanel from './components/TemporalAnalysisPanel';
import AlertsPanel from './components/AlertsPanel';
import CorrelationPanel from './components/CorrelationPanel';
import MLPredictionPanel from './components/MLPredictionPanel';
import Login from './components/Login';
import Register from './components/Register';
import DashboardHome from './components/DashboardHome';
import AnomalyDetectionPanel from './components/AnomalyDetectionPanel';
import ChatBot from './components/ChatBot';

function toTitleCase(name) {
  if (!name || typeof name !== 'string') return 'Farm operator';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function getInitials(name) {
  if (!name || typeof name !== 'string') return 'AG';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  const location = "ESP32_Plant_01";

  useEffect(() => {
    // Check for existing session
    const storedUser = localStorage.getItem('agri_user');
    const token = localStorage.getItem('agri_token');

    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="loading pulse">Preparing your farm...</div>;
  }

  const handleLogout = () => {
    localStorage.removeItem('agri_token');
    localStorage.removeItem('agri_user');
    setUser(null);
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  if (!user) {
    return authMode === 'login'
      ? <Login onSwitchToRegister={() => setAuthMode('register')} onLoginSuccess={handleLoginSuccess} />
      : <Register onSwitchToLogin={() => setAuthMode('login')} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardHome location={location} />;
      case 'temporal':
        return <TemporalAnalysisPanel location={location} />;
      case 'alerts':
        return (
          <div className="tab-layout-grid alerts-full">
            <AlertsPanel location={location} />
          </div>
        );
      case 'correlation':
        return (
          <div className="tab-layout-grid full-width-card">
            <CorrelationPanel location={location} />
          </div>
        );
      case 'ml':
        return (
          <div className="tab-layout-grid full-width-card">
            <MLPredictionPanel location={location} />
          </div>
        );
      case 'anomalies':
        return (
          <div className="tab-layout-grid full-width-card">
            <AnomalyDetectionPanel location={location} />
          </div>
        );
      default:
        return <TemporalAnalysisPanel location={location} />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
      <main className="main-content">
        <header className="content-header">
          <div className="header-titles">
            <h1>
              {activeTab === 'dashboard' && 'Farm Control Center'}
              {activeTab === 'temporal' && 'Temporal Analysis'}
              {activeTab === 'alerts' && 'Threshold Alerts'}
              {activeTab === 'correlation' && 'Correlation Discovery'}
              {activeTab === 'ml' && 'Intelligent irrigation'}
              {activeTab === 'anomalies' && 'Statistical anomalies'}
            </h1>
          </div>
          <div className="header-profile" role="group" aria-label="Signed-in account">
            <div className="header-profile__avatar" aria-hidden title={user.fullName || 'User'}>
              {getInitials(user.fullName)}
            </div>
            <div className="header-profile__body">
              <span className="header-profile__name">{toTitleCase(user.fullName)}</span>
              <span className="header-profile__farm">{user.farmName || 'Primary operation'}</span>
            </div>
            <span className="header-profile__status" title="Session active" aria-label="Session active" />
          </div>
        </header>
        <div className="tab-content">
          {renderContent()}
        </div>
      </main>
      <ChatBot location={location} activeTab={activeTab} onNavigate={setActiveTab} />
    </div>
  );
}

export default App;
