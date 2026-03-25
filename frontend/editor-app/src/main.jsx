import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/tiptap/styles.css'
import './index.css'
import App from './App.jsx'

const theme = createTheme({
  colors: {
    mono: [
      '#f7f7f7',
      '#ececec',
      '#dcdcdc',
      '#c6c6c6',
      '#a8a8a8',
      '#8a8a8a',
      '#666666',
      '#444444',
      '#222222',
      '#0d0d0d',
    ],
  },
  primaryColor: 'mono',
  primaryShade: 9,
  defaultRadius: 'md',
  fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", "SFMono-Regular", monospace',
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
)
