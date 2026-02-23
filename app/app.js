/* ── Constants ────────────────────────────────────────── */

const STATUSES = ['DONE', 'PENDING', 'BLOCKED', 'DOING', 'WATCHING'];
const DEFAULT_WEIGHTS = ['Trivial', 'Easy', 'Medium', 'Hard', 'Complex'];
const DEFAULT_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];

/* ── State ───────────────────────────────────────────── */

let useApi = false;
let data = [];
let settings = { weights: [...DEFAULT_WEIGHTS], priorities: [...DEFAULT_PRIORITIES] };
let activeFilter = 'all';
let activeSort = 'default';

/* ── Helpers ─────────────────────────────────────────── */

function defaultSettings() {
  return { weights: [...DEFAULT_WEIGHTS], priorities: [...DEFAULT_PRIORITIES] };
}

function getWeightColor(label) {
  const idx = settings.weights.indexOf(label);
  if (idx === -1) return { color: '#8b949e', bg: 'rgba(139,148,158,0.15)' };
  const n = settings.weights.length;
  const hue = n <= 1 ? 60 : 120 - (idx / (n - 1)) * 120;
  return { color: `hsl(${hue}, 65%, 55%)`, bg: `hsla(${hue}, 65%, 55%, 0.15)` };
}

function getPriorityColor(label) {
  const idx = settings.priorities.indexOf(label);
  if (idx === -1) return { color: '#8b949e', bg: 'rgba(139,148,158,0.15)' };
  const n = settings.priorities.length;
  const hue = n <= 1 ? 0 : (idx / (n - 1)) * 210;
  return { color: `hsl(${hue}, 70%, 55%)`, bg: `hsla(${hue}, 70%, 55%, 0.15)` };
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function today() { return new Date().toISOString().slice(0, 10); }

function statusClass(s) { return s ? s.toLowerCase() : 'pending'; }

/* ── Data migration ──────────────────────────────────── */

function migrateStatus(s) {
  const map = { 'PENDENTE': 'PENDING', 'ACOMPANHAMENTO': 'WATCHING' };
  return map[s] || s;
}

function migrateData(arr) {
  if (!Array.isArray(arr)) return [];
  arr.forEach(section => {
    if (!section.tasks) section.tasks = [];
    section.tasks.forEach(t => {
      t.status = migrateStatus(t.status);
      if (!t.createdAt) t.createdAt = today();
      if (t.doneAt === undefined) t.doneAt = t.status === 'DONE' ? today() : null;
      if (t.weight === undefined) t.weight = null;
      if (t.priority === undefined) t.priority = null;
    });
  });
  return arr;
}

function unwrapPayload(raw) {
  if (Array.isArray(raw)) {
    return { settings: defaultSettings(), clients: migrateData(raw) };
  }
  if (raw && raw.clients) {
    const ds = defaultSettings();
    if (!raw.settings) raw.settings = ds;
    if (!raw.settings.weights || !raw.settings.weights.length) raw.settings.weights = ds.weights;
    if (!raw.settings.priorities || !raw.settings.priorities.length) raw.settings.priorities = ds.priorities;
    raw.clients = migrateData(raw.clients);
    return raw;
  }
  return { settings: defaultSettings(), clients: [] };
}

/* ── Persistence ─────────────────────────────────────── */

function updateSyncIndicator() {
  const el = document.getElementById('syncIndicator');
  if (useApi) {
    el.innerHTML = '<span class="dot synced"></span> synced to context.json';
  } else {
    el.innerHTML = '<span class="dot local"></span> local only (localStorage)';
  }
}

async function init() {
  try {
    const res = await fetch('/api/tasks');
    if (res.ok) {
      const remote = await res.json();
      useApi = true;
      const payload = unwrapPayload(remote);
      settings = payload.settings;
      data = payload.clients;
    } else {
      throw new Error('not ok');
    }
  } catch {
    useApi = false;
    const payload = loadFromLocal();
    settings = payload.settings;
    data = payload.clients;
  }
  updateSyncIndicator();
  render();
  renderSettings();
}

function loadFromLocal() {
  const saved = localStorage.getItem('pfb-tasks');
  if (saved) {
    try {
      return unwrapPayload(JSON.parse(saved));
    } catch {
      localStorage.removeItem('pfb-tasks');
    }
  }
  return { settings: defaultSettings(), clients: [] };
}

async function saveToApi() {
  try {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, clients: data }),
    });
  } catch { /* silent fail, localStorage is backup */ }
}

