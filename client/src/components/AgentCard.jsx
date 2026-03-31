import React, { useState } from 'react'

function CopyButton({ text, label = '复制名称', title = '复制名称' }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="glass-button font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-300 whitespace-nowrap shrink-0"
      title={title}
    >
      {copied ? (
        <>
          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-500 font-semibold tracking-wide">已复制</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="font-medium tracking-wide">{label}</span>
        </>
      )}
    </button>
  )
}

export default function AgentCard({ agent, onEdit, onDelete, onReset, onApply, globalConfig, isApplied = false }) {
  const [expanded, setExpanded] = useState(false)
  const targetModel = agent.model || agent.effective_model || ''
  const targetProvider = agent.model_provider || agent.effective_model_provider || ''
  const targetReasoning = agent.model_reasoning_effort || agent.effective_model_reasoning_effort || globalConfig?.model_reasoning_effort || ''
  const canApply = !!(targetModel || targetProvider || targetReasoning)
  const modelSummary = [agent.effective_model_provider || agent.model_provider, agent.effective_model || agent.model]
    .filter(Boolean)
    .join(' · ')

  return (
    <div 
      className={`glass-card relative group flex flex-col min-h-[160px] animate-apple-fade-in h-full transition-all duration-700 ${expanded ? 'h-auto' : ''} ${
        isApplied ? 'active-agent-card' : ''
      }`}
    >
      {/* 应用状态悬浮 Tag */}
      {isApplied && (
        <div className="absolute -top-3 left-6 px-3 py-1 bg-blue-500 text-white text-[11px] font-bold rounded-full shadow-lg shadow-blue-500/40 flex items-center gap-1.5 z-20 animate-apple-fade-in border border-blue-400">
          <div className="w-1.5 h-1.5 rounded-full bg-white opacity-100 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] shadow-[0_0_8px_1px_rgba(255,255,255,0.8)]" />
          正在使用
        </div>
      )}


      {/* Header */}
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-sm)]">
        <div className="w-14 h-14 rounded-[var(--radius)] bg-[hsl(var(--muted))] border border-[hsl(var(--border))] flex items-center justify-center text-2xl shadow-inner group-hover:scale-105 transition-transform duration-500 shrink-0">
          {agent.icon || '🤖'}
        </div>
        <div className="flex flex-col gap-[var(--space-xs)] min-w-0">
          <div className="flex items-center gap-[var(--space-xs)]">
            <h3 className="text-apple-title text-[hsl(var(--foreground))] truncate">{agent.name}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {agent.builtin && (
                <span className="shrink-0 text-apple-caption px-2 py-px rounded-full bg-[hsl(var(--muted))] border border-[hsl(var(--border))] font-semibold">
                  系统
                </span>
              )}
              {agent.overridden && (
                <span className="shrink-0 text-apple-caption px-2 py-px rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold">
                  已修改
                </span>
              )}
            </div>
          </div>
          {modelSummary && (
            <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))] truncate">
              {modelSummary}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-apple-body text-[hsl(var(--muted-foreground))] line-clamp-3 min-h-[3.5rem] mb-[var(--space-md)]">
        {agent.description}
      </p>

      {/* Instructions preview */}
      {agent.developer_instructions && (
        <div className="flex flex-col gap-[var(--space-sm)] mb-[var(--space-md)]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-[var(--space-xs)] text-[11px] font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors group/instr uppercase tracking-widest inline-flex w-fit"
          >
            <svg className={`w-3.5 h-3.5 transition-transform duration-500 ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            开发者指令
          </button>
          {expanded && (
            <div className="animate-apple-fade-in">
              <div className="text-[12px] text-[hsl(var(--muted-foreground))] bg-[hsl(var(--background))/0.4] rounded-[var(--radius)] p-[var(--space-sm)] lg:p-[var(--space-md)] overflow-auto max-h-64 scrollbar-thin whitespace-pre-wrap font-mono leading-relaxed border border-[hsl(var(--border))] shadow-inner">
                {agent.developer_instructions}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-[var(--space-md)] border-t border-[hsl(var(--border))]">
        <div className="flex items-center gap-[var(--space-sm)]">
          <button
            onClick={() => onEdit(agent)}
            className="flex items-center justify-center w-8 h-8 rounded-[var(--radius)] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))] transition-all active:scale-95 border border-[hsl(var(--border))] shrink-0"
            title={agent.builtin && !agent.overridden ? '配置应用的预设' : '编辑此代理'}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {agent.builtin && agent.overridden && (
            <button
              onClick={() => onReset(agent.name)}
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius)] bg-amber-500/10 shadow-sm border border-amber-500/20 hover:bg-amber-500/20 text-amber-600 transition-all active:scale-95"
              title="恢复预设"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          {!agent.builtin && (
            <button
              onClick={() => onDelete(agent.name)}
              className="flex items-center justify-center w-8 h-8 rounded-[var(--radius)] bg-red-500/10 shadow-sm border border-red-500/20 hover:bg-red-500/20 text-red-500 transition-all active:scale-95"
              title="删除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CopyButton text={agent.name} />
          {isApplied ? (
            <span className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius)] text-[12px] font-bold tracking-wide text-[hsl(var(--accent))] bg-[hsl(var(--accent))/0.1] border border-[hsl(var(--accent))/0.18] shadow-[0_8px_20px_-12px_hsl(var(--accent)/0.45)] whitespace-nowrap shrink-0">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              已应用
            </span>
          ) : canApply ? (
            <button
              onClick={() => onApply && onApply(agent)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius)] text-[12px] font-bold tracking-wide text-white bg-blue-500 hover:bg-blue-600 transition-all active:scale-95 shadow-md shadow-blue-500/20 border-none whitespace-nowrap shrink-0"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              应用配置
            </button>
          ) : (
            <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))] opacity-60 whitespace-nowrap shrink-0">
              未配置模型
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
