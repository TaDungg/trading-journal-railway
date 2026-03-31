// ── ACCOUNTS ───────────────────────────────────────────────────
async function loadAccounts() {
  try {
    accounts = await apiFetch('/api/accounts');
  } catch (err) {
    console.error('Failed to load accounts:', err);
    accounts = [];
  }
}

function renderAccountSelector() {
  const list = document.getElementById('acct-list');
  const btnLabel = document.getElementById('acct-btn-label');
  if (!list) return;

  const active = accounts.find(a => String(a.id) === String(activeAccountId));
  if (btnLabel) btnLabel.textContent = active ? active.name : 'All Accounts';

  const allItem = `
    <div class="acct-item${activeAccountId === null ? ' active' : ''}" onclick="selectAccount(null)">
      <span class="acct-item-dot all"></span>
      <div class="acct-item-info">
        <div class="acct-item-name">All Accounts</div>
        <div class="acct-item-meta">${accounts.length} account${accounts.length !== 1 ? 's' : ''}</div>
      </div>
    </div>`;

  const items = accounts.map(a => `
    <div class="acct-item${String(a.id) === String(activeAccountId) ? ' active' : ''}" onclick="selectAccount(${a.id})">
      <span class="acct-item-dot ${a.type}"></span>
      <div class="acct-item-info">
        <div class="acct-item-name">${a.name}</div>
        <div class="acct-item-meta">${a.type === 'prop' ? '🏆 Prop Firm' : '💼 Live'} · $${Number(a.size).toLocaleString()}</div>
      </div>
    </div>`).join('');

  list.innerHTML = allItem + items;
}

function toggleAccountDropdown() {
  const dd = document.getElementById('acct-dropdown');
  const sel = document.getElementById('acct-selector');
  if (!dd) return;
  const isOpen = !dd.classList.contains('hidden');
  if (isOpen) {
    dd.classList.add('hidden');
    sel?.classList.remove('open');
  } else {
    renderAccountSelector();
    dd.classList.remove('hidden');
    sel?.classList.add('open');
  }
}

async function selectAccount(id) {
  activeAccountId = id;
  renderAccountSelector();
  document.getElementById('acct-dropdown')?.classList.add('hidden');
  document.getElementById('acct-selector')?.classList.remove('open');
  await refresh();
}

function openAccountModal() {
  document.getElementById('acct-dropdown')?.classList.add('hidden');
  document.getElementById('acct-selector')?.classList.remove('open');
  const nameEl = document.getElementById('acct-name');
  const sizeEl = document.getElementById('acct-size');
  if (nameEl) nameEl.value = '';
  if (sizeEl) sizeEl.value = '';
  const typeEl = document.getElementById('acct-type');
  if (typeEl) typeEl.value = 'live';
  document.querySelectorAll('.acct-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'live');
  });
  document.getElementById('account-modal')?.classList.remove('hidden');
}

function closeAccountModal() {
  document.getElementById('account-modal')?.classList.add('hidden');
}

function setAccountType(val) {
  const typeEl = document.getElementById('acct-type');
  if (typeEl) typeEl.value = val;
  document.querySelectorAll('.acct-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}

async function saveAccount() {
  const name = document.getElementById('acct-name')?.value.trim();
  const type = document.getElementById('acct-type')?.value || 'live';
  const size = parseFloat(document.getElementById('acct-size')?.value) || 0;
  if (!name) { alert('Please enter an account name.'); return; }
  try {
    const newAcct = await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name, type, size }),
    });
    accounts.push(newAcct);
    closeAccountModal();
    await selectAccount(newAcct.id);
  } catch (err) {
    alert('Failed to create account: ' + err.message);
  }
}