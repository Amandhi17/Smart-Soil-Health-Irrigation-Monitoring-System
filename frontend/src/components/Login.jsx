import React, { useState } from 'react';
import axios from 'axios';
import AuthBrandMark from './AuthBrandMark';

const Login = ({ onSwitchToRegister, onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const response = await axios.post('http://localhost:5000/api/auth/login', { email, password });
            const { token, user } = response.data;

            localStorage.setItem('agri_token', token);
            localStorage.setItem('agri_user', JSON.stringify(user));

            onLoginSuccess(user);
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid email or password. Please try again.');
            console.error(err);
        }
        setLoading(false);
    };

    return (
        <div className="auth-container">
            <div className="auth-backdrop" aria-hidden />
            <div className="auth-card">
                <div className="auth-header">
                    <AuthBrandMark />
                    <p className="auth-eyebrow">AgriSmart · secure access</p>
                    <h2>Welcome back</h2>
                    <p className="auth-subtitle">Sign in to your farm operations dashboard</p>
                </div>

                <form className="auth-form" onSubmit={handleLogin} noValidate>
                    <div className="input-group">
                        <label htmlFor="login-email">Email address</label>
                        <input
                            id="login-email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="login-password">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {error && (
                        <div className="auth-error" role="alert">
                            {error}
                        </div>
                    )}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Signing in…' : 'Continue to dashboard'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        New to AgriSmart?{' '}
                        <button type="button" className="auth-text-link" onClick={onSwitchToRegister}>
                            Create an account
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
