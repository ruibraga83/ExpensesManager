/* ============================================
   EXPENSETRACKER — Main Application  v2
   ============================================ */
'use strict';

/* ════════════════════════════════
   STATE
   ════════════════════════════════ */
const State = {
  receipts:     [],   // receipts visible to current user
  allReceipts:  [],   // all receipts (for admin/finance)
  allUsers:     [],   // all registered users
  currentUser:  null, // { id, name, email, role, … }
  currentPage:  'dashboard',
  capturedImage: null,
  editingId:     null,
  selectedCategory: null,
  modalReceiptId:   null,
  deleteTargetId:   null,
  filterOpen:   false,
  reportMonth:  new Date().getMonth(),
  reportYear:   new Date().getFullYear(),
  reportTab:    'mine', // 'mine' | 'team'
  cameraStream: null,
  settings: {
    company: '', managerEmail: '', currency: 'USD',
    monthlyBudget: 2000, darkMode: false
  }
};

/* ════════════════════════════════
   CONSTANTS
   ════════════════════════════════ */
const CATEGORIES = {
  meals:         { label: 'Meals',     emoji: '🍽️', color: '#d97706' },
  travel:        { label: 'Travel',    emoji: '✈️', color: '#2563eb' },
  accommodation: { label: 'Hotel',     emoji: '🏨', color: '#5A28A0' },
  software:      { label: 'Software',  emoji: '🖥️', color: '#16a34a' },
  supplies:      { label: 'Supplies',  emoji: '📦', color: '#ea580c' },
  entertainment: { label: 'Events',    emoji: '🎭', color: '#db2777' },
  medical:       { label: 'Medical',   emoji: '🏥', color: '#dc2626' },
  training:      { label: 'Training',  emoji: '📚', color: '#0284c7' },
  other:         { label: 'Other',     emoji: '💼', color: '#64748b' }
};

const AVATAR_COLORS = [
  '#7A5808','#1A6A40','#B02018','#3060A8',
  '#5A28A0','#186868','#A03818','#285888',
  '#801848','#386828','#884818','#205878'
];

/* ════════════════════════════════
   HELPERS
   ════════════════════════════════ */
function formatCurrency(amount, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}
function formatDate(ds) {
  if (!ds) return '—';
  try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ds + 'T00:00:00')); }
  catch { return ds; }
}
function getMonthLabel(y, m) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(y, m));
}
function todayISO() { return new Date().toISOString().split('T')[0]; }
function initials(name) {
  if (!name) return 'ME';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(id) { return AVATAR_COLORS[(id - 1) % AVATAR_COLORS.length]; }
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function isAdmin()   { return State.currentUser?.role === 'admin'; }
function isFinance() { return State.currentUser?.role === 'finance'; }
function canSeeTeam(){ return isAdmin() || isFinance(); }

/* ════════════════════════════════
   INITIALIZATION
   ════════════════════════════════ */
async function init() {
  try {
    await DB.open();
    loadSettings();
    applyTheme();
    State.allUsers = await DB.getAllUsers().catch(() => []);
    hideSplash();

    /* check for saved session */
    const savedId = Number(localStorage.getItem('et_userId'));
    if (savedId && State.allUsers.find(u => u.id === savedId)) {
      await loginUser(savedId, true);
    } else {
      _showLoginScreen();
    }
  } catch (err) {
    console.error('Init error:', err);
    hideSplash();
    showToast('Initialization failed', 'error');
  }
}

function hideSplash() {
  const splash = document.getElementById('splash');
  const app    = document.getElementById('app');
  setTimeout(() => {
    splash.classList.add('fade-out');
    app.classList.remove('hidden');
    setTimeout(() => splash.style.display = 'none', 450);
  }, 800);
}

/* ════════════════════════════════
   LOGIN / USER SESSION
   ════════════════════════════════ */
async function _showLoginScreen() {
  State.allUsers = await DB.getAllUsers().catch(() => State.allUsers);
  const screen = document.getElementById('loginScreen');
  screen.classList.remove('hidden');
  renderUserGrid();
}

function hideLoginScreen() {
  document.getElementById('loginScreen').classList.add('hidden');
}

function renderUserGrid() {
  const grid = document.getElementById('usersGrid');
  if (!State.allUsers.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text-3);font-size:.88rem;padding:8px 0">No profiles yet — add one below</p>';
    return;
  }
  grid.innerHTML = State.allUsers.map(u => {
    const color = avatarColor(u.id);
    const roleLbl = u.role === 'admin' ? 'Admin' : u.role === 'finance' ? 'Finance Mgr' : 'Employee';
    return `
      <div class="user-login-card" onclick="loginUser(${u.id})">
        <div class="user-login-avatar" style="background:${color}">${initials(u.name)}</div>
        <div class="user-login-info">
          <div class="user-login-name">${escapeHtml(u.name)}</div>
          <div class="user-login-sub">${roleLbl}${u.department ? ' · ' + escapeHtml(u.department) : ''}</div>
        </div>
        <div class="user-login-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`;
  }).join('');
}

async function loginUser(userId, skipAnim = false) {
  const user = await DB.getUserById(userId);
  if (!user) { _showLoginScreen(); return; }
  State.currentUser = user;
  localStorage.setItem('et_userId', userId);

  /* load receipts based on role */
  State.allReceipts = await DB.getAll();
  State.receipts = canSeeTeam()
    ? State.allReceipts
    : State.allReceipts.filter(r => r.userId === userId);

  populateFilterMonths();
  populateFilterUsers();
  setupNavigation();
  setupEventListeners();
  updateHeaderUser();
  populateSettingsForm();
  renderDashboard();
  hideLoginScreen();

  if (!skipAnim) showToast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
}

function showLoginScreen_public() {
  localStorage.removeItem('et_userId');
  State.currentUser = null;
  _showLoginScreen();
}
window.showLoginScreen = showLoginScreen_public;

