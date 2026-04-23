import React from 'react';

const stroke = {
    width: 1.65,
    cap: 'round',
    join: 'round',
};

function IconDashboard() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-7H9.5v7H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                strokeWidth={stroke.width}
                strokeLinecap={stroke.cap}
                strokeLinejoin={stroke.join}
            />
        </svg>
    );
}

function IconAnalysis() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 19V5" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} />
            <path d="M4 19h16" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} />
            <path
                d="M8 16v-3M12 16V8M16 16v-5M20 16v-9"
                stroke="currentColor"
                strokeWidth={stroke.width}
                strokeLinecap={stroke.cap}
            />
        </svg>
    );
}

function IconPredictions() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M4 19h16M7 15l3-4 3 2 4-6 3 3"
                stroke="currentColor"
                strokeWidth={stroke.width}
                strokeLinecap={stroke.cap}
                strokeLinejoin={stroke.join}
            />
            <path
                d="M7 15V9M13 13V7M17 10V5"
                stroke="currentColor"
                strokeWidth={stroke.width}
                strokeLinecap={stroke.cap}
            />
        </svg>
    );
}

function IconInsights() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={stroke.width} />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} />
            <path d="M11 8v4M11 14h.01" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} />
        </svg>
    );
}

function IconAnomalies() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 14l4-4 4 4 8-8" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} strokeLinejoin={stroke.join} />
            <path d="M16 6h4v4" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} strokeLinejoin={stroke.join} />
        </svg>
    );
}

function IconAlerts() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M14 18a2 2 0 1 1-4 0h4Z"
                stroke="currentColor"
                strokeWidth={stroke.width}
                strokeLinecap={stroke.cap}
                strokeLinejoin={stroke.join}
            />
            <path
                d="M6 15h12l-1.2-2.4A2 2 0 0 1 16.4 11V8a4 4 0 1 0-8 0v3a2 2 0 0 1-.8 1.6L6 15Z"
                stroke="currentColor"
                strokeWidth={stroke.width}
                strokeLinecap={stroke.cap}
                strokeLinejoin={stroke.join}
            />
        </svg>
    );
}

function IconLogout() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M10 17H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} />
            <path d="M14 15l4-3-4-3M18 12H9" stroke="currentColor" strokeWidth={stroke.width} strokeLinecap={stroke.cap} strokeLinejoin={stroke.join} />
        </svg>
    );
}

function IconMark() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12 2L4 7v6c0 5.25 3.5 10.25 8 11 4.5-.75 8-5.75 8-11V7l-8-5Z"
                stroke="#34d399"
                strokeWidth="1.5"
                strokeLinejoin="round"
                fill="rgba(52, 211, 153, 0.12)"
            />
            <path d="M12 8v5M12 16h.01" stroke="#ecfdf5" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
    );
}

const MENU = [
    { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
    { id: 'temporal', label: 'Analysis', Icon: IconAnalysis },
    { id: 'ml', label: 'Predictions', Icon: IconPredictions },
    { id: 'correlation', label: 'Insights', Icon: IconInsights },
    { id: 'anomalies', label: 'Anomalies', Icon: IconAnomalies },
    { id: 'alerts', label: 'Alerts', Icon: IconAlerts },
];

const Sidebar = ({ activeTab, setActiveTab, onLogout }) => {
    return (
        <aside className="sidebar" aria-label="Main navigation">
            <div className="sidebar-brand">
                <div className="sidebar-brand__mark" aria-hidden>
                    <IconMark />
                </div>
                <div className="sidebar-brand__text">
                    <span className="sidebar-brand__name">AgriSmart</span>
                    <span className="sidebar-brand__tag">IoT Soil Intelligence</span>
                </div>
            </div>

            <p className="sidebar-section-label">Workspace</p>
            <nav className="sidebar-nav" aria-label="Primary">
                {MENU.map(({ id, label, Icon }) => {
                    const active = activeTab === id;
                    return (
                        <button
                            key={id}
                            type="button"
                            className={`sidebar-link${active ? ' sidebar-link--active' : ''}`}
                            onClick={() => setActiveTab(id)}
                            aria-current={active ? 'page' : undefined}
                        >
                            <span className="sidebar-link__pill" aria-hidden />
                            <span className="sidebar-link__icon">
                                <Icon />
                            </span>
                            <span className="sidebar-link__label">{label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="sidebar-rail" aria-hidden />

            <div className="sidebar-footer">
                <button type="button" className="sidebar-logout" onClick={onLogout}>
                    <span className="sidebar-logout__icon">
                        <IconLogout />
                    </span>
                    <span className="sidebar-logout__text">Exit dashboard</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
