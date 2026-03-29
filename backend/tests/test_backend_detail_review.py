from __future__ import annotations

import json

import httpx
import pytest

from backend.errors import ApiError
from backend.schemas import (
    ChronologyBlockUpdate,
    DetailTarget,
    ElementDetailProposeRequest,
    ElementFileUpdateProposal,
    ElementKind,
    ElementProposalAction,
    ElementsIndexProposeRequest,
    EventAgentOutput,
    EventDetailProposeRequest,
    EventFileUpdateProposal,
    EventsIndexProposeRequest,
    HistoryEntry,
)
from backend.services.detail_review import (
    OpenAICompatibleDetailProposalProvider,
    apply_element_file_update,
    apply_event_file_update,
    build_element_prompt_context,
    build_element_detail_response,
    build_event_detail_response,
    build_review_messages,
    extract_section,
    format_history_entry,
    merge_chronology_blocks,
    merge_element_section_lines,
    merge_section_lines,
    normalize_elements_index_response,
    parse_json_content,
    parse_element_detail_markdown,
    parse_event_detail_markdown,
    render_element_detail_markdown,
    render_event_detail_markdown,
    validate_llm_base_url,
)
from backend.services.provenance import parse_provenance_references


def test_merge_section_lines_adds_unique_and_dedupes_duplicate() -> None:
    merged_lines = merge_section_lines(
        current_lines=["Keeps watch at the nave."],
        to_add=["Keeps watch at the nave.", "Carries the cloth bundle."],
        to_remove=[],
    )

    assert merged_lines == ["Keeps watch at the nave.", "Carries the cloth bundle."]


def test_merge_section_lines_removes_existing_and_ignores_missing() -> None:
    merged_lines = merge_section_lines(
        current_lines=["Keeps watch at the nave.", "Carries the cloth bundle."],
        to_add=[],
        to_remove=["Keeps watch at the nave.", "Does not exist."],
    )

    assert merged_lines == ["Carries the cloth bundle."]


def test_merge_element_section_lines_normalizes_whitespace_before_deduping() -> None:
    merged_lines = merge_element_section_lines(
        current_lines=["Keeps watch at the nave."],
        to_add=["  Keeps   watch at the nave.  ", "- Carries the cloth bundle."],
        to_remove=[],
    )

    assert merged_lines == ["Keeps watch at the nave.", "Carries the cloth bundle."]


def test_merge_chronology_blocks_creates_new_heading_when_missing() -> None:
    merged_blocks = merge_chronology_blocks(
        current_blocks=[],
        blocks_to_add=[
            ChronologyBlockUpdate(
                heading="Chapter 8 — June 28, 1998",
                entries=["Discovers the cloth bundle at the altar."],
            )
        ],
    )

    assert len(merged_blocks) == 1
    assert merged_blocks[0].heading == "Chapter 8 — June 28, 1998"
    assert merged_blocks[0].entries == ["Discovers the cloth bundle at the altar."]


def test_merge_chronology_blocks_inserts_into_existing_heading() -> None:
    current = parse_element_detail_markdown(
        """# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness

## Core Understanding
Mira is already on file.

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
### Chapter 8 — June 28, 1998
- Arrives at Saint Alder Chapel.

## Open Threads
- TBD
""",
        DetailTarget(
            uuid="elt_mira123",
            summary="Mira",
            file="elements/elt_mira123.md",
            delta_action="update",
            update_context="Tighten chronology.",
            kind="person",
        ),
        "# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
    )

    merged_blocks = merge_chronology_blocks(
        current.chronology_blocks,
        [
            ChronologyBlockUpdate(
                heading="Chapter 8 — June 28, 1998",
                entries=["Discovers the cloth bundle at the altar."],
            )
        ],
    )

    assert len(merged_blocks) == 1
    assert merged_blocks[0].entries == [
        "Arrives at Saint Alder Chapel.",
        "Discovers the cloth bundle at the altar.",
    ]


def test_merge_chronology_blocks_dedupes_entries_within_heading() -> None:
    current = parse_element_detail_markdown(
        """# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness

## Core Understanding
Mira is already on file.

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
### Chapter 8 — June 28, 1998
- Discovers the cloth bundle at the altar.

## Open Threads
- TBD
""",
        DetailTarget(
            uuid="elt_mira123",
            summary="Mira",
            file="elements/elt_mira123.md",
            delta_action="update",
            update_context="Tighten chronology.",
            kind="person",
        ),
        "# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
    )

    merged_blocks = merge_chronology_blocks(
        current.chronology_blocks,
        [
            ChronologyBlockUpdate(
                heading="Chapter 8 — June 28, 1998",
                entries=["  Discovers   the cloth bundle at the altar.  "],
            )
        ],
    )

    assert merged_blocks[0].entries == ["Discovers the cloth bundle at the altar."]


