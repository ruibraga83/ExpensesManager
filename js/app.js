/* ============================================
   EXPENSEFLOW — Main Application
   ============================================ */

'use strict';

/* ---- State ---- */
const State = {
  receipts: [],
  currentPage: 'dashboard',
  capturedImage: null,
  editingId: null,
  selectedCategory: null,
  modalReceiptId: null,
  filterOpen: false,
  reportMonth: new Date().getMonth(),
  reportYear: new Date().getFullYear(),
  cameraStream: null,
  settings: {
    name: '',
    email: '',
    employeeId: '',
    company: '',
    department: '',
    managerEmail: '',
    currency: 'USD',
    monthlyBudget: 2000,
    darkMode: false
  }
};

/* ---- Category Config ---- */
const CATEGORIES = {
  meals:         { label: 'Meals',          emoji: '🍽️', color: '#d97706' },
  travel:        { label: 'Travel',         emoji: '✈️', color: '#2563eb' },
  accommodation: { label: 'Hotel',          emoji: '🏨', color: '#7c3aed' },
  software:      { label: 'Software',       emoji: '🖥️', color: '#16a34a' },
  supplies:      { label: 'Supplies',       emoji: '📦', color: '#ea580c' },
  entertainment: { label: 'Events',         emoji: '🎭', color: '#db2777' },
  medical:       { label: 'Medical',        emoji: '🏥', color: '#dc2626' },
  training:      { label: 'Training',       emoji: '📚', color: '#0284c7' },
  other:         { label: 'Other',          emoji: '💼', color: '#64748b' }
};

/* ---- Currency formatting ---- */
function formatCurrency(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dateStr + 'T00:00:00'));
  } catch {
    return dateStr;
  }
}

function getMonthLabel(year, month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month));
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function initials(name) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* ============================================
   INITIALIZATION
   ============================================ */
async function init() {
  try {
    await DB.open();
    loadSettings();
    applyTheme();
    State.receipts = await DB.getAll();
    populateFilterMonths();
    renderDashboard();
    setupEventListeners();
    setupNavigation();
    populateSettingsForm();
    hideSplash();
  } catch (err) {
    console.error('Init error:', err);
    hideSplash();
    showToast('Failed to initialize database', 'error');
  }
}

function hideSplash() {
  const splash = document.getElementById('splash');
  const app = document.getElementById('app');
  setTimeout(() => {
    splash.classList.add('fade-out');
    app.classList.remove('hidden');
    setTimeout(() => splash.style.display = 'none', 450);
  }, 800);
}

/* ============================================
   SETTINGS
   ============================================ */
function loadSettings() {
  try {
    const saved = localStorage.getItem('ef_settings');
    if (saved) Object.assign(State.settings, JSON.parse(saved));
  } catch { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem('ef_settings', JSON.stringify(State.settings));
}

function populateSettingsForm() {
  const s = State.settings;
  document.getElementById('sName').value = s.name || '';
  document.getElementById('sEmail').value = s.email || '';
  document.getElementById('sEmployeeId').value = s.employeeId || '';
  document.getElementById('sCompany').value = s.company || '';
  document.getElementById('sDepartment').value = s.department || '';
  document.getElementById('sManagerEmail').value = s.managerEmail || '';
  document.getElementById('sMonthlyBudget').value = s.monthlyBudget || 2000;
  document.getElementById('sCurrency').value = s.currency || 'USD';
  document.getElementById('sDarkMode').checked = s.darkMode || false;
  updateProfileDisplay();
}

function updateProfileDisplay() {
  const s = State.settings;
  const displayName = s.name || 'User';
  document.getElementById('greetingName').textContent = displayName;
  document.getElementById('userAvatar').textContent = initials(displayName);
  document.getElementById('settingsAvatar').textContent = initials(displayName);
  document.getElementById('settingsAvatarName').textContent = displayName || 'Set your name';
  document.getElementById('settingsAvatarEmail').textContent = s.email || 'Add your email';
  document.getElementById('fCurrency').value = s.currency || 'USD';
}

function applyTheme() {
  document.body.classList.toggle('dark', State.settings.darkMode);
}

/* ============================================
   NAVIGATION
   ============================================ */
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  add: 'Add Receipt',
  receipts: 'Receipts',
  report: 'Monthly Report',
  settings: 'Settings'
};

