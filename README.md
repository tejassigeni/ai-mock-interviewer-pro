# 🤖 AI Mock Interviewer

An AI-powered mock interview platform that generates role-specific interview questions, evaluates responses, provides speech feedback, and tracks user progress over time.

## 🚀 Features

- AI-generated interview questions based on role and difficulty
- Real-time answer evaluation and scoring
- Detailed feedback with strengths and areas for improvement
- Model answers for comparison
- Speech analysis using Web Speech API
- JWT-based authentication system
- Interview history tracking
- Performance analytics dashboard
- Responsive modern UI

---

## 🛠️ Tech Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend
- FastAPI
- Python
- SQLAlchemy
- SQLite
- JWT Authentication

### AI
- NVIDIA NIM API
- Llama 3.1 70B Instruct

---

## 🏗️ System Architecture

Frontend (Next.js)
↓
FastAPI Backend
↓
SQLAlchemy + SQLite
↓
NVIDIA NIM (Llama 3.1 70B)

---

## 📂 Project Structure

```text
frontend/
├── src/
├── components/
├── services/
└── app/

backend/
├── routes/
├── models/
├── schemas/
├── services/
└── database/
```

## 🔑 Core Functionalities

### Interview Generation
- Generates role-specific interview questions
- Supports multiple difficulty levels
- Creates structured interview sessions

### Answer Evaluation
- AI-powered answer assessment
- Score generation
- Strength and weakness analysis
- Suggested improved answers

### Speech Analysis
- Voice-to-text transcription
- Communication quality assessment
- Delivery feedback

### Analytics
- Interview history
- Session performance tracking
- Score visualization
- Progress monitoring

---

## ⚙️ Installation

### Backend Setup

```bash
cd backend

python -m venv .venv

# Windows
.venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend:
```
http://localhost:3000
```

Backend:
```
http://localhost:8000
```

API Docs:
```
http://localhost:8000/docs
```

---

## 🔒 Environment Variables

Create a `.env` file in the backend directory.

```env
NVIDIA_API_KEY=your_api_key_here
JWT_SECRET=your_secret_here
```

Never commit `.env` files or API keys.

---

## 📸 Screenshots

Add screenshots here after deployment.

### Login Page
![Login](screenshots/login.png)

### Dashboard
![Dashboard](screenshots/dashboard.png)

### Interview Session
![Interview](screenshots/interview.png)

### Analytics
![Analytics](screenshots/analytics.png)

---

## 🎯 Future Improvements

- Resume-based interview generation
- Real-time video analysis
- AI voice interviewer
- Docker deployment
- PostgreSQL support
- Multi-language interviews

---

## 👨‍💻 Author

**Tejas Sigeni**

GitHub: https://github.com/YOUR_USERNAME

---

## ⭐ Project Highlights

- Full-stack AI application
- Production-style API architecture
- Authentication and authorization
- LLM-powered evaluation pipeline
- Modern frontend and backend technologies
- End-to-end interview simulation platform
