from __future__ import annotations

from dataclasses import dataclass
import logging

from fastapi.testclient import TestClient
import pytest

from backend.dependencies import get_harness_service
from backend.errors import ApiError
from backend.main import create_app
from backend.schemas import (
    ElementDecision,
    ElementDetailProposeResponse,
    ElementFileUpdateProposal,
    ElementKind,
    EventDetailProposeResponse,
    EventFileUpdateProposal,
)
from backend.services.harness_service import HarnessService
from backend.services.stub_payloads import build_element_detail_file


def build_client(service_override=None, raise_server_exceptions=True) -> TestClient:
    application = create_app()
    if service_override is not None:
        application.dependency_overrides[get_harness_service] = lambda: service_override
    return TestClient(application, raise_server_exceptions=raise_server_exceptions)


def build_events_index_propose_payload() -> dict:
    return {
        "diff_text": "--- a/chapter-08.story\n+++ b/chapter-08.story\n+She noticed the altar cloth.",
        "events_md": "# Events",
        "history": [],
    }


def build_events_index_apply_payload() -> dict:
    return {
        "events_md": "# Events",
        "proposal": {
            "scan_summary": "Stub mode summary.",
            "deltas": [
                {
                    "action": "create",
                    "existing_event_uuid": None,
                    "when": "June 28, 1998, 7:15 a.m.",
                    "chapters": "Chapter 8",
                    "summary": "Stubbed altar discovery event for contract integration",
                    "reason": "Create a deterministic event in stub mode.",
                    "evidence_from_diff": ["She noticed the altar cloth."],
                }
            ],
        },
    }


def build_elements_index_propose_payload() -> dict:
    return {
        "diff_text": "--- a/chapter-08.story\n+++ b/chapter-08.story\n+The silver key felt colder than before.",
        "elements_md": "# Elements",
        "history": [],
    }


def build_elements_index_apply_payload() -> dict:
    return {
        "elements_md": "# Elements",
        "proposal": {
            "diff_summary": "Stub mode summary.",
            "rationale": "Stub mode rationale.",
            "identified_elements": [
                {
                    "display_name": "Stubbed Story Element",
                    "kind": "concept",
                    "aliases": ["stubbed element"],
                    "identification_keys": ["contract integration", "deterministic fixture"],
                    "snapshot": "A deterministic placeholder element.",
                    "update_instruction": "Create a new placeholder element.",
                    "evidence_from_diff": ["The silver key felt colder than before."],
                    "matched_existing_display_name": None,
                    "matched_existing_uuid": None,
                    "is_new": True,
                }
            ],
            "approval_message": "Stub mode would create one placeholder element.",
        },
    }


def build_detail_payload(endpoint_name: str) -> dict:
    payload = {
        "diff_text": "--- a/chapter-08.story\n+++ b/chapter-08.story\n+The chapel door was already open.",
        "target": {
            "uuid": f"{endpoint_name}_123",
            "summary": "Stubbed detail target",
            "file": f"{endpoint_name}/{endpoint_name}_123.md",
            "delta_action": "update",
            "update_context": "Update the stub detail target.",
        },
        "current_detail_md": "# Stubbed detail target\n\n## Identification\n- UUID: stub\n",
        "history": [],
    }
    if endpoint_name == "event":
        payload["events_md"] = "# Events"
        return payload

    payload["elements_md"] = "# Elements"
    payload["events_md"] = "# Events"
    return payload


def test_all_stub_routes_return_successful_contract_shapes() -> None:
    test_cases = [
        ("/harness/events-index/propose", build_events_index_propose_payload(), "proposal"),
        ("/harness/events-index/apply", build_events_index_apply_payload(), "events_md"),
        ("/harness/elements-index/propose", build_elements_index_propose_payload(), "proposal"),
        ("/harness/elements-index/apply", build_elements_index_apply_payload(), "elements_md"),
        ("/harness/element-detail/propose", build_detail_payload("element"), "updated_detail_md"),
        ("/harness/event-detail/propose", build_detail_payload("event"), "updated_detail_md"),
    ]
    client = build_client()

    for endpoint_path, payload, response_key in test_cases:
        response = client.post(endpoint_path, json=payload)
        response_body = response.json()

        assert response.status_code == 200
        assert response_key in response_body
        assert response_body[response_key] is not None


