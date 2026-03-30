require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const TOML = require('@iarna/toml');

const app = express();
const PORT = process.env.PORT || 3737;

// Codex 配置目录（支持 CODEX_DIR env var 覆盖，跨平台）
const CODEX_DIR = process.env.CODEX_DIR
  ? path.resolve(process.env.CODEX_DIR.replace(/^~/, os.homedir()))
  : path.join(os.homedir(), '.codex');
const CONFIG_FILE = path.join(CODEX_DIR, 'config.toml');
const AGENTS_DIR = path.join(CODEX_DIR, 'agents');

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

function ensureAgentsDir() {
  ensureCodexDir();
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
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

function setOptionalConfigValue(target, key, value) {
  const cleaned = cleanConfigValue(value);
  if (cleaned === undefined) {
    delete target[key];
  } else {
    target[key] = cleaned;
  }
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
    if (!item || isBlankString(item.name)) continue;

    const nextName = item.name.trim();
    const originalName = !isBlankString(item.original_name) ? item.original_name.trim() : nextName;
    const baseConfig = existingServers[originalName] && typeof existingServers[originalName] === 'object'
      ? cloneValue(existingServers[originalName])
      : {};
    const mergedConfig = { ...baseConfig };

    for (const [key, rawValue] of Object.entries(item)) {
      if (key === 'name' || key === 'original_name') continue;
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
  const dir = path.join(path.resolve(projectDir), '.codex', 'agents');
  const agents = [];
  if (!fs.existsSync(dir)) return agents;
  for (const file of listTomlFiles(dir)) {
    const parsed = tryParseTomlFile(path.join(dir, file));
    if (parsed) agents.push({ ...parsed, builtin: false, _file: file, _scope: 'project', _projectDir: projectDir });
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

// GET /api/agents — 返回内置 + 自定义 agents；?project=<dir> 追加项目级 agents
app.get('/api/agents', (req, res) => {
  const custom = loadCustomAgents();
  const customByName = new Map(custom.map((agent) => [agent.name, agent]));
  const builtins = BUILTIN_AGENTS.map((builtin) => {
    const override = customByName.get(builtin.name);
    if (!override) return { ...builtin, overridden: false };
    return {
      ...builtin,
      ...override,
      builtin: true,
      overridden: true,
      icon: builtin.icon,
      color: builtin.color,
    };
  });
  const customVisible = custom.filter((agent) => !BUILTIN_AGENT_NAMES.has(agent.name));
  let project = [];
  if (req.query.project) {
    try { project = loadProjectAgents(req.query.project); } catch {}
  }
  res.json({ builtin: builtins, custom: customVisible, project });
});

// GET /api/config — 返回当前 config.toml
app.get('/api/config', (req, res) => {
  const config = readConfig();
  res.json({
    activeAgent: config.agent || null,
    model: config.model || null,
    model_provider: config.model_provider || null,
    raw: config,
  });
});

// POST /api/activate — 激活指定 agent
app.post('/api/activate', (req, res) => {
  const { agent } = req.body;
  if (!agent) return res.status(400).json({ error: 'agent name required' });
  const config = readConfig();
  if (agent === 'default') {
    // default agent: 删除 agent 字段（Codex 默认就是 default）
    delete config.agent;
  } else {
    config.agent = agent;
  }
  try {
    writeConfig(config);
    res.json({ ok: true, activeAgent: agent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/activate/clear — 清除激活（恢复 default）
app.post('/api/activate/clear', (req, res) => {
  const config = readConfig();
  delete config.agent;
  writeConfig(config);
  res.json({ ok: true, activeAgent: null });
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
  res.json({ ok: true });
});

// DELETE /api/agents/:name — 删除自定义 agent
app.delete('/api/agents/:name', (req, res) => {
  const { name } = req.params;
  ensureAgentsDir();
  const targetFile = findAgentFileByName(AGENTS_DIR, name);
  if (!targetFile) return res.status(404).json({ error: `Agent "${name}" not found` });
  fs.unlinkSync(path.join(AGENTS_DIR, targetFile));
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
  console.log(`Codex Agent Switcher running at http://localhost:${PORT}`);
  console.log(`Codex config dir: ${CODEX_DIR}`);
  if (fs.existsSync(DIST_DIR)) {
    console.log('Mode: production (serving built frontend)');
  } else {
    console.log('Mode: development (frontend served by Vite on :5173)');
  }
});
