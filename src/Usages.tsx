import type { Usage } from './api'
import type { Loc } from './Explorer'

// 사용처 목록. PR 밖에서 쓰는 곳을 먼저 보여준다 ("이거 바꿔도 다른 데 괜찮나?")
export function Usages({ sym, total, hits, onOpen, onClose }: { sym: string; total: number; hits: Usage[]; onOpen: (l: Loc) => void; onClose: () => void }) {
  const outside = hits.filter((h) => !h.inPr && !h.test).length
  const groups = new Map<string, Usage[]>()
  hits.forEach((h) => groups.set(h.path, [...(groups.get(h.path) ?? []), h]))
  return (
    <aside className="usages">
      <div className="usages-head">
        <div><code>{sym}</code> 사용처 {total}곳{total > hits.length && ` (앞 ${hits.length}곳)`}</div>
        <button className="ghost" onClick={onClose}>✕</button>
      </div>
      <div className={`usages-sum ${outside ? 'warn' : ''}`}>
        {outside ? `PR 이 건드리지 않은 곳 ${outside}곳 — 이 변경의 영향 범위예요` : 'PR 밖에서 쓰는 곳은 없어요 (테스트 제외)'}
      </div>
      <div className="usages-list">
        {[...groups.entries()].map(([path, list]) => (
          <div key={path} className="usage-file">
            <div className="usage-path">
              <span>{path}</span>
              {list[0].test ? <i className="tag">테스트</i> : list[0].inPr ? <i className="tag in">PR 안</i> : <i className="tag out">PR 밖</i>}
            </div>
            {list.map((h) => (
              <button key={h.line} className="usage-row" onClick={() => onOpen({ path: h.path, line: h.line })}>
                <span className="ln">{h.line}</span><code>{h.text}</code>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}