function updateHeaderUser() {
  const u = State.currentUser;
  if (!u) return;
  document.getElementById('userAvatar').textContent = initials(u.name);
  const badge = document.getElementById('roleBadge');
  if (u.role !== 'user') {
    badge.textContent = u.role === 'admin' ? 'Admin' : 'Finance';
    badge.className = `role-badge role-badge--${u.role}`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ════════════════════════════════
   SETTINGS
   ════════════════════════════════ */
function loadSettings() {
  try { const s = localStorage.getItem('ef_settings'); if (s) Object.assign(State.settings, JSON.parse(s)); }
  catch { /* ignore */ }
}
function saveSettings() { localStorage.setItem('ef_settings', JSON.stringify(State.settings)); }

function populateSettingsForm() {
  const u = State.currentUser || {};
  const s = State.settings;
  document.getElementById('sName').value       = u.name       || '';
  document.getElementById('sEmail').value      = u.email      || '';
  document.getElementById('sEmployeeId').value = u.employeeId || '';
  document.getElementById('sCompany').value    = u.company    || s.company || '';
  document.getElementById('sDepartment').value = u.department || '';
  document.getElementById('sManagerEmail').value = s.managerEmail || '';
  document.getElementById('sMonthlyBudget').value = s.monthlyBudget || 2000;
  document.getElementById('sCurrency').value   = s.currency || 'USD';
  document.getElementById('sDarkMode').checked = s.darkMode  || false;

  // Settings avatar
  document.getElementById('settingsAvatar').textContent    = initials(u.name);
  document.getElementById('settingsAvatarName').textContent = u.name  || 'Set your name';
  document.getElementById('settingsAvatarEmail').textContent= u.email || 'Add your email';
  if (u.id) {
    document.getElementById('settingsAvatar').style.background = '';
    document.getElementById('settingsAvatar').style.color = '';
  }

  // Team management visibility (admin only)
  document.getElementById('teamManagementSection').style.display = isAdmin() ? '' : 'none';
  if (isAdmin()) renderUserManagementList();
}

function applyTheme() { document.body.classList.toggle('dark', State.settings.darkMode); }

/* ════════════════════════════════
   NAVIGATION
   ════════════════════════════════ */
const PAGE_TITLES = { dashboard:'Dashboard', add:'Add Receipt', receipts:'Receipts', report:'Monthly Report', settings:'Settings' };

function navigate(page) {
  const prev = document.getElementById(`page-${State.currentPage}`);
  const next = document.getElementById(`page-${page}`);
  if (!next || State.currentPage === page) return;
  prev.classList.remove('active');
  next.classList.add('active', 'slide-in');
  setTimeout(() => next.classList.remove('slide-in'), 300);
  State.currentPage = page;
  document.getElementById('header-title').textContent = PAGE_TITLES[page] || page;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'dashboard') renderDashboard();
  if (page === 'receipts')  renderReceiptsList();
  if (page === 'report')    renderReport();
  if (page === 'add' && !State.editingId) resetAddForm();
  if (page === 'settings') populateSettingsForm();
}
window.navigate = navigate;

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    // avoid duplicate listeners
    btn.replaceWith(btn.cloneNode(true));
  });
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

/* ════════════════════════════════
   DASHBOARD
   ════════════════════════════════ */
function renderDashboard() {
  const now = new Date();
  const month = now.getMonth(), year = now.getFullYear();
  document.getElementById('greetingName').textContent = State.currentUser?.name?.split(' ')[0] || 'User';
  document.getElementById('greetingMonth').textContent = getMonthLabel(year, month);

  const monthReceipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const monthTotal = monthReceipts.reduce((s, r) => s + Number(r.amount), 0);
  const allTotal   = State.receipts.reduce((s, r) => s + Number(r.amount), 0);
  const pending    = State.receipts.filter(r => r.status === 'pending').length;
  const approved   = State.receipts.filter(r => r.status === 'approved').length;
  const currency   = State.settings.currency;

  document.getElementById('dashMonthlyTotal').textContent = formatCurrency(monthTotal, currency);
  document.getElementById('dashReceiptCount').textContent = `${monthReceipts.length} receipt${monthReceipts.length !== 1 ? 's' : ''}`;
  document.getElementById('dashPending').textContent  = pending;
  document.getElementById('dashApproved').textContent = approved;
  document.getElementById('dashTotal').textContent    = formatCurrency(allTotal, currency);

  const budget = State.settings.monthlyBudget || 2000;
  document.getElementById('dashSpendingBar').style.width = Math.min((monthTotal / budget) * 100, 100) + '%';
  document.getElementById('dashBudgetLabel').textContent = formatCurrency(budget, currency);

  renderDashCategories(monthReceipts);
  renderRecentReceipts();
}

function renderDashCategories(receipts) {
  const container = document.getElementById('dashCategories');
  if (!receipts.length) { container.innerHTML = '<div class="empty-state-small">No expenses this month</div>'; return; }
  const byCategory = {};
  receipts.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + Number(r.amount); });
  const max    = Math.max(...Object.values(byCategory));
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const currency = State.settings.currency;
  container.innerHTML = sorted.map(([cat, total]) => {
    const info = CATEGORIES[cat] || CATEGORIES.other;
    return `<div class="cat-row">
      <div class="cat-row-emoji">${info.emoji}</div>
      <div class="cat-row-info">
        <div class="cat-row-name">${info.label}</div>
        <div class="cat-row-bar-wrap"><div class="cat-row-bar" style="width:${(total/max)*100}%"></div></div>
      </div>
      <div class="cat-row-amount">${formatCurrency(total, currency)}</div>
    </div>`;
  }).join('');
}

function renderRecentReceipts() {
  const container = document.getElementById('dashRecentReceipts');
  const recent = State.receipts.slice(0, 5);
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></div>
      <p>No receipts yet</p>
      <button class="btn-primary btn-sm" onclick="navigate('add')">Add your first receipt</button>
    </div>`;
    return;
  }
  container.innerHTML = recent.map(r => receiptCardHTML(r)).join('');
  container.querySelectorAll('.receipt-card').forEach(card =>
    card.addEventListener('click', () => openReceiptModal(Number(card.dataset.id)))
  );
}

/* ════════════════════════════════
   RECEIPTS LIST
   ════════════════════════════════ */
function renderReceiptsList() {
  const search      = (document.getElementById('searchInput').value || '').toLowerCase();
  const catFilter   = document.getElementById('filterCategory').value;
  const monthFilter = document.getElementById('filterMonth').value;
  const statusFilter= document.getElementById('filterStatus').value;
  const userFilter  = canSeeTeam() ? document.getElementById('filterUser').value : 'self';

  let filtered = State.receipts.filter(r => {
    if (search) {
      const catLabel = (CATEGORIES[r.category]?.label || '').toLowerCase();
      const loc = (r.location || '').toLowerCase();
      if (!r.merchant.toLowerCase().includes(search) &&
          !(r.description || '').toLowerCase().includes(search) &&
          !catLabel.includes(search) && !loc.includes(search)) return false;
    }
    if (catFilter !== 'all' && r.category !== catFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (monthFilter !== 'all') {
      const [y, m] = monthFilter.split('-').map(Number);
      const d = new Date(r.date + 'T00:00:00');
      if (d.getFullYear() !== y || d.getMonth() !== m) return false;
    }
    if (userFilter !== 'all' && userFilter !== 'self') {
      if (r.userId !== Number(userFilter)) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);
  document.getElementById('receiptsCount').textContent =
    `${filtered.length} receipt${filtered.length !== 1 ? 's' : ''} · Total: ${formatCurrency(total, State.settings.currency)}`;

  const container = document.getElementById('receiptsContainer');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></div>
      <p>No receipts found</p></div>`;
    return;
  }
  container.innerHTML = filtered.map(r => receiptCardHTML(r)).join('');
  container.querySelectorAll('.receipt-card').forEach(card =>
    card.addEventListener('click', () => openReceiptModal(Number(card.dataset.id)))
  );
}

