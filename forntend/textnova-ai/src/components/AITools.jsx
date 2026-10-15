import React, { useState } from "react";
import "./AITools.css";

const AITools = ({ extractedText, showToast }) => {
  const [activeTab, setActiveTab] = useState("summarize");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [maxLength, setMaxLength] = useState(150);
  const [numQuestions, setNumQuestions] = useState(3);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(null);
  const [qnaCount, setQnaCount] = useState(5);
  const [answerSheetText, setAnswerSheetText] = useState("");
  const [gradingResult, setGradingResult] = useState(null);
  const [questionText, setQuestionText] = useState("");
  const [answerFileName, setAnswerFileName] = useState("");
  const [questionFileName, setQuestionFileName] = useState("");
  const [combinedFileName, setCombinedFileName] = useState("");
  const [questionFile, setQuestionFile] = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [combinedFile, setCombinedFile] = useState(null);
  const [scores, setScores] = useState([]);
  const [sessionTitle, setSessionTitle] = useState("");
  const [sessions, setSessions] = useState([]);

  const changeTab = (tab) => {
    setActiveTab(tab);
    setError(null);
    setGradingResult(null);
  };

  const API_BASE = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/api/ai`;

  const postJson = async (url, payload) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.details || "Request failed");
    }
    return data;
  };

  const handleSummarize = async () => {
    if (!extractedText || extractedText.trim().length === 0) {
      setError("Please extract text from a document first");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await postJson(`${API_BASE}/summarize`, {
        text: extractedText,
        maxLength: parseInt(maxLength),
      });

      setResult({
        type: "summary",
        content: response.summary,
        stats: {
          originalLength: response.originalLength,
          summaryLength: response.summaryLength,
        },
      });
    } catch (err) {
      setError(err.message || "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQnA = async () => {
    const sourceText = questionText || extractedText;
    if (!sourceText || sourceText.trim().length === 0) {
      setError("Please upload a question paper or extract text first");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setGradingResult(null);

    try {
      const response = await postJson(`${API_BASE}/qna`, {
        text: sourceText,
        numQuestions: parseInt(qnaCount),
      });

      setResult({
        type: "qna",
        content: response.qna,
        count: response.count,
      });
      setScores(new Array(response.count).fill(""));
    } catch (err) {
      setError(err.message || "Failed to generate Q&A");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setAnswerSheetText(String(e.target?.result || ""));
    };
    reader.readAsText(file);
    setAnswerFileName(file.name);
  };

  const handleGrade = async () => {
    if (!result || result.type !== "qna") {
      setError("Generate Q&A first.");
      return;
    }
    if (!answerSheetText.trim()) {
      setError("Paste or upload an answer sheet first.");
      return;
    }
    setLoading(true);
    setError(null);
    setGradingResult(null);
    try {
      const response = await postJson(`${API_BASE}/grade`, {
        qna: result.content,
        studentText: answerSheetText,
      });
      setGradingResult(response);
    } catch (err) {
      setError(err.message || "Failed to grade answers");
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (index, value) => {
    setScores((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSaveSession = async () => {
    if (!result || result.type !== "qna") {
      setError("Generate Q&A before saving.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        title: sessionTitle || "Session",
        questionText,
        answerText: answerSheetText,
        qna: result.content,
        scores,
        gradingResult,
      };
      const resp = await fetch(`${API_BASE}/grade/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Failed to save session");
      }
      showToast?.("Session saved", "success");
    } catch (err) {
      setError(err.message || "Failed to save session");
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const resp = await fetch(`${API_BASE}/grade/sessions`);
      const data = await resp.json();
      if (resp.ok) {
        setSessions(data.sessions || []);
      }
    } catch (_) {}
  };

  const loadSession = async (id) => {
    try {
      const resp = await fetch(`${API_BASE}/grade/sessions/${id}`);
      const data = await resp.json();
      if (!resp.ok) return;
      const s = data.session;
      setQuestionText(s.questionText || "");
      setAnswerSheetText(s.answerText || "");
      setResult({ type: "qna", content: s.qna || [], count: (s.qna || []).length });
      setScores(s.scores || []);
      setGradingResult(s.gradingResult || null);
      changeTab("qna");
      showToast?.("Session loaded", "info");
    } catch (_) {}
  };

  const handleExtractFiles = async () => {
    if (!questionFile && !combinedFile) {
      setError("Upload a question paper (or combined file) first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setGradingResult(null);
    try {
      const formData = new FormData();
      if (questionFile) formData.append("questionFile", questionFile);
      if (answerFile) formData.append("answerFile", answerFile);
      if (combinedFile) formData.append("combinedFile", combinedFile);

      const resp = await fetch(`${API_BASE}/grade/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Failed to extract files");
      }
      setQuestionText(data.questionText || "");
      setAnswerSheetText(data.answerText || "");
      showToast?.("Files extracted. Now generate questions.", "success");
    } catch (err) {
      setError(err.message || "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!extractedText || extractedText.trim().length === 0) {
      setError("Please extract text from a document first");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);

    try {
      const response = await postJson(`${API_BASE}/quiz`, {
        text: extractedText,
        numQuestions: parseInt(numQuestions),
      });

      setResult({
        type: "quiz",
        content: response.quiz,
        count: response.count,
      });
    } catch (err) {
      setError(err.message || "Failed to generate quiz");
    } finally {
      setLoading(false);
    }
  };

  const handleQuizAnswerChange = (questionIndex, optionIndex) => {
    setQuizAnswers((current) => ({
      ...current,
      [questionIndex]: optionIndex,
    }));
  };

  const handleSubmitQuiz = () => {
    if (!result || result.type !== "quiz") {
      return;
    }

    const unanswered = result.content.some(
      (_, questionIndex) => quizAnswers[questionIndex] === undefined,
    );

    if (unanswered) {
      setError("Please answer all questions before submitting the quiz.");
      return;
    }

    const score = result.content.reduce((total, question, questionIndex) => {
      return (
        total + (quizAnswers[questionIndex] === question.correctAnswer ? 1 : 0)
      );
    }, 0);

    setError(null);
    setQuizScore(score);
    setQuizSubmitted(true);
  };

  const resetQuiz = () => {
    if (!result || result.type !== "quiz") {
      return;
    }

    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
  };

  const handleAnalyzeDocument = async () => {
    if (!extractedText || extractedText.trim().length === 0) {
      setError("Please extract text from a document first");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await postJson(`${API_BASE}/analyze`, {
        text: extractedText,
      });

      setResult({
        type: "analysis",
        content: response.analysis,
      });
    } catch (err) {
      setError(err.message || "Failed to analyze document");
    } finally {
      setLoading(false);
    }
  };

  const updateQnAItem = (index, field, value) => {
    setResult((current) => {
      if (!current || current.type !== "qna") return current;
      const updated = current.content.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      );
      return { ...current, content: updated };
    });
  };

  const handleCopyResult = () => {
    let textToCopy = "";
    if (result.type === "summary") {
      textToCopy = result.content;
    } else if (result.type === "quiz") {
      textToCopy = result.content
        .map(
          (q, i) =>
            `Q${i + 1}: ${q.question}\n${q.options
              .map((opt, j) => `${String.fromCharCode(65 + j)}) ${opt}`)
              .join(
                "\n",
              )}${quizSubmitted ? `\nAnswer: ${String.fromCharCode(65 + q.correctAnswer)}` : ""}\n`,
        )
        .join("\n");
    } else if (result.type === "analysis") {
      textToCopy = JSON.stringify(result.content, null, 2);
    } else if (result.type === "qna") {
      textToCopy = result.content
        .map((q, i) => `Q${i + 1}: ${q.question}\nAns: ${q.answer}\n`)
        .join("\n");
    }

    navigator.clipboard.writeText(textToCopy);
    showToast?.("Result copied to clipboard", "success");
  };

  return (
    <div className="ai-tools-container">
      <div className="ai-header">
        <h2>🤖 AI Tools</h2>
        <p>Summarize, generate quizzes, and analyze your documents</p>
      </div>

      <div className="ai-tabs">
        <button
          className={`tab-button ${activeTab === "summarize" ? "active" : ""}`}
          onClick={() => changeTab("summarize")}
        >
          📝 Summarize
        </button>
        <button
          className={`tab-button ${activeTab === "quiz" ? "active" : ""}`}
          onClick={() => changeTab("quiz")}
        >
          ❓ Generate Quiz
        </button>
        <button
          className={`tab-button ${activeTab === "analyze" ? "active" : ""}`}
          onClick={() => changeTab("analyze")}
        >
          🔍 Analyze
        </button>
        <button
          className={`tab-button ${activeTab === "qna" ? "active" : ""}`}
          onClick={() => changeTab("qna")}
        >
          📄 Question Paper
        </button>
      </div>

      <div className="ai-content">
        {activeTab === "summarize" && (
          <div className="tab-panel">
            <div className="control-group">
              <label>Summary Length:</label>
              <input
                type="number"
                min="50"
                max="500"
                value={maxLength}
                onChange={(e) => setMaxLength(e.target.value)}
              />
            </div>
            <button
              className="action-button"
              onClick={handleSummarize}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Summary"}
            </button>
          </div>
        )}

        {activeTab === "quiz" && (
          <div className="tab-panel">
            <div className="control-group">
              <label>Number of Questions:</label>
              <input
                type="number"
                min="1"
                max="10"
                value={numQuestions}
                onChange={(e) => setNumQuestions(e.target.value)}
              />
            </div>
            <button
              className="action-button"
              onClick={handleGenerateQuiz}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Quiz"}
            </button>
          </div>
        )}

        {activeTab === "analyze" && (
          <div className="tab-panel">
            <p>Analyze document type, language, topics, and sentiment.</p>
            <button
              className="action-button"
              onClick={handleAnalyzeDocument}
              disabled={loading}
            >
              {loading ? "Analyzing..." : "Analyze Document"}
            </button>
          </div>
        )}

        {activeTab === "qna" && (
          <div className="tab-panel">
            <div className="control-group">
              <label>Upload Question Paper (any: pdf/docx/txt/jpg/png)</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setQuestionFile(f || null);
                  setQuestionFileName(f?.name || "");
                }}
              />
              {questionFileName && <small>{questionFileName}</small>}
            </div>

            <div className="control-group">
              <label>Upload Answer Sheet (optional, any format)</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setAnswerFile(f || null);
                  setAnswerFileName(f?.name || "");
                }}
              />
              {answerFileName && <small>{answerFileName}</small>}
            </div>

           <div className="control-group">
              <label>Or combined file (Q&A together)</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setCombinedFile(f || null);
                  setCombinedFileName(f?.name || "");
                }}
              />
              {combinedFileName && <small>{combinedFileName}</small>}
            </div>

            <button
              className="action-button"
              onClick={handleExtractFiles}
              disabled={loading}
            >
              {loading ? "Extracting..." : "Extract Files"}
            </button>

            <div className="control-group">
              <label>Number of Questions:</label>
              <input
                type="number"
                min="3"
                max="15"
                value={qnaCount}
                onChange={(e) => setQnaCount(e.target.value)}
              />
            </div>
            <button
              className="action-button"
              onClick={handleGenerateQnA}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate Q&A"}
            </button>

            <div className="control-group">
              <label>Answer sheet text (auto-filled when uploaded)</label>
              <textarea
                rows="4"
                value={answerSheetText}
                onChange={(e) => setAnswerSheetText(e.target.value)}
                placeholder="Paste student's answers here..."
              />
            </div>
            <button
              className="action-button"
              onClick={handleGrade}
              disabled={loading || !result || result.type !== "qna"}
            >
              {loading ? "Checking..." : "Check Answers"}
            </button>

            {questionText && (
              <div className="control-group">
                <label>Extracted Question Paper (preview)</label>
                <textarea
                  rows="5"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                />
              </div>
            )}

            <div className="control-group">
              <label>Session title (for saving)</label>
              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                placeholder="e.g., Midterm Set A"
              />
            </div>
            <button
              className="action-button"
              onClick={handleSaveSession}
              disabled={loading || !result || result.type !== "qna"}
            >
              Save Session
            </button>

            <button className="action-button" onClick={fetchSessions}>
              Load Saved Sessions
            </button>
            {sessions.length > 0 && (
              <div className="quiz-container">
                {sessions.map((s) => (
                  <div key={s.id} className="quiz-question">
                    <h4>{s.title || "Session"}</h4>
                    <p>{new Date(s.createdAt).toLocaleString()}</p>
                    <button
                      className="action-button"
                      onClick={() => loadSession(s.id)}
                    >
                      Load
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {result && (
          <div className="result-container">
            {result.type === "summary" && (
              <>
                <h3>Summary</h3>
                <p className="result-content">{result.content}</p>
                <div className="result-stats">
                  <span>Original: {result.stats.originalLength} chars</span>
                  <span>Summary: {result.stats.summaryLength} chars</span>
                  <span>
                    Reduction:{" "}
                    {(
                      ((result.stats.originalLength -
                        result.stats.summaryLength) /
                        result.stats.originalLength) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              </>
            )}

            {result.type === "quiz" && (
              <>
                <h3>Generated Quiz ({result.count} questions)</h3>
                <div className="quiz-summary">
                  <span>
                    {quizSubmitted
                      ? `Score: ${quizScore}/${result.count}`
                      : "Select one answer for each question, then submit."}
                  </span>
                </div>
                <div className="quiz-container">
                  {result.content.map((question, qIndex) => (
                    <div key={qIndex} className="quiz-question">
                      <h4>
                        Q{qIndex + 1}: {question.question}
                      </h4>
                      <div
                        className="quiz-options"
                        role="radiogroup"
                        aria-label={`Question ${qIndex + 1}`}
                      >
                        {question.options.map((option, oIndex) => {
                          const isSelected = quizAnswers[qIndex] === oIndex;
                          const isCorrect = question.correctAnswer === oIndex;
                          const showResults = quizSubmitted;

                          return (
                            <label
                              key={oIndex}
                              className={`quiz-option ${isSelected ? "selected-option" : ""} ${
                                showResults && isCorrect ? "correct-answer" : ""
                              } ${showResults && isSelected && !isCorrect ? "wrong-answer" : ""}`}
                            >
                              <input
                                type="radio"
                                name={`quiz-question-${qIndex}`}
                                value={oIndex}
                                checked={isSelected}
                                onChange={() =>
                                  handleQuizAnswerChange(qIndex, oIndex)
                                }
                                disabled={quizSubmitted}
                              />
                              <span
                                className="option-marker"
                                aria-hidden="true"
                              >
                                <span className="option-marker-inner" />
                              </span>
                              <span className="option-letter">
                                {String.fromCharCode(65 + oIndex)})
                              </span>
                              <span className="option-text">{option}</span>
                              {showResults && isCorrect && (
                                <span className="answer-badge">Correct</span>
                              )}
                              {showResults && isSelected && !isCorrect && (
                                <span className="answer-badge wrong">
                                  Your choice
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="quiz-actions">
                  {!quizSubmitted ? (
                    <button
                      className="action-button"
                      onClick={handleSubmitQuiz}
                      disabled={loading}
                    >
                      Submit Quiz
                    </button>
                  ) : (
                    <button className="action-button" onClick={resetQuiz}>
                      Try Again
                    </button>
                  )}
                </div>
              </>
            )}

            {result.type === "analysis" && (
              <>
                <h3>Document Analysis</h3>
                <div className="analysis-result">
                  <pre>{JSON.stringify(result.content, null, 2)}</pre>
                </div>
              </>
            )}

            {result.type === "qna" && (
              <>
                <h3>Question Paper (editable)</h3>
                <div className="quiz-container">
                  {result.content.map((item, idx) => (
                    <div key={idx} className="quiz-question">
                      <label>
                        Question {idx + 1}
                        <textarea
                          value={item.question}
                          onChange={(e) =>
                            updateQnAItem(idx, "question", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Answer
                        <textarea
                          value={item.answer}
                          onChange={(e) =>
                            updateQnAItem(idx, "answer", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        Marks
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={scores[idx] ?? ""}
                          onChange={(e) => handleScoreChange(idx, e.target.value)}
                        />
                      </label>
                    </div>
                  ))}
                  <div className="quiz-summary">
                    <span>
                      Total Marks:{" "}
                      {scores
                        .map((s) => parseFloat(s) || 0)
                        .reduce((a, b) => a + b, 0)
                        .toFixed(1)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {gradingResult && (
              <>
                <h3>Grading Result</h3>
                <div className="quiz-summary">
                  <span>Average score: {(gradingResult.average * 100).toFixed(0)}%</span>
                </div>
                <div className="quiz-container">
                  {gradingResult.results.map((row, idx) => (
                    <div key={idx} className="quiz-question">
                      <h4>Q{idx + 1}: {row.question}</h4>
                      <p><strong>Expected:</strong> {row.expected}</p>
                      <p>
                        <strong>Matched terms:</strong>{" "}
                        {row.matchedTerms.join(", ") || "None"}
                      </p>
                      <p><strong>Score:</strong> {(row.score * 100).toFixed(0)}%</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button className="copy-button" onClick={handleCopyResult}>
              📋 Copy Result
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AITools;