def test_parse_element_detail_markdown_merges_pre_heading_chronology_into_the_first_heading() -> None:
    parsed = parse_element_detail_markdown(
        """# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness

## Core Understanding
Mira is already on file.

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
- Watches the chapel door before the scene opens.
### Chapter 8 — June 28, 1998
- Discovers the cloth bundle at the altar.

## Open Threads
- TBD
""",
        DetailTarget(
            uuid="elt_mira123",
            summary="Mira",
            file="elements/elt_mira123.md",
            delta_action="update",
            update_context="Tighten chronology.",
            kind="person",
        ),
        "# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
    )

    assert [block.model_dump() for block in parsed.chronology_blocks] == [
        {
            "heading": "Chapter 8 — June 28, 1998",
            "entries": [
                "Watches the chapel door before the scene opens.",
                "Discovers the cloth bundle at the altar.",
            ],
        }
    ]


def test_parse_element_detail_markdown_labels_headingless_chronology_as_imported() -> None:
    parsed = parse_element_detail_markdown(
        """# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness

## Core Understanding
Mira is already on file.

## Stable Profile
- TBD

## Interpretation
- TBD

## Knowledge / Beliefs / Uncertainties
- TBD

## Element-Centered Chronology
- Watches the chapel door before the scene opens.
- Discovers the cloth bundle at the altar.

## Open Threads
- TBD
""",
        DetailTarget(
            uuid="elt_mira123",
            summary="Mira",
            file="elements/elt_mira123.md",
            delta_action="update",
            update_context="Tighten chronology.",
            kind="person",
        ),
        "# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
    )

    assert [block.model_dump() for block in parsed.chronology_blocks] == [
        {
            "heading": "Imported Chronology",
            "entries": [
                "Watches the chapel door before the scene opens.",
                "Discovers the cloth bundle at the altar.",
            ],
        }
    ]


def test_build_review_messages_includes_one_history_entry_before_new_prompt() -> None:
    messages = build_review_messages(
        system_prompt="System prompt",
        user_prompt="Current prompt",
        history=[
            HistoryEntry(
                attempt_number=1,
                previous_output='{"changed": true}',
                reviewer_feedback="That relationship is incorrect.",
            )
        ],
    )

    assert [message["role"] for message in messages] == ["system", "user", "assistant", "user"]
    assert messages[1]["content"] == "Current prompt"
    assert messages[2]["content"] == '{"changed": true}'
    assert "Attempt 1" in messages[3]["content"]
    assert "That relationship is incorrect." in messages[3]["content"]


def test_build_review_messages_preserves_multiple_history_entries_in_order() -> None:
    messages = build_review_messages(
        system_prompt="System prompt",
        user_prompt="Current prompt",
        history=[
            HistoryEntry(
                attempt_number=1,
                previous_output='{"changed": true}',
                reviewer_feedback="First correction.",
            ),
            HistoryEntry(
                attempt_number=2,
                previous_output='{"changed": true, "revision": 2}',
                reviewer_feedback="Second correction.",
            ),
        ],
    )

    assert [message["role"] for message in messages] == [
        "system",
        "user",
        "assistant",
        "user",
        "assistant",
        "user",
    ]
    assert messages[1]["content"] == "Current prompt"
    assert messages[2]["content"] == '{"changed": true}'
    assert "Attempt 1" in messages[3]["content"]
    assert "First correction." in messages[3]["content"]
    assert messages[4]["content"] == '{"changed": true, "revision": 2}'
    assert "Attempt 2" in messages[5]["content"]
    assert "Second correction." in messages[5]["content"]


def test_format_history_entry_treats_braces_as_literal_text() -> None:
    formatted = format_history_entry(
        HistoryEntry(
            attempt_number=2,
            previous_output='{"changed": true, "note": "{danger}"}',
            reviewer_feedback="Keep the literal token {danger} in the rationale.",
        )
    )

    assert "Attempt 2" in formatted
    assert "{danger}" in formatted


