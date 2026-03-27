from __future__ import annotations

import pytest

from backend.errors import ApiError
from backend.schemas import ElementDecision, ElementKind, ElementsProposal, HistoryEntry
from backend.services.elements_index_logic import (
    apply_elements_proposal,
    audit_elements_coverage,
    build_elements_index_proposal,
    build_uuid,
    parse_elements_index,
    propose_elements_index_with_audit,
    resolve_existing_element,
)


def build_proposal(*identified_elements: ElementDecision) -> ElementsProposal:
    return ElementsProposal(
        diff_summary="Deterministic summary.",
        rationale="Deterministic rationale.",
        identified_elements=list(identified_elements),
        approval_message="Review the proposal.",
    )


def test_resolve_existing_element_matches_by_alias_and_identification_key() -> None:
    existing_index = parse_elements_index(
        "# Elements\n\n## Entries\n"
        "- place | Saint Alder Chapel | elt_chapel123 | chapel, Saint Alder Chapel | site of the disappearance; riverside chapel\n"
    )
    alias_candidate = ElementDecision(
        display_name="The Chapel",
        kind=ElementKind.PLACE,
        aliases=["chapel"],
        identification_keys=[],
        snapshot="Alias match.",
        update_instruction="Update the chapel.",
        evidence_from_diff=["The chapel doors were open."],
        matched_existing_display_name=None,
        matched_existing_uuid=None,
        is_new=False,
    )
    key_candidate = alias_candidate.model_copy(
        update={
            "display_name": "Mystery Site",
            "aliases": [],
            "identification_keys": ["site of the disappearance"],
        }
    )

    assert resolve_existing_element(existing_index, alias_candidate).uuid == "elt_chapel123"
    assert resolve_existing_element(existing_index, key_candidate).uuid == "elt_chapel123"


def test_parse_elements_index_rejects_blank_uuid_records_with_display_name() -> None:
    with pytest.raises(ApiError) as error:
        parse_elements_index(
            "# Elements\n\n## Entries\n"
            "- item | Broken Entry |  | broken alias | malformed identifier\n"
        )

    assert error.value.error == "parse_error"
    assert error.value.retryable is False
    assert error.value.details == ['Element index entry "Broken Entry" is missing a UUID.']


def test_parse_elements_index_rejects_blank_uuid_records_by_entry_order_when_name_is_missing() -> None:
    with pytest.raises(ApiError) as error:
        parse_elements_index(
            "# Elements\n\n## Entries\n"
            "- item |  |  | broken alias | malformed identifier\n"
        )

    assert error.value.error == "parse_error"
    assert error.value.retryable is False
    assert error.value.details == ["Element index entry 1 is missing a UUID."]


def test_resolve_existing_element_skips_ambiguous_alias_matches() -> None:
    existing_index = parse_elements_index(
        "# Elements\n\n## Entries\n"
        "- place | Home | elt_home_place | home | family estate\n"
        "- group | Home | elt_home_group | home | household faction\n"
    )
    candidate = ElementDecision(
        display_name="Unknown Home",
        kind=ElementKind.PLACE,
        aliases=["home"],
        identification_keys=[],
        snapshot="Ambiguous alias should not resolve automatically.",
        update_instruction="Require a clearer match.",
        evidence_from_diff=["They returned home."],
        matched_existing_display_name=None,
        matched_existing_uuid=None,
        is_new=False,
    )

    assert resolve_existing_element(existing_index, candidate) is None


def test_apply_elements_proposal_dedupes_aliases_with_normalized_matching() -> None:
    proposal = build_proposal(
        ElementDecision(
            display_name="Mira",
            kind=ElementKind.PERSON,
            aliases=["sister-mira", "Mira Vale"],
            identification_keys=["chapel witness"],
            snapshot="Existing person.",
            update_instruction="Merge aliases and keys.",
            evidence_from_diff=["Mira returned to the chapel."],
            matched_existing_display_name="Mira",
            matched_existing_uuid="elt_mira123",
            is_new=False,
        )
    )

    apply_result = apply_elements_proposal(
        "# Elements\n\n## Entries\n"
        "- person | Mira | elt_mira123 | Mira, Sister Mira | carries the silver key\n",
        proposal,
    )

    parsed_result = parse_elements_index(apply_result.index_markdown)

    assert "Mira, Sister Mira, Mira Vale" in apply_result.index_markdown
    assert "carries the silver key; chapel witness" in apply_result.index_markdown
    assert parsed_result.records_by_uuid["elt_mira123"].aliases == ["Mira", "Sister Mira", "Mira Vale"]


