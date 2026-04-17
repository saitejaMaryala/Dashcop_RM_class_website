/* ═══════════════════════════════════════════════════════════════
   RIDER COUNT REVIEW TOOL  –  app.js
   ═══════════════════════════════════════════════════════════════ */

// State
let state = {
  split: 'train',
  filter: 'all', // 'all', 'unreviewed', 'reviewed'
  searchQuery: '',
  data: [],      // Raw tracks data
  stats: null,   // Current stats
  focusedCrop: null, // { videoName, trackId, cropPos }
  currentPage: 1,
  pageSize: 20,  // Tracks per page
  polylineMode: 'default', // 'none' | 'default' (video_polylines) | 'sam' (sam500_polylines)
  predFilter: 'all' // 'all', '0', '1', '2', '3'
};

// Elements
const els = {
  splitTabs: document.querySelectorAll('.split-tab'),
  filterBtns: document.querySelectorAll('.filter-btn'),
  predFilterBtns: document.querySelectorAll('.pred-filter-btn'),
  videoSearch: document.getElementById('videoSearch'),
  
  progressText: document.getElementById('progressText'),
  progressFill: document.getElementById('progressFill'),
  classDist: document.getElementById('classDist'),
  
  pageTitle: document.getElementById('pageTitle'),
  statTotalNum: document.getElementById('statTotalNum'),
  statReviewedNum: document.getElementById('statReviewedNum'),
  statPendingNum: document.getElementById('statPendingNum'),
  
  jumpBtn: document.getElementById('jumpBtn'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebar: document.getElementById('sidebar'),
  main: document.getElementById('main'),
  
  trackContainer: document.getElementById('trackContainer'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  emptyState: document.getElementById('emptyState'),
  toast: document.getElementById('toast'),
  
  pagePrev: document.getElementById('pagePrev'),
  pageNext: document.getElementById('pageNext'),
  pageInfo: document.getElementById('pageInfo'),
  pagination: document.getElementById('pagination'),
  
  pagePrevTop: document.getElementById('pagePrevTop'),
  pageNextTop: document.getElementById('pageNextTop'),
  pageInfoTop: document.getElementById('pageInfoTop'),
  paginationTop: document.getElementById('paginationTop'),

  polySegBtns: document.querySelectorAll('.poly-seg-btn'),
};

// ── Initialization ─────────────────────────────────────────────
function init() {
  bindEvents();
  fetchData();
}

// ── Event Listeners ────────────────────────────────────────────
function bindEvents() {
  // Split tabs
  els.splitTabs.forEach(btn => {
    btn.addEventListener('click', (e) => {
      els.splitTabs.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      state.split = target.dataset.split;
      state.currentPage = 1;
      els.pageTitle.textContent = `${state.split.charAt(0).toUpperCase() + state.split.slice(1)} Split`;
      fetchData();
    });
  });

  // Filters
  els.filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      els.filterBtns.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      state.filter = target.dataset.filter;
      state.currentPage = 1;
      render();
    });
  });

  // Predicted Riders Filters
  els.predFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      els.predFilterBtns.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      state.predFilter = target.dataset.pred;
      state.currentPage = 1;
      render();
    });
  });

  // Search
  els.videoSearch.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    state.currentPage = 1;
    render();
  });

  // Jump to next unreviewed
  els.jumpBtn.addEventListener('click', focusNextUnreviewed);

  // Sidebar toggle
  els.sidebarToggle.addEventListener('click', () => {
    els.sidebar.classList.toggle('collapsed');
    els.main.classList.toggle('expanded');
  });

  // Global Keyboard shortcuts
  document.addEventListener('keydown', handleGlobalKeydown);

  // Pagination
  const handlePrevPage = () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      render();
      window.scrollTo(0, 0);
    }
  };
  
  const handleNextPage = () => {
    state.currentPage++;
    render();
    window.scrollTo(0, 0);
  };

  els.pagePrev.addEventListener('click', handlePrevPage);
  els.pageNext.addEventListener('click', handleNextPage);
  els.pagePrevTop.addEventListener('click', handlePrevPage);
  els.pageNextTop.addEventListener('click', handleNextPage);

  // Polylines segmented selector
  els.polySegBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (state.polylineMode === mode) return;
      state.polylineMode = mode;
      els.polySegBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      render();
      const labels = { none: 'No polylines', default: 'Polylines: Default', sam: 'Polylines: SAM' };
      showToast(labels[mode] || mode);
    });
  });
}

