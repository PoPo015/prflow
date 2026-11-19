import { useEffect, useState } from 'react'

// 라이트/다크 전환. 기본은 시스템 설정을 따르고, 고른 값은 localStorage 에 남긴다
export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'prflow-theme'
const ORDER: ThemePref[] = ['system', 'light', 'dark']
export const THEME_LABEL: Record<ThemePref, string> = { system: '◐ 시스템', light: '☀ 라이트', dark: '☾ 다크' }

const media = matchMedia('(prefers-color-scheme: dark)')
const read = (): ThemePref => {
  try { const v = localStorage.getItem(KEY); return ORDER.includes(v as ThemePref) ? (v as ThemePref) : 'system' } catch { return 'system' }
}
const resolve = (p: ThemePref): 'light' | 'dark' => (p === 'system' ? (media.matches ? 'dark' : 'light') : p)

// 첫 렌더 전에 불러서 화면이 깜빡이지 않게
export const applyTheme = () => { document.documentElement.dataset.theme = resolve(read()) }

export function useTheme() {
  const [pref, setPref] = useState(read)
  const [resolved, setResolved] = useState(() => resolve(pref))
  useEffect(() => {
    const sync = () => {
      const r = resolve(pref)
      setResolved(r)
      document.documentElement.dataset.theme = r
    }
    sync()
    try { localStorage.setItem(KEY, pref) } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [pref])
  const cycle = () => setPref((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length])
  return { pref, resolved, cycle }
}
