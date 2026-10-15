const express = require("express");
const hf = require("../services/huggingface");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const axios = require("axios");
const mammoth = require("mammoth");
const fse = require("fs-extra");
const PDFDocument = require("pdfkit");
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
} = require("docx");

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, "..", "uploads") });

const storeDir = path.join(__dirname, "..", "data", "grades");
fse.ensureDirSync(storeDir);
const documentsDir = path.join(__dirname, "..", "documents");
fse.ensureDirSync(documentsDir);

const OCR_BASE_URL = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000";
const OCR_URL = `${OCR_BASE_URL.replace(/\/$/, "")}/ocr`;

async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName || "").toLowerCase();

  // TXT: read directly
  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  // DOCX: use mammoth
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return value || "";
  }

  // PDF or images -> OCR service
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: originalName || path.basename(filePath),
  });
  form.append("langs", "en");
  form.append("fast", "true");
  form.append("preserve_layout", "true");

  try {
    const resp = await axios.post(OCR_URL, form, {
      headers: form.getHeaders(),
    });
    return resp.data?.extracted_text || "";
  } catch (error) {
    const isOcrDown =
      error.code === "ECONNREFUSED" ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT" ||
      String(error.message || "").includes("127.0.0.1:8000");

    if (isOcrDown) {
      const ocrError = new Error(
        `OCR service is not running. Check OCR_SERVICE_URL (${OCR_BASE_URL}) and try again.`,
      );
      ocrError.statusCode = 503;
      throw ocrError;
    }

    throw error;
  }
}

function cleanUploaded(files = []) {
  for (const f of files) {
    if (f?.path && fs.existsSync(f.path)) {
      fs.unlink(f.path, () => {});
    }
  }
}

function normalizeSubject(subject) {
  return (
    String(subject || "general")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general"
  );
}

async function findJsonFilesRecursive(rootDir) {
  const entries = await fse.readdir(rootDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findJsonFilesRecursive(entryPath);
      results.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(entryPath);
    }
  }

  return results;
}

async function findSessionFileById(rootDir, id) {
  const files = await findJsonFilesRecursive(rootDir);
  for (const filePath of files) {
    if (path.basename(filePath, ".json") === id) {
      return filePath;
    }
  }
  return null;
}

router.post(
  "/grade/upload",
  upload.fields([
    { name: "questionFile", maxCount: 1 },
    { name: "answerFile", maxCount: 1 },
    { name: "studentAnswerFile", maxCount: 1 },
    { name: "combinedFile", maxCount: 1 },
  ]),
  async (req, res) => {
    const qFile = req.files?.questionFile?.[0] || null;
    const aFile = req.files?.answerFile?.[0] || null;
    const sFile = req.files?.studentAnswerFile?.[0] || null;
    const cFile = req.files?.combinedFile?.[0] || null;

    if (!qFile && !cFile) {
      cleanUploaded([qFile, aFile, sFile, cFile]);
      return res.status(400).json({ error: "Upload a question paper file." });
    }

    try {
      const questionText = cFile
        ? await extractTextFromFile(cFile.path, cFile.originalname)
        : await extractTextFromFile(qFile.path, qFile.originalname);

      let answerText = "";
      let studentText = "";
      if (aFile) {
        answerText = await extractTextFromFile(aFile.path, aFile.originalname);
      } else if (cFile) {
        answerText = questionText; // fallback when single combined file
      }

      if (sFile) {
        studentText = await extractTextFromFile(sFile.path, sFile.originalname);
      } else if (cFile) {
        studentText = questionText; // fallback when single combined file
      }

      res.json({
        success: true,
        questionText,
        answerText,
        studentText,
      });
    } catch (error) {
      console.error("grade/upload error:", error.message);
      res.status(error.statusCode || 500).json({
        error: error.message || "Failed to process uploaded files",
      });
    } finally {
      cleanUploaded([qFile, aFile, sFile, cFile]);
    }
  },
);