// ── Data Fetching ──────────────────────────────────────────────
async function fetchData() {
  showLoading(true);
  try {
    const [tracksRes, statsRes] = await Promise.all([
      fetch(`/api/tracks?split=${state.split}`),
      fetch(`/api/stats?split=${state.split}`)
    ]);

    if (!tracksRes.ok) throw new Error('Failed to fetch tracks');
    if (!statsRes.ok) throw new Error('Failed to fetch stats');

    state.data = await tracksRes.json();
    state.stats = await statsRes.json();
    
    render();
    updateStatsUI();
  } catch (error) {
    console.error(error);
    showToast('Failed to load data', 'error');
  } finally {
    showLoading(false);
  }
}

async function fetchStatsOnly() {
  try {
    const res = await fetch(`/api/stats?split=${state.split}`);
    if (res.ok) {
      state.stats = await res.json();
      updateStatsUI();
    }
  } catch (e) {
    console.error(e);
  }
}

// ── Rendering ──────────────────────────────────────────────────
function render() {
  els.trackContainer.innerHTML = '';
  
  let allVisible = [];

  state.data.forEach(video => {
    // Filter by search query
    if (state.searchQuery && !video.video_name.toLowerCase().includes(state.searchQuery)) {
      return; 
    }

    video.tracks.forEach(track => {
      let isVisible = false;
      const cropKeys = Object.keys(track.crops || {});
      
      if (cropKeys.length === 0) return;

      if (state.filter === 'all') {
        isVisible = true;
      } else {
        const hasFlagged = cropKeys.some(pos => track.crops[pos].flagged);
        const hasUnreviewed = cropKeys.some(pos => !track.crops[pos].reviewed && !track.crops[pos].flagged);
        
        if (state.filter === 'unreviewed' && hasUnreviewed) isVisible = true;
        if (state.filter === 'reviewed' && !hasUnreviewed && !hasFlagged) isVisible = true;
        if (state.filter === 'flagged' && hasFlagged) isVisible = true;
      }

      if (isVisible && state.predFilter !== 'all') {
        const targetPred = parseInt(state.predFilter);
        const hasPred = cropKeys.some(pos => {
          const pClass = track.crops[pos].pred_class;
          // Consider 3 equivalent to >= 3.
          if (targetPred === 3) return pClass >= 3;
          return pClass === targetPred;
        });
        if (!hasPred) isVisible = false;
      }

      if (isVisible) allVisible.push({ videoName: video.video_name, track });
    });
  });

  if (allVisible.length === 0) {
    els.emptyState.classList.remove('hidden');
    els.pagination.classList.add('hidden');
    els.paginationTop.classList.add('hidden');
    return;
  }
  
  els.emptyState.classList.add('hidden');

  // Calculate pagination
  const totalPages = Math.ceil(allVisible.length / state.pageSize);
  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;

  const startIdx = (state.currentPage - 1) * state.pageSize;
  const pageItems = allVisible.slice(startIdx, startIdx + state.pageSize);

  // Render tracks
  pageItems.forEach(item => {
    const trackEl = createTrackCard(item.videoName, item.track);
    els.trackContainer.appendChild(trackEl);
  });

  // Pagination UI logic
  if (totalPages > 1) {
    els.pagination.classList.remove('hidden');
    els.paginationTop.classList.remove('hidden');
    
    const infoText = `Page ${state.currentPage} of ${totalPages} (${allVisible.length} tracks)`;
    els.pageInfo.textContent = infoText;
    els.pageInfoTop.textContent = infoText;
    
    const isFirst = state.currentPage === 1;
    const isLast = state.currentPage === totalPages;
    
    els.pagePrev.disabled = isFirst;
    els.pagePrevTop.disabled = isFirst;
    els.pageNext.disabled = isLast;
    els.pageNextTop.disabled = isLast;
  } else {
    els.pagination.classList.add('hidden');
    els.paginationTop.classList.add('hidden');
  }
}