function save() {
  localStorage.setItem('pfb-tasks', JSON.stringify({ settings, clients: data }));
  if (useApi) saveToApi();
}

/* ── Sorting ─────────────────────────────────────────── */

function sortTasks(tasks) {
  if (activeSort === 'default') return tasks;
  return [...tasks].sort((a, b) => {
    if (activeSort === 'priority') {
      const ai = a.priority ? settings.priorities.indexOf(a.priority) : Infinity;
      const bi = b.priority ? settings.priorities.indexOf(b.priority) : Infinity;
      return ai - bi;
    }
    if (activeSort === 'weight') {
      const ai = a.weight ? settings.weights.indexOf(a.weight) : -1;
      const bi = b.weight ? settings.weights.indexOf(b.weight) : -1;
      return bi - ai;
    }
    if (activeSort === 'status') {
      return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
    }
    return 0;
  });
}

/* ── Render ───────────────────────────────────────────── */

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  data.forEach((section, ci) => {
    const filtered = sortTasks(activeFilter === 'all'
      ? section.tasks.filter(t => t.status !== 'DELETED')
      : section.tasks.filter(t => statusClass(t.status) === activeFilter));

    const active = section.tasks.filter(t => t.status !== 'DELETED');
    const total = active.length;
    const pending = active.filter(t => t.status !== 'DONE').length;

    const sec = document.createElement('div');
    sec.className = 'client-section';
    sec.innerHTML = `
      <div class="client-header">
        <div class="client-header-left" onclick="toggleSection(this.parentElement)">
          <span class="client-name" contenteditable="true" onclick="event.stopPropagation()" onblur="updateClientName(${ci}, this)">${section.client}</span>
          <span class="count">${pending} pending / ${total} total</span>
        </div>
        <div class="client-header-right">
          <button class="btn-remove-client" onclick="event.stopPropagation(); removeClient(${ci})" title="Remove client">&times;</button>
          <span class="chevron" onclick="toggleSection(this.closest('.client-header'))">&#9660;</span>
        </div>
      </div>
      <div class="task-list">
        ${filtered.map((t, ti) => {
          const realIdx = section.tasks.indexOf(t);
          const pc = t.priority ? getPriorityColor(t.priority) : null;
          const priorityHtml = pc
            ? `<span class="priority-badge" style="color:${pc.color};background:${pc.bg}" onclick="cyclePriority(${ci}, ${realIdx}, event)">${t.priority}</span>`
            : `<span class="priority-badge unset" onclick="cyclePriority(${ci}, ${realIdx}, event)">+ priority</span>`;
          const wc = t.weight ? getWeightColor(t.weight) : null;
          const weightHtml = wc
            ? `<span class="weight-badge" style="color:${wc.color};background:${wc.bg}" onclick="cycleWeight(${ci}, ${realIdx}, event)">${t.weight}</span>`
            : `<span class="weight-badge unset" onclick="cycleWeight(${ci}, ${realIdx}, event)">+ weight</span>`;
          return `
          <div class="task-item" data-status="${statusClass(t.status)}">
            <span class="badge ${statusClass(t.status)}" onclick="cycleStatus(${ci}, ${realIdx}, event)">${t.status}</span>
            <div class="task-content">
              <div class="task-title-row">
                <div class="task-title" contenteditable="true" onblur="updateTitle(${ci}, ${realIdx}, this)">${t.title}</div>
                ${priorityHtml}
                ${weightHtml}
              </div>
              <div class="task-status" contenteditable="true" onblur="updateDetail(${ci}, ${realIdx}, this)">${t.detail}</div>
              <div class="task-dates">
                ${t.createdAt ? `<span>created: ${fmtDate(t.createdAt)}</span>` : ''}
                ${t.doneAt ? `<span class="date-done">done: ${fmtDate(t.doneAt)}</span>` : ''}
                ${t.deletedAt ? `<span style="color:#f85149;background:rgba(248,81,73,0.08)">deleted: ${fmtDate(t.deletedAt)}</span>` : ''}
              </div>
            </div>
            <div class="task-actions">
              ${t.status === 'DELETED' ? `<button class="btn-icon" style="color:var(--done)" onclick="restoreTask(${ci}, ${realIdx})" title="Restore">&#8629;</button>` : ''}
              <button class="btn-icon" onclick="removeTask(${ci}, ${realIdx})" title="Remove">&times;</button>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="client-footer">
        <button class="btn-add" onclick="addTask(${ci})">+ New task</button>
      </div>
    `;
    app.appendChild(sec);
  });

  renderReport();
}

/* ── Client actions ──────────────────────────────────── */

function toggleSection(header) {
  const section = header.closest('.client-section');
  if (section) section.classList.toggle('collapsed');
}

function updateClientName(ci, el) {
  const name = el.textContent.trim();
  if (name) {
    data[ci].client = name;
    save();
    renderReport();
  } else {
    el.textContent = data[ci].client;
  }
}

function removeClient(ci) {
  if (confirm(`Remove "${data[ci].client}" and all its tasks?`)) {
    data.splice(ci, 1);
    save();
    render();
  }
}

function addClient() {
  const input = document.getElementById('newClientInput');
  const name = input.value.trim();
  if (!name) return;
  data.push({ client: name, tasks: [] });
  input.value = '';
  save();
  render();
}

/* ── Task actions ────────────────────────────────────── */

function updateTitle(ci, ti, el) {
  data[ci].tasks[ti].title = el.textContent.trim();
  save();
  renderReport();
}

function updateDetail(ci, ti, el) {
  data[ci].tasks[ti].detail = el.textContent.trim();
  save();
  renderReport();
}

function addTask(ci) {
  data[ci].tasks.push({ title: 'New task', status: 'PENDING', detail: 'Describe status here...', createdAt: today(), doneAt: null, weight: null, priority: null });
  save();
  render();
}

function removeTask(ci, ti) {
  if (data[ci].tasks[ti].status === 'DELETED') {
    if (confirm('Permanently remove this task?')) {
      data[ci].tasks.splice(ti, 1);
    } else return;
  } else {
    data[ci].tasks[ti].status = 'DELETED';
    data[ci].tasks[ti].deletedAt = today();
  }
  save();
  render();
}

function restoreTask(ci, ti) {
  data[ci].tasks[ti].status = 'PENDING';
  data[ci].tasks[ti].deletedAt = null;
  save();
  render();
}

/* ── Dropdown selector ───────────────────────────────── */

function openDropdown(event, options) {
  const sel = document.createElement('div');
  sel.className = 'status-selector';
  const rect = event.target.getBoundingClientRect();
  sel.style.top = (rect.bottom + 4) + 'px';
  sel.style.left = rect.left + 'px';
  sel.style.position = 'fixed';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.innerHTML = opt.html;
    btn.onclick = () => { opt.action(); sel.remove(); };
    sel.appendChild(btn);
  });
  document.body.appendChild(sel);
  const close = (e) => {
    if (!sel.contains(e.target)) { sel.remove(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function cycleStatus(ci, ti, event) {
  event.stopPropagation();
  const sel = document.createElement('div');
  sel.className = 'status-selector';
  const rect = event.target.getBoundingClientRect();
  sel.style.top = (rect.bottom + 4) + 'px';
  sel.style.left = rect.left + 'px';
  sel.style.position = 'fixed';

  STATUSES.forEach(s => {
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="badge ${statusClass(s)}" style="pointer-events:none">${s}</span>`;
    btn.onclick = () => {
      data[ci].tasks[ti].status = s;
      if (s === 'DONE' && !data[ci].tasks[ti].doneAt) {
        data[ci].tasks[ti].doneAt = today();
      } else if (s !== 'DONE') {
        data[ci].tasks[ti].doneAt = null;
      }
      save();
      render();
      sel.remove();
    };
    sel.appendChild(btn);
  });

  document.body.appendChild(sel);
  const close = (e) => {
    if (!sel.contains(e.target)) { sel.remove(); document.removeEventListener('click', close); }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

function cycleWeight(ci, ti, event) {
  event.stopPropagation();
  const opts = [
    { html: '<span style="color:var(--text-muted);font-size:0.8rem">\u2014 None</span>', action: () => { data[ci].tasks[ti].weight = null; save(); render(); } },
    ...settings.weights.map(w => {
      const wc = getWeightColor(w);
      return { html: `<span class="weight-badge" style="color:${wc.color};background:${wc.bg};pointer-events:none">${w}</span>`, action: () => { data[ci].tasks[ti].weight = w; save(); render(); } };
    })
  ];
  openDropdown(event, opts);
}

function cyclePriority(ci, ti, event) {
  event.stopPropagation();
  const opts = [
    { html: '<span style="color:var(--text-muted);font-size:0.8rem">\u2014 None</span>', action: () => { data[ci].tasks[ti].priority = null; save(); render(); } },
    ...settings.priorities.map(p => {
      const pc = getPriorityColor(p);
      return { html: `<span class="priority-badge" style="color:${pc.color};background:${pc.bg};pointer-events:none">${p}</span>`, action: () => { data[ci].tasks[ti].priority = p; save(); render(); } };
    })
  ];
  openDropdown(event, opts);
}

/* ── Report ──────────────────────────────────────────── */

function renderReport() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let output = '';

  data.forEach((section, ci) => {
    const activeTasks = section.tasks.filter(t => t.status !== 'DELETED');
    if (!activeTasks.length) return;
    output += `${ci + 1}. ${section.client}\n`;
    activeTasks.forEach((t, ti) => {
      const priorityStr = t.priority ? ` [${t.priority}]` : '';
      const weightStr = t.weight ? ` (${t.weight})` : '';
      output += `    ${letters[ti] || '?'}. [${t.status}]${priorityStr} ${t.title}${weightStr}\n`;
      let statusLine = `        i. ${t.detail}`;
      if (t.doneAt) statusLine += ` (done ${fmtDate(t.doneAt)})`;
      output += statusLine + '\n\n';
    });
  });

  document.getElementById('reportOutput').textContent = output.trimEnd();
}

