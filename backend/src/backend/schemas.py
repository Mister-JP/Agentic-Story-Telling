from __future__ import annotations

from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, BeforeValidator, model_validator


def sanitize_required_text(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Value must be a string.")

    sanitized_value = value.strip()
    if sanitized_value == "":
        raise ValueError("Value must not be empty.")
    return sanitized_value


def sanitize_text(value: Any) -> str:
    if value is None:
        return ""

    if not isinstance(value, str):
        raise ValueError("Value must be a string.")
    return value.strip()


def sanitize_optional_text(value: Any) -> str | None:
    if value is None:
        return None

    sanitized_value = sanitize_text(value)
    if sanitized_value == "":
        return None
    return sanitized_value


def sanitize_text_list(value: Any) -> list[str]:
    if value is None:
        return []

    if not isinstance(value, list):
        raise ValueError("Value must be a list.")

    sanitized_items: list[str] = []
    for item in value:
        sanitized_item = sanitize_text(item)
        if sanitized_item != "":
            sanitized_items.append(sanitized_item)
    return sanitized_items


RequiredText = Annotated[str, BeforeValidator(sanitize_required_text)]
Text = Annotated[str, BeforeValidator(sanitize_text)]
OptionalText = Annotated[str | None, BeforeValidator(sanitize_optional_text)]
TextList = Annotated[list[str], BeforeValidator(sanitize_text_list)]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HistoryEntry(ContractModel):
    attempt_number: int = Field(ge=1)
    previous_output: RequiredText
    reviewer_feedback: RequiredText


class EventDeltaAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class EventDelta(ContractModel):
    action: EventDeltaAction
    existing_event_uuid: OptionalText = None
    when: Text = ""
    chapters: Text = ""
    summary: Text = ""
    reason: RequiredText
    evidence_from_diff: TextList = Field(default_factory=list)
    provenance_summary: Text = ""

    @model_validator(mode="after")
    def validate_shape(self) -> "EventDelta":
        if self.action == EventDeltaAction.CREATE and self.existing_event_uuid is not None:
            raise ValueError("existing_event_uuid must be null for create.")

        if self.action == EventDeltaAction.CREATE and self.summary == "":
            raise ValueError("summary is required for create.")

        if self.action in {EventDeltaAction.UPDATE, EventDeltaAction.DELETE} and self.existing_event_uuid is None:
            raise ValueError(f"existing_event_uuid is required for {self.action.value}.")

        if self.action == EventDeltaAction.UPDATE and self.summary == "":
            raise ValueError("summary is required for update.")

        return self


class EventAgentOutput(ContractModel):
    scan_summary: RequiredText
    deltas: list[EventDelta] = Field(default_factory=list)


class ElementProposalAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class ElementKind(str, Enum):
    PERSON = "person"
    PLACE = "place"
    ITEM = "item"
    ANIMAL = "animal"
    RELATIONSHIP = "relationship"
    CONCEPT = "concept"
    GROUP = "group"
    OTHER = "other"

    def __str__(self) -> str:
        return self.value


class ElementDecision(ContractModel):
    action: ElementProposalAction
    display_name: RequiredText
    kind: ElementKind
    aliases: TextList = Field(default_factory=list)
    identification_keys: TextList = Field(default_factory=list)
    snapshot: RequiredText
    update_instruction: RequiredText
    evidence_from_diff: TextList = Field(default_factory=list)
    provenance_summary: Text = ""
    matched_existing_display_name: OptionalText = None
    matched_existing_uuid: OptionalText = None
    is_new: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_shape(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        if "action" not in value:
            if value.get("is_new") is True:
                value["action"] = ElementProposalAction.CREATE.value
            elif value.get("is_new") is False:
                value["action"] = ElementProposalAction.UPDATE.value
            elif value.get("matched_existing_uuid"):
                value["action"] = ElementProposalAction.UPDATE.value
            elif value.get("matched_existing_display_name"):
                value["action"] = ElementProposalAction.UPDATE.value
            else:
                # Default ambiguous legacy shapes to create so downstream apply can still
                # resolve them against an existing canonical element by name or alias.
                value["action"] = ElementProposalAction.CREATE.value

        if "is_new" not in value and value.get("action") is not None:
            value["is_new"] = value["action"] == ElementProposalAction.CREATE.value

        return value

    @model_validator(mode="after")
    def validate_shape(self) -> "ElementDecision":
        if self.action == ElementProposalAction.CREATE and self.matched_existing_uuid is not None:
            raise ValueError("matched_existing_uuid must be null for create.")

        if self.action == ElementProposalAction.DELETE and self.matched_existing_uuid is None:
            raise ValueError(f"matched_existing_uuid is required for {self.action.value}.")

        if self.is_new is None:
            self.is_new = self.action == ElementProposalAction.CREATE
        elif self.is_new != (self.action == ElementProposalAction.CREATE):
            raise ValueError("is_new must match action.")

        return self


class ElementsProposal(ContractModel):
    diff_summary: RequiredText
    rationale: RequiredText
    identified_elements: list[ElementDecision] = Field(default_factory=list)
    approval_message: RequiredText


class DetailTarget(ContractModel):
    uuid: RequiredText
    summary: RequiredText
    file: RequiredText
    delta_action: RequiredText
    update_context: RequiredText
    provenance_summary: Text = ""
    kind: ElementKind | None = None


class ChronologyBlockUpdate(ContractModel):
    heading: RequiredText
    entries: TextList = Field(default_factory=list)


class DetailFileAction(str, Enum):
    NO_CHANGE = "no_change"
    UPDATE = "update"
    DELETE = "delete"


class ElementFileUpdateProposal(ContractModel):
    file_action: DetailFileAction
    changed: bool | None = None
    rationale: RequiredText
    retention_reason: OptionalText = None
    core_understanding_replacement: OptionalText = None
    stable_profile_to_add: TextList = Field(default_factory=list)
    stable_profile_to_remove: TextList = Field(default_factory=list)
    interpretation_to_add: TextList = Field(default_factory=list)
    interpretation_to_remove: TextList = Field(default_factory=list)
    knowledge_to_add: TextList = Field(default_factory=list)
    knowledge_to_remove: TextList = Field(default_factory=list)
    chronology_blocks_to_add: list[ChronologyBlockUpdate] = Field(default_factory=list)
    chronology_blocks_to_remove: list[ChronologyBlockUpdate] = Field(default_factory=list)
    open_threads_to_add: TextList = Field(default_factory=list)
    open_threads_to_remove: TextList = Field(default_factory=list)
    provenance_replacement: TextList = Field(default_factory=list)
    approval_message: RequiredText

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_shape(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        if "file_action" not in value:
            changed = bool(value.get("changed"))
            value["file_action"] = DetailFileAction.UPDATE.value if changed else DetailFileAction.NO_CHANGE.value
        return value

    @model_validator(mode="after")
    def normalize_changed_flag(self) -> "ElementFileUpdateProposal":
        if self.changed is None:
            self.changed = self.file_action != DetailFileAction.NO_CHANGE
        return self


class EventFileUpdateProposal(ContractModel):
    file_action: DetailFileAction
    changed: bool | None = None
    rationale: RequiredText
    retention_reason: OptionalText = None
    core_understanding_replacement: OptionalText = None
    causal_context_to_add: TextList = Field(default_factory=list)
    causal_context_to_remove: TextList = Field(default_factory=list)
    consequences_to_add: TextList = Field(default_factory=list)
    consequences_to_remove: TextList = Field(default_factory=list)
    participants_to_add: TextList = Field(default_factory=list)
    participants_to_remove: TextList = Field(default_factory=list)
    evidence_to_add: TextList = Field(default_factory=list)
    evidence_to_remove: TextList = Field(default_factory=list)
    open_threads_to_add: TextList = Field(default_factory=list)
    open_threads_to_remove: TextList = Field(default_factory=list)
    provenance_replacement: TextList = Field(default_factory=list)
    approval_message: RequiredText

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_shape(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        if "file_action" not in value:
            changed = bool(value.get("changed"))
            value["file_action"] = DetailFileAction.UPDATE.value if changed else DetailFileAction.NO_CHANGE.value
        return value

    @model_validator(mode="after")
    def normalize_changed_flag(self) -> "EventFileUpdateProposal":
        if self.changed is None:
            self.changed = self.file_action != DetailFileAction.NO_CHANGE
        return self


class EventsIndexProposeRequest(ContractModel):
    diff_text: RequiredText
    events_md: Text
    current_detail_files: dict[str, str] = Field(default_factory=dict)
    history: list[HistoryEntry] = Field(default_factory=list)


class EventsIndexProposeResponse(ContractModel):
    proposal: EventAgentOutput


class EventsIndexApplyRequest(ContractModel):
    diff_text: RequiredText
    events_md: Text
    current_detail_files: dict[str, str] = Field(default_factory=dict)
    proposal: EventAgentOutput


class EventsIndexApplyResponse(ContractModel):
    events_md: Text
    detail_files: dict[str, str] = Field(default_factory=dict)
    detail_targets: list[DetailTarget] = Field(default_factory=list)
    actions: TextList = Field(default_factory=list)


class ElementsIndexProposeRequest(ContractModel):
    diff_text: RequiredText
    elements_md: Text
    current_detail_files: dict[str, str] = Field(default_factory=dict)
    history: list[HistoryEntry] = Field(default_factory=list)


class ElementsIndexProposeResponse(ContractModel):
    proposal: ElementsProposal


class ElementsIndexApplyRequest(ContractModel):
    diff_text: RequiredText
    elements_md: Text
    current_detail_files: dict[str, str] = Field(default_factory=dict)
    proposal: ElementsProposal


class ElementsIndexApplyResponse(ContractModel):
    elements_md: Text
    detail_files: dict[str, str] = Field(default_factory=dict)
    detail_targets: list[DetailTarget] = Field(default_factory=list)
    actions: TextList = Field(default_factory=list)


class ElementDetailProposeRequest(ContractModel):
    diff_text: RequiredText
    elements_md: Text
    events_md: Text
    target: DetailTarget
    current_detail_md: Text
    history: list[HistoryEntry] = Field(default_factory=list)


class ElementDetailProposeResponse(ContractModel):
    proposal: ElementFileUpdateProposal
    preview_diff: Text
    updated_detail_md: Text


class EventDetailProposeRequest(ContractModel):
    diff_text: RequiredText
    events_md: Text
    target: DetailTarget
    current_detail_md: Text
    history: list[HistoryEntry] = Field(default_factory=list)


class EventDetailProposeResponse(ContractModel):
    proposal: EventFileUpdateProposal
    preview_diff: Text
    updated_detail_md: Text


class ErrorResponse(ContractModel):
    error: RequiredText
    message: RequiredText
    retryable: bool
    details: Any | None = None


class BackendMode(str, Enum):
    STUB = "stub"
    REAL = "real"


class LlmProvider(str, Enum):
    GROQ = "groq"
    GEMINI = "gemini"
    CUSTOM = "custom"


class LlmSettingsResponse(ContractModel):
    backend_mode: BackendMode
    provider: LlmProvider
    model: Text = ""
    base_url: Text = ""
    timeout_seconds: int = Field(ge=1)
    max_tokens: int = Field(ge=1)
    has_api_key: bool


class LlmSettingsUpdateRequest(ContractModel):
    backend_mode: BackendMode
    provider: LlmProvider
    api_key: OptionalText = None
    model: Text = ""
    base_url: Text = ""
    timeout_seconds: int = Field(ge=1)
    max_tokens: int = Field(ge=1)