def test_extract_section_ignores_code_fences_and_partial_heading_matches() -> None:
    extracted = extract_section(
        """## Core Understanding
Real section body.

```md
## Stable Profile
- Not a real heading.
```

## Stable Profile Extension
Still part of the previous section.

## Stable Profile
- Final heading.
""",
        "## Core Understanding",
        "## Stable Profile",
    )

    assert "Real section body." in extracted
    assert "Not a real heading." in extracted
    assert "Still part of the previous section." in extracted


def test_extract_section_logs_when_end_heading_is_missing(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("WARNING"):
        extracted = extract_section(
            """## Core Understanding
The section should fall back to EOF.
""",
            "## Core Understanding",
            "## Stable Profile",
        )

    assert extracted == "The section should fall back to EOF."
    assert any("using EOF fallback" in message for message in caplog.messages)


def test_parse_json_content_extracts_the_first_complete_object() -> None:
    parsed = parse_json_content(
        """The model wrapped the JSON in commentary.

{"changed": true, "nested": {"status": "kept"}}

Trailing prose with another brace } that should be ignored.
"""
    )

    assert parsed == {"changed": True, "nested": {"status": "kept"}}


def test_parse_json_content_unwraps_singleton_object_array() -> None:
    parsed = parse_json_content(
        """The model wrapped the JSON in commentary.

[{"changed": true, "nested": {"status": "kept"}}]
"""
    )

    assert parsed == {"changed": True, "nested": {"status": "kept"}}


def test_parse_json_content_wraps_elements_index_arrays() -> None:
    parsed = parse_json_content(
        """The model wrapped the JSON in commentary.

[
  {"display_name": "Nick", "kind": "person", "snapshot": "Nick matters now.", "update_instruction": "Create Nick.", "is_new": true},
  {"display_name": "Mara", "kind": "person", "snapshot": "Mara matters now.", "update_instruction": "Create Mara.", "is_new": true}
]
""",
        proposal_label="elements index proposal",
    )

    assert parsed == {
        "identified_elements": [
            {
                "display_name": "Nick",
                "kind": "person",
                "snapshot": "Nick matters now.",
                "update_instruction": "Create Nick.",
                "is_new": True,
            },
            {
                "display_name": "Mara",
                "kind": "person",
                "snapshot": "Mara matters now.",
                "update_instruction": "Create Mara.",
                "is_new": True,
            }
        ]
    }


def test_parse_json_content_rejects_json_arrays() -> None:
    with pytest.raises(ApiError) as exc_info:
        parse_json_content(
            """The model wrapped the JSON in commentary.

[{"changed": true}, {"changed": false}]
"""
        )

    assert exc_info.value.message == "The LLM returned a JSON array for the detail proposal; expected a JSON object."


def test_normalize_elements_index_response_wraps_single_element_decision() -> None:
    normalized = normalize_elements_index_response(
        {
            "display_name": "Nick",
            "kind": "person",
            "aliases": ["project manager"],
            "identification_keys": ["GJ 1002 b resident"],
            "snapshot": "Nick becomes relevant in the election subplot.",
            "update_instruction": "Add Nick to the elements index.",
            "evidence_from_diff": ["Nick sends the message."],
            "matched_existing_display_name": None,
            "matched_existing_uuid": None,
            "is_new": True,
        }
    )

    assert normalized["identified_elements"][0]["display_name"] == "Nick"
    assert normalized["diff_summary"] != ""
    assert normalized["approval_message"] != ""


def test_build_element_detail_response_returns_empty_diff_when_changed_false() -> None:
    request = ElementDetailProposeRequest(
        diff_text="+ No relevant change",
        elements_md="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
        events_md="# Events\n\n## Entries\n",
        target={
            "uuid": "elt_mira123",
            "summary": "Mira",
            "file": "elements/elt_mira123.md",
            "delta_action": "update",
            "update_context": "No file-level change needed.",
            "kind": "person",
        },
        current_detail_md="# Mira\n\n## Identification\n- UUID: elt_mira123\n",
        history=[],
    )

    response = build_element_detail_response(
        request,
        ElementFileUpdateProposal(
            changed=False,
            rationale="Nothing new reached this file.",
            approval_message="No changes needed.",
        ),
    )

    assert response.preview_diff == ""
    assert response.updated_detail_md == "# Mira\n\n## Identification\n- UUID: elt_mira123"


def test_parse_event_detail_markdown_falls_back_to_index_metadata_when_current_file_is_blank() -> None:
    parsed_event = parse_event_detail_markdown(
        "",
        DetailTarget(
            uuid="evt_cloth123",
            summary="Mira discovers the cloth bundle",
            file="events/evt_cloth123.md",
            delta_action="create",
            update_context="Create the event dossier.",
        ),
        "# Events\n\n## Entries\n- evt_cloth123 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira discovers the cloth bundle\n",
    )

    assert parsed_event.uuid == "evt_cloth123"
    assert parsed_event.when == "June 28, 1998, 7:15 a.m."
    assert parsed_event.chapters == "Chapter 8"
    assert parsed_event.summary == "Mira discovers the cloth bundle"


def test_build_event_detail_response_keeps_blank_file_renderable_when_changed_false() -> None:
    request = EventDetailProposeRequest(
        diff_text="+ No relevant change",
        events_md="# Events\n\n## Entries\n- evt_cloth123 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira discovers the cloth bundle\n",
        target={
            "uuid": "evt_cloth123",
            "summary": "Mira discovers the cloth bundle",
            "file": "events/evt_cloth123.md",
            "delta_action": "create",
            "update_context": "No event-file change needed.",
        },
        current_detail_md="",
        history=[],
    )

    response = build_event_detail_response(
        request,
        EventFileUpdateProposal(
            changed=False,
            rationale="Nothing new reached this file.",
            approval_message="No changes needed.",
        ),
    )

    assert response.preview_diff == ""
    assert response.updated_detail_md.startswith("# Mira discovers the cloth bundle")


@pytest.mark.parametrize(
    ("base_url", "message"),
    [
        ("http://example.com/openai/v1", "absolute https URL"),
        ("https://localhost/openai/v1", "must not target localhost"),
        ("https://192.168.1.25/openai/v1", "must not target private or local IP space"),
    ],
)
def test_validate_llm_base_url_rejects_unsafe_targets(base_url: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        validate_llm_base_url(base_url)


def test_validate_llm_base_url_accepts_public_https_url() -> None:
    assert validate_llm_base_url("https://api.example.com/openai/v1/") == "https://api.example.com/openai/v1"


def test_provider_repr_masks_the_api_key() -> None:
    provider = OpenAICompatibleDetailProposalProvider(
        api_key="top-secret",
        base_url="https://example.com/openai/v1",
        model="test-model",
    )

    assert "top-secret" not in repr(provider)
    assert "api_key='***'" in repr(provider)
    assert "max_tokens=8000" in repr(provider)


def test_propose_events_index_posts_schema_and_history_via_mock_http(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = OpenAICompatibleDetailProposalProvider(
        api_key="top-secret",
        base_url="https://example.com/openai/v1",
        model="test-model",
    )
    request = EventsIndexProposeRequest(
        diff_text="+ Mira finds the cloth bundle at the altar.",
        events_md="# Events\n\n## Entries\n- evt_old123 | June 27, 1998 | Chapter 7 | Mira enters the chapel\n",
        history=[
            HistoryEntry(
                attempt_number=1,
                previous_output='{"scan_summary":"Too broad","deltas":[]}',
                reviewer_feedback="Split discovery from confrontation into separate events.",
            )
        ],
    )
    captured_body: dict[str, object] = {}

    def fake_post(url: str, *, json: dict[str, object], headers: dict[str, str], timeout: int):
        captured_body["timeout"] = timeout
        captured_body["url"] = url
        captured_body["headers"] = headers
        captured_body["json"] = json
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json_module.dumps(
                                EventAgentOutput(
                                    scan_summary="The diff introduces one distinct altar discovery event.",
                                    deltas=[
                                        {
                                            "action": "create",
                                            "when": "June 28, 1998, dawn",
                                            "chapters": "Chapter 8",
                                            "summary": "Mira discovers a cloth bundle waiting at the altar",
                                            "reason": "The diff adds a bounded discovery that is not yet indexed.",
                                            "evidence_from_diff": [
                                                "Mira finds the cloth bundle at the altar."
                                            ],
                                        }
                                    ],
                                ).model_dump()
                            )
                        }
                    }
                ]
            },
            request=httpx.Request("POST", url),
        )

    json_module = json
    monkeypatch.setattr("backend.services.detail_review.httpx.post", fake_post)

    proposal = provider.propose_events_index(request)

    assert proposal.scan_summary == "The diff introduces one distinct altar discovery event."
    assert len(proposal.deltas) == 1
    request_json = captured_body["json"]
    assert isinstance(request_json, dict)
    assert captured_body["timeout"] == 120
    assert captured_body["url"] == "https://example.com/openai/v1/chat/completions"
    assert request_json["model"] == "test-model"
    assert request_json["temperature"] == 0
    assert request_json["max_tokens"] == 8000
    messages = request_json["messages"]
    assert [message["role"] for message in messages] == ["system", "user", "assistant", "user"]
    assert "Current events.md:" in messages[1]["content"]
    assert "Return JSON only." in messages[1]["content"]
    assert '"scan_summary"' in messages[1]["content"]
    assert messages[2]["content"] == '{"scan_summary":"Too broad","deltas":[]}'
    assert "Attempt 1" in messages[3]["content"]
    assert "Split discovery from confrontation into separate events." in messages[3]["content"]


