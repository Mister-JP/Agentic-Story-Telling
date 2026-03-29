import {
  Button,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'

function buildDraft(settings) {
  return {
    backend_mode: settings?.backend_mode ?? 'stub',
    provider: settings?.provider ?? 'groq',
    model: settings?.model ?? '',
    base_url: settings?.base_url ?? '',
    timeout_seconds: String(settings?.timeout_seconds ?? 120),
    max_tokens: String(settings?.max_tokens ?? 8000),
  }
}

function providerSummary(provider) {
  if (provider === 'gemini') {
    return {
      title: 'Gemini',
      meta: 'Cheap, fast, and OpenAI-compatible through Google’s compatibility endpoint.',
    }
  }

  if (provider === 'custom') {
    return {
      title: 'Custom',
      meta: 'Use any OpenAI-compatible `/chat/completions` backend you trust.',
    }
  }

  return {
    title: 'Groq',
    meta: 'Keep the current OpenAI-compatible Groq flow with a different key or model.',
  }
}

function applyProviderPreset(nextProvider, previousDraft) {
  if (nextProvider === 'gemini') {
    return {
      ...previousDraft,
      provider: nextProvider,
      base_url: GEMINI_BASE_URL,
      model:
        previousDraft.model.trim() === '' ||
        previousDraft.model === 'gemini-2.0-flash' ||
        previousDraft.model === 'gemini-2.0-flash-lite'
          ? GEMINI_DEFAULT_MODEL
          : previousDraft.model,
    }
  }

  if (nextProvider === 'groq') {
    return {
      ...previousDraft,
      provider: nextProvider,
      base_url: GROQ_BASE_URL,
    }
  }

  return {
    ...previousDraft,
    provider: nextProvider,
  }
}

function LlmSettingsDialog({
  opened,
  settings,
  error,
  isLoading,
  isSaving,
  onClose,
  onRefresh,
  onSave,
}) {
  const [draft, setDraft] = useState(buildDraft(settings))
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!opened) {
      return
    }

    setDraft(buildDraft(settings))
    setApiKeyDraft('')
    setLocalError('')
  }, [opened, settings])

  const providerCopy = providerSummary(draft.provider)
  const apiKeyHelperText =
    settings?.has_api_key && draft.provider === settings?.provider
      ? 'An API key is already saved in backend memory. Leave this blank to keep it.'
      : 'Enter a key when switching providers or enabling real mode.'

  const handleProviderSelect = (nextProvider) => {
    setDraft((previousDraft) => applyProviderPreset(nextProvider, previousDraft))
    setLocalError('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const timeoutSeconds = Number.parseInt(draft.timeout_seconds, 10)
    const maxTokens = Number.parseInt(draft.max_tokens, 10)

    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 1) {
      setLocalError('Timeout must be a positive integer.')
      return
    }

    if (!Number.isFinite(maxTokens) || maxTokens < 1) {
      setLocalError('Max tokens must be a positive integer.')
      return
    }

    onSave({
      backend_mode: draft.backend_mode,
      provider: draft.provider,
      api_key: apiKeyDraft.trim() === '' ? null : apiKeyDraft.trim(),
      model: draft.model.trim(),
      base_url: draft.base_url.trim(),
      timeout_seconds: timeoutSeconds,
      max_tokens: maxTokens,
    })
  }

  return (
    <Modal
      centered
      classNames={{
        body: 'llm-settings-modal-body',
      }}
      opened={opened}
      onClose={onClose}
      size="lg"
      title="Model Settings"
    >
      <Stack gap="lg">
        <div className="llm-settings-hero">
          <Text className="llm-settings-kicker">Runtime config</Text>
          <Text className="llm-settings-title">Switch providers without touching backend code</Text>
          <Text className="llm-settings-copy">
            Settings are stored in backend memory for this running session. They do not rewrite `.env`, and the API key
            is never sent back to the browser after save.
          </Text>
        </div>

        {isLoading ? (
          <Text className="llm-settings-helper">Loading the current backend configuration…</Text>
        ) : (
          <form onSubmit={handleSubmit}>
            <Stack gap="lg">
              <div className="llm-settings-section">
                <Text className="llm-settings-label">Backend mode</Text>
                <SegmentedControl
                  data={[
                    { label: 'Stub', value: 'stub' },
                    { label: 'Real', value: 'real' },
                  ]}
                  fullWidth
                  value={draft.backend_mode}
                  onChange={(value) => {
                    setDraft((previousDraft) => ({ ...previousDraft, backend_mode: value }))
                    setLocalError('')
                  }}
                />
                <Text className="llm-settings-helper">
                  Stub mode keeps the deterministic harness. Real mode sends live requests to the configured provider.
                </Text>
              </div>

              <div className="llm-settings-section">
                <Text className="llm-settings-label">Provider</Text>
                <SimpleGrid className="llm-provider-grid" cols={{ base: 1, sm: 3 }} spacing="sm">
                  {['groq', 'gemini', 'custom'].map((provider) => {
                    const summary = providerSummary(provider)
                    return (
                      <button
                        key={provider}
                        className={`llm-provider-card${draft.provider === provider ? ' is-selected' : ''}`}
                        type="button"
                        onClick={() => handleProviderSelect(provider)}
                      >
                        <span className="llm-provider-title">{summary.title}</span>
                        <span className="llm-provider-meta">{summary.meta}</span>
                      </button>
                    )
                  })}
                </SimpleGrid>
                <Text className="llm-settings-helper">{providerCopy.meta}</Text>
              </div>

              {draft.provider === 'gemini' ? (
                <div className="llm-settings-callout">
                  <Text className="llm-settings-callout-title">Gemini note</Text>
                  <Text className="llm-settings-callout-copy">
                    `gemini-2.0-flash` is deprecated and Google says it shuts down on June 1, 2026. The safer default is
                    `gemini-2.5-flash`, with `gemini-2.5-flash-lite` as the cheaper fallback.
                  </Text>
                </div>
              ) : null}

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  description="Model ID used for chat completions."
                  label="Model name"
                  placeholder={draft.provider === 'gemini' ? GEMINI_DEFAULT_MODEL : 'provider-specific model id'}
                  value={draft.model}
                  onChange={(event) => {
                    setDraft((previousDraft) => ({ ...previousDraft, model: event.currentTarget.value }))
                    setLocalError('')
                  }}
                />

                <TextInput
                  description="Defaults are applied for Groq and Gemini, but you can still override them."
                  label="Base URL"
                  placeholder={draft.provider === 'gemini' ? GEMINI_BASE_URL : GROQ_BASE_URL}
                  value={draft.base_url}
                  onChange={(event) => {
                    setDraft((previousDraft) => ({ ...previousDraft, base_url: event.currentTarget.value }))
                    setLocalError('')
                  }}
                />

                <PasswordInput
                  description={apiKeyHelperText}
                  label="API key"
                  placeholder="Enter a provider key"
                  value={apiKeyDraft}
                  onChange={(event) => {
                    setApiKeyDraft(event.currentTarget.value)
                    setLocalError('')
                  }}
                />

                <TextInput
                  description="The backend aborts the upstream call after this many seconds."
                  label="Timeout (seconds)"
                  type="number"
                  value={draft.timeout_seconds}
                  onChange={(event) => {
                    setDraft((previousDraft) => ({ ...previousDraft, timeout_seconds: event.currentTarget.value }))
                    setLocalError('')
                  }}
                />

                <TextInput
                  description="Forwarded as `max_tokens` to the provider."
                  label="Max tokens"
                  type="number"
                  value={draft.max_tokens}
                  onChange={(event) => {
                    setDraft((previousDraft) => ({ ...previousDraft, max_tokens: event.currentTarget.value }))
                    setLocalError('')
                  }}
                />
              </SimpleGrid>

              {error || localError ? <Text className="llm-settings-error">{error || localError}</Text> : null}

              <Group justify="space-between">
                <Button type="button" variant="default" onClick={onRefresh}>
                  Reload from backend
                </Button>

                <Group gap="sm">
                  <Button type="button" variant="default" onClick={onClose}>
                    Close
                  </Button>
                  <Button loading={isSaving} type="submit">
                    Save settings
                  </Button>
                </Group>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Modal>
  )
}

LlmSettingsDialog.propTypes = {
  error: PropTypes.string,
  isLoading: PropTypes.bool.isRequired,
  isSaving: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  opened: PropTypes.bool.isRequired,
  settings: PropTypes.shape({
    backend_mode: PropTypes.oneOf(['stub', 'real']).isRequired,
    provider: PropTypes.oneOf(['groq', 'gemini', 'custom']).isRequired,
    model: PropTypes.string.isRequired,
    base_url: PropTypes.string.isRequired,
    timeout_seconds: PropTypes.number.isRequired,
    max_tokens: PropTypes.number.isRequired,
    has_api_key: PropTypes.bool.isRequired,
  }),
}

export default LlmSettingsDialog