function receiptCardHTML(r) {
  const cat  = CATEGORIES[r.category] || CATEGORIES.other;
  const thumb = r.imageData
    ? `<img src="${r.imageData}" alt="Receipt" loading="lazy">`
    : `<div class="receipt-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  const locBadge = r.location
    ? `<span class="badge badge--iata">✈ ${escapeHtml(r.location.toUpperCase())}</span>` : '';
  /* show employee name on admin/finance view */
  const userLabel = canSeeTeam() && r.userId
    ? (() => { const u = State.allUsers.find(u => u.id === r.userId); return u ? `<span style="font-size:.7rem;color:var(--text-3)">${escapeHtml(u.name)}</span>` : ''; })() : '';

  return `<div class="receipt-card" data-id="${r.id}">
    <div class="receipt-thumb">${thumb}</div>
    <div class="receipt-info">
      <div class="receipt-merchant">${escapeHtml(r.merchant)}</div>
      <div class="receipt-meta">
        <span class="badge badge--${r.category}">${cat.emoji} ${cat.label}</span>
        <span class="badge badge--${r.status}">${r.status}</span>
        ${locBadge}
      </div>
      <div class="receipt-date">${formatDate(r.date)} ${userLabel}</div>
    </div>
    <div class="receipt-right">
      <div class="receipt-amount">${formatCurrency(r.amount, r.currency)}</div>
      <div class="receipt-currency">${r.currency}</div>
    </div>
  </div>`;
}

function populateFilterMonths() {
  const select = document.getElementById('filterMonth');
  const existing = new Set([...select.querySelectorAll('option')].map(o => o.value));
  State.receipts.forEach(r => {
    const d = new Date(r.date + 'T00:00:00');
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!existing.has(key)) {
      existing.add(key);
      const [y, m] = key.split('-').map(Number);
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = getMonthLabel(y, m);
      select.appendChild(opt);
    }
  });
}

function populateFilterUsers() {
  const row    = document.getElementById('filterUserRow');
  const select = document.getElementById('filterUser');
  const teamSel= document.getElementById('teamUserSelect');
  if (!canSeeTeam()) { row.style.display = 'none'; return; }
  row.style.display = '';
  // clear existing dynamic options
  [...select.options].slice(1).forEach(o => o.remove());
  [...(teamSel?.options || [])].slice(1).forEach(o => o.remove());
  State.allUsers.forEach(u => {
    const opt1 = document.createElement('option');
    opt1.value = u.id; opt1.textContent = u.name;
    select.appendChild(opt1);
    if (teamSel) {
      const opt2 = document.createElement('option');
      opt2.value = u.id; opt2.textContent = u.name;
      teamSel.appendChild(opt2);
    }
  });
}

/* ════════════════════════════════
   ADD / EDIT RECEIPT
   ════════════════════════════════ */
function resetAddForm() {
  State.capturedImage = null; State.editingId = null; State.selectedCategory = null;
  document.getElementById('receiptForm').reset();
  document.getElementById('fDate').value     = todayISO();
  document.getElementById('fCurrency').value = State.settings.currency || 'USD';
  document.getElementById('fEditId').value   = '';
  document.getElementById('fLocation').value = '';
  document.getElementById('iataTag').textContent = '';
  document.getElementById('btnSave').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Save Receipt`;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('fCategory').value = '';
  clearCaptureZone();
}

function clearCaptureZone() {
  document.getElementById('capturedImg').classList.add('hidden');
  document.getElementById('capturedImg').src = '';
  document.getElementById('capturePlaceholder').classList.remove('hidden');
  document.getElementById('btnRemoveImg').classList.add('hidden');
  stopCameraStream();
}

