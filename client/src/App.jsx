import React, { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import AgentCard from './components/AgentCard'
import AgentEditor from './components/AgentEditor'
import GlobalSettings from './components/GlobalSettings'

export default function App() {
  const [builtinAgents, setBuiltinAgents] = useState([])
  const [customAgents, setCustomAgents] = useState([])
  const [projectAgents, setProjectAgents] = useState([])
  const [activeAgent, setActiveAgent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [projectPath, setProjectPath] = useState('')
  const [projectPathInput, setProjectPathInput] = useState('')
  const [codexDir, setCodexDir] = useState('~/.codex')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const fetchAll = useCallback(async (projPath) => {
    setLoading(true)
    setError('')
    try {
      const proj = projPath !== undefined ? projPath : projectPath
      const agentsUrl = proj ? `/api/agents?project=${encodeURIComponent(proj)}` : '/api/agents'
      const [agentsRes, configRes, infoRes] = await Promise.all([
        fetch(agentsUrl),
        fetch('/api/config'),
        fetch('/api/info'),
      ])
      const agentsData = await agentsRes.json()
      const configData = await configRes.json()

      setBuiltinAgents(agentsData.builtin.map((a) => ({
        ...a,
        icon: a.name === 'default' ? '⚡' : a.name === 'worker' ? '🔧' : '🔍',
      })))
      setCustomAgents(agentsData.custom.map((a) => ({
        ...a,
        icon: '🤖',
      })))
      setProjectAgents((agentsData.project || []).map((a) => ({
        ...a,
        icon: '📁',
      })))
      setActiveAgent(configData.activeAgent)
      if (infoRes.ok) {
        const infoData = await infoRes.json()
        setCodexDir(infoData.codexDirDisplay || infoData.codexDir || '~/.codex')
      }
    } catch {
      setError('无法连接到后端服务，请确认 server.js 正在运行（默认 :3737）')
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleActivate = async (name) => {
    try {
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActiveAgent(name === 'default' ? null : name)
      showToast(`已激活 ${name}`)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDelete = async (name) => {
    if (!confirm(`确定要删除代理「${name}」吗？此操作不可恢复。`)) return
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(name)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`已删除 ${name}`)
      fetchAll()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleEdit = (agent) => {
    if (agent.builtin && !agent.overridden) {
      setEditingAgent({ ...agent, _isBuiltinFirstOverride: true })
    } else {
      setEditingAgent(agent)
    }
    setEditorOpen(true)
  }

  const handleReset = async (name) => {
    if (!confirm(`确定要重置「${name}」吗？自定义的覆盖内容将被删除，恢复为内置默认值。`)) return
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(name)}/reset`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`已重置 ${name} 为默认值`)
      fetchAll()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleEditorSave = () => {
    setEditorOpen(false)
    setEditingAgent(null)
    fetchAll()
    showToast('保存成功')
  }

  const handleProjectLoad = () => {
    const p = projectPathInput.trim()
    setProjectPath(p)
    fetchAll(p)
  }

  const cardProps = (agent) => ({
    agent,
    isActive: activeAgent === agent.name || (agent.name === 'default' && !activeAgent),
    onActivate: handleActivate,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onReset: handleReset,
  })

  const Skeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {[0, 1, 2].map(i => (
        <div key={i} className="glass-card flex flex-col gap-8 animate-apple-fade-in opacity-60">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-[20px] animate-apple-shimmer" />
            <div className="flex flex-col gap-3 flex-1">
              <div className="h-5 w-24 rounded-full animate-apple-shimmer" />
              <div className="h-3 w-32 rounded-full animate-apple-shimmer opacity-50" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-3.5 w-full rounded-full animate-apple-shimmer opacity-80" />
            <div className="h-3.5 w-full rounded-full animate-apple-shimmer opacity-80" />
            <div className="h-3.5 w-2/3 rounded-full animate-apple-shimmer opacity-80" />
          </div>
          <div className="mt-auto pt-6 border-t border-[hsl(var(--border))] flex justify-between items-center">
            <div className="h-9 w-24 rounded-xl animate-apple-shimmer opacity-60" />
            <div className="h-11 w-32 rounded-2xl animate-apple-shimmer opacity-80" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] selection:bg-[hsl(var(--accent))/0.3]">
      <Header
        activeAgent={activeAgent}
        onRefresh={() => fetchAll()}
        loading={loading}
        onSettings={() => setSettingsOpen(true)}
        codexDir={codexDir}
      />

      <main className="pb-24">
        {error && (
          <div className="max-w-[1200px] mx-auto px-6 pt-8 animate-apple-fade-in">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* 内置 Agents */}
        <section className="bg-[hsl(var(--background))] pt-12 pb-16">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="flex items-end justify-between mb-10 border-b border-[hsl(var(--border))] pb-6">
              <div className="space-y-1">
                <h2 className="text-apple-headline tracking-tight">内置代理</h2>
                <p className="text-apple-caption">OpenAI 预设的核心能力</p>
              </div>
              <span className="text-apple-caption font-medium px-3 py-1 rounded-full bg-[hsl(var(--muted))] border border-[hsl(var(--border))]">
                3 个可用
              </span>
            </div>
            {loading ? <Skeleton /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {builtinAgents.map((a, i) => (
                  <div key={a.name} className="animate-apple-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                    <AgentCard {...cardProps(a)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 个人自定义 Agents */}
        <section className="bg-[hsl(var(--muted))] py-20 border-y border-[hsl(var(--border))]">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="flex items-end justify-between mb-10 border-b border-[hsl(var(--border))] pb-6">
              <div className="space-y-1">
                <h2 className="text-apple-headline tracking-tight text-[hsl(var(--foreground))]">个人库</h2>
                <p className="text-apple-caption">保存在 {codexDir}/agents/</p>
              </div>
              <button onClick={() => { setEditingAgent(null); setEditorOpen(true) }}
                className="glass-button-primary !px-5 !h-11 text-xs shadow-xl shadow-blue-500/20 group transition-all duration-300 active:scale-95">
                <svg className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="font-bold tracking-tight">新建代理</span>
              </button>
            </div>

            {!loading && customAgents.length === 0 ? (
              <div onClick={() => { setEditingAgent(null); setEditorOpen(true) }}
                className="flex flex-col items-center justify-center gap-4 py-20 rounded-[var(--radius)] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background))/0.5] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] transition-all cursor-pointer group">
                <div className="w-14 h-14 rounded-2xl bg-[hsl(var(--muted))] group-hover:bg-[hsl(var(--accent))/0.1] flex items-center justify-center transition-colors text-2xl group-hover:scale-110 duration-300 shadow-inner">+</div>
                <div className="text-center">
                  <p className="text-apple-title group-hover:text-[hsl(var(--accent))]">尚未创建自定义代理</p>
                  <p className="text-apple-caption mt-1">点击此处快速开始</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {customAgents.map((a, i) => (
                  <div key={a.name} className="animate-apple-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                    <AgentCard {...cardProps(a)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 项目级 Agents */}
        <section className="bg-[hsl(var(--background))] py-20">
          <div className="max-w-[1200px] mx-auto px-6">
            <div className="flex items-end justify-between mb-10 border-b border-[hsl(var(--border))] pb-6">
              <div className="space-y-1">
                <h2 className="text-apple-headline tracking-tight">项目范围</h2>
                <p className="text-apple-caption">从特定工作区加载代理</p>
              </div>
            </div>

            <div className="max-w-[1200px] mx-auto mb-12 flex gap-3 animate-apple-fade-in justify-center">
              <div className="relative flex-1 group">
                <input
                  type="text"
                  value={projectPathInput}
                  onChange={e => setProjectPathInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProjectLoad()}
                  placeholder="项目根目录路径 (如 /home/user/my-project)"
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[hsl(var(--muted))/0.5] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.5] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2] focus:border-[hsl(var(--accent))] transition-all duration-300 font-mono"
                />
                <svg className="absolute left-4 top-3.5 w-4 h-4 text-[hsl(var(--muted-foreground))] group-focus-within:text-[hsl(var(--accent))] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <button onClick={handleProjectLoad}
                className="glass-button !px-8 !h-11 !border-none !bg-[hsl(var(--foreground))] !text-[hsl(var(--background))] hover:!opacity-90 active:scale-95 transition-all duration-200">
                加载
              </button>
              {projectPath && (
                <button onClick={() => { setProjectPath(''); setProjectPathInput(''); fetchAll('') }}
                  className="glass-button w-11 h-11 !p-0 !border-none text-red-500 hover:bg-red-500/10 active:scale-95 transition-all duration-200"
                  title="清除路径">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {projectPath && !loading && projectAgents.length === 0 && (
              <div className="p-12 rounded-3xl border border-dashed border-[hsl(var(--border))] text-center animate-apple-fade-in">
                <p className="text-apple-body text-[13px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  未在 <code className="bg-[hsl(var(--muted))] px-2 py-0.5 rounded font-mono text-[hsl(var(--foreground))]">{projectPath}/.codex/agents/</code> 中找到配置文件
                </p>
              </div>
            )}
            
            {projectAgents.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projectAgents.map((a, i) => (
                  <div key={`proj-${a.name}`} className="animate-apple-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                    <AgentCard {...cardProps(a)} />
                  </div>
                ))}
              </div>
            )}
            
            {!projectPath && (
              <div className="py-12 px-8 rounded-3xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--muted))/0.2] to-transparent animate-apple-fade-in">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[hsl(var(--background))] shadow-sm border border-[hsl(var(--border))] flex items-center justify-center text-lg">📂</div>
                  <div className="space-y-1">
                    <p className="text-apple-title">加载项目代理</p>
                    <p className="text-apple-caption max-w-sm">
                      输入项目目录路径，我们将自动发现并加载该项目特有的 Agent 配置。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 说明栏 */}
        {!loading && !error && (
          <footer className="max-w-[1200px] mx-auto px-6 mt-16 animate-apple-fade-in">
            <div className="p-8 rounded-[var(--radius)] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] flex items-start gap-5 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] flex items-center justify-center flex-shrink-0 text-[hsl(var(--accent))] shadow-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-2">
                <p className="text-apple-title text-sm">使用指南</p>
                <p className="text-apple-caption text-[12px] leading-relaxed max-w-2xl">
                  激活操作将安全地修改 <code className="font-mono text-[hsl(var(--foreground))] font-bold">{codexDir}/config.toml</code> 中的 <code className="font-mono">agent</code> 字段。
                  选择 <strong className="text-[hsl(var(--foreground))] text-[hsl(var(--accent))]">default</strong> 会移除该字段，使 Codex 回到全局默认状态。
                  复制按钮会复制 agent 名称，方便在提示词中引用；如需在 Codex 会话中查看或切换运行中的子代理，请使用 <code className="font-mono bg-[hsl(var(--background))] px-2 py-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--accent))] font-bold ml-1">/agent</code>。
                </p>
              </div>
            </div>
          </footer>
        )}
      </main>

      {editorOpen && (
        <AgentEditor agent={editingAgent} onSave={handleEditorSave} onClose={() => { setEditorOpen(false); setEditingAgent(null) }} codexDir={codexDir} />
      )}

      {settingsOpen && <GlobalSettings onClose={() => setSettingsOpen(false)} />}

      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-apple-fade-in pointer-events-none">
          <div className={`
            flex items-center gap-3 px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-2xl border
            ${toast.type === 'error' 
              ? 'bg-red-500/10 border-red-500/20 text-red-500' 
              : 'bg-[hsl(var(--background))/0.8] border-[hsl(var(--border))] text-[hsl(var(--foreground))]'}
          `}>
            <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'} animate-pulse`} />
            <span className="text-[13px] font-bold tracking-tight">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  )
}
