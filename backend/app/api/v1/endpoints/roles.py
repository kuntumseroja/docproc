from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.role import (
    RoleCreate,
    RoleListResponse,
    RoleResponse,
    RoleUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/roles", tags=["roles"])

# ---------------------------------------------------------------------------
# JSON file helpers
# ---------------------------------------------------------------------------

_CANDIDATE_PATHS = [
    Path(__file__).resolve().parents[4] / "templates" / "hr" / "data" / "role-skill-matrix.json",
    Path("/app/templates/hr/data/role-skill-matrix.json"),  # Docker path
    Path("templates/hr/data/role-skill-matrix.json"),
    Path("../templates/hr/data/role-skill-matrix.json"),
]


def _resolve_matrix_path() -> Path:
    """Return the first existing path for role-skill-matrix.json."""
    for p in _CANDIDATE_PATHS:
        if p.exists():
            return p
    raise FileNotFoundError(
        "role-skill-matrix.json not found. Searched: "
        + ", ".join(str(p) for p in _CANDIDATE_PATHS)
    )


def _load_matrix() -> dict:
    """Read role-skill-matrix.json and return its contents as a dict."""
    path = _resolve_matrix_path()
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_matrix(data: dict) -> None:
    """Write *data* back to role-skill-matrix.json with pretty formatting."""
    path = _resolve_matrix_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _role_dict_to_response(role_id: str, role_data: dict) -> dict:
    """Convert a raw role dict (from JSON) into the shape expected by RoleResponse."""
    return {"id": role_id, **role_data}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/", response_model=RoleListResponse)
async def list_roles(
    current_user: User = Depends(get_current_user),
):
    """List all roles (summary fields: id, title, department, min_experience, education)."""
    try:
        matrix = _load_matrix()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    roles_raw: Dict[str, dict] = matrix.get("roles", {})
    roles = [
        _role_dict_to_response(role_id, role_data)
        for role_id, role_data in roles_raw.items()
    ]

    return RoleListResponse(
        roles=[RoleResponse(**r) for r in roles],
        total=len(roles),
    )


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get full details for a single role including skills, certs, and salary band."""
    try:
        matrix = _load_matrix()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    role_data = matrix.get("roles", {}).get(role_id)
    if role_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role '{role_id}' not found",
        )

    return RoleResponse(**_role_dict_to_response(role_id, role_data))


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new role in the skill matrix."""
    try:
        matrix = _load_matrix()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    roles: Dict[str, dict] = matrix.setdefault("roles", {})

    if body.id in roles:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Role '{body.id}' already exists",
        )

    # Store everything except the 'id' key (id is the dict key itself)
    role_data = body.model_dump(exclude={"id"})
    roles[body.id] = role_data

    _save_matrix(matrix)
    logger.info("Role '%s' created by user %s", body.id, current_user.id)

    return RoleResponse(**_role_dict_to_response(body.id, role_data))


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    body: RoleUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update an existing role. Supports partial updates (only supplied fields are changed)."""
    try:
        matrix = _load_matrix()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    roles: Dict[str, dict] = matrix.get("roles", {})

    if role_id not in roles:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role '{role_id}' not found",
        )

    # Merge only the fields that were explicitly provided
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if isinstance(value, dict):
            # For nested models (programming_languages, certifications, salary_band)
            # merge at the top level of that nested dict
            existing = roles[role_id].get(key, {})
            existing.update(value)
            roles[role_id][key] = existing
        else:
            roles[role_id][key] = value

    _save_matrix(matrix)
    logger.info("Role '%s' updated by user %s", role_id, current_user.id)

    return RoleResponse(**_role_dict_to_response(role_id, roles[role_id]))


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a role from the skill matrix."""
    try:
        matrix = _load_matrix()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    roles: Dict[str, dict] = matrix.get("roles", {})

    if role_id not in roles:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role '{role_id}' not found",
        )

    del roles[role_id]
    _save_matrix(matrix)
    logger.info("Role '%s' deleted by user %s", role_id, current_user.id)
