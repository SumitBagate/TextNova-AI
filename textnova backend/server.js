require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/documents", express.static(path.join(__dirname, "documents")));

/* Storage setup */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const convertRoutes = require("./routes/convert");
const aiRoutes = require("./routes/ai");
app.use("/api", convertRoutes);
app.use("/api/ai", aiRoutes);

const upload = multer({ storage });

/* Test route */
app.get("/", (req, res) => {
  res.send("TextNova AI Backend Running");
});

/* Upload API */
app.post("/uploads", upload.single("image"), (req, res) => {
  res.json({
    message: "Image uploaded successfully",
    file: req.file,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