function loadReceiptIntoForm(receipt) {
  State.editingId = receipt.id; State.selectedCategory = receipt.category;
  State.capturedImage = receipt.imageData || null;
  document.getElementById('fAmount').value   = receipt.amount;
  document.getElementById('fCurrency').value = receipt.currency || 'USD';
  document.getElementById('fMerchant').value = receipt.merchant;
  document.getElementById('fDate').value     = receipt.date;
  document.getElementById('fStatus').value   = receipt.status;
  document.getElementById('fDesc').value     = receipt.description || '';
  document.getElementById('fLocation').value = receipt.location   || '';
  document.getElementById('iataTag').textContent = receipt.location ? receipt.location.toUpperCase() : '';
  document.getElementById('fEditId').value   = receipt.id;
  document.getElementById('btnSave').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Update Receipt`;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('selected', c.dataset.cat === receipt.category));
  document.getElementById('fCategory').value = receipt.category;
  if (receipt.imageData) {
    document.getElementById('capturedImg').src = receipt.imageData;
    document.getElementById('capturedImg').classList.remove('hidden');
    document.getElementById('capturePlaceholder').classList.add('hidden');
    document.getElementById('btnRemoveImg').classList.remove('hidden');
  } else { clearCaptureZone(); }
}

async function saveReceipt(e) {
  e.preventDefault();
  const category = document.getElementById('fCategory').value;
  if (!category) { showToast('Please select a category', 'error'); return; }

  const receipt = {
    amount:      parseFloat(document.getElementById('fAmount').value),
    currency:    document.getElementById('fCurrency').value,
    category,
    merchant:    document.getElementById('fMerchant').value.trim(),
    date:        document.getElementById('fDate').value,
    status:      document.getElementById('fStatus').value,
    description: document.getElementById('fDesc').value.trim(),
    location:    document.getElementById('fLocation').value.trim().toUpperCase() || null,
    imageData:   State.capturedImage || null,
    userId:      State.currentUser?.id || null
  };

  const editId = document.getElementById('fEditId').value;
  try {
    if (editId) {
      receipt.id = Number(editId);
      await DB.update(receipt);
      const idx = State.receipts.findIndex(r => r.id === receipt.id);
      if (idx >= 0) State.receipts[idx] = receipt;
      const aidx = State.allReceipts.findIndex(r => r.id === receipt.id);
      if (aidx >= 0) State.allReceipts[aidx] = receipt;
      showToast('Receipt updated', 'success');
    } else {
      const id = await DB.add(receipt);
      receipt.id = id;
      State.receipts.unshift(receipt);
      State.allReceipts.unshift(receipt);
      showToast('Receipt saved', 'success');
    }
    State.editingId = null;
    populateFilterMonths();
    navigate('receipts');
  } catch (err) {
    console.error('Save error:', err);
    showToast('Failed to save receipt', 'error');
  }
}

/* ════════════════════════════════
   CAMERA
   ════════════════════════════════ */
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

function triggerCamera() {
  if (isMobile()) {
    document.getElementById('fileInput').setAttribute('capture', 'environment');
    document.getElementById('fileInput').click();
  } else { startDesktopCamera(); }
}

async function startDesktopCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    State.cameraStream = stream;
    document.getElementById('cameraStream').srcObject = stream;
    document.getElementById('cameraStream').classList.remove('hidden');
    document.getElementById('capturePlaceholder').classList.add('hidden');
    document.getElementById('capturedImg').classList.add('hidden');
    document.getElementById('cameraControls').classList.remove('hidden');
  } catch {
    document.getElementById('fileInput').removeAttribute('capture');
    document.getElementById('fileInput').click();
  }
}

function captureFromVideo() {
  const video  = document.getElementById('cameraStream');
  const canvas = document.getElementById('captureCanvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  setCapuredImage(canvas.toDataURL('image/jpeg', 0.85));
  stopCameraStream();
}

function stopCameraStream() {
  if (State.cameraStream) { State.cameraStream.getTracks().forEach(t => t.stop()); State.cameraStream = null; }
  const vid = document.getElementById('cameraStream');
  vid.classList.add('hidden'); vid.srcObject = null;
  document.getElementById('cameraControls').classList.add('hidden');
}

function setCapuredImage(dataUrl) {
  State.capturedImage = dataUrl;
  const img = document.getElementById('capturedImg');
  img.src = dataUrl; img.classList.remove('hidden');
  document.getElementById('capturePlaceholder').classList.add('hidden');
  document.getElementById('btnRemoveImg').classList.remove('hidden');
}

function handleFileInput(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => setCapuredImage(e.target.result);
  reader.readAsDataURL(file);
}

/* ════════════════════════════════
   RECEIPT MODAL
   ════════════════════════════════ */
function openReceiptModal(id) {
  const receipt = State.receipts.find(r => r.id === id) || State.allReceipts.find(r => r.id === id);
  if (!receipt) return;
  State.modalReceiptId = id;
  const cat = CATEGORIES[receipt.category] || CATEGORIES.other;

  document.getElementById('modalMerchant').textContent = receipt.merchant;
  document.getElementById('modalAmount').textContent   = formatCurrency(receipt.amount, receipt.currency);

  const catBadge = document.getElementById('modalCategory');
  catBadge.textContent = `${cat.emoji} ${cat.label}`;
  catBadge.className   = `badge badge--${receipt.category}`;

  const statusBadge = document.getElementById('modalStatus');
  statusBadge.textContent = receipt.status;
  statusBadge.className   = `badge badge--${receipt.status}`;

  document.getElementById('modalDate').textContent     = formatDate(receipt.date);
  document.getElementById('modalCurrency').textContent = receipt.currency;
  document.getElementById('modalLocation').textContent = receipt.location ? `✈ ${receipt.location.toUpperCase()}` : '—';
  document.getElementById('modalDesc').textContent     = receipt.description || '—';

  /* Show employee row for admin/finance */
  const userRow = document.getElementById('modalUserRow');
  if (canSeeTeam() && receipt.userId) {
    const owner = State.allUsers.find(u => u.id === receipt.userId);
    document.getElementById('modalUser').textContent = owner ? owner.name : '—';
    userRow.style.display = '';
  } else { userRow.style.display = 'none'; }

  if (receipt.imageData) {
    document.getElementById('modalImage').src = receipt.imageData;
    document.getElementById('modalImage').classList.remove('hidden');
    document.getElementById('modalNoImage').classList.add('hidden');
  } else {
    document.getElementById('modalImage').classList.add('hidden');
    document.getElementById('modalNoImage').classList.remove('hidden');
  }

  /* Admin/finance can only delete own receipts or any if admin */
  const canEdit = isAdmin() || receipt.userId === State.currentUser?.id;
  document.getElementById('modalEdit').style.display   = canEdit ? '' : 'none';
  document.getElementById('modalDelete').style.display = canEdit ? '' : 'none';

  document.getElementById('receiptModal').classList.remove('hidden');
}

function closeReceiptModal() {
  document.getElementById('receiptModal').classList.add('hidden');
  State.modalReceiptId = null;
}

function openConfirmDelete(id) {
  State.deleteTargetId = id;
  closeReceiptModal();
  document.getElementById('confirmModal').classList.remove('hidden');
}

async function deleteReceipt(id) {
  try {
    await DB.remove(id);
    State.receipts    = State.receipts.filter(r => r.id !== id);
    State.allReceipts = State.allReceipts.filter(r => r.id !== id);
    document.getElementById('confirmModal').classList.add('hidden');
    State.deleteTargetId = null;
    showToast('Receipt deleted', 'success');
    if (State.currentPage === 'receipts') renderReceiptsList();
    if (State.currentPage === 'dashboard') renderDashboard();
  } catch { showToast('Failed to delete', 'error'); }
}

/* ════════════════════════════════
   REPORT — MY VIEW
   ════════════════════════════════ */
function renderReport() {
  /* Show/hide team tab */
  const tabs = document.getElementById('reportTabs');
  tabs.classList.toggle('hidden', !canSeeTeam());

  if (State.reportTab === 'team' && canSeeTeam()) {
    document.getElementById('myReportPanel').style.display  = 'none';
    document.getElementById('teamReportPanel').classList.remove('hidden');
    renderTeamReport();
  } else {
    document.getElementById('myReportPanel').style.display  = '';
    document.getElementById('teamReportPanel').classList.add('hidden');
    renderMyReport();
  }
}

function renderMyReport() {
  const month = State.reportMonth, year = State.reportYear;
  document.getElementById('reportMonthLabel').textContent = getMonthLabel(year, month);

  const receipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const total   = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const avgDay  = total / new Date(year, month + 1, 0).getDate();
  const currency= State.settings.currency;

  document.getElementById('reportTotal').textContent   = formatCurrency(total, currency);
  document.getElementById('reportCount').textContent   = receipts.length;
  document.getElementById('reportAvgDay').textContent  = formatCurrency(avgDay, currency);

  renderReportCategories(receipts, total, 'reportCategories');
  renderReportReceiptsList(receipts, 'reportReceiptsList');
}

/* ════════════════════════════════
   REPORT — TEAM VIEW
   ════════════════════════════════ */
function renderTeamReport() {
  const month = State.reportMonth, year = State.reportYear;
  const teamSel   = document.getElementById('teamUserSelect');
  const filterUid = teamSel.value === 'all' ? null : Number(teamSel.value);

  const monthReceipts = State.allReceipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year &&
           (filterUid === null || r.userId === filterUid);
  });

  const teamTotal  = monthReceipts.reduce((s, r) => s + Number(r.amount), 0);
  const currency   = State.settings.currency;

  /* Summary cards */
  document.getElementById('teamSummaryCards').innerHTML = `
    <div class="team-stat-card team-stat-card--primary">
      <div>
        <div class="stat-label">Team Total · ${getMonthLabel(year, month)}</div>
        <div class="stat-value">${formatCurrency(teamTotal, currency)}</div>
      </div>
    </div>
    <div class="team-stat-card">
      <div class="stat-label">Receipts</div>
      <div class="stat-value">${monthReceipts.length}</div>
    </div>
    <div class="team-stat-card">
      <div class="stat-label">Members</div>
      <div class="stat-value">${new Set(monthReceipts.map(r=>r.userId)).size}</div>
    </div>`;

  /* Per-user rows */
  const memberTable = document.getElementById('teamMembersTable');
  const usersToShow = filterUid
    ? State.allUsers.filter(u => u.id === filterUid)
    : State.allUsers;

  if (!usersToShow.length) { memberTable.innerHTML = '<div class="empty-state-small">No team members</div>'; return; }

  memberTable.innerHTML = usersToShow.map(u => {
    const urecs  = monthReceipts.filter(r => r.userId === u.id);
    const utotal = urecs.reduce((s, r) => s + Number(r.amount), 0);
    const color  = avatarColor(u.id);
    const roleLbl= u.role === 'admin' ? 'Admin' : u.role === 'finance' ? 'Finance' : 'Employee';
    return `
      <div class="team-member-row">
        <div class="team-member-avatar" style="background:${color}">${initials(u.name)}</div>
        <div class="team-member-info">
          <div class="team-member-name">${escapeHtml(u.name)}</div>
          <div class="team-member-meta">${roleLbl}${u.department ? ' · '+escapeHtml(u.department):''}</div>
        </div>
        <div class="team-member-amount">
          <div class="team-member-total">${formatCurrency(utotal, currency)}</div>
          <div class="team-member-count">${urecs.length} receipt${urecs.length!==1?'s':''}</div>
        </div>
      </div>`;
  }).join('');
}

function renderReportCategories(receipts, grandTotal, containerId) {
  const container = document.getElementById(containerId);
  if (!receipts.length) { container.innerHTML = '<div class="empty-state-small">No expenses this month</div>'; return; }
  const byCategory = {};
  receipts.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + Number(r.amount); });
  const sorted  = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const max     = sorted[0]?.[1] || 1;
  const currency= State.settings.currency;
  container.innerHTML = sorted.map(([cat, total]) => {
    const info  = CATEGORIES[cat] || CATEGORIES.other;
    const pct   = grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : 0;
    const count = receipts.filter(r => r.category === cat).length;
    return `<div class="report-cat-row">
      <div class="report-cat-emoji">${info.emoji}</div>
      <div class="report-cat-info">
        <div class="report-cat-name">${info.label}</div>
        <div class="report-cat-count">${count} receipt${count!==1?'s':''}</div>
        <div class="report-cat-bar-wrap"><div class="report-cat-bar" style="width:${(total/max)*100}%"></div></div>
      </div>
      <div>
        <div class="report-cat-amount">${formatCurrency(total, currency)}</div>
        <div class="report-cat-pct">${pct}%</div>
      </div>
    </div>`;
  }).join('');
}

function renderReportReceiptsList(receipts, containerId) {
  const container = document.getElementById(containerId);
  if (!receipts.length) { container.innerHTML = '<div class="empty-state-small">No receipts this month</div>'; return; }
  container.innerHTML = receipts.map(r => receiptCardHTML(r)).join('');
  container.querySelectorAll('.receipt-card').forEach(card =>
    card.addEventListener('click', () => openReceiptModal(Number(card.dataset.id)))
  );
}

/* ════════════════════════════════
   PDF GENERATION
   ════════════════════════════════ */
async function generatePDF(receiptsOverride, titleOverride) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('PDF library not loaded', 'error'); return; }

  const month = State.reportMonth, year = State.reportYear;
  const monthLabel = getMonthLabel(year, month);
  const u = State.currentUser || {};
  const s = State.settings;
  const currency = s.currency || 'USD';

  const receipts = receiptsOverride || State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const reportTitle = titleOverride || `${u.name || 'Employee'} — ${monthLabel}`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  /* Header band — brass palette */
  doc.setFillColor(19, 16, 8); doc.rect(0, 0, pageW, 40, 'F');
  doc.setFillColor(122, 88, 8); doc.rect(pageW-55, 0, 55, 40, 'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold'); doc.setFontSize(20);
  doc.text('ExpenseTracker', 14, 15);
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text('by lIqUiDuS  ·  Aviation Expense Management', 14, 22);
  doc.setFontSize(11); doc.text(reportTitle, 14, 33);

  /* Right side meta */
  doc.setFontSize(9);
  doc.text(s.company || 'Company', pageW-14, 10, { align:'right' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`, pageW-14, 17, { align:'right' });

  /* Summary boxes */
  const total    = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const pending  = receipts.filter(r => r.status==='pending').length;
  const approved = receipts.filter(r => r.status==='approved').length;
  const boxes = [
    { label:'Total Amount', value: formatCurrency(total, currency) },
    { label:'Receipts', value: String(receipts.length) },
    { label:'Pending',  value: String(pending) },
    { label:'Approved', value: String(approved) }
  ];
  const bY = 48, bW = (pageW-28-9)/4;
  boxes.forEach((box, i) => {
    const x = 14 + i*(bW+3);
    doc.setFillColor(244,241,235); doc.roundedRect(x, bY, bW, 20, 2, 2, 'F');
    doc.setDrawColor(216,210,196); doc.roundedRect(x, bY, bW, 20, 2, 2, 'S');
    doc.setTextColor(152,142,126); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(box.label.toUpperCase(), x+bW/2, bY+7, { align:'center' });
    doc.setTextColor(30,41,59); doc.setFont('helvetica','bold'); doc.setFontSize(i===0?9:11);
    doc.text(box.value, x+bW/2, bY+15, { align:'center' });
  });

  /* Category breakdown */
  const catY = bY+28;
  const byCategory = {};
  receipts.forEach(r => { byCategory[r.category]=(byCategory[r.category]||0)+Number(r.amount); });
  const catEntries = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]);
  if (catEntries.length) {
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30,41,59);
    doc.text('By Category', 14, catY);
    doc.setDrawColor(226,232,240); doc.line(14, catY+2, pageW-14, catY+2);
    catEntries.forEach(([cat,amt],i)=>{
      const info = CATEGORIES[cat]||CATEGORIES.other;
      const y = catY+9+i*7;
      const pct = total>0 ? (amt/total*100).toFixed(1) : 0;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(51,65,85);
      doc.text(`${info.emoji} ${info.label}`, 14, y);
      doc.setTextColor(100,116,139); doc.text(`${pct}%`, 88, y, {align:'right'});
      doc.setTextColor(30,41,59); doc.setFont('helvetica','bold');
      doc.text(formatCurrency(amt,currency), pageW-14, y, {align:'right'});
      const bx=93, bw2=pageW-14-bx-30, bf=(amt/total)*bw2;
      doc.setFillColor(216,210,196); doc.roundedRect(bx, y-3.5, bw2, 3, 1, 1, 'F');
      doc.setFillColor(122, 88,  8); doc.roundedRect(bx, y-3.5, bf,  3, 1, 1, 'F');
    });
  }

  /* Receipts table */
  const tY = catY+12+catEntries.length*7;
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30,41,59);
  doc.text('Receipts Detail', 14, tY);
  if (receipts.length) {
    const cols = canSeeTeam() && !titleOverride?.includes('—')
      ? ['Date','Employee','Merchant','Category','Location','Status','Amount']
      : ['Date','Merchant','Category','Location','Status','Amount'];

    doc.autoTable({
      startY: tY+4,
      head: [cols],
      body: receipts.map(r => {
        const base = [
          formatDate(r.date), r.merchant,
          (CATEGORIES[r.category]||CATEGORIES.other).label,
          r.location || '—',
          r.status.charAt(0).toUpperCase()+r.status.slice(1),
          formatCurrency(r.amount, r.currency)
        ];
        if (canSeeTeam() && !titleOverride?.includes('—')) {
          const owner = State.allUsers.find(u=>u.id===r.userId);
          base.splice(1, 0, owner?.name || '—');
        }
        return base;
      }),
      foot: [[...Array(cols.length-2).fill(''), 'TOTAL', formatCurrency(total,currency)]],
      styles: { fontSize:8.5, cellPadding:2.8 },
      headStyles: { fillColor:[99,102,241], textColor:255, fontStyle:'bold' },
      footStyles: { fillColor:[241,245,249], textColor:[30,41,59], fontStyle:'bold' },
      alternateRowStyles: { fillColor:[248,250,252] },
      columnStyles: { [cols.length-1]: { halign:'right', fontStyle:'bold' } },
      margin: { left:14, right:14 }
    });
  }

  /* Footer */
  const pages = doc.internal.getNumberOfPages();
  for (let i=1; i<=pages; i++) {
    doc.setPage(i);
    const fY = doc.internal.pageSize.getHeight()-8;
    doc.setFontSize(7.5); doc.setTextColor(148,163,184); doc.setFont('helvetica','normal');
    doc.text('ExpenseTracker — Confidential · by lIqUiDuS', 14, fY);
    doc.text(`Page ${i} of ${pages}`, pageW-14, fY, {align:'right'});
    if (s.company) doc.text(s.company, pageW/2, fY, {align:'center'});
  }

  const name  = (u.name||'report').replace(/\s+/g,'_');
  const fname = `ExpenseReport_${year}_${String(month+1).padStart(2,'0')}_${name}.pdf`;
  doc.save(fname);
  showToast('PDF downloaded!', 'success');
}

