from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from backend.dependencies import get_harness_service
from backend.errors import ApiError
from backend.main import create_app


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


def test_element_detail_uses_target_kind_when_present() -> None:
    client = build_client()
    payload = build_detail_payload("element")
    payload["target"]["kind"] = "person"

    response = client.post("/harness/element-detail/propose", json=payload)
    response_body = response.json()

    assert response.status_code == 200
    assert "- Type: person" in response_body["updated_detail_md"]


def test_validation_errors_use_the_shared_error_envelope() -> None:
    client = build_client()
    response = client.post("/harness/events-index/propose", json={"events_md": "# Events", "history": []})
    response_body = response.json()

    assert response.status_code == 422
    assert response_body["error"] == "validation_error"
    assert response_body["retryable"] is False


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
