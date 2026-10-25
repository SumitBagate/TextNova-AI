const axios = require("axios");

// Initialize Hugging Face API
const HF_API_KEY = process.env.HUGGING_FACE_API_KEY || "your-api-key-here";
const HF_API_URL = "https://api-inference.huggingface.co/models";

// Models for different tasks
const MODELS = {
  summarization: "facebook/bart-large-cnn", // Best for summarization
  textGeneration: "google/flan-t5-base", // For quiz generation
  textToText: "google/flan-t5-base", // Versatile model
};

const hfClient = axios.create({
  baseURL: HF_API_URL,
  headers: {
    Authorization: `Bearer ${HF_API_KEY}`,
    "Content-Type": "application/json",
  },
});

function buildFallbackSummary(text, maxLength = 150) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!sentences.length) {
    return normalized.slice(0, maxLength);
  }

  let summary = "";
  for (const sentence of sentences) {
    const next = summary ? `${summary} ${sentence}` : sentence;
    if (next.length > maxLength) {
      break;
    }
    summary = next;
  }

  return summary || sentences[0].slice(0, maxLength);
}

function buildFallbackQuiz(text, numQuestions = 3) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const words = normalized
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 4);

  const uniqueWords = [...new Set(words)];
  const baseTopics = uniqueWords.slice(0, Math.max(numQuestions * 4, 8));

  return Array.from({ length: numQuestions }, (_, index) => {
    const sentence =
      sentences[index % Math.max(sentences.length, 1)] || normalized;
    const keyword =
      baseTopics[index] || uniqueWords[index] || `topic ${index + 1}`;
    const distractors = baseTopics
      .filter((item) => item !== keyword)
      .slice(index, index + 3);

    const options = [keyword, ...distractors];
    while (options.length < 4) {
      options.push(`Option ${options.length + 1}`);
    }

    const shuffled = options.slice(0, 4).sort(() => Math.random() - 0.5);

    return {
      question: `Which word best matches the main idea in this passage? ${sentence.slice(0, 90)}`,
      options: shuffled,
      correctAnswer: shuffled.indexOf(keyword),
    };
  });
}

function buildFallbackQnA(text, numQuestions = 5) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return [];

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const topics = [
    ...new Set(normalized.split(/\W+/).filter((w) => w.length > 5)),
  ];

  return Array.from(
    { length: Math.min(numQuestions, sentences.length || numQuestions) },
    (_, idx) => {
      const sentence = sentences[idx % Math.max(sentences.length, 1)] || normalized;
      const topic = topics[idx % Math.max(topics.length, 1)] || `topic ${idx + 1}`;
      return {
        question: `Explain ${topic}?`,
        answer: sentence.slice(0, 200),
      };
    },
  );
}

function simpleGrade(qna, studentText) {
  const student = String(studentText || "").toLowerCase();
  const results = qna.map((item) => {
    const keyTerms = Array.from(
      new Set(
        String(item.answer || "")
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 4)
          .slice(0, 6),
      ),
    );
    const hits = keyTerms.filter((term) => student.includes(term));
    const score = keyTerms.length ? hits.length / keyTerms.length : 0;
    return {
      question: item.question,
      expected: item.answer,
      matchedTerms: hits,
      score: Number(score.toFixed(2)),
    };
  });

  const average =
    results.reduce((sum, item) => sum + item.score, 0) /
    Math.max(results.length, 1);

  return { results, average: Number(average.toFixed(2)) };
}

function buildFallbackAnalysis(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return {
      type: "unknown",
      language: "unknown",
      topics: [],
      sentiment: "neutral",
      readingTimeMinutes: 1,
    };
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const words = normalized
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const uniqueWords = [...new Set(words.map((word) => word.toLowerCase()))];
  const topics = uniqueWords
    .filter((word) => word.length > 4)
    .slice(0, 5)
    .map((word) => word.replace(/^./, (char) => char.toUpperCase()));

  const sentimentHints = {
    positive: ["good", "great", "excellent", "success", "improve", "benefit"],
    negative: ["bad", "problem", "issue", "error", "fail", "risk"],
  };

  const lower = normalized.toLowerCase();
  const positiveScore = sentimentHints.positive.reduce(
    (score, term) => score + (lower.includes(term) ? 1 : 0),
    0,
  );
  const negativeScore = sentimentHints.negative.reduce(
    (score, term) => score + (lower.includes(term) ? 1 : 0),
    0,
  );

  const sentiment =
    positiveScore > negativeScore
      ? "positive"
      : negativeScore > positiveScore
        ? "negative"
        : "neutral";

  const readingTimeMinutes = Math.max(1, Math.ceil(words.length / 200));
  const type = sentences.length > 6 ? "article" : "document";

  return {
    type,
    language: "en",
    topics,
    sentiment,
    readingTimeMinutes,
  };
}

