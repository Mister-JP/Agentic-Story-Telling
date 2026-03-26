import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  applyEventsIndex,
  proposeEventsIndex,
} from '../../src/utils/agentApi.js'

describe('agentApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON for successful responses', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: {
          scan_summary: 'Stub response',
          deltas: [],
        },
      }),
    })

    const responseBody = await proposeEventsIndex({
      diff_text: '+ Added line',
      events_md: '# Events',
      history: [],
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(responseBody.proposal.scan_summary).toBe('Stub response')
  })

  it('posts to the events apply endpoint and returns the apply payload', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        actions: ['Created event evt_stub123.'],
        detail_files: {
          evt_stub123: '# Stub event',
        },
        events_md: '# Events\n\n## Entries\n- evt_stub123 | June 28, 1998 | Chapter 8 | Stub event\n',
      }),
    })

    const responseBody = await applyEventsIndex({
      events_md: '# Events',
      proposal: {
        scan_summary: 'Stub response',
        deltas: [],
      },
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/events-index/apply'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(responseBody.detail_files.evt_stub123).toBe('# Stub event')
  })

  it('throws a typed ApiClientError for structured error responses', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 504,
      json: vi.fn().mockResolvedValue({
        error: 'llm_timeout',
        message: 'The LLM call timed out after 120 seconds. Please try again.',
        retryable: true,
      }),
    })

    await expect(
      proposeEventsIndex({
        diff_text: '+ Added line',
        events_md: '# Events',
        history: [],
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiClientError',
        errorCode: 'llm_timeout',
        retryable: true,
        statusCode: 504,
      }),
    )
  })

  it('falls back to a network error when the backend response is unreadable', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    })

    let thrownError = null
    try {
      await proposeEventsIndex({
        diff_text: '+ Added line',
        events_md: '# Events',
        history: [],
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(ApiClientError)
    expect(thrownError.errorCode).toBe('network_error')
  })

  it('times out hung requests and throws a retryable timeout error', async () => {
    vi.useFakeTimers()
    fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const abortError = new Error('Request aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      })
    }))

    const responsePromise = proposeEventsIndex({
      diff_text: '+ Added line',
      events_md: '# Events',
      history: [],
    })
    const rejectionExpectation = expect(responsePromise).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiClientError',
        errorCode: 'request_timeout',
        retryable: true,
        statusCode: null,
      }),
    )

    await vi.advanceTimersByTimeAsync(120_000)

    await rejectionExpectation
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    )
  })
})
