# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 PDFluent Contributors

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

try:
    from paddleocr import PPStructure, PaddleOCR
except Exception as import_error:
    print(
        f"PaddleOCR import failed: {import_error}. Install dependencies with: "
        "python3 -m pip install -r src-tauri/scripts/requirements-ocr.txt",
        file=sys.stderr,
    )
    sys.exit(1)

try:
    import cv2
except Exception:
    cv2 = None

try:
    import numpy as np
except Exception:
    np = None


PreprocessStep = str
DEFAULT_PREPROCESS_STEPS: list[PreprocessStep] = ["deskew", "denoise", "contrast"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run PaddleOCR + PP-Structure on one image.")
    parser.add_argument("--input-image", required=True, help="Path to PNG/JPEG input image.")
    parser.add_argument("--language", default="en", help="Preferred OCR language code.")
    parser.add_argument(
        "--include-structure",
        default="1",
        choices=["0", "1"],
        help="Set to 1 to run PP-Structure block analysis.",
    )
    parser.add_argument(
        "--preprocess-mode",
        default="auto",
        choices=["off", "auto", "manual"],
        help="Image preprocessing mode before OCR.",
    )
    parser.add_argument(
        "--preprocess-steps",
        default="",
        help="Comma-separated preprocessing steps (deskew,denoise,contrast).",
    )
    parser.add_argument(
        "--auto-confidence-threshold",
        type=float,
        default=0.72,
        help="When mode=auto and confidence is below this threshold, retry with preprocessing.",
    )
    return parser.parse_args()


def normalize_language_candidates(raw: str) -> list[str]:
    normalized = raw.strip().lower()
    if not normalized:
        normalized = "en"

    aliases: dict[str, list[str]] = {
        "eng": ["en"],
        "english": ["en"],
        "en": ["en"],
        "nld": ["nl", "latin"],
        "dutch": ["nl", "latin"],
        "nl": ["nl", "latin"],
        "deu": ["de", "german"],
        "german": ["de", "german"],
        "de": ["de", "german"],
        "fra": ["fr", "french"],
        "french": ["fr", "french"],
        "fr": ["fr", "french"],
        "ita": ["it", "latin"],
        "italian": ["it", "latin"],
        "it": ["it", "latin"],
        "spa": ["es", "latin"],
        "spanish": ["es", "latin"],
        "es": ["es", "latin"],
        "por": ["pt", "latin"],
        "portuguese": ["pt", "latin"],
        "pt": ["pt", "latin"],
    }

    candidates = aliases.get(normalized, [normalized])
    if normalized not in candidates:
        candidates.insert(0, normalized)
    if "en" not in candidates:
        candidates.append("en")

    seen: set[str] = set()
    unique_candidates: list[str] = []
    for value in candidates:
        if value in seen:
            continue
        seen.add(value)
        unique_candidates.append(value)
    return unique_candidates


def create_engine(engine_name: str, language_candidates: list[str]) -> tuple[Any, str]:
    failures: list[str] = []
    for language in language_candidates:
        try:
            if engine_name == "ocr":
                engine = PaddleOCR(show_log=False, use_angle_cls=True, lang=language)
            elif engine_name == "structure":
                engine = PPStructure(show_log=False, lang=language)
            else:
                raise ValueError(f"Unsupported engine_name: {engine_name}")
            return engine, language
        except Exception as error:
            failures.append(f"{language}: {error}")

    raise RuntimeError(
        f"Unable to initialize PaddleOCR {engine_name} engine for languages "
        f"{language_candidates}: {' | '.join(failures)}"
    )


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def normalize_bbox(raw_box: Any) -> tuple[float, float, float, float]:
    if isinstance(raw_box, list) and len(raw_box) == 4 and isinstance(raw_box[0], (int, float)):
        x0, y0, x1, y1 = raw_box
        return to_float(x0), to_float(y0), to_float(x1), to_float(y1)

    points: list[tuple[float, float]] = []
    if isinstance(raw_box, list):
        for point in raw_box:
            if isinstance(point, (list, tuple)) and len(point) >= 2:
                points.append((to_float(point[0]), to_float(point[1])))

    if not points:
        return 0.0, 0.0, 0.0, 0.0

    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def extract_structure_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return value["text"].strip()
        if "res" in value:
            return extract_structure_text(value["res"])
        return ""
    if isinstance(value, list):
        parts = [extract_structure_text(item) for item in value]
        filtered = [part for part in parts if part]
        return " ".join(filtered).strip()
    return ""


def extract_structure_confidence(value: Any) -> float:
    if isinstance(value, dict):
        if "score" in value:
            return to_float(value["score"])
        if "confidence" in value:
            return to_float(value["confidence"])
        if "res" in value:
            return extract_structure_confidence(value["res"])
    if isinstance(value, list):
        confidence_values = [extract_structure_confidence(item) for item in value]
        filtered = [score for score in confidence_values if score > 0.0]
        if not filtered:
            return 0.0
        return sum(filtered) / len(filtered)
    return 0.0


def parse_words(raw_result: Any) -> tuple[list[dict[str, Any]], str]:
    words: list[dict[str, Any]] = []
    text_fragments: list[str] = []

    if not isinstance(raw_result, list) or len(raw_result) == 0:
        return words, ""

    line_candidates = raw_result[0] if isinstance(raw_result[0], list) else raw_result
    if not isinstance(line_candidates, list):
        return words, ""

    for line in line_candidates:
        if not isinstance(line, (list, tuple)) or len(line) < 2:
            continue

        bbox = normalize_bbox(line[0])
        recognition = line[1]
        text_value = ""
        confidence = 0.0

        if isinstance(recognition, (list, tuple)):
            if len(recognition) > 0:
                text_value = str(recognition[0] or "").strip()
            if len(recognition) > 1:
                confidence = to_float(recognition[1])
        elif isinstance(recognition, str):
            text_value = recognition.strip()

        if not text_value:
            continue

        words.append(
            {
                "text": text_value,
                "confidence": confidence,
                "x0": bbox[0],
                "y0": bbox[1],
                "x1": bbox[2],
                "y1": bbox[3],
            }
        )
        text_fragments.append(text_value)

    return words, "\n".join(text_fragments)


def parse_structure_blocks(raw_structure: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_structure, list):
        return []

    blocks: list[dict[str, Any]] = []
    for block in raw_structure:
        if not isinstance(block, dict):
            continue

        kind = str(block.get("type", "unknown")).strip() or "unknown"
        text = extract_structure_text(block.get("res"))
        bbox = normalize_bbox(block.get("bbox"))
        confidence = extract_structure_confidence(block.get("res"))

        blocks.append(
            {
                "kind": kind,
                "text": text,
                "confidence": confidence,
                "x0": bbox[0],
                "y0": bbox[1],
                "x1": bbox[2],
                "y1": bbox[3],
            }
        )

    blocks.sort(key=lambda block: (block["y0"], block["x0"]))
    return blocks


def parse_preprocess_steps(raw: str) -> list[PreprocessStep]:
    if not raw.strip():
        return []
    allowed = {"deskew", "denoise", "contrast"}
    values = [value.strip().lower() for value in raw.split(",")]
    result: list[PreprocessStep] = []
    for value in values:
        if not value or value not in allowed:
            continue
        if value not in result:
            result.append(value)
    return result


def estimate_skew_degrees(gray_image: Any) -> float:
    if cv2 is None or np is None:
        return 0.0

    inverted = cv2.bitwise_not(gray_image)
    thresholded = cv2.threshold(inverted, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    points = np.column_stack(np.where(thresholded > 0))
    if points.size == 0:
        return 0.0
    angle = cv2.minAreaRect(points)[-1]
    if angle < -45.0:
        angle = 90.0 + angle
    return float(angle)


def compute_quality_metrics(image_path: Path) -> dict[str, float]:
    default_metrics = {
        "contrast_stddev": 0.0,
        "sharpness_laplacian_var": 0.0,
        "skew_degrees": 0.0,
    }

    if cv2 is None:
        return default_metrics

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        return default_metrics

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    contrast_stddev = float(gray.std())
    sharpness_laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    skew_degrees = estimate_skew_degrees(gray)
    return {
        "contrast_stddev": contrast_stddev,
        "sharpness_laplacian_var": sharpness_laplacian_var,
        "skew_degrees": skew_degrees,
    }


def apply_preprocessing_steps(image_path: Path, steps: list[PreprocessStep]) -> tuple[Path, list[PreprocessStep], str]:
    if cv2 is None or np is None:
        return image_path, [], "opencv_unavailable"

    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        return image_path, [], "image_decode_failed"

    applied_steps: list[PreprocessStep] = []
    working = image.copy()

    for step in steps:
        if step == "deskew":
            gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
            angle = estimate_skew_degrees(gray)
            if abs(angle) >= 0.2:
                height, width = working.shape[:2]
                center = (width // 2, height // 2)
                matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
                working = cv2.warpAffine(
                    working,
                    matrix,
                    (width, height),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REPLICATE,
                )
            applied_steps.append("deskew")
        elif step == "denoise":
            gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
            denoised = cv2.fastNlMeansDenoising(gray, None, 12, 7, 21)
            working = cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR)
            applied_steps.append("denoise")
        elif step == "contrast":
            lab = cv2.cvtColor(working, cv2.COLOR_BGR2LAB)
            l_channel, a_channel, b_channel = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l_equalized = clahe.apply(l_channel)
            merged = cv2.merge((l_equalized, a_channel, b_channel))
            working = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
            applied_steps.append("contrast")

    if not applied_steps:
        return image_path, [], "no_steps_applied"

    temp_dir = Path(tempfile.gettempdir())
    temp_output = temp_dir / f"pdfluent-ocr-preprocessed-{os.getpid()}-{uuid4().hex}.png"
    wrote = cv2.imwrite(str(temp_output), working)
    if not wrote:
        return image_path, [], "preprocessed_image_write_failed"

    return temp_output, applied_steps, "preprocessed"


def compute_average_confidence(words: list[dict[str, Any]]) -> float:
    if not words:
        return 0.0
    return float(sum(float(word.get("confidence", 0.0)) for word in words) / len(words))


def should_preprocess_automatically(metrics: dict[str, float]) -> tuple[bool, str]:
    low_contrast = metrics["contrast_stddev"] < 38.0
    blurry = metrics["sharpness_laplacian_var"] < 120.0
    skewed = abs(metrics["skew_degrees"]) > 1.2
    if low_contrast or blurry or skewed:
        reasons: list[str] = []
        if low_contrast:
            reasons.append("low_contrast")
        if blurry:
            reasons.append("low_sharpness")
        if skewed:
            reasons.append("skew_detected")
        return True, ",".join(reasons)
    return False, "quality_ok"


def run_ocr_pass(
    image_path: Path,
    ocr_engine: Any,
    structure_engine: Any | None,
) -> tuple[list[dict[str, Any]], str, list[dict[str, Any]]]:
    ocr_result = ocr_engine.ocr(str(image_path), cls=True)
    words, text = parse_words(ocr_result)
    structure_blocks: list[dict[str, Any]] = []
    if structure_engine is not None:
        structure_result = structure_engine(str(image_path))
        structure_blocks = parse_structure_blocks(structure_result)
    return words, text, structure_blocks


def main() -> int:
    args = parse_args()
    input_image = Path(args.input_image).expanduser()
    if not input_image.exists():
        print(f"Input image does not exist: {input_image}", file=sys.stderr)
        return 1

    language_candidates = normalize_language_candidates(args.language)
    include_structure = args.include_structure == "1"
    preprocess_mode = args.preprocess_mode
    preprocess_steps = parse_preprocess_steps(args.preprocess_steps)
    auto_confidence_threshold = max(0.05, min(0.99, float(args.auto_confidence_threshold)))

    ocr_engine, active_language = create_engine("ocr", language_candidates)
    structure_engine = None
    if include_structure:
        structure_engine, structure_language = create_engine("structure", language_candidates)
        active_language = structure_language

    quality_metrics = compute_quality_metrics(input_image)
    preprocessing_applied = False
    preprocessing_reason = "disabled"
    applied_preprocessing_steps: list[PreprocessStep] = []
    selected_image_path = input_image
    generated_temp_paths: list[Path] = []

    if preprocess_mode == "manual":
        requested_steps = preprocess_steps if preprocess_steps else DEFAULT_PREPROCESS_STEPS
        processed_path, applied_steps, reason = apply_preprocessing_steps(input_image, requested_steps)
        preprocessing_reason = reason if reason else "manual"
        if processed_path != input_image:
            generated_temp_paths.append(processed_path)
        if applied_steps:
            selected_image_path = processed_path
            applied_preprocessing_steps = applied_steps
            preprocessing_applied = True
    elif preprocess_mode == "auto":
        should_apply, auto_reason = should_preprocess_automatically(quality_metrics)
        preprocessing_reason = auto_reason
        if should_apply:
            processed_path, applied_steps, reason = apply_preprocessing_steps(
                input_image,
                DEFAULT_PREPROCESS_STEPS,
            )
            preprocessing_reason = reason if reason else auto_reason
            if processed_path != input_image:
                generated_temp_paths.append(processed_path)
            if applied_steps:
                selected_image_path = processed_path
                applied_preprocessing_steps = applied_steps
                preprocessing_applied = True

    words, text, structure_blocks = run_ocr_pass(selected_image_path, ocr_engine, structure_engine)
    average_confidence = compute_average_confidence(words)

    if (
        preprocess_mode == "auto"
        and not preprocessing_applied
        and average_confidence < auto_confidence_threshold
    ):
        retry_path, retry_steps, retry_reason = apply_preprocessing_steps(
            input_image,
            DEFAULT_PREPROCESS_STEPS,
        )
        if retry_path != input_image:
            generated_temp_paths.append(retry_path)
        if retry_steps:
            retry_words, retry_text, retry_structure_blocks = run_ocr_pass(
                retry_path,
                ocr_engine,
                structure_engine,
            )
            retry_average_confidence = compute_average_confidence(retry_words)
            if (
                retry_average_confidence > average_confidence + 0.02
                or len(retry_words) > len(words) + 3
            ):
                words = retry_words
                text = retry_text
                structure_blocks = retry_structure_blocks
                average_confidence = retry_average_confidence
                preprocessing_applied = True
                applied_preprocessing_steps = retry_steps
                preprocessing_reason = f"low_confidence_retry:{retry_reason}"

    for temp_path in generated_temp_paths:
        if temp_path == input_image:
            continue
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass

    payload = {
        "engine": "paddleocr_ppocrv5_ppstructure" if include_structure else "paddleocr_ppocrv5",
        "language": active_language,
        "text": text,
        "words": words,
        "structure_blocks": structure_blocks,
        "average_confidence": average_confidence,
        "preprocessing_applied": preprocessing_applied,
        "preprocessing_mode": preprocess_mode,
        "preprocessing_steps": applied_preprocessing_steps,
        "preprocessing_reason": preprocessing_reason,
        "quality_metrics": quality_metrics,
    }

    json.dump(payload, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