/**
 * Generate summary from text using Hugging Face
 * @param {string} text - Text to summarize
 * @param {number} maxLength - Maximum length of summary (default: 150)
 * @returns {Promise<string>} - Summarized text
 */
async function generateSummary(text, maxLength = 150) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    if (!HF_API_KEY || HF_API_KEY === "your-api-key-here") {
      throw new Error(
        "HUGGING_FACE_API_KEY is missing. Add your token in backend .env",
      );
    }

    // Truncate text if too long (BART has limitations)
    const truncatedText = text.substring(0, 1024);

    const response = await hfClient.post(
      `/${MODELS.summarization}`,
      {
        inputs: truncatedText,
        parameters: {
          max_length: maxLength,
          min_length: Math.max(50, Math.floor(maxLength / 2)),
          do_sample: false,
        },
      },
      {
        timeout: 30000,
      },
    );

    // Handle array response from HF API
    const result = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    if (result?.error) {
      // HF can return model-loading errors; fallback keeps UX working.
      return buildFallbackSummary(truncatedText, maxLength);
    }

    if (
      typeof result?.summary_text === "string" &&
      result.summary_text.trim()
    ) {
      return result.summary_text.trim();
    }

    if (typeof result === "string" && result.trim()) {
      return result.trim();
    }

    return buildFallbackSummary(truncatedText, maxLength);
  } catch (error) {
    console.error("Summarization error:", error.message);
    // If external API is down, return a local fallback summary instead.
    if (error.response || error.code === "ECONNABORTED") {
      return buildFallbackSummary(text, maxLength);
    }

    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

/**
 * Generate quiz questions from text
 * @param {string} text - Text to generate quiz from
 * @param {number} numQuestions - Number of questions to generate (default: 3)
 * @returns {Promise<Array>} - Array of quiz questions
 */
async function generateQuiz(text, numQuestions = 3) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    if (!HF_API_KEY || HF_API_KEY === "your-api-key-here") {
      return buildFallbackQuiz(text, numQuestions);
    }

    // Truncate text if too long
    const truncatedText = text.substring(0, 768);

    // Create quiz generation prompt
    const prompt = `Based on the following text, generate ${numQuestions} multiple choice quiz questions with 4 options each and mark the correct answer.

Text: "${truncatedText}"

Format your response as JSON array with this structure:
[
  {
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0
  }
]

Generate only the JSON array, no other text.`;

    const response = await hfClient.post(
      `/${MODELS.textGeneration}`,
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 768,
          temperature: 0.7,
          top_p: 0.95,
          do_sample: true,
          return_full_text: false,
        },
      },
      {
        timeout: 30000,
      },
    );

    // Extract and parse the generated text
    let generatedText = Array.isArray(response.data)
      ? response.data[0]?.generated_text || response.data[0]
      : response.data?.generated_text || response.data;

    // Clean up the response
    if (typeof generatedText === "string") {
      // Extract JSON from response
      const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        generatedText = jsonMatch[0];
      }
    }

    // Parse JSON
    const quizData = JSON.parse(generatedText);
    return Array.isArray(quizData) ? quizData : [quizData];
  } catch (error) {
    console.error("Quiz generation error:", error.message);
    if (error.response || error.code === "ECONNABORTED") {
      return buildFallbackQuiz(text, numQuestions);
    }

    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
}

/**
 * Generate Q&A pairs from text (exam-style)
 */
