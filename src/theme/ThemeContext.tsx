/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react'
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { lightTheme, darkTheme } from './theme'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  resolvedMode: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const STORAGE_KEY = 'theme-mode'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored as ThemeMode) || 'system'
  })

  const [systemPreference, setSystemPreference] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemPreference(e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode)
    localStorage.setItem(STORAGE_KEY, newMode)
  }

  const resolvedMode = mode === 'system' ? systemPreference : mode

  const theme = useMemo(
    () => (resolvedMode === 'dark' ? darkTheme : lightTheme),
    [resolvedMode]
  )

  return (
    <ThemeContext.Provider value={{ mode, setMode, resolvedMode }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