function createTrackCard(videoName, track) {
  const card = document.createElement('div');
  const allReviewed = Object.values(track.crops).every(c => c.reviewed);
  card.className = `track-card ${allReviewed ? 'all-reviewed' : ''}`;
  card.id = `track-${videoName}-${track.track_id}`;

  // Header
  const header = document.createElement('div');
  header.className = 'track-header';
  header.innerHTML = `
    <div class="track-header-left">
      <span class="track-video">${videoName}</span>
      <span class="track-id">Track #${track.track_id} (${track.length} frames)</span>
    </div>
    <div class="track-header-right">
      <span class="track-badge ${allReviewed ? 'done' : ''}">${allReviewed ? 'Reviewed' : 'Pending'}</span>
      <svg class="track-collapse-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    </div>
  `;
  header.addEventListener('click', () => {
    // Prevent toggling if the user is selecting text
    if (window.getSelection().toString().length > 0) return;
    card.classList.toggle('collapsed');
  });

  // Crops container
  const cropsWrap = document.createElement('div');
  cropsWrap.className = 'track-crops';

  // Sort crops: first, middle, last
  const posOrder = { first: 1, middle: 2, last: 3 };
  const cropKeys = Object.keys(track.crops).sort((a, b) => posOrder[a] - posOrder[b]);

  cropKeys.forEach(pos => {
    const cropData = track.crops[pos];
    
    // Filter by predicted riders if active
    if (state.predFilter !== 'all') {
      const targetPred = parseInt(state.predFilter);
      const pClass = cropData.pred_class;
      const matches = targetPred === 3 ? pClass >= 3 : pClass === targetPred;
      if (!matches) return;
    }

    const cropEl = createCropCell(videoName, track.track_id, pos, cropData);
    cropsWrap.appendChild(cropEl);
  });

  card.appendChild(header);
  card.appendChild(cropsWrap);
  return card;
}

function createCropCell(videoName, trackId, pos, cropData) {
  const cell = document.createElement('div');
  cell.className = `crop-cell ${cropData.reviewed ? 'reviewed-cell' : ''} ${cropData.flagged ? 'flagged-cell' : ''}`;
  cell.tabIndex = 0; // Make focusable
  cell.id = `crop-${videoName}-${trackId}-${pos}`;
  cell.dataset.videoName = videoName;
  cell.dataset.trackId = trackId;
  cell.dataset.pos = pos;

  cell.addEventListener('focus', () => {
    state.focusedCrop = { videoName, trackId, cropPos: pos };
    document.querySelectorAll('.crop-cell').forEach(el => el.classList.remove('focused'));
    cell.classList.add('focused');
  });

  // Image path — pick source based on polyline mode
  const imgBase = state.polylineMode === 'default' ? 'images_poly'
                : state.polylineMode === 'sam'     ? 'images_sam'
                : 'images';
  const imgSrc = `/${imgBase}/${state.split}/${videoName}/${trackId}_${pos}.jpg`;
  
  // Classes configuration
  const classes = [
    { val: 0, label: '0' },
    { val: 1, label: '1' },
    { val: 2, label: '2' },
    { val: 3, label: '≥3' }
  ];

  const effectiveClass = cropData.corrected_class !== null ? cropData.corrected_class : cropData.pred_class;
  const isCorrected = cropData.corrected_class !== null;

  let btnsHtml = '';
  classes.forEach(c => {
    const isSelected = isCorrected && cropData.corrected_class === c.val;
    btnsHtml += `<button class="class-btn ${isSelected ? 'selected' : ''}" data-class="${c.val}">${c.label}</button>`;
  });

  cell.innerHTML = `
    <div class="crop-pos-badge ${pos}">
      <span class="crop-pos-dot"></span>${pos}
    </div>
    
    <div class="crop-img-wrap">
      <img src="${imgSrc}" loading="lazy" alt="Crop" onerror="this.outerHTML='<div class=\\'img-placeholder\\'>Image Missing</div>'" />
    </div>

    <div class="crop-meta">
      <div class="meta-chip">Frame: <span>${cropData.frame_number}</span></div>
    </div>

    <div class="crop-classes">
      <div class="class-line">
        <span>Prediction</span>
        <span class="class-val">${cropData.pred_class === 3 ? '≥3' : cropData.pred_class}</span>
      </div>
      <div class="class-line">
        <span>Corrected</span>
        <span class="class-val ${isCorrected ? 'corrected' : 'none'}">${isCorrected ? (cropData.corrected_class === 3 ? '≥3' : cropData.corrected_class) : 'None'}</span>
      </div>
    </div>

    <div class="class-btns">
      ${btnsHtml}
    </div>

    <div class="action-btns">
      <button class="review-btn" aria-label="Review (No change)">Review</button>
      <button class="flag-btn" aria-label="Flag for review">Flag</button>
      <button class="reset-btn">Reset</button>
    </div>

    <div class="reviewed-tick">
      <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
    </div>
  `;

  // Attach button events
  const btns = cell.querySelectorAll('.class-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newClass = parseInt(btn.dataset.class);
      updateCrop(videoName, trackId, pos, newClass);
    });
  });

  const reviewBtn = cell.querySelector('.review-btn');
  reviewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    markReviewed(videoName, trackId, pos);
  });

  const flagBtn = cell.querySelector('.flag-btn');
  flagBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    flagCrop(videoName, trackId, pos);
  });

  const resetBtn = cell.querySelector('.reset-btn');
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetCrop(videoName, trackId, pos);
  });

  return cell;
}

