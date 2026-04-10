from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class ConfidenceFactor:
    name: str
    score: float  # 0.0 to 1.0
    weight: float  # relative weight
    details: str = ""


@dataclass
class FieldConfidence:
    field_name: str
    overall_score: float
    level: ConfidenceLevel
    factors: List[ConfidenceFactor]
    adjusted_score: Optional[float] = None  # after judge adjustment


@dataclass
class ConfidenceReport:
    field_scores: List[FieldConfidence]
    document_score: float
    document_level: ConfidenceLevel


class ConfidenceScorer:
    """Multi-factor confidence scoring for extraction results."""

    DEFAULT_WEIGHTS = {
        "ocr_quality": 0.25,
        "extraction_confidence": 0.30,
        "validation_pass": 0.20,
        "field_completeness": 0.15,
        "judge_adjustment": 0.10,
    }

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or self.DEFAULT_WEIGHTS

    def score_document(
        self,
        fields: Dict[str, Any],
        extraction_confidences: Dict[str, str],
        ocr_confidence: float = 0.9,
        validation_results: Optional[Dict[str, bool]] = None,
        judge_adjustments: Optional[Dict[str, float]] = None,
        expected_fields: Optional[List[str]] = None,
    ) -> ConfidenceReport:
        field_scores = []

        for field_name, value in fields.items():
            factors = self._compute_factors(
                field_name=field_name,
                value=value,
                extraction_conf=extraction_confidences.get(field_name, "medium"),
                ocr_confidence=ocr_confidence,
                validation_passed=validation_results.get(field_name, True) if validation_results else True,
                judge_adj=judge_adjustments.get(field_name, 0.0) if judge_adjustments else 0.0,
                expected_fields=expected_fields,
            )

            overall = self._weighted_score(factors)
            level = self._score_to_level(overall)

            field_scores.append(FieldConfidence(
                field_name=field_name,
                overall_score=round(overall, 3),
                level=level,
                factors=factors,
            ))

        doc_score = sum(fs.overall_score for fs in field_scores) / max(len(field_scores), 1)
        doc_level = self._score_to_level(doc_score)

        # Penalize if expected fields are missing
        if expected_fields:
            present = set(fields.keys())
            missing_count = len(set(expected_fields) - present)
            if missing_count > 0:
                penalty = missing_count / len(expected_fields) * 0.3
                doc_score = max(0.0, doc_score - penalty)
                doc_level = self._score_to_level(doc_score)

        logger.info(f"Document confidence: {doc_score:.3f} ({doc_level.value})")
        return ConfidenceReport(
            field_scores=field_scores,
            document_score=round(doc_score, 3),
            document_level=doc_level,
        )

    def _compute_factors(
        self,
        field_name: str,
        value: Any,
        extraction_conf: str,
        ocr_confidence: float,
        validation_passed: bool,
        judge_adj: float,
        expected_fields: Optional[List[str]],
    ) -> List[ConfidenceFactor]:
        factors = []

        # OCR quality factor
        factors.append(ConfidenceFactor(
            name="ocr_quality",
            score=min(1.0, max(0.0, ocr_confidence)),
            weight=self.weights.get("ocr_quality", 0.25),
            details=f"OCR confidence: {ocr_confidence:.2f}",
        ))

        # Extraction confidence factor
        conf_map = {"high": 0.95, "medium": 0.7, "low": 0.4}
        ext_score = conf_map.get(extraction_conf, 0.5)
        factors.append(ConfidenceFactor(
            name="extraction_confidence",
            score=ext_score,
            weight=self.weights.get("extraction_confidence", 0.30),
            details=f"Extraction: {extraction_conf}",
        ))

        # Validation factor
        factors.append(ConfidenceFactor(
            name="validation_pass",
            score=1.0 if validation_passed else 0.3,
            weight=self.weights.get("validation_pass", 0.20),
            details=f"Validation: {'passed' if validation_passed else 'failed'}",
        ))

        # Field completeness
        completeness = 1.0 if value is not None and str(value).strip() else 0.0
        factors.append(ConfidenceFactor(
            name="field_completeness",
            score=completeness,
            weight=self.weights.get("field_completeness", 0.15),
            details=f"Value present: {completeness > 0}",
        ))

        # Judge adjustment
        adj_score = min(1.0, max(0.0, 0.7 + judge_adj))
        factors.append(ConfidenceFactor(
            name="judge_adjustment",
            score=adj_score,
            weight=self.weights.get("judge_adjustment", 0.10),
            details=f"Judge adjustment: {judge_adj:+.2f}",
        ))

        return factors

    def _weighted_score(self, factors: List[ConfidenceFactor]) -> float:
        total_weight = sum(f.weight for f in factors)
        if total_weight == 0:
            return 0.5
        return sum(f.score * f.weight for f in factors) / total_weight

    @staticmethod
    def _score_to_level(score: float) -> ConfidenceLevel:
        if score >= 0.8:
            return ConfidenceLevel.HIGH
        elif score >= 0.5:
            return ConfidenceLevel.MEDIUM
        return ConfidenceLevel.LOW
