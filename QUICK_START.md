# Quick Start - Hugging Face AI Integration

## Step 1: Get Your Free API Key (2 minutes)

1. Visit: https://huggingface.co/
2. Click "Sign Up" (completely free)
3. Verify email
4. Go to: https://huggingface.co/settings/tokens
5. Click "New token"
6. Name it: "TextNova"
7. Select: "Read" permission
8. Click "Generate"
9. **Copy the token** (looks like: `hf_xxxxxxxxxxxxxxxxxxxxxx`)

## Step 2: Configure Backend (1 minute)

Open file: `textnova backend\.env`

Replace content with:

```
HUGGING_FACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxx
PORT=5000
NODE_ENV=development
```

**Replace `hf_xxxxxxxxxxxxxxxxxxxxxx` with YOUR actual token**

## Step 3: Install & Run Backend (2 minutes)

```bash
# Navigate to backend folder
cd "textnova backend"

# Install dependencies (first time only)
npm install

# Start server
npm run dev
```

Expected output:

```
Server running on port 5000
```

## Step 4: Test AI Features (1 minute)

Open new terminal and test:

```bash
# Test Summarization
curl -X POST http://localhost:5000/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"text":"Artificial intelligence is transforming how we work. It automates tasks, improves decision-making, and creates new opportunities. However, it also raises concerns about job displacement and privacy. Organizations must balance innovation with ethical considerations.","maxLength":100}'

# Test Quiz Generation
curl -X POST http://localhost:5000/api/ai/quiz \
  -H "Content-Type: application/json" \
  -d '{"text":"Python is a popular programming language known for its simplicity and readability. It supports multiple programming paradigms including object-oriented, functional, and procedural programming. Python has a large standard library and active community.","numQuestions":2}'

# Test Health Check
curl http://localhost:5000/api/ai/health
```

## Step 5: Run Frontend (1 minute)

```bash
cd "forntend/textnova-ai"
npm install
npm run dev
```

Open: http://localhost:5173

## That's it! 🎉

Your AI features are now live:

- 📝 Document Summarization
- ❓ Quiz Generation
- 🔍 Document Analysis

## Troubleshooting

**Issue: "API key invalid"**

- Double-check your token is copied correctly
- Restart backend with: `npm run dev`

**Issue: "Connection refused"**

- Ensure backend is running on port 5000
- Check terminal shows: "Server running on port 5000"

**Issue: "Rate limited"**

- Free tier: 60 requests/minute limit
- Wait a minute before making more requests

## API Usage Limits (Free Tier)

| Feature         | Requests/Min | Response Time |
| --------------- | ------------ | ------------- |
| Summarization   | 60           | ~2-5 seconds  |
| Quiz Generation | 60           | ~3-8 seconds  |
| Analysis        | 60           | ~2-4 seconds  |

## What's Included

### Backend Services (`services/huggingface.js`)

- `generateSummary(text, maxLength)` - Summarize any text
- `generateQuiz(text, numQuestions)` - Create questions
- `analyzeDocument(text)` - Analyze content

### API Routes (`routes/ai.js`)

- `POST /api/ai/summarize` - Summarize endpoint
- `POST /api/ai/quiz` - Quiz endpoint
- `POST /api/ai/analyze` - Analysis endpoint
- `GET /api/ai/health` - Status check

### Frontend Components

- `AITools.jsx` - UI for all AI features
- `DocumentEditor.jsx` - Edit converted docs
- `AuthForm.jsx` - Firebase login (optional)

## Next: Firebase Authentication (Optional)

To add user authentication:

1. Get Firebase keys from https://console.firebase.google.com
2. Update `forntend/textnova-ai/.env.local`
3. Import `AuthForm` in your App.jsx
4. Done! Users can now login

## Need Help?

See full guide: `SETUP_GUIDE.md`

Issues? Check:

- Backend running? `npm run dev` in backend folder
- API key configured? Check `.env` file
- Frontend connected? Check browser DevTools
