import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import { App } from './App'
import { applyTheme } from './theme'
import { sample } from './sample'
import type { Flow } from './types'

// ~/.prflow/flows 의 분석 결과(/flows/*)를 읽고, 없으면 샘플을 보여준다
applyTheme()

async function load() {
  const flows: { id: string; title: string }[] = await fetch('/flows/index.json').then((r) => (r.ok ? r.json() : []), () => [])
  const want = new URLSearchParams(location.search).get('f') ?? flows[0]?.id ?? 'sample'
  const flow: Flow = want === 'sample' ? sample : await fetch(`/flows/${want}.json`).then((r) => r.json())
  createRoot(document.getElementById('root')!).render(<App key={want} flow={flow} flows={flows} current={want} />)
}
load()
