import { useSyncExternalStore } from 'react'

// AI 설명(줄 주석) 전체 켜기/끄기. 화면 어디서 바꿔도 같이 바뀌고, 고른 값은 localStorage 에 남긴다
const KEY = 'prflow-notes'
const subs = new Set<() => void>()
let shown = (() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })()

const set = (v: boolean) => {
  shown = v
  try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export const useNotesShown = () => useSyncExternalStore(subscribe, () => shown)

export function NotesToggle() {
  const on = useNotesShown()
  return (
    <button
      className={`notes-toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on}
      onClick={() => set(!on)} title="끄면 줄 옆 점만 남고, 점을 눌러 하나씩 볼 수 있어요"
    >
      <span className="switch" />AI 설명
    </button>
  )
}
