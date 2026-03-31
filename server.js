require('dotenv').config();
const { exec } = require('child_process');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const TOML = require('@iarna/toml');

const app = express();
const PORT = process.env.PORT || 3737;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Codex 配置目录（支持 CODEX_DIR env var 覆盖，跨平台）
const CODEX_DIR = process.env.CODEX_DIR
  ? path.resolve(process.env.CODEX_DIR.replace(/^~/, os.homedir()))
  : path.join(os.homedir(), '.codex');
const CONFIG_FILE = path.join(CODEX_DIR, 'config.toml');
const AGENTS_DIR = path.join(CODEX_DIR, 'agents');
const APP_STATE_FILE = path.join(CODEX_DIR, 'codex-subagent-manager-state.json');

app.use(cors());
app.use(express.json());

// 生产模式：服务前端静态文件
const DIST_DIR = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

// 内置 Agent 预设（description/developer_instructions 保持英文，与 Codex 官方一致）
const BUILTIN_AGENTS = [
  {
    name: 'default',
    builtin: true,
    description: 'General-purpose fallback agent. Handles a broad mix of tasks including questions, explanations, planning, and light coding work. Best choice when the task is ambiguous or spans multiple domains.',
    developer_instructions: `You are a general-purpose AI coding assistant. Adapt your approach to the task at hand.

Core behaviors:
- For questions and analysis: be concise, structured, and accurate. Cite file paths and line numbers where relevant.
- For planning tasks: produce a clear, actionable outline before diving into details.
- For coding tasks: read relevant files first, then implement minimal, correct changes.
- Prefer specific answers over vague generalities. If uncertain, say so explicitly.
- Match response depth to task complexity — short questions get short answers.

Output format:
- Use markdown with headers and bullet lists for structured content.
- Use inline code for identifiers, file paths, and commands.
- Avoid unnecessary preamble or filler phrases.`,
    icon: '⚡',
    color: 'blue',
  },
  {
    name: 'worker',
    builtin: true,
    description: 'Execution-focused agent for implementation and fixes. Use for writing code, applying patches, running commands, debugging, and any task that requires making concrete changes to the codebase.',
    developer_instructions: `You are an execution-focused coding agent. Your primary job is to implement, fix, and deliver working code.

Core behaviors:
- Read relevant files before editing. Never modify blindly.
- Use apply_patch for code edits. Parallelize independent reads but keep writes sequential.
- Fix root causes, not symptoms. Trace the actual failure path before patching.
- Run lint/build/test after changes to verify correctness.
- Keep changes minimal and scoped. Avoid refactoring unrelated code.
- Communicate what you changed and why, not a line-by-line narration.
- If a task is ambiguous, ask one clarifying question before proceeding.
- Prefer reversible changes and incremental commits over large rewrites.

Output format:
- Lead with what was done (not what you plan to do).
- Use flat lists and short sections. No nested bullets.
- Reference files with inline code paths including line numbers where relevant.
- End with verification result or remaining blockers if any.`,
    icon: '🔧',
    color: 'orange',
  },
  {
    name: 'explorer',
    builtin: true,
    description: 'Read-heavy codebase exploration agent. Ideal for understanding existing code, navigating large repos, tracing data flows, and producing summaries — without making any changes.',
    developer_instructions: `You are a read-heavy codebase exploration agent. Your job is to understand and explain, not to modify.

Core behaviors:
- Navigate the codebase systematically: start from entry points, follow imports and call chains.
- Summarize structure, data flows, and design patterns clearly.
- Identify key abstractions, interfaces, and architectural boundaries.
- When asked about a bug or behavior, trace the exact code path without patching anything.
- Cross-reference multiple files to form a complete picture before concluding.
- Avoid making changes to any file unless the user explicitly asks you to.
- If you cannot locate something, say so rather than guessing.

Output format:
- Use headers to organize findings by module, layer, or concern.
- Include precise file paths and line numbers for every claim.
- Diagrams (Mermaid or ASCII) are welcome for complex flows.
- End with a concise summary of key findings and any open questions.`,
    icon: '🔍',
    color: 'green',
  },
];

