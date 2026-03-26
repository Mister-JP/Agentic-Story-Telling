from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.dependencies import get_harness_service
from backend.schemas import ElementDetailProposeRequest, ElementDetailProposeResponse
from backend.services.harness_service import HarnessService

router = APIRouter(prefix="/harness/element-detail", tags=["element-detail"])


@router.post("/propose", response_model=ElementDetailProposeResponse)
def propose_element_detail(
    request: ElementDetailProposeRequest,
    harness_service: Annotated[HarnessService, Depends(get_harness_service)],
) -> ElementDetailProposeResponse:
    return harness_service.propose_element_detail(request)