// ── Updates ────────────────────────────────────────────────────
async function updateCrop(videoName, trackId, cropPos, newClass) {
  try {
    const res = await fetch('/api/update_crop_class', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        split: state.split,
        video_name: videoName,
        track_id: parseInt(trackId),
        crop: cropPos,
        corrected_class: newClass
      })
    });

    if (!res.ok) throw new Error('Update failed');

    // Update local state
    const video = state.data.find(v => v.video_name === videoName);
    if (video) {
      const track = video.tracks.find(t => t.track_id == trackId);
      if (track && track.crops[cropPos]) {
        track.crops[cropPos].corrected_class = newClass;
        track.crops[cropPos].reviewed = true;
        track.crops[cropPos].flagged = false;
      }
    }

    // Refresh only the affected track card to avoid full re-render scroll jump
    refreshTrackCard(videoName, trackId);
    focusCrop(videoName, trackId, cropPos);
    fetchStatsOnly();
    
    // Auto jump?
    // focusNextUnreviewed(); 
  } catch (err) {
    console.error(err);
    showToast('Failed to update class', 'error');
  }
}

async function markReviewed(videoName, trackId, cropPos, autoNext = false) {
  try {
    const res = await fetch('/api/review_crop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        split: state.split,
        video_name: videoName,
        track_id: parseInt(trackId),
        crop: cropPos
      })
    });

    if (!res.ok) throw new Error('Review failed');

    // Update local state
    const video = state.data.find(v => v.video_name === videoName);
    if (video) {
      const track = video.tracks.find(t => t.track_id == trackId);
      if (track && track.crops[cropPos]) {
        track.crops[cropPos].reviewed = true;
        track.crops[cropPos].flagged = false;
      }
    }

    refreshTrackCard(videoName, trackId);
    if (autoNext) {
      focusNextUnreviewed();
    } else {
      focusCrop(videoName, trackId, cropPos);
    }
    fetchStatsOnly();
  } catch (err) {
    console.error(err);
    showToast('Failed to review crop', 'error');
  }
}

async function resetCrop(videoName, trackId, cropPos) {
  try {
    const res = await fetch('/api/reset_crop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        split: state.split,
        video_name: videoName,
        track_id: parseInt(trackId),
        crop: cropPos
      })
    });

    if (!res.ok) throw new Error('Reset failed');

    // Update local state
    const video = state.data.find(v => v.video_name === videoName);
    if (video) {
      const track = video.tracks.find(t => t.track_id == trackId);
      if (track && track.crops[cropPos]) {
        track.crops[cropPos].corrected_class = null;
        track.crops[cropPos].reviewed = false;
        track.crops[cropPos].flagged = false;
      }
    }

    refreshTrackCard(videoName, trackId);
    focusCrop(videoName, trackId, cropPos);
    fetchStatsOnly();
  } catch (err) {
    console.error(err);
    showToast('Failed to reset', 'error');
  }
}

async function flagCrop(videoName, trackId, cropPos) {
  try {
    const res = await fetch('/api/flag_crop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        split: state.split,
        video_name: videoName,
        track_id: parseInt(trackId),
        crop: cropPos
      })
    });

    if (!res.ok) throw new Error('Flag failed');

    // Update local state
    const video = state.data.find(v => v.video_name === videoName);
    if (video) {
      const track = video.tracks.find(t => t.track_id == trackId);
      if (track && track.crops[cropPos]) {
        track.crops[cropPos].flagged = true;
        track.crops[cropPos].reviewed = false;
      }
    }

    refreshTrackCard(videoName, trackId);
    focusNextUnreviewed();
    fetchStatsOnly();
  } catch (err) {
    console.error(err);
    showToast('Failed to flag crop', 'error');
  }
}

function refreshTrackCard(videoName, trackId) {
  // Find the exact track element
  const oldCard = document.getElementById(`track-${videoName}-${trackId}`);
  if (!oldCard) return;

  const video = state.data.find(v => v.video_name === videoName);
  const track = video.tracks.find(t => t.track_id == trackId);
  if (!track) return;

  const newCard = createTrackCard(videoName, track);
  
  // Maintain collapsed state if necessary
  if (oldCard.classList.contains('collapsed')) {
    newCard.classList.add('collapsed');
  }

  oldCard.replaceWith(newCard);
}