async function generateQnA(text, numQuestions = 5) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    if (!HF_API_KEY || HF_API_KEY === "your-api-key-here") {
      return buildFallbackQnA(text, numQuestions);
    }

    const truncated = text.substring(0, 1024);
    const prompt = `Create ${numQuestions} exam questions with concise answers from this passage. Respond as JSON array of {"question": "...", "answer": "..."}.\nPassage:\n${truncated}`;

    const response = await hfClient.post(
      `/${MODELS.textToText}`,
      {
        inputs: prompt,
        parameters: { max_length: 512, temperature: 0.4 },
      },
      { timeout: 30000 },
    );

    const result = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    const textOut =
      typeof result === "string"
        ? result
        : result?.generated_text || result?.answer || "";

    const parsed = safeParseJsonArray(textOut);
    if (parsed?.length) {
      return parsed
        .filter((item) => item.question && item.answer)
        .slice(0, numQuestions);
    }

    return buildFallbackQnA(truncated, numQuestions);
  } catch (error) {
    console.error("QnA error:", error.message);
    return buildFallbackQnA(text, numQuestions);
  }
}

function safeParseJsonArray(raw) {
  try {
    const cleaned = String(raw || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function gradeAnswers(qna, studentText) {
  const student = String(studentText || "").toLowerCase();
  const maxPerQuestion = 10;

  const results = qna.map((item) => {
    const keyTerms = Array.from(
      new Set(
        String(item.answer || "")
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 4)
          .slice(0, 6),
      ),
    );

    const hits = keyTerms.filter((term) => student.includes(term));
    const rawScore = keyTerms.length ? hits.length / keyTerms.length : 0;
    const marks = Math.max(0, Math.min(maxPerQuestion, Math.round(rawScore * maxPerQuestion)));

    return {
      question: item.question,
      expected: item.answer,
      matchedTerms: hits,
      score: Number(rawScore.toFixed(2)),
      marks,
      maxMarks: maxPerQuestion,
    };
  });

  const questionMarks = results.map((item) => item.marks);
  const totalMarks = questionMarks.reduce((sum, value) => sum + value, 0);
  const maxMarks = qna.length * maxPerQuestion;
  const percentage = maxMarks ? Math.round((totalMarks / maxMarks) * 100) : 0;

  return {
    results,
    questionMarks,
    totalMarks,
    maxMarks,
    percentage,
    average: Number((percentage / 100).toFixed(2)),
  };
}

/**
 * Detect document type/language
 * @param {string} text - Text to analyze
 * @returns {Promise<Object>} - Document analysis
 */
async function analyzeDocument(text) {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    if (!HF_API_KEY || HF_API_KEY === "your-api-key-here") {
      return buildFallbackAnalysis(text);
    }

    const prompt = `Analyze this document and provide:
1. Document type (report, article, letter, etc.)
2. Language detected
3. Key topics (up to 5)
4. Sentiment (positive/negative/neutral)
5. Estimated reading time in minutes

Text: "${text.substring(0, 256)}"

Respond in JSON format:
{
  "type": "...",
  "language": "...",
  "topics": [...],
  "sentiment": "...",
  "readingTimeMinutes": ...
}`;

    const response = await hfClient.post(
      `/${MODELS.textToText}`,
      {
        inputs: prompt,
      },
      {
        timeout: 30000,
      },
    );

    let result = Array.isArray(response.data)
      ? response.data[0]?.generated_text || response.data[0]
      : response.data?.generated_text || response.data;

    // Try to parse JSON response
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      // Return raw result if JSON parsing fails
      return { rawAnalysis: result };
    }

    return { analysis: result };
  } catch (error) {
    console.error("Document analysis error:", error.message);
    if (error.response || error.code === "ECONNABORTED") {
      return buildFallbackAnalysis(text);
    }

    throw new Error(`Failed to analyze document: ${error.message}`);
  }
}

/**
 * Check if API key is valid
 * @returns {Promise<boolean>} - True if API key is valid
 */
async function validateApiKey() {
  try {
    await axios.get("https://huggingface.co/api/whoami-v2", {
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
      },
      timeout: 10000,
    });
    return true;
  } catch (error) {
    console.error("API key validation failed:", error.message);
    return false;
  }
}

module.exports = {
  generateSummary,
  generateQuiz,
  analyzeDocument,
  generateQnA,
  gradeAnswers,
  validateApiKey,
  MODELS,
};
