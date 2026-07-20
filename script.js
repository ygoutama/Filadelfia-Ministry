/* ============================================
   FILADELPHIA MINISTRY — Modern Daily Devotion
   ============================================ */

// ============================================
// STATE
// ============================================
const state = {
  currentDate: null,
  archiveFiles: [],
  archiveData: [],
  todayData: null,
  isDark: false,
  currentPage: 'today',
  archivedDates: new Set()
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('id-ID', options);
}

function formatShortDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function estimateReadingTime(text) {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return minutes + ' min read';
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function getTodayDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getYesterdayDateString(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

function getTomorrowDateString(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

// ============================================
// FRONT MATTER PARSER
// ============================================

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontMatter: {}, content: markdown };

  const frontMatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      frontMatter[key] = value;
    }
  }

  return { frontMatter, content: match[2] };
}

// ============================================
// MARKDOWN PROCESSING
// ============================================

function processDevotionContent(html, sectionType) {
  const div = document.createElement('div');
  div.innerHTML = html;

  // Process blockquotes as verse highlights
  const blockquotes = div.querySelectorAll('blockquote');
  blockquotes.forEach(function(bq) {
    bq.classList.add('verse-highlight');
  });

  // Process prayer sections
  const headings = div.querySelectorAll('h2, h3');
  headings.forEach(function(h) {
    const text = h.textContent.toLowerCase();
    if (text.includes('doa') || text.includes('prayer')) {
      let sibling = h.nextElementSibling;
      const prayerContent = [];
      while (sibling && !sibling.matches('h1, h2, h3, h4, h5, h6, hr')) {
        prayerContent.push(sibling);
        sibling = sibling.nextElementSibling;
      }

      if (prayerContent.length > 0) {
        const prayerBox = document.createElement('div');
        prayerBox.className = 'prayer-box';
        prayerContent.forEach(function(el) {
          prayerBox.appendChild(el.cloneNode(true));
        });

        prayerContent.forEach(function(el) {
          el.remove();
        });

        if (h.nextElementSibling) {
          h.parentNode.insertBefore(prayerBox, h.nextElementSibling);
        } else {
          h.parentNode.appendChild(prayerBox);
        }
      }
    }
  });

  // Process quote paragraphs
  const allParagraphs = div.querySelectorAll('p');
  allParagraphs.forEach(function(p) {
    const text = p.textContent.trim();
    if ((text.startsWith('"') && text.endsWith('"')) || 
        (text.startsWith('"') && text.includes('" —')) ||
        (text.includes('—') && text.length < 300)) {
      const card = document.createElement('div');
      card.className = 'quote-card';

      const quoteText = document.createElement('p');
      quoteText.textContent = text;
      card.appendChild(quoteText);

      p.parentNode.replaceChild(card, p);
    }
  });

  return div.innerHTML;
}