function navigate(page, skipAnimation = false) {
  const prev = document.getElementById(`page-${State.currentPage}`);
  const next = document.getElementById(`page-${page}`);
  if (!next || State.currentPage === page) return;

  prev.classList.remove('active');
  next.classList.add('active');
  if (!skipAnimation) next.classList.add('slide-in');
  setTimeout(() => next.classList.remove('slide-in'), 300);

  State.currentPage = page;
  document.getElementById('header-title').textContent = PAGE_TITLES[page] || page;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  if (page === 'dashboard') renderDashboard();
  if (page === 'receipts') renderReceiptsList();
  if (page === 'report') renderReport();
  if (page === 'add' && !State.editingId) resetAddForm();
}

window.navigate = navigate;

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
}

/* ============================================
   DASHBOARD
   ============================================ */
function renderDashboard() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  document.getElementById('greetingMonth').textContent = getMonthLabel(year, month);

  const monthReceipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const monthTotal = monthReceipts.reduce((s, r) => s + Number(r.amount), 0);
  const allTotal = State.receipts.reduce((s, r) => s + Number(r.amount), 0);
  const pending = State.receipts.filter(r => r.status === 'pending').length;
  const approved = State.receipts.filter(r => r.status === 'approved').length;

  document.getElementById('dashMonthlyTotal').textContent = formatCurrency(monthTotal, State.settings.currency);
  document.getElementById('dashReceiptCount').textContent = `${monthReceipts.length} receipt${monthReceipts.length !== 1 ? 's' : ''}`;
  document.getElementById('dashMonthName').textContent = 'this month';
  document.getElementById('dashPending').textContent = pending;
  document.getElementById('dashApproved').textContent = approved;
  document.getElementById('dashTotal').textContent = formatCurrency(allTotal, State.settings.currency);

  const budget = State.settings.monthlyBudget || 2000;
  const pct = Math.min((monthTotal / budget) * 100, 100);
  document.getElementById('dashSpendingBar').style.width = pct + '%';
  document.getElementById('dashBudgetLabel').textContent = formatCurrency(budget, State.settings.currency);

  renderDashCategories(monthReceipts);
  renderRecentReceipts();
}

function renderDashCategories(receipts) {
  const container = document.getElementById('dashCategories');
  if (!receipts.length) {
    container.innerHTML = '<div class="empty-state-small">No expenses this month</div>';
    return;
  }

  const byCategory = {};
  receipts.forEach(r => {
    byCategory[r.category] = (byCategory[r.category] || 0) + Number(r.amount);
  });

  const max = Math.max(...Object.values(byCategory));
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  container.innerHTML = sorted.map(([cat, total]) => {
    const info = CATEGORIES[cat] || CATEGORIES.other;
    const pct = (total / max) * 100;
    return `
      <div class="cat-row">
        <div class="cat-row-emoji">${info.emoji}</div>
        <div class="cat-row-info">
          <div class="cat-row-name">${info.label}</div>
          <div class="cat-row-bar-wrap">
            <div class="cat-row-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="cat-row-amount">${formatCurrency(total, State.settings.currency)}</div>
      </div>`;
  }).join('');
}