async function generateTeamPDF() {
  const month = State.reportMonth, year = State.reportYear;
  const teamSel   = document.getElementById('teamUserSelect');
  const filterUid = teamSel.value === 'all' ? null : Number(teamSel.value);
  const receipts  = State.allReceipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year &&
           (filterUid === null || r.userId === filterUid);
  });
  const titleSuffix = filterUid
    ? State.allUsers.find(u=>u.id===filterUid)?.name || 'User'
    : 'All Team';
  await generatePDF(receipts, `${titleSuffix} · ${getMonthLabel(year, month)}`);
}

function sendReportEmail() {
  const s = State.settings;
  if (!s.managerEmail) { showToast('Add manager email in Settings first', 'info'); navigate('settings'); return; }
  const month = State.reportMonth, year = State.reportYear;
  const monthLabel = getMonthLabel(year, month);
  const receipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const total = receipts.reduce((sum,r) => sum+Number(r.amount), 0);
  const u = State.currentUser || {};
  const subject = encodeURIComponent(`Expense Report — ${monthLabel} — ${u.name||'Employee'}`);
  const body = encodeURIComponent(
    `Hi,\n\nPlease find my expense report for ${monthLabel}.\n\n` +
    `Employee: ${u.name||'—'}\nDepartment: ${u.department||'—'}\nEmployee ID: ${u.employeeId||'—'}\n` +
    `Period: ${monthLabel}\nTotal Amount: ${formatCurrency(total, s.currency)}\nReceipts: ${receipts.length}\n\n` +
    `Please download the PDF report from ExpenseTracker for the complete breakdown.\n\nBest regards,\n${u.name||'Employee'}`
  );
  window.location.href = `mailto:${s.managerEmail}?subject=${subject}&body=${body}`;
  showToast('Opening email client...', 'info');
}

