from fastapi import APIRouter

from app.api.v1.endpoints import auth, documents, settings, workflows, chat, export, compliance, roles

router = APIRouter()


@router.get("/health")
async def api_health():
    return {"status": "ok", "version": "v1"}


router.include_router(auth.router)
router.include_router(documents.router)
router.include_router(settings.router)
router.include_router(workflows.router)
router.include_router(chat.router)
router.include_router(export.router)
router.include_router(compliance.router)
router.include_router(roles.router)