function copyReport() {
  const text = document.getElementById('reportOutput').textContent;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  const btn = document.getElementById('btnCopy');
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
}

/* ── Settings ────────────────────────────────────────── */

function renderSettings() {
  const body = document.getElementById('settingsBody');
  body.innerHTML = `
    <div class="settings-group-title">Priority Levels</div>
    <div class="weight-config-list">
      ${settings.priorities.map((p, i) => {
        const pc = getPriorityColor(p);
        return `
        <div class="weight-config-item">
          <span class="weight-preview" style="color:${pc.color};background:${pc.bg}">${i + 1}</span>
          <input type="text" value="${p}" onchange="renamePriority(${i}, this.value)" />
          <button class="btn-remove-weight" onclick="removePriority(${i})" title="Remove">&times;</button>
        </div>`;
      }).join('')}
    </div>
    <button class="btn-add-weight" onclick="addPriority()">+ Add priority level</button>
    <div class="settings-group-title">Weight Levels</div>
    <div class="weight-config-list">
      ${settings.weights.map((w, i) => {
        const wc = getWeightColor(w);
        return `
        <div class="weight-config-item">
          <span class="weight-preview" style="color:${wc.color};background:${wc.bg}">${i + 1}</span>
          <input type="text" value="${w}" onchange="renameWeight(${i}, this.value)" />
          <button class="btn-remove-weight" onclick="removeWeight(${i})" title="Remove">&times;</button>
        </div>`;
      }).join('')}
    </div>
    <button class="btn-add-weight" onclick="addWeight()">+ Add weight level</button>
  `;
}