/* ════════════════════════════════
   USER MANAGEMENT
   ════════════════════════════════ */
function renderUserManagementList() {
  const container = document.getElementById('usersList');
  if (!State.allUsers.length) { container.innerHTML = '<p style="color:var(--text-3);font-size:.85rem">No users yet</p>'; return; }
  container.innerHTML = State.allUsers.map(u => {
    const color  = avatarColor(u.id);
    const roleLbl= u.role==='admin'?'Admin':u.role==='finance'?'Finance Mgr':'Employee';
    const isSelf = u.id === State.currentUser?.id;
    return `<div class="user-row">
      <div class="user-row-avatar" style="background:${color}">${initials(u.name)}</div>
      <div class="user-row-info">
        <div class="user-row-name">${escapeHtml(u.name)} ${isSelf?'<span style="font-size:.68rem;color:var(--accent)">(you)</span>':''}</div>
        <div class="user-row-email">${roleLbl}${u.email?' · '+escapeHtml(u.email):''}</div>
      </div>
      <div class="user-row-actions">
        <button class="btn-icon-sm" onclick="openUserForm(${u.id})" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${!isSelf ? `<button class="btn-icon-sm btn-icon-sm--danger" onclick="confirmDeleteUser(${u.id})" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}
window.openUserForm     = openUserForm;
window.confirmDeleteUser= confirmDeleteUser;

function openUserForm(userId = null) {
  document.getElementById('userFormTitle').textContent = userId ? 'Edit Profile' : 'New Profile';
  document.getElementById('ufEditId').value = userId || '';
  document.getElementById('userForm').reset();
  /* Only admin sees the role field */
  document.getElementById('ufRoleGroup').style.display = isAdmin() ? '' : 'none';

  if (userId) {
    const u = State.allUsers.find(u => u.id === userId);
    if (u) {
      document.getElementById('ufName').value       = u.name       || '';
      document.getElementById('ufEmail').value      = u.email      || '';
      document.getElementById('ufEmployeeId').value = u.employeeId || '';
      document.getElementById('ufDepartment').value = u.department || '';
      document.getElementById('ufRole').value       = u.role       || 'user';
    }
  } else {
    /* First user is always admin */
    if (!State.allUsers.length) {
      document.getElementById('ufRole').value = 'admin';
      document.getElementById('ufRoleGroup').style.display = 'none';
    }
  }
  document.getElementById('userFormModal').classList.remove('hidden');
}

async function saveUserForm() {
  const nameEl = document.getElementById('ufName');
  if (!nameEl.value.trim()) { showToast('Name is required', 'error'); return; }
  const editId = document.getElementById('ufEditId').value;
  const userData = {
    name:       document.getElementById('ufName').value.trim(),
    email:      document.getElementById('ufEmail').value.trim(),
    employeeId: document.getElementById('ufEmployeeId').value.trim(),
    department: document.getElementById('ufDepartment').value.trim(),
    role:       document.getElementById('ufRole').value || 'user'
  };
  /* First user always gets admin */
  if (!State.allUsers.length && !editId) userData.role = 'admin';

  try {
    if (editId) {
      userData.id = Number(editId);
      await DB.updateUser(userData);
      const idx = State.allUsers.findIndex(u => u.id === userData.id);
      if (idx >= 0) State.allUsers[idx] = userData;
      /* Update currentUser if self */
      if (State.currentUser?.id === userData.id) {
        State.currentUser = userData;
        updateHeaderUser();
        populateSettingsForm();
      }
      showToast('Profile updated', 'success');
    } else {
      const id = await DB.addUser(userData);
      userData.id = id;
      State.allUsers.push(userData);
      showToast('Profile created', 'success');
    }
    document.getElementById('userFormModal').classList.add('hidden');
    renderUserManagementList();
    populateFilterUsers();
  } catch (err) {
    console.error(err);
    showToast('Failed to save profile', 'error');
  }
}

async function confirmDeleteUser(userId) {
  if (!confirm('Remove this user? Their receipts will remain in the system.')) return;
  try {
    await DB.removeUser(userId);
    State.allUsers = State.allUsers.filter(u => u.id !== userId);
    renderUserManagementList();
    populateFilterUsers();
    showToast('User removed', 'success');
  } catch { showToast('Failed to remove user', 'error'); }
}

/* ════════════════════════════════
   TOAST
   ════════════════════════════════ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast--out');
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}

/* ════════════════════════════════
   EVENT LISTENERS
   ════════════════════════════════ */
function setupEventListeners() {
  /* avoid duplicate listeners by cloning key elements */
  const clone = id => { const el=document.getElementById(id); const c=el.cloneNode(true); el.replaceWith(c); return c; };

  /* Camera / upload */
  clone('btnCamera').addEventListener('click', triggerCamera);
  clone('btnUpload').addEventListener('click', () => {
    document.getElementById('fileInput').removeAttribute('capture');
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', e => { handleFileInput(e.target.files[0]); e.target.value=''; });
  clone('btnCapture').addEventListener('click', captureFromVideo);
  clone('btnCancelCamera').addEventListener('click', () => {
    stopCameraStream();
    document.getElementById('capturePlaceholder').classList.remove('hidden');
  });
  clone('btnRemoveImg').addEventListener('click', () => { State.capturedImage=null; clearCaptureZone(); });

  /* IATA field — auto uppercase + tag preview */
  document.getElementById('fLocation').addEventListener('input', e => {
    const val = e.target.value.toUpperCase();
    e.target.value = val;
    const tag = document.getElementById('iataTag');
    tag.textContent = val.length >= 2 ? val : '';
  });

  /* Receipt form — clone first so categoryGrid listener attaches to the live element */
  clone('receiptForm').addEventListener('submit', saveReceipt);

  /* Category chips */
  document.getElementById('categoryGrid').addEventListener('click', e => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    document.getElementById('fCategory').value = chip.dataset.cat;
  });

  /* Search & filter */
  document.getElementById('searchInput').addEventListener('input', () => renderReceiptsList());
  clone('filterBtn').addEventListener('click', () => {
    State.filterOpen = !State.filterOpen;
    document.getElementById('filterPanel').classList.toggle('open', State.filterOpen);
    document.getElementById('filterBtn').classList.toggle('active', State.filterOpen);
  });
  ['filterCategory','filterMonth','filterStatus','filterUser'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => renderReceiptsList());
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    ['filterCategory','filterMonth','filterStatus','filterUser'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'all';
    });
    renderReceiptsList();
  });

  /* Receipt modal */
  clone('closeModal').addEventListener('click', closeReceiptModal);
  document.getElementById('receiptModal').addEventListener('click', e => {
    if (e.target === document.getElementById('receiptModal')) closeReceiptModal();
  });
  clone('modalDelete').addEventListener('click', () => { if (State.modalReceiptId) openConfirmDelete(State.modalReceiptId); });
  clone('modalEdit').addEventListener('click', async () => {
    const id = State.modalReceiptId;
    closeReceiptModal();
    const receipt = await DB.getById(id);
    if (receipt) { navigate('add'); loadReceiptIntoForm(receipt); }
  });

  /* Confirm delete modal */
  clone('confirmCancel').addEventListener('click', () => { document.getElementById('confirmModal').classList.add('hidden'); State.deleteTargetId=null; });
  clone('confirmDelete').addEventListener('click', () => { if (State.deleteTargetId) deleteReceipt(State.deleteTargetId); });
  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) { document.getElementById('confirmModal').classList.add('hidden'); State.deleteTargetId=null; }
  });

  /* Report tabs */
  document.getElementById('tabMine')?.addEventListener('click', () => {
    State.reportTab = 'mine';
    document.querySelectorAll('.report-tab').forEach(t => t.classList.toggle('active', t.dataset.tab==='mine'));
    renderReport();
  });
  document.getElementById('tabTeam')?.addEventListener('click', () => {
    State.reportTab = 'team';
    document.querySelectorAll('.report-tab').forEach(t => t.classList.toggle('active', t.dataset.tab==='team'));
    renderReport();
  });
  document.getElementById('teamUserSelect')?.addEventListener('change', () => renderTeamReport());

  /* Report month nav */
  clone('reportPrevMonth').addEventListener('click', () => {
    State.reportMonth--; if (State.reportMonth<0){State.reportMonth=11;State.reportYear--;} renderReport();
  });
  clone('reportNextMonth').addEventListener('click', () => {
    State.reportMonth++; if (State.reportMonth>11){State.reportMonth=0;State.reportYear++;} renderReport();
  });
  clone('btnGeneratePDF').addEventListener('click', () => generatePDF());
  clone('btnSendReport').addEventListener('click', sendReportEmail);
  document.getElementById('btnTeamPDF')?.addEventListener('click', generateTeamPDF);

  /* Settings save */
  clone('btnSaveSettings').addEventListener('click', async () => {
    if (!State.currentUser) return;
    const updated = {
      ...State.currentUser,
      name:       document.getElementById('sName').value.trim(),
      email:      document.getElementById('sEmail').value.trim(),
      employeeId: document.getElementById('sEmployeeId').value.trim(),
      company:    document.getElementById('sCompany').value.trim(),
      department: document.getElementById('sDepartment').value.trim()
    };
    await DB.updateUser(updated);
    State.currentUser = updated;
    const idx = State.allUsers.findIndex(u => u.id === updated.id);
    if (idx >= 0) State.allUsers[idx] = updated;

    State.settings.company      = document.getElementById('sCompany').value.trim();
    State.settings.managerEmail = document.getElementById('sManagerEmail').value.trim();
    State.settings.monthlyBudget= parseFloat(document.getElementById('sMonthlyBudget').value)||2000;
    State.settings.currency     = document.getElementById('sCurrency').value;
    State.settings.darkMode     = document.getElementById('sDarkMode').checked;
    saveSettings(); applyTheme(); updateHeaderUser();
    showToast('Settings saved', 'success');
  });
  document.getElementById('sDarkMode').addEventListener('change', e => {
    State.settings.darkMode = e.target.checked; applyTheme();
  });

  /* Team management */
  document.getElementById('btnAddTeamMember')?.addEventListener('click', () => openUserForm());
  document.getElementById('btnSwitchUser')?.addEventListener('click', () => showLoginScreen_public());

  /* User form modal */
  clone('closeUserModal').addEventListener('click', () => document.getElementById('userFormModal').classList.add('hidden'));
  clone('cancelUserForm').addEventListener('click', () => document.getElementById('userFormModal').classList.add('hidden'));
  clone('confirmUserForm').addEventListener('click', saveUserForm);
  document.getElementById('userFormModal').addEventListener('click', e => {
    if (e.target === document.getElementById('userFormModal')) document.getElementById('userFormModal').classList.add('hidden');
  });

  /* Login screen */
  document.getElementById('btnAddUserLogin').addEventListener('click', () => {
    hideLoginScreen();
    openUserForm();
  });

  /* Data */
  clone('btnClearData').addEventListener('click', async () => {
    if (!confirm('Delete ALL receipts? This cannot be undone.')) return;
    await DB.clear();
    State.receipts = []; State.allReceipts = [];
    renderDashboard(); renderReceiptsList();
    showToast('All data cleared', 'info');
  });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeReceiptModal();
      document.getElementById('confirmModal').classList.add('hidden');
      document.getElementById('userFormModal').classList.add('hidden');
    }
  });

  /* Drag & drop on capture zone */
  const cz = document.getElementById('captureZone');
  cz.addEventListener('dragover', e => { e.preventDefault(); cz.style.opacity='.7'; });
  cz.addEventListener('dragleave', () => { cz.style.opacity=''; });
  cz.addEventListener('drop', e => {
    e.preventDefault(); cz.style.opacity='';
    handleFileInput(e.dataTransfer.files[0]);
  });
}

