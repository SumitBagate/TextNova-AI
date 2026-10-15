import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnswerUpload from "../components/grading/AnswerUpload";
import ResultsTable from "../components/grading/ResultsTable";
import AnalyticsDashboard from "../components/grading/AnalyticsDashboard";
import "./HomePage.css";

const HomePage = ({ isLoggedIn = false, currentUser = null }) => {
  const RESULTS_DRAFT_KEY = "textnova-grading-results";
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  const readResponseBody = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    const text = await response.text();
    return { error: text || `Request failed with status ${response.status}` };
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RESULTS_DRAFT_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setResults(parsed);
      }
    } catch (_error) {
      // Ignore malformed local result cache.
    }
  }, []);

  useEffect(() => {
    try {
      if (!results.length) {
        localStorage.removeItem(RESULTS_DRAFT_KEY);
        return;
      }
      localStorage.setItem(RESULTS_DRAFT_KEY, JSON.stringify(results));
    } catch (_error) {
      // Ignore storage quota and privacy errors.
    }
  }, [results]);

  const handleUpload = async (formData) => {
    if (!isLoggedIn) {
      setError("Please login first to upload documents and generate grades.");
      return;
    }

    setLoading(true);
    setError("");
    setProcessingStatus("Uploading files...");

    try {
      // Step 1: Upload files and extract text via OCR
      setProcessingStatus("Extracting text from documents...");
      const uploadRes = await fetch(`${API_BASE}/api/ai/grade/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await readResponseBody(uploadRes);
        throw new Error(errorData.error || "Upload failed");
      }

      const uploadData = await readResponseBody(uploadRes);
      const studentAnswerText =
        uploadData.studentText || uploadData.studentAnswerText || "";
      const modelAnswerText =
        uploadData.answerText || uploadData.modelAnswerText || "";

      if (!studentAnswerText.trim() || !modelAnswerText.trim()) {
        throw new Error(
          "The backend did not return the expected extracted text fields.",
        );
      }

      setProcessingStatus("Generating question-answer pairs...");
      const qnaRes = await fetch(`${API_BASE}/api/ai/qna`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: modelAnswerText, numQuestions: 3 }),
      });

      if (!qnaRes.ok) {
        const errorData = await readResponseBody(qnaRes);
        throw new Error(errorData.error || "Failed to generate Q&A");
      }

      const qnaData = await readResponseBody(qnaRes);

      // Step 2: Send to AI for grading
      setProcessingStatus("Analyzing answers with AI...");
      const gradingRes = await fetch(`${API_BASE}/api/ai/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qna: qnaData.qna || [],
          studentText: studentAnswerText,
          studentName: formData.get("studentName"),
          rollNumber: formData.get("rollNumber"),
          subject: formData.get("subject"),
        }),
      });

      if (!gradingRes.ok) {
        const errorData = await readResponseBody(gradingRes);
        throw new Error(errorData.error || "Grading failed");
      }

      const gradingData = await readResponseBody(gradingRes);

      // Step 3: Add result to table
      const status =
        gradingData.percentage >= 70
          ? "pass"
          : gradingData.percentage >= 50
            ? "average"
            : "fail";

      setResults((prev) => [
        ...prev,
        {
          subject: formData.get("subject") || "General",
          studentName: gradingData.studentName,
          rollNumber: gradingData.rollNumber,
          q1: gradingData.questionMarks?.[0] || "-",
          q2: gradingData.questionMarks?.[1] || "-",
          q3: gradingData.questionMarks?.[2] || "-",
          totalMarks: gradingData.totalMarks,
          percentage: gradingData.percentage,
          status,
        },
      ]);

      await fetch(`${API_BASE}/api/ai/grade/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: formData.get("subject") || "General",
          studentName: gradingData.studentName,
          rollNumber: gradingData.rollNumber,
          totalMarks: gradingData.totalMarks,
          percentage: gradingData.percentage,
          questionMarks: gradingData.questionMarks,
          studentText: studentAnswerText,
          modelAnswerText,
        }),
      });

      setProcessingStatus("");
    } catch (err) {
      setError(err.message || "An error occurred during grading");
      setProcessingStatus("");
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setError("");
    try {
      localStorage.removeItem(RESULTS_DRAFT_KEY);
    } catch (_error) {
      // Ignore storage cleanup errors.
    }
  };

  const downloadFile = (filePath) => {
    if (!filePath) return;
    const fileName = String(filePath).split(/[\\/]/).pop();
    if (!fileName) return;
    const url = `${API_BASE}/documents/${encodeURIComponent(fileName)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleExportReport = async (format) => {
    try {
      setProcessingStatus(
        `Generating ${String(format).toUpperCase()} report...`,
      );
      const generatedBy =
        currentUser?.displayName || currentUser?.email || "Unknown User";
      const response = await fetch(`${API_BASE}/api/ai/grade/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          title: "Academic Evaluation Report",
          generatedBy,
          results,
        }),
      });

      const data = await readResponseBody(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate report");
      }

      downloadFile(data.file);
      setProcessingStatus("");
    } catch (err) {
      setProcessingStatus("");
      setError(err.message || "Report generation failed");
    }
  };

  return (
    <div className="home-page">
      <div className="hero-section">
        <div className="hero-content">
          <h1>🎓 AI Academic Evaluation System</h1>
          <p>Automated answer sheet grading with AI-powered analysis</p>
        </div>
      </div>

      <div className="page-container">
        {error && (
          <div className="error-banner">
            <span>❌ {error}</span>
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        {processingStatus && (
          <div className="status-banner">
            <span className="spinner-small"></span>
            <span>{processingStatus}</span>
          </div>
        )}

        {!isLoggedIn ? (
          <div className="login-required-card">
            <h3>🔐 Login Required</h3>
            <p>
              Please login before uploading question papers, model answers, and
              student sheets for grading.
            </p>
            <button className="report-btn" onClick={() => navigate("/login")}>
              Go to Login
            </button>
          </div>
        ) : (
          <AnswerUpload onUpload={handleUpload} loading={loading} />
        )}

        {results.length > 0 && (
          <>
            <AnalyticsDashboard results={results} />
            <ResultsTable results={results} loading={loading} />
            <div className="report-actions">
              <button
                className="report-btn"
                onClick={() => handleExportReport("docx")}
                disabled={loading || Boolean(processingStatus)}
              >
                📄 Save Report (DOCX)
              </button>
              <button
                className="report-btn"
                onClick={() => handleExportReport("pdf")}
                disabled={loading || Boolean(processingStatus)}
              >
                🧾 Save Report (PDF)
              </button>
              <button className="clear-btn" onClick={clearResults}>
                🔄 Clear Results
              </button>
            </div>
          </>
        )}

        {results.length === 0 && !processingStatus && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>No Results Yet</h3>
            <p>Upload answer sheets above to start grading</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
