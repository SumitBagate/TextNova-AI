const express = require("express");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const path = require("path");
const multer = require("multer");
const { execFile } = require("child_process");
const { promisify } = require("util");
const mammoth = require("mammoth");
const sharp = require("sharp");
const pdfParseModule = require("pdf-parse");
const PDFParse =
  pdfParseModule.PDFParse ||
  pdfParseModule.default?.PDFParse ||
  pdfParseModule.default;
const {
  Document,
  Packer,
  Paragraph,
  ImageRun,
  TextRun,
  Table,
  TableRow,
  TableCell,
} = require("docx");
const PDFDocument = require("pdfkit");

const execFileAsync = promisify(execFile);

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, "..", "uploads") });
const convertUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

const documentsDir = path.join(__dirname, "..", "documents");
fs.mkdirSync(documentsDir, { recursive: true });

const convertJobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;

const DEVANAGARI_FONT_PATHS = [
  path.join(__dirname, "..", "fonts", "NotoSansDevanagari-Regular.ttf"),
  "C:\\Windows\\Fonts\\Nirmala.ttf",
  "C:\\Windows\\Fonts\\Mangal.ttf",
];

function resolveImagePath(imagePath) {
  if (!imagePath) {
    return null;
  }

  const normalizedImagePath = String(imagePath).trim();

  if (
    path.isAbsolute(normalizedImagePath) &&
    fs.existsSync(normalizedImagePath)
  ) {
    return normalizedImagePath;
  }

  const backendRelativePath = path.resolve(
    __dirname,
    "..",
    normalizedImagePath,
  );
  if (fs.existsSync(backendRelativePath)) {
    return backendRelativePath;
  }

  const uploadsPath = path.join(
    __dirname,
    "..",
    "uploads",
    path.basename(normalizedImagePath),
  );
  if (fs.existsSync(uploadsPath)) {
    return uploadsPath;
  }

  return backendRelativePath;
}

function normalizeOcrLangs(languageInput) {
  // Default to English for speed; pass langs explicitly when needed.
  const raw = String(languageInput || "en").toLowerCase();
  const aliases = { english: "en", hindi: "hi", marathi: "mr" };
  const valid = new Set(["en", "hi", "mr"]);

  const langs = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((lang) => aliases[lang] || lang)
    .filter((lang) => valid.has(lang));

  return langs.length ? langs.join(",") : "en";
}

function pickPdfFont(languageInput) {
  const selectedLangs = normalizeOcrLangs(languageInput);
  const needsDevanagari =
    selectedLangs.includes("hi") || selectedLangs.includes("mr");

  if (!needsDevanagari) {
    return null;
  }

  for (const fontPath of DEVANAGARI_FONT_PATHS) {
    if (fs.existsSync(fontPath)) {
      return fontPath;
    }
  }

  return null;
}

function parseOutputFormats(formatInput) {
  // Default to DOCX only to reduce generation time.
  const raw = String(formatInput || "docx").toLowerCase();
  const tokens = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const formats = new Set();
  for (const token of tokens) {
    if (token === "both" || token === "all") {
      formats.add("docx");
      formats.add("pdf");
      formats.add("png");
      formats.add("jpg");
      continue;
    }

    if (
      token === "docx" ||
      token === "pdf" ||
      token === "txt" ||
      token === "png" ||
      token === "jpg" ||
      token === "jpeg"
    ) {
      formats.add(token);
    }
  }

  if (!formats.size) {
    formats.add("docx");
  }

  return formats;
}

