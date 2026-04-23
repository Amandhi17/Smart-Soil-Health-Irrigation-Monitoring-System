import React, { useState } from 'react';
import axios from 'axios';
import AuthBrandMark from './AuthBrandMark';

const Register = ({ onSwitchToLogin }) => {
    const [fullName, setFullName] = useState('');
    const [farmName, setFarmName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            return setError('Passwords do not match');
        }
        setLoading(true);
        setError('');
        try {
            await axios.post('http://localhost:5000/api/auth/register', {
                fullName,
                farmName,
                email,
                password
            });

            // Optionally auto-login or redirect to login
            alert('Registration successful! Please log in.');
            onSwitchToLogin();
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Registration failed.';
            setError(msg);
            console.error('Registration error detail:', err);
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-backdrop" aria-hidden />
            <div className="auth-card auth-card--wide">
                <div className="auth-header">
                    <AuthBrandMark />
                    <p className="auth-eyebrow">Create your workspace</p>
                    <h2>Join AgriSmart</h2>
                    <p className="auth-subtitle">Set up your profile and start monitoring soil health in minutes</p>
                </div>

                <form className="auth-form" onSubmit={handleRegister}>
                    <div className="auth-form-grid">
                        <div className="input-group">
                            <label htmlFor="register-fullName">Farmer Name</label>
                            <input
                                id="register-fullName"
                                type="text"
                                placeholder="John Doe"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                autoComplete="name"
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="register-farmName">Farm Name</label>
                            <input
                                id="register-farmName"
                                type="text"
                                placeholder="Green Valley"
                                value={farmName}
                                onChange={(e) => setFarmName(e.target.value)}
                                autoComplete="organization"
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="register-email">Email Address</label>
                        <input
                            id="register-email"
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className="auth-form-grid">
                        <div className="input-group">
                            <label htmlFor="register-password">Password</label>
                            <input
                                id="register-password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor="register-confirmPassword">Confirm</label>
                            <input
                                id="register-confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                autoComplete="new-password"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="auth-error" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        Already have an account?{' '}
                        <button type="button" className="auth-text-link" onClick={onSwitchToLogin}>
                            Sign in
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
