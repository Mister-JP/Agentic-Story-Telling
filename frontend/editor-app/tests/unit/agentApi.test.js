import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiClientError,
  applyElementsIndex,
  applyEventsIndex,
  getLlmSettings,
  proposeElementDetail,
  proposeElementsIndex,
  proposeEventDetail,
  proposeEventsIndex,
  updateLlmSettings,
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

  it('loads the current llm settings from the backend', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        backend_mode: 'real',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        timeout_seconds: 120,
        max_tokens: 8000,
        has_api_key: true,
      }),
    })

    const responseBody = await getLlmSettings()

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/settings/llm'),
      expect.objectContaining({
        method: 'GET',
      }),
    )
    expect(responseBody.provider).toBe('gemini')
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
      diff_text: '+ Added line',
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

  it('posts to the elements propose endpoint and returns the proposal payload', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: {
          diff_summary: 'Deterministic summary',
          rationale: 'Deterministic rationale',
          identified_elements: [],
          approval_message: 'Review the proposal.',
        },
      }),
    })

    const responseBody = await proposeElementsIndex({
      diff_text: '+ Added line',
      elements_md: '# Elements',
      history: [],
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/elements-index/propose'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(responseBody.proposal.diff_summary).toBe('Deterministic summary')
  })

  it('posts to the elements apply endpoint and returns the apply payload', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        actions: ['Created element elt_stub123: Cloth Bundle (item).'],
        detail_files: {
          elt_stub123: '# Cloth Bundle',
        },
        elements_md: '# Elements\n\n## Entries\n- item | Cloth Bundle | elt_stub123 | cloth bundle | altar evidence\n',
      }),
    })

    const responseBody = await applyElementsIndex({
      diff_text: '+ Added line',
      elements_md: '# Elements',
      proposal: {
        diff_summary: 'Deterministic summary',
        rationale: 'Deterministic rationale',
        identified_elements: [],
        approval_message: 'Review the proposal.',
      },
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/elements-index/apply'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(responseBody.detail_files.elt_stub123).toBe('# Cloth Bundle')
  })

  it('posts to the element detail endpoint and returns the merged detail payload', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: {
          file_action: 'update',
          rationale: 'Adds a chronology entry.',
          approval_message: 'Ready to review.',
        },
        preview_diff: '--- a/elements/elt_stub123.md',
        updated_detail_md: '# Cloth Bundle',
      }),
    })

    const responseBody = await proposeElementDetail({
      diff_text: '+ Added line',
      elements_md: '# Elements',
      events_md: '# Events',
      target: {
        uuid: 'elt_stub123',
        summary: 'Cloth Bundle',
        file: 'elements/elt_stub123.md',
        delta_action: 'create',
        update_context: 'Create the detail file.',
        kind: 'item',
      },
      current_detail_md: '',
      history: [],
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/element-detail/propose'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(responseBody.preview_diff).toContain('elt_stub123.md')
  })

  it('posts to the event detail endpoint and returns the merged detail payload', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        proposal: {
          file_action: 'no_change',
          rationale: 'No change needed.',
          approval_message: 'Ready to review.',
        },
        preview_diff: '',
        updated_detail_md: '# Event detail',
      }),
    })

    const responseBody = await proposeEventDetail({
      diff_text: '+ Added line',
      events_md: '# Events',
      target: {
        uuid: 'evt_stub123',
        summary: 'Cloth bundle arrives',
        file: 'events/evt_stub123.md',
        delta_action: 'update',
        update_context: 'Keep the file unchanged.',
      },
      current_detail_md: '# Event detail',
      history: [],
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/event-detail/propose'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(responseBody.updated_detail_md).toBe('# Event detail')
  })

  it('posts updated llm settings to the backend', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        backend_mode: 'real',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
        timeout_seconds: 45,
        max_tokens: 4096,
        has_api_key: true,
      }),
    })

    const responseBody = await updateLlmSettings({
      backend_mode: 'real',
      provider: 'gemini',
      api_key: 'test-key',
      model: 'gemini-2.5-flash',
      base_url: '',
      timeout_seconds: 45,
      max_tokens: 4096,
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/harness/settings/llm'),
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(responseBody.max_tokens).toBe(4096)
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