const BUILTIN_AGENT_MAP = new Map(BUILTIN_AGENTS.map((agent) => [agent.name, agent]));
const BUILTIN_AGENT_NAMES = new Set(BUILTIN_AGENTS.map((agent) => agent.name));

function ensureCodexDir() {
  if (!fs.existsSync(CODEX_DIR)) {
    fs.mkdirSync(CODEX_DIR, { recursive: true });
  }
}

function toDisplayPath(targetPath) {
  const homeDir = os.homedir();
  if (!targetPath) return targetPath;
  if (targetPath === homeDir) return '~';
  if (targetPath.startsWith(homeDir + path.sep)) {
    return `~${targetPath.slice(homeDir.length).replace(/\\/g, '/')}`;
  }
  return targetPath.replace(/\\/g, '/');
}

function shouldAutoOpenBrowser() {
  return fs.existsSync(DIST_DIR) && process.env.AUTO_OPEN_BROWSER !== 'false';
}

function openBrowser(url) {
  const escapedUrl = `"${url}"`;
  let command = null;

  if (process.platform === 'win32') {
    command = `start "" ${escapedUrl}`;
  } else if (process.platform === 'darwin') {
    command = `open ${escapedUrl}`;
  } else {
    command = `xdg-open ${escapedUrl}`;
  }

  exec(command, (err) => {
    if (err) {
      console.warn(`Failed to open browser automatically: ${err.message}`);
    }
  });
}

function ensureAgentsDir() {
  ensureCodexDir();
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

function readAppState() {
  if (!fs.existsSync(APP_STATE_FILE)) return {};
  try {
    const parsed = JSON.parse(readTextFile(APP_STATE_FILE));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`Failed to parse app state file "${APP_STATE_FILE}": ${err.message}`);
    return {};
  }
}

function extractModelConfigSnapshot(source = {}) {
  return {
    model: toTrimmedStringOrNull(source.model),
    model_provider: toTrimmedStringOrNull(source.model_provider),
    model_reasoning_effort: toTrimmedStringOrNull(source.model_reasoning_effort),
  };
}

function modelConfigSnapshotsMatch(left = {}, right = {}) {
  const normalizedLeft = extractModelConfigSnapshot(left);
  const normalizedRight = extractModelConfigSnapshot(right);
  return normalizedLeft.model === normalizedRight.model
    && normalizedLeft.model_provider === normalizedRight.model_provider
    && normalizedLeft.model_reasoning_effort === normalizedRight.model_reasoning_effort;
}

function writeAppState(state) {
  ensureCodexDir();
  const appliedPresetId = toTrimmedStringOrNull(state?.appliedPresetId);
  if (!appliedPresetId) {
    if (fs.existsSync(APP_STATE_FILE)) {
      fs.unlinkSync(APP_STATE_FILE);
    }
    return;
  }

  fs.writeFileSync(APP_STATE_FILE, JSON.stringify({
    appliedPresetId,
    appliedModelConfig: extractModelConfigSnapshot(state?.appliedModelConfig),
  }, null, 2), 'utf8');
}

function updateAppliedPresetState(nextState = {}) {
  writeAppState({ ...readAppState(), ...nextState });
  return readAppState();
}

function getPresetIdForAgentName(name, { builtin = false, projectDir = null } = {}) {
  if (projectDir) {
    return `project:${path.resolve(projectDir)}:${name}`;
  }
  return `${builtin ? 'builtin' : 'custom'}:${name}`;
}

function getEffectiveModelConfigSnapshot(agent, globalConfig = {}) {
  const effectiveAgent = withEffectiveAgentConfig(agent, globalConfig);
  return extractModelConfigSnapshot({
    model: effectiveAgent.effective_model,
    model_provider: effectiveAgent.effective_model_provider,
    model_reasoning_effort: effectiveAgent.effective_model_reasoning_effort,
  });
}

