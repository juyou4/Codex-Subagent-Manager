import React, { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import AgentCard from './components/AgentCard'
import AgentEditor from './components/AgentEditor'
import GlobalSettings from './components/GlobalSettings'

function getAgentPresetId(agent) {
  if (agent?._scope === 'project') {
    return `project:${agent._projectDir || ''}:${agent.name}`
  }
  if (agent?.builtin) {
    return `builtin:${agent.name}`
  }
  return `custom:${agent?.name || ''}`
}

export default function App() {
  const [builtinAgents, setBuiltinAgents] = useState([])
  const [customAgents, setCustomAgents] = useState([])
  const [projectAgents, setProjectAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [projectPath, setProjectPath] = useState('')
  const [projectPathInput, setProjectPathInput] = useState('')
  const [codexDir, setCodexDir] = useState('~/.codex')
  const [defaultModelSummary, setDefaultModelSummary] = useState('')
  const [globalConfig, setGlobalConfig] = useState({ model: '', model_provider: '', model_reasoning_effort: '' })
  const [appliedPresetId, setAppliedPresetId] = useState('')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  const fetchAll = useCallback(async (projPath, silent = false) => {
    if (!silent) setLoading(true)
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
      setDefaultModelSummary([configData.model_provider, configData.model].filter(Boolean).join(' · '))
      setGlobalConfig({
        model: configData.model || '',
        model_provider: configData.model_provider || '',
        model_reasoning_effort: configData.model_reasoning_effort || '',
      })
      setAppliedPresetId(configData.appliedPresetId || '')
      if (infoRes.ok) {
        const infoData = await infoRes.json()
        setCodexDir(infoData.codexDirDisplay || infoData.codexDir || '~/.codex')
      }
    } catch {
      setError('无法连接到后端服务，请确认 server.js 正在运行（默认 :3737）')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectPath])

  useEffect(() => { fetchAll() }, [fetchAll])

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

  const handleApply = async (agent) => {
    const targetModel = agent.model || agent.effective_model || ''
    const targetProvider = agent.model_provider || agent.effective_model_provider || ''
    const targetReasoning = agent.model_reasoning_effort || agent.effective_model_reasoning_effort || ''
    const nextAppliedPresetId = getAgentPresetId(agent)

    if (!targetModel && !targetProvider && !targetReasoning) {
      showToast('当前代理没有可应用的模型配置，请先为它设置模型、站点或推理强度。', 'error')
      return
    }

    try {
      const res = await fetch('/api/config/default-model', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          model_provider: targetProvider,
          model_reasoning_effort: targetReasoning,
          appliedPresetId: nextAppliedPresetId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAppliedPresetId(data.appliedPresetId || nextAppliedPresetId)
      setGlobalConfig({
        model: data.model || targetModel,
        model_provider: data.model_provider || targetProvider,
        model_reasoning_effort: data.model_reasoning_effort || targetReasoning,
      })
      setDefaultModelSummary([data.model_provider || targetProvider, data.model || targetModel].filter(Boolean).join(' · '))
      showToast(`已将 ${agent.name} 的生效模型配置设为默认会话`)
      await fetchAll(undefined, true)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleProjectLoad = () => {
    const p = projectPathInput.trim()
    setProjectPath(p)
    fetchAll(p)
  }

  const cardProps = (agent) => ({
    agent,
    globalConfig,
    isApplied: appliedPresetId === getAgentPresetId(agent),
    onEdit: handleEdit,
    onDelete: handleDelete,
    onReset: handleReset,
    onApply: handleApply,
  })

  // Apple-Class 网格布局
  const gridClasses = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--space-lg)]"

  const Skeleton = () => (
    <div className={gridClasses}>
      {[0, 1, 2].map(i => (
        <div key={i} className="glass-card flex flex-col gap-[var(--space-md)] animate-apple-fade-in opacity-50 border-transparent">
          <div className="flex items-center gap-[var(--space-sm)]">
            <div className="w-16 h-16 rounded-[var(--radius)] animate-apple-shimmer" />
            <div className="flex flex-col gap-3 flex-1">
              <div className="h-5 w-24 rounded-full animate-apple-shimmer" />
              <div className="h-3 w-32 rounded-full animate-apple-shimmer opacity-80" />
            </div>
          </div>
          <div className="space-y-4 pt-4">
            <div className="h-3 w-full rounded-full animate-apple-shimmer opacity-80" />
            <div className="h-3 w-full rounded-full animate-apple-shimmer opacity-80" />
            <div className="h-3 w-2/3 rounded-full animate-apple-shimmer opacity-80" />
          </div>
          <div className="mt-auto pt-[var(--space-md)] border-t border-[hsl(var(--border))] flex justify-between items-center">
            <div className="h-9 w-24 rounded-[var(--radius)] animate-apple-shimmer opacity-60" />
            <div className="h-3 w-16 rounded-full animate-apple-shimmer opacity-80" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] selection:bg-[hsl(var(--accent))/0.2]">
      <Header
        defaultModelSummary={defaultModelSummary}
        onRefresh={() => fetchAll()}
        loading={loading}
        onSettings={() => setSettingsOpen(true)}
        codexDir={codexDir}
      />

      <main className="pb-[var(--space-2xl)]">
        {error && (
          <div className="container mx-auto px-6 pt-8 animate-apple-fade-in">
            <div className="flex items-center gap-[var(--space-sm)] p-4 rounded-[var(--radius)] bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-apple-body !text-inherit">{error}</span>
            </div>
          </div>
        )}

        {/* 内置 Subagents */}
        <section className="bg-apple-section-primary py-[var(--space-2xl)]">
          <div className="container mx-auto max-w-[1200px] px-[var(--space-md)] lg:px-[var(--space-lg)]">
            <div className="flex items-end justify-between mb-[var(--space-lg)] border-b border-[hsl(var(--border))] pb-4">
              <div className="space-y-[var(--space-xs)]">
                <h2 className="text-apple-headline text-[hsl(var(--foreground))]">内置预设</h2>
                <p className="text-apple-caption">新会话启用子代理时的系统可选项</p>
              </div>
              <span className="text-apple-caption px-3 py-1 rounded-full bg-[hsl(var(--muted))] border border-[hsl(var(--border))]">
                {builtinAgents.length} 个可用
              </span>
            </div>
            {loading ? <Skeleton /> : (
              <div className={gridClasses}>
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
        <section className="bg-apple-section-secondary py-[var(--space-2xl)] border-y border-[hsl(var(--border))]">
          <div className="container mx-auto max-w-[1200px] px-[var(--space-md)] lg:px-[var(--space-lg)]">
            <div className="flex items-end justify-between mb-[var(--space-lg)] border-b border-[hsl(var(--border))] pb-4">
              <div className="space-y-[var(--space-xs)]">
                <h2 className="text-apple-headline text-[hsl(var(--foreground))]">个人库</h2>
                <p className="text-apple-caption">保存在 {codexDir}/agents/，供你在会话中通过 /agent 调用</p>
              </div>
              <button onClick={() => { setEditingAgent(null); setEditorOpen(true) }}
                className="glass-button-primary group">
                <svg className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>新建代理</span>
              </button>
            </div>

            {!loading && customAgents.length === 0 ? (
              <div onClick={() => { setEditingAgent(null); setEditorOpen(true) }}
                className="glass-card bg-[hsl(var(--background))/0.5] flex flex-col items-center justify-center gap-4 py-16 border border-dashed border-[hsl(var(--border))] hover:border-[hsl(var(--accent))] transition-colors cursor-pointer group shadow-none">
                <div className="w-12 h-12 rounded-[var(--radius)] bg-[hsl(var(--background))] border border-[hsl(var(--border))] flex items-center justify-center transition-transform group-hover:scale-110 duration-300">
                  <svg className="w-6 h-6 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--accent))]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </div>
                <div className="text-center">
                  <p className="text-apple-title text-[hsl(var(--foreground))]">尚未创建自定义代理</p>
                  <p className="text-apple-caption mt-1">点击此处快速开始</p>
                </div>
              </div>
            ) : (
              <div className={gridClasses}>
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
        <section className="bg-apple-section-primary py-[var(--space-2xl)]">
          <div className="container mx-auto max-w-[1200px] px-[var(--space-md)] lg:px-[var(--space-lg)]">
            <div className="flex items-end justify-between mb-[var(--space-lg)] border-b border-[hsl(var(--border))] pb-4">
              <div className="space-y-[var(--space-xs)]">
                <h2 className="text-apple-headline text-[hsl(var(--foreground))]">项目范围</h2>
                <p className="text-apple-caption">从特定工作区加载项目特有的子代理配置</p>
              </div>
            </div>

            <div className="max-w-[720px] mx-auto mb-[var(--space-xl)] flex flex-col md:flex-row gap-[var(--space-sm)] animate-apple-fade-in justify-center">
              <div className="relative flex-1 group">
                <input
                  type="text"
                  value={projectPathInput}
                  onChange={e => setProjectPathInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleProjectLoad()}
                  placeholder="输入项目路径 (如 /home/user/my-project) ..."
                  className="w-full pl-[var(--space-2xl)] pr-[var(--space-md)] py-[var(--space-sm)] h-12 rounded-[var(--radius)] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-apple-body text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))] focus:border-[hsl(var(--accent))] transition-colors font-mono"
                />
                <svg className="absolute left-[var(--space-md)] top-3.5 w-5 h-5 text-[hsl(var(--muted-foreground))] group-focus-within:text-[hsl(var(--accent))] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div className="flex gap-2 h-12">
                <button onClick={handleProjectLoad}
                  className="glass-button bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:!bg-[hsl(var(--foreground))] hover:!text-[hsl(var(--background))] hover:opacity-90 transition-opacity whitespace-nowrap !h-full border-none">
                  加载配置
                </button>
                {projectPath && (
                  <button onClick={() => { setProjectPath(''); setProjectPathInput(''); fetchAll('') }}
                    className="glass-button text-red-500 hover:text-red-500 hover:bg-red-500/10 transition-colors w-12 !p-0 !h-full border-[hsl(var(--border))]"
                    title="清除路径">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {projectPath && !loading && projectAgents.length === 0 && (
              <div className="p-12 rounded-[var(--radius-lg)] border border-dashed border-[hsl(var(--border))] bg-apple-section-secondary text-center animate-apple-fade-in shadow-none">
                <p className="text-apple-body text-[hsl(var(--muted-foreground))]">
                  未在 <code className="bg-[hsl(var(--background))] px-1.5 py-0.5 rounded font-mono border border-[hsl(var(--border))] text-[hsl(var(--foreground))]">{projectPath}/.codex/agents/</code> 中找到任何文件
                </p>
              </div>
            )}
            
            {projectAgents.length > 0 && (
              <div className={gridClasses}>
                {projectAgents.map((a, i) => (
                  <div key={`proj-${a.name}`} className="animate-apple-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                    <AgentCard {...cardProps(a)} />
                  </div>
                ))}
              </div>
            )}
            
            {!projectPath && (
              <div className="py-12 px-8 rounded-[var(--radius-lg)] border border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.5] animate-apple-fade-in shadow-none">
                <div className="flex flex-col items-center text-center space-y-[var(--space-md)]">
                  <div className="w-12 h-12 rounded-[var(--radius)] border border-[hsl(var(--border))] flex items-center justify-center text-xl bg-[hsl(var(--background))]">📂</div>
                  <div className="space-y-1">
                    <p className="text-apple-title">无活动工作区</p>
                    <p className="text-apple-caption max-w-sm">
                      你可以在上方输入框填入项目路径，或通过 Codex 编辑器指令直接加载。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 说明栏 */}
        {!loading && !error && (
          <footer className="container mx-auto max-w-[1200px] px-6 lg:px-8 mt-[var(--space-2xl)] animate-apple-fade-in">
            <div className="glass-card p-[var(--space-lg)] flex flex-col md:flex-row items-start gap-4 text-[hsl(var(--muted-foreground))] bg-apple-section-secondary border border-[hsl(var(--border))] shadow-none">
              <div className="w-12 h-12 rounded-[var(--radius)] bg-[hsl(var(--background))] border border-[hsl(var(--border))] flex items-center justify-center flex-shrink-0 text-[hsl(var(--accent))]">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-[var(--space-xs)] flex-1 pt-1">
                <p className="text-apple-title text-[hsl(var(--foreground))]">使用指南</p>
                <p className="text-apple-body text-sm leading-relaxed max-w-3xl">
                  这里管理的是 <code className="font-mono text-[hsl(var(--foreground))] font-medium">{codexDir}/agents/</code> 下的配置。
                  主会话默认模型需在全局配置中修改。修改通常只对新开 Codex 会话生效，不会热更新当前运行中的编辑器长连接对话。
                  如有需要，你可以在会话中直接使用 <code className="font-mono bg-[hsl(var(--background))] px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--accent))] ml-1">/agent</code> 指令来调用此处声明的子代理。
                </p>
              </div>
            </div>
          </footer>
        )}
      </main>

      {editorOpen && (
        <AgentEditor agent={editingAgent} onSave={handleEditorSave} onClose={() => { setEditorOpen(false); setEditingAgent(null) }} codexDir={codexDir} />
      )}

      {settingsOpen && <GlobalSettings onClose={() => setSettingsOpen(false)} onSaved={() => fetchAll(undefined, true)} />}

      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-apple-fade-in pointer-events-none">
          <div className={`
            flex items-center gap-2 max-w-[min(92vw,720px)] px-6 py-3 rounded-full border shadow-[0_18px_40px_-18px_rgba(15,23,42,0.28)]
            ${toast.type === 'error' 
              ? 'bg-[hsl(var(--card-bg))] border-red-500/25 text-red-500' 
              : 'bg-[hsl(var(--card-bg))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]'}
          `}>
            {toast.type === 'error' ? (
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            )}
            <span className="text-apple-caption !text-[14px] !text-inherit font-medium">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  )
}