router.post("/grade/save", async (req, res) => {
  try {
    const payload = req.body || {};
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const subjectKey = normalizeSubject(payload.subject);
    const record = {
      id,
      createdAt: new Date().toISOString(),
      subject: payload.subject || "General",
      ...payload,
    };
    const subjectDir = path.join(storeDir, subjectKey);
    await fse.ensureDir(subjectDir);
    const filePath = path.join(subjectDir, `${id}.json`);
    await fse.writeJson(filePath, record, { spaces: 2 });
    res.json({ success: true, id, subject: record.subject });
  } catch (error) {
    console.error("grade/save error:", error.message);
    res.status(500).json({ error: "Failed to save session" });
  }
});

router.get("/grade/sessions", async (_req, res) => {
  try {
    const files = await findJsonFilesRecursive(storeDir);
    const sessions = [];
    for (const file of files) {
      const data = await fse.readJson(file);
      sessions.push({
        id: data.id,
        createdAt: data.createdAt,
        title: data.title || "",
        subject: data.subject || "General",
      });
    }
    sessions.sort((a, b) => String(b.createdAt).localeCompare(a.createdAt));
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.get("/grade/sessions/:id", async (req, res) => {
  try {
    const filePath = await findSessionFileById(storeDir, req.params.id);
    if (!filePath || !(await fse.pathExists(filePath))) {
      return res.status(404).json({ error: "Session not found" });
    }
    const data = await fse.readJson(filePath);
    res.json({ success: true, session: data });
  } catch (error) {
    res.status(500).json({ error: "Failed to load session" });
  }
});

router.post("/grade/report", async (req, res) => {
  try {
    const {
      results = [],
      format = "docx",
      title = "Grading Report",
    } = req.body || {};

    if (!Array.isArray(results) || results.length === 0) {
      return res
        .status(400)
        .json({ error: "Results are required to generate report" });
    }

    const normalizedFormat = String(format).trim().toLowerCase();
    if (!["docx", "pdf"].includes(normalizedFormat)) {
      return res.status(400).json({ error: "Format must be docx or pdf" });
    }

    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const baseName = `grade-report-${stamp}`;

    const total = results.length;
    const avgPercent =
      results.reduce((sum, row) => sum + (Number(row.percentage) || 0), 0) /
      Math.max(total, 1);

    if (normalizedFormat === "docx") {
      const headerCells = [
        "Subject",
        "Student",
        "Roll No",
        "Q1",
        "Q2",
        "Q3",
        "Total",
        "%",
        "Status",
      ];

      const rows = [
        new TableRow({
          children: headerCells.map(
            (value) =>
              new TableCell({
                children: [new Paragraph(String(value))],
              }),
          ),
        }),
        ...results.map(
          (row) =>
            new TableRow({
              children: [
                row.subject || "General",
                row.studentName || "",
                row.rollNumber || "",
                row.q1 ?? "-",
                row.q2 ?? "-",
                row.q3 ?? "-",
                row.totalMarks ?? "",
                `${row.percentage ?? ""}`,
                row.status || "",
              ].map(
                (value) =>
                  new TableCell({
                    children: [new Paragraph(String(value))],
                  }),
              ),
            }),
        ),
      ];

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph(title),
              new Paragraph(`Generated: ${now.toLocaleString()}`),
              new Paragraph(`Students: ${total}`),
              new Paragraph(`Class Average: ${avgPercent.toFixed(1)}%`),
              new Paragraph(""),
              new Table({ rows }),
            ],
          },
        ],
      });

      const outputPath = path.join(documentsDir, `${baseName}.docx`);
      const outputBuffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outputPath, outputBuffer);

      return res.json({
        success: true,
        format: "docx",
        file: outputPath,
      });
    }

    const outputPath = path.join(documentsDir, `${baseName}.pdf`);
    const pdf = new PDFDocument({ margin: 40, size: "A4" });
    const stream = fs.createWriteStream(outputPath);
    pdf.pipe(stream);

    pdf.fontSize(18).text(title);
    pdf.moveDown(0.5);
    pdf
      .fontSize(10)
      .fillColor("#334155")
      .text(`Generated: ${now.toLocaleString()}`);
    pdf.text(`Students: ${total}`);
    pdf.text(`Class Average: ${avgPercent.toFixed(1)}%`);
    pdf.moveDown(0.8);
    pdf.fillColor("#0f172a");

    const header =
      "Subject | Student | Roll | Q1 | Q2 | Q3 | Total | % | Status";
    pdf.fontSize(11).text(header);
    pdf.moveDown(0.4);

    for (const row of results) {
      const line = [
        row.subject || "General",
        row.studentName || "",
        row.rollNumber || "",
        row.q1 ?? "-",
        row.q2 ?? "-",
        row.q3 ?? "-",
        row.totalMarks ?? "",
        row.percentage ?? "",
        row.status || "",
      ]
        .map((value) => String(value).replace(/\|/g, "/"))
        .join(" | ");

      pdf.fontSize(10).text(line);
    }

    pdf.end();

    stream.on("finish", () => {
      res.json({
        success: true,
        format: "pdf",
        file: outputPath,
      });
    });

    stream.on("error", (error) => {
      res
        .status(500)
        .json({ error: error.message || "Failed to write PDF report" });
    });
  } catch (error) {
    console.error("grade/report error:", error.message);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

/**
 * POST /api/ai/qna
 * Generate questions with answers from text (for question papers)
 */
router.post("/qna", async (req, res) => {
  try {
    const { text, numQuestions = 5 } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required" });
    }

    const qna = await hf.generateQnA(text, numQuestions);
    res.json({ success: true, qna, count: qna.length });
  } catch (error) {
    console.error("QnA generation error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate Q&A",
    });
  }
});

