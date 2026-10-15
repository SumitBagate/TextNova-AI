import React, { useRef, useState } from "react";
import DocumentEditor from "../components/DocumentEditor";
import AITools from "../components/AITools";
import "./ConverterPage.css";

const SAMPLE_TEXT =
  "Sample Report: AI Document Conversion Demo\n\nThis is placeholder text so reviewers can try the editor, AI tools, and exports without uploading a file. Add headings, bullet points, or tab-separated rows like 'Name\tScore\tGrade' to see table previews.";

const Toast = ({ toast, onClose }) => {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      <span>{toast.message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
};

const ConverterPage = () => {
  const [extractedText, setExtractedText] = useState("");
  const [file, setFile] = useState(null);
  const [activeTab, setActiveTab] = useState("converter");
  const [loading, setLoading] = useState(false);
  const [conversionMethod, setConversionMethod] = useState("ocr");
  const [language, setLanguage] = useState("en");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translateEnabled, setTranslateEnabled] = useState(false);
  const [outputFormat, setOutputFormat] = useState("docx");
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [fastMode, setFastMode] = useState(true);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [stage, setStage] = useState("idle");
  const [conversionResult, setConversionResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [toast, setToast] = useState(null);
  const uploadXhrRef = useRef(null);
  const pollAbortRef = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

  const getFileUrl = (filePath) => {
    if (!filePath) return null;
    const fileName = String(filePath).split(/[\\/]/).pop();
    return `${API_BASE}/documents/${encodeURIComponent(fileName)}`;
  };

  const handleDownload = (filePath) => {
    const url = getFileUrl(filePath);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleEditDocument = () => {
    if (extractedText.trim()) {
      setActiveTab("editor");
    }
  };

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  };

  const handleFileChange = (e) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      showToast("File selected. Ready to convert.", "success");
    }
  };

  const uploadWithProgress = (url, formData) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      uploadXhrRef.current = xhr;
      xhr.open("POST", url, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        try {
          if (xhr.status === 0) {
            return reject(new Error("Upload cancelled"));
          }
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ status: xhr.status, data });
          } else {
            reject(new Error(data.details || data.error || "Upload failed"));
          }
        } catch (parseError) {
          reject(new Error("Invalid server response"));
        }
      };

      xhr.onerror = () => reject(new Error("Network error while uploading"));
      xhr.send(formData);
    });
  };

  const pollJobUntilDone = async (jobId, signal) => {
    while (true) {
      if (signal?.aborted) {
        throw new Error("Conversion cancelled");
      }
      const response = await fetch(`${API_BASE}/api/convert/progress/${jobId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch conversion progress");
      }

      const job = await response.json();
      setProcessingProgress(job.progress || 0);
      setStage(job.stage || "processing");

      if (job.status === "completed") {
        return job.result;
      }

      if (job.status === "failed") {
        throw new Error(job.error || "Conversion failed");
      }

      if (signal?.aborted) {
        throw new Error("Conversion cancelled");
      }

      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      showToast(`Added "${droppedFile.name}"`, "success");
    }
  };

  const handleFileUpload = async () => {
    if (!file) return;

    setLoading(true);
    setUploadProgress(0);
    setProcessingProgress(0);
    setStage("uploading");
    setConversionResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("langs", language);
    formData.append("translate", translateEnabled ? "true" : "false");
    formData.append("sourceLang", sourceLanguage);
    formData.append("targetLang", targetLanguage);
    formData.append("outputFormat", outputFormat);
    formData.append("conversionMethod", conversionMethod);
    formData.append("preserveLayout", preserveLayout ? "true" : "false");
    formData.append("fast", fastMode ? "true" : "false");
    formData.append("async", "true");

    try {
      const queued = await uploadWithProgress(
        `${API_BASE}/api/convert`,
        formData,
      );
      setStage("processing");

      pollAbortRef.current = new AbortController();
      const result = await pollJobUntilDone(
        queued.data.jobId,
        pollAbortRef.current.signal,
      );

      setConversionResult(result);
      setExtractedText(result.extractedText || "");
      setStage("completed");
      showToast(
        `Conversion complete! Extracted ${result.extractedText?.split(" ").length || 0} words.`,
        "success",
      );
    } catch (error) {
      setStage("error");
      showToast(
        error.message === "Conversion cancelled"
          ? "Conversion cancelled"
          : `Conversion failed: ${error.message}`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancelUpload = () => {
    uploadXhrRef.current?.abort();
    pollAbortRef.current?.abort();
    setLoading(false);
    setStage("idle");
    setUploadProgress(0);
    setProcessingProgress(0);
  };

  return (
    <div className="converter-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="converter-container">
        <div className="converter-header">
          <h2>📄 Document Converter</h2>
          <p>Convert PDFs and images to editable documents</p>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "converter" ? "active" : ""}`}
            onClick={() => setActiveTab("converter")}
          >
            📤 Convert
          </button>
          <button
            className={`tab ${activeTab === "editor" ? "active" : ""}`}
            onClick={() => setActiveTab("editor")}
          >
            ✏️ Editor
          </button>
          <button
            className={`tab ${activeTab === "tools" ? "active" : ""}`}
            onClick={() => setActiveTab("tools")}
          >
            🧠 AI Tools
          </button>
        </div>

        {activeTab === "converter" && (
          <div className="converter-section">
            <div className="file-input-section">
              <div
                className={`drag-drop ${isDragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.txt"
                  id="file-input"
                />
                <label htmlFor="file-input">
                  <div className="icon">📁</div>
                  <p>Drag & drop your file here or click to select</p>
                  <small>Supported: PDF, JPG, PNG, DOCX, TXT</small>
                </label>
              </div>

              {file && (
                <div className="selected-file">
                  <span>✓ Selected: {file.name}</span>
                  <button onClick={() => setFile(null)}>Remove</button>
                </div>
              )}
            </div>

            <div className="options-grid">
              <div className="option option-wide">
                <label>Conversion Method</label>
                <div
                  className="method-toggle"
                  role="radiogroup"
                  aria-label="Conversion Method"
                >
                  <button
                    type="button"
                    className={`method-btn ${conversionMethod === "ocr" ? "active" : ""}`}
                    onClick={() => setConversionMethod("ocr")}
                    disabled={loading}
                  >
                    OCR (for images/scanned files)
                  </button>
                  <button
                    type="button"
                    className={`method-btn ${conversionMethod === "direct" ? "active" : ""}`}
                    onClick={() => setConversionMethod("direct")}
                    disabled={loading}
                  >
                    Direct (without OCR)
                  </button>
                </div>
                <small className="method-hint">
                  Direct mode works best for digital TXT, DOCX, or PDF files.
                  Use OCR for scanned/image-based documents.
                </small>
              </div>

              <div className="option">
                <label>OCR Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loading}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                </select>
              </div>

              <div className="option checkbox">
                <input
                  type="checkbox"
                  checked={translateEnabled}
                  onChange={(e) => setTranslateEnabled(e.target.checked)}
                  disabled={loading}
                  id="translate"
                />
                <label htmlFor="translate">Translate Content</label>
              </div>

              <div className="option">
                <label>Translate From</label>
                <select
                  value={sourceLanguage}
                  onChange={(e) => setSourceLanguage(e.target.value)}
                  disabled={loading || !translateEnabled}
                >
                  <option value="auto">Auto Detect</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                  <option value="it">Italian</option>
                  <option value="ru">Russian</option>
                  <option value="ar">Arabic</option>
                  <option value="zh-CN">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="bn">Bengali</option>
                  <option value="gu">Gujarati</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                  <option value="ur">Urdu</option>
                </select>
              </div>

              <div className="option">
                <label>Translate To</label>
                <select
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  disabled={loading || !translateEnabled}
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="mr">Marathi</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="pt">Portuguese</option>
                  <option value="it">Italian</option>
                  <option value="ru">Russian</option>
                  <option value="ar">Arabic</option>
                  <option value="zh-CN">Chinese</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="bn">Bengali</option>
                  <option value="gu">Gujarati</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                  <option value="ur">Urdu</option>
                </select>
              </div>

              <div className="option">
                <label>Output Format</label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  disabled={loading}
                >
                  <option value="docx">DOCX</option>
                  <option value="pdf">PDF</option>
                  <option value="txt">TXT</option>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </div>

              <div className="option checkbox">
                <input
                  type="checkbox"
                  checked={preserveLayout}
                  onChange={(e) => setPreserveLayout(e.target.checked)}
                  disabled={loading}
                  id="preserve"
                />
                <label htmlFor="preserve">Preserve Layout</label>
              </div>

              <div className="option checkbox">
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={(e) => setFastMode(e.target.checked)}
                  disabled={loading}
                  id="fast"
                />
                <label htmlFor="fast">Fast Mode</label>
              </div>
            </div>

            {loading && (
              <div className="progress-section">
                <div className="stage-indicator">{stage.toUpperCase()}</div>

                <div className="progress-group">
                  <label>Upload Progress</label>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <span>{uploadProgress}%</span>
                </div>

                <div className="progress-group">
                  <label>Processing</label>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${processingProgress}%` }}
                    ></div>
                  </div>
                  <span>{processingProgress}%</span>
                </div>
              </div>
            )}

            <div className="button-group">
              <button
                className="btn btn-primary"
                onClick={handleFileUpload}
                disabled={!file || loading}
              >
                {loading ? "Converting..." : "🚀 Start Conversion"}
              </button>
              {loading && (
                <button
                  className="btn btn-secondary"
                  onClick={handleCancelUpload}
                >
                  ⏹️ Cancel
                </button>
              )}
            </div>

            {stage === "completed" && conversionResult && (
              <div className="conversion-actions">
                <div className="result-message success">
                  ✓ Conversion successful! Your document is ready.
                </div>

                <div className="action-row" style={{ marginTop: "12px" }}>
                  <button
                    className="secondary-button"
                    onClick={handleEditDocument}
                    disabled={!extractedText.trim()}
                  >
                    ✏️ Edit Document
                  </button>

                  {conversionResult.docx && (
                    <button
                      className="secondary-button"
                      onClick={() => handleDownload(conversionResult.docx)}
                    >
                      ⬇ Download DOCX
                    </button>
                  )}

                  {conversionResult.pdf && (
                    <button
                      className="secondary-button"
                      onClick={() => handleDownload(conversionResult.pdf)}
                    >
                      ⬇ Download PDF
                    </button>
                  )}

                  {conversionResult.txt && (
                    <button
                      className="secondary-button"
                      onClick={() => handleDownload(conversionResult.txt)}
                    >
                      ⬇ Download TXT
                    </button>
                  )}

                  {conversionResult.png && (
                    <button
                      className="secondary-button"
                      onClick={() => handleDownload(conversionResult.png)}
                    >
                      ⬇ Download PNG
                    </button>
                  )}

                  {conversionResult.jpg && (
                    <button
                      className="secondary-button"
                      onClick={() => handleDownload(conversionResult.jpg)}
                    >
                      ⬇ Download JPG
                    </button>
                  )}
                </div>
              </div>
            )}

            {stage === "error" && (
              <div className="result-message error">
                ✗ Conversion failed. Please try again.
              </div>
            )}
          </div>
        )}

        {activeTab === "editor" && (
          <div className="editor-section">
            <DocumentEditor
              initialContent={extractedText || SAMPLE_TEXT}
              onSave={(content) => {
                setExtractedText(content);
                showToast("Content saved", "success");
              }}
              showToast={showToast}
            />
          </div>
        )}

        {activeTab === "tools" && (
          <div className="tools-section">
            <AITools extractedText={extractedText} showToast={showToast} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ConverterPage;