def test_propose_elements_index_posts_schema_and_history_via_mock_http(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = OpenAICompatibleDetailProposalProvider(
        api_key="top-secret",
        base_url="https://example.com/openai/v1",
        model="test-model",
    )
    elements_request = ElementsIndexProposeRequest(
        diff_text="+ Mira opens the chapel.\n+The silver key glints in her hand.",
        elements_md="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n",
        history=[
            HistoryEntry(
                attempt_number=1,
                previous_output='{"identified_elements":[]}',
                reviewer_feedback="Include the existing protagonist when the diff names her.",
            )
        ],
    )
    captured_body: dict[str, object] = {}

    def fake_post(url: str, *, json: dict[str, object], headers: dict[str, str], timeout: int):
        captured_body["timeout"] = timeout
        captured_body["url"] = url
        captured_body["headers"] = headers
        captured_body["json"] = json
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json_module.dumps(
                                {
                                    "diff_summary": "The diff reinforces one tracked person and one recurring item.",
                                    "rationale": "Matched Mira to the existing index and kept the key as an item candidate.",
                                    "identified_elements": [
                                        {
                                            "display_name": "Mira",
                                            "kind": "person",
                                            "aliases": [],
                                            "identification_keys": [],
                                            "snapshot": "Mira is explicitly active in the revised chapel scene.",
                                            "update_instruction": "Carry the new chapel evidence for Mira into detail review.",
                                            "evidence_from_diff": ["Mira opens the chapel."],
                                            "matched_existing_display_name": "Mira",
                                            "matched_existing_uuid": "elt_mira123",
                                            "is_new": False,
                                        }
                                    ],
                                    "approval_message": "Review the proposed element creations and updates before applying them.",
                                }
                            )
                        }
                    }
                ]
            },
            request=httpx.Request("POST", url),
        )

    json_module = json
    monkeypatch.setattr("backend.services.detail_review.httpx.post", fake_post)

    proposal = provider.propose_elements_index(elements_request)

    assert proposal.diff_summary == "The diff reinforces one tracked person and one recurring item."
    request_json = captured_body["json"]
    assert isinstance(request_json, dict)
    assert captured_body["timeout"] == 120
    assert captured_body["url"] == "https://example.com/openai/v1/chat/completions"
    assert request_json["model"] == "test-model"
    assert request_json["temperature"] == 0
    assert request_json["max_tokens"] == 8000
    messages = request_json["messages"]
    assert [message["role"] for message in messages] == ["system", "user", "assistant", "user"]
    assert "Current elements.md:" in messages[1]["content"]
    assert "Return JSON only." in messages[1]["content"]
    assert '"identified_elements"' in messages[1]["content"]
    assert messages[2]["content"] == '{"identified_elements":[]}'
    assert "Attempt 1" in messages[3]["content"]
    assert "Include the existing protagonist when the diff names her." in messages[3]["content"]


