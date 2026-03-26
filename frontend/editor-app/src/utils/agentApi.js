const DEFAULT_BACKEND_API_BASE = 'http://localhost:8000'
const REQUEST_TIMEOUT_MS = 120_000

export class ApiClientError extends Error {
  constructor({ errorCode, message, retryable, statusCode, details }) {
    super(message)
    this.name = 'ApiClientError'
    this.errorCode = errorCode
    this.retryable = retryable
    this.statusCode = statusCode
    this.details = details
  }
}

function getBackendApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_BACKEND_API_BASE ?? DEFAULT_BACKEND_API_BASE
  return configuredBaseUrl.replace(/\/+$/, '')
}

function isStructuredErrorResponse(responseBody) {
  if (!responseBody || typeof responseBody !== 'object') {
    return false
  }

  return typeof responseBody.error === 'string' && typeof responseBody.message === 'string'
}

async function parseJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function buildApiClientError(response, responseBody) {
  if (!isStructuredErrorResponse(responseBody)) {
    return new ApiClientError({
      errorCode: 'network_error',
      message: 'The backend returned an unreadable error response.',
      retryable: false,
      statusCode: response.status,
      details: null,
    })
  }

  return new ApiClientError({
    errorCode: responseBody.error,
    message: responseBody.message,
    retryable: Boolean(responseBody.retryable),
    statusCode: response.status,
    details: responseBody.details ?? null,
  })
}

function buildNetworkClientError({ errorCode, message, retryable = true }) {
  return new ApiClientError({
    errorCode,
    message,
    retryable,
    statusCode: null,
    details: null,
  })
}

function isAbortError(error) {
  return Boolean(error) && typeof error === 'object' && error.name === 'AbortError'
}

async function postJson(endpointPath, payload) {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${getBackendApiBaseUrl()}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const responseBody = await parseJsonResponse(response)

    if (!response.ok) {
      throw buildApiClientError(response, responseBody)
    }

    return responseBody
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error
    }

    if (isAbortError(error)) {
      throw buildNetworkClientError({
        errorCode: 'request_timeout',
        message: 'The backend request timed out after 120 seconds. Please try again.',
      })
    }

    throw buildNetworkClientError({
      errorCode: 'network_error',
      message: 'Could not reach the backend. Please try again.',
    })
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function proposeEventsIndex(payload) {
  return postJson('/harness/events-index/propose', payload)
}

export async function applyEventsIndex(payload) {
  return postJson('/harness/events-index/apply', payload)
}
