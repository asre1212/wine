/* Cellar 2.0 — local-first wine, sake and liquor journal */
(function () {
  'use strict';

  var APP_VERSION = '2.0.0';
  var STORAGE_KEY = 'cellar.bottles.v1';
  var NOTES_KEY = 'cellar.notes.v1';
  var NOTES_SAVED_AT_KEY = 'cellar.notes.savedAt.v1';
  var LAST_UPDATED_KEY = 'cellar.lastUpdated.v1';

  var TYPES = {
    wine: ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Fortified', 'Orange', 'Other'],
    sake: ['Junmai', 'Junmai Ginjo', 'Junmai Daiginjo', 'Ginjo', 'Daiginjo', 'Honjozo', 'Nigori', 'Sparkling', 'Koshu', 'Other'],
    liquor: ['Bourbon', 'Whiskey', 'Scotch', 'Rye', 'Irish Whiskey', 'Japanese Whisky', 'Rum', 'Gin', 'Vodka', 'Tequila', 'Mezcal', 'Cognac', 'Brandy', 'Port', 'Liqueur', 'Other']
  };

  var WINE_STYLES = {
    Red: ['Pinot Noir', 'Cabernet Sauvignon', 'Merlot', 'Syrah / Shiraz', 'Zinfandel', 'Malbec', 'Sangiovese / Chianti', 'Nebbiolo / Barolo', 'Tempranillo / Rioja', 'Grenache / GSM', 'Bordeaux Blend', 'Red Blend', 'Other'],
    White: ['Chardonnay', 'Chablis', 'Sauvignon Blanc', 'Riesling', 'Pinot Grigio / Pinot Gris', 'Chenin Blanc', 'Viognier', 'Albariño', 'Grüner Veltliner', 'White Burgundy', 'White Blend', 'Other'],
    'Rosé': ['Provence Rosé', 'Pinot Noir Rosé', 'Grenache Rosé', 'Sparkling Rosé', 'Other'],
    Sparkling: ['Champagne', 'Cava', 'Prosecco', 'Crémant', 'Franciacorta', 'Sparkling Rosé', 'Other'],
    Dessert: ['Sauternes', 'Tokaji', 'Ice Wine', 'Late Harvest', 'Port-style Dessert', 'Other'],
    Fortified: ['Port', 'Sherry', 'Madeira', 'Marsala', 'Vermouth', 'Other'],
    Orange: ['Skin-contact White', 'Amber Wine', 'Other'],
    Other: ['Other']
  };

  var CATEGORY_LABELS = { wine: 'Wine', sake: 'Sake', liquor: 'Liquor' };
  var state = {
    category: 'wine',
    typeFilter: '',
    statusFilter: 'all',
    sortBy: 'rating-desc',
    search: '',
    bottles: []
  };
  var notesTimer = null;

  function byId(id) { return document.getElementById(id); }
  function now() { return Date.now ? Date.now() : new Date().getTime(); }
  function uid() { return 'b_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function numberOrNull(value) {
    if (value === '' || value === null || typeof value === 'undefined') return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }
  function escapeHtml(value) {
    return String(value === null || typeof value === 'undefined' ? '' : value)
      .replace(/[&<>"']/g, function (character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
      });
  }
  function dateStamp() { return new Date().toISOString().slice(0, 10); }
  function formValue(form, name) {
    return form.elements[name] ? String(form.elements[name].value || '') : '';
  }

  function normalizeBottle(source) {
    source = source || {};
    var category = ['wine', 'sake', 'liquor'].indexOf(source.category) >= 0 ? source.category : 'wine';
    return {
      id: source.id || uid(),
      category: category,
      type: source.type || 'Other',
      subtype: category === 'wine' ? (source.subtype || '') : '',
      name: source.name || 'Untitled',
      cellar: !!source.cellar,
      rating: numberOrNull(source.rating),
      notes: source.notes || '',
      photo: typeof source.photo === 'string' ? source.photo : '',
      price: numberOrNull(source.price),
      priceYear: numberOrNull(source.priceYear),
      yearBought: numberOrNull(source.yearBought),
      yearDrank: numberOrNull(source.yearDrank),
      createdAt: numberOrNull(source.createdAt) || now(),
      updatedAt: numberOrNull(source.updatedAt) || now()
    };
  }

  function loadBottles() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeBottle) : [];
    } catch (error) {
      console.error('Could not read Cellar data', error);
      return [];
    }
  }

  function persistBottles(nextBottles) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextBottles));
      return true;
    } catch (error) {
      console.error('Could not save Cellar data', error);
      toast('Storage is full. Remove a picture and try again.', 3600);
      return false;
    }
  }

  function toast(message, duration) {
    var element = byId('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { element.classList.remove('show'); }, duration || 2200);
  }

  function openModal(id) {
    var modal = byId(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function styleLabel(bottle) {
    if (bottle.category === 'wine' && bottle.subtype) return bottle.type + ' · ' + bottle.subtype;
    return bottle.type || 'Other';
  }

  function populateTypeFilter() {
    var select = byId('typeFilter');
    if (!select) return;
    var html = '<option value="">All types</option>';
    TYPES[state.category].forEach(function (type) {
      html += '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + '</option>';
    });
    select.innerHTML = html;
    select.value = state.typeFilter;
  }

  function filteredBottles() {
    var query = state.search.trim().toLowerCase();
    return state.bottles.filter(function (bottle) {
      if (bottle.category !== state.category) return false;
      if (state.typeFilter && bottle.type !== state.typeFilter) return false;
      if (state.statusFilter === 'drank' && bottle.cellar) return false;
      if (state.statusFilter === 'cellar' && !bottle.cellar) return false;
      if (!query) return true;
      return String(bottle.name || '').toLowerCase().indexOf(query) >= 0 ||
        String(bottle.notes || '').toLowerCase().indexOf(query) >= 0 ||
        String(bottle.type || '').toLowerCase().indexOf(query) >= 0 ||
        String(bottle.subtype || '').toLowerCase().indexOf(query) >= 0;
    });
  }

  function ratingValue(bottle) {
    if (bottle.cellar || bottle.rating === null) return -1;
    return Number(bottle.rating);
  }

  function sortBottles(bottles) {
    return bottles.slice().sort(function (a, b) {
      if (state.sortBy === 'rating-asc') return ratingValue(a) - ratingValue(b) || a.name.localeCompare(b.name);
      if (state.sortBy === 'name') return a.name.localeCompare(b.name);
      if (state.sortBy === 'recent') return b.createdAt - a.createdAt;
      if (state.sortBy === 'yearDrank') return (b.yearDrank || 0) - (a.yearDrank || 0);
      return ratingValue(b) - ratingValue(a) || a.name.localeCompare(b.name);
    });
  }

  function computeRanks() {
    var groups = {};
    var ranks = {};
    state.bottles.forEach(function (bottle) {
      if (bottle.category !== state.category || bottle.cellar || bottle.rating === null) return;
      var key = styleLabel(bottle);
      if (!groups[key]) groups[key] = [];
      groups[key].push(bottle);
    });
    Object.keys(groups).forEach(function (key) {
      groups[key].sort(function (a, b) { return Number(b.rating) - Number(a.rating); });
      groups[key].forEach(function (bottle, index) { ranks[bottle.id] = index + 1; });
    });
    return ranks;
  }

  function orderedGroupNames(groups) {
    var result = [];
    if (state.category === 'wine') {
      TYPES.wine.forEach(function (type) {
        if (groups[type]) result.push(type);
        (WINE_STYLES[type] || []).forEach(function (style) {
          var name = type + ' · ' + style;
          if (groups[name]) result.push(name);
        });
      });
    } else {
      TYPES[state.category].forEach(function (type) { if (groups[type]) result.push(type); });
    }
    Object.keys(groups).forEach(function (name) {
      if (name !== '__cellar__' && result.indexOf(name) < 0) result.push(name);
    });
    if (groups.__cellar__) result.push('__cellar__');
    return result;
  }

  function displayRating(value) {
    var number = Math.round(Number(value) * 100) / 100;
    return number % 1 === 0 ? number.toFixed(1) : String(number).replace(/0+$/, '').replace(/\.$/, '');
  }

  function cardHtml(bottle, rank) {
    var meta = [];
    if (bottle.type) meta.push('<span class="badge">' + escapeHtml(bottle.type) + '</span>');
    if (bottle.category === 'wine' && bottle.subtype) meta.push('<span class="badge wine-style-badge">' + escapeHtml(bottle.subtype) + '</span>');
    if (bottle.cellar) meta.push('<span class="badge cellar-badge">untasted</span>');
    if (bottle.photo) meta.push('<span class="badge photo-badge">picture</span>');
    if (bottle.yearDrank && !bottle.cellar) meta.push('<span>Drank ' + escapeHtml(bottle.yearDrank) + '</span>');
    if (bottle.yearBought) meta.push('<span>Bought ' + escapeHtml(bottle.yearBought) + '</span>');
    if (bottle.price !== null) meta.push('<span>$' + escapeHtml(bottle.price) + (bottle.priceYear ? ' · ' + escapeHtml(bottle.priceYear) : '') + '</span>');
    var metaHtml = meta.map(function (part, index) {
      return (index ? '<span class="sep"></span>' : '') + part;
    }).join('');
    var ratingHtml = bottle.cellar || bottle.rating === null
      ? '<div class="rating-num unrated">In&nbsp;cellar</div>'
      : '<div class="rating-num">' + escapeHtml(displayRating(bottle.rating)) + '</div><div class="rating-out">out of 5</div>';
    var rankLabel = rank ? '№ ' + String(rank).padStart(2, '0') : (bottle.cellar ? '—' : '');
    return '<article class="card ' + (bottle.cellar ? 'cellar' : 'tasted') + '" data-id="' + escapeHtml(bottle.id) + '" tabindex="0">' +
      '<div class="card-rank">' + escapeHtml(rankLabel) + '</div>' +
      '<div class="card-main"><h3 class="card-title">' + escapeHtml(bottle.name) + '</h3>' +
      '<div class="card-sub">' + metaHtml + '</div>' +
      (bottle.notes ? '<p class="card-notes">' + escapeHtml(bottle.notes) + '</p>' : '') + '</div>' +
      '<div class="card-rating">' + ratingHtml + '</div></article>';
  }

  function renderList() {
    populateTypeFilter();
    var list = byId('list');
    if (!list) return;
    var bottles = sortBottles(filteredBottles());
    if (!bottles.length) {
      list.innerHTML = '<div class="empty"><svg class="em-icon" viewBox="0 0 32 32"><use href="#bottle-icon"></use></svg>' +
        '<div>No bottles yet in <strong>' + CATEGORY_LABELS[state.category] + '</strong>.</div>' +
        '<div style="margin-top:6px;font-size:13px;">Tap + to add one.</div></div>';
      return;
    }
    var ranks = computeRanks();
    if (state.sortBy !== 'rating-desc' && state.sortBy !== 'rating-asc') {
      list.innerHTML = bottles.map(function (bottle) { return cardHtml(bottle, ranks[bottle.id]); }).join('');
      return;
    }
    var groups = {};
    bottles.forEach(function (bottle) {
      var key = bottle.cellar ? '__cellar__' : styleLabel(bottle);
      if (!groups[key]) groups[key] = [];
      groups[key].push(bottle);
    });
    list.innerHTML = orderedGroupNames(groups).map(function (name) {
      var label = name === '__cellar__' ? 'In Cellar (untasted)' : name;
      return '<div class="group-header">' + escapeHtml(label) + '</div>' +
        groups[name].map(function (bottle) { return cardHtml(bottle, ranks[bottle.id]); }).join('');
    }).join('');
  }

  function updateCount() {
    var count = byId('statCount');
    if (count) count.textContent = String(state.bottles.length);
  }

  function populateTypeSelect(select, category, current) {
    if (!select) return;
    select.innerHTML = TYPES[category].map(function (type) {
      return '<option value="' + escapeHtml(type) + '">' + escapeHtml(type) + '</option>';
    }).join('');
    select.value = current || TYPES[category][0];
  }

  function updateWineStyleField(category, type, current) {
    var field = document.querySelector('.wine-subtype-field');
    var select = document.querySelector('select[name="subtype"]');
    if (!field || !select) return;
    if (category !== 'wine') {
      field.classList.add('hidden');
      select.innerHTML = '';
      return;
    }
    var styles = WINE_STYLES[type] || [];
    field.classList.remove('hidden');
    select.innerHTML = '<option value="">Select style</option>' + styles.map(function (style) {
      return '<option value="' + escapeHtml(style) + '">' + escapeHtml(style) + '</option>';
    }).join('');
    if (current && styles.indexOf(current) < 0) {
      select.innerHTML += '<option value="' + escapeHtml(current) + '">' + escapeHtml(current) + '</option>';
    }
    select.value = current || '';
  }

  function updateStars(value) {
    var element = document.querySelector('[data-stars]');
    if (!element) return;
    if (value === '') { element.textContent = '☆☆☆☆☆'; return; }
    var rating = Math.max(0, Math.min(5, Number(value) || 0));
    var rounded = Math.round(rating);
    var stars = '';
    for (var index = 0; index < 5; index += 1) stars += index < rounded ? '★' : '☆';
    element.textContent = stars;
  }

  function setPhotoPreview(dataUrl) {
    var form = byId('entryForm');
    var preview = byId('photoPreview');
    var remove = byId('removePhotoBtn');
    var pick = document.querySelector('.photo-pick');
    if (form && form.elements.photo) form.elements.photo.value = dataUrl || '';
    if (!preview) return;
    var image = preview.querySelector('img');
    if (dataUrl) {
      if (image) image.src = dataUrl;
      preview.classList.remove('hidden');
      if (remove) remove.classList.remove('hidden');
      if (pick) pick.textContent = 'Change picture';
    } else {
      if (image) image.removeAttribute('src');
      preview.classList.add('hidden');
      if (remove) remove.classList.add('hidden');
      if (pick) pick.textContent = 'Add picture';
    }
  }

  function openEntry(id) {
    var form = byId('entryForm');
    if (!form) return;
    form.reset();
    var bottle = id ? state.bottles.find(function (item) { return item.id === id; }) : null;
    var category = bottle ? bottle.category : state.category;
    form.elements.id.value = bottle ? bottle.id : '';
    form.elements.category.value = category;
    populateTypeSelect(form.elements.type, category, bottle ? bottle.type : '');
    updateWineStyleField(category, form.elements.type.value, bottle ? bottle.subtype : '');
    if (bottle) {
      form.elements.name.value = bottle.name;
      form.elements.cellar.checked = bottle.cellar;
      form.elements.rating.value = bottle.rating === null ? '' : bottle.rating;
      form.elements.notes.value = bottle.notes;
      form.elements.price.value = bottle.price === null ? '' : bottle.price;
      form.elements.priceYear.value = bottle.priceYear === null ? '' : bottle.priceYear;
      form.elements.yearBought.value = bottle.yearBought === null ? '' : bottle.yearBought;
      form.elements.yearDrank.value = bottle.yearDrank === null ? '' : bottle.yearDrank;
      setPhotoPreview(bottle.photo);
    } else {
      setPhotoPreview('');
    }
    var title = byId('entryTitle');
    if (title) title.textContent = bottle ? 'Edit Bottle' : 'New ' + CATEGORY_LABELS[category];
    var deleteButton = byId('deleteBtn');
    if (deleteButton) deleteButton.classList.toggle('hidden', !bottle);
    setCellarFormState(!!(bottle && bottle.cellar));
    updateStars(form.elements.rating.value);
    openModal('entryModal');
  }

  function setCellarFormState(isCellar) {
    var ratingField = document.querySelector('.rating-field');
    var rating = document.querySelector('input[name="rating"]');
    var year = document.querySelector('input[name="yearDrank"]');
    if (ratingField) ratingField.style.opacity = isCellar ? '0.5' : '1';
    if (isCellar) {
      if (rating) rating.value = '';
      if (year) year.value = '';
      updateStars('');
    }
  }

  function saveEntry(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var rating = numberOrNull(formValue(form, 'rating'));
    if (rating !== null && (rating < 0 || rating > 5)) {
      toast('Rating must be between 0 and 5');
      return;
    }
    if (rating !== null) rating = Math.round(rating * 100) / 100;
    var id = formValue(form, 'id');
    var category = formValue(form, 'category') || state.category;
    var existing = id ? state.bottles.find(function (item) { return item.id === id; }) : null;
    var cellar = !!(form.elements.cellar && form.elements.cellar.checked);
    var bottle = normalizeBottle({
      id: id || uid(),
      category: category,
      type: formValue(form, 'type'),
      subtype: category === 'wine' ? formValue(form, 'subtype') : '',
      name: formValue(form, 'name').trim(),
      cellar: cellar,
      rating: cellar ? null : rating,
      notes: formValue(form, 'notes').trim(),
      photo: formValue(form, 'photo'),
      price: numberOrNull(formValue(form, 'price')),
      priceYear: numberOrNull(formValue(form, 'priceYear')),
      yearBought: numberOrNull(formValue(form, 'yearBought')),
      yearDrank: cellar ? null : numberOrNull(formValue(form, 'yearDrank')),
      createdAt: existing ? existing.createdAt : now(),
      updatedAt: now()
    });
    if (!bottle.name) { toast('Enter a bottle name'); return; }
    var next = state.bottles.slice();
    var index = next.findIndex(function (item) { return item.id === bottle.id; });
    if (index >= 0) next[index] = bottle; else next.push(bottle);
    if (!persistBottles(next)) return;
    state.bottles = next;
    closeModal(byId('entryModal'));
    renderList();
    updateCount();
    toast(existing ? 'Updated' : 'Saved');
  }

  function deleteEntry() {
    var form = byId('entryForm');
    var id = form ? formValue(form, 'id') : '';
    if (!id || !confirm('Delete this bottle? This cannot be undone.')) return;
    var next = state.bottles.filter(function (item) { return item.id !== id; });
    if (!persistBottles(next)) return;
    state.bottles = next;
    closeModal(byId('entryModal'));
    renderList();
    updateCount();
    toast('Deleted');
  }

  function processPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type).indexOf('image/') !== 0) { reject(new Error('Choose an image file')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read picture')); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error('Could not open picture')); };
        image.onload = function () {
          var sourceWidth = image.naturalWidth || image.width;
          var sourceHeight = image.naturalHeight || image.height;
          var scale = Math.min(1, 720 / Math.max(sourceWidth, sourceHeight));
          var width = Math.max(1, Math.round(sourceWidth * scale));
          var height = Math.max(1, Math.round(sourceHeight * scale));
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#F9F8F6';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          var result = canvas.toDataURL('image/webp', 0.64);
          if (result.indexOf('data:image/webp') !== 0) result = canvas.toDataURL('image/jpeg', 0.68);
          resolve(result);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function download(blob, name) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  function exportJson() {
    var payload = { app: 'cellar', version: 2, exportedAt: new Date().toISOString(), bottles: state.bottles, notes: loadNotes() };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'cellar-backup-' + dateStamp() + '.json');
    toast('Backup exported');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onerror = function () { toast('Could not read backup'); };
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var incoming = Array.isArray(parsed) ? parsed : parsed.bottles;
        if (!Array.isArray(incoming)) throw new Error('Invalid backup');
        if (!confirm('Import ' + incoming.length + ' bottles? Existing entries with the same ID will be replaced.')) return;
        var byIdMap = {};
        state.bottles.forEach(function (bottle) { byIdMap[bottle.id] = bottle; });
        incoming.map(normalizeBottle).forEach(function (bottle) { byIdMap[bottle.id] = bottle; });
        var next = Object.keys(byIdMap).map(function (id) { return byIdMap[id]; });
        if (!persistBottles(next)) return;
        state.bottles = next;
        if (parsed && typeof parsed.notes === 'string') saveNotes(parsed.notes);
        renderList();
        updateCount();
        toast('Imported ' + incoming.length + ' bottles');
      } catch (error) {
        console.error(error);
        toast('That backup file is not valid');
      }
    };
    reader.readAsText(file);
  }

  function loadExcelLibrary() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-xlsx-loader]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.XLSX); });
        existing.addEventListener('error', reject);
        return;
      }
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.dataset.xlsxLoader = 'true';
      script.onload = function () { resolve(window.XLSX); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function exportExcel() {
    toast('Preparing spreadsheet…');
    loadExcelLibrary().then(function (XLSX) {
      if (!XLSX) throw new Error('Excel library unavailable');
      var workbook = XLSX.utils.book_new();
      ['wine', 'sake', 'liquor'].forEach(function (category) {
        var rows = state.bottles.filter(function (bottle) { return bottle.category === category; }).map(function (bottle) {
          return {
            Name: bottle.name,
            Type: bottle.type,
            'Wine Style': category === 'wine' ? bottle.subtype : '',
            Status: bottle.cellar ? 'In cellar' : 'Tasted',
            Rating: bottle.cellar ? '' : (bottle.rating === null ? '' : bottle.rating),
            'Tasting Note': bottle.notes,
            Picture: bottle.photo ? 'Included in JSON backup' : '',
            Price: bottle.price === null ? '' : bottle.price,
            'Price Year': bottle.priceYear === null ? '' : bottle.priceYear,
            'Year Bought': bottle.yearBought === null ? '' : bottle.yearBought,
            'Year Drank': bottle.yearDrank === null ? '' : bottle.yearDrank
          };
        });
        if (!rows.length) rows.push({ Name: '', Type: '', 'Wine Style': '', Status: '', Rating: '' });
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), CATEGORY_LABELS[category]);
      });
      var notes = loadNotes();
      if (notes) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notes.split('\n').map(function (line) { return { Notes: line }; })), 'Notes');
      var output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      download(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'cellar-' + dateStamp() + '.xlsx');
      toast('Spreadsheet exported');
    }).catch(function (error) {
      console.error(error);
      toast('Excel export needs an internet connection once', 3600);
    });
  }

  function loadNotes() {
    try { return localStorage.getItem(NOTES_KEY) || ''; } catch (error) { return ''; }
  }
  function saveNotes(value) {
    try {
      localStorage.setItem(NOTES_KEY, value || '');
      localStorage.setItem(NOTES_SAVED_AT_KEY, String(now()));
      updateNotesTime();
    } catch (error) { toast('Could not save notes'); }
  }
  function updateNotesTime() {
    var element = byId('notesSavedAt');
    if (!element) return;
    var saved = numberOrNull(localStorage.getItem(NOTES_SAVED_AT_KEY));
    element.textContent = saved ? new Date(saved).toLocaleString() : 'automatically';
  }
  function openNotes() {
    var area = byId('notesArea');
    if (area) area.value = loadNotes();
    updateNotesTime();
    openModal('notesModal');
  }

  function forceUpdate() {
    if (!confirm('Install the latest app version? Your locally stored bottles, pictures and notes will not be removed.')) return;
    var button = byId('updateBtn');
    if (button) { button.disabled = true; button.textContent = 'Updating…'; }
    var work = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      work.push(navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
      }));
    }
    if (window.caches && caches.keys) {
      work.push(caches.keys().then(function (keys) { return Promise.all(keys.map(function (key) { return caches.delete(key); })); }));
    }
    Promise.all(work).then(function () {
      localStorage.setItem(LAST_UPDATED_KEY, String(now()));
      var separator = location.href.indexOf('?') >= 0 ? '&' : '?';
      location.replace(location.href.split('#')[0] + separator + '_v=' + now().toString(36));
    }).catch(function (error) {
      console.error(error);
      toast('Update failed. Check your connection.');
      if (button) { button.disabled = false; button.textContent = 'Update from GitHub'; }
    });
  }

  function handleClick(event) {
    var tab = event.target.closest('.tab');
    if (tab) {
      document.querySelectorAll('.tab').forEach(function (item) { item.classList.remove('active'); });
      tab.classList.add('active');
      state.category = tab.dataset.cat;
      state.typeFilter = '';
      renderList();
      return;
    }
    var close = event.target.closest('[data-close]');
    if (close) { closeModal(close.closest('.modal')); return; }
    var card = event.target.closest('.card');
    if (card) { openEntry(card.dataset.id); return; }
    var button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addBtn') openEntry(null);
    else if (button.id === 'settingsBtn') { updateCount(); openModal('settingsModal'); }
    else if (button.id === 'notesBtn') openNotes();
    else if (button.id === 'deleteBtn') deleteEntry();
    else if (button.id === 'removePhotoBtn') { setPhotoPreview(''); toast('Picture removed'); }
    else if (button.id === 'exportJsonBtn') exportJson();
    else if (button.id === 'exportXlsxBtn') exportExcel();
    else if (button.id === 'updateBtn') forceUpdate();
  }

  function handleChange(event) {
    var target = event.target;
    if (target.id === 'typeFilter') { state.typeFilter = target.value; renderList(); }
    else if (target.id === 'statusFilter') { state.statusFilter = target.value; renderList(); }
    else if (target.id === 'sortBy') { state.sortBy = target.value; renderList(); }
    else if (target.name === 'type') {
      var form = byId('entryForm');
      if (form) updateWineStyleField(formValue(form, 'category'), target.value, '');
    } else if (target.name === 'cellar') setCellarFormState(target.checked);
    else if (target.id === 'importInput') {
      if (target.files && target.files[0]) importJson(target.files[0]);
      target.value = '';
    } else if (target.id === 'photoInput' && target.files && target.files[0]) {
      var submit = document.querySelector('#entryForm button[type="submit"]');
      if (submit) submit.disabled = true;
      toast('Optimizing picture…');
      processPhoto(target.files[0]).then(function (dataUrl) {
        setPhotoPreview(dataUrl);
        toast('Picture added');
      }).catch(function (error) {
        console.error(error);
        toast(error.message || 'Could not add picture');
      }).then(function () {
        if (submit) submit.disabled = false;
        target.value = '';
      });
    }
  }

  function handleInput(event) {
    var target = event.target;
    if (target.id === 'searchInput') { state.search = target.value; renderList(); }
    else if (target.name === 'rating') updateStars(target.value);
    else if (target.id === 'notesArea') {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(function () { saveNotes(target.value); }, 400);
    }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (registration) {
        registration.update().catch(function () {});
      }).catch(function (error) { console.warn('Service worker unavailable', error); });
    });
  }

  function init() {
    state.bottles = loadBottles();
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleChange);
    document.addEventListener('input', handleInput);
    document.addEventListener('submit', function (event) {
      if (event.target && event.target.id === 'entryForm') saveEntry(event);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach(closeModal);
      if ((event.key === 'Enter' || event.key === ' ') && event.target.classList && event.target.classList.contains('card')) {
        event.preventDefault(); openEntry(event.target.dataset.id);
      }
    });
    document.addEventListener('focusout', function (event) {
      if (event.target && event.target.id === 'notesArea') saveNotes(event.target.value);
    });
    var version = byId('appVersion');
    if (version) version.textContent = APP_VERSION;
    var refreshed = byId('lastUpdated');
    var refreshedAt = numberOrNull(localStorage.getItem(LAST_UPDATED_KEY));
    if (refreshed) refreshed.textContent = refreshedAt ? new Date(refreshedAt).toLocaleString() : 'Never';
    populateTypeFilter();
    renderList();
    updateCount();
    registerServiceWorker();
  }

  window.addEventListener('error', function (event) {
    console.error('Cellar error', event.error || event.message);
    toast('Cellar hit an error. Refresh or use Update from GitHub.', 4200);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