def test_propose_elements_index_recovers_missing_action_from_legacy_model_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = OpenAICompatibleDetailProposalProvider(
        api_key="top-secret",
        base_url="https://example.com/openai/v1",
        model="test-model",
    )
    elements_request = ElementsIndexProposeRequest(
        diff_text="+ The silver key glints in her hand.",
        elements_md="# Elements\n\n## Entries\n",
        history=[],
    )

    def fake_post(url: str, *, json: dict[str, object], headers: dict[str, str], timeout: int):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json_module.dumps(
                                {
                                    "diff_summary": "The diff introduces one recurring item.",
                                    "rationale": "Recovered a valid proposal from a legacy element decision shape.",
                                    "identified_elements": [
                                        {
                                            "display_name": "Silver Key",
                                            "kind": "item",
                                            "aliases": ["key"],
                                            "identification_keys": ["metal key"],
                                            "snapshot": "The silver key becomes materially relevant in the scene.",
                                            "update_instruction": "Track the item for downstream detail review.",
                                            "evidence_from_diff": ["The silver key glints in her hand."],
                                        }
                                    ],
                                    "approval_message": "Review the proposal.",
                                }
                            )
                        }
                    }
                ]
            },
            request=httpx.Request("POST", url),
        )

    json_module = json
    monkeypatch.setattr("backend.services.detail_review.httpx.post", fake_post)

    proposal = provider.propose_elements_index(elements_request)

    assert proposal.identified_elements[0].action == ElementProposalAction.CREATE
    assert proposal.identified_elements[0].is_new is True


