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
    <header className="sticky top-4 z-40 w-full max-w-[1200px] mx-auto px-[var(--space-md)] lg:px-0 mb-8">
      <div className="w-full bg-[hsl(var(--card-bg))] border border-[hsl(var(--border))] rounded-full shadow-sm">
        <div className="flex items-center justify-between h-16 px-6 bg-transparent">

          {/* Logo + Title */}
          <div className="flex items-center gap-[var(--space-sm)] group cursor-default">
            <div className="w-8 h-8 rounded-[12px] bg-[hsl(var(--foreground))] text-[hsl(var(--background))] flex items-center justify-center text-[15px] shadow-sm transform group-hover:scale-105 transition-transform duration-300">
              🤖
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-apple-title text-[15px] text-[hsl(var(--foreground))] leading-none mb-[2px]">
                Subagent Manager
              </h1>
              <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))] leading-none">
                {codexDir}
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-[var(--space-sm)]">
            {defaultModelSummary ? (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--muted))] border border-[hsl(var(--border))] animate-apple-fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))]" />
                <span className="text-[11px] font-semibold text-[hsl(var(--foreground))] tracking-wide">
                  默认模型
                </span>
                <span className="text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
                  {defaultModelSummary}
                </span>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--muted))] border border-[hsl(var(--border))] opacity-60">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" />
                <span className="text-[11px] font-medium text-[hsl(var(--foreground))]">新会话模型未设定</span>
              </div>
            )}

            <div className="flex items-center gap-1 pl-2 ml-2 border-l border-[hsl(var(--border))]">
              <button
                onClick={() => setIsDark(!isDark)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-200 active:scale-95"
                title={isDark ? '切换至亮色' : '切换至深色'}
              >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              <button
                onClick={onSettings}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-200 active:scale-95"
                title="全局配置"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              <button
                onClick={onRefresh}
                disabled={loading}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-200 disabled:opacity-40 active:scale-95"
                title="刷新"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    </header>
  )
}
