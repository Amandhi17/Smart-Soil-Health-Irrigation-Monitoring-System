import React from 'react';

const Sidebar = ({ activeTab, setActiveTab, onLogout }) => {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
        { id: 'temporal', label: 'Analysis', icon: '📊' },
        { id: 'ml', label: 'Predictions', icon: '🤖' },
        { id: 'correlation', label: 'Insights', icon: '🔍' },
        { id: 'alerts', label: 'Alerts', icon: '🚨' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <span className="brand-icon">🌱</span>
                <div className="brand-text">
                    <h2>AgriSmart</h2>
                    <p>IoT Soil Intelligence</p>
                </div>
            </div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(item.id)}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout-btn" onClick={onLogout}>
                    <span className="nav-icon">🚪</span>
                    <span className="nav-label">Exit Dashboard</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
