import React, { useState, useEffect } from 'react'

async function readJsonResponse(response, label) {
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    const message = payload?.error || `${label} 请求失败（${response.status}）`
    throw new Error(message)
  }

  if (!isJson) {
    throw new Error(`${label} 返回了非 JSON 响应`)
  }

  return payload
}

export default function GlobalSettings({ onClose, onSaved }) {
  const [form, setForm] = useState({
    model: '',
    model_provider: '',
    model_reasoning_effort: '',
    max_threads: '',
    max_depth: '',
    job_max_runtime_seconds: '',
  })
  const [info, setInfo] = useState(null)
  const [legacyAgent, setLegacyAgent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [removingLegacyAgent, setRemovingLegacyAgent] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setError('')

      const results = await Promise.allSettled([
        fetch('/api/config').then(r => readJsonResponse(r, '全局模型配置')),
        fetch('/api/config/agents').then(r => readJsonResponse(r, 'agents 配置')),
        fetch('/api/info').then(r => readJsonResponse(r, '环境信息')),
      ])

      if (cancelled) return

      const [configResult, agentsResult, infoResult] = results
      const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason?.message || '未知错误')

      if (configResult.status === 'fulfilled' || agentsResult.status === 'fulfilled') {
        const configData = configResult.status === 'fulfilled' ? configResult.value : {}
        const agentsCfg = agentsResult.status === 'fulfilled' ? agentsResult.value : {}

        setForm({
          model: configData.model ?? '',
          model_provider: configData.model_provider ?? '',
          model_reasoning_effort: configData.model_reasoning_effort ?? '',
          max_threads: agentsCfg.max_threads ?? '',
          max_depth: agentsCfg.max_depth ?? '',
          job_max_runtime_seconds: agentsCfg.job_max_runtime_seconds ?? '',
        })
        setLegacyAgent(configData.legacyAgent ?? null)
      }

      if (infoResult.status === 'fulfilled') {
        setInfo(infoResult.value)
      }

      if (errors.length > 0) {
        setError(`加载配置失败：${errors.join('；')}`)
      }
    }

    loadSettings().catch((err) => {
      if (!cancelled) {
        setError(err.message || '加载配置失败')
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const [modelRes, agentsRes] = await Promise.all([
        fetch('/api/config/default-model', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: form.model,
            model_provider: form.model_provider,
            model_reasoning_effort: form.model_reasoning_effort,
            appliedPresetId: null,
          }),
        }),
        fetch('/api/config/agents', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_threads: form.max_threads,
            max_depth: form.max_depth,
            job_max_runtime_seconds: form.job_max_runtime_seconds,
          }),
        }),
      ])
      const modelData = await modelRes.json()
      const agentsData = await agentsRes.json()
      if (!modelRes.ok) throw new Error(modelData.error || '保存默认模型失败')
      if (!agentsRes.ok) throw new Error(agentsData.error || '保存 agents 配置失败')
      onSaved?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveLegacyAgent = async () => {
    setRemovingLegacyAgent(true)
    setError('')
    try {
      const res = await fetch('/api/config/legacy-agent', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '移除旧 agent 字段失败')
      setLegacyAgent(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setRemovingLegacyAgent(false)
    }
  }

  const inputCls = "w-full px-4 h-10 rounded-[var(--radius)] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-[13px] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))] focus:border-[hsl(var(--accent))] transition-colors font-mono"
  const labelCls = "block text-[11px] font-bold text-[hsl(var(--muted-foreground))] mb-1.5 uppercase tracking-wide"
  const codexDirDisplay = info?.codexDirDisplay || info?.codexDir || '~/.codex'
  const configFileDisplay = info?.configFileDisplay || `${codexDirDisplay}/config.toml`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 animate-apple-fade-in backdrop-blur-sm">
      <div className="w-full max-w-xl animate-apple-scale-in glass-modal shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header - Fixed */}
        <div className="px-6 py-5 border-b border-[hsl(var(--border))] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius)] bg-[hsl(var(--muted))] flex items-center justify-center text-lg border border-[hsl(var(--border))]">⚙️</div>
              <div>
                <h2 className="text-apple-title text-[hsl(var(--foreground))]">全局项目配置</h2>
                <p className="text-[12px] text-[hsl(var(--muted-foreground))] mt-0.5">更改 config.toml 相关设定</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-[var(--radius)] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-300 active:scale-95">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-7 scrollbar-thin">
          {/* 服务器信息卡片 */}
          {info && (
            <div className="p-3.5 rounded-[var(--radius)] text-[11px] space-y-2 animate-apple-fade-in bg-apple-section-secondary border border-[hsl(var(--border))] shadow-none flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[hsl(var(--muted-foreground))] font-bold uppercase tracking-widest text-[10px]">配置目录</span>
                <code className="text-[hsl(var(--foreground))] font-mono opacity-80 text-[11px] max-w-[200px] truncate">{codexDirDisplay}</code>
              </div>
              <div className="h-px bg-[hsl(var(--border))]" />
              <div className="flex items-center justify-between">
                <span className="text-[hsl(var(--muted-foreground))] font-bold uppercase tracking-widest text-[10px]">系统平台</span>
                <code className="text-[hsl(var(--foreground))] font-mono opacity-80 text-[11px]">{info.platform}</code>
              </div>
            </div>
          )}

          {legacyAgent && (
            <div className="p-4 rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[13px] leading-relaxed space-y-3 shadow-none">
              <p>
                检测到过时的 <code className="font-mono">agent = "{legacyAgent}"</code> 字段。该字段不保证可靠覆盖，主会话模型请以下方设定为准。
              </p>
              <button
                type="button"
                onClick={handleRemoveLegacyAgent}
                disabled={removingLegacyAgent}
                className="glass-button !h-8 !border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 font-bold tracking-widest uppercase hover:bg-amber-500/15"
              >
                {removingLegacyAgent ? '正在清理…' : '清除旧字段'}
              </button>
            </div>
          )}

          <div className="space-y-4 animate-apple-fade-in">
            <div>
              <p className="text-[14px] font-bold text-[hsl(var(--foreground))] mb-1">新会话默认模型</p>
              <p className="text-[12px] text-[hsl(var(--muted-foreground))] hidden sm:block">
                这些设置默认写入顶层字段，影响所有尚未定制模型的 Agent。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>model</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={e => handleChange('model', e.target.value)}
                  placeholder="gpt-5.4"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>model_provider</label>
                <input
                  type="text"
                  value={form.model_provider}
                  onChange={e => handleChange('model_provider', e.target.value)}
                  placeholder="留空则继承系统默认"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>model_reasoning_effort</label>
              <input
                type="text"
                value={form.model_reasoning_effort}
                onChange={e => handleChange('model_reasoning_effort', e.target.value)}
                placeholder="minimal / low / medium / high / xhigh"
                className={inputCls}
              />
            </div>
          </div>

          <div className="h-px bg-[hsl(var(--border))]" />

          <div className="space-y-4 animate-apple-fade-in">
            <div>
              <p className="text-[14px] font-bold text-[hsl(var(--foreground))]">Agents 并发设置</p>
            </div>

            {/* max_threads */}
            <div>
              <label className={labelCls}>max_threads <span className="font-normal opacity-70 normal-case">（默认 6）</span></label>
              <input type="number" min="1" max="32" value={form.max_threads}
                onChange={e => handleChange('max_threads', e.target.value)}
                placeholder="6"
                className={inputCls} />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1.5">最大并行线程数</p>
            </div>

            {/* max_depth */}
            <div>
              <label className={labelCls}>max_depth <span className="font-normal opacity-70 normal-case">（默认 1）</span></label>
              <input type="number" min="0" max="5" value={form.max_depth}
                onChange={e => handleChange('max_depth', e.target.value)}
                placeholder="1"
                className={inputCls} />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1.5">子代理嵌套深度上限</p>
            </div>

            {/* job_max_runtime_seconds */}
            <div>
              <label className={labelCls}>job_max_runtime_seconds <span className="font-normal opacity-70 normal-case">（单位：秒）</span></label>
              <input type="number" min="60" value={form.job_max_runtime_seconds}
                onChange={e => handleChange('job_max_runtime_seconds', e.target.value)}
                placeholder="1800"
                className={inputCls} />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1.5">批处理任务单次执行时间上限</p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[var(--radius)] bg-red-500/10 border border-red-500/20 text-red-500 text-[13px] font-bold animate-apple-fade-in shadow-none">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="px-6 py-4 border-t border-[hsl(var(--border))] shrink-0 bg-apple-section-secondary flex items-center justify-between rounded-b-[inherit]">
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-60 font-mono tracking-tight hidden sm:block">
            {configFileDisplay}
          </p>
          <div className="flex items-center gap-3 sm:ml-auto">
            <button type="button" onClick={onClose}
              className="glass-button !border-none text-[hsl(var(--muted-foreground))] uppercase tracking-widest text-[11px] !bg-transparent shadow-none hover:bg-[hsl(var(--muted))]">
              取消
            </button>
            <button onClick={handleSave} disabled={saving}
              className="glass-button-primary min-w-[100px] h-9 !py-0 flex items-center justify-center">
              {saving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : saved ? (
                <>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-bold text-[11px] uppercase tracking-widest">已保存</span>
                </>
              ) : <span className="font-bold text-[11px] uppercase tracking-widest">保存选项</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