function syncAppliedPresetForAgent(agent, presetId, globalConfig = readConfig()) {
  const appState = readAppState();
  if (appState.appliedPresetId !== presetId) return;

  const nextSnapshot = getEffectiveModelConfigSnapshot(agent, globalConfig);
  if (!modelConfigSnapshotsMatch(appState.appliedModelConfig, nextSnapshot)) {
    writeAppState({});
  }
}

function getAppliedPresetId(config = {}) {
  const appState = readAppState();
  if (!toTrimmedStringOrNull(appState.appliedPresetId)) return null;
  if (!modelConfigSnapshotsMatch(appState.appliedModelConfig, config)) {
    writeAppState({});
    return null;
  }
  return appState.appliedPresetId;
}

function stripBom(content) {
  return typeof content === 'string' ? content.replace(/^\uFEFF/, '') : content;
}

function readTextFile(filePath) {
  return stripBom(fs.readFileSync(filePath, 'utf8'));
}

function parseTomlFile(filePath) {
  return TOML.parse(readTextFile(filePath));
}

function parseTomlContent(content) {
  return TOML.parse(stripBom(content));
}

function tryParseTomlFile(filePath, fallback = null) {
  try {
    return parseTomlFile(filePath);
  } catch (err) {
    console.warn(`Failed to parse TOML file "${filePath}": ${err.message}`);
    return fallback;
  }
}

function listTomlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith('.toml'));
}

function extractImportCandidates(rawContent) {
  const normalizedContent = stripBom(typeof rawContent === 'string' ? rawContent : '').trim();
  if (!normalizedContent) return [];

  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidate, source) => {
    const normalizedCandidate = stripBom(typeof candidate === 'string' ? candidate : '').trim();
    if (!normalizedCandidate || seen.has(normalizedCandidate)) return;
    seen.add(normalizedCandidate);
    candidates.push({ content: normalizedCandidate, source });
  };

  addCandidate(normalizedContent, 'raw');

  const fencedBlockPattern = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = fencedBlockPattern.exec(normalizedContent)) !== null) {
    const label = match[1].trim().toLowerCase();
    const source = label ? `code:${label}` : 'code';
    addCandidate(match[2], source);
  }

  return candidates;
}

function isRecognizedAgentConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const supportedKeys = new Set([
    'name',
    'description',
    'developer_instructions',
    'model',
    'model_provider',
    'model_reasoning_effort',
    'sandbox_mode',
    'nickname_candidates',
    'mcp_servers',
  ]);

  return Object.keys(config).some((key) => supportedKeys.has(key));
}

function parseImportedAgentContent(content) {
  const candidates = extractImportCandidates(content);
  if (candidates.length === 0) {
    throw new Error('导入内容为空');
  }

  const errors = [];
  for (const candidate of candidates) {
    try {
      const parsed = parseTomlContent(candidate.content);
      if (!isRecognizedAgentConfig(parsed)) {
        errors.push(`${candidate.source}: 缺少可识别的 agent 字段`);
        continue;
      }
      return { parsed, source: candidate.source };
    } catch (err) {
      errors.push(`${candidate.source}: ${err.message}`);
    }
  }

  throw new Error(`未能识别有效的 Agent TOML 配置。${errors[0] ? `首个错误：${errors[0]}` : ''}`);
}