def test_propose_elements_index_retries_once_after_audit_feedback() -> None:
    calls: list[list[str]] = []

    def fake_builder(_diff_text, _existing_index, history):
        calls.append([entry.reviewer_feedback for entry in history])
        if len(calls) == 1:
            return build_proposal(
                ElementDecision(
                    display_name="Cloth Bundle",
                    kind=ElementKind.ITEM,
                    aliases=["cloth bundle"],
                    identification_keys=["altar evidence"],
                    snapshot="New item.",
                    update_instruction="Track the bundle.",
                    evidence_from_diff=["Mira found a cloth bundle."],
                    matched_existing_display_name=None,
                    matched_existing_uuid=None,
                    is_new=True,
                )
            )

        return build_proposal(
            ElementDecision(
                display_name="Mira",
                kind=ElementKind.PERSON,
                aliases=[],
                identification_keys=[],
                snapshot="Existing person.",
                update_instruction="Carry the new evidence into detail review.",
                evidence_from_diff=["Mira found a cloth bundle."],
                matched_existing_display_name="Mira",
                matched_existing_uuid="elt_mira123",
                is_new=False,
            )
        )

    proposal = propose_elements_index_with_audit(
        diff_text="--- a/chapter.story\n+++ b/chapter.story\n+Mira found a cloth bundle.\n",
        elements_markdown="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n",
        history=[],
        proposal_builder=fake_builder,
    )

    assert len(calls) == 2
    assert len(calls[0]) == 0
    assert "Coverage gap" in calls[1][0]
    assert proposal.identified_elements[0].matched_existing_uuid == "elt_mira123"
    assert audit_elements_coverage(
        proposal,
        parse_elements_index("# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n"),
        "--- a/chapter.story\n+++ b/chapter.story\n+Mira found a cloth bundle.\n",
    ) == []


def test_propose_elements_index_returns_first_proposal_when_audit_passes() -> None:
    calls: list[list[str]] = []

    def fake_builder(_diff_text, _existing_index, history):
        calls.append([entry.reviewer_feedback for entry in history])
        return build_proposal(
            ElementDecision(
                display_name="Mira",
                kind=ElementKind.PERSON,
                aliases=[],
                identification_keys=[],
                snapshot="Existing person.",
                update_instruction="Carry the new evidence into detail review.",
                evidence_from_diff=["Mira found a cloth bundle."],
                matched_existing_display_name="Mira",
                matched_existing_uuid="elt_mira123",
                is_new=False,
            )
        )

    proposal = propose_elements_index_with_audit(
        diff_text="--- a/chapter.story\n+++ b/chapter.story\n+Mira found a cloth bundle.\n",
        elements_markdown="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n",
        history=[],
        proposal_builder=fake_builder,
    )

    assert len(calls) == 1
    assert calls[0] == []
    assert proposal.identified_elements[0].matched_existing_uuid == "elt_mira123"


def test_propose_elements_index_preserves_existing_history_when_audit_retries() -> None:
    calls: list[list[HistoryEntry]] = []

    def fake_builder(_diff_text, _existing_index, history):
        calls.append(list(history))
        if len(calls) == 1:
            return build_proposal(
                ElementDecision(
                    display_name="Cloth Bundle",
                    kind=ElementKind.ITEM,
                    aliases=["cloth bundle"],
                    identification_keys=["altar evidence"],
                    snapshot="New item.",
                    update_instruction="Track the bundle.",
                    evidence_from_diff=["Mira found a cloth bundle."],
                    matched_existing_display_name=None,
                    matched_existing_uuid=None,
                    is_new=True,
                )
            )

        return build_proposal(
            ElementDecision(
                display_name="Mira",
                kind=ElementKind.PERSON,
                aliases=[],
                identification_keys=[],
                snapshot="Existing person.",
                update_instruction="Carry the new evidence into detail review.",
                evidence_from_diff=["Mira found a cloth bundle."],
                matched_existing_display_name="Mira",
                matched_existing_uuid="elt_mira123",
                is_new=False,
            )
        )

    proposal = propose_elements_index_with_audit(
        diff_text="--- a/chapter.story\n+++ b/chapter.story\n+Mira found a cloth bundle.\n",
        elements_markdown="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n",
        history=[
            HistoryEntry(
                attempt_number=1,
                previous_output='{"identified_elements":[]}',
                reviewer_feedback="Writer asked for a more precise proposal.",
            )
        ],
        proposal_builder=fake_builder,
    )

    assert len(calls) == 2
    assert len(calls[0]) == 1
    assert len(calls[1]) == 2
    assert calls[1][0].reviewer_feedback == "Writer asked for a more precise proposal."
    assert "Coverage gap" in calls[1][1].reviewer_feedback
    assert proposal.identified_elements[0].matched_existing_uuid == "elt_mira123"