// ── Shortcuts & Focus ──────────────────────────────────────────
function handleGlobalKeydown(e) {
  // Avoid interfering if user is searching
  if (document.activeElement === els.videoSearch) return;
  // Ignore browser shortcuts
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const key = e.key.toLowerCase();

  // Next unreviewed
  if (key === 'n') {
    e.preventDefault();
    focusNextUnreviewed();
    return;
  }

  // If we have a focused crop
  if (state.focusedCrop) {
    const { videoName, trackId, cropPos } = state.focusedCrop;

    if (['0','1','2','3'].includes(key)) {
      e.preventDefault();
      updateCrop(videoName, trackId, cropPos, parseInt(key));
    } else if (key === 'r') {
      e.preventDefault();
      resetCrop(videoName, trackId, cropPos);
    } else if (key === 'f') {
      e.preventDefault();
      flagCrop(videoName, trackId, cropPos);
    } else if (key === 'enter') {
      e.preventDefault();
      markReviewed(videoName, trackId, cropPos, true);
    } else if (key === 'arrowdown' || key === 'arrowup' || key === 'arrowright' || key === 'arrowleft') {
      // Basic navigation between crops
      e.preventDefault();
      const cells = Array.from(document.querySelectorAll('.crop-cell'));
      const activeIdx = cells.findIndex(c => c.id === `crop-${videoName}-${trackId}-${cropPos}`);
      if (activeIdx >= 0) {
        let nextIdx = activeIdx;
        if ((key === 'arrowdown' || key === 'arrowright') && activeIdx < cells.length - 1) {
          nextIdx++;
        } else if ((key === 'arrowup' || key === 'arrowleft') && activeIdx > 0) {
          nextIdx--;
        }
        cells[nextIdx].focus();
      }
    }
  }
}

function focusCrop(videoName, trackId, cropPos) {
  const el = document.getElementById(`crop-${videoName}-${trackId}-${cropPos}`);
  if (el) {
    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function focusNextUnreviewed() {
  const unreviewedCells = Array.from(document.querySelectorAll('.crop-cell:not(.reviewed-cell):not(.flagged-cell)'));
  if (unreviewedCells.length > 0) {
    unreviewedCells[0].focus();
    unreviewedCells[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    showToast('No more unreviewed crops visible! You may need to flip to the next page.', 'success');
  }
}

// ── UI Helpers ─────────────────────────────────────────────────
function updateStatsUI() {
  if (!state.stats) return;

  const { total_crops, reviewed_crops, unreviewed_crops, class_distribution } = state.stats;

  els.statTotalNum.textContent = total_crops;
  els.statReviewedNum.textContent = reviewed_crops;
  els.statPendingNum.textContent = unreviewed_crops;

  els.progressText.textContent = `${reviewed_crops} / ${total_crops}`;
  const pct = total_crops > 0 ? (reviewed_crops / total_crops) * 100 : 0;
  els.progressFill.style.width = `${pct}%`;

  // Render class distribution
  let distHtml = '';
  const totalWithClasses = Object.values(class_distribution).reduce((a, b) => a + b, 0);

  [0, 1, 2, 3].forEach(c => {
    const count = class_distribution[c] || 0;
    const barPct = totalWithClasses > 0 ? (count / totalWithClasses) * 100 : 0;
    distHtml += `
      <div class="class-row">
        <span class="class-label">${c === 3 ? '≥3' : c}</span>
        <div class="class-bar-bg">
          <div class="class-bar-fill c${c}" style="width: ${barPct}%"></div>
        </div>
        <span class="class-count">${count}</span>
      </div>
    `;
  });
  els.classDist.innerHTML = distHtml;
}

function showLoading(show) {
  if (show) {
    els.loadingOverlay.classList.remove('hidden');
    els.trackContainer.style.display = 'none';
    els.emptyState.classList.add('hidden');
  } else {
    els.loadingOverlay.classList.add('hidden');
    els.trackContainer.style.display = 'flex';
  }
}

let toastTimeout;
function showToast(msg, type = 'success') {
  clearTimeout(toastTimeout);
  els.toast.textContent = msg;
  els.toast.className = `toast show ${type}`;
  toastTimeout = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2500);
}

// ── Run ────────────────────────────────────────────────────────
init();
