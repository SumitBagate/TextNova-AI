import React, { useEffect, useState } from "react";
import "./AnswerUpload.css";

const DRAFT_KEY = "textnova-grading-draft";
const FILE_DB_NAME = "textnova-grading-files";
const FILE_STORE_NAME = "files";

const openFileDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readStoredFile = async (key) => {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readonly");
    const store = tx.objectStore(FILE_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => {
      const entry = request.result;
      if (!entry?.blob) {
        resolve(null);
        return;
      }

      resolve(
        new File([entry.blob], entry.name || key, {
          type: entry.type || entry.blob.type,
          lastModified: entry.lastModified || Date.now(),
        }),
      );
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const writeStoredFile = async (key, file) => {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    const store = tx.objectStore(FILE_STORE_NAME);
    store.put({
      key,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const deleteStoredFile = async (key) => {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, "readwrite");
    tx.objectStore(FILE_STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const AnswerUpload = ({ onUpload, loading }) => {
  const [questionFile, setQuestionFile] = useState(null);
  const [answerFile, setAnswerFile] = useState(null);
  const [studentAnswerFile, setStudentAnswerFile] = useState(null);
  const [subject, setSubject] = useState("");
  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [dragOver, setDragOver] = useState(null);

  const [draftNames, setDraftNames] = useState({
    questionName: "",
    answerName: "",
    studentName: "",
  });

  useEffect(() => {
    let isMounted = true;

    const restoreDraft = async () => {
      try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      if (saved?.subject) setSubject(saved.subject);
      if (saved?.studentName) setStudentName(saved.studentName);
      if (saved?.rollNumber) setRollNumber(saved.rollNumber);
      const [restoredQuestion, restoredAnswer] = await Promise.all([
        readStoredFile("questionFile"),
        readStoredFile("answerFile"),
      ]);

      if (!isMounted) return;

      if (restoredQuestion) setQuestionFile(restoredQuestion);
      if (restoredAnswer) setAnswerFile(restoredAnswer);

      setDraftNames({
        questionName: restoredQuestion?.name || saved?.questionName || "",
        answerName: restoredAnswer?.name || saved?.answerName || "",
        studentName: saved?.studentAnswerName || "",
      });
      } catch (_error) {
        // Ignore malformed draft data.
      }
    };

    restoreDraft();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveDraft = (patch) => {
    try {
      const current = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...current, ...patch }));
    } catch (_error) {
      // Ignore storage errors.
    }
  };

  const clearDraft = (keys = []) => {
    try {
      const current = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      keys.forEach((key) => {
        delete current[key];
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(current));
    } catch (_error) {
      // Ignore storage errors.
    }
  };

  const handleDragOver = (e, field) => {
    e.preventDefault();
    setDragOver(field);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = (e, field) => {
    e.preventDefault();
    setDragOver(null);
    const files = e.dataTransfer.files;
    if (files[0]) {
      handleFileSelect(files[0], field);
    }
  };

  const handleFileSelect = (file, field) => {
    if (field === "question") setQuestionFile(file);
    if (field === "answer") setAnswerFile(file);
    if (field === "student") setStudentAnswerFile(file);

    if (field === "question") {
      setDraftNames((prev) => ({ ...prev, questionName: file?.name || "" }));
      saveDraft({ questionName: file?.name || "" });
      if (file) writeStoredFile("questionFile", file).catch(() => {});
    }

    if (field === "answer") {
      setDraftNames((prev) => ({ ...prev, answerName: file?.name || "" }));
      saveDraft({ answerName: file?.name || "" });
      if (file) writeStoredFile("answerFile", file).catch(() => {});
    }

    if (field === "student") {
      setDraftNames((prev) => ({ ...prev, studentName: file?.name || "" }));
      saveDraft({ studentAnswerName: file?.name || "" });
    }
  };

  const handleRemoveFile = (field) => {
    if (field === "question") {
      setQuestionFile(null);
      setDraftNames((prev) => ({ ...prev, questionName: "" }));
      clearDraft(["questionName"]);
      deleteStoredFile("questionFile").catch(() => {});
    }
    if (field === "answer") {
      setAnswerFile(null);
      setDraftNames((prev) => ({ ...prev, answerName: "" }));
      clearDraft(["answerName"]);
      deleteStoredFile("answerFile").catch(() => {});
    }
    if (field === "student") {
      setStudentAnswerFile(null);
      setDraftNames((prev) => ({ ...prev, studentName: "" }));
      clearDraft(["studentAnswerName"]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!questionFile) {
      alert("Please upload a question paper");
      return;
    }
    if (!answerFile) {
      alert("Please upload a model answer sheet");
      return;
    }
    if (!studentAnswerFile) {
      alert("Please upload student answer sheet");
      return;
    }
    if (!subject.trim()) {
      alert("Please enter a subject");
      return;
    }
    if (!studentName.trim()) {
      alert("Please enter student name");
      return;
    }
    if (!rollNumber.trim()) {
      alert("Please enter roll number");
      return;
    }

    const formData = new FormData();
    formData.append("questionFile", questionFile);
    formData.append("answerFile", answerFile);
    formData.append("studentAnswerFile", studentAnswerFile);
    formData.append("subject", subject);
    formData.append("studentName", studentName);
    formData.append("rollNumber", rollNumber);

    onUpload(formData);

    saveDraft({
      subject,
      studentName,
      rollNumber,
      questionName: questionFile?.name || "",
      answerName: answerFile?.name || "",
      studentAnswerName: studentAnswerFile?.name || "",
    });

    // Clear only the student-specific answer so the next student can be graded.
    setStudentAnswerFile(null);
    setStudentName("");
    setRollNumber("");
    setDraftNames((prev) => ({ ...prev, studentName: "" }));
    clearDraft(["studentAnswerName", "studentName", "rollNumber"]);
  };

  return (
    <div className="answer-upload-container">
      <div className="upload-card">
        <h3>📚 Teacher's Materials</h3>

        <div className="student-info subject-row">
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              saveDraft({ subject: e.target.value });
            }}
            className="input-field"
          />
        </div>

        {/* Question Paper Upload */}
        <div
          className={`upload-zone ${dragOver === "question" ? "drag-over" : ""}`}
          onDragOver={(e) => handleDragOver(e, "question")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "question")}
        >
          <button
            type="button"
            className="remove-file-btn"
            onClick={() => handleRemoveFile("question")}
            aria-label="Remove question paper"
            disabled={loading || (!questionFile && !draftNames.questionName)}
          >
            ×
          </button>
          <label>
            <div className="upload-icon">📋</div>
            <span>Question Paper</span>
            {questionFile && (
              <span className="file-name">{questionFile.name}</span>
            )}
            {!questionFile && draftNames.questionName && (
              <span className="file-name">{draftNames.questionName}</span>
            )}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              onChange={(e) => handleFileSelect(e.target.files[0], "question")}
            />
          </label>
        </div>

        {/* Model Answer Upload */}
        <div
          className={`upload-zone ${dragOver === "answer" ? "drag-over" : ""}`}
          onDragOver={(e) => handleDragOver(e, "answer")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "answer")}
        >
          <button
            type="button"
            className="remove-file-btn"
            onClick={() => handleRemoveFile("answer")}
            aria-label="Remove model answer sheet"
            disabled={loading || (!answerFile && !draftNames.answerName)}
          >
            ×
          </button>
          <label>
            <div className="upload-icon">✅</div>
            <span>Model Answer Sheet</span>
            {answerFile && <span className="file-name">{answerFile.name}</span>}
            {!answerFile && draftNames.answerName && (
              <span className="file-name">{draftNames.answerName}</span>
            )}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              onChange={(e) => handleFileSelect(e.target.files[0], "answer")}
            />
          </label>
        </div>
      </div>

      <div className="upload-card">
        <h3>👨‍🎓 Student's Answer Sheet</h3>

        {/* Student Info */}
        <div className="student-info">
          <input
            type="text"
            placeholder="Student Name"
            value={studentName}
            onChange={(e) => {
              setStudentName(e.target.value);
              saveDraft({ studentName: e.target.value });
            }}
            className="input-field"
          />
          <input
            type="text"
            placeholder="Roll Number"
            value={rollNumber}
            onChange={(e) => {
              setRollNumber(e.target.value);
              saveDraft({ rollNumber: e.target.value });
            }}
            className="input-field"
          />
        </div>

        {/* Student Answer Upload */}
        <div
          className={`upload-zone ${dragOver === "student" ? "drag-over" : ""}`}
          onDragOver={(e) => handleDragOver(e, "student")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "student")}
        >
          <button
            type="button"
            className="remove-file-btn"
            onClick={() => handleRemoveFile("student")}
            aria-label="Remove student answer sheet"
            disabled={
              loading || (!studentAnswerFile && !draftNames.studentName)
            }
          >
            ×
          </button>
          <label>
            <div className="upload-icon">📝</div>
            <span>Answer Sheet (PDF/Image)</span>
            {studentAnswerFile && (
              <span className="file-name">{studentAnswerFile.name}</span>
            )}
            {!studentAnswerFile && draftNames.studentName && (
              <span className="file-name">{draftNames.studentName}</span>
            )}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.docx"
              onChange={(e) => handleFileSelect(e.target.files[0], "student")}
            />
          </label>
        </div>
      </div>

      <button className="submit-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? (
          <>
            <span className="spinner"></span>
            Processing...
          </>
        ) : (
          <>⚡ Grade Answer Sheet</>
        )}
      </button>
    </div>
  );
};

export default AnswerUpload;