function renderRecentReceipts() {
  const container = document.getElementById('dashRecentReceipts');
  const recent = State.receipts.slice(0, 5);

  if (!recent.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></div>
        <p>No receipts yet</p>
        <button class="btn-primary btn-sm" onclick="navigate('add')">Add your first receipt</button>
      </div>`;
    return;
  }
  container.innerHTML = recent.map(r => receiptCardHTML(r)).join('');
  container.querySelectorAll('.receipt-card').forEach(card => {
    card.addEventListener('click', () => openReceiptModal(Number(card.dataset.id)));
  });
}

/* ============================================
   RECEIPTS LIST
   ============================================ */
function renderReceiptsList() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const catFilter = document.getElementById('filterCategory').value;
  const monthFilter = document.getElementById('filterMonth').value;
  const statusFilter = document.getElementById('filterStatus').value;

  let filtered = State.receipts.filter(r => {
    if (search && !r.merchant.toLowerCase().includes(search) &&
        !(r.description || '').toLowerCase().includes(search) &&
        !(CATEGORIES[r.category]?.label || '').toLowerCase().includes(search)) return false;
    if (catFilter !== 'all' && r.category !== catFilter) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (monthFilter !== 'all') {
      const [y, m] = monthFilter.split('-').map(Number);
      const d = new Date(r.date + 'T00:00:00');
      if (d.getFullYear() !== y || d.getMonth() !== m) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, r) => s + Number(r.amount), 0);
  document.getElementById('receiptsCount').textContent =
    `${filtered.length} receipt${filtered.length !== 1 ? 's' : ''} · Total: ${formatCurrency(total, State.settings.currency)}`;

  const container = document.getElementById('receiptsContainer');
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg></div>
        <p>No receipts found</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(r => receiptCardHTML(r)).join('');
  container.querySelectorAll('.receipt-card').forEach(card => {
    card.addEventListener('click', () => openReceiptModal(Number(card.dataset.id)));
  });
}

function receiptCardHTML(r) {
  const cat = CATEGORIES[r.category] || CATEGORIES.other;
  const thumb = r.imageData
    ? `<img src="${r.imageData}" alt="Receipt" loading="lazy">`
    : `<div class="receipt-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

  return `
    <div class="receipt-card" data-id="${r.id}">
      <div class="receipt-thumb">${thumb}</div>
      <div class="receipt-info">
        <div class="receipt-merchant">${escapeHtml(r.merchant)}</div>
        <div class="receipt-meta">
          <span class="badge badge--${r.category}">${cat.emoji} ${cat.label}</span>
          <span class="badge badge--${r.status}">${r.status}</span>
        </div>
        <div class="receipt-date">${formatDate(r.date)}</div>
      </div>
      <div class="receipt-right">
        <div class="receipt-amount">${formatCurrency(r.amount, r.currency)}</div>
        <div class="receipt-currency">${r.currency}</div>
      </div>
    </div>`;
}

function populateFilterMonths() {
  const select = document.getElementById('filterMonth');
  const months = new Set();
  State.receipts.forEach(r => {
    const d = new Date(r.date + 'T00:00:00');
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
  });

  const sorted = [...months].sort((a, b) => b.localeCompare(a));
  sorted.forEach(key => {
    const [y, m] = key.split('-').map(Number);
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = getMonthLabel(y, m);
    select.appendChild(opt);
  });
}

/* ============================================
   ADD / EDIT RECEIPT
   ============================================ */
function resetAddForm() {
  State.capturedImage = null;
  State.editingId = null;
  State.selectedCategory = null;

  document.getElementById('receiptForm').reset();
  document.getElementById('fDate').value = todayISO();
  document.getElementById('fCurrency').value = State.settings.currency || 'USD';
  document.getElementById('fEditId').value = '';
  document.getElementById('btnSave').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    Save Receipt`;

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
  State.editingId = receipt.id;
  State.selectedCategory = receipt.category;
  State.capturedImage = receipt.imageData || null;

  document.getElementById('fAmount').value = receipt.amount;
  document.getElementById('fCurrency').value = receipt.currency || 'USD';
  document.getElementById('fMerchant').value = receipt.merchant;
  document.getElementById('fDate').value = receipt.date;
  document.getElementById('fStatus').value = receipt.status;
  document.getElementById('fDesc').value = receipt.description || '';
  document.getElementById('fEditId').value = receipt.id;
  document.getElementById('btnSave').innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    Update Receipt`;

  document.querySelectorAll('.cat-chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.cat === receipt.category);
  });
  document.getElementById('fCategory').value = receipt.category;

  if (receipt.imageData) {
    const img = document.getElementById('capturedImg');
    img.src = receipt.imageData;
    img.classList.remove('hidden');
    document.getElementById('capturePlaceholder').classList.add('hidden');
    document.getElementById('btnRemoveImg').classList.remove('hidden');
  } else {
    clearCaptureZone();
  }
}

