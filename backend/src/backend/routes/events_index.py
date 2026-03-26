from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from backend.dependencies import get_harness_service
from backend.schemas import (
    EventsIndexApplyRequest,
    EventsIndexApplyResponse,
    EventsIndexProposeRequest,
    EventsIndexProposeResponse,
)
from backend.services.harness_service import HarnessService

router = APIRouter(prefix="/harness/events-index", tags=["events-index"])


@router.post("/propose", response_model=EventsIndexProposeResponse)
def propose_events_index(
    request: EventsIndexProposeRequest,
    harness_service: Annotated[HarnessService, Depends(get_harness_service)],
) -> EventsIndexProposeResponse:
    return harness_service.propose_events_index(request)


@router.post("/apply", response_model=EventsIndexApplyResponse)
def apply_events_index(
    request: EventsIndexApplyRequest,
    harness_service: Annotated[HarnessService, Depends(get_harness_service)],
) -> EventsIndexApplyResponse:
    return harness_service.apply_events_index(request)