@pytest.mark.parametrize("status_code", [401, 403])
def test_propose_element_detail_maps_auth_failures_to_api_errors(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    provider = OpenAICompatibleDetailProposalProvider(
        api_key="top-secret",
        base_url="https://example.com/openai/v1",
        model="test-model",
    )
    request = ElementDetailProposeRequest(
        diff_text="+ Mira notices the altar cloth.",
        elements_md="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
        events_md="# Events\n\n## Entries\n",
        target={
            "uuid": "elt_mira123",
            "summary": "Mira",
            "file": "elements/elt_mira123.md",
            "delta_action": "update",
            "update_context": "Tighten the file-level analysis.",
            "kind": "person",
        },
        current_detail_md="# Mira\n\n## Identification\n- UUID: elt_mira123\n",
        history=[],
    )
    prompt_context = build_element_prompt_context(request)

    def raise_http_error(url: str, *, json: dict[str, object], headers: dict[str, str], timeout: int):
        request = httpx.Request("POST", url, json=json, headers=headers)
        response = httpx.Response(
            status_code,
            json={"error": {"message": "access denied"}},
            request=request,
        )
        raise httpx.HTTPStatusError("forbidden", request=request, response=response)

    monkeypatch.setattr("backend.services.detail_review.httpx.post", raise_http_error)

    with pytest.raises(ApiError) as exc_info:
        provider.propose_element_detail(request, prompt_context)

    assert exc_info.value.message == "access denied"
    assert exc_info.value.status_code == 502
    assert exc_info.value.error == "llm_error"
    assert exc_info.value.retryable is False


def test_propose_element_detail_maps_schema_validation_failures_to_api_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = OpenAICompatibleDetailProposalProvider(
        api_key="top-secret",
        base_url="https://example.com/openai/v1",
        model="test-model",
    )
    request = ElementDetailProposeRequest(
        diff_text="+ Mira notices the altar cloth.",
        elements_md="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n",
        events_md="# Events\n\n## Entries\n",
        target={
            "uuid": "elt_mira123",
            "summary": "Mira",
            "file": "elements/elt_mira123.md",
            "delta_action": "update",
            "update_context": "Tighten the file-level analysis.",
            "kind": "person",
        },
        current_detail_md="# Mira\n\n## Identification\n- UUID: elt_mira123\n",
        history=[],
    )
    prompt_context = build_element_prompt_context(request)

    def fake_post(url: str, *, json: dict[str, object], headers: dict[str, str], timeout: int):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json_module.dumps(
                                {
                                    "file_action": "update",
                                    "rationale": "Tries to add a malformed stable profile entry.",
                                    "stable_profile_to_add": ["Keeps the chapel keys.", {"bad": "shape"}],
                                    "approval_message": "Review the malformed output.",
                                }
                            )
                        }
                    }
                ]
            },
            request=httpx.Request("POST", url),
        )

    json_module = json
    monkeypatch.setattr("backend.services.detail_review.httpx.post", fake_post)

    with pytest.raises(ApiError) as exc_info:
        provider.propose_element_detail(request, prompt_context)

    assert (
        exc_info.value.message
        == "The LLM returned JSON that did not match the schema for the element detail proposal."
    )
    assert exc_info.value.status_code == 502
    assert exc_info.value.error == "llm_error"
    assert exc_info.value.retryable is True
    assert exc_info.value.details == ["Value error, Value must be a string."]


