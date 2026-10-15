from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import easyocr
import shutil
from pathlib import Path
import importlib
import tempfile
import os
import shutil as shell_shutil
import cv2
import numpy as np

PDF_SUPPORT = importlib.util.find_spec("pdf2image") is not None

app = FastAPI()

LANGUAGE_ALIASES = {
    "english": "en",
    "hindi": "hi",
    "marathi": "mr",
}

reader_cache = {}


def flatten_ocr_result(result) -> str:
    parts = []
    for item in result:
        if isinstance(item, (list, tuple)) and len(item) > 1:
            parts.append(str(item[1]))
        elif isinstance(item, str):
            parts.append(item)
    return " ".join(parts).strip()


def layout_text_from_detailed_result(result) -> str:
    rows = []
    for item in result:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue

        bbox = item[0]
        text = str(item[1]).strip()
        if not text or not isinstance(bbox, (list, tuple)):
            continue

        try:
            xs = [float(point[0]) for point in bbox]
            ys = [float(point[1]) for point in bbox]
        except (TypeError, ValueError, IndexError):
            continue

        x_min = min(xs)
        x_max = max(xs)
        y_mid = (min(ys) + max(ys)) / 2.0
        width = max(1.0, x_max - x_min)
        rows.append({"text": text, "x_min": x_min, "x_max": x_max, "y_mid": y_mid, "width": width})

    if not rows:
        return ""

    rows.sort(key=lambda value: (value["y_mid"], value["x_min"]))
    y_tolerance = 14.0
    grouped_lines = []

    for row in rows:
        placed = False
        for line in grouped_lines:
            if abs(row["y_mid"] - line["y_mid"]) <= y_tolerance:
                line["items"].append(row)
                line["y_mid"] = (line["y_mid"] + row["y_mid"]) / 2.0
                placed = True
                break

        if not placed:
            grouped_lines.append({"y_mid": row["y_mid"], "items": [row]})

    merged_lines = []
    for line in grouped_lines:
        items = sorted(line["items"], key=lambda value: value["x_min"])
        avg_width = sum(item["width"] for item in items) / max(1, len(items))
        gap_threshold = max(20.0, avg_width * 0.7)

        line_text = ""
        previous_right = None
        for item in items:
            if previous_right is None:
                line_text = item["text"]
            else:
                gap = item["x_min"] - previous_right
                if gap > gap_threshold:
                    line_text += "\t" + item["text"]
                else:
                    line_text += " " + item["text"]
            previous_right = item["x_max"]

        merged_lines.append(line_text.strip())

    return "\n".join(line for line in merged_lines if line)


def preprocess_for_table_ocr(image: np.ndarray) -> np.ndarray:
    if image is None or image.size == 0:
        return image

    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Upscale small screenshots to help OCR on thin fonts.
    height, width = gray.shape[:2]
    if width < 1400:
        scale = 1400.0 / max(1, width)
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # Normalize contrast and reduce compression noise.
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.bilateralFilter(enhanced, 5, 45, 45)

    # Dark-theme screenshots need inversion before thresholding.
    if float(np.mean(denoised)) < 120:
        denoised = cv2.bitwise_not(denoised)

    binary = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )

    return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)


def score_layout_text(text: str) -> float:
    if not text:
        return 0.0

    lines = [line for line in text.split("\n") if line.strip()]
    token_count = sum(len(line.split()) for line in lines)
    table_cues = text.count("\t") * 2 + max(0, len(lines) - 1)
    return float(token_count + table_cues)


def read_layout_text(reader, image_input, allow_rotation: bool) -> str:
    read_options = {
        "detail": 1,
        "paragraph": False,
        "decoder": "greedy",
        "contrast_ths": 0.05,
        "adjust_contrast": 0.7,
        "low_text": 0.25,
        "link_threshold": 0.3,
    }
    if allow_rotation:
        read_options["rotation_info"] = [90, 180, 270]

    result = reader.readtext(image_input, **read_options)
    return layout_text_from_detailed_result(result)


def best_layout_text(reader, base_image: np.ndarray, allow_rotation: bool) -> str:
    candidates = []

    original_text = read_layout_text(reader, base_image, allow_rotation=allow_rotation)
    candidates.append(original_text)

    processed_image = preprocess_for_table_ocr(base_image)
    if processed_image is not None:
        processed_text = read_layout_text(reader, processed_image, allow_rotation=allow_rotation)
        candidates.append(processed_text)

    return max(candidates, key=score_layout_text) if candidates else ""


