import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const TAB_LABELS = {
    dashboard: 'Dashboard',
    temporal: 'Analysis',
    ml: 'Predictions',
    correlation: 'Insights',
    alerts: 'Alerts'
};

const cleanMessage = (content = '') => content.replace(/\*\*(.*?)\*\*/g, '$1');

const ChatBot = ({ location, activeTab, onNavigate }) => {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: 'Hello. I am your AgriSmart Assistant. I can answer questions about the sensor dataset, explain chart trends, guide you to the correct dashboard tab, and support irrigation decisions.',
            followUps: [
                'What is the current status?',
                'Explain the moisture trend',
                'What factor influences moisture most?'
            ]
        }
    ]);
    const [input, setInput] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const sendMessage = async (messageText) => {
        if (!messageText.trim()) return;

        const userMsg = { role: 'user', content: messageText };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const token = localStorage.getItem('agri_token');
            const response = await axios.post(
                'http://localhost:5000/api/chat',
                {
                    message: messageText,
                    location,
                    currentTab: activeTab
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: response.data.reply,
                    suggestedTab: response.data.suggestedTab,
                    followUps: response.data.followUps || []
                }
            ]);
        } catch (error) {
            console.error('Chat error:', error);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'I am sorry, I am having trouble connecting right now. Please check whether the backend and ML service are running, then try again.'
                }
            ]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();
        await sendMessage(input);
    };

    const renderAssistantActions = (msg) => {
        if (msg.role !== 'assistant') return null;

        return (
            <div className="assistant-actions">
                {msg.suggestedTab && TAB_LABELS[msg.suggestedTab] && (
                    <button
                        className="assistant-nav-btn"
                        onClick={() => onNavigate?.(msg.suggestedTab)}
                        type="button"
                    >
                        Open {TAB_LABELS[msg.suggestedTab]}
                    </button>
                )}
                {Array.isArray(msg.followUps) && msg.followUps.length > 0 && (
                    <div className="follow-up-list">
                        {msg.followUps.map((item, index) => (
                            <button
                                key={`${item}-${index}`}
                                className="follow-up-chip"
                                type="button"
                                onClick={() => sendMessage(item)}
                                disabled={isTyping}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`chatbot-container ${isOpen ? 'open' : ''}`}>
            {!isOpen && (
                <button className="chatbot-toggle" onClick={() => setIsOpen(true)}>
                    <span className="bot-icon">🤖</span>
                    <span className="toggle-text">Assistant</span>
                </button>
            )}

            {isOpen && (
                <div className="chatbot-window">
                    <div className="chatbot-header">
                        <div className="header-info">
                            <span className="bot-status-dot"></span>
                            <div>
                                <h3>AgriSmart Assistant</h3>
                                <p className="chatbot-subtitle">Active tab: {TAB_LABELS[activeTab] || 'Dashboard'}</p>
                            </div>
                        </div>
                        <button className="close-chat" onClick={() => setIsOpen(false)}>×</button>
                    </div>

                    <div className="chatbot-quick-actions">
                        <button type="button" onClick={() => sendMessage('What is the current status?')}>Live status</button>
                        <button type="button" onClick={() => sendMessage('Explain the recent trend')}>Trend</button>
                        <button type="button" onClick={() => sendMessage('What factor influences moisture most?')}>Influence</button>
                        <button type="button" onClick={() => sendMessage('Should I irrigate now?')}>Decision</button>
                    </div>

                    <div className="chatbot-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`message ${msg.role}`}>
                                <div>
                                    <div className="message-bubble" style={{ whiteSpace: 'pre-wrap' }}>
                                        {cleanMessage(msg.content)}
                                    </div>
                                    {renderAssistantActions(msg)}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="message assistant typing">
                                <div className="message-bubble waiting-dots">
                                    <span>.</span><span>.</span><span>.</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="chatbot-input-area" onSubmit={handleSend}>
                        <input
                            type="text"
                            placeholder="Ask about status, trends, alerts, or irrigation..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isTyping}
                        />
                        <button type="submit" disabled={isTyping || !input.trim()}>
                            ➔
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default ChatBot;
