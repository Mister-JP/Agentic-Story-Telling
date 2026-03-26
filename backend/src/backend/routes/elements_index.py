from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.dependencies import get_harness_service
from backend.schemas import (
    ElementsIndexApplyRequest,
    ElementsIndexApplyResponse,
    ElementsIndexProposeRequest,
    ElementsIndexProposeResponse,
)
from backend.services.harness_service import HarnessService

router = APIRouter(prefix="/harness/elements-index", tags=["elements-index"])


@router.post("/propose", response_model=ElementsIndexProposeResponse)
def propose_elements_index(
    request: ElementsIndexProposeRequest,
    harness_service: Annotated[HarnessService, Depends(get_harness_service)],
) -> ElementsIndexProposeResponse:
    return harness_service.propose_elements_index(request)


@router.post("/apply", response_model=ElementsIndexApplyResponse)
def apply_elements_index(
    request: ElementsIndexApplyRequest,
    harness_service: Annotated[HarnessService, Depends(get_harness_service)],
) -> ElementsIndexApplyResponse:
    return harness_service.apply_elements_index(request)