def test_render_element_detail_markdown_round_trips_after_update() -> None:
    target = DetailTarget(
        uuid="elt_mira123",
        summary="Mira",
        file="elements/elt_mira123.md",
        delta_action="update",
        update_context="Tighten chronology.",
        kind=ElementKind.PERSON,
    )
    current_markdown = """# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira, Sister Mira
- Identification keys: chapel witness; altar keeper

## Core Understanding
Mira keeps watch at Saint Alder Chapel.

## Stable Profile
- Keeps the chapel keys.

## Interpretation
- Guards what the chapel hides.

## Knowledge / Beliefs / Uncertainties
- Suspects the altar cloth matters.

## Element-Centered Chronology
### Chapter 8 — June 28, 1998
- Hears the chapel door open before dawn.

## Open Threads
- Who left the cloth bundle?
"""
    elements_markdown = (
        "# Elements\n\n## Entries\n"
        "- person | Mira | elt_mira123 | Mira, Sister Mira | chapel witness; altar keeper\n"
    )
    current_object = parse_element_detail_markdown(current_markdown, target, elements_markdown)
    updated_object = apply_element_file_update(
        current_object,
        ElementFileUpdateProposal(
            changed=True,
            rationale="Adds the new altar detail.",
            stable_profile_to_add=["Keeps the altar ledger."],
            knowledge_to_add=["Recognizes the cloth bundle as newly placed."],
            chronology_blocks_to_add=[
                ChronologyBlockUpdate(
                    heading="Chapter 8 — June 28, 1998",
                    entries=["Finds the cloth bundle resting on the altar."],
                )
            ],
            approval_message="Ready to apply the update.",
        ),
    )

    rendered_markdown = render_element_detail_markdown(updated_object)
    reparsed_object = parse_element_detail_markdown(rendered_markdown, target, elements_markdown)

    assert "## Stable Profile" in rendered_markdown
    assert "### Chapter 8 — June 28, 1998" in rendered_markdown
    assert reparsed_object.model_dump() == updated_object.model_dump()


def test_render_event_detail_markdown_round_trips_after_update() -> None:
    target = DetailTarget(
        uuid="evt_cloth123",
        summary="Mira discovers the cloth bundle",
        file="events/evt_cloth123.md",
        delta_action="update",
        update_context="Clarify the event consequences.",
    )
    current_markdown = """# Mira discovers the cloth bundle

## Identification
- UUID: evt_cloth123
- When: June 28, 1998, 7:15 a.m.
- Chapters: Chapter 8
- Summary: Mira discovers the cloth bundle

## Core Understanding
Mira finds an unexpected cloth bundle waiting at the altar.

## Causal Context
- Mira begins the day opening the chapel.

## Consequences & Ripple Effects
- The discovery raises suspicion around the altar.

## Participants & Roles
- Mira | witness

## Evidence & Grounding
- "cloth bundle"

## Open Threads
- Who left it there?
"""
    events_markdown = (
        "# Events\n\n## Entries\n"
        "- evt_cloth123 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira discovers the cloth bundle\n"
    )
    current_object = parse_event_detail_markdown(current_markdown, target, events_markdown)
    updated_object = apply_event_file_update(
        current_object,
        EventFileUpdateProposal(
            changed=True,
            rationale="Adds the witness implications.",
            consequences_to_add=["Mira now has evidence that someone entered before her."],
            participants_to_add=["Unknown intruder | absent-but-relevant"],
            open_threads_to_add=["Was the bundle a warning or a delivery?"],
            approval_message="Ready to apply the update.",
        ),
    )

    rendered_markdown = render_event_detail_markdown(updated_object)
    reparsed_object = parse_event_detail_markdown(rendered_markdown, target, events_markdown)

    assert "## Consequences & Ripple Effects" in rendered_markdown
    assert "- Unknown intruder | absent-but-relevant" in rendered_markdown
    assert reparsed_object.model_dump() == updated_object.model_dump()


def test_parse_provenance_references_normalizes_section_casing() -> None:
    references = parse_provenance_references(
        """## Provenance
### Support
- object | Mira discovers the cloth bundle | story/chapter-08.story | "cloth bundle"
"""
    )

    assert [reference.section for reference in references] == ["OBJECT"]


