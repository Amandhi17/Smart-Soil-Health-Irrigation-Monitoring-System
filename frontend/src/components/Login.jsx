import React, { useState } from 'react';
import axios from 'axios';

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

            // Store session
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
            <div className="auth-card glass-panel">
                <div className="auth-header">
                    <div className="auth-logo">🌿</div>
                    <h2>Welcome Back, Farmer</h2>
                    <p>Log in to monitor your farm's health</p>
                </div>

                <form className="auth-form" onSubmit={handleLogin}>
                    <div className="input-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            placeholder="farmer@agrismart.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>Password</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Entering Farm...' : 'Login to Dashboard'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>New to AgriSmart? <span onClick={onSwitchToRegister}>Register Here</span></p>
                </div>
            </div>
        </div>
    );
};

export default Login;