def test_apply_elements_proposal_returns_stable_action_strings_and_creates_details_for_new_records() -> None:
    proposal = build_proposal(
        ElementDecision(
            display_name="Mira",
            kind=ElementKind.PERSON,
            aliases=["Mira Vale"],
            identification_keys=["chapel witness"],
            snapshot="Existing person.",
            update_instruction="Merge aliases and keys.",
            evidence_from_diff=["Mira opened the chapel door."],
            matched_existing_display_name="Mira",
            matched_existing_uuid="elt_mira123",
            is_new=False,
        ),
        ElementDecision(
            display_name="Cloth Bundle",
            kind=ElementKind.ITEM,
            aliases=["cloth bundle", "stained bundle"],
            identification_keys=["altar evidence"],
            snapshot="New evidence item.",
            update_instruction="Create the bundle entry.",
            evidence_from_diff=["A cloth bundle rested at the altar."],
            matched_existing_display_name=None,
            matched_existing_uuid=None,
            is_new=True,
        ),
    )

    apply_result = apply_elements_proposal(
        "# Elements\n\n## Entries\n"
        "- person | Mira | elt_mira123 | Mira | carries the silver key\n",
        proposal,
    )

    new_uuid = build_uuid("elt", "item", "Cloth Bundle")
    assert apply_result.actions == [
        "Updated element elt_mira123: Mira — merged aliases and identification keys.",
        f"Created element {new_uuid}: Cloth Bundle (item).",
    ]
    assert list(apply_result.detail_files) == [new_uuid]
    assert new_uuid in apply_result.index_markdown


def test_audit_elements_coverage_flags_explicit_existing_people_missing_from_proposal() -> None:
    existing_index = parse_elements_index(
        "# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n"
    )
    proposal = build_proposal(
        ElementDecision(
            display_name="Cloth Bundle",
            kind=ElementKind.ITEM,
            aliases=["cloth bundle"],
            identification_keys=["altar evidence"],
            snapshot="New item.",
            update_instruction="Track the bundle.",
            evidence_from_diff=["Mira found a cloth bundle."],
            matched_existing_display_name=None,
            matched_existing_uuid=None,
            is_new=True,
        )
    )

    feedback = audit_elements_coverage(
        proposal,
        existing_index,
        "--- a/chapter.story\n+++ b/chapter.story\n+Mira found a cloth bundle.\n",
    )

    assert len(feedback) == 1
    assert "Coverage gap" in feedback[0]


def test_audit_elements_coverage_flags_explicit_existing_items_missing_from_proposal() -> None:
    existing_index = parse_elements_index(
        "# Elements\n\n## Entries\n- item | Rosary Beads | elt_rosary123 | rosary, rosary beads | worn prayer beads\n"
    )
    proposal = build_proposal(
        ElementDecision(
            display_name="Mira",
            kind=ElementKind.PERSON,
            aliases=[],
            identification_keys=[],
            snapshot="Existing person.",
            update_instruction="Carry the new evidence into detail review.",
            evidence_from_diff=["Mira fingered the rosary beads."],
            matched_existing_display_name=None,
            matched_existing_uuid=None,
            is_new=False,
        )
    )

    feedback = audit_elements_coverage(
        proposal,
        existing_index,
        "--- a/chapter.story\n+++ b/chapter.story\n+Mira fingered the rosary beads before speaking.\n",
    )

    assert len(feedback) == 1
    assert "Coverage gap" in feedback[0]
    assert "existing item element(s) Rosary Beads" in feedback[0]


def test_build_elements_index_proposal_carries_explicit_existing_items_when_history_requests_existing_mentions() -> None:
    existing_index = parse_elements_index(
        "# Elements\n\n## Entries\n- item | Rosary Beads | elt_rosary123 | rosary, rosary beads | worn prayer beads\n"
    )

    proposal = build_elements_index_proposal(
        diff_text="--- a/chapter.story\n+++ b/chapter.story\n+Mira fingered the rosary beads before speaking.\n",
        existing_index=existing_index,
        history=[
            HistoryEntry(
                attempt_number=1,
                previous_output='{"identified_elements":[]}',
                reviewer_feedback="Coverage gap: include the existing item the diff names explicitly.",
            )
        ],
    )

    assert len(proposal.identified_elements) == 1
    assert proposal.identified_elements[0].display_name == "Rosary Beads"
    assert proposal.identified_elements[0].kind == ElementKind.ITEM
    assert proposal.identified_elements[0].matched_existing_uuid == "elt_rosary123"
    assert proposal.identified_elements[0].is_new is False


def test_propose_elements_index_raises_api_error_when_retry_is_still_not_audit_clean() -> None:
    def fake_builder(_diff_text, _existing_index, _history):
        return build_proposal(
            ElementDecision(
                display_name="Cloth Bundle",
                kind=ElementKind.ITEM,
                aliases=["cloth bundle"],
                identification_keys=["altar evidence"],
                snapshot="New item.",
                update_instruction="Track the bundle.",
                evidence_from_diff=["Mira found a cloth bundle."],
                matched_existing_display_name=None,
                matched_existing_uuid=None,
                is_new=True,
            )
        )

    with pytest.raises(ApiError) as error:
        propose_elements_index_with_audit(
            diff_text="--- a/chapter.story\n+++ b/chapter.story\n+Mira found a cloth bundle.\n",
            elements_markdown="# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | protagonist\n",
            history=[],
            proposal_builder=fake_builder,
        )

    assert error.value.error == "proposal_audit_failed"
    assert error.value.retryable is False
    assert "Coverage gap" in error.value.details[0]


def test_build_uuid_uses_kind_to_avoid_same_name_collisions_across_element_types() -> None:
    assert build_uuid("elt", "place", "Home") != build_uuid("elt", "group", "Home")
