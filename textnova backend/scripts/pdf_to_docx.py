import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: pdf_to_docx.py <input.pdf> <output.docx>", file=sys.stderr)
        return 2

    input_pdf = Path(sys.argv[1]).resolve()
    output_docx = Path(sys.argv[2]).resolve()

    if not input_pdf.exists():
        print(f"Input file not found: {input_pdf}", file=sys.stderr)
        return 3

    try:
        from pdf2docx import Converter
    except Exception as exc:
        print(
            "Missing dependency: pdf2docx. Install with: pip install pdf2docx",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 4

    output_docx.parent.mkdir(parents=True, exist_ok=True)

    converter = Converter(str(input_pdf))
    try:
        converter.convert(str(output_docx), start=0, end=None)
    finally:
        converter.close()

    print(str(output_docx))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