function parseFastMode(value) {
  if (value === undefined || value === null || value === "") {
    return "true";
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized) ? "true" : "false";
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function getFileExtension(filePath) {
  return path.extname(filePath || "").toLowerCase();
}

function parseConversionMethod(input) {
  const value = String(input || "ocr")
    .trim()
    .toLowerCase();
  return value === "direct" ? "direct" : "ocr";
}

function normalizeTranslateLang(languageInput, fallback = "en") {
  const raw = String(languageInput || fallback)
    .trim()
    .toLowerCase();

  const aliases = {
    auto: "auto",
    english: "en",
    hindi: "hi",
    marathi: "mr",
    spanish: "es",
    french: "fr",
    german: "de",
    portuguese: "pt",
    italian: "it",
    russian: "ru",
    arabic: "ar",
    chinese: "zh-CN",
    japanese: "ja",
    korean: "ko",
    bengali: "bn",
    gujarati: "gu",
    tamil: "ta",
    telugu: "te",
    urdu: "ur",
  };

  return aliases[raw] || raw;
}

function splitTextForTranslate(inputText, maxChunkLength = 3500) {
  const text = String(inputText || "");
  if (text.length <= maxChunkLength) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxChunkLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (line.length <= maxChunkLength) {
      current = line;
      continue;
    }

    let remainder = line;
    while (remainder.length > maxChunkLength) {
      chunks.push(remainder.slice(0, maxChunkLength));
      remainder = remainder.slice(maxChunkLength);
    }
    current = remainder;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function translateChunk(text, sourceLang, targetLang) {
  const response = await axios.get(
    "https://translate.googleapis.com/translate_a/single",
    {
      params: {
        client: "gtx",
        sl: sourceLang,
        tl: targetLang,
        dt: "t",
        q: text,
      },
      timeout: 30000,
    },
  );

  const body = response.data;
  if (!Array.isArray(body) || !Array.isArray(body[0])) {
    throw new Error("Unexpected translation response format.");
  }

  return body[0]
    .map((part) => (Array.isArray(part) ? part[0] : ""))
    .join("")
    .trim();
}

async function translateTextIfRequested(text, body, onProgress = () => {}) {
  const translateEnabled = parseBoolean(body.translate, false);
  if (!translateEnabled || !String(text || "").trim()) {
    return {
      translatedText: text,
      translated: false,
      sourceLang: normalizeTranslateLang(body.sourceLang || "auto", "auto"),
      targetLang: normalizeTranslateLang(body.targetLang || "en", "en"),
    };
  }

  const sourceLang = normalizeTranslateLang(body.sourceLang || "auto", "auto");
  const targetLang = normalizeTranslateLang(body.targetLang || "en", "en");
  if (targetLang === "auto") {
    throw new Error("Target language cannot be auto for translation.");
  }

  const chunks = splitTextForTranslate(text);
  const translatedParts = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const progress = 45 + Math.round(((index + 1) / chunks.length) * 15);
    onProgress(progress, "translating_text");
    const translatedChunk = await translateChunk(
      chunks[index],
      sourceLang,
      targetLang,
    );
    translatedParts.push(translatedChunk);
  }

  return {
    translatedText: translatedParts.join("\n"),
    translated: true,
    sourceLang,
    targetLang,
  };
}

async function extractTextFromPdfDirect(pdfPath) {
  if (!PDFParse) {
    throw new Error("PDF parser is not available.");
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const parsed = await parser.getText();
    return String(parsed?.text || "").trim();
  } finally {
    if (typeof parser.destroy === "function") {
      await parser.destroy();
    }
  }
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapTextForImage(text, maxChars = 70, maxLines = 120) {
  const rawLines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");
  const lines = [];

  for (const raw of rawLines) {
    if (!raw.trim()) {
      lines.push("");
      continue;
    }

    const words = raw.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
      if (lines.length >= maxLines) {
        return lines;
      }
    }

    if (current) {
      lines.push(current);
    }

    if (lines.length >= maxLines) {
      return lines;
    }
  }

  return lines.length ? lines : [""];
}

async function generateImageFromText(text, outputPath, format, languageInput) {
  const lines = wrapTextForImage(text);
  const width = 1400;
  const padding = 56;
  const lineHeight = 34;
  const height = Math.max(900, padding * 2 + lines.length * lineHeight);
  const fontFamily = getDocxFontForLanguage(languageInput)
    ? "Nirmala UI, Mangal, Arial, sans-serif"
    : "Arial, sans-serif";

  const textNodes = lines
    .map((line, index) => {
      const y = padding + (index + 1) * lineHeight;
      return `<text x="${padding}" y="${y}" font-size="28" fill="#0f172a">${escapeXml(line)}</text>`;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <style>
        text { font-family: ${fontFamily}; }
      </style>
      <rect width="100%" height="100%" fill="#ffffff" />
      ${textNodes}
    </svg>
  `;

  let pipeline = sharp(Buffer.from(svg));
  if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
  }

  await pipeline.toFile(outputPath);
}

function getDocxFontForLanguage(languageInput) {
  const selectedLangs = normalizeOcrLangs(languageInput);
  if (selectedLangs.includes("hi") || selectedLangs.includes("mr")) {
    return "Nirmala UI";
  }
  return null;
}

function buildParagraph(text, languageInput) {
  const font = getDocxFontForLanguage(languageInput);
  if (!font) {
    return new Paragraph(String(text || ""));
  }

  return new Paragraph({
    children: [
      new TextRun({
        text: String(text || ""),
        font,
      }),
    ],
  });
}

function createJob() {
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const job = {
    jobId,
    status: "queued",
    progress: 0,
    stage: "queued",
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
  };
  convertJobs.set(jobId, job);
  return job;
}

function updateJob(jobId, patch) {
  const existing = convertJobs.get(jobId);
  if (!existing) {
    return;
  }
  convertJobs.set(jobId, {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

function expireJob(jobId) {
  setTimeout(() => {
    convertJobs.delete(jobId);
  }, JOB_TTL_MS);
}

function isPdfUpload(filePath, contentType) {
  const extension = path.extname(filePath || "").toLowerCase();
  if (extension === ".pdf") {
    return true;
  }
  return String(contentType || "")
    .toLowerCase()
    .includes("pdf");
}

function resolveVenvPython() {
  const candidate = path.resolve(
    __dirname,
    "..",
    "..",
    ".venv",
    "Scripts",
    "python.exe",
  );
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return "python";
}

async function convertPdfToDocxPreserveLayout(pdfPath, docxPath) {
  const pythonExe = resolveVenvPython();
  const scriptPath = path.resolve(__dirname, "..", "scripts", "pdf_to_docx.py");
  await execFileAsync(pythonExe, [scriptPath, pdfPath, docxPath]);
}

function buildDocChildrenFromText(text, languageInput) {
  const lines = String(text || "").split(/\r?\n/);
  const children = [];
  let tableLines = [];

  const flushTableLines = () => {
    if (!tableLines.length) {
      return;
    }

    if (tableLines.length < 2) {
      children.push(
        buildParagraph(tableLines[0].replace(/\t/g, " "), languageInput),
      );
      tableLines = [];
      return;
    }

    const parsedRows = tableLines.map((line) =>
      line.split("\t").map((cell) => cell.trim()),
    );
    const columnCount = Math.max(...parsedRows.map((row) => row.length));

    const tableRows = parsedRows.map(
      (row) =>
        new TableRow({
          children: Array.from({ length: columnCount }, (_, index) => {
            const value = row[index] || "";
            return new TableCell({
              children: [buildParagraph(value, languageInput)],
            });
          }),
        }),
    );

    children.push(new Table({ rows: tableRows }));
    tableLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (!trimmed) {
      flushTableLines();
      children.push(buildParagraph("", languageInput));
      continue;
    }

    if (trimmed.includes("\t")) {
      tableLines.push(trimmed);
      continue;
    }

    flushTableLines();
    children.push(buildParagraph(trimmed, languageInput));
  }

  flushTableLines();
  return children.length ? children : [buildParagraph("", languageInput)];
}

function buildImagePreservingDocx(imagePath, text) {
  const imageBuffer = fs.readFileSync(imagePath);
  const textChildren = buildDocChildrenFromText(text, "en");

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: {
                  width: 560,
                  height: 760,
                },
              }),
            ],
          }),
          new Paragraph(""),
          new Paragraph("Extracted Text"),
          ...textChildren,
        ],
      },
    ],
  });
}

async function executeConversion(
  { uploadedFile, rawImagePath, imagePath, body },
  onProgress = () => {},
) {
  onProgress(10, "sending_to_ocr");

  const formData = new FormData();
  const ocrFilename =
    uploadedFile?.originalname ||
    body.filename ||
    path.basename(rawImagePath || imagePath);
  const ocrContentType = uploadedFile?.mimetype || undefined;

  formData.append("file", fs.createReadStream(imagePath), {
    filename: ocrFilename,
    contentType: ocrContentType,
  });

  const ocrLangs = normalizeOcrLangs(body.langs || body.language);
  const fastMode = parseFastMode(body.fast);
  const preserveLayout = parseBoolean(body.preserveLayout, false);
  formData.append("langs", ocrLangs);
  formData.append("fast", fastMode);
  formData.append("preserve_layout", preserveLayout ? "true" : "false");

  const ocrBaseUrl = process.env.OCR_SERVICE_URL || "http://127.0.0.1:8000";
  const response = await axios.post(
    `${ocrBaseUrl.replace(/\/$/, "")}/ocr`,
    formData,
    {
    headers: formData.getHeaders(),
    },
  );

  onProgress(60, "ocr_completed");

  const extractedText = response.data.extracted_text;
  const translationResult = await translateTextIfRequested(
    extractedText,
    body,
    onProgress,
  );
  const text = translationResult.translatedText;
  const requestedFormats = parseOutputFormats(body.outputFormat || body.format);
  const canPreservePdfLayout =
    preserveLayout &&
    isPdfUpload(ocrFilename, ocrContentType) &&
    requestedFormats.has("docx");
  const canPreserveImageLayout =
    preserveLayout &&
    !isPdfUpload(ocrFilename, ocrContentType) &&
    requestedFormats.has("docx");
  const fileStamp = `file-${Date.now()}`;
  const outputFiles = {};

  if (canPreservePdfLayout) {
    onProgress(70, "generating_docx_layout_pdf");
    const docPath = path.join(documentsDir, `${fileStamp}.docx`);
    await convertPdfToDocxPreserveLayout(imagePath, docPath);
    outputFiles.docx = docPath;
  }

  if (canPreserveImageLayout) {
    onProgress(70, "generating_docx_layout_image");
    const docPath = path.join(documentsDir, `${fileStamp}.docx`);
    const doc = buildImagePreservingDocx(imagePath, text);
    const docBuffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docPath, docBuffer);
    outputFiles.docx = docPath;
  }

  if (requestedFormats.has("docx") && !outputFiles.docx) {
    onProgress(75, "generating_docx");
    const children = buildDocChildrenFromText(
      text,
      body.langs || body.language,
    );
    const doc = new Document({
      sections: [{ children }],
    });

    const docBuffer = await Packer.toBuffer(doc);
    const docPath = path.join(documentsDir, `${fileStamp}.docx`);
    fs.writeFileSync(docPath, docBuffer);
    outputFiles.docx = docPath;
  }

  let pdfFontPath = null;
  if (requestedFormats.has("pdf")) {
    onProgress(85, "generating_pdf");
    const pdfPath = path.join(documentsDir, `${fileStamp}.pdf`);
    const pdf = new PDFDocument();
    pdf.pipe(fs.createWriteStream(pdfPath));
    pdfFontPath = pickPdfFont(body.pdfLanguage || body.langs || body.language);
    if (pdfFontPath) {
      pdf.font(pdfFontPath);
    }
    pdf.text(text, { lineGap: 4 });
    pdf.end();
    outputFiles.pdf = pdfPath;
  }

  if (requestedFormats.has("txt")) {
    onProgress(90, "generating_txt");
    const txtPath = path.join(documentsDir, `${fileStamp}.txt`);
    fs.writeFileSync(txtPath, text, "utf8");
    outputFiles.txt = txtPath;
  }

  if (
    requestedFormats.has("png") ||
    requestedFormats.has("jpg") ||
    requestedFormats.has("jpeg")
  ) {
    onProgress(95, "generating_image");
    const outputLanguage = body.targetLang || body.langs || body.language;

    if (requestedFormats.has("png")) {
      const pngPath = path.join(documentsDir, `${fileStamp}.png`);
      await generateImageFromText(text, pngPath, "png", outputLanguage);
      outputFiles.png = pngPath;
    }

    if (requestedFormats.has("jpg") || requestedFormats.has("jpeg")) {
      const jpgPath = path.join(documentsDir, `${fileStamp}.jpg`);
      await generateImageFromText(text, jpgPath, "jpg", outputLanguage);
      outputFiles.jpg = jpgPath;
    }
  }

  onProgress(100, "completed");

  return {
    message: "Conversion successful",
    extractedText: text,
    text,
    docx: outputFiles.docx || null,
    pdf: outputFiles.pdf || null,
    txt: outputFiles.txt || null,
    png: outputFiles.png || null,
    jpg: outputFiles.jpg || null,
    outputs: outputFiles,
    outputFormats: Array.from(requestedFormats),
    preserveLayout,
    ocrLangs,
    fastMode,
    translated: translationResult.translated,
    translation: {
      sourceLang: translationResult.sourceLang,
      targetLang: translationResult.targetLang,
    },
    pdfFont: pdfFontPath || "default",
  };
}

async function executeDirectConversion(
  { uploadedFile, rawImagePath, imagePath, body },
  onProgress = () => {},
) {
  const requestedFormats = parseOutputFormats(body.outputFormat || body.format);
  const ocrFilename =
    uploadedFile?.originalname ||
    body.filename ||
    path.basename(rawImagePath || imagePath);
  const extension = getFileExtension(ocrFilename);
  const fileStamp = `file-${Date.now()}`;
  const outputFiles = {};

  if ([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"].includes(extension)) {
    throw new Error(
      "Direct mode does not support image files. Please use OCR mode for image or scanned documents.",
    );
  }

  onProgress(20, "direct_reading");

  let text = "";
  if (extension === ".txt") {
    text = fs.readFileSync(imagePath, "utf8");
  } else if (extension === ".docx") {
    const extracted = await mammoth.extractRawText({ path: imagePath });
    text = extracted.value || "";
  } else if (extension === ".pdf") {
    text = await extractTextFromPdfDirect(imagePath);
  }

  const translationResult = await translateTextIfRequested(
    text,
    body,
    onProgress,
  );
  text = translationResult.translatedText;

  if (requestedFormats.has("docx")) {
    onProgress(60, "direct_generating_docx");

    if (extension === ".pdf") {
      const docPath = path.join(documentsDir, `${fileStamp}.docx`);
      if (translationResult.translated) {
        const children = buildDocChildrenFromText(
          text,
          body.targetLang || body.langs || body.language,
        );
        const doc = new Document({ sections: [{ children }] });
        const docBuffer = await Packer.toBuffer(doc);
        fs.writeFileSync(docPath, docBuffer);
      } else {
        await convertPdfToDocxPreserveLayout(imagePath, docPath);
      }
      outputFiles.docx = docPath;
    } else if (extension === ".docx" && !translationResult.translated) {
      const docPath = path.join(documentsDir, `${fileStamp}.docx`);
      fs.copyFileSync(imagePath, docPath);
      outputFiles.docx = docPath;
    } else {
      const children = buildDocChildrenFromText(
        text,
        body.langs || body.language,
      );
      const doc = new Document({ sections: [{ children }] });
      const docBuffer = await Packer.toBuffer(doc);
      const docPath = path.join(documentsDir, `${fileStamp}.docx`);
      fs.writeFileSync(docPath, docBuffer);
      outputFiles.docx = docPath;
    }
  }

  if (requestedFormats.has("pdf")) {
    onProgress(75, "direct_generating_pdf");

    if (extension === ".pdf" && !translationResult.translated) {
      const pdfPath = path.join(documentsDir, `${fileStamp}.pdf`);
      fs.copyFileSync(imagePath, pdfPath);
      outputFiles.pdf = pdfPath;
    } else {
      const pdfPath = path.join(documentsDir, `${fileStamp}.pdf`);
      const pdf = new PDFDocument();
      pdf.pipe(fs.createWriteStream(pdfPath));
      const pdfFontPath = pickPdfFont(
        body.pdfLanguage || body.langs || body.language,
      );
      if (pdfFontPath) {
        pdf.font(pdfFontPath);
      }
      pdf.text(text, { lineGap: 4 });
      pdf.end();
      outputFiles.pdf = pdfPath;
    }
  }

  if (requestedFormats.has("txt")) {
    onProgress(90, "direct_generating_txt");

    if (extension === ".pdf" && !text.trim()) {
      throw new Error(
        "Could not extract text from this PDF in direct mode. Use OCR mode for scanned/image PDFs.",
      );
    }

    const txtPath = path.join(documentsDir, `${fileStamp}.txt`);
    fs.writeFileSync(txtPath, text, "utf8");
    outputFiles.txt = txtPath;
  }

  if (
    requestedFormats.has("png") ||
    requestedFormats.has("jpg") ||
    requestedFormats.has("jpeg")
  ) {
    onProgress(95, "direct_generating_image");
    const outputLanguage =
      body.targetLang ||
      body.langs ||
      body.language ||
      translationResult.targetLang;

    if (requestedFormats.has("png")) {
      const pngPath = path.join(documentsDir, `${fileStamp}.png`);
      await generateImageFromText(text, pngPath, "png", outputLanguage);
      outputFiles.png = pngPath;
    }

    if (requestedFormats.has("jpg") || requestedFormats.has("jpeg")) {
      const jpgPath = path.join(documentsDir, `${fileStamp}.jpg`);
      await generateImageFromText(text, jpgPath, "jpg", outputLanguage);
      outputFiles.jpg = jpgPath;
    }
  }

  onProgress(100, "completed");

  return {
    message: "Conversion successful",
    extractedText: text,
    text,
    docx: outputFiles.docx || null,
    pdf: outputFiles.pdf || null,
    txt: outputFiles.txt || null,
    png: outputFiles.png || null,
    jpg: outputFiles.jpg || null,
    outputs: outputFiles,
    outputFormats: Array.from(requestedFormats),
    preserveLayout: parseBoolean(body.preserveLayout, false),
    ocrLangs: normalizeOcrLangs(body.langs || body.language),
    fastMode: parseFastMode(body.fast),
    conversionMethod: "direct",
    translated: translationResult.translated,
    translation: {
      sourceLang: translationResult.sourceLang,
      targetLang: translationResult.targetLang,
    },
    pdfFont: "default",
  };
}

router.get("/convert/progress/:jobId", (req, res) => {
  const job = convertJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      error: "Job not found",
      details: "Invalid jobId or the job has expired.",
    });
  }

  return res.json(job);
});

router.post("/convert", convertUpload, async (req, res) => {
  const uploadedFile = req.files?.image?.[0] || req.files?.file?.[0] || null;
  const rawImagePath =
    uploadedFile?.path || req.body.imagePath || req.body.image;
  const imagePath = resolveImagePath(rawImagePath);
  let asyncMode = false;
  let conversionMethod = "ocr";

  try {
    if (!imagePath) {
      return res.status(400).json({
        error: "No image provided",
        details:
          "Send a file in form-data with key 'image' or provide imagePath in JSON.",
      });
    }

    console.log("Image path:", imagePath);

    if (!fs.existsSync(imagePath)) {
      return res.status(400).json({
        error: "File not found",
        details: `The file path does not exist: ${rawImagePath}`,
      });
    }
    asyncMode = parseBoolean(req.body.async, false);
    conversionMethod = parseConversionMethod(req.body.conversionMethod);
    if (asyncMode) {
      const job = createJob();

      setImmediate(async () => {
        try {
          updateJob(job.jobId, {
            status: "processing",
            stage: "starting",
            progress: 5,
          });
          const converter =
            conversionMethod === "direct"
              ? executeDirectConversion
              : executeConversion;
          const result = await converter(
            { uploadedFile, rawImagePath, imagePath, body: req.body },
            (progress, stage) => {
              updateJob(job.jobId, {
                status: progress >= 100 ? "completed" : "processing",
                progress,
                stage,
              });
            },
          );

          updateJob(job.jobId, {
            status: "completed",
            progress: 100,
            stage: "completed",
            result,
            error: null,
          });
        } catch (backgroundError) {
          updateJob(job.jobId, {
            status: "failed",
            stage: "failed",
            error:
              backgroundError.response?.data?.detail ||
              backgroundError.response?.data?.error ||
              backgroundError.response?.data ||
              backgroundError.message,
          });
        } finally {
          expireJob(job.jobId);
          if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
            try {
              fs.unlinkSync(uploadedFile.path);
            } catch (cleanupError) {
              console.log(
                "Failed to remove temp upload:",
                cleanupError.message,
              );
            }
          }
        }
      });

      return res.status(202).json({
        message: "Conversion started",
        async: true,
        conversionMethod,
        jobId: job.jobId,
        progressUrl: `/api/convert/progress/${job.jobId}`,
      });
    }

    const converter =
      conversionMethod === "direct"
        ? executeDirectConversion
        : executeConversion;
    const result = await converter({
      uploadedFile,
      rawImagePath,
      imagePath,
      body: req.body,
    });

    return res.json(result);
  } catch (error) {
    console.log("ERROR DETAILS:");
    console.log(error.response?.data);
    console.log(error.message);

    const upstreamStatus = error.response?.status;
    const upstreamData = error.response?.data;

    if (upstreamStatus) {
      return res.status(upstreamStatus).json({
        error: "Conversion failed",
        details:
          upstreamData?.detail ||
          upstreamData?.error ||
          upstreamData ||
          error.message,
        upstream: upstreamData || null,
      });
    }

    res
      .status(500)
      .json({ error: "Conversion failed", details: error.message });
  } finally {
    // /convert uses multer temp files; remove them after processing.
    if (!asyncMode && uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
      try {
        fs.unlinkSync(uploadedFile.path);
      } catch (cleanupError) {
        console.log("Failed to remove temp upload:", cleanupError.message);
      }
    }
  }
});

module.exports = router;