def parse_bool(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def normalize_langs(raw_langs: str) -> list[str]:
    values = [part.strip().lower() for part in (raw_langs or "").split(",") if part.strip()]
    normalized = [LANGUAGE_ALIASES.get(value, value) for value in values]
    valid = [value for value in normalized if value in {"en", "hi", "mr"}]
    # Default to English for faster startup and OCR unless explicitly overridden.
    return valid or ["en"]


def get_reader(lang_list: list[str]):
    cache_key = tuple(lang_list)
    if cache_key not in reader_cache:
        reader_cache[cache_key] = easyocr.Reader(lang_list, gpu=False)
    return reader_cache[cache_key]


def resolve_poppler_bin() -> str | None:
    env_path = os.getenv("POPPLER_PATH")
    if env_path and Path(env_path, "pdftoppm.exe").exists():
        return env_path

    command_path = shell_shutil.which("pdftoppm")
    if command_path:
        return str(Path(command_path).parent)

    candidate_dirs = [
        Path("C:/poppler/Library/bin"),
        Path("C:/Program Files/poppler/Library/bin"),
        Path("C:/Program Files (x86)/poppler/Library/bin"),
    ]

    for candidate in candidate_dirs:
        if (candidate / "pdftoppm.exe").exists():
            return str(candidate)

    return None


def is_pdf_file(file_path: str, extension: str) -> bool:
    if extension == ".pdf":
        return True

    try:
        with open(file_path, "rb") as source:
            return source.read(5) == b"%PDF-"
    except OSError:
        return False

@app.get("/")
def health_check():
    return {
        "status": "ok",
        "pdf_support": PDF_SUPPORT,
        "poppler_path": resolve_poppler_bin(),
    }

@app.post("/ocr")
async def extract_text(
    file: UploadFile = File(...),
    langs: str = Form("en"),
    fast: str = Form("true"),
    preserve_layout: str = Form("false"),
):
    file_location = None
    extracted_pages = []
    lang_list = normalize_langs(langs)
    reader = get_reader(lang_list)
    fast_mode = parse_bool(fast, default=True)
    preserve_layout_mode = parse_bool(preserve_layout, default=False)
    
    try:
        file_ext = Path(file.filename or "upload.bin").suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext or ".bin") as temp_file:
            file_location = temp_file.name
        
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_ext = Path(file_location).suffix.lower()
        is_pdf = is_pdf_file(file_location, file_ext)

        if is_pdf:
            if not PDF_SUPPORT:
                raise HTTPException(
                    status_code=400,
                    detail="PDF support not available. Install pdf2image and poppler."
                )
            
            try:
                convert_from_path = importlib.import_module("pdf2image").convert_from_path
                poppler_bin = resolve_poppler_bin()
                if not poppler_bin:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "PDF conversion requires Poppler. Set POPPLER_PATH to your Poppler bin "
                            "folder (contains pdftoppm.exe), e.g. C:/poppler/Library/bin."
                        ),
                    )

                dpi = 150 if fast_mode else 220
                pages = convert_from_path(file_location, poppler_path=poppler_bin, dpi=dpi)
                
                for idx, page_image in enumerate(pages):
                    page_array = np.array(page_image)
                    page_array = cv2.cvtColor(page_array, cv2.COLOR_RGB2BGR)
                    page_image.close()
                    
                    if fast_mode and not preserve_layout_mode:
                        result = reader.readtext(
                            page_array,
                            detail=0,
                            paragraph=False,
                            decoder="greedy",
                        )
                        text = flatten_ocr_result(result)
                    else:
                        if preserve_layout_mode:
                            text = best_layout_text(reader, page_array, allow_rotation=not fast_mode)
                        else:
                            read_options = {
                                "detail": 1,
                                "paragraph": False,
                                "decoder": "greedy",
                                "rotation_info": [90, 180, 270],
                            }
                            result = reader.readtext(page_array, **read_options)
                            text = flatten_ocr_result(result)

                    extracted_pages.append({
                        "page": idx + 1,
                        "text": text.strip()
                    })
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"PDF conversion failed: {str(e)}"
                )
            
            combined_text = "\n---\n".join([
                f"Page {p['page']}:\n{p['text']}" 
                for p in extracted_pages
            ])
            
            return {
                "extracted_text": combined_text,
                "pages": extracted_pages,
                "file_type": "pdf",
                "langs_used": lang_list,
                "fast_mode": fast_mode,
                "preserve_layout": preserve_layout_mode,
            }
        else:
            image_array = cv2.imread(file_location)
            if fast_mode and not preserve_layout_mode:
                result = reader.readtext(file_location, detail=0)
                text = flatten_ocr_result(result)
            else:
                if preserve_layout_mode:
                    if image_array is not None:
                        text = best_layout_text(reader, image_array, allow_rotation=not fast_mode)
                    else:
                        text = read_layout_text(reader, file_location, allow_rotation=not fast_mode)
                else:
                    read_options = {
                        "detail": 1,
                        "paragraph": False,
                        "decoder": "greedy",
                        "rotation_info": [90, 180, 270],
                    }
                    result = reader.readtext(file_location, **read_options)
                    text = flatten_ocr_result(result)
            
            return {
                "extracted_text": text,
                "file_type": "image",
                "langs_used": lang_list,
                "fast_mode": fast_mode,
                "preserve_layout": preserve_layout_mode,
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"OCR failed: {str(e)}"
        )
    finally:
        await file.close()
        if file_location and Path(file_location).exists():
            try:
                Path(file_location).unlink()
            except PermissionError:
                # On Windows, another process can briefly keep a handle open.
                pass