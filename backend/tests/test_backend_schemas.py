from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas import (
    ElementDecision,
    ElementProposalAction,
    EventDelta,
    EventDeltaAction,
    EventsIndexProposeRequest,
)


def test_events_index_request_trims_strings_and_history() -> None:
    request_model = EventsIndexProposeRequest(
        diff_text="  + Added line  ",
        events_md="  # Events  ",
        history=[
            {
                "attempt_number": 1,
                "previous_output": "  {\"proposal\": 1}  ",
                "reviewer_feedback": "  tighten the summary  ",
            }
        ],
    )

    assert request_model.diff_text == "+ Added line"
    assert request_model.events_md == "# Events"
    assert request_model.history[0].previous_output == "{\"proposal\": 1}"
    assert request_model.history[0].reviewer_feedback == "tighten the summary"


def test_event_delta_requires_existing_uuid_for_update() -> None:
    with pytest.raises(ValidationError):
        EventDelta(
            action=EventDeltaAction.UPDATE,
            existing_event_uuid=None,
            when="June 28, 1998",
            chapters="Chapter 8",
            summary="Updated summary",
            reason="The diff clarified the timing.",
        )


def test_element_decision_sanitizes_alias_and_key_lists() -> None:
    decision = ElementDecision(
        display_name="  Mira  ",
        kind="person",
        aliases=[" Mira ", "", None],
        identification_keys=[" carries the silver key ", "  ", None],
        snapshot="  Core story investigator.  ",
        update_instruction="  Create a new stub record.  ",
        evidence_from_diff=[" + Mira stepped into the chapel. ", "", None],
        matched_existing_display_name=None,
        matched_existing_uuid=None,
        is_new=True,
    )

    assert decision.display_name == "Mira"
    assert decision.action == ElementProposalAction.CREATE
    assert decision.aliases == ["Mira"]
    assert decision.identification_keys == ["carries the silver key"]
    assert decision.snapshot == "Core story investigator."
    assert decision.evidence_from_diff == ["+ Mira stepped into the chapel."]


def test_element_decision_infers_update_action_from_existing_match_name() -> None:
    decision = ElementDecision(
        display_name="Mira",
        kind="person",
        aliases=[],
        identification_keys=[],
        snapshot="Mira remains relevant in the revised scene.",
        update_instruction="Carry the new evidence into detail review.",
        evidence_from_diff=["+ Mira stepped into the chapel."],
        matched_existing_display_name="Mira",
        matched_existing_uuid=None,
    )

    assert decision.action == ElementProposalAction.UPDATE
    assert decision.is_new is False


def test_element_decision_schema_requires_action() -> None:
    schema = ElementDecision.model_json_schema()

    assert "action" in schema["required"]
