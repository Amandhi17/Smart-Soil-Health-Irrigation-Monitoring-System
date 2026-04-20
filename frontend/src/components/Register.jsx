import React, { useState } from 'react';
import axios from 'axios';

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
            <div className="auth-card glass-panel" style={{ maxWidth: '550px' }}>
                <div className="auth-header">
                    <div className="auth-logo">🚜</div>
                    <h2>Join AgriSmart</h2>
                    <p>Start your journey toward data-driven farming</p>
                </div>

                <form className="auth-form" onSubmit={handleRegister}>
                    <div className="auth-form-grid">
                        <div className="input-group">
                            <label>Farmer Name</label>
                            <input
                                type="text"
                                placeholder="John Doe"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>Farm Name</label>
                            <input
                                type="text"
                                placeholder="Green Valley"
                                value={farmName}
                                onChange={(e) => setFarmName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            placeholder="your@email.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="auth-form-grid">
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

                        <div className="input-group">
                            <label>Confirm</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" className="auth-button" disabled={loading}>
                        {loading ? 'Creating Account...' : 'Register as Farmer'}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>Already a member? <span onClick={onSwitchToLogin}>Login Now</span></p>
                </div>
            </div>
        </div>
    );
};

export default Register;