/* ============================================
   CAMERA
   ============================================ */
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function triggerCamera() {
  if (isMobile()) {
    document.getElementById('fileInput').setAttribute('capture', 'environment');
    document.getElementById('fileInput').click();
  } else {
    startDesktopCamera();
  }
}

async function startDesktopCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    State.cameraStream = stream;
    const video = document.getElementById('cameraStream');
    video.srcObject = stream;
    video.classList.remove('hidden');
    document.getElementById('capturePlaceholder').classList.add('hidden');
    document.getElementById('capturedImg').classList.add('hidden');
    document.getElementById('cameraControls').classList.remove('hidden');
    document.getElementById('capture-zone-btns') && (document.getElementById('capture-zone-btns').style.display = 'none');
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showToast('Camera permission denied', 'error');
    } else {
      // Fallback to file input
      document.getElementById('fileInput').removeAttribute('capture');
      document.getElementById('fileInput').click();
    }
  }
}

function captureFromVideo() {
  const video = document.getElementById('cameraStream');
  const canvas = document.getElementById('captureCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const imageData = canvas.toDataURL('image/jpeg', 0.85);
  setCapuredImage(imageData);
  stopCameraStream();
}

function stopCameraStream() {
  if (State.cameraStream) {
    State.cameraStream.getTracks().forEach(t => t.stop());
    State.cameraStream = null;
  }
  document.getElementById('cameraStream').classList.add('hidden');
  document.getElementById('cameraStream').srcObject = null;
  document.getElementById('cameraControls').classList.add('hidden');
}

function setCapuredImage(dataUrl) {
  State.capturedImage = dataUrl;
  const img = document.getElementById('capturedImg');
  img.src = dataUrl;
  img.classList.remove('hidden');
  document.getElementById('capturePlaceholder').classList.add('hidden');
  document.getElementById('btnRemoveImg').classList.remove('hidden');
}

function handleFileInput(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => setCapuredImage(e.target.result);
  reader.readAsDataURL(file);
}

/* ============================================
   SAVE RECEIPT
   ============================================ */
async function saveReceipt(e) {
  e.preventDefault();

  const category = document.getElementById('fCategory').value;
  if (!category) {
    showToast('Please select a category', 'error');
    return;
  }

  const receipt = {
    amount: parseFloat(document.getElementById('fAmount').value),
    currency: document.getElementById('fCurrency').value,
    category,
    merchant: document.getElementById('fMerchant').value.trim(),
    date: document.getElementById('fDate').value,
    status: document.getElementById('fStatus').value,
    description: document.getElementById('fDesc').value.trim(),
    imageData: State.capturedImage || null
  };

  const editId = document.getElementById('fEditId').value;

  try {
    if (editId) {
      receipt.id = Number(editId);
      await DB.update(receipt);
      const idx = State.receipts.findIndex(r => r.id === receipt.id);
      if (idx >= 0) State.receipts[idx] = receipt;
      showToast('Receipt updated', 'success');
    } else {
      const id = await DB.add(receipt);
      receipt.id = id;
      State.receipts.unshift(receipt);
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

/* ============================================
   RECEIPT MODAL
   ============================================ */
function openReceiptModal(id) {
  const receipt = State.receipts.find(r => r.id === id);
  if (!receipt) return;

  State.modalReceiptId = id;
  const cat = CATEGORIES[receipt.category] || CATEGORIES.other;

  document.getElementById('modalMerchant').textContent = receipt.merchant;
  document.getElementById('modalAmount').textContent = formatCurrency(receipt.amount, receipt.currency);

  const catBadge = document.getElementById('modalCategory');
  catBadge.textContent = `${cat.emoji} ${cat.label}`;
  catBadge.className = `badge badge--${receipt.category}`;

  const statusBadge = document.getElementById('modalStatus');
  statusBadge.textContent = receipt.status;
  statusBadge.className = `badge badge--${receipt.status}`;

  document.getElementById('modalDate').textContent = formatDate(receipt.date);
  document.getElementById('modalCurrency').textContent = receipt.currency;
  document.getElementById('modalDesc').textContent = receipt.description || '—';

  if (receipt.imageData) {
    document.getElementById('modalImage').src = receipt.imageData;
    document.getElementById('modalImage').classList.remove('hidden');
    document.getElementById('modalNoImage').classList.add('hidden');
  } else {
    document.getElementById('modalImage').classList.add('hidden');
    document.getElementById('modalNoImage').classList.remove('hidden');
  }

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
    State.receipts = State.receipts.filter(r => r.id !== id);
    document.getElementById('confirmModal').classList.add('hidden');
    State.deleteTargetId = null;
    showToast('Receipt deleted', 'success');
    if (State.currentPage === 'receipts') renderReceiptsList();
    if (State.currentPage === 'dashboard') renderDashboard();
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Failed to delete', 'error');
  }
}

/* ============================================
   REPORT
   ============================================ */
function renderReport() {
  const month = State.reportMonth;
  const year = State.reportYear;

  document.getElementById('reportMonthLabel').textContent = getMonthLabel(year, month);

  const receipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const total = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const avgDay = total / daysInMonth;

  document.getElementById('reportTotal').textContent = formatCurrency(total, State.settings.currency);
  document.getElementById('reportCount').textContent = receipts.length;
  document.getElementById('reportAvgDay').textContent = formatCurrency(avgDay, State.settings.currency);

  renderReportCategories(receipts, total);
  renderReportReceiptsList(receipts);
}

function renderReportCategories(receipts, grandTotal) {
  const container = document.getElementById('reportCategories');
  if (!receipts.length) {
    container.innerHTML = '<div class="empty-state-small">No expenses this month</div>';
    return;
  }

  const byCategory = {};
  receipts.forEach(r => {
    byCategory[r.category] = (byCategory[r.category] || 0) + Number(r.amount);
  });

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  const currency = State.settings.currency;

  container.innerHTML = sorted.map(([cat, total]) => {
    const info = CATEGORIES[cat] || CATEGORIES.other;
    const pct = grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : 0;
    const barW = (total / max) * 100;
    const count = receipts.filter(r => r.category === cat).length;
    return `
      <div class="report-cat-row">
        <div class="report-cat-emoji">${info.emoji}</div>
        <div class="report-cat-info">
          <div class="report-cat-name">${info.label}</div>
          <div class="report-cat-count">${count} receipt${count !== 1 ? 's' : ''}</div>
          <div class="report-cat-bar-wrap">
            <div class="report-cat-bar" style="width:${barW}%"></div>
          </div>
        </div>
        <div>
          <div class="report-cat-amount">${formatCurrency(total, currency)}</div>
          <div class="report-cat-pct">${pct}%</div>
        </div>
      </div>`;
  }).join('');
}

function renderReportReceiptsList(receipts) {
  const container = document.getElementById('reportReceiptsList');
  if (!receipts.length) {
    container.innerHTML = '<div class="empty-state-small">No receipts this month</div>';
    return;
  }
  container.innerHTML = receipts.map(r => receiptCardHTML(r)).join('');
  container.querySelectorAll('.receipt-card').forEach(card => {
    card.addEventListener('click', () => openReceiptModal(Number(card.dataset.id)));
  });
}

/* ============================================
   PDF GENERATION
   ============================================ */
async function generatePDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { showToast('PDF library not loaded', 'error'); return; }

  const month = State.reportMonth;
  const year = State.reportYear;
  const monthLabel = getMonthLabel(year, month);
  const s = State.settings;
  const currency = s.currency || 'USD';

  const receipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header gradient band
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageW, 40, 'F');
  doc.setFillColor(139, 92, 246);
  doc.rect(pageW - 60, 0, 60, 40, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ExpenseFlow', 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Expense Report', 14, 24);
  doc.setFontSize(11);
  doc.text(monthLabel, 14, 33);

  // Company / Employee info
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(s.company || 'Company', pageW - 14, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(s.name || 'Employee', pageW - 14, 17, { align: 'right' });
  if (s.employeeId) doc.text(`ID: ${s.employeeId}`, pageW - 14, 23, { align: 'right' });
  if (s.department) doc.text(s.department, pageW - 14, 29, { align: 'right' });
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, pageW - 14, 35, { align: 'right' });

  // Summary boxes
  const total = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const pending = receipts.filter(r => r.status === 'pending').length;
  const approved = receipts.filter(r => r.status === 'approved').length;

  const boxY = 48;
  const boxes = [
    { label: 'Total Amount', value: formatCurrency(total, currency) },
    { label: 'Receipts', value: String(receipts.length) },
    { label: 'Pending', value: String(pending) },
    { label: 'Approved', value: String(approved) }
  ];

  const boxW = (pageW - 28 - 9) / 4;
  boxes.forEach((box, i) => {
    const x = 14 + i * (boxW + 3);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, boxY, boxW, 20, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, boxY, boxW, 20, 2, 2, 'S');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(box.label.toUpperCase(), x + boxW / 2, boxY + 7, { align: 'center' });

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i === 0 ? 9 : 11);
    doc.text(box.value, x + boxW / 2, boxY + 15, { align: 'center' });
  });

  // Category breakdown
  const catY = boxY + 28;
  const byCategory = {};
  receipts.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + Number(r.amount); });
  const catEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  if (catEntries.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('By Category', 14, catY);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, catY + 2, pageW - 14, catY + 2);

    catEntries.forEach(([cat, amt], i) => {
      const info = CATEGORIES[cat] || CATEGORIES.other;
      const y = catY + 8 + i * 7;
      const pct = total > 0 ? (amt / total * 100).toFixed(1) : 0;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(`${info.emoji} ${info.label}`, 14, y);
      doc.setTextColor(100, 116, 139);
      doc.text(`${pct}%`, 90, y, { align: 'right' });
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(amt, currency), pageW - 14, y, { align: 'right' });

      // Mini bar
      const barX = 95;
      const barW2 = pageW - 14 - barX - 30;
      const barFill = (amt / total) * barW2;
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, y - 3.5, barW2, 3, 1, 1, 'F');
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(barX, y - 3.5, barFill, 3, 1, 1, 'F');
    });
  }

  // Receipts table
  const tableY = catY + 10 + catEntries.length * 7 + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Receipts Detail', 14, tableY);

  if (receipts.length) {
    doc.autoTable({
      startY: tableY + 4,
      head: [['Date', 'Merchant', 'Category', 'Status', 'Amount']],
      body: receipts.map(r => [
        formatDate(r.date),
        r.merchant,
        (CATEGORIES[r.category] || CATEGORIES.other).label,
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        formatCurrency(r.amount, r.currency)
      ]),
      foot: [['', '', '', 'TOTAL', formatCurrency(total, currency)]],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 }
    });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text('No receipts this month', 14, tableY + 12);
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footY = doc.internal.pageSize.getHeight() - 8;
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text('ExpenseFlow — Confidential', 14, footY);
    doc.text(`Page ${i} of ${pageCount}`, pageW - 14, footY, { align: 'right' });
    if (s.company) doc.text(s.company, pageW / 2, footY, { align: 'center' });
  }

  const filename = `ExpenseReport_${year}_${String(month + 1).padStart(2, '0')}_${(s.name || 'report').replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
  showToast('PDF downloaded!', 'success');
}

function sendReportEmail() {
  const s = State.settings;
  if (!s.managerEmail) {
    showToast('Add manager email in Settings first', 'info');
    navigate('settings');
    return;
  }

  const month = State.reportMonth;
  const year = State.reportYear;
  const monthLabel = getMonthLabel(year, month);
  const receipts = State.receipts.filter(r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === month && d.getFullYear() === year;
  });
  const total = receipts.reduce((sum, r) => sum + Number(r.amount), 0);

  const subject = encodeURIComponent(`Expense Report — ${monthLabel} — ${s.name || 'Employee'}`);
  const body = encodeURIComponent(
    `Hi,\n\nPlease find my expense report for ${monthLabel}.\n\n` +
    `Employee: ${s.name || '—'}\n` +
    `Department: ${s.department || '—'}\n` +
    `Period: ${monthLabel}\n` +
    `Total Amount: ${formatCurrency(total, s.currency)}\n` +
    `Number of Receipts: ${receipts.length}\n\n` +
    `Please download the PDF report from ExpenseFlow for the complete breakdown.\n\n` +
    `Best regards,\n${s.name || 'Employee'}`
  );

  window.location.href = `mailto:${s.managerEmail}?subject=${subject}&body=${body}`;
  showToast('Opening email client...', 'info');
}

/* ============================================
   TOAST NOTIFICATIONS
   ============================================ */
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

/* ============================================
   UTILITIES
   ============================================ */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================
   EVENT LISTENERS
   ============================================ */
function setupEventListeners() {
  // Camera / Upload
  document.getElementById('btnCamera').addEventListener('click', triggerCamera);
  document.getElementById('btnUpload').addEventListener('click', () => {
    document.getElementById('fileInput').removeAttribute('capture');
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', (e) => {
    handleFileInput(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btnCapture').addEventListener('click', captureFromVideo);
  document.getElementById('btnCancelCamera').addEventListener('click', () => {
    stopCameraStream();
    document.getElementById('capturePlaceholder').classList.remove('hidden');
  });
  document.getElementById('btnRemoveImg').addEventListener('click', () => {
    State.capturedImage = null;
    clearCaptureZone();
  });

  // Category chips
  document.getElementById('categoryGrid').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    State.selectedCategory = chip.dataset.cat;
    document.getElementById('fCategory').value = chip.dataset.cat;
  });

  // Receipt form
  document.getElementById('receiptForm').addEventListener('submit', saveReceipt);

  // Search & filter
  document.getElementById('searchInput').addEventListener('input', () => renderReceiptsList());
  document.getElementById('filterBtn').addEventListener('click', () => {
    State.filterOpen = !State.filterOpen;
    document.getElementById('filterPanel').classList.toggle('open', State.filterOpen);
    document.getElementById('filterBtn').classList.toggle('active', State.filterOpen);
  });
  document.getElementById('filterCategory').addEventListener('change', () => renderReceiptsList());
  document.getElementById('filterMonth').addEventListener('change', () => renderReceiptsList());
  document.getElementById('filterStatus').addEventListener('change', () => renderReceiptsList());
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterMonth').value = 'all';
    document.getElementById('filterStatus').value = 'all';
    renderReceiptsList();
  });

  // Receipt modal
  document.getElementById('closeModal').addEventListener('click', closeReceiptModal);
  document.getElementById('receiptModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('receiptModal')) closeReceiptModal();
  });
  document.getElementById('modalDelete').addEventListener('click', () => {
    if (State.modalReceiptId) openConfirmDelete(State.modalReceiptId);
  });
  document.getElementById('modalEdit').addEventListener('click', async () => {
    const id = State.modalReceiptId;
    closeReceiptModal();
    const receipt = await DB.getById(id);
    if (receipt) {
      navigate('add');
      loadReceiptIntoForm(receipt);
    }
  });

  // Confirm delete modal
  document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.add('hidden');
    State.deleteTargetId = null;
  });
  document.getElementById('confirmDelete').addEventListener('click', () => {
    if (State.deleteTargetId) deleteReceipt(State.deleteTargetId);
  });
  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirmModal')) {
      document.getElementById('confirmModal').classList.add('hidden');
      State.deleteTargetId = null;
    }
  });

  // Report navigation
  document.getElementById('reportPrevMonth').addEventListener('click', () => {
    State.reportMonth--;
    if (State.reportMonth < 0) { State.reportMonth = 11; State.reportYear--; }
    renderReport();
  });
  document.getElementById('reportNextMonth').addEventListener('click', () => {
    State.reportMonth++;
    if (State.reportMonth > 11) { State.reportMonth = 0; State.reportYear++; }
    renderReport();
  });
  document.getElementById('btnGeneratePDF').addEventListener('click', generatePDF);
  document.getElementById('btnSendReport').addEventListener('click', sendReportEmail);

  // Settings
  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    State.settings.name = document.getElementById('sName').value.trim();
    State.settings.email = document.getElementById('sEmail').value.trim();
    State.settings.employeeId = document.getElementById('sEmployeeId').value.trim();
    State.settings.company = document.getElementById('sCompany').value.trim();
    State.settings.department = document.getElementById('sDepartment').value.trim();
    State.settings.managerEmail = document.getElementById('sManagerEmail').value.trim();
    State.settings.monthlyBudget = parseFloat(document.getElementById('sMonthlyBudget').value) || 2000;
    State.settings.currency = document.getElementById('sCurrency').value;
    State.settings.darkMode = document.getElementById('sDarkMode').checked;
    saveSettings();
    applyTheme();
    updateProfileDisplay();
    showToast('Settings saved', 'success');
  });

  document.getElementById('sDarkMode').addEventListener('change', (e) => {
    State.settings.darkMode = e.target.checked;
    applyTheme();
  });

  document.getElementById('btnClearData').addEventListener('click', async () => {
    if (!confirm('Delete ALL receipts? This cannot be undone.')) return;
    await DB.clear();
    State.receipts = [];
    renderDashboard();
    renderReceiptsList();
    showToast('All data cleared', 'info');
  });

  // Keyboard shortcut: Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeReceiptModal();
      document.getElementById('confirmModal').classList.add('hidden');
    }
  });

  // Drag and drop on capture zone
  const captureZone = document.getElementById('captureZone');
  captureZone.addEventListener('dragover', (e) => { e.preventDefault(); captureZone.style.opacity = '.7'; });
  captureZone.addEventListener('dragleave', () => { captureZone.style.opacity = ''; });
  captureZone.addEventListener('drop', (e) => {
    e.preventDefault();
    captureZone.style.opacity = '';
    const file = e.dataTransfer.files[0];
    handleFileInput(file);
  });
}

/* ============================================
   SAMPLE DATA (first launch)
   ============================================ */
async function addSampleData() {
  const samples = [
    { merchant: 'Delta Airlines', amount: 342.50, currency: 'USD', category: 'travel', date: (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d.toISOString().split('T')[0]; })(), status: 'approved', description: 'Flight to client meeting NYC', imageData: null },
    { merchant: 'Marriott Hotel', amount: 189.00, currency: 'USD', category: 'accommodation', date: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; })(), status: 'approved', description: 'Business trip accommodation', imageData: null },
    { merchant: 'The Capital Grille', amount: 87.40, currency: 'USD', category: 'meals', date: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })(), status: 'pending', description: 'Client dinner', imageData: null },
    { merchant: 'Adobe Creative Cloud', amount: 54.99, currency: 'USD', category: 'software', date: new Date().toISOString().split('T')[0], status: 'pending', description: 'Monthly subscription', imageData: null },
    { merchant: 'Office Depot', amount: 32.15, currency: 'USD', category: 'supplies', date: (() => { const d = new Date(); d.setDate(d.getDate() - 5); return d.toISOString().split('T')[0]; })(), status: 'approved', description: 'Printer paper and pens', imageData: null }
  ];

  for (const s of samples) {
    const id = await DB.add(s);
    s.id = id;
    State.receipts.unshift(s);
  }
}

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', async () => {
  await init();
  // Add sample data only on first launch
  if (State.receipts.length === 0) {
    await addSampleData();
    State.receipts = await DB.getAll();
    populateFilterMonths();
    renderDashboard();
    showToast('Welcome! Sample data loaded.', 'info');
  }
});
