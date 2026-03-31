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

export default function GlobalSettings({ onClose }) {
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

  const inputCls = 'w-full px-4 py-3 rounded-2xl bg-[hsl(var(--muted))/0.5] dark:bg-white/8 border border-[hsl(var(--border))] dark:border-white/15 text-[13px] text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))/0.5] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))/0.3] focus:border-[hsl(var(--accent))] transition-all duration-300 font-mono'
  const labelCls = 'block text-[11px] font-bold text-[hsl(var(--muted-foreground))] dark:text-white/60 mb-2 ml-1 uppercase tracking-widest'
  const codexDirDisplay = info?.codexDirDisplay || info?.codexDir || '~/.codex'
  const configFileDisplay = info?.configFileDisplay || `${codexDirDisplay}/config.toml`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-apple-fade-in">
      <div className="w-full max-w-xl animate-apple-scale-in glass-modal shadow-2xl">
        <div className="relative">

          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-[hsl(var(--border))] dark:border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[hsl(var(--accent))] to-indigo-600 flex items-center justify-center text-xl shadow-xl shadow-blue-500/30 ring-4 ring-[hsl(var(--accent))/0.1]">⚙️</div>
                <div>
                  <h2 className="text-apple-title text-base">全局配置</h2>
                  <p className="text-apple-caption mt-0.5 opacity-60">config.toml · default model + [agents]</p>
                </div>
              </div>
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-all duration-300 active:scale-90">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">
            {/* 服务器信息卡片 */}
            {info && (
              <div className="p-4 rounded-2xl text-[11px] space-y-2 animate-apple-fade-in bg-[hsl(var(--muted))/0.6] dark:bg-white/6 border border-[hsl(var(--border))] dark:border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))] font-bold uppercase tracking-widest text-[10px]">配置目录</span>
                  <code className="text-[hsl(var(--foreground))] font-mono opacity-70 text-[11px] max-w-[200px] truncate">{codexDirDisplay}</code>
                </div>
                <div className="h-px bg-[hsl(var(--border))]" />
                <div className="flex items-center justify-between">
                  <span className="text-[hsl(var(--muted-foreground))] font-bold uppercase tracking-widest text-[10px]">系统平台</span>
                  <code className="text-[hsl(var(--foreground))] font-mono opacity-70 text-[11px]">{info.platform}</code>
                </div>
              </div>
            )}

            {legacyAgent && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] leading-relaxed space-y-3">
                <p>
                  检测到旧的 <code className="font-mono">agent = "{legacyAgent}"</code> 字段。
                  这个字段不会可靠切换当前主会话预设，主会话默认模型请以下面的 <code className="font-mono">model</code> 设置为准。
                </p>
                <button
                  type="button"
                  onClick={handleRemoveLegacyAgent}
                  disabled={removingLegacyAgent}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700 transition-all hover:bg-amber-500/15 disabled:opacity-60 dark:text-amber-300"
                >
                  {removingLegacyAgent ? '正在移除…' : '一键移除旧 agent 字段'}
                </button>
              </div>
            )}

            <div className="space-y-5 animate-apple-fade-in [animation-delay:0.03s]">
              <div>
                <p className="text-apple-title text-sm">新会话默认模型</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">
                  这里写入 <code className="font-mono">config.toml</code> 顶层字段，通常只对新开的 Codex 会话生效。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                    placeholder="留空继承登录态/默认 provider"
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

            <div className="space-y-1">
              <p className="text-apple-title text-sm">Agents 并发设置</p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">这些字段写入 <code className="font-mono">[agents]</code>。</p>
            </div>

            {/* max_threads */}
            <div className="animate-apple-fade-in [animation-delay:0.05s]">
              <label className={labelCls}>
                max_threads
                <span className="ml-2 font-normal opacity-50 normal-case">（默认 6）</span>
              </label>
              <input type="number" min="1" max="32" value={form.max_threads}
                onChange={e => handleChange('max_threads', e.target.value)}
                placeholder="6"
                className={inputCls} />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 ml-1 opacity-70 font-medium">最大并行线程数</p>
            </div>

            {/* max_depth */}
            <div className="animate-apple-fade-in [animation-delay:0.1s]">
              <label className={labelCls}>
                max_depth
                <span className="ml-2 font-normal opacity-50 normal-case">（默认 1）</span>
              </label>
              <input type="number" min="0" max="5" value={form.max_depth}
                onChange={e => handleChange('max_depth', e.target.value)}
                placeholder="1"
                className={inputCls} />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 ml-1 opacity-70 font-medium">子代理嵌套深度上限</p>
            </div>

            {/* job_max_runtime_seconds */}
            <div className="animate-apple-fade-in [animation-delay:0.15s]">
              <label className={labelCls}>
                job_max_runtime_seconds
                <span className="ml-2 font-normal opacity-50 normal-case">（单位：秒）</span>
              </label>
              <input type="number" min="60" value={form.job_max_runtime_seconds}
                onChange={e => handleChange('job_max_runtime_seconds', e.target.value)}
                placeholder="1800"
                className={inputCls} />
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-2 ml-1 opacity-70 font-medium">批处理任务单次超时限制</p>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[12px] font-bold animate-apple-fade-in">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-8 py-5 border-t border-[hsl(var(--border))] dark:border-white/10 bg-[hsl(var(--muted))/0.3] dark:bg-white/3">
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-50 font-mono">
              {configFileDisplay}
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose}
                className="glass-button !px-6 !h-11 !border-none !shadow-none hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] font-bold text-xs uppercase tracking-widest active:scale-95 transition-all duration-300">
                取消
              </button>
              <button onClick={handleSave} disabled={saving}
                className="glass-button-primary !px-8 !h-11 shadow-xl shadow-blue-500/25">
                {saving ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : saved ? (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-bold text-xs uppercase tracking-widest">已保存</span>
                  </div>
                ) : <span className="font-bold text-xs uppercase tracking-widest">保存</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
