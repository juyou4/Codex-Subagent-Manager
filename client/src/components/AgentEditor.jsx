import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'

function CustomSelect({ value, onChange, options, placeholder = 'inherit' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const buttonRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (!buttonRef.current?.contains(e.target) &&
          !document.getElementById('custom-select-portal')?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width })
    }
    setOpen(o => !o)
  }

  const selected = options.find(o => o.value === value)

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[hsl(var(--muted))/0.6] border border-[hsl(var(--border))] text-[13px] text-left transition-all duration-200 hover:bg-[hsl(var(--muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.3] focus:border-[hsl(var(--accent))]"
      >
        <span className="text-[hsl(var(--foreground))]">{selected?.label || placeholder}</span>
        <svg className={`w-4 h-4 text-[hsl(var(--muted-foreground))] transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && ReactDOM.createPortal(
        <div
          id="custom-select-portal"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] dark:bg-[hsl(var(--muted))] shadow-2xl overflow-hidden animate-apple-scale-in"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors duration-150 hover:bg-[hsl(var(--muted))]
                ${opt.value === value ? 'bg-[hsl(var(--accent))/0.08] text-[hsl(var(--accent))] font-semibold' : 'text-[hsl(var(--foreground))]'}
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

const EMPTY_FORM = {
  name: '',
  description: '',
  developer_instructions: '',
  model: '',
  model_provider: '',
  model_reasoning_effort: '',
  sandbox_mode: '',
  nickname_candidates: '',
  mcp_servers: [],
}

function formatArgs(args) {
  if (Array.isArray(args)) return args.join('\n')
  return typeof args === 'string' ? args : ''
}

function formatEnv(env) {
  if (!env || typeof env !== 'object') return ''
  return Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')
}

function parseLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseEnvText(value) {
  const env = {}
  for (const line of parseLines(value)) {
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      env[line] = ''
    } else {
      const key = line.slice(0, separatorIndex).trim()
      const nextValue = line.slice(separatorIndex + 1)
      if (key) env[key] = nextValue
    }
  }
  return Object.keys(env).length > 0 ? env : undefined
}

function parseMcpServers(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).map(([name, val]) => {
    const source = val && typeof val === 'object' ? val : {}
    const {
      transport: explicitTransport = '',
      url = '',
      command = '',
      args,
      cwd = '',
      env,
      enabled,
      required,
      ...extra_fields
    } = source

    return {
      original_name: name,
      name,
      transport: url ? 'http' : (command ? 'stdio' : (explicitTransport === 'http' ? 'http' : 'stdio')),
      url,
      command,
      args_text: formatArgs(args),
      cwd,
      env_text: formatEnv(env),
      enabled: typeof enabled === 'boolean' ? String(enabled) : '',
      required: typeof required === 'boolean' ? String(required) : '',
      extra_fields,
    }
  })
}

export default function AgentEditor({ agent, onSave, onClose, codexDir = '~/.codex' }) {
  const isNew = !agent
  const isBuiltinOverride = !!agent?._isBuiltinFirstOverride
  const isEdit = !!agent && !isNew

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (agent) {
      setForm({
        name: agent.name || '',
        description: agent.description || '',
        developer_instructions: agent.developer_instructions || '',
        model: agent.model || '',
        model_provider: agent.model_provider || '',
        model_reasoning_effort: agent.model_reasoning_effort || '',
        sandbox_mode: agent.sandbox_mode || '',
        nickname_candidates: Array.isArray(agent.nickname_candidates)
          ? agent.nickname_candidates.join(', ')
          : (agent.nickname_candidates || ''),
        mcp_servers: parseMcpServers(agent.mcp_servers),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [agent])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const addMcpServer = () => {
    setForm(prev => ({
      ...prev,
      mcp_servers: [
        ...prev.mcp_servers,
        {
          original_name: '',
          name: '',
          transport: 'http',
          url: '',
          command: '',
          args_text: '',
          cwd: '',
          env_text: '',
          enabled: '',
          required: '',
          extra_fields: {},
        },
      ],
    }))
  }
  const removeMcpServer = (i) => {
    setForm(prev => ({ ...prev, mcp_servers: prev.mcp_servers.filter((_, idx) => idx !== i) }))
  }
  const updateMcpServer = (i, field, value) => {
    setForm(prev => {
      const arr = [...prev.mcp_servers]
      arr[i] = { ...arr[i], [field]: value }
      return { ...prev, mcp_servers: arr }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Agent 名称不能为空'); return }
    if (!form.description.trim()) { setError('描述不能为空'); return }
    if (!form.developer_instructions.trim()) { setError('developer_instructions 不能为空'); return }
    setSaving(true)
    try {
      const nicknameArr = form.nickname_candidates
        ? form.nickname_candidates.split(',').map(s => s.trim()).filter(Boolean)
        : []
      const mcpServers = []
      for (const server of form.mcp_servers) {
        if (!server.name.trim()) continue

        if (server.transport === 'http' && !server.url.trim()) {
          throw new Error(`MCP 服务「${server.name}」缺少 URL`)
        }
        if (server.transport === 'stdio' && !server.command.trim()) {
          throw new Error(`MCP 服务「${server.name}」缺少 command`)
        }

        mcpServers.push({
          ...server.extra_fields,
          name: server.name.trim(),
          original_name: server.original_name || undefined,
          url: server.transport === 'http' ? server.url.trim() || undefined : undefined,
          command: server.transport === 'stdio' ? server.command.trim() || undefined : undefined,
          args: server.transport === 'stdio' ? parseLines(server.args_text) : undefined,
          cwd: server.transport === 'stdio' ? server.cwd.trim() || undefined : undefined,
          env: server.transport === 'stdio' ? parseEnvText(server.env_text) : undefined,
          enabled: server.enabled === '' ? undefined : server.enabled === 'true',
          required: server.required === '' ? undefined : server.required === 'true',
        })
      }
      const payload = {
        name: form.name,
        description: form.description,
        developer_instructions: form.developer_instructions,
        model: form.model || undefined,
        model_provider: form.model_provider || undefined,
        model_reasoning_effort: form.model_reasoning_effort || undefined,
        sandbox_mode: form.sandbox_mode || undefined,
        nickname_candidates: nicknameArr.length > 0 ? nicknameArr : undefined,
        mcp_servers: mcpServers,
      }
      const url = isNew ? '/api/agents' : `/api/agents/${encodeURIComponent(form.name)}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败')
      onSave()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const title = isNew
    ? '新建 Custom Agent'
    : isBuiltinOverride
      ? `自定义内置 Agent: ${agent.name}`
      : `编辑 Agent: ${agent.name}`

  const inputCls = 'w-full px-4 py-3 rounded-2xl bg-[hsl(var(--muted))/0.4] border border-[hsl(var(--border))] text-[13px] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.4] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2] focus:border-[hsl(var(--accent))] transition-all duration-300 hover:bg-[hsl(var(--muted))/0.6]'
  const labelCls = 'block text-[11px] font-bold text-[hsl(var(--muted-foreground))] mb-2 ml-1 uppercase tracking-widest'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-apple-fade-in">
      <div className="w-full max-w-xl glass-modal shadow-2xl animate-apple-scale-in">
        <div className="flex items-center justify-between px-8 py-6 border-b border-[hsl(var(--border))]">
          <h2 className="text-apple-title text-base">{title}</h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-all duration-300 active:scale-90">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[75vh] overflow-y-auto scrollbar-thin">
          {isBuiltinOverride && (
            <div className="flex items-start gap-4 p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[12px] leading-relaxed animate-apple-fade-in shadow-sm">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>保存后将写入 <code className="font-mono bg-amber-500/10 px-2 py-0.5 rounded-lg text-amber-700 dark:text-amber-300 font-bold">{codexDir}/agents/{agent.name}.toml</code>，覆盖内置默认值。可在卡片上点击重置恢复原始配置。</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-8">
            {/* name */}
            <div className="animate-apple-fade-in [animation-delay:0.05s]">
              <label className={labelCls}>name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={e => handleChange('name', e.target.value)}
                disabled={isEdit} placeholder="my-agent"
                className={`${inputCls} font-mono disabled:opacity-50 disabled:cursor-not-allowed`} />
            </div>

            {/* description */}
            <div className="animate-apple-fade-in [animation-delay:0.1s]">
              <label className={labelCls}>description <span className="text-red-500">*</span></label>
              <textarea value={form.description} onChange={e => handleChange('description', e.target.value)}
                placeholder="描述这个 agent 的用途..." rows={2}
                className={`${inputCls} resize-none leading-relaxed`} />
            </div>

            {/* developer_instructions */}
            <div className="animate-apple-fade-in [animation-delay:0.15s]">
              <label className={labelCls}>developer_instructions <span className="text-red-500">*</span></label>
              <textarea value={form.developer_instructions} onChange={e => handleChange('developer_instructions', e.target.value)}
                placeholder="定义 agent 的核心行为指令..." rows={8}
                className={`${inputCls} resize-y font-mono text-[12px] leading-relaxed scrollbar-thin`} />
            </div>

            {/* model settings */}
            <div className="grid grid-cols-2 gap-6 animate-apple-fade-in [animation-delay:0.2s]">
              <div>
                <label className={labelCls}>model</label>
                <input type="text" value={form.model} onChange={e => handleChange('model', e.target.value)}
                  placeholder="gpt-5.4" className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>reasoning_effort</label>
                <CustomSelect
                  value={form.model_reasoning_effort}
                  onChange={v => handleChange('model_reasoning_effort', v)}
                  options={[
                    { value: '', label: 'inherit' },
                    { value: 'minimal', label: 'minimal' },
                    { value: 'low', label: 'low' },
                    { value: 'medium', label: 'medium' },
                    { value: 'high', label: 'high' },
                    { value: 'xhigh', label: 'xhigh' },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 animate-apple-fade-in [animation-delay:0.25s]">
              <div>
                <label className={labelCls}>model_provider</label>
                <input type="text" value={form.model_provider} onChange={e => handleChange('model_provider', e.target.value)}
                  placeholder="留空继承" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>sandbox_mode</label>
                <CustomSelect
                  value={form.sandbox_mode}
                  onChange={v => handleChange('sandbox_mode', v)}
                  options={[
                    { value: '', label: 'inherit' },
                    { value: 'read-only', label: 'read-only' },
                    { value: 'workspace-write', label: 'workspace-write' },
                    { value: 'danger-full-access', label: 'danger-full-access' },
                  ]}
                />
              </div>
            </div>

            {/* nickname_candidates */}
            <div className="animate-apple-fade-in [animation-delay:0.3s]">
              <label className={labelCls}>
                nickname_candidates
                <span className="ml-2 font-normal opacity-50 normal-case">（逗号分隔）</span>
              </label>
              <input type="text" value={form.nickname_candidates}
                onChange={e => handleChange('nickname_candidates', e.target.value)}
                placeholder="Atlas, Delta, Echo"
                className={inputCls} />
            </div>

            {/* mcp_servers */}
            <div className="space-y-5 animate-apple-fade-in [animation-delay:0.35s]">
              <div className="flex items-center justify-between ml-1">
                <div>
                  <label className={labelCls + ' mb-0'}>mcp_servers</label>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2">
                    支持 Streamable HTTP 与 stdio 常用字段；未展示的高级键会在保存时保留。
                  </p>
                </div>
                <button type="button" onClick={addMcpServer}
                  className="flex items-center gap-2 text-[11px] font-bold text-[hsl(var(--accent))] hover:opacity-80 transition-all duration-300 active:scale-95">
                  <div className="w-6 h-6 rounded-full bg-[hsl(var(--accent))/0.1] flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  添加服务
                </button>
              </div>
              
              {form.mcp_servers.length === 0 ? (
                <div className="py-12 rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.2] text-center">
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))] font-bold uppercase tracking-widest opacity-60">暂无 MCP Server 配置</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {form.mcp_servers.map((s, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-[hsl(var(--muted))/0.3] border border-[hsl(var(--border))] animate-apple-fade-in group/mcp hover:bg-[hsl(var(--muted))/0.5] transition-all duration-300">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-[1.4fr,0.8fr] gap-3">
                            <input type="text" value={s.name} onChange={e => updateMcpServer(i, 'name', e.target.value)}
                              placeholder="服务器名称 (如 my-server)" className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.7] border border-[hsl(var(--border))] text-[13px] font-bold text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.3] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2]" />
                            <CustomSelect
                              value={s.transport}
                              onChange={v => updateMcpServer(i, 'transport', v)}
                              options={[
                                { value: 'http', label: 'Streamable HTTP' },
                                { value: 'stdio', label: 'stdio' },
                              ]}
                              placeholder="transport"
                            />
                          </div>

                          {s.transport === 'http' ? (
                            <input type="text" value={s.url} onChange={e => updateMcpServer(i, 'url', e.target.value)}
                              placeholder="URL (https://...)" className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.7] border border-[hsl(var(--border))] text-[12px] font-mono text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.25] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2]" />
                          ) : (
                            <div className="grid grid-cols-1 gap-3">
                              <input type="text" value={s.command} onChange={e => updateMcpServer(i, 'command', e.target.value)}
                                placeholder="command (如 npx)" className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.7] border border-[hsl(var(--border))] text-[12px] font-mono text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.25] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2]" />
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <textarea value={s.args_text} onChange={e => updateMcpServer(i, 'args_text', e.target.value)}
                                  placeholder="args，每行一个参数" rows={3}
                                  className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.7] border border-[hsl(var(--border))] text-[12px] font-mono text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.25] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2] resize-y" />
                                <textarea value={s.env_text} onChange={e => updateMcpServer(i, 'env_text', e.target.value)}
                                  placeholder="env，每行 KEY=VALUE" rows={3}
                                  className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.7] border border-[hsl(var(--border))] text-[12px] font-mono text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.25] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2] resize-y" />
                              </div>
                              <input type="text" value={s.cwd} onChange={e => updateMcpServer(i, 'cwd', e.target.value)}
                                placeholder="cwd (可选)" className="w-full px-3 py-2 rounded-xl bg-[hsl(var(--background))/0.7] border border-[hsl(var(--border))] text-[12px] font-mono text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.25] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.2]" />
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <CustomSelect
                              value={s.enabled}
                              onChange={v => updateMcpServer(i, 'enabled', v)}
                              options={[
                                { value: '', label: 'enabled: preserve' },
                                { value: 'true', label: 'enabled: true' },
                                { value: 'false', label: 'enabled: false' },
                              ]}
                              placeholder="enabled"
                            />
                            <CustomSelect
                              value={s.required}
                              onChange={v => updateMcpServer(i, 'required', v)}
                              options={[
                                { value: '', label: 'required: preserve' },
                                { value: 'true', label: 'required: true' },
                                { value: 'false', label: 'required: false' },
                              ]}
                              placeholder="required"
                            />
                          </div>
                        </div>

                        <button type="button" onClick={() => removeMcpServer(i)}
                          className="w-11 h-11 flex items-center justify-center rounded-2xl hover:bg-red-500/10 text-[hsl(var(--muted-foreground))] hover:text-red-500 transition-all opacity-0 group-hover/mcp:opacity-100 active:scale-90 shadow-sm">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-5 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-500 text-[12px] font-bold animate-apple-fade-in shadow-sm">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 px-8 py-6 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))/0.3]">
          <button type="button" onClick={onClose}
            className="glass-button !px-8 !h-11 !border-none !shadow-none hover:!bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] font-bold text-xs uppercase tracking-widest active:scale-95 transition-all duration-300">
            取消
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="glass-button-primary !px-12 !h-11 shadow-2xl shadow-blue-500/20">
            {saving ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="font-bold text-xs uppercase tracking-widest">{isNew ? '创建 Agent' : '确认修改'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