def test_events_index_propose_returns_stub_delta_with_diff_evidence() -> None:
    client = build_client()

    response = client.post("/harness/events-index/propose", json=build_events_index_propose_payload())
    response_body = response.json()
    proposal = response_body["proposal"]

    assert response.status_code == 200
    # This exact string is part of the deterministic stub contract; update the fixture and
    # this assertion together if the stub copy changes intentionally.
    assert proposal["scan_summary"] == "Stub mode analyzed the diff and returned a deterministic events proposal."
    assert proposal["deltas"][0]["action"] == "create"
    assert proposal["deltas"][0]["evidence_from_diff"] == ["She noticed the altar cloth."]


def test_cors_preflight_allows_localhost_dev_ports() -> None:
    client = build_client()

    response = client.options(
        "/harness/events-index/propose",
        headers={
            "Origin": "http://localhost:5175",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5175"
    assert "GET" in response.headers["access-control-allow-methods"]
    assert "POST" in response.headers["access-control-allow-methods"]


def test_events_index_apply_returns_updated_index_and_new_detail_skeleton() -> None:
    client = build_client()

    response = client.post("/harness/events-index/apply", json=build_events_index_apply_payload())
    response_body = response.json()
    detail_files = response_body["detail_files"]
    generated_event_uuids = list(detail_files)

    assert response.status_code == 200
    assert len(generated_event_uuids) == 1
    assert generated_event_uuids[0].startswith("evt_")
    assert generated_event_uuids[0] in response_body["events_md"]
    assert detail_files[generated_event_uuids[0]].startswith("# Stubbed altar discovery event for contract integration")
    assert "## Core Understanding" in detail_files[generated_event_uuids[0]]


def test_element_detail_uses_target_kind_when_present() -> None:
    client = build_client()
    payload = build_detail_payload("element")
    payload["target"]["kind"] = "person"

    response = client.post("/harness/element-detail/propose", json=payload)
    response_body = response.json()

    assert response.status_code == 200
    assert "- Type: person" in response_body["updated_detail_md"]


def test_element_detail_uses_aliases_from_index_markdown() -> None:
    client = build_client()
    payload = build_detail_payload("element")
    payload["target"]["uuid"] = "elt_stub123"
    payload["target"]["summary"] = "Mira"
    payload["elements_md"] = (
        "# Elements\n\n## Entries\n"
        "- person | Mira | elt_stub123 | Mira, Sister Mira | protagonist, chapel witness\n"
    )

    response = client.post("/harness/element-detail/propose", json=payload)
    response_body = response.json()

    assert response.status_code == 200
    assert "- Aliases: Mira, Sister Mira" in response_body["updated_detail_md"]


def test_stub_element_detail_file_uses_dash_when_identification_keys_are_empty() -> None:
    detail_markdown = build_element_detail_file(
        "elt_stub123",
        ElementDecision(
            display_name="Stubbed Story Element",
            kind=ElementKind.CONCEPT,
            aliases=[],
            identification_keys=[],
            snapshot="Deterministic stub element.",
            update_instruction="Track the stub detail.",
            evidence_from_diff=[],
            matched_existing_display_name=None,
            matched_existing_uuid=None,
            is_new=True,
        ),
    )

    assert "- Identification keys: -" in detail_markdown


def test_event_detail_uses_when_and_chapters_from_index_markdown() -> None:
    client = build_client()
    payload = build_detail_payload("event")
    payload["target"]["uuid"] = "evt_stub123"
    payload["target"]["summary"] = "Mira sees the chapel light"
    payload["events_md"] = (
        "# Events\n\n## Entries\n"
        "- evt_stub123 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira sees the chapel light\n"
    )

    response = client.post("/harness/event-detail/propose", json=payload)
    response_body = response.json()

    assert response.status_code == 200
    assert "- When: June 28, 1998, 7:15 a.m." in response_body["updated_detail_md"]
    assert "- Chapters: Chapter 8" in response_body["updated_detail_md"]


def test_validation_errors_use_the_shared_error_envelope() -> None:
    client = build_client()
    response = client.post("/harness/events-index/propose", json={"events_md": "# Events", "history": []})
    response_body = response.json()

    assert response.status_code == 422
    assert response_body["error"] == "validation_error"
    assert response_body["retryable"] is False


def test_real_mode_missing_llm_configuration_uses_shared_error_envelope(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_harness_service.cache_clear()
    monkeypatch.setenv("WORLD_MODEL_BACKEND_MODE", "real")
    monkeypatch.delenv("WORLD_MODEL_LLM_API_KEY", raising=False)
    monkeypatch.delenv("WORLD_MODEL_LLM_MODEL", raising=False)
    try:
        client = build_client(raise_server_exceptions=False)
        response = client.post("/harness/events-index/propose", json=build_events_index_propose_payload())
        response_body = response.json()

        assert response.status_code == 500
        assert response_body["error"] == "llm_configuration_error"
        assert response_body["retryable"] is False
        assert "WORLD_MODEL_LLM_API_KEY" in response_body["message"]
        assert "WORLD_MODEL_LLM_MODEL" in response_body["message"]
    finally:
        get_harness_service.cache_clear()


def test_elements_index_propose_returns_parse_error_for_blank_uuid_entries() -> None:
    client = build_client()
    payload = build_elements_index_propose_payload()
    payload["elements_md"] = (
        "# Elements\n\n## Entries\n"
        "- item | Broken Entry |  | broken alias | malformed identifier\n"
    )

    response = client.post("/harness/elements-index/propose", json=payload)
    response_body = response.json()

    assert response.status_code == 500
    assert response_body["error"] == "parse_error"
    assert response_body["retryable"] is False
    assert response_body["details"] == ['Element index entry "Broken Entry" is missing a UUID.']


def test_elements_index_apply_returns_parse_error_for_blank_uuid_entries() -> None:
    client = build_client()
    payload = build_elements_index_apply_payload()
    payload["elements_md"] = (
        "# Elements\n\n## Entries\n"
        "- item | Broken Entry |  | broken alias | malformed identifier\n"
    )

    response = client.post("/harness/elements-index/apply", json=payload)
    response_body = response.json()

    assert response.status_code == 500
    assert response_body["error"] == "parse_error"
    assert response_body["retryable"] is False
    assert response_body["details"] == ['Element index entry "Broken Entry" is missing a UUID.']


@dataclass
class FailingHarnessService:
    failure: Exception

    def propose_events_index(self, _request):
        raise self.failure

    def apply_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_element_detail(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_event_detail(self, _request):
        raise AssertionError("Unexpected route call.")


@dataclass
class ElementsIndexFailingHarnessService:
    failure: Exception

    def propose_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_elements_index(self, _request):
        raise self.failure

    def apply_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_element_detail(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_event_detail(self, _request):
        raise AssertionError("Unexpected route call.")


@dataclass
class DetailNoopHarnessService:
    def propose_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_element_detail(self, request):
        return ElementDetailProposeResponse(
            proposal=ElementFileUpdateProposal(
                changed=False,
                rationale="Nothing new reached this file.",
                approval_message="No changes needed.",
            ),
            preview_diff="",
            updated_detail_md=request.current_detail_md,
        )

    def propose_event_detail(self, request):
        return EventDetailProposeResponse(
            proposal=EventFileUpdateProposal(
                changed=False,
                rationale="Nothing new reached this file.",
                approval_message="No changes needed.",
            ),
            preview_diff="",
            updated_detail_md=request.current_detail_md,
        )


@dataclass
class DetailChangedHarnessService:
    def propose_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_element_detail(self, request):
        return ElementDetailProposeResponse(
            proposal=ElementFileUpdateProposal(
                changed=True,
                rationale="The diff adds a new canon detail.",
                approval_message="Apply the update.",
            ),
            preview_diff=f"--- a/{request.target.file}\n+++ b/{request.target.file}\n@@",
            updated_detail_md=f"{request.current_detail_md.strip()}\n\n## Open Threads\n- Verify the new canon detail.\n",
        )

    def propose_event_detail(self, request):
        return EventDetailProposeResponse(
            proposal=EventFileUpdateProposal(
                changed=True,
                rationale="The diff adds a new event implication.",
                approval_message="Apply the update.",
            ),
            preview_diff=f"--- a/{request.target.file}\n+++ b/{request.target.file}\n@@",
            updated_detail_md=f"{request.current_detail_md.strip()}\n\n## Open Threads\n- Trace the new consequence.\n",
        )


@dataclass
class DetailFailingHarnessService:
    failure: Exception

    def propose_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_events_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def apply_elements_index(self, _request):
        raise AssertionError("Unexpected route call.")

    def propose_element_detail(self, _request):
        raise self.failure

    def propose_event_detail(self, _request):
        raise self.failure


def test_detail_noop_harness_service_matches_harness_protocol() -> None:
    assert isinstance(DetailNoopHarnessService(), HarnessService)


def test_shared_error_mapping_covers_retryable_and_non_retryable_failures() -> None:
    failure_cases = [
        (ApiError("llm_timeout", "Timed out.", 504, True), 504, "llm_timeout", True),
        (ApiError("llm_rate_limit", "Rate limited.", 429, True), 429, "llm_rate_limit", True),
        (ApiError("parse_error", "Failed to parse markdown.", 500, False), 500, "parse_error", False),
        (RuntimeError("boom"), 500, "internal_error", False),
    ]

    for failure, expected_status_code, expected_error_code, expected_retryable in failure_cases:
        client = build_client(
            service_override=FailingHarnessService(failure=failure),
            raise_server_exceptions=False,
        )
        response = client.post("/harness/events-index/propose", json=build_events_index_propose_payload())
        response_body = response.json()

        assert response.status_code == expected_status_code
        assert response_body["error"] == expected_error_code
        assert response_body["retryable"] is expected_retryable


def test_elements_index_propose_uses_shared_error_envelope_for_audit_failures() -> None:
    client = build_client(
        service_override=ElementsIndexFailingHarnessService(
            failure=ApiError(
                "proposal_audit_failed",
                "The elements proposal failed audit after retry.",
                500,
                False,
                ["Coverage gap: the diff explicitly names Mira, but the proposal omitted her."],
            )
        ),
        raise_server_exceptions=False,
    )

    response = client.post("/harness/elements-index/propose", json=build_elements_index_propose_payload())
    response_body = response.json()

    assert response.status_code == 500
    assert response_body["error"] == "proposal_audit_failed"
    assert response_body["retryable"] is False
    assert response_body["details"] == [
        "Coverage gap: the diff explicitly names Mira, but the proposal omitted her.",
    ]


def test_detail_routes_handle_changed_false_without_diff() -> None:
    client = build_client(service_override=DetailNoopHarnessService())

    element_response = client.post("/harness/element-detail/propose", json=build_detail_payload("element"))
    event_response = client.post("/harness/event-detail/propose", json=build_detail_payload("event"))

    assert element_response.status_code == 200
    assert element_response.json()["proposal"]["changed"] is False
    assert element_response.json()["preview_diff"] == ""
    assert element_response.json()["updated_detail_md"] == build_detail_payload("element")["current_detail_md"].strip()

    assert event_response.status_code == 200
    assert event_response.json()["proposal"]["changed"] is False
    assert event_response.json()["preview_diff"] == ""
    assert event_response.json()["updated_detail_md"] == build_detail_payload("event")["current_detail_md"].strip()


@pytest.mark.parametrize(
    ("endpoint_path", "payload_builder"),
    [
        ("/harness/element-detail/propose", lambda: build_detail_payload("element")),
        ("/harness/event-detail/propose", lambda: build_detail_payload("event")),
    ],
)
def test_detail_routes_return_non_empty_diff_for_changed_proposals(endpoint_path, payload_builder) -> None:
    client = build_client(service_override=DetailChangedHarnessService())

    response = client.post(endpoint_path, json=payload_builder())
    response_body = response.json()

    assert response.status_code == 200
    assert response_body["proposal"]["changed"] is True
    assert response_body["preview_diff"].startswith("--- a/")
    assert response_body["updated_detail_md"].startswith("# Stubbed detail target")


@pytest.mark.parametrize(
    ("endpoint_path", "payload_builder"),
    [
        ("/harness/element-detail/propose", lambda: build_detail_payload("element")),
        ("/harness/event-detail/propose", lambda: build_detail_payload("event")),
    ],
)
def test_detail_routes_use_shared_error_envelope_when_service_fails(endpoint_path, payload_builder) -> None:
    client = build_client(
        service_override=DetailFailingHarnessService(
            failure=ApiError("llm_error", "Upstream detail generation failed.", 502, True),
        ),
        raise_server_exceptions=False,
    )

    response = client.post(endpoint_path, json=payload_builder())
    response_body = response.json()

    assert response.status_code == 502
    assert response_body["error"] == "llm_error"
    assert response_body["message"] == "Upstream detail generation failed."
    assert response_body["retryable"] is True


def test_unexpected_errors_are_logged(caplog) -> None:
    client = build_client(
        service_override=FailingHarnessService(failure=RuntimeError("boom")),
        raise_server_exceptions=False,
    )

    with caplog.at_level(logging.ERROR):
        response = client.post("/harness/events-index/propose", json=build_events_index_propose_payload())

    assert response.status_code == 500
    assert any("Unhandled unexpected error while processing request." in message for message in caplog.messages)
    assert any(record.exc_info for record in caplog.records)
