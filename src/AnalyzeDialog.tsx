import { useEffect, useRef, useState } from 'react'
import { globalApi, type Job } from './api'

// PR 링크를 붙여넣으면 분석을 돌리고, 끝나면 그 PR 로 이동한다
export function AnalyzeDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (job?.status !== 'running') return
    const t = setInterval(async () => {
      setNow(Date.now())
      const j = await globalApi.job(job.id).catch(() => null)
      if (j) setJob(j)
    }, 1000)
    return () => clearInterval(t)
  }, [job?.id, job?.status])

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [job?.log.length])

  const start = async () => {
    setErr(null)
    try { setJob(await globalApi.analyze(url.trim())) } catch (e) { setErr((e as Error).message) }
  }
  const sec = job ? Math.round(((job.endedAt ?? now) - job.startedAt) / 1000) : 0

  return (
    <div className="picker-backdrop fixed" onClick={() => job?.status !== 'running' && onClose()}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>PR 분석하기</h2>
        <p className="hint">GitHub PR 링크를 붙여넣으세요. AI 가 코드를 읽고 흐름·설명을 만들어요 (보통 1~2분, 내 Claude 사용량 사용).</p>
        <div className="analyze-row">
          <input
            autoFocus value={url} disabled={job?.status === 'running'}
            placeholder="https://github.com/owner/repo/pull/123"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
          />
          <button className="primary" onClick={start} disabled={!url.trim() || job?.status === 'running'}>분석</button>
        </div>
        {err && <p className="err">{err}</p>}
        {job && (
          <>
            <div className={`job-status st-${job.status}`}>
              {job.status === 'running' ? `분석 중… ${sec}초` : job.status === 'done' ? `완료 (${sec}초)` : '실패 — 아래 로그를 확인하세요'}
            </div>
            <div className="job-log" ref={logRef}>{job.log.map((l, i) => <div key={i}>{l}</div>)}</div>
          </>
        )}
        <div className="dialog-bar">
          {job?.status === 'done'
            ? <button className="primary" onClick={() => (location.search = `?f=${job.slug}`)}>결과 보기 →</button>
            : <button className="ghost" onClick={onClose} disabled={job?.status === 'running'}>닫기</button>}
        </div>
      </div>
    </div>
  )
}