function splitDevotions(content) {
  const sections = { embunPagi: '', youth: '', daily: '' };

  // Split by h1 headers - look for lines starting with # followed by space
  const lines = content.split('\n');
  let currentSection = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this is an h1 header
    if (line.match(/^#\s+(.+)$/)) {
      // Save previous section
      if (currentSection) {
        const fullText = currentContent.join('\n');
        if (currentSection === 'embun') sections.embunPagi = fullText;
        else if (currentSection === 'youth') sections.youth = fullText;
        else if (currentSection === 'daily') sections.daily = fullText;
      }

      // Determine new section
      const headerText = line.replace(/^#\s*/, '').trim().toLowerCase();
      if (headerText.includes('embun pagi')) {
        currentSection = 'embun';
      } else if (headerText.includes('youth')) {
        currentSection = 'youth';
      } else if (headerText.includes('daily')) {
        currentSection = 'daily';
      } else {
        currentSection = null;
      }

      currentContent = [line];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    const fullText = currentContent.join('\n');
    if (currentSection === 'embun') sections.embunPagi = fullText;
    else if (currentSection === 'youth') sections.youth = fullText;
    else if (currentSection === 'daily') sections.daily = fullText;
  }

  return sections;
}

// ============================================
// LOAD TODAY'S DEVOTION
// ============================================

async function loadTodayDevotion() {
  const embunEl = document.getElementById('embun-pagi-content');
  const youthEl = document.getElementById('youth-content');
  const dailyEl = document.getElementById('daily-content');
  const heroTitle = document.getElementById('hero-title');
  const heroDate = document.getElementById('hero-date');
  const heroVerse = document.getElementById('hero-verse');
  const readingTimeText = document.getElementById('reading-time-text');

  // Detect file:// protocol (opening HTML directly without server)
  const isFileProtocol = window.location.protocol === 'file:';

  try {
    let markdown;

    if (isFileProtocol) {
      // Cannot use fetch on file:// protocol due to CORS
      throw new Error('FILE_PROTOCOL');
    }

    const response = await fetch('./content/today.md');
    if (!response.ok) throw new Error('Failed to load today.md (status: ' + response.status + ')');
    markdown = await response.text();

    const markdown = await response.text();
    const { frontMatter, content } = parseFrontMatter(markdown);

    state.todayData = { frontMatter, content, markdown };
    state.currentDate = frontMatter.date || getTodayDateString();

    // Update hero
    heroTitle.textContent = frontMatter.title || 'Renungan Harian';
    heroDate.textContent = formatDate(state.currentDate);
    heroVerse.textContent = frontMatter.verse || '';

    // Update meta tags
    updateMetaTags(frontMatter);

    // Split and render sections
    const sections = splitDevotions(content);

    if (sections.embunPagi.trim()) {
      const html = marked.parse(sections.embunPagi);
      embunEl.innerHTML = processDevotionContent(html, 'embun');
    } else {
      embunEl.innerHTML = '<p class="loading-state">Tidak ada konten Embun Pagi.</p>';
    }

    if (sections.youth.trim()) {
      const html = marked.parse(sections.youth);
      youthEl.innerHTML = processDevotionContent(html, 'youth');
    } else {
      youthEl.innerHTML = '<p class="loading-state">Tidak ada konten Youth Devotion.</p>';
    }

    if (sections.daily.trim()) {
      const html = marked.parse(sections.daily);
      dailyEl.innerHTML = processDevotionContent(html, 'daily');
    } else {
      dailyEl.innerHTML = '<p class="loading-state">Tidak ada konten Daily Devotion.</p>';
    }

    // Calculate reading time
    const fullText = stripHtml(marked.parse(content));
    readingTimeText.textContent = estimateReadingTime(fullText);

    // Update navigation buttons
    updateNavButtons();

    // Check if already archived
    checkArchivedStatus();

  } catch (error) {
    console.error('Error loading devotion:', error);
    heroTitle.textContent = 'Renungan Tidak Tersedia';
    heroDate.textContent = formatDate(getTodayDateString());

    if (error.message === 'FILE_PROTOCOL' || isFileProtocol) {
      embunEl.innerHTML = '<div class="error-state"><h2>Server Diperlukan</h2><p>Website ini tidak dapat dibuka langsung dari file. Gunakan salah satu cara berikut:</p><ul style="text-align:left;margin-top:1rem;"><li><strong>Local server:</strong> Jalankan <code>python -m http.server 8000</code> di folder project, lalu buka <code>http://localhost:8000</code></li><li><strong>VS Code:</strong> Install extension "Live Server" dan klik "Go Live"</li><li><strong>GitHub Pages:</strong> Upload ke GitHub dan aktifkan Pages</li></ul></div>';
    } else {
      embunEl.innerHTML = '<div class="error-state"><h2>Belum Ada Renungan</h2><p>Silakan buat file <code>content/today.md</code> dengan format yang benar.</p><p style="font-size:0.85rem;color:var(--text-muted);margin-top:1rem;">Error: ' + error.message + '</p></div>';
    }
    youthEl.innerHTML = '';
    dailyEl.innerHTML = '';
  }
}

// ============================================
// LOAD ARCHIVED DEVOTION
// ============================================

async function loadArchivedDevotion(dateStr) {
  const embunEl = document.getElementById('embun-pagi-content');
  const youthEl = document.getElementById('youth-content');
  const dailyEl = document.getElementById('daily-content');
  const heroTitle = document.getElementById('hero-title');
  const heroDate = document.getElementById('hero-date');
  const heroVerse = document.getElementById('hero-verse');
  const readingTimeText = document.getElementById('reading-time-text');

  try {
    const response = await fetch('./content/archive/' + dateStr + '.md');
    if (!response.ok) throw new Error('File not found (status: ' + response.status + ')');

    const markdown = await response.text();
    const { frontMatter, content } = parseFrontMatter(markdown);

    state.todayData = { frontMatter, content, markdown };
    state.currentDate = dateStr;

    heroTitle.textContent = frontMatter.title || 'Renungan Harian';
    heroDate.textContent = formatDate(dateStr);
    heroVerse.textContent = frontMatter.verse || '';

    updateMetaTags(frontMatter);

    const sections = splitDevotions(content);

    if (sections.embunPagi.trim()) {
      embunEl.innerHTML = processDevotionContent(marked.parse(sections.embunPagi), 'embun');
    } else {
      embunEl.innerHTML = '<p class="loading-state">Tidak ada konten.</p>';
    }

    if (sections.youth.trim()) {
      youthEl.innerHTML = processDevotionContent(marked.parse(sections.youth), 'youth');
    } else {
      youthEl.innerHTML = '<p class="loading-state">Tidak ada konten.</p>';
    }

    if (sections.daily.trim()) {
      dailyEl.innerHTML = processDevotionContent(marked.parse(sections.daily), 'daily');
    } else {
      dailyEl.innerHTML = '<p class="loading-state">Tidak ada konten.</p>';
    }

    const fullText = stripHtml(marked.parse(content));
    readingTimeText.textContent = estimateReadingTime(fullText);

    updateNavButtons();
    checkArchivedStatus();

    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (error) {
    console.error('Error loading archived devotion:', error);
    heroTitle.textContent = 'Renungan Tidak Ditemukan';
    heroDate.textContent = formatDate(dateStr);
    embunEl.innerHTML = '<div class="error-state"><p>File archive/' + dateStr + '.md tidak ditemukan.</p><p style="font-size:0.85rem;color:var(--text-muted);margin-top:1rem;">' + error.message + '</p></div>';
    youthEl.innerHTML = '';
    dailyEl.innerHTML = '';
  }
}

// ============================================
// NAVIGATION
// ============================================

function updateNavButtons() {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  const yesterday = getYesterdayDateString(state.currentDate);
  const tomorrow = getTomorrowDateString(state.currentDate);
  const today = getTodayDateString();

  prevBtn.disabled = false;
  prevBtn.onclick = function() { loadArchivedDevotion(yesterday); };

  if (tomorrow > today) {
    nextBtn.disabled = true;
    nextBtn.onclick = null;
  } else {
    nextBtn.disabled = false;
    nextBtn.onclick = function() { loadArchivedDevotion(tomorrow); };
  }
}

function loadPrevDevotion() {
  const yesterday = getYesterdayDateString(state.currentDate);
  loadArchivedDevotion(yesterday);
}

function loadNextDevotion() {
  const tomorrow = getTomorrowDateString(state.currentDate);
  const today = getTodayDateString();
  if (tomorrow <= today) {
    loadArchivedDevotion(tomorrow);
  }
}

// ============================================
// PAGE NAVIGATION
// ============================================

function showPage(pageName) {
  state.currentPage = pageName;

  document.querySelectorAll('.page').forEach(function(page) {
    page.classList.remove('active');
  });

  document.getElementById('page-' + pageName).classList.add('active');

  document.querySelectorAll('.nav-link').forEach(function(link) {
    link.classList.toggle('active', link.dataset.page === pageName);
  });

  document.getElementById('mobile-menu').classList.remove('active');
  document.getElementById('mobile-menu-btn').classList.remove('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (pageName === 'archive') {
    loadArchive();
  }
}

// ============================================
// ARCHIVE
// ============================================

async function loadArchive() {
  const grid = document.getElementById('archive-grid');
  const stats = document.getElementById('archive-stats');
  const noResults = document.getElementById('no-results');

  grid.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading archive...</p></div>';

  try {
    // Try to load archive-index.json first
    let files = [];
    try {
      const idxResponse = await fetch('./content/archive-index.json');
      if (idxResponse.ok) {
        const idxData = await idxResponse.json();
        files = idxData.files || [];
      }
    } catch (e) {
      console.log('No archive-index.json found, discovering files...');
    }

    // If no index, discover by checking dates
    if (files.length === 0) {
      files = await discoverArchiveFiles();
    }

    state.archiveFiles = files;

    // Load metadata for each file
    const archiveData = [];
    for (const filename of files) {
      try {
        const response = await fetch('./content/archive/' + filename);
        if (response.ok) {
          const markdown = await response.text();
          const { frontMatter } = parseFrontMatter(markdown);
          archiveData.push({
            filename: filename,
            date: frontMatter.date || filename.replace('.md', ''),
            title: frontMatter.title || 'Untitled',
            verse: frontMatter.verse || ''
          });
        }
      } catch (e) {
        // Skip files that fail to load
      }
    }

    // Sort by date descending
    archiveData.sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    state.archiveData = archiveData;

    renderArchive(archiveData);
    stats.textContent = archiveData.length + ' devotion' + (archiveData.length !== 1 ? 's' : '') + ' in archive';

  } catch (error) {
    console.error('Error loading archive:', error);
    grid.innerHTML = '<div class="error-state"><p>Unable to load archive. Please check that archive files exist.</p></div>';
    stats.textContent = '';
  }
}

async function discoverArchiveFiles() {
  const files = [];
  const today = new Date();

  // Check last 90 days using GET requests (HEAD may not work on GitHub Pages)
  const promises = [];
  for (let i = 0; i < 90; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const filename = dateStr + '.md';

    promises.push(
      fetch('./content/archive/' + filename)
        .then(function(response) {
          if (response.ok) return filename;
          return null;
        })
        .catch(function() {
          return null;
        })
    );
  }

  const results = await Promise.all(promises);
  results.forEach(function(result) {
    if (result) files.push(result);
  });

  return files;
}

function renderArchive(data) {
  const grid = document.getElementById('archive-grid');
  const noResults = document.getElementById('no-results');

  if (data.length === 0) {
    grid.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }

  noResults.style.display = 'none';

  grid.innerHTML = data.map(function(item) {
    return '<a href="#" class="archive-card" onclick="loadArchivedDevotion(\'' + item.date + '\'); showPage(\'today\'); return false;">' +
      '<div class="archive-card-date">' + formatShortDate(item.date) + '</div>' +
      '<div class="archive-card-title">' + escapeHtml(item.title) + '</div>' +
      (item.verse ? '<div class="archive-card-verse">' + escapeHtml(item.verse) + '</div>' : '') +
      '<div class="archive-card-read">' +
        'Read More' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-7-7l7 7-7 7"/></svg>' +
      '</div>' +
    '</a>';
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// SEARCH
// ============================================

function setupSearch() {
  const searchInput = document.getElementById('search-input');

  searchInput.addEventListener('input', debounce(function(e) {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
      renderArchive(state.archiveData);
      document.getElementById('archive-stats').textContent = 
        state.archiveData.length + ' devotion' + (state.archiveData.length !== 1 ? 's' : '') + ' in archive';
      return;
    }

    const filtered = state.archiveData.filter(function(item) {
      return item.title.toLowerCase().includes(query) ||
        (item.verse && item.verse.toLowerCase().includes(query)) ||
        item.date.includes(query);
    });

    renderArchive(filtered);
    document.getElementById('archive-stats').textContent = 
      filtered.length + ' result' + (filtered.length !== 1 ? 's' : '') + ' for "' + escapeHtml(query) + '"';
  }, 300));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction() {
    const args = arguments;
    const later = function() {
      clearTimeout(timeout);
      func.apply(null, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// ARCHIVE TODAY'S DEVOTION
// ============================================

function checkArchivedStatus() {
  const btn = document.getElementById('archive-today-btn');
  if (!state.currentDate || !state.todayData) return;

  const archived = localStorage.getItem('archived_' + state.currentDate);
  if (archived) {
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Archived';
    btn.classList.add('archived');
    btn.disabled = true;
  } else {
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-5l5 5 5-5m-5-5v12"/></svg>Archive Today';
    btn.classList.remove('archived');
    btn.disabled = false;
  }
}

function archiveToday() {
  if (!state.todayData || !state.currentDate) return;

  const dateStr = state.currentDate;
  const filename = dateStr + '.md';
  const content = state.todayData.markdown;

  // Download the file for manual placement
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Save to localStorage for reference
  localStorage.setItem('archived_' + dateStr, content);
  localStorage.setItem('archive_meta_' + dateStr, JSON.stringify({
    date: dateStr,
    title: state.todayData.frontMatter.title || 'Untitled',
    verse: state.todayData.frontMatter.verse || ''
  }));

  checkArchivedStatus();
  showNotification('Downloaded ' + filename + '. Move it to /content/archive/ folder.');
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: var(--bg-card); color: var(--text); padding: 14px 24px; border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 8px 24px var(--shadow-lg); z-index: 10000; font-size: 0.9rem; font-weight: 500;';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(function() {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease';
    setTimeout(function() { notification.remove(); }, 300);
  }, 5000);
}

// ============================================
// THEME
// ============================================

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (saved === 'dark' || (!saved && prefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    state.isDark = true;
  }
}

function toggleTheme() {
  state.isDark = !state.isDark;
  if (state.isDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
}

// ============================================
// PROGRESS BAR
// ============================================

function updateProgressBar() {
  const scrollTop = window.scrollY;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  document.getElementById('progress-bar').style.width = progress + '%';
}

// ============================================
// BACK TO TOP
// ============================================

function updateBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (window.scrollY > 500) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// META TAGS
// ============================================

function updateMetaTags(frontMatter) {
  const title = frontMatter.title || 'Filadelfia Ministry';
  const verse = frontMatter.verse || '';
  const description = verse ? title + ' — ' + verse : title;

  document.title = title + ' — Filadelfia Ministry';

  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  const twDesc = document.querySelector('meta[name="twitter:description"]');
  const metaDesc = document.querySelector('meta[name="description"]');

  if (ogTitle) ogTitle.setAttribute('content', title);
  if (ogDesc) ogDesc.setAttribute('content', description);
  if (twTitle) twTitle.setAttribute('content', title);
  if (twDesc) twDesc.setAttribute('content', description);
  if (metaDesc) metaDesc.setAttribute('content', description);
}

// ============================================
// MOBILE MENU
// ============================================

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('mobile-menu-btn');
  menu.classList.toggle('active');
  btn.classList.toggle('active');
}

// ============================================
// KEYBOARD NAVIGATION
// ============================================

document.addEventListener('keydown', function(e) {
  if (state.currentPage === 'today') {
    if (e.key === 'ArrowLeft' && !document.getElementById('prev-btn').disabled) {
      loadPrevDevotion();
    } else if (e.key === 'ArrowRight' && !document.getElementById('next-btn').disabled) {
      loadNextDevotion();
    }
  }

  if (e.key === 'Escape') {
    document.getElementById('mobile-menu').classList.remove('active');
    document.getElementById('mobile-menu-btn').classList.remove('active');
  }
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  initTheme();

  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileMenu);
  document.getElementById('back-to-top').addEventListener('click', scrollToTop);

  window.addEventListener('scroll', function() {
    updateProgressBar();
    updateBackToTop();
  });

  setupSearch();
  loadTodayDevotion();

  const hash = window.location.hash;
  if (hash.startsWith('#archive-')) {
    const dateStr = hash.replace('#archive-', '');
    showPage('today');
    loadArchivedDevotion(dateStr);
  }
});

window.addEventListener('popstate', function() {
  const hash = window.location.hash;
  if (hash.startsWith('#archive-')) {
    const dateStr = hash.replace('#archive-', '');
    showPage('today');
    loadArchivedDevotion(dateStr);
  } else if (hash === '#archive') {
    showPage('archive');
  } else {
    showPage('today');
  }
});