function normalizeImportedAgentConfig(config = {}) {
  return {
    name: toTrimmedStringOrNull(config.name) || '',
    description: typeof config.description === 'string' ? config.description : '',
    developer_instructions: typeof config.developer_instructions === 'string' ? config.developer_instructions : '',
    model: toTrimmedStringOrNull(config.model) || '',
    model_provider: toTrimmedStringOrNull(config.model_provider) || '',
    model_reasoning_effort: toTrimmedStringOrNull(config.model_reasoning_effort) || '',
    sandbox_mode: toTrimmedStringOrNull(config.sandbox_mode) || '',
    nickname_candidates: Array.isArray(config.nickname_candidates)
      ? config.nickname_candidates.filter((item) => typeof item === 'string')
      : (typeof config.nickname_candidates === 'string' ? [config.nickname_candidates] : []),
    mcp_servers: config.mcp_servers && typeof config.mcp_servers === 'object' && !Array.isArray(config.mcp_servers)
      ? config.mcp_servers
      : {},
  };
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, cloneValue(val)]));
  }
  return value;
}

function isBlankString(value) {
  return typeof value === 'string' && value.trim() === '';
}

function toTrimmedStringOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanConfigValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return isBlankString(value) ? undefined : value;
  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => cleanConfigValue(item))
      .filter((item) => item !== undefined);
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (value && typeof value === 'object') {
    const cleaned = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const nextValue = cleanConfigValue(nestedValue);
      if (nextValue !== undefined) cleaned[key] = nextValue;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  return value;
}

function pickNonBlankValue(...values) {
  for (const value of values) {
    const cleaned = cleanConfigValue(value);
    if (cleaned !== undefined) return cleaned;
  }
  return undefined;
}

function setOptionalConfigValue(target, key, value) {
  const cleaned = cleanConfigValue(value);
  if (cleaned === undefined) {
    delete target[key];
  } else {
    target[key] = cleaned;
  }
}

function getConfiguredModelProviderNames(globalConfig = {}) {
  const providers = globalConfig?.model_providers;
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    return new Set();
  }

  return new Set(
    Object.keys(providers)
      .map((name) => toTrimmedStringOrNull(name))
      .filter(Boolean),
  );
}

function isKnownModelProvider(provider, globalConfig = {}) {
  const normalizedProvider = toTrimmedStringOrNull(provider);
  if (!normalizedProvider) return false;

  const configuredProviders = getConfiguredModelProviderNames(globalConfig);
  if (configuredProviders.size === 0) return true;
  if (configuredProviders.has(normalizedProvider)) return true;

  return normalizedProvider === toTrimmedStringOrNull(globalConfig.model_provider);
}

function normalizeAgentModelProvider(agent, globalConfig = {}) {
  const agentName = toTrimmedStringOrNull(agent?.name);
  const normalizedProvider = toTrimmedStringOrNull(agent?.model_provider);
  if (!agentName || !normalizedProvider) {
    return { modelProvider: null, staleModelProvider: null };
  }

  if (isKnownModelProvider(normalizedProvider, globalConfig)) {
    return { modelProvider: normalizedProvider, staleModelProvider: null };
  }

  return {
    modelProvider: null,
    staleModelProvider: normalizedProvider,
  };
}

function getBuiltinAgentBase(name) {
  const builtin = BUILTIN_AGENT_MAP.get(name);
  if (!builtin) return null;
  return {
    name: builtin.name,
    description: builtin.description,
    developer_instructions: builtin.developer_instructions,
  };
}

