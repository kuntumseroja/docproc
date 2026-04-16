from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class ProgrammingLanguages(BaseModel):
    required: List[str] = []
    preferred: List[str] = []


class Certifications(BaseModel):
    required: List[str] = []
    preferred: List[str] = []


class SalaryBand(BaseModel):
    min: int = 0
    max: int = 0
    currency: str = "IDR"


class RoleCreate(BaseModel):
    id: str  # slug like "software_engineer"
    title: str
    department: str = ""
    min_experience_years: int = 0
    education_minimum: str = "S1/Bachelor"
    preferred_majors: List[str] = []
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    programming_languages: ProgrammingLanguages = ProgrammingLanguages()
    certifications: Certifications = Certifications()
    salary_band: SalaryBand = SalaryBand()


class RoleUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    min_experience_years: Optional[int] = None
    education_minimum: Optional[str] = None
    preferred_majors: Optional[List[str]] = None
    required_skills: Optional[List[str]] = None
    preferred_skills: Optional[List[str]] = None
    programming_languages: Optional[ProgrammingLanguages] = None
    certifications: Optional[Certifications] = None
    salary_band: Optional[SalaryBand] = None


class RoleResponse(RoleCreate):
    pass


class RoleListResponse(BaseModel):
    roles: List[RoleResponse]
    total: int