function renameWeight(idx, newName) {
  newName = newName.trim();
  if (!newName) return;
  const oldName = settings.weights[idx];
  data.forEach(s => s.tasks.forEach(t => { if (t.weight === oldName) t.weight = newName; }));
  settings.weights[idx] = newName;
  save(); renderSettings(); render();
}

function removeWeight(idx) {
  const removed = settings.weights[idx];
  data.forEach(s => s.tasks.forEach(t => { if (t.weight === removed) t.weight = null; }));
  settings.weights.splice(idx, 1);
  save(); renderSettings(); render();
}

function addWeight() {
  settings.weights.push('New level');
  save(); renderSettings();
}

function renamePriority(idx, newName) {
  newName = newName.trim();
  if (!newName) return;
  const oldName = settings.priorities[idx];
  data.forEach(s => s.tasks.forEach(t => { if (t.priority === oldName) t.priority = newName; }));
  settings.priorities[idx] = newName;
  save(); renderSettings(); render();
}

function removePriority(idx) {
  const removed = settings.priorities[idx];
  data.forEach(s => s.tasks.forEach(t => { if (t.priority === removed) t.priority = null; }));
  settings.priorities.splice(idx, 1);
  save(); renderSettings(); render();
}

function addPriority() {
  settings.priorities.push('P' + settings.priorities.length);
  save(); renderSettings();
}

/* ── Event listeners ─────────────────────────────────── */

document.getElementById('filterBar').addEventListener('click', e => {
  if (e.target.classList.contains('filter-btn')) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    render();
  }
});

document.getElementById('sortBar').addEventListener('click', e => {
  if (e.target.classList.contains('sort-btn')) {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeSort = e.target.dataset.sort;
    render();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.isContentEditable) {
    e.preventDefault();
    e.target.blur();
  }
});

/* ── Bootstrap ───────────────────────────────────────── */

init();
