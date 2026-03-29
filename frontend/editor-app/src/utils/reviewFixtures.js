import { REVIEW_STEPS } from './reviewSteps.js'

function buildBaseFixture(step) {
  return {
    attemptNumber: 2,
    changedFiles: [
      { fileId: 'chapter-08', fileName: 'chapter-08.story', filePath: 'story/chapter-08.story', status: 'modified' },
      { fileId: 'chapter-09', fileName: 'chapter-09.story', filePath: 'story/chapter-09.story', status: 'modified' },
    ],
    currentDetailIndex: 0,
    currentDetailMd: '',
    currentPreviewDiff: '',
    currentProposal: null,
    currentUpdatedDetailMd: '',
    detailTargets: [],
    elementDetailTargets: [],
    elementsMd: '# Elements\n\n## Entries\n- person | Mira | elt_mira123 | Mira | chapel witness\n- item | Brass Key | elt_key222 | key | sacristy key\n- place | Saint Alder Chapel | elt_chapel999 | chapel | altar nave crypt\n',
    error: null,
    eventDetailTargets: [],
    eventsMd: '# Events\n\n## Entries\n- evt_arrival777 | June 28, 1998, dawn | Chapter 8 | Mira arrives at Saint Alder Chapel\n- evt_discovery888 | June 28, 1998, morning | Chapter 8 | Mira discovers the hidden ledger\n',
    isLoading: false,
    loadingAction: null,
    selectedFileIds: ['chapter-08', 'chapter-09'],
    step,
  }
}

function buildElementsIndexFixture() {
  return {
    ...buildBaseFixture(REVIEW_STEPS.ELEMENTS_INDEX),
    currentProposal: {
      approval_message: 'Review the element proposal.',
      diff_summary: 'Large chapter revisions introduced one new place, tightened two existing dossiers, and removed one stale artifact.',
      identified_elements: [
        {
          action: 'create',
          aliases: ['vestry hatch'],
          display_name: 'South Vestry Hatch',
          evidence_from_diff: ['She slipped through the south vestry hatch before the bells rang.'],
          identification_keys: ['south vestry hatch'],
          is_new: true,
          kind: 'place',
          matched_existing_display_name: null,
          matched_existing_uuid: null,
          provenance_summary: 'Adds a new persistent location that now affects movement through the chapel.',
          snapshot: 'A newly named access point in the chapel complex.',
          update_instruction: 'Create a new place row for the hatch.',
        },
        {
          action: 'update',
          aliases: ['Mira'],
          display_name: 'Mira',
          evidence_from_diff: ['Mira now hides the ledger key from Tomas.'],
          identification_keys: ['chapel witness', 'keeper of the ledger key'],
          is_new: false,
          kind: 'person',
          matched_existing_display_name: 'Mira',
          matched_existing_uuid: 'elt_mira123',
          provenance_summary: 'Extends Mira with durable responsibility for the ledger key.',
          snapshot: 'Her role sharpens from witness to active keeper of evidence.',
          update_instruction: 'Update Mira to reflect her new responsibility for the ledger key.',
        },
        {
          action: 'update',
          aliases: ['key'],
          display_name: 'Brass Key',
          evidence_from_diff: ['The brass key now opens the vestry hatch, not the crypt gate.'],
          identification_keys: ['sacristy key', 'vestry hatch key'],
          is_new: false,
          kind: 'item',
          matched_existing_display_name: 'Brass Key',
          matched_existing_uuid: 'elt_key222',
          provenance_summary: 'Changes the key’s canonical function.',
          snapshot: 'The key is re-grounded to a different lock and location.',
          update_instruction: 'Update the Brass Key row to reflect the new lock it opens.',
        },
        {
          action: 'delete',
          aliases: ['silver censer'],
          display_name: 'Silver Censer',
          evidence_from_diff: ['The scene no longer references the censer anywhere in the chapel sequence.'],
          identification_keys: ['censer'],
          is_new: false,
          kind: 'item',
          matched_existing_display_name: 'Silver Censer',
          matched_existing_uuid: 'elt_censer555',
          provenance_summary: 'No surviving support remains for this object in the current chapter set.',
          snapshot: 'A previously tracked object appears unsupported after the manuscript revision.',
          update_instruction: 'Delete the stale Silver Censer row if the support is truly gone.',
        },
      ],
      rationale: 'The revised manuscript clarifies durable world state, especially around chapel navigation and possession of key evidence.',
    },
  }
}

