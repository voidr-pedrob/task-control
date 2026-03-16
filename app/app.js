/* ── Constants ────────────────────────────────────────── */

const STATUSES = ['DONE', 'PENDING', 'BLOCKED', 'DOING', 'WATCHING'];
const DEFAULT_WEIGHTS = ['Trivial', 'Easy', 'Medium', 'Hard', 'Complex'];
const DEFAULT_PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const DEFAULT_WEIGHT_ESTIMATES = ['30min', '1h', '2h', '4h', '1d'];

/* ── State ───────────────────────────────────────────── */

let useApi = false;
let data = [];
let settings = {
  weights: [...DEFAULT_WEIGHTS],
  priorities: [...DEFAULT_PRIORITIES],
  weightEstimates: [...DEFAULT_WEIGHT_ESTIMATES],
};
let activeFilter = 'all';
let activeSort = 'default';

/* ── Helpers ─────────────────────────────────────────── */

function defaultSettings() {
  return {
    weights: [...DEFAULT_WEIGHTS],
    priorities: [...DEFAULT_PRIORITIES],
    weightEstimates: [...DEFAULT_WEIGHT_ESTIMATES],
  };
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

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function toSubRoman(si) {
  const roman = ['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv'];
  return roman[si] || (si + 2) + '.';
}

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
      if (t.dueDate === undefined) t.dueDate = null;
      if (t.estimate === undefined) t.estimate = null;
      if (!Array.isArray(t.subtasks)) t.subtasks = [];
      t.subtasks = t.subtasks.map(s => {
        const obj = typeof s === 'string' ? { title: s } : { title: s.title || '' };
        obj.done = !!(s && s.done);
        return obj;
      });
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
    if (!raw.settings.weightEstimates || raw.settings.weightEstimates.length !== raw.settings.weights.length) {
      raw.settings.weightEstimates = raw.settings.weights.map((_, i) =>
        (raw.settings.weightEstimates && raw.settings.weightEstimates[i]) || (ds.weightEstimates[i] ?? ''));
    }
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
              <div class="task-meta">
                <span class="task-meta-label">Prazo</span>
                <input type="date" class="task-due-input" value="${t.dueDate || ''}" placeholder="—" data-ci="${ci}" data-ti="${realIdx}" onchange="updateDueDateFromInput(this)" title="Data limite" />
                <span class="task-meta-label">Expectativa</span>
                <input type="text" class="task-estimate-input" value="${t.estimate || ''}" placeholder="ex: 1h, 2h" data-ci="${ci}" data-ti="${realIdx}" onchange="updateEstimateFromInput(this)" title="Expectativa (vinculada ao peso)" />
              </div>
              <div class="task-subtasks">
                ${(t.subtasks || []).map((st, si) => `
                  <div class="subtask-item ${st.done ? 'subtask-done' : ''}">
                    <button type="button" class="subtask-check" onclick="toggleSubtaskDone(${ci}, ${realIdx}, ${si})" title="${st.done ? 'Desmarcar' : 'Concluída'}" aria-pressed="${st.done}">${st.done ? '&#10003;' : ''}</button>
                    <span class="subtask-title" contenteditable="true" onblur="updateSubtaskTitle(${ci}, ${realIdx}, ${si}, this)">${escapeHtml(st.title)}</span>
                    <button class="btn-icon btn-remove-subtask" onclick="removeSubtask(${ci}, ${realIdx}, ${si})" title="Remover subtask">&times;</button>
                  </div>
                `).join('')}
                <button class="btn-add-subtask" onclick="addSubtask(${ci}, ${realIdx})">+ Subtask</button>
              </div>
            </div>
            <div class="task-actions">
              ${t.status === 'DELETED' ? `<button class="btn-icon" style="color:var(--done)" onclick="restoreTask(${ci}, ${realIdx})" title="Restore">&#8629;</button>` : ''}
              <button class="btn-icon" onclick="duplicateTask(${ci}, ${realIdx})" title="Duplicar (cópia com mesmos dados e subtasks)">&#128190;</button>
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

function updateDueDateFromInput(input) {
  const ci = parseInt(input.dataset.ci, 10);
  const ti = parseInt(input.dataset.ti, 10);
  const val = input.value.trim() || null;
  data[ci].tasks[ti].dueDate = val;
  save();
  renderReport();
}

function updateEstimateFromInput(input) {
  const ci = parseInt(input.dataset.ci, 10);
  const ti = parseInt(input.dataset.ti, 10);
  const val = input.value.trim() || null;
  data[ci].tasks[ti].estimate = val;
  save();
  renderReport();
}

function addSubtask(ci, ti) {
  if (!data[ci].tasks[ti].subtasks) data[ci].tasks[ti].subtasks = [];
  data[ci].tasks[ti].subtasks.push({ title: 'Nova subtask', done: false });
  save();
  render();
  renderReport();
}

function removeSubtask(ci, ti, si) {
  data[ci].tasks[ti].subtasks.splice(si, 1);
  save();
  render();
  renderReport();
}

function updateSubtaskTitle(ci, ti, si, el) {
  const title = el.textContent.trim();
  if (si < data[ci].tasks[ti].subtasks.length) {
    data[ci].tasks[ti].subtasks[si].title = title || 'Subtask';
  }
  save();
  renderReport();
}

function toggleSubtaskDone(ci, ti, si) {
  if (si >= data[ci].tasks[ti].subtasks.length) return;
  data[ci].tasks[ti].subtasks[si].done = !data[ci].tasks[ti].subtasks[si].done;
  save();
  render();
  renderReport();
}

function addTask(ci) {
  data[ci].tasks.push({ title: 'New task', status: 'PENDING', detail: 'Describe status here...', createdAt: today(), doneAt: null, weight: null, priority: null, dueDate: null, estimate: null, subtasks: [] });
  save();
  render();
}

function clearAllDeleted() {
  let count = 0;
  data.forEach(section => {
    count += section.tasks.filter(t => t.status === 'DELETED').length;
  });
  if (count === 0) return;
  if (!confirm(`Remover permanentemente ${count} task(s) em Deleted?`)) return;
  data.forEach(section => {
    section.tasks = section.tasks.filter(t => t.status !== 'DELETED');
  });
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

/** Duplica a task: mesmo título, detail, weight, priority, dueDate, estimate e subtasks (subtasks ficam todas não concluídas). Nova task fica PENDING. */
function duplicateTask(ci, ti) {
  const src = data[ci].tasks[ti];
  const newTask = {
    title: (src.title || '').trim() || 'Nova task',
    status: 'PENDING',
    detail: src.detail || '',
    createdAt: today(),
    doneAt: null,
    weight: src.weight ?? null,
    priority: src.priority ?? null,
    dueDate: src.dueDate ?? null,
    estimate: src.estimate ?? null,
    deletedAt: null,
    subtasks: (src.subtasks || []).map(s => ({ title: s.title || '', done: false })),
  };
  data[ci].tasks.push(newTask);
  save();
  render();
  renderReport();
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
    ...settings.weights.map((w, wi) => {
      const wc = getWeightColor(w);
      const defaultEst = (settings.weightEstimates && settings.weightEstimates[wi]) ? ` \u00b7 ${settings.weightEstimates[wi]}` : '';
      return {
        html: `<span class="weight-badge" style="color:${wc.color};background:${wc.bg};pointer-events:none">${w}${defaultEst}</span>`,
        action: () => {
          data[ci].tasks[ti].weight = w;
          if (settings.weightEstimates && settings.weightEstimates[wi] && !data[ci].tasks[ti].estimate) {
            data[ci].tasks[ti].estimate = settings.weightEstimates[wi];
          }
          save();
          render();
        },
      };
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
    const sortedTasks = sortTasks(activeTasks);
    output += `${ci + 1}. ${section.client}\n`;
    sortedTasks.forEach((t, ti) => {
      const priorityStr = t.priority ? ` [${t.priority}]` : '';
      const weightStr = t.weight ? ` (${t.weight})` : '';
      const dueStr = t.dueDate ? ` prazo ${fmtDate(t.dueDate)}` : '';
      const estStr = t.estimate ? ` ~${t.estimate}` : '';
      output += `    ${letters[ti] || '?'}. [${t.status}]${priorityStr} ${t.title}${weightStr}${estStr}${dueStr}\n`;
      let statusLine = `        i. ${t.detail}`;
      if (t.doneAt) statusLine += ` (done ${fmtDate(t.doneAt)})`;
      output += statusLine + '\n';
      (t.subtasks || []).forEach((st, si) => {
        if (st.title) output += `                ${toSubRoman(si)}. ${st.done ? '[x] ' : ''}${st.title}\n`;
      });
      output += '\n';
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
    <div class="settings-group-title">Weight Levels (expectativa padrão por dificuldade)</div>
    <div class="weight-config-list">
      ${settings.weights.map((w, i) => {
        const wc = getWeightColor(w);
        const est = (settings.weightEstimates && settings.weightEstimates[i]) ? settings.weightEstimates[i] : '';
        return `
        <div class="weight-config-item weight-config-row">
          <span class="weight-preview" style="color:${wc.color};background:${wc.bg}">${i + 1}</span>
          <input type="text" value="${w}" onchange="renameWeight(${i}, this.value)" placeholder="Nome" />
          <input type="text" value="${est}" onchange="updateWeightEstimate(${i}, this.value)" placeholder="ex: 1h, 2h" class="weight-estimate-input" title="Expectativa padrão" />
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
  if (settings.weightEstimates) settings.weightEstimates.splice(idx, 1);
  save(); renderSettings(); render();
}

function addWeight() {
  settings.weights.push('New level');
  if (!settings.weightEstimates) settings.weightEstimates = [];
  settings.weightEstimates.push('');
  save(); renderSettings();
}

function updateWeightEstimate(idx, value) {
  if (!settings.weightEstimates) settings.weightEstimates = settings.weights.map(() => '');
  settings.weightEstimates[idx] = value.trim();
  save();
  renderSettings();
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
