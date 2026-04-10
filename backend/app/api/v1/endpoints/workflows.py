from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.workflow import Workflow, WorkflowStatus
from app.models.document import Document
from app.schemas.workflow import (
    WorkflowCreateRequest, WorkflowUpdateRequest, WorkflowResponse,
    WorkflowListResponse, NLSchemaRequest, NLSchemaResponse,
)
from app.services.nl_schema_parser import NLSchemaParser

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _workflow_to_response(workflow: Workflow, document_count: int = 0) -> WorkflowResponse:
    return WorkflowResponse(
        id=str(workflow.id),
        name=workflow.name,
        description=workflow.description,
        status=workflow.status.value if isinstance(workflow.status, WorkflowStatus) else workflow.status,
        document_type=workflow.document_type,
        extraction_schema=workflow.extraction_schema,
        validation_rules=workflow.validation_rules,
        action_config=workflow.action_config,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        document_count=document_count,
    )


@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: WorkflowCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    workflow = Workflow(
        name=request.name,
        description=request.description,
        document_type=request.document_type,
        extraction_schema=request.extraction_schema,
        validation_rules=request.validation_rules,
        action_config=request.action_config,
        status=WorkflowStatus.DRAFT,
        created_by=current_user.id,
    )
    db.add(workflow)
    await db.commit()
    await db.refresh(workflow)
    return _workflow_to_response(workflow)


@router.get("/", response_model=WorkflowListResponse)
async def list_workflows(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowListResponse:
    query = select(Workflow).where(Workflow.created_by == current_user.id)
    if status_filter:
        try:
            ws = WorkflowStatus(status_filter)
            query = query.where(Workflow.status == ws)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}",
            )

    result = await db.execute(query.order_by(Workflow.created_at.desc()))
    workflows = result.scalars().all()

    # Get document counts
    responses = []
    for wf in workflows:
        count_result = await db.execute(
            select(func.count(Document.id)).where(Document.workflow_id == wf.id)
        )
        doc_count = count_result.scalar() or 0
        responses.append(_workflow_to_response(wf, doc_count))

    return WorkflowListResponse(workflows=responses, total=len(responses))


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    count_result = await db.execute(
        select(func.count(Document.id)).where(Document.workflow_id == workflow.id)
    )
    doc_count = count_result.scalar() or 0
    return _workflow_to_response(workflow, doc_count)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    request: WorkflowUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if workflow.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this workflow")

    update_data = request.dict(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        try:
            update_data["status"] = WorkflowStatus(update_data["status"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {update_data['status']}",
            )

    for key, value in update_data.items():
        setattr(workflow, key, value)

    await db.commit()
    await db.refresh(workflow)

    count_result = await db.execute(
        select(func.count(Document.id)).where(Document.workflow_id == workflow.id)
    )
    doc_count = count_result.scalar() or 0
    return _workflow_to_response(workflow, doc_count)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if workflow.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this workflow")

    await db.delete(workflow)
    await db.commit()


@router.post("/{workflow_id}/activate", response_model=WorkflowResponse)
async def activate_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if workflow.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    workflow.status = WorkflowStatus.ACTIVE
    await db.commit()
    await db.refresh(workflow)

    count_result = await db.execute(
        select(func.count(Document.id)).where(Document.workflow_id == workflow.id)
    )
    doc_count = count_result.scalar() or 0
    return _workflow_to_response(workflow, doc_count)


@router.post("/{workflow_id}/pause", response_model=WorkflowResponse)
async def pause_workflow(
    workflow_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WorkflowResponse:
    result = await db.execute(select(Workflow).where(Workflow.id == workflow_id))
    workflow = result.scalar_one_or_none()
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    if workflow.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    workflow.status = WorkflowStatus.PAUSED
    await db.commit()
    await db.refresh(workflow)

    count_result = await db.execute(
        select(func.count(Document.id)).where(Document.workflow_id == workflow.id)
    )
    doc_count = count_result.scalar() or 0
    return _workflow_to_response(workflow, doc_count)


@router.post("/parse-schema", response_model=NLSchemaResponse)
async def parse_schema(
    request: NLSchemaRequest,
    current_user: User = Depends(get_current_user),
) -> NLSchemaResponse:
    try:
        parser = NLSchemaParser()
        result = await parser.parse(
            description=request.description,
            document_type=request.document_type,
            sample_text=request.sample_text,
        )
        return NLSchemaResponse(
            fields=result.get("fields", []),
            validation_rules=result.get("validation_rules", []),
            confidence=result.get("confidence", 0.0),
            raw_response=result.get("raw_response"),
            model_used=result.get("model_used"),
            provider=result.get("provider"),
            latency_ms=result.get("latency_ms"),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Schema parsing failed: {str(e)}",
        )
