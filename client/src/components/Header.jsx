import React, { useState, useEffect } from 'react'

export default function Header({ defaultModelSummary, onRefresh, loading, onSettings, codexDir = '~/.codex' }) {
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'))

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  return (
    <header className="sticky top-0 z-40 w-full bg-[hsl(var(--background))/0.8] pt-3 px-4 pb-0 backdrop-blur-sm">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between h-14 px-5 rounded-2xl border border-[hsl(var(--border))] shadow-sm bg-[hsl(var(--background))]">

          {/* Logo + Title */}
          <div className="flex items-center gap-3 group cursor-default">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--accent))] to-indigo-600 flex items-center justify-center text-base shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
              🤖
            </div>
            <div className="flex flex-col">
              <h1 className="text-[13px] font-bold tracking-tight text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors duration-300 leading-none">
                Codex Subagent Manager
              </h1>
              <p className="font-mono text-[10px] opacity-50 mt-0.5">
                {codexDir}
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {defaultModelSummary ? (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[hsl(var(--accent))/0.1] border border-[hsl(var(--accent))/0.2] animate-apple-fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))]" />
                <span className="text-[11px] font-semibold text-[hsl(var(--accent))]">
                  新会话默认模型
                </span>
                <span className="text-[11px] font-mono text-[hsl(var(--foreground))] opacity-80">
                  {defaultModelSummary}
                </span>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[hsl(var(--muted))] border border-[hsl(var(--border))] opacity-60">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" />
                <span className="text-[11px] font-medium">新会话模型未显式设置</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 pl-3 border-l border-[hsl(var(--border))]">
              <button
                onClick={() => setIsDark(!isDark)}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[hsl(var(--muted))] transition-all duration-200 active:scale-90"
                title={isDark ? '切换至亮色' : '切换至深色'}
              >
                {isDark ? (
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              <button
                onClick={onSettings}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[hsl(var(--muted))] transition-all duration-200 active:scale-90"
                title="全局配置"
              >
                <svg className="w-4 h-4 text-[hsl(var(--muted-foreground))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              <button
                onClick={onRefresh}
                disabled={loading}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[hsl(var(--muted))] transition-all duration-200 disabled:opacity-40 active:scale-90"
                title="刷新"
              >
                <svg className={`w-4 h-4 text-[hsl(var(--muted-foreground))] ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    </header>
  )
}
