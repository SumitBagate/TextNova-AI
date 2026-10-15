import React, { useEffect, useState } from "react";
import "./DocumentEditor.css";

const DocumentEditor = ({ initialContent = "", onSave, showToast }) => {
  const [content, setContent] = useState(initialContent);
  const [isSaved, setIsSaved] = useState(true);
  const [wordCount, setWordCount] = useState(0);
  const [exportFormat, setExportFormat] = useState("txt");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setWordCount(countWords(initialContent));
    setIsSaved(true);
  }, [initialContent]);

  const countWords = (text) =>
    String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

  const updateContent = (value) => {
    setContent(value);
    setWordCount(countWords(value));
    setIsSaved(false);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(content);
    }
    setIsSaved(true);
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (value) =>
    String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const parseBlocks = (value = content) => {
    const lines = String(value || "").split(/\r?\n/);
    const blocks = [];
    let tableBuffer = [];

    const flushTable = () => {
      if (!tableBuffer.length) return;
      const rows = tableBuffer.map((line) =>
        line.split("\t").map((cell) => cell.trim()),
      );
      const width = Math.max(...rows.map((row) => row.length));

      blocks.push({
        type: "table",
        rows: rows.map((row) =>
          Array.from({ length: width }, (_, index) => row[index] || ""),
        ),
      });
      tableBuffer = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trimEnd();
      if (!trimmed) {
        flushTable();
        blocks.push({ type: "blank" });
        return;
      }

      if (trimmed.includes("\t")) {
        tableBuffer.push(trimmed);
        return;
      }

      flushTable();
      blocks.push({ type: "paragraph", text: trimmed });
    });

    flushTable();
    return blocks;
  };

  const exportAsDocx = async () => {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } =
      await import("docx");
    const blocks = parseBlocks();
    const children = [];

    blocks.forEach((block) => {
      if (block.type === "blank") {
        children.push(new Paragraph(""));
        return;
      }

      if (block.type === "table") {
        children.push(
          new Table({
            rows: block.rows.map(
              (row, rowIndex) =>
                new TableRow({
                  children: row.map(
                    (cellText) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [new TextRun(cellText || " ")],
                          }),
                        ],
                        borders: {
                          top: { style: "single", size: 6, color: "64748b" },
                          bottom: { style: "single", size: 6, color: "64748b" },
                          left: { style: "single", size: 6, color: "64748b" },
                          right: { style: "single", size: 6, color: "64748b" },
                        },
                        shading:
                          rowIndex === 0 ? { fill: "E2E8F0" } : undefined,
                      }),
                  ),
                }),
            ),
          }),
        );
        children.push(new Paragraph(""));
        return;
      }

      children.push(
        new Paragraph({ children: [new TextRun(block.text || "")] }),
      );
    });

    const doc = new Document({
      sections: [
        { children: children.length ? children : [new Paragraph("")] },
      ],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, "document.docx");
  };

  const exportAsPptx = async () => {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";

    const lines = String(content || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const chunks = [];
    for (let index = 0; index < Math.max(lines.length, 1); index += 5) {
      chunks.push(lines.slice(index, index + 5));
    }

    if (!chunks.length) {
      chunks.push([" "]);
    }

    chunks.forEach((chunk, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: "F8FAFC" };
      slide.addText(index === 0 ? "TextNova Export" : `Section ${index + 1}`, {
        x: 0.6,
        y: 0.4,
        w: 12.0,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: "0F766E",
      });
      slide.addText(chunk.join("\n") || " ", {
        x: 0.8,
        y: 1.3,
        w: 12.0,
        h: 5.4,
        fontSize: 18,
        color: "111827",
        valign: "top",
        breakLine: true,
      });
    });

    await pptx.writeFile({ fileName: "document.pptx" });
  };

  const buildHtmlDocument = () => {
    const escaped = escapeHtml(content);
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>TextNova Export</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.7; padding: 32px; color: #111827; }
    pre { white-space: pre-wrap; word-break: break-word; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td { border: 1px solid #64748b; padding: 8px 10px; vertical-align: top; }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
</body>
</html>`;
  };

  const handleExport = async () => {
    if (!content.trim()) {
      showToast?.("Nothing to export yet.", "info");
      return;
    }

    setIsExporting(true);
    try {
      if (exportFormat === "txt") {
        downloadBlob(
          new Blob([content], { type: "text/plain;charset=utf-8" }),
          "document.txt",
        );
        return;
      }

      if (exportFormat === "md") {
        downloadBlob(
          new Blob([content], { type: "text/markdown;charset=utf-8" }),
          "document.md",
        );
        return;
      }

      if (exportFormat === "html") {
        downloadBlob(
          new Blob([buildHtmlDocument()], { type: "text/html;charset=utf-8" }),
          "document.html",
        );
        return;
      }

      if (exportFormat === "docx") {
        await exportAsDocx();
        return;
      }

      if (exportFormat === "pptx") {
        await exportAsPptx();
        return;
      }

      downloadBlob(
        new Blob([content], { type: "text/plain;charset=utf-8" }),
        "document.txt",
      );
    } catch (error) {
      console.error("Export failed:", error);
      showToast?.("Export failed. Please try again.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear all content?")) {
      setContent("");
      setWordCount(0);
      setIsSaved(true);
    }
  };

  const blocks = parseBlocks();

  return (
    <div className="document-editor-container">
      <div className="editor-header">
        <div className="header-left">
          <h2>Document Editor</h2>
          <span className={`save-status ${isSaved ? "saved" : "unsaved"}`}>
            {isSaved ? "Saved" : "Unsaved"}
          </span>
        </div>
        <div className="header-stats">
          <span className="stat">Words: {wordCount}</span>
          <span className="stat">Characters: {content.length}</span>
        </div>
      </div>

      <div className="editor-toolbar">
        <div className="toolbar-group">
          <div className="export-select-wrap">
            <label htmlFor="export-format">Export as</label>
            <select
              id="export-format"
              className="export-format-select"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="txt">TXT</option>
              <option value="md">Markdown</option>
              <option value="html">HTML</option>
              <option value="docx">DOCX</option>
              <option value="pptx">PPTX</option>
            </select>
          </div>
          <button className="action-button primary" onClick={handleSave}>
            Save
          </button>
          <button
            className="action-button secondary"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "Exporting..." : "Export"}
          </button>
          <button className="action-button danger" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="editor-workspace">
        <div className="document-page">
          <textarea
            className="editor-canvas"
            value={content}
            onChange={(e) => updateContent(e.target.value)}
            onBlur={handleSave}
            placeholder="Start typing your document here..."
            spellCheck="true"
          />
        </div>
      </div>

      <div className="editor-preview-wrap">
        <div className="preview-heading">Rendered table preview</div>
        <div className="preview-body">
          {blocks.map((block, index) => {
            if (block.type === "blank") {
              return <div key={index} className="preview-blank" />;
            }

            if (block.type === "table") {
              return (
                <table key={index} className="preview-table">
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className={rowIndex === 0 ? "table-header" : ""}
                      >
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell || " "}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            }

            return (
              <p key={index} className="preview-paragraph">
                {block.text}
              </p>
            );
          })}
        </div>
      </div>

      <div className="editor-footer">
        <p className="editor-hint">
          Tip: Use tab-separated lines to build table rows in the preview and
          DOCX export.
        </p>
      </div>
    </div>
  );
};

export default DocumentEditor;
