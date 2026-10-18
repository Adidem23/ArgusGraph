'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CytoscapeComponent from 'react-cytoscapejs'
import type cytoscape from 'cytoscape'
import { Activity, AlertTriangle, Bot, CheckCircle2, CircleDot, CloudUpload, FileVideo, LoaderCircle, Network, RefreshCw, Send, Upload, X } from 'lucide-react'

type GraphNode = { data: { id: string; label: string; type: 'video' | 'frame' | 'attribute' | string; meta?: string; value?: string; key?: string; frame_id?: string; video_id?: string; db_id?: number | string } }
type GraphEdge = { data: { id: string; source: string; target: string; label: string; type?: string } }
type GraphData = { video_id: string; graph_name: string; nodes: GraphNode[]; edges: GraphEdge[] }
type Job = { job_id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; stage?: string; error?: string; filename?: string; video_id?: string; graph?: GraphData; summary?: { frames_processed: number; nodes: number; edges: number; video_name: string; duration_seconds?: number }; stdout?: string; stderr?: string }

const API_BASE = (process.env.NEXT_PUBLIC_ARGUSGRAPH_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export default function Page() {
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<{ role: 'assistant' | 'user'; text: string }[]>([
    { role: 'assistant', text: 'Upload a video to create its graph in FalkorDB. Chat-to-agent integration will be connected in the next milestone.' },
  ])
  const cyRef = useRef<cytoscape.Core | null>(null)

  const elements = useMemo(() => {
    if (!graph) return []
    const activeIds = new Set(highlighted)
    const activeEdges = new Set(graph.edges.filter(e => activeIds.has(e.data.id) || activeIds.has(e.data.source) || activeIds.has(e.data.target)).map(e => e.data.id))
    return [
      ...graph.nodes.map(n => ({ ...n, classes: selectedNode === n.data.id ? 'selected' : activeIds.has(n.data.id) ? 'highlighted' : highlighted.length ? 'dimmed' : '' })),
      ...graph.edges.map(e => ({ ...e, classes: activeEdges.has(e.data.id) ? 'highlighted' : highlighted.length ? 'dimmed' : '' })),
    ]
  }, [graph, highlighted, selectedNode])

  const stylesheet = useMemo(() => [
    { selector: 'node', style: { label: 'data(label)', color: '#c4cedd', 'font-size': 10, 'font-family': 'Inter, sans-serif', 'text-wrap': 'ellipsis', 'text-max-width': 130, 'text-valign': 'bottom', 'text-margin-y': 9, 'background-color': '#64748b', width: 20, height: 20, 'border-width': 1, 'border-color': '#94a3b8' } },
    { selector: 'node[type="video"]', style: { 'background-color': '#7c5cff', width: 44, height: 44, 'border-width': 2, 'border-color': '#b4a7ff', color: '#f2efff', 'font-size': 12, 'font-weight': 600, 'text-margin-y': 12, 'text-max-width': 170 } },
    { selector: 'node[type="frame"]', style: { 'background-color': '#22b8d6', width: 27, height: 27, 'border-color': '#8be8f5' } },
    { selector: 'node[type="attribute"]', style: { 'background-color': '#475569', width: 17, height: 17, 'border-color': '#94a3b8', 'font-size': 9 } },
    { selector: 'edge', style: { width: 1, 'line-color': '#475569', 'target-arrow-color': '#64748b', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', color: '#94a3b8', 'font-size': 7, 'text-rotation': 'autorotate', 'text-background-color': '#0b1220', 'text-background-opacity': 0.85, 'text-background-padding': 2 } },
    { selector: '.highlighted', style: { 'border-width': 3, 'border-color': '#ecfeff', 'background-color': '#06b6d4', color: '#ecfeff' } },
    { selector: 'edge.highlighted', style: { width: 3, 'line-color': '#22d3ee', 'target-arrow-color': '#22d3ee', color: '#a5f3fc' } },
    { selector: '.dimmed', style: { opacity: 0.22 } },
    { selector: '.selected', style: { 'border-width': 3, 'border-color': '#ffffff', 'overlay-color': '#ffffff', 'overlay-opacity': 0.12 } },
  ] as any, [])

  useEffect(() => {
    if (!job?.job_id || job.status === 'completed' || job.status === 'failed') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/jobs/${job.job_id}`, { cache: 'no-store' })
        const body = await response.json()
        if (!response.ok) throw new Error(body.detail || 'Unable to check processing status')
        if (cancelled) return
        setJob(body)
        if (body.status === 'completed' && body.graph) {
          setGraph(body.graph)
          setHighlighted([])
          setSelectedNode(null)
          setError('')
        } else if (body.status === 'failed') {
          setError(body.error || 'Video processing failed. Check the backend terminal for details.')
        } else {
          timer = setTimeout(poll, 1800)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not reach the ArgusGraph API')
          timer = setTimeout(poll, 3000)
        }
      }
    }
    timer = setTimeout(poll, 700)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [job?.job_id, job?.status])

  const uploadVideo = async () => {
    if (!file || uploading) return
    setUploading(true); setError(''); setGraph(null); setHighlighted([]); setSelectedNode(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch(`${API_BASE}/api/videos/upload`, { method: 'POST', body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Video upload failed')
      setJob({ job_id: body.job_id, status: body.status, filename: body.filename, stage: 'Upload accepted by backend' })
      setUploadOpen(false); setFile(null)
    } catch (e) {
      setError(`${e instanceof Error ? e.message : 'Upload failed'}. Confirm FastAPI is running at ${API_BASE}.`)
    } finally { setUploading(false) }
  }

  const selectNode = useCallback((id: string) => {
    setSelectedNode(id)
    setHighlighted([id])
  }, [])

  const askPlaceholder = () => {
    if (!question.trim()) return
    setMessages(m => [...m, { role: 'user', text: question.trim() }, { role: 'assistant', text: 'The graph ingestion connection is the first milestone. Agent/MCP investigation and evidence-path highlighting will be wired after the upload-to-FalkorDB flow is verified.' }])
    setQuestion('')
  }

  const selected = graph?.nodes.find(n => n.data.id === selectedNode)?.data

  return <main className="min-h-screen bg-[#080d15] text-slate-100">
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-800 bg-[#0b111b] p-5 md:flex">
        <div className="mb-10 flex items-center gap-3"><div className="rounded-xl bg-violet-500/20 p-2 text-violet-300"><Network size={20}/></div><div><div className="text-lg font-semibold">Argus<span className="text-violet-300">Graph</span></div><div className="text-[9px] tracking-[.2em] text-slate-500">INTELLIGENCE PLATFORM</div></div></div>
        <div className="mb-3 text-[10px] font-semibold tracking-[.18em] text-slate-500">WORKSPACE</div>
        <div className="flex items-center gap-3 rounded-lg border border-violet-400/20 bg-violet-400/10 px-3 py-3 text-sm text-violet-200"><Network size={16}/> Graph Explorer</div>
        <button onClick={() => setUploadOpen(true)} className="mt-3 flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm text-slate-300 hover:bg-slate-800"><Upload size={16}/> Upload video</button>
        <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div className="text-xs font-medium">Local development</div><div className="mt-1 text-[11px] text-slate-500">FastAPI · FalkorDB</div><div className="mt-3 flex items-center gap-2 text-[11px]"><span className="h-2 w-2 rounded-full bg-emerald-400"/> UI connected to API endpoint</div></div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4 md:px-7"><div><div className="text-lg font-semibold">{job?.summary?.video_name || graph?.video_id || 'Video graph workspace'}</div><div className="mt-1 flex items-center gap-2 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${job?.status === 'processing' || job?.status === 'queued' ? 'bg-amber-400' : graph ? 'bg-emerald-400' : 'bg-slate-500'}`}/>{job ? `${job.status.toUpperCase()} · ${job.stage || ''}` : graph ? `Connected graph · ${graph.graph_name}` : 'Upload a video to create a graph in FalkorDB'}</div></div><button onClick={() => setUploadOpen(true)} className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-400"><CloudUpload size={16}/> Upload video</button></header>
        {error && <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200 md:mx-7"><AlertTriangle size={17} className="mt-0.5 shrink-0"/><div className="min-w-0 flex-1">{error}{job?.stderr && <details className="mt-2"><summary className="cursor-pointer text-xs">Backend error output</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{job.stderr}</pre></details>}</div><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-[580px] flex-col border-b border-slate-800 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3"><div className="flex items-center gap-2 text-sm font-medium"><CircleDot size={14} className="text-cyan-300"/> Graph canvas</div><div className="text-xs text-slate-500">{graph ? `${graph.nodes.length} nodes · ${graph.edges.length} edges` : 'Waiting for graph data'}</div></div>
            <div className="relative min-h-[520px] flex-1 bg-[#0a101a]">
              <div className="pointer-events-none absolute inset-0 opacity-30" style={{backgroundImage:'radial-gradient(#475569 0.7px, transparent 0.7px)',backgroundSize:'22px 22px'}}/>
              {graph && graph.nodes.length > 0 ? <CytoscapeComponent elements={elements as any} stylesheet={stylesheet} cy={(cy: cytoscape.Core) => { cyRef.current = cy; cy.off('tap', 'node'); cy.on('tap', 'node', e => selectNode(e.target.id())); cy.fit(undefined, 45) }} layout={{name:'cose', animate:false, fit:true, padding:45, nodeRepulsion:6500, idealEdgeLength:80} as any} style={{width:'100%',height:'100%',position:'absolute',inset:0}}/> : <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"><div className="mb-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-500"><Network size={30}/></div><div className="text-sm font-medium text-slate-300">{job?.status === 'processing' || job?.status === 'queued' ? 'Building your video graph' : 'No graph loaded yet'}</div><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{job?.status === 'processing' || job?.status === 'queued' ? 'The existing pipeline is sampling frames, running visual models, and writing attributes to FalkorDB. The graph appears when ingestion and verification finish.' : 'Upload a CCTV video. The backend will run the existing pipeline and fetch the persisted graph from FalkorDB.'}</p>{(job?.status === 'processing' || job?.status === 'queued') && <div className="mt-5 flex items-center gap-2 text-xs text-cyan-200"><LoaderCircle className="animate-spin" size={15}/>{job.stage || 'Processing video…'}</div>}</div>}
              {graph && <div className="absolute bottom-4 left-4 rounded-lg border border-slate-700 bg-slate-950/90 p-3 text-[11px] text-slate-300"><div className="mb-2 font-semibold tracking-wider text-slate-500">NODE TYPES</div><div className="flex flex-col gap-2"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-violet-400"/>Video</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-cyan-300"/>Frame</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-slate-400"/>Frame attribute</span></div></div>}
              {graph && <button onClick={() => { cyRef.current?.fit(undefined, 45); setHighlighted([]); setSelectedNode(null) }} className="absolute right-4 top-4 rounded-lg border border-slate-700 bg-slate-950/90 p-2 text-slate-300 hover:bg-slate-800" title="Fit graph"><RefreshCw size={15}/></button>}
            </div>
            {selected && <div className="border-t border-slate-800 bg-slate-900/50 px-5 py-3"><div className="text-[10px] tracking-widest text-slate-500">SELECTED NODE</div><div className="mt-1 text-sm font-medium">{selected.label}</div><div className="mt-1 break-all text-xs text-slate-400">{selected.meta || selected.type}{selected.key ? ` · ${selected.key}` : ''}{selected.value ? `: ${selected.value.slice(0,240)}` : ''}</div><div className="mt-1 text-[10px] text-slate-600">Node ID: {selected.id}</div></div>}
          </div>
          <aside className="flex min-h-[500px] flex-col bg-[#0b111b]"><div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4"><div className="rounded-lg bg-violet-400/15 p-2 text-violet-200"><Bot size={17}/></div><div><div className="text-sm font-semibold">ArgusGraph Agent</div><div className="mt-0.5 text-[11px] text-slate-500">Chat integration · next milestone</div></div></div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">{messages.map((m,i)=><div key={i} className="flex gap-3"><div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.role==='assistant'?'bg-violet-400/15 text-violet-200':'bg-slate-700 text-slate-200'}`}>{m.role==='assistant'?<Activity size={14}/>:<span className="text-[10px]">YOU</span>}</div><div><div className="mb-1 text-[10px] font-semibold tracking-widest text-slate-500">{m.role==='assistant'?'ARGUS':'YOU'}</div><div className="text-xs leading-5 text-slate-300">{m.text}</div></div></div>)}
              {graph && <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><CheckCircle2 size={14} className="text-emerald-300"/> Graph persisted and loaded</div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-slate-950 p-2"><div className="text-lg font-semibold">{graph.nodes.length}</div><div className="text-[10px] text-slate-500">Nodes</div></div><div className="rounded-lg bg-slate-950 p-2"><div className="text-lg font-semibold">{graph.edges.length}</div><div className="text-[10px] text-slate-500">Edges</div></div><div className="rounded-lg bg-slate-950 p-2"><div className="text-lg font-semibold">{job?.summary?.frames_processed ?? graph.nodes.filter(n=>n.data.type==='frame').length}</div><div className="text-[10px] text-slate-500">Frames</div></div></div><div className="mt-2 text-[10px] text-slate-500">Graph: {graph.graph_name} · Video ID: {graph.video_id}</div></div>}
              {job?.status === 'failed' && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">Processing failed: {job.error}</div>}
            </div>
            <div className="border-t border-slate-800 p-4"><div className="mb-2 text-[10px] text-slate-500">Chat is intentionally a placeholder until the graph ingestion path is verified.</div><div className="rounded-xl border border-slate-700 bg-slate-950 p-2"><textarea value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askPlaceholder()}}} rows={2} placeholder="Ask about your video…" className="w-full resize-none bg-transparent px-2 py-1 text-xs outline-none placeholder:text-slate-600"/><div className="flex items-center justify-between px-1"><span className="text-[10px] text-slate-600">Enter to send</span><button onClick={askPlaceholder} className="rounded-lg bg-violet-500 p-2 text-white hover:bg-violet-400" aria-label="Send message"><Send size={14}/></button></div></div></div>
          </aside>
        </div>
      </section>
    </div>
    {uploadOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0d1522] p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-semibold">Upload CCTV video</h2><p className="mt-1 text-xs text-slate-400">The FastAPI backend runs your existing ArgusGraph pipeline.</p></div><button onClick={()=>{setUploadOpen(false);setFile(null)}} aria-label="Close upload" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X size={17}/></button></div><label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/60 p-5 text-center hover:border-violet-400"><input type="file" accept="video/*,.mkv,.avi" className="sr-only" onChange={e=>setFile(e.target.files?.[0]||null)}/><FileVideo size={28} className="mb-3 text-violet-300"/><div className="text-sm font-medium">{file?.name || 'Choose a video file'}</div><div className="mt-2 text-xs text-slate-500">MP4, MOV, AVI, MKV, WEBM</div>{file && <div className="mt-3 text-xs text-emerald-300">Ready · {(file.size/1024/1024).toFixed(1)} MB</div>}</label><div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>Processing can take a while because YOLO, CLIP, BLIP, and Gemini run in the existing pipeline. Keep the API terminal open to see detailed logs.</div><div className="mt-6 flex justify-end gap-3"><button onClick={()=>{setUploadOpen(false);setFile(null)}} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button><button disabled={!file||uploading} onClick={uploadVideo} className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">{uploading?<LoaderCircle className="animate-spin" size={15}/>:<Upload size={15}/>} {uploading?'Uploading…':'Upload and build graph'}</button></div></div></div>}
  </main>
}