/* ════════════════════════════════
   BOOT
   ════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  /* Login screen "add user" button is always accessible */
  document.getElementById('btnAddUserLogin').addEventListener('click', () => {
    DB.open().then(() => {
      DB.getAllUsers().then(users => {
        State.allUsers = users;
        hideLoginScreen();
        openUserForm();
      });
    });
  });

  /* User form confirm (needs DB open before login) */
  document.getElementById('confirmUserForm').addEventListener('click', async () => {
    const nameEl = document.getElementById('ufName');
    if (!nameEl.value.trim()) { showToast('Name is required','error'); return; }
    const editId = document.getElementById('ufEditId').value;
    const userData = {
      name:       document.getElementById('ufName').value.trim(),
      email:      document.getElementById('ufEmail').value.trim() || '',
      employeeId: document.getElementById('ufEmployeeId').value.trim() || '',
      department: document.getElementById('ufDepartment').value.trim() || '',
      role:       document.getElementById('ufRole').value || 'user'
    };
    if (!State.allUsers.length && !editId) userData.role = 'admin';
    try {
      if (editId) {
        userData.id = Number(editId);
        await DB.updateUser(userData);
        const idx = State.allUsers.findIndex(u=>u.id===userData.id);
        if (idx>=0) State.allUsers[idx]=userData;
      } else {
        const id = await DB.addUser(userData);
        userData.id = id;
        State.allUsers.push(userData);
      }
      document.getElementById('userFormModal').classList.add('hidden');
      if (!State.currentUser) {
        /* Just created first user — auto-login */
        await loginUser(userData.id);
      } else {
        renderUserManagementList();
        populateFilterUsers();
        showToast('Profile saved','success');
        _showLoginScreen();
      }
    } catch(err) { console.error(err); showToast('Failed to save','error'); }
  });

  document.getElementById('cancelUserForm').addEventListener('click', () => {
    document.getElementById('userFormModal').classList.add('hidden');
    if (!State.currentUser) _showLoginScreen();
  });
  document.getElementById('closeUserModal').addEventListener('click', () => {
    document.getElementById('userFormModal').classList.add('hidden');
    if (!State.currentUser) _showLoginScreen();
  });

  init();
});
