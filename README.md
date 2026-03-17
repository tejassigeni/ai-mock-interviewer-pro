# 🚀 AI Mock Interviewer Pro

A full-stack AI-powered mock interview platform that helps users practice technical interviews with real-time question generation and speech-based answer evaluation.

🌐 **Live Demo:** https://ai-mock-interviewer-pro.vercel.app/login

---

## 🧠 Features

* 🤖 **AI Interview Question Generation**
  Generate role-based interview questions using AI.

* 🎤 **Speech-Based Answering**
  Users can answer questions using their voice (real interview simulation).

* 🧾 **AI Evaluation & Feedback**
  Get feedback on:

  * Confidence
  * Clarity
  * Overall answer quality

* 👤 **User Registration System**
  Simple username/email-based login system.

* 💾 **Session Storage**
  Store interview data and user responses.

* ⚡ **Fast & Responsive UI**
  Built with modern frontend technologies for smooth experience.

---

## 🏗️ Tech Stack

### Frontend

* Next.js
* React
* Tailwind CSS

### Backend

* Next.js API Routes / Python (FastAPI-style DB layer)
* JWT Authentication

### AI Integration

* NVIDIA API (for question generation & evaluation)

### Database

* SQLite (local development)

### Deployment

* Vercel

---

## 📸 How It Works

1. User logs in with username/email
2. Generates interview questions
3. Answers:

   * ✍️ Manually
   * 🎤 Using voice
4. AI evaluates answer
5. Feedback is displayed instantly

---

## ⚙️ Environment Variables

Create a `.env.local` file and add:

```env
NVIDIA_API_KEY=your_api_key
JWT_SECRET=your_secret_key
DATABASE_URL=your_database_url   # optional (uses SQLite if not provided)
```

---

## 🚀 Run Locally

```bash
git clone https://github.com/your-username/ai-mock-interviewer-pro.git
cd ai-mock-interviewer-pro

npm install
npm run dev
```

App runs on:

```text
http://localhost:3000
```

---

## 🌍 Deployment

Deployed using Vercel.

Steps:

1. Push code to GitHub
2. Import project into Vercel
3. Add environment variables
4. Deploy

---

## ⚠️ Notes

* Current version uses SQLite → data may not persist in production
* For full production usage, switch to a cloud database (Neon/Supabase)

---

## 🎯 Future Improvements

* Full authentication system (Clerk / OAuth)
* Cloud database integration
* Interview history dashboard
* Advanced AI evaluation metrics
* Rate limiting & API optimization

---

## 👨‍💻 Author

**Tejas Sigeni**
CSE Student | Aspiring Cybersecurity Engineer

---

## ⭐ Acknowledgements

* NVIDIA AI APIs
* Next.js ecosystem
* Open-source community

---

## 📌 Project Status

✅ Completed and deployed
🚀 Ready for live demo and portfolio use

---

# 🔥 If you like this project, give it a star!