function buildElementDetailFixture() {
  return {
    ...buildBaseFixture(REVIEW_STEPS.ELEMENT_DETAILS),
    currentDetailMd: `# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness

## Core Understanding
Mira is a witness who arrives at Saint Alder Chapel and notices strange details in the sanctuary.

## Stable Profile
- Watches the chapel carefully.

## Interpretation
- Mira senses that the chapel is withholding something important.

## Knowledge / Beliefs / Uncertainties
- Believes the chapel ledger matters.

## Element-Centered Chronology
### Chapter 8 — June 28, 1998
- Arrives at the chapel before sunrise.

## Open Threads
- Does not yet know who moved the ledger.
`,
    currentPreviewDiff: '--- a/elements/elt_mira123.md\n+++ b/elements/elt_mira123.md\n@@\n-## Stable Profile\n-- Watches the chapel carefully.\n+## Stable Profile\n+- Keeps custody of the brass key after the vestry scene.',
    currentProposal: {
      chronology_blocks_to_add: [
        {
          entries: ['Takes custody of the brass key after discovering Tomas near the vestry hatch.'],
          heading: 'Chapter 8 — June 28, 1998',
        },
      ],
      file_action: 'update',
      knowledge_to_add: ['Suspects Tomas knows more about the hidden ledger than he admits.'],
      open_threads_to_add: ['Why did Tomas let Mira keep the brass key?'],
      provenance_replacement: [
        'OBJECT | Mira keeps custody of the brass key. | story/chapter-08.story | Mira closed her hand around the brass key and did not return it.',
      ],
      rationale: 'The revised chapter turns Mira from passive witness into the keeper of a specific piece of evidence.',
      stable_profile_to_add: ['Keeps custody of the brass key after the vestry scene.'],
    },
    currentUpdatedDetailMd: `# Mira

## Identification
- UUID: elt_mira123
- Type: person
- Canonical name: Mira
- Aliases: Mira
- Identification keys: chapel witness; keeper of the ledger key

## Core Understanding
Mira is no longer just a witness at Saint Alder Chapel. The revised chapter makes her the active keeper of the brass key tied to the ledger mystery.

## Stable Profile
- Watches the chapel carefully.
- Keeps custody of the brass key after the vestry scene.

## Interpretation
- Mira senses that the chapel is withholding something important.
- Her control of the key gives her a more active role in the investigation.

## Knowledge / Beliefs / Uncertainties
- Believes the chapel ledger matters.
- Suspects Tomas knows more about the hidden ledger than he admits.

## Element-Centered Chronology
### Chapter 8 — June 28, 1998
- Arrives at the chapel before sunrise.
- Takes custody of the brass key after discovering Tomas near the vestry hatch.

## Open Threads
- Does not yet know who moved the ledger.
- Why did Tomas let Mira keep the brass key?

## Provenance
- OBJECT | Mira keeps custody of the brass key. | story/chapter-08.story | Mira closed her hand around the brass key and did not return it.
`,
    detailTargets: [
      {
        delta_action: 'update',
        file: 'elements/elt_mira123.md',
        provenance_summary: 'Mira now holds key evidence directly.',
        summary: 'Mira',
        update_context: 'Update Mira to reflect her new responsibility for the brass key and the ledger mystery.',
        uuid: 'elt_mira123',
      },
    ],
    elementDetailTargets: [
      {
        delta_action: 'update',
        file: 'elements/elt_mira123.md',
        provenance_summary: 'Mira now holds key evidence directly.',
        summary: 'Mira',
        update_context: 'Update Mira to reflect her new responsibility for the brass key and the ledger mystery.',
        uuid: 'elt_mira123',
      },
    ],
  }
}

export function getReviewFixture(search) {
  const params = new URLSearchParams(search)
  const fixtureName = params.get('reviewFixture')

  if (fixtureName === 'elements-index') {
    return buildElementsIndexFixture()
  }

  if (fixtureName === 'element-detail') {
    return buildElementDetailFixture()
  }

  return null
}
