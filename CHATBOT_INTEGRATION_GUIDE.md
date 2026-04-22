# Conversational Agent / Chatbot Integration Guide

## What was added to this IoT project
This project now includes a stronger AgriSmart Assistant that is connected to the dashboard and the dataset.

The chatbot can now:
- Answer natural language questions about live and historical sensor data.
- Guide the user to the correct dashboard tab such as Dashboard, Analysis, Predictions, Insights, and Alerts.
- Explain trends, comparisons, and anomalies using current values, averages, recent changes, and alert signals.
- Support decision-oriented questions such as whether irrigation is needed now.
- Suggest follow-up questions and open the most relevant visual panel directly from the chat window.

## Why this matches the assignment requirement
The assignment asks for a conversational agent that is meaningfully integrated with the visual analytics system.

This solution satisfies that in four ways:
1. The chatbot is not a separate static FAQ. It reads the same sensor dataset used by the dashboard.
2. It explains the meaning of trends and relationships already shown in the visuals.
3. It can guide the user to specific dashboard tabs for deeper inspection.
4. It supports decisions using the ML prediction service and current data context.

## Files added or updated
### Backend
- `backend/chat_service.js`
  - Builds analytics context from Firebase data.
  - Computes current status, trend summaries, correlations, alerts, and prediction context.
  - Uses the Gemini API when configured with a free cloud API key.
  - Can still use OpenAI or Ollama later if you want.
  - Falls back to analytics-based responses if no LLM is available.

- `backend/server.js`
  - Updated `/api/chat` endpoint to use the analytics-aware chat service.

### Frontend
- `frontend/src/components/ChatBot.jsx`
  - Added quick prompt buttons.
  - Added dashboard-aware navigation buttons.
  - Added follow-up chips after assistant answers.
  - Sends the current active tab to the backend so the assistant knows where the user is.

- `frontend/src/App.jsx`
  - Passes the active tab and navigation callback into the chatbot.

- `frontend/src/index.css`
  - Added UI styles for quick actions, follow-up chips, and the open-tab button.

## Free cloud LLM setup using Gemini
This project is now ready to use a **free cloud LLM** through the Gemini API.

### 1. Get a Gemini API key
Open Google AI Studio and create your API key.

### 2. Update backend environment
Create or update `backend/.env` like this:

```env
PORT=5000
JWT_SECRET=smart_soil_secret_key_2026
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_VERSION=v1beta
```

### 3. Start your project
Backend:

```bash
cd backend
npm install
npm start
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Optional alternatives
If later you want, you can still switch to OpenAI or Ollama by changing `.env`, but Gemini is now the default free cloud option.

## Example questions for demonstration
Use these during your viva, demo, or presentation:
- What is the current status of my farm?
- Explain the recent soil moisture trend.
- Are there any anomalies in the dataset?
- What factor influences soil moisture the most?
- Should I irrigate now?
- Open the prediction view.
- Which tab shows alerts?

## Good explanation for your report
You can write this in your report:

> A conversational assistant was integrated into the IoT dashboard to support natural language interaction with the analytics system. The assistant reads the same processed sensor data used in the visual dashboard, explains trends and anomalies, answers decision-support questions, and guides the user to relevant dashboard panels such as Analysis, Alerts, Insights, and Predictions. The assistant uses a free cloud LLM through the Gemini API, allowing intelligent responses without requiring a local model. This creates meaningful interaction between the conversational layer and the visual analytics layer rather than treating the chatbot as a separate feature.

## Good explanation for your presentation
You can say:

> Our chatbot is connected to the dashboard data and not just a basic question-answer bot. It can explain current sensor readings, summarize trends, discuss anomalies, identify influential factors, and recommend actions such as irrigation. It also helps users navigate the dashboard by opening the correct analytics tab directly from the chat interface. We used a free cloud LLM with the Gemini API, so the system can provide intelligent responses without needing a local model.
