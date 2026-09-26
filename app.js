/* Cellar 2.0 — local-first wine, sake and liquor journal */
(function () {
  'use strict';

  var APP_VERSION = '2.5.0';
  var STORAGE_KEY = 'cellar.bottles.v1';
  var NOTES_KEY = 'cellar.notes.v1';
  var NOTES_SAVED_AT_KEY = 'cellar.notes.savedAt.v1';
  var LAST_UPDATED_KEY = 'cellar.lastUpdated.v1';
  var PHOTO_DB = 'cellar.photos.v1';
  var PHOTO_STORE = 'photos';

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
    bottles: [],
    draftPhoto: '',
    photoRemoved: false,
    batch: []
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
      cellar: !source.wantToTry && !!source.cellar,
      wantToTry: !!source.wantToTry,
      rating: numberOrNull(source.rating),
      notes: source.notes || '',
      photo: typeof source.photo === 'string' ? source.photo : '',
      photoId: source.photoId || (source.photo ? source.id : ''),
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
    // The photo viewer stacks on top of the entry sheet — only restore
    // page scrolling once no modal is left open.
    if (!document.querySelector('.modal:not(.hidden)')) document.body.style.overflow = '';
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
      if (state.statusFilter === 'drank' && (bottle.cellar || bottle.wantToTry)) return false;
      if (state.statusFilter === 'cellar' && !bottle.cellar) return false;
      if (state.statusFilter === 'wantToTry' && !bottle.wantToTry) return false;
      if (!query) return true;
      return String(bottle.name || '').toLowerCase().indexOf(query) >= 0 ||
        String(bottle.notes || '').toLowerCase().indexOf(query) >= 0 ||
        String(bottle.type || '').toLowerCase().indexOf(query) >= 0 ||
        String(bottle.subtype || '').toLowerCase().indexOf(query) >= 0;
    });
  }

  function ratingValue(bottle) {
    if (bottle.cellar || bottle.wantToTry || bottle.rating === null) return -1;
    return Number(bottle.rating);
  }

  function sortBottles(bottles) {
    return bottles.slice().sort(function (a, b) {
      var wantedOrder = Number(!!a.wantToTry) - Number(!!b.wantToTry);
      if (wantedOrder) return wantedOrder;
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
      if (bottle.category !== state.category || bottle.cellar || bottle.wantToTry || bottle.rating === null) return;
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
    if (bottle.yearDrank && !bottle.cellar && !bottle.wantToTry) meta.push('<span>Drank ' + escapeHtml(bottle.yearDrank) + '</span>');
    if (bottle.yearBought) meta.push('<span>Bought ' + escapeHtml(bottle.yearBought) + '</span>');
    if (bottle.price !== null) meta.push('<span>$' + escapeHtml(bottle.price) + (bottle.priceYear ? ' · ' + escapeHtml(bottle.priceYear) : '') + '</span>');
    var metaHtml = meta.map(function (part, index) {
      return (index ? '<span class="sep"></span>' : '') + part;
    }).join('');
    var ratingHtml = bottle.wantToTry
      ? '<div class="rating-num unrated">Want to<br>try</div>'
      : bottle.cellar || bottle.rating === null
      ? '<div class="rating-num unrated">In&nbsp;cellar</div>'
      : '<div class="rating-num">' + escapeHtml(displayRating(bottle.rating)) + '</div><div class="rating-out">out of 5</div>';
    var rankLabel = rank ? '№ ' + String(rank).padStart(2, '0') : (bottle.cellar ? '—' : '');
    var hasThumb = !!(bottle.photoId || bottle.photo);
    var thumbHtml = '';
    if (hasThumb) {
      // Legacy bottles may still carry the picture inline; newer ones load lazily from IndexedDB.
      thumbHtml = bottle.photo
        ? '<div class="card-thumb"><img alt="" src="' + escapeHtml(bottle.photo) + '" /></div>'
        : '<div class="card-thumb" data-photo-id="' + escapeHtml(bottle.photoId) + '"></div>';
    }
    return '<article class="card ' + (bottle.cellar ? 'cellar' : 'tasted') + (hasThumb ? ' has-thumb' : '') + '" data-id="' + escapeHtml(bottle.id) + '" tabindex="0">' +
      '<div class="card-rank">' + escapeHtml(rankLabel) + '</div>' +
      thumbHtml +
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
      hydrateCardThumbs();
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
    hydrateCardThumbs();
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

  function parseBatchText(text) {
    var source = String(text || '').trim();
    if (!source) return [];
    var entries = [];
    var marker = /(?:^|\n)\s*[-*]\s*\[([ xX])\]\s*/g;
    var matches = [];
    var match;
    while ((match = marker.exec(source))) matches.push({ start: match.index, end: marker.lastIndex, checked: match[1].toLowerCase() === 'x' });
    if (matches.length) {
      matches.forEach(function (item, index) {
        var end = index + 1 < matches.length ? matches[index + 1].start : source.length;
        entries.push({ raw: source.slice(item.end, end).trim(), cellar: item.checked });
      });
    } else {
      source.split(/\n\s*\n/).forEach(function (block) {
        if (block.trim()) entries.push({ raw: block.trim(), cellar: false });
      });
    }
    return entries.map(function (entry) {
      var raw = entry.raw.replace(/^[“"]|[”"]$/g, '').trim();
      var price = null;
      var rating = null;
      var priceRating = /\$\s*([\d,]+(?:\.\d+)?)\s*[–—-]\s*(\d(?:\.\d+)?)\s*\/\s*5/;
      var priceMatch = raw.match(priceRating);
      if (priceMatch) {
        price = Number(priceMatch[1].replace(/,/g, ''));
        rating = Number(priceMatch[2]);
        raw = raw.replace(priceMatch[0], ' ');
      }
      var trailingNotes = '';
      var trailingNoteMatch = raw.match(/\(([^()]*)\)\s*$/);
      if (trailingNoteMatch) {
        trailingNotes = trailingNoteMatch[1].trim();
        raw = raw.slice(0, trailingNoteMatch.index).trim();
      }
      raw = raw.replace(/\s+/g, ' ').trim();
      var period = raw.indexOf('.');
      var name = (period >= 0 ? raw.slice(0, period + 1) : raw).trim();
      var notes = (period >= 0 ? raw.slice(period + 1).trim() : '');
      if (trailingNotes) notes = [notes, trailingNotes].filter(Boolean).join(' · ');
      var style = '';
      var wineType = 'Red';
      Object.keys(WINE_STYLES).some(function (type) {
        return WINE_STYLES[type].some(function (candidate) {
          if (candidate !== 'Other' && name.toLowerCase().indexOf(candidate.toLowerCase()) === 0) {
            style = candidate;
            wineType = type;
            return true;
          }
          return false;
        });
      });
      return {
        category: 'wine',
        type: wineType,
        subtype: style,
        name: name,
        notes: notes,
        price: price,
        rating: rating,
        cellar: entry.cellar && rating === null,
        wantToTry: false,
        reviewed: false
      };
    }).filter(function (entry) { return entry.name; });
  }

  function batchReviewed() {
    return state.batch.length > 0 && state.batch.every(function (entry) {
      var rating = numberOrNull(entry.rating);
      var price = numberOrNull(entry.price);
      return entry.reviewed && entry.name.trim() && TYPES.wine.indexOf(entry.type) >= 0 &&
        (rating === null || (rating >= 0 && rating <= 5)) &&
        (price === null || price >= 0);
    });
  }

  function renderBatchReview() {
    var list = byId('batchReviewList');
    if (!list) return;
    list.innerHTML = state.batch.map(function (entry, index) {
      return '<article class="batch-review-card' + (entry.reviewed ? ' is-reviewed' : '') + '">' +
        '<div class="batch-card-heading"><strong>Bottle ' + (index + 1) + '</strong><button type="button" class="btn-ghost batch-review-toggle" data-batch-review="' + index + '">' + (entry.reviewed ? 'Reviewed ✓' : 'Mark reviewed') + '</button></div>' +
        '<label class="batch-field">Name<input data-batch-index="' + index + '" data-batch-field="name" value="' + escapeHtml(entry.name) + '"></label>' +
        '<div class="batch-field-row"><label class="batch-field">Type<select data-batch-index="' + index + '" data-batch-field="type">' + TYPES.wine.map(function (type) { return '<option' + (type === entry.type ? ' selected' : '') + '>' + escapeHtml(type) + '</option>'; }).join('') + '</select></label>' +
        '<label class="batch-field">Style<input data-batch-index="' + index + '" data-batch-field="subtype" value="' + escapeHtml(entry.subtype) + '" placeholder="e.g. Pinot Noir"></label></div>' +
        '<div class="batch-field-row"><label class="batch-field">Price<input data-batch-index="' + index + '" data-batch-field="price" type="number" min="0" step="0.01" value="' + (entry.price === null ? '' : escapeHtml(entry.price)) + '" placeholder="—"></label>' +
        '<label class="batch-field">Rating<input data-batch-index="' + index + '" data-batch-field="rating" type="number" min="0" max="5" step="0.01" value="' + (entry.rating === null ? '' : escapeHtml(entry.rating)) + '" placeholder="—"></label></div>' +
        '<label class="batch-field batch-cellar"><input type="checkbox" data-batch-index="' + index + '" data-batch-field="cellar"' + (entry.cellar ? ' checked' : '') + '> In cellar (untasted)</label>' +
        '<label class="batch-field">Notes<textarea data-batch-index="' + index + '" data-batch-field="notes" rows="3">' + escapeHtml(entry.notes) + '</textarea></label>' +
        '</article>';
    }).join('');
    var status = byId('batchStatus');
    if (status) {
      var reviewedCount = state.batch.filter(function (entry) { return entry.reviewed; }).length;
      status.textContent = state.batch.length ? reviewedCount + ' of ' + state.batch.length + ' entries reviewed.' +
        (reviewedCount === state.batch.length && !batchReviewed() ? ' Correct any invalid price or rating to continue.' : '') : '';
    }
    var save = byId('saveBatchBtn');
    if (save) save.disabled = !batchReviewed();
  }

  function updateBatchField(target) {
    if (!target || !target.hasAttribute('data-batch-index')) return false;
    var index = Number(target.getAttribute('data-batch-index'));
    var field = target.getAttribute('data-batch-field');
    var entry = state.batch[index];
    if (!entry || !field) return false;
    entry[field] = field === 'cellar' ? target.checked : target.value;
    if (field === 'cellar' && target.checked) {
      entry.rating = null;
      var ratingInput = document.querySelector('[data-batch-index="' + index + '"][data-batch-field="rating"]');
      if (ratingInput) ratingInput.value = '';
    }
    if (entry.reviewed) {
      entry.reviewed = false;
      var card = target.closest('.batch-review-card');
      if (card) {
        card.classList.remove('is-reviewed');
        var reviewButton = card.querySelector('.batch-review-toggle');
        if (reviewButton) reviewButton.textContent = 'Mark reviewed';
      }
    }
    var save = byId('saveBatchBtn');
    if (save) save.disabled = !batchReviewed();
    var status = byId('batchStatus');
    if (status && state.batch.length) {
      var reviewedCount = state.batch.filter(function (item) { return item.reviewed; }).length;
      status.textContent = reviewedCount + ' of ' + state.batch.length + ' entries reviewed.' +
        (reviewedCount === state.batch.length && !batchReviewed() ? ' Correct any invalid price or rating to continue.' : '');
    }
    return true;
  }

  function saveBatch() {
    if (!batchReviewed()) { toast('Review every entry before adding bottles'); return; }
    var additions = state.batch.map(function (entry) {
      return normalizeBottle({
        category: 'wine',
        type: entry.type,
        subtype: entry.subtype,
        name: entry.name.trim(),
        notes: entry.notes.trim(),
        price: numberOrNull(entry.price),
        rating: entry.cellar ? null : numberOrNull(entry.rating),
        cellar: entry.cellar,
        wantToTry: false,
        createdAt: now(),
        updatedAt: now()
      });
    });
    var next = state.bottles.concat(additions);
    if (!persistBottles(next)) return;
    state.bottles = next;
    state.category = 'wine';
    document.querySelectorAll('.tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.cat === 'wine'); });
    state.batch = [];
    var input = byId('batchInput');
    if (input) input.value = '';
    renderBatchReview();
    renderList();
    updateCount();
    toast(additions.length + ' bottles added');
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

  function openPhotoDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Photo storage is not available')); return; }
      var request = indexedDB.open(PHOTO_DB, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(new Error('Could not open photo storage')); };
    });
  }

  function photoDbAction(mode, action) {
    return openPhotoDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, mode);
        var store = tx.objectStore(PHOTO_STORE);
        var request;
        try { request = action(store); } catch (error) { db.close(); reject(error); return; }
        tx.oncomplete = function () { db.close(); resolve(request ? request.result : undefined); };
        tx.onerror = function () { db.close(); reject(new Error('Could not use photo storage')); };
        tx.onabort = tx.onerror;
      });
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    var meta = parts[0] || '';
    var binary = atob(parts[1] || '');
    var mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Could not read saved picture')); };
      reader.readAsDataURL(blob);
    });
  }

  function savePhoto(photoId, dataUrl) {
    if (!photoId || !dataUrl) return Promise.resolve('');
    return photoDbAction('readwrite', function (store) { return store.put(dataUrlToBlob(dataUrl), photoId); }).then(function () { return photoId; });
  }

  function loadPhoto(photoId) {
    if (!photoId) return Promise.resolve('');
    return photoDbAction('readonly', function (store) { return store.get(photoId); }).then(function (blob) {
      return blob ? blobToDataUrl(blob) : '';
    });
  }

  function deletePhoto(photoId) {
    if (!photoId) return Promise.resolve();
    delete thumbCache[photoId];
    return photoDbAction('readwrite', function (store) { return store.delete(photoId); }).catch(function () {});
  }

  // List thumbnails: filled in asynchronously from IndexedDB after each render,
  // and kept in memory so re-renders (search, filter, sort) stay instant.
  // Rendering never waits on a photo — the app stays quick to open.
  var thumbCache = {};

  function hydrateThumb(element) {
    if (element.dataset.hydrated) return;
    element.dataset.hydrated = '1';
    var photoId = element.getAttribute('data-photo-id');
    if (!photoId) return;
    var apply = function (dataUrl) {
      if (!dataUrl || !element.isConnected) return;
      thumbCache[photoId] = dataUrl;
      var image = document.createElement('img');
      image.alt = '';
      image.src = dataUrl;
      element.appendChild(image);
    };
    if (thumbCache[photoId]) { apply(thumbCache[photoId]); return; }
    loadPhoto(photoId).then(apply).catch(function () {});
  }

  function hydrateCardThumbs() {
    document.querySelectorAll('.card-thumb[data-photo-id]').forEach(hydrateThumb);
  }

  function openPhotoViewer(src) {
    if (!src) return;
    var modal = byId('photoViewerModal');
    if (!modal) return;
    var image = modal.querySelector('img');
    if (image) image.src = src;
    openModal('photoViewerModal');
  }

  function setPhotoPreview(dataUrl) {
    var preview = byId('photoPreview');
    var remove = byId('removePhotoBtn');
    // Keep photo data out of forms and out of localStorage bottle records.
    // It is saved separately in IndexedDB when the user taps Save.
    state.draftPhoto = dataUrl || '';
    if (dataUrl) state.photoRemoved = false;
    if (!preview) return;
    var image = preview.querySelector('img');
    if (dataUrl) {
      if (image) image.src = dataUrl;
      preview.classList.remove('hidden');
      if (remove) remove.classList.remove('hidden');
    } else {
      if (image) image.removeAttribute('src');
      preview.classList.add('hidden');
      if (remove) remove.classList.add('hidden');
    }
  }

  function openEntry(id) {
    var form = byId('entryForm');
    if (!form) return;
    form.reset();
    state.draftPhoto = '';
    state.photoRemoved = false;
    var bottle = id ? state.bottles.find(function (item) { return item.id === id; }) : null;
    var category = bottle ? bottle.category : state.category;
    form.elements.id.value = bottle ? bottle.id : '';
    form.elements.category.value = category;
    populateTypeSelect(form.elements.type, category, bottle ? bottle.type : '');
    updateWineStyleField(category, form.elements.type.value, bottle ? bottle.subtype : '');
    if (bottle) {
      form.elements.name.value = bottle.name;
      form.elements.cellar.checked = bottle.cellar;
      form.elements.wantToTry.checked = bottle.wantToTry;
      form.elements.rating.value = bottle.rating === null ? '' : bottle.rating;
      form.elements.notes.value = bottle.notes;
      form.elements.price.value = bottle.price === null ? '' : bottle.price;
      form.elements.priceYear.value = bottle.priceYear === null ? '' : bottle.priceYear;
      form.elements.yearBought.value = bottle.yearBought === null ? '' : bottle.yearBought;
      form.elements.yearDrank.value = bottle.yearDrank === null ? '' : bottle.yearDrank;
      setPhotoPreview(bottle.photo || '');
      if (!bottle.photo && bottle.photoId) {
        loadPhoto(bottle.photoId).then(function (dataUrl) {
          if (form.elements.id.value === bottle.id && dataUrl) setPhotoPreview(dataUrl);
        }).catch(function () { toast('Could not load saved picture'); });
      }
    } else {
      setPhotoPreview('');
    }
    var title = byId('entryTitle');
    if (title) title.textContent = bottle ? 'Edit Bottle' : 'New ' + CATEGORY_LABELS[category];
    var deleteButton = byId('deleteBtn');
    if (deleteButton) deleteButton.classList.toggle('hidden', !bottle);
    setCellarFormState(!!(bottle && (bottle.cellar || bottle.wantToTry)));
    updateStars(form.elements.rating.value);
    openModal('entryModal');
  }

  function setCellarFormState(isCellar) {
    var ratingField = document.querySelector('.rating-field');
    var rating = document.querySelector('input[name="rating"]');
    var year = document.querySelector('input[name="yearDrank"]');
    if (ratingField) ratingField.style.opacity = isCellar ? '0.5' : '1';
    if (rating) rating.disabled = isCellar;
    if (year) year.disabled = isCellar;
    if (isCellar) {
      if (rating) rating.value = '';
      if (year) year.value = '';
      updateStars('');
    }
  }

  function saveEntry(event) {
    event.preventDefault();
    var form = event.target;
    var rating = numberOrNull(formValue(form, 'rating'));
    if (rating !== null && (rating < 0 || rating > 5)) {
      toast('Rating must be between 0 and 5');
      return;
    }
    if (rating !== null) rating = Math.round(rating * 100) / 100;
    var id = formValue(form, 'id');
    var category = formValue(form, 'category') || state.category;
    var existing = id ? state.bottles.find(function (item) { return item.id === id; }) : null;
    var wantToTry = !!(form.elements.wantToTry && form.elements.wantToTry.checked);
    var cellar = !wantToTry && !!(form.elements.cellar && form.elements.cellar.checked);
    var bottle = normalizeBottle({
      id: id || uid(),
      category: category,
      type: formValue(form, 'type'),
      subtype: category === 'wine' ? formValue(form, 'subtype') : '',
      name: formValue(form, 'name').trim(),
      cellar: cellar,
      wantToTry: wantToTry,
      rating: cellar || wantToTry ? null : rating,
      notes: formValue(form, 'notes').trim(),
      photo: '',
      photoId: state.draftPhoto ? (id || '') : (state.photoRemoved ? '' : (existing ? existing.photoId : '')),
      price: numberOrNull(formValue(form, 'price')),
      priceYear: numberOrNull(formValue(form, 'priceYear')),
      yearBought: numberOrNull(formValue(form, 'yearBought')),
      yearDrank: cellar || wantToTry ? null : numberOrNull(formValue(form, 'yearDrank')),
      createdAt: existing ? existing.createdAt : now(),
      updatedAt: now()
    });
    if (state.draftPhoto) bottle.photoId = bottle.id;
    if (!bottle.name) { toast('Enter a bottle name'); return; }
    var next = state.bottles.slice();
    var index = next.findIndex(function (item) { return item.id === bottle.id; });
    if (index >= 0) next[index] = bottle; else next.push(bottle);
    var oldPhotoId = existing ? existing.photoId : '';
    if (state.photoRemoved && oldPhotoId) deletePhoto(oldPhotoId);
    var photoWork = state.draftPhoto ? savePhoto(bottle.id, state.draftPhoto) : Promise.resolve('');
    photoWork.then(function () {
      if (oldPhotoId && oldPhotoId !== bottle.photoId) deletePhoto(oldPhotoId);
      if (!persistBottles(next)) return;
      if (state.draftPhoto && bottle.photoId) thumbCache[bottle.photoId] = state.draftPhoto;
      state.bottles = next;
      state.draftPhoto = '';
      state.photoRemoved = false;
      closeModal(byId('entryModal'));
      renderList();
      updateCount();
      toast(existing ? 'Updated' : 'Saved');
    }).catch(function (error) {
      console.error(error);
      toast('Picture could not be saved. Try a screenshot or remove the picture.', 4200);
    });
  }

  function deleteEntry() {
    var form = byId('entryForm');
    var id = form ? formValue(form, 'id') : '';
    if (!id || !confirm('Delete this bottle? This cannot be undone.')) return;
    var bottle = state.bottles.find(function (item) { return item.id === id; });
    var next = state.bottles.filter(function (item) { return item.id !== id; });
    if (!persistBottles(next)) return;
    if (bottle && bottle.photoId) deletePhoto(bottle.photoId);
    state.bottles = next;
    closeModal(byId('entryModal'));
    renderList();
    updateCount();
    toast('Deleted');
  }

  function processPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type).indexOf('image/') !== 0) { reject(new Error('Choose an image file')); return; }

      // iPhone camera files can be very large, and localStorage is small.
      // Always make a compact JPEG thumbnail so saving is reliable offline.
      var MAX_EDGE = 560;
      var TARGET_BYTES = 150 * 1024;
      var MIN_EDGE = 260;
      var objectUrl = '';

      function cleanup() {
        if (objectUrl && window.URL && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
      }

      function drawToDataUrl(image) {
        var sourceWidth = image.naturalWidth || image.width || 1;
        var sourceHeight = image.naturalHeight || image.height || 1;
        var edge = MAX_EDGE;
        var quality = 0.72;
        var result = '';

        while (edge >= MIN_EDGE) {
          var scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
          var width = Math.max(1, Math.round(sourceWidth * scale));
          var height = Math.max(1, Math.round(sourceHeight * scale));
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          var context = canvas.getContext('2d');
          if (!context) throw new Error('Could not prepare picture');
          context.fillStyle = '#F9F8F6';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          quality = edge === MAX_EDGE ? 0.72 : 0.64;
          while (quality >= 0.46) {
            result = canvas.toDataURL('image/jpeg', quality);
            if (result && result.indexOf('data:image/jpeg') === 0 && result.length <= TARGET_BYTES * 1.37) return result;
            quality -= 0.08;
          }
          edge -= 100;
        }

        if (result && result.indexOf('data:image/jpeg') === 0) return result;
        throw new Error('Could not optimize picture');
      }

      var image = new Image();
      image.onload = function () {
        try {
          var dataUrl = drawToDataUrl(image);
          cleanup();
          resolve(dataUrl);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      image.onerror = function () {
        cleanup();
        reject(new Error('Could not open picture. Try a screenshot or another photo.'));
      };

      try {
        if (window.URL && URL.createObjectURL) {
          objectUrl = URL.createObjectURL(file);
          image.src = objectUrl;
        } else {
          var reader = new FileReader();
          reader.onerror = function () { reject(new Error('Could not read picture')); };
          reader.onload = function () { image.src = reader.result; };
          reader.readAsDataURL(file);
        }
      } catch (error) {
        cleanup();
        reject(new Error('Could not read picture'));
      }
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
    // Pictures ship in their own package (Export Pictures) so this core
    // backup stays small enough to email or AirDrop without trouble.
    var bottles = state.bottles.map(function (bottle) {
      var copy = Object.assign({}, bottle);
      if (copy.photo) { copy.photoId = copy.photoId || copy.id; copy.photo = ''; }
      return copy;
    });
    var payload = { app: 'cellar', version: 4, exportedAt: new Date().toISOString(), photos: 'separate', bottles: bottles, notes: loadNotes() };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'cellar-backup-' + dateStamp() + '.json');
    var hasPhotos = state.bottles.some(function (bottle) { return bottle.photoId || bottle.photo; });
    toast(hasPhotos ? 'Backup exported. Use Export Pictures for photos.' : 'Backup exported', 3200);
  }

  function exportPhotos() {
    toast('Packing pictures…');
    var jobs = state.bottles.map(function (bottle) {
      // Legacy bottles may still carry the picture inline; everything newer
      // lives in IndexedDB under the bottle's photoId.
      if (bottle.photo) return Promise.resolve({ id: bottle.photoId || bottle.id, dataUrl: bottle.photo });
      if (!bottle.photoId) return Promise.resolve(null);
      return loadPhoto(bottle.photoId).then(function (dataUrl) {
        return dataUrl ? { id: bottle.photoId, dataUrl: dataUrl } : null;
      }).catch(function () { return null; });
    });
    Promise.all(jobs).then(function (items) {
      var photos = {};
      var count = 0;
      items.forEach(function (item) {
        if (item && item.dataUrl && !photos[item.id]) { photos[item.id] = item.dataUrl; count += 1; }
      });
      if (!count) { toast('No pictures to export yet'); return; }
      var payload = { app: 'cellar', kind: 'photos', version: 1, exportedAt: new Date().toISOString(), photos: photos };
      download(new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'cellar-photos-' + dateStamp() + '.json');
      toast(count + (count === 1 ? ' picture' : ' pictures') + ' exported');
    });
  }

  function importPhotos(photos) {
    var ids = Object.keys(photos).filter(function (id) {
      return typeof photos[id] === 'string' && photos[id].indexOf('data:image/') === 0;
    });
    if (!ids.length) { toast('No pictures found in that file'); return; }
    if (!confirm('Import ' + ids.length + (ids.length === 1 ? ' picture' : ' pictures') + '? Existing pictures for the same bottles will be replaced.')) return;
    toast('Restoring pictures…');
    Promise.all(ids.map(function (id) { return savePhoto(id, photos[id]); })).then(function () {
      ids.forEach(function (id) { delete thumbCache[id]; });
      renderList();
      toast('Imported ' + ids.length + (ids.length === 1 ? ' picture' : ' pictures'));
    }).catch(function (error) {
      console.error(error);
      toast('Some pictures could not be saved. Try again with more free space.', 4200);
    });
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onerror = function () { toast('Could not read backup'); };
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        // A pictures package restores photos only; bottle backups are handled below.
        if (parsed && !Array.isArray(parsed) && parsed.kind === 'photos' && parsed.photos && typeof parsed.photos === 'object') {
          importPhotos(parsed.photos);
          return;
        }
        var incoming = Array.isArray(parsed) ? parsed : parsed.bottles;
        if (!Array.isArray(incoming)) throw new Error('Invalid backup');
        if (!confirm('Import ' + incoming.length + ' bottles? Existing entries with the same ID will be replaced.')) return;
        var byIdMap = {};
        state.bottles.forEach(function (bottle) { byIdMap[bottle.id] = bottle; });
        var photoJobs = [];
        incoming.map(normalizeBottle).forEach(function (bottle) {
          if (bottle.photo) {
            bottle.photoId = bottle.id;
            photoJobs.push(savePhoto(bottle.id, bottle.photo));
            bottle.photo = '';
          }
          byIdMap[bottle.id] = bottle;
        });
        Promise.all(photoJobs).then(function () {
          var next = Object.keys(byIdMap).map(function (id) { return byIdMap[id]; });
          if (!persistBottles(next)) return;
          state.bottles = next;
          if (parsed && typeof parsed.notes === 'string') saveNotes(parsed.notes);
          renderList();
          updateCount();
          toast('Imported ' + incoming.length + ' bottles');
        }).catch(function () { toast('Import worked, but some pictures could not be saved'); });
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
            Status: bottle.wantToTry ? 'Want to try' : bottle.cellar ? 'In cellar' : 'Tasted',
            Rating: bottle.cellar || bottle.wantToTry ? '' : (bottle.rating === null ? '' : bottle.rating),
            'Tasting Note': bottle.notes,
            Picture: (bottle.photo || bottle.photoId) ? 'Included in JSON backup' : '',
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
    var preview = event.target.closest('#photoPreview');
    if (preview) {
      var previewImage = preview.querySelector('img');
      if (previewImage && previewImage.src) { openPhotoViewer(previewImage.src); return; }
    }
    var thumb = event.target.closest('.card-thumb');
    if (thumb) {
      var thumbImage = thumb.querySelector('img');
      // Tap the picture to see it full screen; if it has not loaded yet, open the bottle instead.
      if (thumbImage && thumbImage.src) { openPhotoViewer(thumbImage.src); return; }
    }
    var card = event.target.closest('.card');
    if (card) { openEntry(card.dataset.id); return; }
    var button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'addBtn') openEntry(null);
    else if (button.id === 'settingsBtn') { updateCount(); openModal('settingsModal'); }
    else if (button.id === 'notesBtn') openNotes();
    else if (button.id === 'deleteBtn') deleteEntry();
    else if (button.id === 'removePhotoBtn') { state.photoRemoved = true; setPhotoPreview(''); toast('Picture removed'); }
    else if (button.id === 'exportJsonBtn') exportJson();
    else if (button.id === 'exportPhotosBtn') exportPhotos();
    else if (button.id === 'exportXlsxBtn') exportExcel();
    else if (button.id === 'updateBtn') forceUpdate();
    else if (button.id === 'parseBatchBtn') {
      state.batch = parseBatchText(byId('batchInput').value);
      renderBatchReview();
      toast(state.batch.length ? state.batch.length + ' entries ready to review' : 'No entries found');
    } else if (button.id === 'saveBatchBtn') saveBatch();
    else if (button.hasAttribute('data-batch-review')) {
      var batchIndex = Number(button.getAttribute('data-batch-review'));
      if (state.batch[batchIndex]) state.batch[batchIndex].reviewed = !state.batch[batchIndex].reviewed;
      renderBatchReview();
    }
  }

  function handleChange(event) {
    var target = event.target;
    if (updateBatchField(target)) return;
    if (target.id === 'typeFilter') { state.typeFilter = target.value; renderList(); }
    else if (target.id === 'statusFilter') { state.statusFilter = target.value; renderList(); }
    else if (target.id === 'sortBy') { state.sortBy = target.value; renderList(); }
    else if (target.name === 'type') {
      var form = byId('entryForm');
      if (form) updateWineStyleField(formValue(form, 'category'), target.value, '');
    } else if (target.name === 'cellar' || target.name === 'wantToTry') {
      var entryForm = byId('entryForm');
      if (target.checked) entryForm.elements[target.name === 'cellar' ? 'wantToTry' : 'cellar'].checked = false;
      setCellarFormState(entryForm.elements.cellar.checked || entryForm.elements.wantToTry.checked);
    }
    else if (target.id === 'importInput') {
      if (target.files && target.files[0]) importJson(target.files[0]);
      target.value = '';
    } else if ((target.id === 'photoInput' || target.id === 'photoLibraryInput') && target.files && target.files[0]) {
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
    if (updateBatchField(target)) return;
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
    var entryForm = byId('entryForm');
    if (entryForm) entryForm.addEventListener('submit', saveEntry);
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

  // Async failures (IndexedDB, photo work) must never fail silently.
  window.addEventListener('unhandledrejection', function (event) {
    console.error('Cellar promise error', event.reason);
    toast('Cellar hit an error. Refresh or use Update from GitHub.', 4200);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