function normalizeMcpServers(existingValue, payload) {
  if (payload === undefined) {
    return cleanConfigValue(existingValue);
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const normalized = {};
    for (const [serverName, serverConfig] of Object.entries(payload)) {
      if (isBlankString(serverName)) continue;
      const cleanedConfig = cleanConfigValue(serverConfig);
      if (cleanedConfig !== undefined) normalized[serverName.trim()] = cleanedConfig;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  if (!Array.isArray(payload)) return undefined;

  const existingServers = existingValue && typeof existingValue === 'object' ? existingValue : {};
  const normalized = {};

  for (const item of payload) {
    if (!item) continue;

    const nextName = toTrimmedStringOrNull(item.name);
    if (!nextName) continue;

    const originalName = toTrimmedStringOrNull(item.original_name) || nextName;
    const baseConfig = existingServers[originalName] && typeof existingServers[originalName] === 'object'
      ? cloneValue(existingServers[originalName])
      : {};
    const mergedConfig = { ...baseConfig };
    delete mergedConfig.transport;

    for (const [key, rawValue] of Object.entries(item)) {
      if (key === 'name' || key === 'original_name' || key === 'transport') continue;
      const cleanedValue = cleanConfigValue(rawValue);
      if (cleanedValue === undefined) {
        delete mergedConfig[key];
      } else {
        mergedConfig[key] = cleanedValue;
      }
    }

    const cleanedConfig = cleanConfigValue(mergedConfig);
    if (cleanedConfig !== undefined) normalized[nextName] = cleanedConfig;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return tryParseTomlFile(CONFIG_FILE, {}) || {};
}

function writeConfig(config) {
  ensureCodexDir();
  fs.writeFileSync(CONFIG_FILE, TOML.stringify(config), 'utf8');
}

function findAgentFileByName(dir, name) {
  for (const file of listTomlFiles(dir)) {
    const parsed = tryParseTomlFile(path.join(dir, file));
    if (parsed?.name === name) return file;
  }
  return null;
}

function loadCustomAgents() {
  ensureAgentsDir();
  const agents = [];
  for (const file of listTomlFiles(AGENTS_DIR)) {
    const parsed = tryParseTomlFile(path.join(AGENTS_DIR, file));
    if (parsed) agents.push({ ...parsed, builtin: false, _file: file });
  }
  return agents;
}

function loadProjectAgents(projectDir) {
  const resolvedProjectDir = path.resolve(projectDir);
  const dir = path.join(resolvedProjectDir, '.codex', 'agents');
  const agents = [];
  if (!fs.existsSync(dir)) return agents;
  for (const file of listTomlFiles(dir)) {
    const parsed = tryParseTomlFile(path.join(dir, file));
    if (parsed) agents.push({ ...parsed, builtin: false, _file: file, _scope: 'project', _projectDir: resolvedProjectDir });
  }
  return agents;
}

// 从请求体中提取可编辑字段，并保留未展示的高级配置
function mergeAgentData(baseAgent, body) {
  const data = cloneValue(baseAgent || {});
  const {
    name,
    description,
    developer_instructions,
    model,
    model_provider,
    model_reasoning_effort,
    sandbox_mode,
    nickname_candidates,
    mcp_servers,
  } = body;

  data.name = name;
  data.description = description;
  data.developer_instructions = developer_instructions;
  setOptionalConfigValue(data, 'model', model);
  setOptionalConfigValue(data, 'model_provider', model_provider);
  setOptionalConfigValue(data, 'model_reasoning_effort', model_reasoning_effort);
  setOptionalConfigValue(data, 'sandbox_mode', sandbox_mode);
  setOptionalConfigValue(data, 'nickname_candidates', nickname_candidates);

  const nextMcpServers = normalizeMcpServers(data.mcp_servers, mcp_servers);
  if (nextMcpServers === undefined) {
    delete data.mcp_servers;
  } else {
    data.mcp_servers = nextMcpServers;
  }

  return data;
}

function getPersistedAgentData(agent = {}) {
  const persisted = {};
  for (const [key, value] of Object.entries(agent)) {
    if (key === 'builtin' || key === 'overridden' || key === 'icon' || key === 'color') continue;
    if (key.startsWith('_')) continue;
    if (key.startsWith('effective_')) continue;
    persisted[key] = cloneValue(value);
  }
  return persisted;
}

function cleanupLegacyBuiltinAgentModelProvider(agent, globalConfig = {}) {
  const { staleModelProvider } = normalizeAgentModelProvider(agent, globalConfig);
  if (!staleModelProvider) return agent;
  if (!BUILTIN_AGENT_NAMES.has(toTrimmedStringOrNull(agent?.name))) return agent;

  const cleanedAgent = cloneValue(agent);
  delete cleanedAgent.model_provider;
  return cleanedAgent;
}

// 为展示层补齐 agent 实际生效的模型配置：优先 agent，自身没有时回退到全局 config.toml
function withEffectiveAgentConfig(agent, globalConfig = {}) {
  const hasAgentModel = pickNonBlankValue(agent.model) !== undefined;
  const normalizedAgent = cleanupLegacyBuiltinAgentModelProvider(agent, globalConfig);
  const normalizedModelProvider = pickNonBlankValue(normalizeAgentModelProvider(agent, globalConfig).modelProvider);
  const hasAgentModelProvider = normalizedModelProvider !== undefined;
  const hasAgentReasoningEffort = pickNonBlankValue(agent.model_reasoning_effort) !== undefined;
  const effectiveModel = pickNonBlankValue(normalizedAgent.model, globalConfig.model);
  const effectiveModelProvider = pickNonBlankValue(normalizedModelProvider, globalConfig.model_provider);
  const effectiveModelReasoningEffort = pickNonBlankValue(agent.model_reasoning_effort, globalConfig.model_reasoning_effort);

  return {
    ...normalizedAgent,
    effective_model: effectiveModel ?? null,
    effective_model_provider: effectiveModelProvider ?? null,
    effective_model_reasoning_effort: effectiveModelReasoningEffort ?? null,
    effective_model_source: hasAgentModel ? 'agent' : effectiveModel ? 'global' : null,
    effective_model_provider_source: hasAgentModelProvider ? 'agent' : effectiveModelProvider ? 'global' : null,
    effective_model_reasoning_effort_source: hasAgentReasoningEffort ? 'agent' : effectiveModelReasoningEffort ? 'global' : null,
  };
}

// GET /api/agents — 返回内置 + 自定义 agents；?project=<dir> 追加项目级 agents
app.get('/api/agents', (req, res) => {
  const config = readConfig();
  const custom = loadCustomAgents().map((agent) => {
    const cleanedAgent = cleanupLegacyBuiltinAgentModelProvider(agent, config);
    if (!BUILTIN_AGENT_NAMES.has(cleanedAgent.name) || cleanedAgent.model_provider === agent.model_provider) {
      return cleanedAgent;
    }

    const targetFile = agent._file ? path.join(AGENTS_DIR, agent._file) : null;
    if (targetFile) {
      try {
        fs.writeFileSync(targetFile, TOML.stringify(getPersistedAgentData(cleanedAgent)), 'utf8');
      } catch (err) {
        console.warn(`Failed to clean legacy model_provider for built-in agent "${cleanedAgent.name}": ${err.message}`);
      }
    }

    return cleanedAgent;
  });
  const customByName = new Map(custom.map((agent) => [agent.name, agent]));
  const builtins = BUILTIN_AGENTS.map((builtin) => {
    const override = customByName.get(builtin.name);
    if (!override) return withEffectiveAgentConfig({ ...builtin, overridden: false }, config);
    return {
      ...withEffectiveAgentConfig({
        ...builtin,
        ...override,
        builtin: true,
        overridden: true,
        icon: builtin.icon,
        color: builtin.color,
      }, config),
    };
  });
  const customVisible = custom
    .filter((agent) => !BUILTIN_AGENT_NAMES.has(agent.name))
    .map((agent) => withEffectiveAgentConfig(agent, config));
  let project = [];
  if (req.query.project) {
    try {
      project = loadProjectAgents(req.query.project).map((agent) => withEffectiveAgentConfig(agent, config));
    } catch {}
  }
  res.json({ builtin: builtins, custom: customVisible, project });
});

// GET /api/config — 返回当前 config.toml
app.get('/api/config', (req, res) => {
  const config = readConfig();
  res.json({
    legacyAgent: config.agent || null,
    model: config.model || null,
    model_provider: config.model_provider || null,
    model_reasoning_effort: config.model_reasoning_effort || null,
    appliedPresetId: getAppliedPresetId(config),
    raw: config,
  });
});

// PUT /api/config/default-model — 更新全局默认模型配置（作用于新会话）
app.put('/api/config/default-model', (req, res) => {
  const { model, model_provider, model_reasoning_effort, appliedPresetId } = req.body;
  const config = readConfig();

  setOptionalConfigValue(config, 'model', model);
  setOptionalConfigValue(config, 'model_provider', model_provider);
  setOptionalConfigValue(config, 'model_reasoning_effort', model_reasoning_effort);

  try {
    writeConfig(config);
    if (Object.prototype.hasOwnProperty.call(req.body, 'appliedPresetId')) {
      updateAppliedPresetState({
        appliedPresetId,
        appliedModelConfig: extractModelConfigSnapshot(config),
      });
    } else {
      updateAppliedPresetState({ appliedPresetId: null, appliedModelConfig: null });
    }
    res.json({
      ok: true,
      model: config.model || null,
      model_provider: config.model_provider || null,
      model_reasoning_effort: config.model_reasoning_effort || null,
      appliedPresetId: getAppliedPresetId(config),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/config/legacy-agent — 移除旧的顶层 agent 字段，避免误导为主会话预设切换
app.delete('/api/config/legacy-agent', (req, res) => {
  const config = readConfig();
  const removed = config.agent ?? null;
  delete config.agent;

  try {
    writeConfig(config);
    res.json({ ok: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/import-parse — 从粘贴文本或文件内容中识别 agent TOML
app.post('/api/agents/import-parse', (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    const { parsed, source } = parseImportedAgentContent(content);
    res.json({
      ok: true,
      source,
      agent: normalizeImportedAgentConfig(parsed),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents — 创建新自定义 agent（支持全字段）
app.post('/api/agents', (req, res) => {
  const { name, description, developer_instructions } = req.body;
  if (!name || !description || !developer_instructions) {
    return res.status(400).json({ error: 'name, description, developer_instructions are required' });
  }
  ensureAgentsDir();
  const normalizedName = name.trim();
  const filename = `${normalizedName.replace(/[^a-z0-9_-]/gi, '-')}.toml`;
  const filePath = path.join(AGENTS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.status(409).json({ error: `Agent "${normalizedName}" already exists` });
  }
  const agentData = mergeAgentData({}, { ...req.body, name: normalizedName });
  fs.writeFileSync(filePath, TOML.stringify(agentData), 'utf8');
  res.json({ ok: true, file: filename });
});

// PUT /api/agents/:name — 更新 agent（若文件不存在则新建，用于内置 agent 首次覆盖；支持全字段）
app.put('/api/agents/:name', (req, res) => {
  const { name } = req.params;
  const isBuiltin = BUILTIN_AGENT_NAMES.has(name);
  ensureAgentsDir();
  let targetFile = findAgentFileByName(AGENTS_DIR, name);
  if (!targetFile) targetFile = `${name.replace(/[^a-z0-9_-]/gi, '-')}.toml`;
  const { description, developer_instructions } = req.body;
  if (!description || !developer_instructions) {
    return res.status(400).json({ error: 'description and developer_instructions are required' });
  }
  const existingPath = path.join(AGENTS_DIR, targetFile);
  const existingAgent = fs.existsSync(existingPath)
    ? tryParseTomlFile(existingPath, {}) || {}
    : (getBuiltinAgentBase(name) || {});
  const agentData = mergeAgentData(existingAgent, { ...req.body, name });
  fs.writeFileSync(path.join(AGENTS_DIR, targetFile), TOML.stringify(agentData), 'utf8');
  syncAppliedPresetForAgent(agentData, getPresetIdForAgentName(name, { builtin: isBuiltin }));
  res.json({ ok: true });
});

// DELETE /api/agents/:name — 删除自定义 agent
app.delete('/api/agents/:name', (req, res) => {
  const { name } = req.params;
  ensureAgentsDir();
  const targetFile = findAgentFileByName(AGENTS_DIR, name);
  if (!targetFile) return res.status(404).json({ error: `Agent "${name}" not found` });
  fs.unlinkSync(path.join(AGENTS_DIR, targetFile));
  if (readAppState().appliedPresetId === `custom:${name}`) {
    writeAppState({});
  }
  res.json({ ok: true });
});

// POST /api/agents/:name/reset — 重置内置 agent（删除覆盖文件，恢复预设）
app.post('/api/agents/:name/reset', (req, res) => {
  const { name } = req.params;
  const isBuiltin = BUILTIN_AGENTS.some(a => a.name === name);
  if (!isBuiltin) return res.status(400).json({ error: `"${name}" is not a built-in agent` });
  ensureAgentsDir();
  let deleted = false;
  const targetFile = findAgentFileByName(AGENTS_DIR, name);
  if (targetFile) {
    fs.unlinkSync(path.join(AGENTS_DIR, targetFile));
    deleted = true;
  }
  const builtinBase = getBuiltinAgentBase(name) || { name };
  syncAppliedPresetForAgent(builtinBase, getPresetIdForAgentName(name, { builtin: true }));
  res.json({ ok: true, deleted });
});

// GET /api/agents/:name/file — 返回 TOML 原文
app.get('/api/agents/:name/file', (req, res) => {
  const { name } = req.params;
  ensureAgentsDir();
  for (const file of listTomlFiles(AGENTS_DIR)) {
    const filePath = path.join(AGENTS_DIR, file);
    const parsed = tryParseTomlFile(filePath);
    if (parsed?.name === name) {
      return res.json({ content: readTextFile(filePath), file });
    }
  }
  res.status(404).json({ error: 'not found' });
});

// GET /api/config/agents — 返回 [agents] 全局配置
app.get('/api/config/agents', (req, res) => {
  const config = readConfig();
  const agents = config.agents || {};
  res.json({
    max_threads: agents.max_threads ?? null,
    max_depth: agents.max_depth ?? null,
    job_max_runtime_seconds: agents.job_max_runtime_seconds ?? null,
  });
});

// PUT /api/config/agents — 更新 [agents] 全局配置
app.put('/api/config/agents', (req, res) => {
  const { max_threads, max_depth, job_max_runtime_seconds } = req.body;
  const config = readConfig();
  if (!config.agents) config.agents = {};
  if (max_threads !== undefined && max_threads !== null && max_threads !== '') {
    config.agents.max_threads = Number(max_threads);
  } else { delete config.agents.max_threads; }
  if (max_depth !== undefined && max_depth !== null && max_depth !== '') {
    config.agents.max_depth = Number(max_depth);
  } else { delete config.agents.max_depth; }
  if (job_max_runtime_seconds !== undefined && job_max_runtime_seconds !== null && job_max_runtime_seconds !== '') {
    config.agents.job_max_runtime_seconds = Number(job_max_runtime_seconds);
  } else { delete config.agents.job_max_runtime_seconds; }
  if (Object.keys(config.agents).length === 0) delete config.agents;
  try {
    writeConfig(config);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/info — 返回服务器环境信息
app.get('/api/info', (req, res) => {
  res.json({
    codexDir: CODEX_DIR,
    codexDirDisplay: toDisplayPath(CODEX_DIR),
    configFileDisplay: `${toDisplayPath(CODEX_DIR)}/config.toml`,
    port: PORT,
    platform: process.platform,
  });
});

// SPA fallback — 生产模式下所有未匹配路由返回 index.html
if (fs.existsSync(DIST_DIR)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Codex Subagent Manager running at ${APP_URL}`);
  console.log(`Codex config dir: ${CODEX_DIR}`);
  if (fs.existsSync(DIST_DIR)) {
    console.log('Mode: production (serving built frontend)');
    if (shouldAutoOpenBrowser()) {
      console.log(`Opening browser at ${APP_URL}`);
      openBrowser(APP_URL);
    }
  } else {
    console.log('Mode: development (frontend served by Vite on :5173)');
  }
});
