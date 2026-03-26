from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.dependencies import get_harness_service
from backend.schemas import EventDetailProposeRequest, EventDetailProposeResponse
from backend.services.harness_service import HarnessService

router = APIRouter(prefix="/harness/event-detail", tags=["event-detail"])


@router.post("/propose", response_model=EventDetailProposeResponse)
def propose_event_detail(
    request: EventDetailProposeRequest,
    harness_service: Annotated[HarnessService, Depends(get_harness_service)],
) -> EventDetailProposeResponse:
    return harness_service.propose_event_detail(request)