def test_apply_event_file_update_accepts_lowercase_object_provenance_section() -> None:
    target = DetailTarget(
        uuid="evt_cloth123",
        summary="Mira discovers the cloth bundle",
        file="events/evt_cloth123.md",
        delta_action="update",
        update_context="Clarify the event consequences.",
    )
    current_markdown = """# Mira discovers the cloth bundle

## Identification
- UUID: evt_cloth123
- When: June 28, 1998, 7:15 a.m.
- Chapters: Chapter 8
- Summary: Mira discovers the cloth bundle

## Core Understanding
Mira finds an unexpected cloth bundle waiting at the altar.

## Causal Context
- Mira begins the day opening the chapel.

## Consequences & Ripple Effects
- The discovery raises suspicion around the altar.

## Participants & Roles
- Mira | witness

## Evidence & Grounding
- "cloth bundle"

## Open Threads
- Who left it there?
"""
    events_markdown = (
        "# Events\n\n## Entries\n"
        "- evt_cloth123 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira discovers the cloth bundle\n"
    )
    current_object = parse_event_detail_markdown(current_markdown, target, events_markdown)

    updated_object = apply_event_file_update(
        current_object,
        EventFileUpdateProposal(
            changed=True,
            rationale="Updates the event and preserves object provenance despite lowercase casing.",
            consequences_to_add=["Mira now has evidence that someone entered before her."],
            provenance_replacement=[
                'object | Mira discovers the cloth bundle | story/chapter-08.story | "cloth bundle"',
            ],
            approval_message="Ready to apply the update.",
        ),
    )

    assert [reference.section for reference in updated_object.provenance_references] == ["OBJECT"]


def test_apply_element_file_update_requires_explicit_provenance_replacement_when_existing_provenance_present() -> None:
    target = DetailTarget(
        uuid="elt_mira123",
        summary="Mira",
        file="elements/elt_mira123.md",
        delta_action="update",
        update_context="Clarify what Mira now knows.",
        kind=ElementKind.PERSON,
    )
    current_markdown = """# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness

## Core Understanding
Mira tends the chapel and notices irregularities quickly.

## Stable Profile
- Keeps watch over the chapel grounds.

## Interpretation
- Feels pressure to understand what changed.

## Knowledge / Beliefs / Uncertainties
- Suspects someone entered before dawn.

## Element-Centered Chronology
### Chapter 8 — June 28, 1998
- Finds the altar already disturbed.

## Open Threads
- Who entered first?

## Provenance
### Support
- OBJECT | Mira as chapel witness | story/chapter-08.story | "Mira paused at the altar"
"""
    elements_markdown = (
        "# Elements\n\n## Entries\n"
        "- person | Mira | elt_mira123 | Mira | chapel witness\n"
    )
    current_object = parse_element_detail_markdown(current_markdown, target, elements_markdown)

    with pytest.raises(ApiError) as exc_info:
        apply_element_file_update(
            current_object,
            ElementFileUpdateProposal(
                changed=True,
                rationale="Adds another supported knowledge bullet.",
                knowledge_to_add=["Believes the missing bundle was placed deliberately."],
                approval_message="Ready to apply the update.",
            ),
        )
    assert "provenance_replacement" in exc_info.value.message


def test_apply_event_file_update_requires_explicit_provenance_replacement_when_existing_provenance_present() -> None:
    target = DetailTarget(
        uuid="evt_cloth123",
        summary="Mira discovers the cloth bundle",
        file="events/evt_cloth123.md",
        delta_action="update",
        update_context="Clarify the event consequences.",
    )
    current_markdown = """# Mira discovers the cloth bundle

## Identification
- UUID: evt_cloth123
- When: June 28, 1998, 7:15 a.m.
- Chapters: Chapter 8
- Summary: Mira discovers the cloth bundle

## Core Understanding
Mira finds an unexpected cloth bundle waiting at the altar.

## Causal Context
- Mira begins the day opening the chapel.

## Consequences & Ripple Effects
- The discovery raises suspicion around the altar.

## Participants & Roles
- Mira | witness

## Evidence & Grounding
- "cloth bundle"

## Open Threads
- Who left it there?

## Provenance
### Support
- OBJECT | Mira discovers the cloth bundle | story/chapter-08.story | "cloth bundle"
"""
    events_markdown = (
        "# Events\n\n## Entries\n"
        "- evt_cloth123 | June 28, 1998, 7:15 a.m. | Chapter 8 | Mira discovers the cloth bundle\n"
    )
    current_object = parse_event_detail_markdown(current_markdown, target, events_markdown)

    with pytest.raises(ApiError) as exc_info:
        apply_event_file_update(
            current_object,
            EventFileUpdateProposal(
                changed=True,
                rationale="Adds a consequence without respecifying provenance.",
                consequences_to_add=["Mira now has evidence that someone entered before her."],
                approval_message="Ready to apply the update.",
            ),
        )
    assert "provenance_replacement" in exc_info.value.message
