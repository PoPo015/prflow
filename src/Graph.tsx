import { useEffect, useMemo, useRef } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, type Node, type Edge, type NodeProps, type ReactFlowInstance } from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import type { Flow, FlowNode } from './types'

const KIND_LABEL: Record<FlowNode['kind'], string> = {
  ui: '화면',
  api: 'API',
  service: '서비스',
  repository: '리포지토리',
  db: 'DB',
  event: '이벤트',
  external: '외부',
}

const W = 230
const H = 78

type CardData = { node: FlowNode; step?: number; selected: boolean; dimmed: boolean }

function Card({ data }: NodeProps<Node<CardData>>) {
  const { node, step, selected, dimmed } = data
  return (
    <div className={`card kind-${node.kind} change-${node.change} ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}>
      <Handle type="target" position={Position.Top} />
      <div className="card-top">
        <span className="card-kind">{KIND_LABEL[node.kind]}</span>
        {node.change !== 'unchanged' && <span className={`badge badge-${node.change}`}>{node.change === 'added' ? '추가' : '수정'}</span>}
        {step && <span className="card-step">{step}</span>}
      </div>
      <div className="card-label">{node.label}</div>
      {node.sub && <div className="card-sub">{node.sub}</div>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

const nodeTypes = { card: Card }

export function Graph({ flow, selected, onSelect }: { flow: Flow; selected: string; onSelect: (id: string) => void }) {
  // 레이아웃은 데이터가 바뀔 때만 계산
  const positions = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })
    g.setDefaultEdgeLabel(() => ({}))
    flow.nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }))
    flow.edges.forEach((e) => g.setEdge(e.from, e.to))
    dagre.layout(g)
    return Object.fromEntries(flow.nodes.map((n) => {
      const p = g.node(n.id)
      return [n.id, { x: p.x - W / 2, y: p.y - H / 2 }]
    }))
  }, [flow])

  const neighbors = useMemo(() => {
    const s = new Set([selected])
    flow.edges.forEach((e) => {
      if (e.from === selected) s.add(e.to)
      if (e.to === selected) s.add(e.from)
    })
    return s
  }, [flow, selected])

  // 선택한 노드와 이웃만 화면에 꽉 차게 확대
  const rf = useRef<ReactFlowInstance<Node<CardData>> | null>(null)
  useEffect(() => {
    rf.current?.fitView({ nodes: [...neighbors].map((id) => ({ id })), duration: 400, padding: 0.25, maxZoom: 1.1 })
  }, [neighbors])

  const nodes: Node<CardData>[] = flow.nodes.map((n) => {
    const idx = flow.readingOrder.findIndex((r) => r.node === n.id)
    return {
      id: n.id,
      type: 'card',
      position: positions[n.id],
      data: { node: n, step: idx >= 0 ? idx + 1 : undefined, selected: n.id === selected, dimmed: !neighbors.has(n.id) },
    }
  })

  const edges: Edge[] = flow.edges.map((e) => {
    const active = e.from === selected || e.to === selected
    return {
      id: `${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      label: e.label,
      type: 'smoothstep',
      className: `edge-${e.status} ${active ? 'is-active' : ''}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
    }
  })

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      onInit={(inst) => {
        rf.current = inst
        inst.fitView({ nodes: [...neighbors].map((id) => ({ id })), padding: 0.25, maxZoom: 1.1 })
      }}
      nodesDraggable={false}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      proOptions={{ hideAttribution: true }}
      forceColorMode="dark"
    >
      <Background gap={22} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
