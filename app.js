/* Cellar — local-first wine, sake & liquor journal */
(() => {
  'use strict';

  // ---------- Constants ----------
  const STORAGE_KEY = 'cellar.bottles.v1';
  const SETTINGS_KEY = 'cellar.settings.v1';

  const TYPES = {
    wine: ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Fortified', 'Orange', 'Other'],
    sake: ['Junmai', 'Junmai Ginjo', 'Junmai Daiginjo', 'Ginjo', 'Daiginjo', 'Honjozo', 'Nigori', 'Sparkling', 'Koshu', 'Other'],
    liquor: ['Bourbon', 'Whiskey', 'Scotch', 'Rye', 'Irish Whiskey', 'Japanese Whisky', 'Rum', 'Gin', 'Vodka', 'Tequila', 'Mezcal', 'Cognac', 'Brandy', 'Liqueur', 'Other']
  };

  const CATEGORY_LABEL = { wine: 'Wine', sake: 'Sake', liquor: 'Liquor' };

  // ---------- State ----------
  let state = {
    category: 'wine',
    typeFilter: '',
    statusFilter: 'all',
    sortBy: 'rating-desc',
    search: '',
    bottles: load()
  };

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bottles));
    } catch (e) {
      toast('Save failed: storage full?');
    }
  }

  // ---------- Helpers ----------
  function uid() {
    return 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function fmtRating(r) {
    if (r === null || r === undefined || r === '') return null;
    const n = Number(r);
    if (Number.isNaN(n)) return null;
    // Round to 2 decimals, then strip trailing zeros and a trailing dot.
    let s = (Math.round(n * 100) / 100).toFixed(2);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function ratingDisplay(r) {
    const f = fmtRating(r);
    if (f === null) return null;
    // Show at least one decimal so 4 → 4.0
    return f.includes('.') ? f : f + '.0';
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, ms = 2200) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- Rendering ----------
  function populateTypeFilter() {
    const sel = document.getElementById('typeFilter');
    const types = TYPES[state.category];
    sel.innerHTML = '<option value="">All types</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
    sel.value = state.typeFilter;
  }

  function filteredBottles() {
    const q = state.search.trim().toLowerCase();
    return state.bottles
      .filter(b => b.category === state.category)
      .filter(b => !state.typeFilter || b.type === state.typeFilter)
      .filter(b => {
        if (state.statusFilter === 'drank') return !b.cellar;
        if (state.statusFilter === 'cellar') return !!b.cellar;
        return true;
      })
      .filter(b => {
        if (!q) return true;
        return (b.name || '').toLowerCase().includes(q)
          || (b.notes || '').toLowerCase().includes(q)
          || (b.type || '').toLowerCase().includes(q);
      });
  }

  function sortBottles(arr) {
    const a = arr.slice();
    switch (state.sortBy) {
      case 'rating-desc':
        a.sort((x, y) => ratingValueForSort(y) - ratingValueForSort(x) || (x.name || '').localeCompare(y.name || ''));
        break;
      case 'rating-asc':
        a.sort((x, y) => ratingValueForSort(x) - ratingValueForSort(y) || (x.name || '').localeCompare(y.name || ''));
        break;
      case 'name':
        a.sort((x, y) => (x.name || '').localeCompare(y.name || ''));
        break;
      case 'recent':
        a.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
        break;
      case 'yearDrank':
        a.sort((x, y) => (Number(y.yearDrank) || 0) - (Number(x.yearDrank) || 0));
        break;
    }
    return a;
  }
  function ratingValueForSort(b) {
    // Cellar bottles sort below rated ones in desc, above in asc effectively — treat as -1
    if (b.cellar) return -1;
    const v = Number(b.rating);
    return Number.isFinite(v) ? v : -1;
  }

  function computeRanks() {
    // Rank within current category, grouped by type, only for bottles with rating (not cellar)
    const ranks = new Map();
    const byType = new Map();
    state.bottles
      .filter(b => b.category === state.category && !b.cellar && Number.isFinite(Number(b.rating)))
      .forEach(b => {
        const arr = byType.get(b.type) || [];
        arr.push(b);
        byType.set(b.type, arr);
      });
    byType.forEach(arr => {
      arr.sort((x, y) => Number(y.rating) - Number(x.rating));
      arr.forEach((b, i) => ranks.set(b.id, i + 1));
    });
    return ranks;
  }

  function renderList() {
    populateTypeFilter();
    const list = document.getElementById('list');
    let bottles = sortBottles(filteredBottles());
    if (bottles.length === 0) {
      list.innerHTML = `<div class="empty">
        <svg class="em-icon" viewBox="0 0 32 32"><use href="#bottle-icon"/></svg>
        <div>No bottles yet in <strong>${CATEGORY_LABEL[state.category]}</strong>.</div>
        <div style="margin-top:6px;font-size:13px;">Tap + to add one.</div>
      </div>`;
      return;
    }

    const ranks = computeRanks();

    // Group by type when sorting by rating, else flat list
    if (state.sortBy === 'rating-desc' || state.sortBy === 'rating-asc') {
      const groups = new Map();
      bottles.forEach(b => {
        const key = b.cellar ? '__cellar__' : (b.type || 'Other');
        const arr = groups.get(key) || [];
        arr.push(b);
        groups.set(key, arr);
      });
      // Render rated types first (in original order), then cellar
      const orderedKeys = [];
      TYPES[state.category].forEach(t => { if (groups.has(t)) orderedKeys.push(t); });
      groups.forEach((_, k) => { if (!orderedKeys.includes(k) && k !== '__cellar__') orderedKeys.push(k); });
      if (groups.has('__cellar__')) orderedKeys.push('__cellar__');

      list.innerHTML = orderedKeys.map(k => {
        const label = k === '__cellar__' ? 'In Cellar (untasted)' : k;
        const items = groups.get(k);
        return `<div class="group-header">${escapeHtml(label)}</div>` + items.map(b => cardHtml(b, ranks.get(b.id))).join('');
      }).join('');
    } else {
      list.innerHTML = bottles.map(b => cardHtml(b, ranks.get(b.id))).join('');
    }

    // attach click handlers
    list.querySelectorAll('.card').forEach(el => {
      el.addEventListener('click', () => openEntry(el.dataset.id));
    });
  }

  function cardHtml(b, rank) {
    const rated = !b.cellar && Number.isFinite(Number(b.rating));
    const ratingHtml = rated
      ? `<div class="rating-num">${escapeHtml(ratingDisplay(b.rating))}</div><div class="rating-out">out of 5</div>`
      : `<div class="rating-num unrated">In&nbsp;cellar</div>`;
    const subParts = [];
    if (b.type) subParts.push(`<span class="badge">${escapeHtml(b.type)}</span>`);
    if (b.cellar) subParts.push(`<span class="badge cellar-badge">untasted</span>`);
    if (b.yearDrank && !b.cellar) subParts.push(`<span>Drank ${escapeHtml(b.yearDrank)}</span>`);
    if (b.yearBought) subParts.push(`<span>Bought ${escapeHtml(b.yearBought)}</span>`);
    if (b.price) subParts.push(`<span>$${escapeHtml(b.price)}${b.priceYear ? ` · ${escapeHtml(b.priceYear)}` : ''}</span>`);
    const sub = subParts.map((p, i) => i === 0 ? p : `<span class="sep"></span>${p}`).join('');

    const rankLabel = rank ? `№ ${String(rank).padStart(2, '0')}` : (b.cellar ? '—' : '');
    return `<div class="card ${b.cellar ? 'cellar' : 'tasted'}" data-id="${b.id}">
      <div class="card-rank">${escapeHtml(rankLabel)}</div>
      <div class="card-main">
        <h3 class="card-title">${escapeHtml(b.name || 'Untitled')}</h3>
        <div class="card-sub">${sub}</div>
        ${b.notes ? `<p class="card-notes">${escapeHtml(b.notes)}</p>` : ''}
      </div>
      <div class="card-rating">${ratingHtml}</div>
    </div>`;
  }

  // ---------- Entry modal ----------
  function openEntry(id) {
    const modal = document.getElementById('entryModal');
    const form = document.getElementById('entryForm');
    const title = document.getElementById('entryTitle');
    const delBtn = document.getElementById('deleteBtn');

    form.reset();
    form.elements.category.value = state.category;
    populateTypeSelect(form.elements.type, state.category);

    if (id) {
      const b = state.bottles.find(x => x.id === id);
      if (!b) return;
      title.textContent = 'Edit Bottle';
      form.elements.id.value = b.id;
      form.elements.category.value = b.category;
      populateTypeSelect(form.elements.type, b.category, b.type);
      form.elements.name.value = b.name || '';
      form.elements.cellar.checked = !!b.cellar;
      form.elements.rating.value = b.rating ?? '';
      form.elements.notes.value = b.notes || '';
      form.elements.price.value = b.price ?? '';
      form.elements.priceYear.value = b.priceYear ?? '';
      form.elements.yearBought.value = b.yearBought ?? '';
      form.elements.yearDrank.value = b.yearDrank ?? '';
      delBtn.classList.remove('hidden');
    } else {
      title.textContent = 'New ' + CATEGORY_LABEL[state.category];
      form.elements.id.value = '';
      form.elements.category.value = state.category;
      delBtn.classList.add('hidden');
    }
    updateStars(form.elements.rating.value);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => form.elements.name.focus(), 60);
  }

  function populateTypeSelect(sel, cat, current) {
    sel.innerHTML = TYPES[cat].map(t => `<option value="${t}">${t}</option>`).join('');
    if (current) sel.value = current;
  }

  function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function saveEntry(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const cellar = form.elements.cellar.checked;
    let rating = data.rating ? Number(data.rating) : null;
    if (rating !== null && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
      toast('Rating must be 0–5');
      return;
    }
    if (rating !== null) rating = Math.round(rating * 100) / 100;

    const bottle = {
      id: data.id || uid(),
      category: data.category,
      type: data.type,
      name: (data.name || '').trim(),
      cellar,
      rating: cellar ? null : rating,
      notes: (data.notes || '').trim(),
      price: data.price ? Number(data.price) : null,
      priceYear: data.priceYear ? Number(data.priceYear) : null,
      yearBought: data.yearBought ? Number(data.yearBought) : null,
      yearDrank: cellar ? null : (data.yearDrank ? Number(data.yearDrank) : null),
      updatedAt: Date.now(),
      createdAt: Date.now()
    };

    if (data.id) {
      const idx = state.bottles.findIndex(x => x.id === data.id);
      if (idx > -1) {
        bottle.createdAt = state.bottles[idx].createdAt || Date.now();
        state.bottles[idx] = bottle;
      } else {
        state.bottles.push(bottle);
      }
    } else {
      state.bottles.push(bottle);
    }
    save();
    closeModal(document.getElementById('entryModal'));
    renderList();
    updateStat();
    toast(data.id ? 'Updated' : 'Saved');
  }

  function deleteEntry() {
    const id = document.getElementById('entryForm').elements.id.value;
    if (!id) return;
    if (!confirm('Delete this bottle? This cannot be undone.')) return;
    state.bottles = state.bottles.filter(x => x.id !== id);
    save();
    closeModal(document.getElementById('entryModal'));
    renderList();
    updateStat();
    toast('Deleted');
  }

  // ---------- Stars ----------
  function updateStars(value) {
    const stars = document.querySelector('[data-stars]');
    if (!stars) return;
    const v = Number(value);
    if (!Number.isFinite(v)) { stars.textContent = ''; return; }
    const full = Math.floor(v);
    const half = (v - full) >= 0.25 && (v - full) < 0.75;
    const fullPart = (v - full) >= 0.75;
    let s = '';
    for (let i = 0; i < 5; i++) {
      if (i < full) s += '★';
      else if (i === full && fullPart) s += '★';
      else if (i === full && half) s += '⯨';
      else s += '☆';
    }
    stars.textContent = s;
  }

  // ---------- Settings & Backup ----------
  function exportJson() {
    const blob = new Blob([JSON.stringify({
      app: 'cellar',
      version: 1,
      exportedAt: new Date().toISOString(),
      bottles: state.bottles
    }, null, 2)], { type: 'application/json' });
    download(blob, `cellar-backup-${dateStamp()}.json`);
    toast('Backup exported');
  }

  function importJson(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        const incoming = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.bottles) ? parsed.bottles : null);
        if (!incoming) throw new Error('Invalid file');
        if (!confirm(`Import ${incoming.length} bottles?\n\nMerges with current data (duplicates by id are replaced).`)) return;
        const map = new Map(state.bottles.map(b => [b.id, b]));
        incoming.forEach(b => {
          if (b && b.id) map.set(b.id, normalizeBottle(b));
        });
        state.bottles = Array.from(map.values());
        save();
        renderList();
        updateStat();
        toast(`Imported ${incoming.length} bottles`);
      } catch (e) {
        console.error(e);
        toast('Could not import file');
      }
    };
    r.readAsText(file);
  }

  function normalizeBottle(b) {
    return {
      id: b.id || uid(),
      category: ['wine', 'sake', 'liquor'].includes(b.category) ? b.category : 'wine',
      type: b.type || 'Other',
      name: b.name || 'Untitled',
      cellar: !!b.cellar,
      rating: b.rating !== undefined && b.rating !== null && b.rating !== '' ? Number(b.rating) : null,
      notes: b.notes || '',
      price: b.price ?? null,
      priceYear: b.priceYear ?? null,
      yearBought: b.yearBought ?? null,
      yearDrank: b.yearDrank ?? null,
      createdAt: b.createdAt || Date.now(),
      updatedAt: b.updatedAt || Date.now()
    };
  }

  function exportXlsx() {
    if (typeof XLSX === 'undefined') {
      toast('Excel library not loaded — try while online once.');
      return;
    }
    const wb = XLSX.utils.book_new();
    ['wine', 'sake', 'liquor'].forEach(cat => {
      const rows = state.bottles
        .filter(b => b.category === cat)
        .sort((a, b) => (Number(b.rating) || -1) - (Number(a.rating) || -1))
        .map(b => ({
          Name: b.name,
          Type: b.type,
          Status: b.cellar ? 'In cellar' : 'Tasted',
          Rating: b.cellar ? '' : (b.rating ?? ''),
          'Tasting Note': b.notes || '',
          Price: b.price ?? '',
          'Price Year': b.priceYear ?? '',
          'Year Bought': b.yearBought ?? '',
          'Year Drank': b.yearDrank ?? '',
          Added: b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : ''
        }));
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{
        Name: '', Type: '', Status: '', Rating: '', 'Tasting Note': '',
        Price: '', 'Price Year': '', 'Year Bought': '', 'Year Drank': '', Added: ''
      }]);
      ws['!cols'] = [
        { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 40 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, CATEGORY_LABEL[cat]);
    });
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(new Blob([wbout], { type: 'application/octet-stream' }), `cellar-${dateStamp()}.xlsx`);
    toast('Excel exported');
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
  }

  function dateStamp() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function updateStat() {
    const el = document.getElementById('statCount');
    if (el) el.textContent = state.bottles.length;
  }

  // ---------- Wiring ----------
  function bind() {
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        state.category = t.dataset.cat;
        state.typeFilter = '';
        renderList();
      });
    });

    document.getElementById('typeFilter').addEventListener('change', e => {
      state.typeFilter = e.target.value;
      renderList();
    });
    document.getElementById('statusFilter').addEventListener('change', e => {
      state.statusFilter = e.target.value;
      renderList();
    });
    document.getElementById('sortBy').addEventListener('change', e => {
      state.sortBy = e.target.value;
      renderList();
    });
    document.getElementById('searchInput').addEventListener('input', e => {
      state.search = e.target.value;
      renderList();
    });

    document.getElementById('addBtn').addEventListener('click', () => openEntry(null));

    // Modal close handlers
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', e => closeModal(e.currentTarget.closest('.modal')));
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => closeModal(m));
      }
    });

    // Entry form
    document.getElementById('entryForm').addEventListener('submit', saveEntry);
    document.getElementById('deleteBtn').addEventListener('click', deleteEntry);
    document.querySelector('input[name="rating"]').addEventListener('input', e => updateStars(e.target.value));
    document.querySelector('input[name="cellar"]').addEventListener('change', e => {
      const ratingField = document.querySelector('.rating-field');
      const yearDrankInput = document.querySelector('input[name="yearDrank"]');
      if (e.target.checked) {
        ratingField.style.opacity = '0.5';
        document.querySelector('input[name="rating"]').value = '';
        updateStars('');
        if (yearDrankInput) yearDrankInput.value = '';
      } else {
        ratingField.style.opacity = '1';
      }
    });

    // Settings
    document.getElementById('settingsBtn').addEventListener('click', () => {
      updateStat();
      document.getElementById('settingsModal').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    });
    document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
    document.getElementById('exportXlsxBtn').addEventListener('click', exportXlsx);
    document.getElementById('importInput').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) importJson(f);
      e.target.value = '';
    });
  }

  // ---------- Service worker ----------
  function registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }

  // ---------- Init ----------
  function init() {
    bind();
    populateTypeFilter();
    renderList();
    updateStat();
    registerSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