/**
 * POST /api/ai/grade
 * Grade student answers against generated answer key
 */
router.post("/grade", async (req, res) => {
  try {
    const { qna, studentText, studentName, rollNumber, subject } = req.body;

    if (!Array.isArray(qna) || !qna.length) {
      return res.status(400).json({ error: "Q&A array is required" });
    }
    if (!studentText || String(studentText).trim().length === 0) {
      return res.status(400).json({ error: "Student answer text is required" });
    }

    const grading = await hf.gradeAnswers(qna, studentText);
    res.json({
      success: true,
      studentName: studentName || "",
      rollNumber: rollNumber || "",
      subject: subject || "General",
      ...grading,
    });
  } catch (error) {
    console.error("Grading error:", error);
    res.status(500).json({
      error: error.message || "Failed to grade answers",
    });
  }
});

/**
 * POST /api/ai/summarize
 * Generate summary from text
 */
router.post("/summarize", async (req, res) => {
  try {
    const { text, maxLength = 150 } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Text is required",
      });
    }

    const summary = await hf.generateSummary(text, maxLength);

    res.json({
      success: true,
      summary,
      originalLength: text.length,
      summaryLength: summary.length,
    });
  } catch (error) {
    console.error("Summarization API error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate summary",
    });
  }
});

/**
 * POST /api/ai/quiz
 * Generate quiz questions from text
 */
router.post("/quiz", async (req, res) => {
  try {
    const { text, numQuestions = 3 } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Text is required",
      });
    }

    if (numQuestions < 1 || numQuestions > 10) {
      return res.status(400).json({
        error: "Number of questions must be between 1 and 10",
      });
    }

    const quiz = await hf.generateQuiz(text, numQuestions);

    res.json({
      success: true,
      quiz,
      count: quiz.length,
    });
  } catch (error) {
    console.error("Quiz generation API error:", error);
    res.status(500).json({
      error: error.message || "Failed to generate quiz",
    });
  }
});

/**
 * POST /api/ai/analyze
 * Analyze document content
 */
router.post("/analyze", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: "Text is required",
      });
    }

    const analysis = await hf.analyzeDocument(text);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("Document analysis API error:", error);
    res.status(500).json({
      error: error.message || "Failed to analyze document",
    });
  }
});

/**
 * GET /api/ai/health
 * Check if AI service is available
 */
router.get("/health", async (req, res) => {
  try {
    const isValid = await hf.validateApiKey();

    if (isValid) {
      res.json({
        status: "healthy",
        message: "Hugging Face API is configured correctly",
      });
    } else {
      res.status(503).json({
        status: "unhealthy",
        message: "Hugging Face API key may be invalid",
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: error.message,
    });
  }
});

module.exports = router;
