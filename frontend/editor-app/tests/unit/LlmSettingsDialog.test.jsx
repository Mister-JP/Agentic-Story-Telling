import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import LlmSettingsDialog from '../../src/components/LlmSettingsDialog.jsx'

function renderDialog(props = {}) {
  return render(
    <MantineProvider>
      <LlmSettingsDialog
        error=""
        isLoading={false}
        isSaving={false}
        opened
        settings={{
          backend_mode: 'real',
          provider: 'groq',
          model: 'llama-test',
          base_url: 'https://api.groq.com/openai/v1',
          timeout_seconds: 120,
          max_tokens: 8000,
          has_api_key: true,
        }}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
        {...props}
      />
    </MantineProvider>,
  )
}

describe('LlmSettingsDialog', () => {
  it('switches to Gemini defaults and shows the deprecation note', async () => {
    const user = userEvent.setup()

    renderDialog()

    await user.click(screen.getByRole('button', { name: /Gemini/i }))

    expect(screen.getByDisplayValue('gemini-2.5-flash')).toBeInTheDocument()
    expect(screen.getByText(/June 1, 2026/)).toBeInTheDocument()
  })
})
