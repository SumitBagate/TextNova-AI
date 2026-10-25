# TextNova AI - Complete Setup Guide

## Overview

Your application now includes:

- ✅ PDF/JPG to DOCS conversion
- ✅ Document editing with formatting
- ✅ AI features (summarization, quiz generation, document analysis)
- ✅ Firebase authentication
- ✅ Free Hugging Face AI integration

---

## Backend Setup

### 1. Install Dependencies

```bash
cd "textnova backend"
npm install
```

This installs:

- `express` - Web framework
- `axios` - HTTP client for AI API calls
- `dotenv` - Environment variables
- `cors` - Cross-origin requests
- `multer` - File uploads
- `docx` - Document generation
- `pdfkit` - PDF generation

### 2. Get Hugging Face API Key

1. Go to [huggingface.co](https://huggingface.co)
2. Sign up (free account)
3. Go to Settings → Access Tokens
4. Create a new token (read access is enough)
5. Copy the token

### 3. Configure Environment Variables

Create `.env` file in `textnova backend/` directory:

```env
HUGGING_FACE_API_KEY=your_hugging_face_token_here
PORT=5000
NODE_ENV=development
```

Replace `your_hugging_face_token_here` with your actual token.

### 4. Run Backend Server

```bash
# Development with auto-reload
npm run dev

# Or production
npm start
```

Server runs on: `http://localhost:5000`

### 5. Backend API Endpoints

**AI Endpoints:**

- `POST /api/ai/summarize` - Summarize text
- `POST /api/ai/quiz` - Generate quiz questions
- `POST /api/ai/analyze` - Analyze document
- `GET /api/ai/health` - Check API status

Example requests:

```bash
# Summarize
curl -X POST http://localhost:5000/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"text":"Your long text here...","maxLength":150}'

# Generate Quiz
curl -X POST http://localhost:5000/api/ai/quiz \
  -H "Content-Type: application/json" \
  -d '{"text":"Your text here...","numQuestions":3}'
```

---

## Frontend Setup

### 1. Install Dependencies

```bash
cd forntend/textnova-ai
npm install
```

### 2. Setup Firebase (Optional but Recommended)

#### Get Firebase Credentials:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a new project" (or use existing)
3. Go to Project Settings (gear icon)
4. Copy your config object
5. Enable Authentication:
   - Go to Authentication
   - Enable "Email/Password" provider
   - Enable "Google" provider

#### Create `.env.local` in `forntend/textnova-ai/`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

The Firebase web API key is an identifier required by the browser SDK, not a
server secret. Keep `.env.local` out of Git, restrict the key in Google Cloud
API credentials to the Firebase APIs and approved web origins, and secure data
with Firebase Authentication and Security Rules. If a key was committed or
reported by Vercel, rotate it in Google Cloud and update the local/deployment
environment variables; do not paste the replacement into source code.

### 3. Update App.jsx

Add components to your main `App.jsx`:

```jsx
import { useState, useEffect } from "react";
import AuthForm from "./components/AuthForm";
import DocumentEditor from "./components/DocumentEditor";
import AITools from "./components/AITools";
import { onAuthChange, logoutUser } from "./services/firebaseConfig";
import "./App.css";

function App() {
  const [user, setUser] = useState(null);
  const [extractedText, setExtractedText] = useState("");

  useEffect(() => {
    // Listen to auth changes
    const unsubscribe = onAuthChange((currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (!user) {
    return <AuthForm onAuthSuccess={() => console.log("Auth success")} />;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🎓 TextNova AI</h1>
        <div className="user-section">
          <span>{user.email}</span>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main className="app-main">
        <section>
          <h2>Document Conversion</h2>
          {/* Your existing convert component */}
        </section>

        <DocumentEditor
          initialContent={extractedText}
          onSave={(content) => setExtractedText(content)}
        />

        <AITools extractedText={extractedText} />
      </main>
    </div>
  );
}

export default App;
```

### 4. Add NPM Scripts

If Firebase is needed, install it:

```bash
npm install firebase
```

### 5. Run Frontend

```bash
npm run dev
```

Frontend runs on: `http://localhost:5173` (Vite default)

---

## Feature Usage Guide

### 📝 Document Editor

- Edit converted documents with basic formatting
- Real-time word/character count
- Save and export as .txt
- Auto-save status indicator

### 🤖 AI Tools

#### Summarization

- Input: Any text document
- Output: Concise summary (configurable length)
- Use case: Quick document overview

#### Quiz Generation

- Input: Educational text
- Output: Multiple choice questions with answers
- Customizable question count (1-10)
- Use case: Self-assessment and learning

#### Document Analysis

- Input: Any text
- Output: Document type, language, topics, sentiment
- Use case: Content classification

### 🔐 Firebase Authentication

- Email/Password signup
- Google sign-in
- Persistent login (stays logged in on refresh)
- Secure user sessions

---

## Deployment Guide

### Backend Deployment (Example: Railway.app)

1. Push code to GitHub
2. Sign up at [Railway.app](https://railway.app)
3. Connect GitHub repository
4. Set environment variables:
   - `HUGGING_FACE_API_KEY`
   - `NODE_ENV=production`
5. Deploy automatically

### Frontend Deployment (Example: Vercel)

1. Push code to GitHub
2. Go to [Vercel.com](https://vercel.com)
3. Import project from GitHub
4. Set these environment variables in the Vercel project settings (not in a
   committed file):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID` (optional)
   - `VITE_API_BASE_URL`
5. Deploy

### Update API Base URL

In `AITools.jsx`, change:

```jsx
const API_BASE = "https://your-backend-domain.com/api/ai";
```

---

## Troubleshooting

### Backend Issues

**Error: HUGGING_FACE_API_KEY not found**

- Ensure `.env` file exists in backend directory
- Check API key is set correctly
- Restart server after changing .env

**Error: CORS errors**

- Ensure CORS is enabled in `server.js`
- Frontend URL should be in CORS whitelist

### Frontend Issues

**Firebase: Auth not working**

- Verify `.env.local` keys are correct
- Check Firebase console for enabled providers
- Clear browser cache and try again

**AI Tools: No response**

- Check backend is running on port 5000
- Verify Hugging Face API key is valid
- Check network tab in browser DevTools

**Converted text not appearing**

- Extract text first from document conversion
- Check if conversion completed successfully
- Verify OCR/conversion results

---

## Free Tier Limits

### Hugging Face API

- 60 requests/minute
- No credit card required
- Suitable for small-medium projects
- Free tier has occasional rate limiting

### Firebase

- 50k read/write operations/day (free tier)
- 1 GB storage
- Enough for small-medium applications

---

## Project Structure

```
textnova backend/
├── server.js              # Main server file
├── .env                   # Environment variables
├── package.json
├── routes/
│   ├── convert.js         # Document conversion routes
│   └── ai.js              # NEW: AI feature routes
├── services/
│   └── huggingface.js     # NEW: Hugging Face integration
└── uploads/               # Converted documents storage

forntend/textnova-ai/
├── .env.local             # Firebase config
├── src/
│   ├── App.jsx            # Main app
│   ├── services/
│   │   └── firebaseConfig.js  # NEW: Firebase setup
│   └── components/
│       ├── AITools.jsx        # NEW: AI features UI
│       ├── DocumentEditor.jsx # NEW: Document editor
│       └── AuthForm.jsx       # NEW: Authentication UI
└── package.json
```

---

## Next Steps

1. ✅ Get Hugging Face API key
2. ✅ Configure backend `.env`
3. ✅ Test AI endpoints
4. ✅ (Optional) Setup Firebase authentication
5. ✅ Run frontend with AI components
6. ✅ Deploy to production

---

## Support Resources

- [Hugging Face Docs](https://huggingface.co/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [Express.js Docs](https://expressjs.com/)
- [React Docs](https://react.dev/)

---

## License & Copyright

This is your private project. Customize as needed!
