export const REVIEW_STEPS = Object.freeze({
  DIFF_PREVIEW: 'diff-preview',
  EVENTS_INDEX: 'events-index',
  ELEMENTS_INDEX: 'elements-index',
  ELEMENT_DETAILS: 'element-details',
  EVENT_DETAILS: 'event-details',
  COMPLETE: 'complete',
})

export const REVIEW_STEP_VALUES = Object.freeze(Object.values(REVIEW_STEPS))

export const INDEX_REVIEW_STEP_VALUES = Object.freeze([
  REVIEW_STEPS.EVENTS_INDEX,
  REVIEW_STEPS.ELEMENTS_INDEX,
])

export const DETAIL_REVIEW_STEP_VALUES = Object.freeze([
  REVIEW_STEPS.ELEMENT_DETAILS,
  REVIEW_STEPS.EVENT_DETAILS,
])

const REVIEW_STEP_ORDER = Object.freeze({
  [REVIEW_STEPS.DIFF_PREVIEW]: -1,
  [REVIEW_STEPS.EVENTS_INDEX]: 0,
  [REVIEW_STEPS.ELEMENTS_INDEX]: 1,
  [REVIEW_STEPS.ELEMENT_DETAILS]: 2,
  [REVIEW_STEPS.EVENT_DETAILS]: 3,
  [REVIEW_STEPS.COMPLETE]: 4,
})

const REVIEW_STEP_PROGRESS = Object.freeze({
  [REVIEW_STEPS.DIFF_PREVIEW]: -1,
  [REVIEW_STEPS.EVENTS_INDEX]: 0,
  [REVIEW_STEPS.ELEMENTS_INDEX]: 1,
  [REVIEW_STEPS.ELEMENT_DETAILS]: 2,
  [REVIEW_STEPS.EVENT_DETAILS]: 3,
  [REVIEW_STEPS.COMPLETE]: 4,
})

export function isIndexReviewStep(step) {
  return INDEX_REVIEW_STEP_VALUES.includes(step)
}

export function isDetailReviewStep(step) {
  return DETAIL_REVIEW_STEP_VALUES.includes(step)
}

export function getReviewStepperActive(step) {
  return REVIEW_STEP_PROGRESS[step] ?? -1
}

export function getReviewStepStatus(currentStep, targetStep) {
  const currentProgress = getReviewStepperActive(currentStep)
  const targetProgress = REVIEW_STEP_ORDER[targetStep]

  if (targetProgress === undefined) {
    return 'pending'
  }

  if (currentProgress === targetProgress) {
    return 'active'
  }

  if (currentProgress > targetProgress) {
    return 'completed'
  }

  return 'pending'
}

export function getIndexReviewStepperActive(step) {
  return getReviewStepperActive(step)
}

export function getIndexReviewStepStatus(currentStep, targetStep) {
  return getReviewStepStatus(currentStep, targetStep)
}
