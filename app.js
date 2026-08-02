import { supabase } from './supabase.js'
import { signUpWithEmail, loginWithEmail, logout, getCurrentUser } from './auth.js'

let currentUser = null
let currentMediaFilter = 'all'
let selectedTags = []
let currentSlideIndex = 0
let bannerInterval = null
let touchStartX = 0
let touchEndX = 0
let onConfirmCallback = null
let activeBookDetailId = null

let exploreSearchMode = 'books'

// Helper aman untuk sanitasi teks XSS
function sanitizeText(str) {
  if (!str) return ''
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(str) : str
}

function pushHistoryState(type, id = null) {
  history.pushState({ type, id, timestamp: Date.now() }, '')
}

// ==========================================
// 1. REGISTRASI FUNGSI GLOBAL (WINDOW)
// ==========================================
window.showToast = function(message, type = 'success') {
  const toast = document.getElementById('toast')
  const icon = document.getElementById('toast-icon')
  const msg = document.getElementById('toast-message')

  if (!toast) return
  if (msg) msg.innerText = message
  if (icon) {
    if (type === 'success') {
      icon.className = 'bi bi-check-circle-fill'
      icon.style.color = '#34d399'
    } else {
      icon.className = 'bi bi-exclamation-triangle-fill'
      icon.style.color = '#f87171'
    }
  }

  toast.className = 'toast-container show'
  setTimeout(() => toast?.classList.remove('show'), 3000)
}

window.shareBook = function(id, isAu = false) {
  const paramKey = isAu ? 'au' : 'book'
  const shareUrl = `${window.location.origin}${window.location.pathname}?${paramKey}=${id}`

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      window.showToast('Link berhasil disalin! 📋')
    }).catch(() => {
      fallbackCopyText(shareUrl)
    })
  } else {
    fallbackCopyText(shareUrl)
  }
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea")
  textArea.value = text
  textArea.style.position = "fixed"
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()
  try {
    document.execCommand('copy')
    window.showToast('Link berhasil disalin! 📋')
  } catch (err) {
    window.showToast('Gagal menyalin link', 'error')
  }
  document.body.removeChild(textArea)
}

window.showConfirmModal = function(title, message, callback) {
  const modal = document.getElementById('modal-confirm')
  const titleEl = document.getElementById('confirm-title')
  const msgEl = document.getElementById('confirm-message')

  if (titleEl) titleEl.innerText = title
  if (msgEl) msgEl.innerText = message
  onConfirmCallback = callback
  modal?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-confirm')
}

window.switchTab = function(tabId, recordHistory = true) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'))
  const targetTab = document.getElementById(tabId)
  if (targetTab) targetTab.classList.remove('hidden')

  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active')
    else btn.classList.remove('active')
  })

  if (recordHistory && tabId !== 'tab-home') {
    pushHistoryState('tab', tabId)
  }
}

window.openEditProfileModal = function() {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')
  const p = currentUser.profile
  
  const fName = document.getElementById('edit-fullname')
  const uName = document.getElementById('edit-username')
  const aUrl = document.getElementById('edit-avatar-url')
  const bio = document.getElementById('edit-bio')

  if (fName) fName.value = p?.full_name || ''
  if (uName) uName.value = p?.username || ''
  if (aUrl) aUrl.value = p?.avatar_url || ''
  if (bio) bio.value = p?.bio || ''

  const cF = document.getElementById('count-fullname')
  const cU = document.getElementById('count-username')
  const cB = document.getElementById('count-bio')

  if (cF) cF.innerText = `${(p?.full_name || '').length}/30`
  if (cU) cU.innerText = `${(p?.username || '').length}/20`
  if (cB) cB.innerText = `${(p?.bio || '').length}/150`

  document.getElementById('modal-edit-profile')?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-edit-profile')
}

// LOGIC CRUD BUKA/SUBMIT/EDIT/DELETE AU STORIES
window.openAuFormById = async function(auId = null) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')

  const modalForm = document.getElementById('modal-au-form')
  const titleEl = document.getElementById('au-form-title')
  const partsContainer = document.getElementById('au-parts-container')
  const isAdmin = currentUser?.profile?.role === 'admin'
  const uploaderGroup = document.getElementById('group-au-uploader-type')

  if (uploaderGroup) uploaderGroup.style.display = isAdmin ? 'none' : 'block'
  
  document.getElementById('form-au')?.reset()
  if (partsContainer) partsContainer.innerHTML = ''

  if (auId) {
    try {
      const { data: story } = await supabase.from('stories').select('*').eq('id', auId).single()
      if (!story) return

      if (!isAdmin && story.user_id !== currentUser.id) {
        return window.showToast('Kamu hanya bisa mengedit AU buatanmu sendiri!', 'error')
      }

      if (titleEl) titleEl.innerText = '✏️ Edit Sosmed AU'
      document.getElementById('au-id').value = story.id
      document.getElementById('au-title').value = story.title || ''
      document.getElementById('au-author').value = story.author || ''
      document.getElementById('au-platform').value = story.platform || 'Twitter / X'
      document.getElementById('au-cover-url').value = story.cover_url || ''

      const uploaderSelect = document.getElementById('au-uploader-type')
      if (uploaderSelect) uploaderSelect.value = story.uploader_type || 'reader'

      if (story.parts && story.parts.length > 0) {
        story.parts.forEach(part => partsContainer?.insertAdjacentHTML('beforeend', window.createAuPartInput(part.url)))
      } else {
        partsContainer?.insertAdjacentHTML('beforeend', window.createAuPartInput())
      }
    } catch (err) {
      window.showToast('Gagal memuat data AU', 'error')
    }
  } else {
    if (titleEl) titleEl.innerText = '📱 Tambah Sosmed AU Baru'
    document.getElementById('au-id').value = ''
    partsContainer?.insertAdjacentHTML('beforeend', window.createAuPartInput())
  }

  modalForm?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-au-form')
}

window.createAuPartInput = function(value = '') {
  return `
    <div class="au-part-item" style="display:flex; gap:6px;">
      <input type="url" class="form-input au-part-url" required placeholder="URL Thread / Part" value="${value}" style="font-size:11px;">
      <button type="button" onclick="this.parentElement.remove()" style="background:rgba(239,68,68,0.2); color:#fca5a5; border:none; padding:0 10px; border-radius:8px; cursor:pointer;"><i class="bi bi-trash"></i></button>
    </div>
  `
}

window.deleteAu = function(auId) {
  window.showConfirmModal('Hapus AU', 'Apakah kamu yakin ingin menghapus cerita AU ini?', async () => {
    try {
      const { error } = await supabase.from('stories').delete().eq('id', auId)
      if (error) throw error
      window.showToast('AU berhasil dihapus!')
      document.getElementById('modal-au-detail')?.classList.add('hidden')
      loadAuStories()
      loadProfile()
    } catch (err) {
      window.showToast('Gagal menghapus AU: ' + err.message, 'error')
    }
  })
}

// BUKA MODAL DETAIL AU (DESAIN SAMA DENGAN DETAIL BUKU)
window.openAuDetail = async function(auId) {
  const modal = document.getElementById('modal-au-detail')
  const container = document.getElementById('au-detail-content')
  if (!container) return

  container.innerHTML = `<p style="font-size:11px; color:#94a3b8; text-align:center;">Memuat detail AU...</p>`
  modal?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-au-detail')

  try {
    const { data: story, error } = await supabase.from('stories').select('*').eq('id', auId).single()
    if (error || !story) return window.showToast('Gagal memuat AU', 'error')

    // TAMPILKAN UPLOADER PROFILE
    let uploaderProfile = null
    if (story.user_id) {
      const { data: p } = await supabase.from('profiles').select('id, username, full_name, role').eq('id', story.user_id).single()
      uploaderProfile = p
    }

    let uploaderHTML = ''
    if (!story.user_id || uploaderProfile?.role === 'admin') {
      uploaderHTML = `<span style="font-size:11px; color:#cbd5e1; display:flex; align-items:center; gap:4px;">👑 Diunggah oleh <b style="color:#f8fafc;">FiksiVerse Official</b></span>`
    } else if (uploaderProfile) {
      const isWriter = story.uploader_type === 'writer'
      const badgeStyle = isWriter 
        ? 'background:rgba(168,85,247,0.25); color:#e9d5ff; border:1px solid rgba(168,85,247,0.4);' 
        : 'background:rgba(56,189,248,0.25); color:#7dd3fc; border:1px solid rgba(56,189,248,0.4);'
      const badgeLabel = isWriter ? '✍️ Writer' : '📖 Reader'

      uploaderHTML = `
        <span style="font-size:11px; color:#cbd5e1; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          Diunggah oleh <b onclick="openUserProfile('${uploaderProfile.id}')" style="color:#38bdf8; cursor:pointer;">@${sanitizeText(uploaderProfile.username)}</b>
          <span style="padding:2px 8px; font-size:10px; border-radius:9999px; font-weight:800; ${badgeStyle}">${badgeLabel}</span>
        </span>
      `
    }

    // CHECK BOOKMARK & RECOMMENDATION STATUS UNTUK AU
    let isBookmarked = false
    let isRecommended = false

    if (currentUser) {
      const { data: bm } = await supabase.from('bookmarks').select('id').eq('user_id', currentUser.id).eq('story_id', auId)
      isBookmarked = bm && bm.length > 0

      const { data: rec } = await supabase.from('recommendations').select('id').eq('user_id', currentUser.id).eq('story_id', auId)
      isRecommended = rec && rec.length > 0
    }

    const isAdmin = currentUser?.profile?.role === 'admin'
    const isOwner = currentUser && (currentUser.id === story.user_id || isAdmin)
    const parts = story.parts || []

    container.innerHTML = `
      <div style="display:flex; gap:14px;">
        <div class="uncropped-cover-container" style="width:100px; height:140px; flex-shrink:0;">
          <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/120'}" class="uncropped-cover-bg">
          <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/120'}" class="uncropped-cover-img">
        </div>
        <div class="space-y-2" style="flex:1;">
          <h2 style="font-size:16px; font-weight:800; color:#f8fafc;">${sanitizeText(story.title)}</h2>
          <p style="font-size:12px; color:#c084fc; font-weight:600;">${sanitizeText(story.author)}</p>
          ${uploaderHTML}
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
            <span style="padding:2px 8px; background:rgba(56,189,248,0.2); color:#7dd3fc; font-size:10px; border-radius:9999px; font-weight:700;">
              📱 ${sanitizeText(story.platform || 'Sosmed AU')}
            </span>
          </div>
          <div style="font-size:12px; color:#fbbf24; padding-top:2px; font-weight:700;">
            <span>⭐ ${story.recommendation_count || 0} Rekomendasi</span>
          </div>
        </div>
      </div>

      ${isOwner ? `
        <div style="display:grid; grid-template-columns:${isAdmin ? '1fr 1fr' : '1fr'}; gap:8px; padding-top:4px;">
          <button onclick="openAuFormById('${story.id}')" style="padding:8px; border-radius:10px; font-size:11px; font-weight:700; background:rgba(99,102,241,0.2); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); cursor:pointer;">
            ✏️ Edit AU
          </button>
          ${isAdmin ? `
            <button onclick="deleteAu('${story.id}')" style="padding:8px; border-radius:10px; font-size:11px; font-weight:700; background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); cursor:pointer;">
              🗑️ Hapus AU
            </button>
          ` : ''}
        </div>
      ` : ''}

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; padding-top:8px;">
        <button onclick="toggleAuBookmark('${story.id}', ${isBookmarked})" 
          style="padding:10px 4px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid ${isBookmarked ? '#f87171' : 'rgba(255,255,255,0.1)'}; background:${isBookmarked ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}; color:${isBookmarked ? '#fca5a5' : '#cbd5e1'}; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;">
          <i class="bi bi-bookmark${isBookmarked ? '-check-fill' : ''}" style="${isBookmarked ? 'color:#f87171' : ''}"></i>
          ${isBookmarked ? 'Simpan' : 'Bookmark'}
        </button>
        
        <button onclick="toggleAuRecommendation('${story.id}', ${isRecommended})" 
          style="padding:10px 4px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid ${isRecommended ? '#fbbf24' : 'rgba(255,255,255,0.1)'}; background:${isRecommended ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)'}; color:${isRecommended ? '#fde047' : '#cbd5e1'}; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;">
          <i class="bi bi-star${isRecommended ? '-fill' : ''}" style="${isRecommended ? 'color:#fbbf24' : ''}"></i>
          ${isRecommended ? 'Suka' : 'Rekomendasi'}
        </button>

        <button onclick="shareBook('${story.id}', true)" 
          style="padding:10px 4px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid rgba(168,85,247,0.3); background:rgba(168,85,247,0.15); color:#e9d5ff; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;">
          <i class="bi bi-share-fill" style="color:#c084fc;"></i>
          Bagikan
        </button>
      </div>

      <div style="padding-top:10px; border-top:1px solid rgba(168,85,247,0.2);">
        <h4 style="font-size:12px; font-weight:800; color:#c084fc; margin-bottom:10px;">📖 Pilih Part Thread untuk Membaca (${parts.length} Part):</h4>
        <div class="space-y-2">
          ${parts.length === 0 ? `<p style="font-size:11px; color:#94a3b8;">Belum ada link part yang dimasukkan.</p>` : ''}
          ${parts.map((p, idx) => `
            <a href="${sanitizeText(p.url)}" target="_blank" rel="noopener noreferrer" 
               style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); border:1px solid rgba(56,189,248,0.3); padding:10px 14px; border-radius:12px; text-decoration:none; color:#f8fafc; font-size:12px; font-weight:700;">
              <span>Part ${p.part || (idx + 1)}</span>
              <span style="font-size:10px; color:#38bdf8; display:flex; align-items:center; gap:4px;">Buka Thread <i class="bi bi-box-arrow-up-right"></i></span>
            </a>
          `).join('')}
        </div>
      </div>
    `
  } catch (err) {
    container.innerHTML = `<p style="font-size:11px; color:#f87171; text-align:center;">Gagal memuat detail AU.</p>`
  }
}

// TOGGLE BOOKMARK KHUSUS AU
window.toggleAuBookmark = async function(auId, isBookmarked) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')
  try {
    if (isBookmarked) await supabase.from('bookmarks').delete().eq('user_id', currentUser.id).eq('story_id', auId)
    else await supabase.from('bookmarks').insert({ user_id: currentUser.id, story_id: auId })
    window.openAuDetail(auId)
    loadUserBookmarks()
    loadProfile()
  } catch(e) {
    window.showToast('Gagal update bookmark AU', 'error')
  }
}

// TOGGLE RECOMMENDATION KHUSUS AU
window.toggleAuRecommendation = async function(auId, isRecommended) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')
  try {
    if (isRecommended) {
      await supabase.from('recommendations').delete().eq('user_id', currentUser.id).eq('story_id', auId)
    } else {
      await supabase.from('recommendations').insert({ user_id: currentUser.id, story_id: auId })
    }
    window.openAuDetail(auId)
    loadUserRecommendations()
    loadProfile()
  } catch(e) {
    window.showToast('Gagal update rekomendasi AU', 'error')
  }
}

// TOGGLE TAB PADA PROFIL PUBLIC (DIREKOMENDASIKAN VS DITAMBAHKAN)
window.switchPublicTab = function(type) {
  const btnRec = document.getElementById('public-tab-rec')
  const btnAdded = document.getElementById('public-tab-added')
  const secRec = document.getElementById('public-sec-rec')
  const secAdded = document.getElementById('public-sec-added')

  if (type === 'rec') {
    btnRec?.classList.add('active')
    btnAdded?.classList.remove('active')
    secRec?.classList.remove('hidden')
    secAdded?.classList.add('hidden')
  } else {
    btnAdded?.classList.add('active')
    btnRec?.classList.remove('active')
    secAdded?.classList.remove('hidden')
    secRec?.classList.add('hidden')
  }
}

// BUKA PROFIL AKUN LAIN
window.openUserProfile = async function(userId) {
  if (currentUser && currentUser.id === userId) {
    window.switchTab('tab-profile')
    return
  }

  document.getElementById('modal-social')?.classList.add('hidden')
  document.getElementById('modal-notif')?.classList.add('hidden')

  const modal = document.getElementById('modal-user-profile')
  const container = document.getElementById('public-profile-content')
  if (!container) return

  container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:20px 0;">Memuat profil...</p>`
  modal?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-user-profile')

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (!profile) return window.showToast('Profil tidak ditemukan', 'error')

    let isFollowing = false
    let isFollowedBy = false

    if (currentUser) {
      const { data: followData } = await supabase.from('follows')
        .select('follower_id')
        .eq('follower_id', currentUser.id)
        .eq('following_id', userId)
      
      isFollowing = followData && followData.length > 0

      const { data: followedByData } = await supabase.from('follows')
        .select('follower_id')
        .eq('follower_id', userId)
        .eq('following_id', currentUser.id)

      isFollowedBy = followedByData && followedByData.length > 0
    }

    const { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId)
    const { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
    
    // FETCH REKOMENDASI BACAAN USER
    const { data: userRecs } = await supabase.from('recommendations').select('books(*)').eq('user_id', userId)
    const recBooks = userRecs ? userRecs.map(r => r.books).filter(b => b && b.is_published !== false) : []

    // FETCH BUKU YANG DITAMBAHKAN USER (TERBIT)
    const { data: userAdded } = await supabase.from('books').select('*').eq('user_id', userId).eq('is_published', true).order('created_at', { ascending: false })
    const addedBooks = userAdded || []

    let followBtnText = 'Ikuti'
    let followBtnIcon = 'bi-person-plus-fill'
    let followBtnStyle = 'background:linear-gradient(135deg,#a855f7,#6366f1); color:white;'

    if (isFollowing) {
      followBtnText = 'Mengikuti'
      followBtnIcon = 'bi-person-check-fill'
      followBtnStyle = 'background:rgba(255,255,255,0.1); color:#cbd5e1; border:1px solid rgba(255,255,255,0.2);'
    } else if (isFollowedBy) {
      followBtnText = 'Ikuti Balik'
      followBtnIcon = 'bi-person-plus-fill'
      followBtnStyle = 'background:linear-gradient(135deg,#a855f7,#38bdf8); color:white;'
    }

    container.innerHTML = `
      <div class="profile-card-hero">
        <div class="profile-bg-banner"></div>
        <div class="profile-avatar-container">
          <img src="${sanitizeText(profile.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + profile.id}" class="profile-avatar-img">
        </div>
        <div class="profile-info-box">
          <h3 style="font-size:16px; font-weight:800; color:#f8fafc;">
            ${sanitizeText(profile.full_name) || 'User'} ${profile.role === 'admin' ? '👑' : ''}
          </h3>
          <p style="font-size:12px; color:#38bdf8; font-weight:600;">@${sanitizeText(profile.username) || 'user'}</p>
          <p style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.4;">${sanitizeText(profile.bio) || 'Belum ada bio.'}</p>

          <button onclick="toggleFollow('${profile.id}', ${isFollowing})" 
            style="margin:12px auto 0; padding:8px 20px; border-radius:9999px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; border:none; ${followBtnStyle}">
            <i class="bi ${followBtnIcon}"></i>
            ${followBtnText}
          </button>

          <div class="profile-stats-grid" style="grid-template-columns: 1fr 1fr; max-width: 220px; margin: 16px auto 0;">
            <div class="stat-card">
              <span class="stat-value">${followersCount || 0}</span>
              <span class="stat-label">Pengikut</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">${followingCount || 0}</span>
              <span class="stat-label">Mengikuti</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB SWITCHER: DIREKOMENDASIKAN VS DITAMBAHKAN -->
      <div style="display:flex; border-bottom:1px solid rgba(168, 85, 247, 0.2); gap:12px; padding-bottom:8px; margin-top:8px;">
        <button id="public-tab-rec" onclick="window.switchPublicTab('rec')" class="auth-tab active" type="button" style="font-size:12px; padding:6px 12px;">
          ⭐ Direkomendasikan (${recBooks.length})
        </button>
        <button id="public-tab-added" onclick="window.switchPublicTab('added')" class="auth-tab" type="button" style="font-size:12px; padding:6px 12px;">
          📚 Ditambahkan (${addedBooks.length})
        </button>
      </div>

      <!-- SEKSI 1: REKOMENDASI BACAAN USER -->
      <div id="public-sec-rec" style="padding-top:8px;">
        ${recBooks.length === 0 ? `<p style="font-size:11px; color:#94a3b8; text-align:center; padding:16px 0;">User ini belum merekomendasikan buku apa pun.</p>` : ''}
        <div class="book-grid-vertical">
          ${recBooks.map(book => `
            <div onclick="openBookDetail('${book.id}')" class="book-card-vertical">
              <div class="uncropped-cover-container" style="height:150px;">
                <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
                <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(book.title)}">
                <span class="book-badge">${sanitizeText(book.media_type)}</span>
              </div>
              <div class="book-info">
                <h3 class="book-title">${sanitizeText(book.title)}</h3>
                <p class="book-author">${sanitizeText(book.author)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- SEKSI 2: BUKU YANG DITAMBAHKAN USER -->
      <div id="public-sec-added" class="hidden" style="padding-top:8px;">
        ${addedBooks.length === 0 ? `<p style="font-size:11px; color:#94a3b8; text-align:center; padding:16px 0;">User ini belum menambahkan buku.</p>` : ''}
        <div class="book-grid-vertical">
          ${addedBooks.map(book => `
            <div onclick="openBookDetail('${book.id}')" class="book-card-vertical">
              <div class="uncropped-cover-container" style="height:150px;">
                <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
                <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(book.title)}">
                <span class="book-badge">${sanitizeText(book.media_type)}</span>
              </div>
              <div class="book-info">
                <h3 class="book-title">${sanitizeText(book.title)}</h3>
                <p class="book-author">${sanitizeText(book.author)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `
  } catch (err) {
    window.showToast('Gagal memuat profil user: ' + err.message, 'error')
  }
}

window.toggleFollow = async function(targetUserId, isFollowing) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')

  try {
    if (isFollowing) {
      const { error } = await supabase.from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', targetUserId)

      if (error) throw error
      window.showToast('Berhenti mengikuti.')
    } else {
      const { error } = await supabase.from('follows')
        .insert({ follower_id: currentUser.id, following_id: targetUserId })

      if (error) throw error
      
      try {
        await supabase.from('notifications').insert({
          user_id: targetUserId,
          actor_id: currentUser.id,
          type: 'follow'
        })
      } catch (notifErr) {
        console.error('Notif insert error:', notifErr)
      }

      window.showToast('Berhasil mengikuti!')
    }

    await window.openUserProfile(targetUserId)
    loadProfile()
    loadRecommendedUsersHome()
  } catch (err) {
    window.showToast('Gagal update ikuti: ' + err.message, 'error')
  }
}

// BUKA FORM TAMBAH / EDIT BUKU
window.openBookFormById = async function(bookId = null) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu untuk menambah/mengedit buku!', 'error')

  const isAdmin = currentUser.profile?.role === 'admin'
  const modalForm = document.getElementById('modal-book-form')
  const titleEl = document.getElementById('book-form-title')
  const tabsEl = document.getElementById('book-form-tabs')
  const uploaderGroup = document.getElementById('group-uploader-type')
  
  const tabSingle = document.getElementById('tab-book-single')
  const tabBulk = document.getElementById('tab-book-bulk')
  const formBook = document.getElementById('form-book')
  const formBookBulk = document.getElementById('form-book-bulk')

  tabSingle?.classList.add('active')
  tabBulk?.classList.remove('active')
  formBook?.classList.remove('hidden')
  formBookBulk?.classList.add('hidden')

  if (uploaderGroup) uploaderGroup.style.display = isAdmin ? 'none' : 'block'

  if (bookId) {
    try {
      const { data: book } = await supabase.from('books').select('*').eq('id', bookId).single()
      if (!book) return

      if (!isAdmin && book.user_id !== currentUser.id) {
        return window.showToast('Kamu hanya bisa mengedit buku buatanmu sendiri!', 'error')
      }

      if (titleEl) titleEl.innerText = isAdmin ? 'Edit Buku' : 'Edit Buku Saya'
      if (tabsEl) tabsEl.style.display = 'none'

      document.getElementById('book-id').value = book.id
      document.getElementById('book-title').value = book.title || ''
      document.getElementById('book-author').value = book.author || ''
      document.getElementById('book-platform').value = book.platform || ''
      document.getElementById('book-genre').value = book.genre || ''
      document.getElementById('book-media-type').value = book.media_type || 'Novel'
      document.getElementById('book-status').value = book.status || 'Ongoing'
      document.getElementById('book-cover-url').value = book.cover_url || ''

      const uploaderSelect = document.getElementById('book-uploader-type')
      if (uploaderSelect) uploaderSelect.value = book.uploader_type || 'reader'

      const previews = book.preview_images || []
      if (document.getElementById('preview-img-1')) document.getElementById('preview-img-1').value = previews[0] || ''
      if (document.getElementById('preview-img-2')) document.getElementById('preview-img-2').value = previews[1] || ''
      if (document.getElementById('preview-img-3')) document.getElementById('preview-img-3').value = previews[2] || ''
      if (document.getElementById('preview-img-4')) document.getElementById('preview-img-4').value = previews[3] || ''

      if (document.getElementById('book-read-link')) document.getElementById('book-read-link').value = book.read_link || ''
      if (document.getElementById('book-read-link-2')) document.getElementById('book-read-link-2').value = book.read_link_2 || ''
      if (document.getElementById('book-buy-link')) document.getElementById('book-buy-link').value = book.buy_link || ''
      if (document.getElementById('book-synopsis')) document.getElementById('book-synopsis').value = book.synopsis || ''
    } catch (err) {
      window.showToast('Gagal memuat data buku', 'error')
    }
  } else {
    if (titleEl) titleEl.innerText = isAdmin ? 'Tambah Buku Baru' : 'Tambah Buku Baru 🚀'
    if (tabsEl) tabsEl.style.display = isAdmin ? 'flex' : 'none'
    document.getElementById('form-book')?.reset()
    const bId = document.getElementById('book-id')
    if (bId) bId.value = ''
  }

  modalForm?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-book-form')
}

// ADMIN APPROVE BUKU (+ KIKIM NOTIFIKASI BUKU TERBIT)
window.togglePublishBook = async function(bookId, currentStatus) {
  try {
    const nextStatus = !currentStatus
    const payload = { is_published: nextStatus }
    
    if (nextStatus) {
      payload.rejection_reason = null
    }

    const { error } = await supabase.from('books').update(payload).eq('id', bookId)
    if (error) throw error

    if (nextStatus) {
      const { data: book } = await supabase.from('books').select('user_id, title').eq('id', bookId).single()
      
      if (book && book.user_id) {
        await supabase.from('notifications').insert({
          user_id: book.user_id,
          actor_id: currentUser.id,
          type: 'book_approved',
          book_id: bookId
        })

        const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', book.user_id)
        if (followers && followers.length > 0) {
          const notifs = followers.map(f => ({
            user_id: f.follower_id,
            actor_id: book.user_id,
            type: 'new_book',
            book_id: bookId
          }))
          await supabase.from('notifications').insert(notifs)
        }
      }
    }

    window.showToast(nextStatus ? 'Buku disetujui & terbit ke publik! 🎉' : 'Buku disimpan ke Draft.')
    loadAdminBooksList()
    loadHomeBooks()
    loadExploreBooks()
    loadProfile()
  } catch (err) {
    window.showToast('Gagal ubah status publikasi: ' + err.message, 'error')
  }
}

// ADMIN REJECT BUKU
window.rejectBook = async function(bookId) {
  const reason = prompt('Masukkan alasan penolakan buku ini:')
  if (reason === null) return

  if (!reason.trim()) {
    return window.showToast('Alasan penolakan tidak boleh kosong!', 'error')
  }

  try {
    const { error } = await supabase.from('books').update({
      is_published: false,
      rejection_reason: reason.trim()
    }).eq('id', bookId)

    if (error) throw error

    window.showToast('Penambahan buku telah ditolak dengan alasan.')
    loadAdminBooksList()
    loadProfile()
  } catch (err) {
    window.showToast('Gagal menolak penambahan: ' + err.message, 'error')
  }
}

window.openEditBannerForm = async function(bannerId) {
  try {
    const { data: banner } = await supabase.from('banners').select('*').eq('id', bannerId).single()
    if (!banner) return

    let idInput = document.getElementById('banner-id')
    if (!idInput) {
      idInput = document.createElement('input')
      idInput.type = 'hidden'
      idInput.id = 'banner-id'
      document.getElementById('form-banner')?.appendChild(idInput)
    }
    idInput.value = banner.id

    document.getElementById('banner-title').value = banner.title || ''
    document.getElementById('banner-desc').value = banner.description || ''
    document.getElementById('banner-img-url').value = banner.image_url || ''
    document.getElementById('banner-link-url').value = banner.link_url || ''

    const submitBtn = document.getElementById('form-banner')?.querySelector('button[type="submit"]')
    if (submitBtn) submitBtn.innerText = 'Update Banner'
  } catch (err) {
    window.showToast('Gagal memuat data banner', 'error')
  }
}

window.resetBannerForm = function() {
  const formBanner = document.getElementById('form-banner')
  if (formBanner) formBanner.reset()
  const idInput = document.getElementById('banner-id')
  if (idInput) idInput.value = ''
  const submitBtn = formBanner?.querySelector('button[type="submit"]')
  if (submitBtn) submitBtn.innerText = 'Tambah Banner'
}

window.deleteBook = function(bookId) {
  window.showConfirmModal('Hapus Buku', 'Apakah kamu yakin ingin menghapus buku ini secara permanen?', async () => {
    try {
      const { error } = await supabase.from('books').delete().eq('id', bookId)
      if (error) throw error
      window.showToast('Buku berhasil dihapus!')
      document.getElementById('modal-detail')?.classList.add('hidden')
      loadHomeBooks()
      loadExploreBooks()
      loadProfile()
      if (currentUser?.profile?.role === 'admin') loadAdminBooksList()
    } catch (err) {
      window.showToast('Gagal menghapus buku: ' + err.message, 'error')
    }
  })
}

window.deleteBanner = function(id) {
  window.showConfirmModal('Hapus Banner', 'Apakah kamu yakin ingin menghapus banner ini?', async () => {
    try {
      const { error } = await supabase.from('banners').delete().eq('id', id)
      if (error) throw error
      window.showToast('Banner berhasil dihapus!')
      loadBanners()
      renderAdminBannerList()
      window.resetBannerForm()
    } catch (err) {
      window.showToast('Gagal hapus banner: ' + err.message, 'error')
    }
  })
}

window.deleteTag = function(id) {
  window.showConfirmModal('Hapus Tag', 'Yakin ingin menghapus tag/genre ini?', async () => {
    try {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
      window.showToast('Tag berhasil dihapus!')
      loadExploreTags()
      renderAdminTagList()
    } catch (err) {
      window.showToast('Gagal hapus tag: ' + err.message, 'error')
    }
  })
}

// BUKA DETAIL BUKU
window.openBookDetail = async function(bookId) {
  try {
    activeBookDetailId = bookId
    const { data: book } = await supabase.from('books').select('*').eq('id', bookId).single()
    if (!book) return

    let uploaderProfile = null
    if (book.user_id) {
      const { data: p } = await supabase.from('profiles').select('id, username, full_name, role').eq('id', book.user_id).single()
      uploaderProfile = p
    }

    let uploaderHTML = ''
    if (!book.user_id || uploaderProfile?.role === 'admin') {
      uploaderHTML = `<span style="font-size:11px; color:#cbd5e1; display:flex; align-items:center; gap:4px;">👑 Diunggah oleh <b style="color:#f8fafc;">FiksiVerse Official</b></span>`
    } else if (uploaderProfile) {
      const isWriter = book.uploader_type === 'writer'
      const badgeStyle = isWriter 
        ? 'background:rgba(168,85,247,0.25); color:#e9d5ff; border:1px solid rgba(168,85,247,0.4);' 
        : 'background:rgba(56,189,248,0.25); color:#7dd3fc; border:1px solid rgba(56,189,248,0.4);'
      const badgeLabel = isWriter ? '✍️ Writer' : '📖 Reader'

      uploaderHTML = `
        <span style="font-size:11px; color:#cbd5e1; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          Diunggah oleh <b onclick="openUserProfile('${uploaderProfile.id}')" style="color:#38bdf8; cursor:pointer;">@${sanitizeText(uploaderProfile.username)}</b>
          <span style="padding:2px 8px; font-size:10px; border-radius:9999px; font-weight:800; ${badgeStyle}">${badgeLabel}</span>
        </span>
      `
    }

    let isBookmarked = false
    let isRecommended = false

    if (currentUser) {
      const { data: bm } = await supabase.from('bookmarks').select('id').eq('user_id', currentUser.id).eq('book_id', bookId)
      isBookmarked = bm && bm.length > 0

      const { data: rec } = await supabase.from('recommendations').select('id').eq('user_id', currentUser.id).eq('book_id', bookId)
      isRecommended = rec && rec.length > 0
    }

    const { data: comments, count: commentCount } = await supabase
      .from('comments')
      .select('*, user:profiles(*)', { count: 'exact' })
      .eq('book_id', bookId)
      .order('created_at', { ascending: true })

    const isAdmin = currentUser?.profile?.role === 'admin'
    const isOwner = currentUser && (currentUser.id === book.user_id || isAdmin)
    const previews = book.preview_images || []

    const rootComments = comments ? comments.filter(c => !c.parent_id) : []
    const repliesMap = {}
    if (comments) {
      comments.forEach(c => {
        if (c.parent_id) {
          if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = []
          repliesMap[c.parent_id].push(c)
        }
      })
    }
    const topRootComments = rootComments.slice(0, 3)

    const detailContent = document.getElementById('detail-content')
    if (detailContent) {
      detailContent.innerHTML = `
        <div style="display:flex; gap:14px;">
          <div class="uncropped-cover-container" style="width:100px; height:140px; flex-shrink:0;">
            <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/120'}" class="uncropped-cover-bg">
            <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/120'}" class="uncropped-cover-img">
          </div>
          <div class="space-y-2" style="flex:1;">
            <h2 style="font-size:16px; font-weight:800; color:#f8fafc;">${sanitizeText(book.title)}</h2>
            <p style="font-size:12px; color:#c084fc; font-weight:600;">${sanitizeText(book.author)}</p>
            ${uploaderHTML}
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
              <span style="padding:2px 8px; background:rgba(168,85,247,0.2); color:#e9d5ff; font-size:10px; border-radius:9999px; font-weight:700;">
                ${sanitizeText(book.media_type)} • ${sanitizeText(book.status)}
              </span>
              ${book.platform ? `<span style="padding:2px 8px; background:rgba(56,189,248,0.2); color:#7dd3fc; font-size:10px; border-radius:9999px; font-weight:700;">📱 ${sanitizeText(book.platform)}</span>` : ''}
              ${book.genre ? `<span style="padding:2px 8px; background:rgba(255,255,255,0.05); color:#cbd5e1; font-size:10px; border-radius:9999px; font-weight:600;">🏷️ ${sanitizeText(book.genre)}</span>` : ''}
            </div>
            <div style="font-size:12px; color:#fbbf24; padding-top:2px; font-weight:700;">
              <span>⭐ ${book.recommendation_count || 0} Rekomendasi</span>
            </div>
          </div>
        </div>

        ${previews.length > 0 ? `
          <div>
            <h4 style="font-size:11px; font-weight:700; color:#cbd5e1; margin-bottom:4px;">PREVIEW / SAMPLE</h4>
            <div class="preview-gallery-grid">
              ${previews.map(url => `<img src="${sanitizeText(url)}" class="preview-gallery-img" onclick="window.open('${sanitizeText(url)}', '_blank', 'noopener,noreferrer')">`).join('')}
            </div>
          </div>
        ` : ''}

        ${isOwner ? `
          <div style="display:grid; grid-template-columns:${isAdmin ? '1fr 1fr' : '1fr'}; gap:8px; padding-top:4px;">
            <button onclick="openBookFormById('${book.id}')" style="padding:8px; border-radius:10px; font-size:11px; font-weight:700; background:rgba(99,102,241,0.2); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); cursor:pointer;">
              ✏️ Edit Buku
            </button>
            ${isAdmin ? `
              <button onclick="deleteBook('${book.id}')" style="padding:8px; border-radius:10px; font-size:11px; font-weight:700; background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); cursor:pointer;">
                🗑️ Hapus Buku
              </button>
            ` : ''}
          </div>
        ` : ''}

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; padding-top:8px;">
          <button onclick="toggleBookmark('${book.id}', ${isBookmarked})" 
            style="padding:10px 4px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid ${isBookmarked ? '#f87171' : 'rgba(255,255,255,0.1)'}; background:${isBookmarked ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}; color:${isBookmarked ? '#fca5a5' : '#cbd5e1'}; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;">
            <i class="bi bi-bookmark${isBookmarked ? '-check-fill' : ''}" style="${isBookmarked ? 'color:#f87171' : ''}"></i>
            ${isBookmarked ? 'Simpan' : 'Bookmark'}
          </button>
          
          <button onclick="toggleRecommendation('${book.id}', ${isRecommended})" 
            style="padding:10px 4px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid ${isRecommended ? '#fbbf24' : 'rgba(255,255,255,0.1)'}; background:${isRecommended ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)'}; color:${isRecommended ? '#fde047' : '#cbd5e1'}; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;">
            <i class="bi bi-star${isRecommended ? '-fill' : ''}" style="${isRecommended ? 'color:#fbbf24' : ''}"></i>
            ${isRecommended ? 'Suka' : 'Rekomendasi'}
          </button>

          <button onclick="shareBook('${book.id}')" 
            style="padding:10px 4px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid rgba(168,85,247,0.3); background:rgba(168,85,247,0.15); color:#e9d5ff; display:flex; align-items:center; justify-content:center; gap:4px; cursor:pointer;">
            <i class="bi bi-share-fill" style="color:#c084fc;"></i>
            Bagikan
          </button>
        </div>

        <div class="space-y-2" style="padding-top:8px;">
          ${book.read_link ? `
            <a href="${sanitizeText(book.read_link)}" target="_blank" rel="noopener noreferrer nofollow" class="btn-full btn-galaxy-primary" style="text-decoration:none;">
              <i class="bi bi-book"></i> Baca Buku
            </a>
          ` : ''}
          ${book.read_link_2 ? `
            <a href="${sanitizeText(book.read_link_2)}" target="_blank" rel="noopener noreferrer nofollow" class="btn-full" style="background:linear-gradient(135deg, #0284c7, #38bdf8); color:white; text-decoration:none; font-weight:700;">
              <i class="bi bi-phone"></i> Baca Sosmed Au
            </a>
          ` : ''}
          ${book.buy_link ? `
            <a href="${sanitizeText(book.buy_link)}" target="_blank" rel="noopener noreferrer nofollow" class="btn-full btn-galaxy-cyan" style="text-decoration:none;">
              <i class="bi bi-cart"></i> Beli Buku Fisik
            </a>
          ` : ''}
        </div>

        <div style="padding-top:12px; border-top:1px solid rgba(168,85,247,0.2);">
          <h4 style="font-size:12px; font-weight:700; color:#f8fafc; margin-bottom:4px;">Sinopsis</h4>
          <p style="font-size:12px; color:#cbd5e1; line-height:1.5;">${sanitizeText(book.synopsis) || 'Belum ada sinopsis.'}</p>
        </div>

        <div style="padding-top:12px; border-top:1px solid rgba(168,85,247,0.2);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h4 style="font-size:12px; font-weight:800; color:#c084fc;">💬 Komentar (${commentCount || 0})</h4>
            ${commentCount > 0 ? `
              <button onclick="openAllCommentsModal('${book.id}')" style="background:transparent; color:#38bdf8; border:none; font-size:11px; font-weight:700; cursor:pointer;">
                Lihat Semua (${commentCount}) »
              </button>
            ` : ''}
          </div>

          <form id="form-quick-comment" style="display:flex; gap:6px; margin-bottom:10px;">
            <input type="text" id="quick-comment-input" placeholder="Tulis komentar..." class="form-input" style="font-size:11px; padding:8px 12px;" required>
            <button type="submit" class="btn-galaxy-primary" style="padding:0 14px; font-size:11px; font-weight:700; flex-shrink:0;">Kirim</button>
          </form>

          <div class="space-y-2">
            ${topRootComments.length === 0 ? `<p style="font-size:11px; color:#94a3b8;">Belum ada komentar. Jadi yang pertama berkomentar!</p>` : ''}
            ${topRootComments.map(c => renderCommentItemHTML(c, book.id, repliesMap[c.id] || [])).join('')}
          </div>
        </div>
      `

      document.getElementById('form-quick-comment')?.addEventListener('submit', async (e) => {
        e.preventDefault()
        const input = document.getElementById('quick-comment-input')
        if (!input || !input.value.trim()) return
        await submitComment(book.id, input.value.trim())
      })
    }
    document.getElementById('modal-detail')?.classList.remove('hidden')
    pushHistoryState('modal', 'modal-detail')
  } catch(e) {
    window.showToast('Gagal membuka detail buku', 'error')
  }
}

// TOGGLE FORM BALASAN INLINE
window.toggleReplyForm = function(commentId) {
  const form = document.getElementById(`reply-form-${commentId}`)
  if (form) {
    form.classList.toggle('hidden')
  }
}

// SUBMIT BALASAN KOMENTAR
window.handleReplySubmit = async function(e, bookId, parentId) {
  e.preventDefault()
  const input = document.getElementById(`input-reply-form-${parentId}`)
  if (!input || !input.value.trim()) return
  await submitComment(bookId, input.value.trim(), parentId)
}

function renderCommentItemHTML(c, bookId, replies = []) {
  const isMine = currentUser && currentUser.id === c.user_id
  const isAdmin = currentUser?.profile?.role === 'admin'
  const canDelete = isMine || isAdmin
  const replyInputId = `reply-form-${c.id}`

  return `
    <div style="background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:10px; border:1px solid rgba(168,85,247,0.15); margin-bottom:6px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div style="display:flex; align-items:center; gap:8px; cursor:pointer;" onclick="openUserProfile('${c.user_id}')">
          <img src="${sanitizeText(c.user?.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + c.user_id}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; border:1px solid #a855f7;">
          <span style="font-size:11px; font-weight:700; color:#f8fafc;">@${sanitizeText(c.user?.username || 'user')}</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:9px; color:#94a3b8;">${new Date(c.created_at).toLocaleDateString('id-ID')}</span>
          ${canDelete ? `
            <button onclick="deleteComment('${c.id}', '${bookId}')" title="Hapus Komentar" style="background:transparent; border:none; color:#f87171; font-size:11px; cursor:pointer; padding:2px;">
              🗑️
            </button>
          ` : ''}
          ${!isMine ? `
            <button onclick="openReportModal('${c.id}', '${bookId}')" title="Laporkan Komentar" style="background:transparent; border:none; color:#f87171; font-size:11px; cursor:pointer; padding:2px;">
              📫
            </button>
          ` : ''}
        </div>
      </div>
      <p style="font-size:11px; color:#cbd5e1; margin-top:4px; line-height:1.4;">${sanitizeText(c.content)}</p>

      <div style="display:flex; justify-content:flex-end; margin-top:4px;">
        <button onclick="window.toggleReplyForm('${c.id}')" style="background:transparent; border:none; color:#38bdf8; font-size:10px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
          <i class="bi bi-reply-fill"></i> Balas
        </button>
      </div>

      <div id="${replyInputId}" class="hidden" style="margin-top:6px; padding-top:6px; border-top:1px dashed rgba(168,85,247,0.2);">
        <form onsubmit="window.handleReplySubmit(event, '${bookId}', '${c.id}')" style="display:flex; gap:6px;">
          <input type="text" id="input-${replyInputId}" placeholder="Balas @${sanitizeText(c.user?.username || 'user')}..." class="form-input" style="font-size:10px; padding:6px 10px;" required>
          <button type="submit" class="btn-galaxy-primary" style="padding:0 10px; font-size:10px; font-weight:700; flex-shrink:0;">Kirim</button>
        </form>
      </div>

      ${replies.length > 0 ? `
        <div style="margin-top:8px; padding-left:10px; border-left:2px solid rgba(168,85,247,0.3);" class="space-y-2">
          ${replies.map(r => `
            <div style="background:rgba(255,255,255,0.02); padding:6px 8px; border-radius:8px; border:1px solid rgba(168,85,247,0.1);">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="openUserProfile('${r.user_id}')">
                  <img src="${sanitizeText(r.user?.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + r.user_id}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; border:1px solid #a855f7;">
                  <span style="font-size:10px; font-weight:700; color:#f8fafc;">@${sanitizeText(r.user?.username || 'user')}</span>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <span style="font-size:8px; color:#94a3b8;">${new Date(r.created_at).toLocaleDateString('id-ID')}</span>
                  ${(currentUser && (currentUser.id === r.user_id || isAdmin)) ? `
                    <button onclick="deleteComment('${r.id}', '${bookId}')" title="Hapus Balasan" style="background:transparent; border:none; color:#f87171; font-size:10px; cursor:pointer; padding:2px;">
                      🗑️
                    </button>
                  ` : ''}
                </div>
              </div>
              <p style="font-size:10px; color:#cbd5e1; margin-top:2px; line-height:1.3;">${sanitizeText(r.content)}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `
}

// SIMPAN KOMENTAR & KIRIM NOTIFIKASI OTOMATIS
window.submitComment = async function(bookId, content, parentId = null) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu untuk berkomentar!', 'error')

  try {
    const payload = {
      book_id: bookId,
      user_id: currentUser.id,
      content: content
    }
    if (parentId) payload.parent_id = parentId

    const { error } = await supabase.from('comments').insert(payload)
    if (error) throw error

    if (parentId) {
      const { data: parentComm } = await supabase.from('comments').select('user_id').eq('id', parentId).single()
      if (parentComm && parentComm.user_id && parentComm.user_id !== currentUser.id) {
        await supabase.from('notifications').insert({
          user_id: parentComm.user_id,
          actor_id: currentUser.id,
          type: 'reply',
          book_id: bookId
        })
      }
    } else {
      const { data: bookData } = await supabase.from('books').select('user_id').eq('id', bookId).single()
      if (bookData && bookData.user_id && bookData.user_id !== currentUser.id) {
        await supabase.from('notifications').insert({
          user_id: bookData.user_id,
          actor_id: currentUser.id,
          type: 'comment',
          book_id: bookId
        })
      }
    }

    window.showToast(parentId ? 'Balasan berhasil dikirim! 💬' : 'Komentar berhasil dikirim! 💬')
    
    if (activeBookDetailId) window.openBookDetail(activeBookDetailId)

    const modalAll = document.getElementById('modal-all-comments')
    if (modalAll && !modalAll.classList.contains('hidden')) {
      window.openAllCommentsModal(bookId)
    }
  } catch (err) {
    window.showToast('Gagal mengirim komentar: ' + err.message, 'error')
  }
}

window.deleteComment = function(commentId, bookId) {
  window.showConfirmModal('Hapus Komentar', 'Apakah kamu yakin ingin menghapus komentar/balasan ini?', async () => {
    try {
      const { error } = await supabase.from('comments').delete().eq('id', commentId)
      if (error) throw error

      window.showToast('Komentar berhasil dihapus!')
      if (activeBookDetailId) window.openBookDetail(activeBookDetailId)

      const modalAll = document.getElementById('modal-all-comments')
      if (modalAll && !modalAll.classList.contains('hidden')) {
        window.openAllCommentsModal(bookId)
      }
    } catch (err) {
      window.showToast('Gagal menghapus komentar: ' + err.message, 'error')
    }
  })
}

window.openReportModal = function(commentId, bookId) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')

  document.getElementById('report-comment-id').value = commentId
  document.getElementById('report-book-id').value = bookId
  document.getElementById('report-reason-input').value = ''
  
  const modalReport = document.getElementById('modal-report')
  modalReport?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-report')
}

function setupReportModal() {
  const modalReport = document.getElementById('modal-report')
  const btnClose = document.getElementById('close-modal-report')
  const btnCancel = document.getElementById('btn-cancel-report')
  const btnSubmit = document.getElementById('btn-submit-report')

  const closeModal = () => modalReport?.classList.add('hidden')

  btnClose?.addEventListener('click', closeModal)
  btnCancel?.addEventListener('click', closeModal)

  btnSubmit?.addEventListener('click', async () => {
    const commentId = document.getElementById('report-comment-id').value
    const bookId = document.getElementById('report-book-id').value
    const reason = document.getElementById('report-reason-input').value.trim()

    if (!reason) return window.showToast('Alasan pelaporan tidak boleh kosong!', 'error')

    try {
      const { error } = await supabase.from('comment_reports').insert({
        comment_id: commentId,
        reporter_id: currentUser.id,
        reason: reason
      })

      if (error) throw error

      const { data: adminProfiles } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (adminProfiles && adminProfiles.length > 0) {
        const notifs = adminProfiles.map(a => ({
          user_id: a.id,
          actor_id: currentUser.id,
          type: 'comment_report',
          book_id: bookId
        }))
        await supabase.from('notifications').insert(notifs)
      }

      window.showToast('Laporan berhasil dikirim ke Admin! 🛡️')
      closeModal()
    } catch (err) {
      window.showToast('Gagal mengirim laporan: ' + err.message, 'error')
    }
  })
}

window.openAllCommentsModal = async function(bookId) {
  const modal = document.getElementById('modal-all-comments')
  const container = document.getElementById('all-comments-list')
  if (!container) return

  container.innerHTML = `<p style="font-size:11px; color:#94a3b8; text-align:center;">Memuat semua komentar...</p>`
  modal?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-all-comments')

  try {
    const { data: comments } = await supabase
      .from('comments')
      .select('*, user:profiles(*)')
      .eq('book_id', bookId)
      .order('created_at', { ascending: true })

    if (!comments || comments.length === 0) {
      container.innerHTML = `<p style="font-size:11px; color:#94a3b8; text-align:center; padding:12px 0;">Belum ada komentar.</p>`
    } else {
      const rootComments = comments.filter(c => !c.parent_id)
      const repliesMap = {}
      comments.forEach(c => {
        if (c.parent_id) {
          if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = []
          repliesMap[c.parent_id].push(c)
        }
      })

      container.innerHTML = rootComments.map(c => renderCommentItemHTML(c, bookId, repliesMap[c.id] || [])).join('')
    }

    const fullForm = document.getElementById('form-full-comment')
    if (fullForm) {
      const newForm = fullForm.cloneNode(true)
      fullForm.parentNode.replaceChild(newForm, fullForm)

      newForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        const input = document.getElementById('full-comment-input')
        if (!input || !input.value.trim()) return
        await submitComment(bookId, input.value.trim())
        input.value = ''
        window.openAllCommentsModal(bookId)
      })
    }
  } catch (err) {
    container.innerHTML = `<p style="font-size:11px; color:#f87171; text-align:center;">Gagal memuat komentar.</p>`
  }
}

window.toggleBookmark = async function(bookId, isBookmarked) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')
  try {
    if (isBookmarked) await supabase.from('bookmarks').delete().eq('user_id', currentUser.id).eq('book_id', bookId)
    else await supabase.from('bookmarks').insert({ user_id: currentUser.id, book_id: bookId })
    window.openBookDetail(bookId)
    loadHomeBooks()
    loadUserBookmarks()
    loadProfile()
  } catch(e) {
    window.showToast('Gagal update bookmark', 'error')
  }
}

window.toggleRecommendation = async function(bookId, isRecommended) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')
  try {
    if (isRecommended) {
      await supabase.from('recommendations').delete().eq('user_id', currentUser.id).eq('book_id', bookId)
    } else {
      await supabase.from('recommendations').insert({ user_id: currentUser.id, book_id: bookId })
      const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', currentUser.id)
      if (followers && followers.length > 0) {
        const notifs = followers.map(f => ({
          user_id: f.follower_id,
          actor_id: currentUser.id,
          type: 'recommendation',
          book_id: bookId
        }))
        await supabase.from('notifications').insert(notifs)
      }
    }
    window.openBookDetail(bookId)
    loadHomeBooks()
    loadUserRecommendations()
    loadProfile()
  } catch(e) {
    window.showToast('Gagal update rekomendasi', 'error')
  }
}

window.openSocialModal = async function(type) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')
  const modalSocial = document.getElementById('modal-social')
  const title = document.getElementById('social-modal-title')
  const container = document.getElementById('social-list-container')

  if (title) title.innerText = type === 'followers' ? 'Pengikut' : 'Mengikuti'
  modalSocial?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-social')

  let query
  if (type === 'followers') {
    query = supabase.from('follows').select('user:profiles!follows_follower_id_fkey(*)').eq('following_id', currentUser.id)
  } else {
    query = supabase.from('follows').select('user:profiles!follows_following_id_fkey(*)').eq('follower_id', currentUser.id)
  }

  const { data: list } = await query

  if (!list || list.length === 0) {
    if (container) container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:16px 0;">Belum ada ${type === 'followers' ? 'pengikut' : 'yang diikuti'}.</p>`
    return
  }

  if (container) {
    container.innerHTML = list.map(item => `
      <div class="user-item" onclick="openUserProfile('${item.user?.id}')" style="cursor:pointer; padding:8px; border-radius:10px; display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${sanitizeText(item.user?.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + item.user?.id}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid #a855f7;">
          <div>
            <h4 style="font-size:12px; font-weight:700; color:#f8fafc;">${sanitizeText(item.user?.full_name) || 'User'}</h4>
            <p style="font-size:10px; color:#38bdf8;">@${sanitizeText(item.user?.username) || 'user'}</p>
          </div>
        </div>
        <i class="bi bi-chevron-right" style="color:#c084fc; font-size:12px;"></i>
      </div>
    `).join('')
  }
}

// ==========================================
// 2. MAIN INISIALISASI SAAT DOM READY
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation()
  setupAuthModal()
  setupBookFormModal()
  setupAuFormEvents()
  setupBannerFormModal()
  setupTagFormModal()
  setupNotifAndSocialModal()
  setupEditProfileModal()
  setupConfirmModalEvents()
  setupReportModal()
  setupMobileBackNavigation()

  initAppData()
})

function setupMobileBackNavigation() {
  window.addEventListener('popstate', (e) => {
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)')
    if (openModals.length > 0) {
      openModals.forEach(modal => modal.classList.add('hidden'))
      return
    }

    const activeTab = document.querySelector('.tab-content:not(.hidden)')
    if (activeTab && activeTab.id !== 'tab-home') {
      window.switchTab('tab-home', false)
    }
  })
}

async function initAppData() {
  try {
    currentUser = await getCurrentUser()
  } catch(e) {
    console.log('User session status:', e)
  }

  setupAuthUI()
  
  loadBanners().catch(err => console.log('Error banner:', err))
  loadExploreTags().catch(err => console.log('Error explore tags:', err))
  loadRecommendedUsersHome().catch(err => console.log('Error rec users:', err))
  loadAuStories().catch(err => console.log('Error AU stories:', err))
  loadHomeBooks().catch(err => console.log('Error home books:', err))
  loadExploreBooks().catch(err => console.log('Error explore books:', err))
  loadProfile().catch(err => console.log('Error profile:', err))

  if (currentUser) {
    loadUserBookmarks().catch(err => console.log('Error bookmarks:', err))
    loadUserRecommendations().catch(err => console.log('Error recommendations:', err))
    checkUnreadNotifications().catch(err => console.log('Error notifs:', err))
  } else {
    const bmList = document.getElementById('list-bookmark')
    const recList = document.getElementById('list-user-recommended')
    if (bmList) bmList.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column: span 2; text-align:center; padding:16px 0;">Silakan login untuk melihat simpanan bookmark kamu.</p>`
    if (recList) recList.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column: span 2; text-align:center; padding:16px 0;">Silakan login untuk melihat daftar rekomendasimu.</p>`
  }

  const urlParams = new URLSearchParams(window.location.search)
  const sharedBookId = urlParams.get('book')
  const sharedAuId = urlParams.get('au')

  if (sharedBookId) {
    window.openBookDetail(sharedBookId)
  } else if (sharedAuId) {
    window.openAuDetail(sharedAuId)
  }
}

// ==========================================
// 3. SETUP EVENT LISTENERS & MODALS
// ==========================================
function setupConfirmModalEvents() {
  document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => {
    document.getElementById('modal-confirm')?.classList.add('hidden')
  })
  document.getElementById('btn-confirm-action')?.addEventListener('click', async () => {
    document.getElementById('modal-confirm')?.classList.add('hidden')
    if (onConfirmCallback) await onConfirmCallback()
  })
}

function setupAuthUI() {
  const authContainer = document.getElementById('auth-btn-container')
  const notifBtn = document.getElementById('btn-open-notif')

  if (currentUser && authContainer) {
    notifBtn?.classList.remove('hidden')
    authContainer.innerHTML = `
      <img src="${sanitizeText(currentUser.profile?.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + currentUser.id}" 
        style="width:34px; height:34px; border-radius:50%; border:2px solid #a855f7; cursor:pointer; object-fit:cover;" id="top-avatar">
    `
    document.getElementById('top-avatar')?.addEventListener('click', () => window.switchTab('tab-profile'))
  }
}

function setupEditProfileModal() {
  const modalEdit = document.getElementById('modal-edit-profile')
  const btnClose = document.getElementById('close-modal-edit-profile')
  const formEdit = document.getElementById('form-edit-profile')

  const inputFullname = document.getElementById('edit-fullname')
  const inputUsername = document.getElementById('edit-username')
  const inputBio = document.getElementById('edit-bio')

  btnClose?.addEventListener('click', () => modalEdit?.classList.add('hidden'))

  const updateCounts = () => {
    if (inputFullname) document.getElementById('count-fullname').innerText = `${inputFullname.value.length}/30`
    if (inputUsername) document.getElementById('count-username').innerText = `${inputUsername.value.length}/20`
    if (inputBio) document.getElementById('count-bio').innerText = `${inputBio.value.length}/150`
  }

  inputFullname?.addEventListener('input', updateCounts)
  inputUsername?.addEventListener('input', updateCounts)
  inputBio?.addEventListener('input', updateCounts)

  formEdit?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!currentUser) return
    const cleanUsername = inputUsername.value.trim().replace(/\s+/g, '').toLowerCase()

    const updates = {
      full_name: inputFullname.value.trim(),
      username: cleanUsername,
      avatar_url: document.getElementById('edit-avatar-url').value.trim() || null,
      bio: inputBio.value.trim() || null
    }

    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id)
      if (error) throw error

      window.showToast('Profil Galaxy berhasil diperbarui!')
      modalEdit?.classList.add('hidden')
      
      currentUser.profile = { ...currentUser.profile, ...updates }
      setupAuthUI()
      loadProfile()
    } catch (err) {
      window.showToast('Gagal update profil: ' + err.message, 'error')
    }
  })
}

function setupAuthModal() {
  const modalAuth = document.getElementById('modal-auth')
  const btnOpen = document.getElementById('btn-open-login')
  const btnClose = document.getElementById('close-modal-auth')
  const tabLogin = document.getElementById('tab-auth-login')
  const tabReg = document.getElementById('tab-auth-register')
  const formLogin = document.getElementById('form-login')
  const formReg = document.getElementById('form-register')

  btnOpen?.addEventListener('click', () => {
    modalAuth?.classList.remove('hidden')
    pushHistoryState('modal', 'modal-auth')
  })
  btnClose?.addEventListener('click', () => modalAuth?.classList.add('hidden'))

  tabLogin?.addEventListener('click', () => {
    tabLogin.classList.add('active')
    tabReg?.classList.remove('active')
    formLogin?.classList.remove('hidden')
    formReg?.classList.add('hidden')
  })

  tabReg?.addEventListener('click', () => {
    tabReg.classList.add('active')
    tabLogin?.classList.remove('active')
    formReg?.classList.remove('hidden')
    formLogin?.classList.add('hidden')
  })

  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await loginWithEmail(document.getElementById('login-email').value, document.getElementById('login-password').value)
      modalAuth?.classList.add('hidden')
      window.showToast('Login berhasil!')
      setTimeout(() => window.location.reload(), 1000)
    } catch (err) {
      window.showToast('Gagal Login: ' + err.message, 'error')
    }
  })

  formReg?.addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await signUpWithEmail(document.getElementById('reg-email').value, document.getElementById('reg-password').value, document.getElementById('reg-fullname').value)
      modalAuth?.classList.add('hidden')
      window.showToast('Registrasi berhasil! Silakan login.')
    } catch (err) {
      window.showToast('Gagal Pendaftaran: ' + err.message, 'error')
    }
  })
}

function setupAuFormEvents() {
  const formAu = document.getElementById('form-au')
  const btnCloseAu = document.getElementById('close-modal-au-form')
  const btnAddPart = document.getElementById('btn-add-au-part')
  
  btnCloseAu?.addEventListener('click', () => document.getElementById('modal-au-form')?.classList.add('hidden'))
  btnAddPart?.addEventListener('click', () => document.getElementById('au-parts-container')?.insertAdjacentHTML('beforeend', window.createAuPartInput()))

  formAu?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')

    const id = document.getElementById('au-id').value
    const isAdmin = currentUser?.profile?.role === 'admin'
    const partInputs = document.querySelectorAll('.au-part-url')
    const partsData = Array.from(partInputs).map((input, index) => ({
      part: index + 1,
      url: input.value.trim()
    })).filter(p => p.url !== '')

    if (partsData.length === 0) return window.showToast('Minimal masukkan 1 URL part!', 'error')

    const payload = {
      title: document.getElementById('au-title').value,
      author: document.getElementById('au-author').value,
      platform: document.getElementById('au-platform').value,
      cover_url: document.getElementById('au-cover-url').value,
      parts: partsData,
      user_id: currentUser.id,
      uploader_type: isAdmin ? null : (document.getElementById('au-uploader-type')?.value || 'reader')
    }

    try {
      if (id) {
        const { error } = await supabase.from('stories').update(payload).eq('id', id)
        if (error) throw error
        window.showToast('AU berhasil diperbarui!')
      } else {
        const { error } = await supabase.from('stories').insert(payload)
        if (error) throw error
        window.showToast('AU baru berhasil ditambahkan!')
      }
      document.getElementById('modal-au-form')?.classList.add('hidden')
      formAu.reset()
      loadAuStories()
      loadProfile()
    } catch (err) {
      window.showToast('Gagal menyimpan AU: ' + err.message, 'error')
    }
  })
}

function setupBannerFormModal() {
  const modalBanner = document.getElementById('modal-banner-form')
  const btnClose = document.getElementById('close-modal-banner-form')
  const formBanner = document.getElementById('form-banner')

  btnClose?.addEventListener('click', () => {
    modalBanner?.classList.add('hidden')
    window.resetBannerForm()
  })

  formBanner?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const bannerId = document.getElementById('banner-id')?.value

    const payload = {
      title: document.getElementById('banner-title').value,
      description: document.getElementById('banner-desc').value || null,
      image_url: document.getElementById('banner-img-url').value,
      link_url: document.getElementById('banner-link-url').value || null
    }

    try {
      if (bannerId) {
        const { error } = await supabase.from('banners').update(payload).eq('id', bannerId)
        if (error) throw error
        window.showToast('Banner berhasil diperbarui!')
      } else {
        const { error } = await supabase.from('banners').insert(payload)
        if (error) throw error
        window.showToast('Banner baru berhasil ditambahkan!')
      }

      window.resetBannerForm()
      loadBanners()
      renderAdminBannerList()
    } catch (err) {
      window.showToast('Gagal simpan banner: ' + err.message, 'error')
    }
  })
}

function setupTagFormModal() {
  const modalTag = document.getElementById('modal-tag-form')
  const btnClose = document.getElementById('close-modal-tag-form')
  const formTag = document.getElementById('form-tag')

  btnClose?.addEventListener('click', () => modalTag?.classList.add('hidden'))

  formTag?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const tagName = document.getElementById('tag-name')?.value.trim()

    if (!tagName) return

    try {
      const { error } = await supabase.from('tags').insert({ name: tagName })
      if (error) throw error

      window.showToast('Tag berhasil ditambahkan!')
      formTag.reset()
      loadExploreTags()
      renderAdminTagList()
    } catch (err) {
      window.showToast('Gagal tambah tag: ' + err.message, 'error')
    }
  })
}

function setupBookFormModal() {
  const modalForm = document.getElementById('modal-book-form')
  const btnClose = document.getElementById('close-modal-book-form')
  const formBook = document.getElementById('form-book')
  const formBookBulk = document.getElementById('form-book-bulk')
  
  const tabSingle = document.getElementById('tab-book-single')
  const tabBulk = document.getElementById('tab-book-bulk')
  const btnFillTemplate = document.getElementById('btn-fill-template')

  btnClose?.addEventListener('click', () => modalForm?.classList.add('hidden'))

  tabSingle?.addEventListener('click', () => {
    tabSingle.classList.add('active')
    tabBulk?.classList.remove('active')
    formBook?.classList.remove('hidden')
    formBookBulk?.classList.add('hidden')
  })

  tabBulk?.addEventListener('click', () => {
    tabBulk.classList.add('active')
    tabSingle?.classList.remove('active')
    formBookBulk?.classList.remove('hidden')
    formBook?.classList.add('hidden')
  })

  btnFillTemplate?.addEventListener('click', () => {
    const template = [
      {
        "title": "Solo Leveling",
        "author": "Chugong",
        "platform": "KakaoPage",
        "genre": "Action, Fantasy",
        "media_type": "Komik",
        "status": "Completed",
        "uploader_type": "reader",
        "is_published": true,
        "cover_url": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500",
        "read_link": "https://kakao.com/solo-leveling",
        "read_link_2": "https://x.com/solo_leveling_au",
        "buy_link": "https://tokopedia.com/komik-solo-leveling",
        "synopsis": "Sung Jinwoo pemburu terlemah menjadi terkuat."
      }
    ]
    const bulkInput = document.getElementById('bulk-json-input')
    if (bulkInput) bulkInput.value = JSON.stringify(template, null, 2)
  })

  formBook?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const id = document.getElementById('book-id').value
    const isAdmin = currentUser?.profile?.role === 'admin'
    
    const p1 = document.getElementById('preview-img-1')?.value.trim() || ''
    const p2 = document.getElementById('preview-img-2')?.value.trim() || ''
    const p3 = document.getElementById('preview-img-3')?.value.trim() || ''
    const p4 = document.getElementById('preview-img-4')?.value.trim() || ''
    const previewImagesArr = [p1, p2, p3, p4].filter(url => url !== '')

    const payload = {
      title: document.getElementById('book-title').value,
      author: document.getElementById('book-author').value,
      platform: document.getElementById('book-platform').value.trim() || null,
      genre: document.getElementById('book-genre').value || null,
      media_type: document.getElementById('book-media-type').value,
      status: document.getElementById('book-status').value,
      cover_url: document.getElementById('book-cover-url').value,
      preview_images: previewImagesArr,
      read_link: document.getElementById('book-read-link').value || null,
      read_link_2: document.getElementById('book-read-link-2')?.value || null,
      buy_link: document.getElementById('book-buy-link').value || null,
      synopsis: document.getElementById('book-synopsis').value,
      uploader_type: isAdmin ? null : (document.getElementById('book-uploader-type')?.value || 'reader')
    }

    try {
      if (id) {
        if (!isAdmin) {
          payload.is_published = false
          payload.rejection_reason = null
        }

        const { error } = await supabase.from('books').update(payload).eq('id', id)
        if (error) throw error

        if (isAdmin) {
          window.showToast('Buku berhasil diperbarui!')
        } else {
          window.showToast('Perubahan disimpan! Buku kamu akan ditinjau Admin kembali sebelum terbit. ⏳')
        }
      } else {
        payload.user_id = isAdmin ? null : (currentUser?.id || null)
        payload.is_published = isAdmin ? true : false

        const { data: newBook, error } = await supabase.from('books').insert(payload).select().single()
        if (error) throw error

        if (isAdmin) {
          const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', currentUser.id)
          if (followers && followers.length > 0 && newBook) {
            const notifs = followers.map(f => ({
              user_id: f.follower_id,
              actor_id: currentUser.id,
              type: 'new_book',
              book_id: newBook.id
            }))
            await supabase.from('notifications').insert(notifs)
          }
          window.showToast('Buku baru berhasil ditambahkan & terbit!')
        } else {
          window.showToast('Buku berhasil ditambahkan! Menunggu verifikasi Admin 🚀')
        }
      }

      modalForm?.classList.add('hidden')
      document.getElementById('modal-detail')?.classList.add('hidden')
      formBook.reset()
      
      if (isAdmin) loadAdminBooksList()
      loadHomeBooks()
      loadExploreBooks()
      loadProfile()
    } catch (err) {
      window.showToast('Gagal menyimpan buku: ' + err.message, 'error')
    }
  })

  formBookBulk?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const jsonStr = document.getElementById('bulk-json-input')?.value.trim()
    const isAdmin = currentUser?.profile?.role === 'admin'

    if (!jsonStr) return window.showToast('Masukkan data JSON terlebih dahulu!', 'error')

    try {
      const booksArray = JSON.parse(jsonStr)

      if (!Array.isArray(booksArray) || booksArray.length === 0) {
        throw new Error('Format harus berupa Array JSON [...] dan tidak boleh kosong.')
      }

      const formattedPayload = booksArray.map((b, i) => {
        if (!b.title || !b.author || !b.cover_url) {
          throw new Error(`Buku ke-${i + 1} tidak lengkap! Wajib isi title, author, dan cover_url.`)
        }
        return {
          title: b.title,
          author: b.author,
          cover_url: b.cover_url,
          platform: b.platform || null,
          genre: b.genre || null,
          media_type: b.media_type || 'Novel',
          status: b.status || 'Ongoing',
          uploader_type: b.uploader_type || 'reader',
          is_published: b.is_published !== undefined ? b.is_published : true,
          synopsis: b.synopsis || null,
          read_link: b.read_link || null,
          read_link_2: b.read_link_2 || null,
          buy_link: b.buy_link || null,
          preview_images: Array.isArray(b.preview_images) ? b.preview_images : [],
          user_id: isAdmin ? null : (currentUser?.id || null)
        }
      })

      const { error } = await supabase.from('books').insert(formattedPayload)
      if (error) throw error

      window.showToast(`Berhasil menambahkan ${formattedPayload.length} buku sekaligus!`)
      modalForm?.classList.add('hidden')
      document.getElementById('bulk-json-input').value = ''
      
      loadHomeBooks()
      loadExploreBooks()
      loadProfile()
    } catch (err) {
      window.showToast('Import Gagal: ' + err.message, 'error')
    }
  })
}

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => window.switchTab(btn.getAttribute('data-tab')))
  })

  document.getElementById('home-search-trigger')?.addEventListener('click', () => window.switchTab('tab-explore'))
  document.getElementById('close-modal-detail')?.addEventListener('click', () => document.getElementById('modal-detail')?.classList.add('hidden'))
  document.getElementById('close-modal-user-profile')?.addEventListener('click', () => document.getElementById('modal-user-profile')?.classList.add('hidden'))

  const modeBooksBtn = document.getElementById('explore-mode-books')
  const modeUsersBtn = document.getElementById('explore-mode-users')
  const booksFilterCard = document.getElementById('explore-books-filter')
  const listBooks = document.getElementById('list-explore')
  const listUsers = document.getElementById('list-explore-users')
  const searchInput = document.getElementById('explore-search')

  modeBooksBtn?.addEventListener('click', () => {
    exploreSearchMode = 'books'
    modeBooksBtn.classList.add('active')
    modeUsersBtn?.classList.remove('active')
    booksFilterCard?.classList.remove('hidden')
    listBooks?.classList.remove('hidden')
    listUsers?.classList.add('hidden')
    if (searchInput) searchInput.placeholder = "Ketik judul, penulis, atau tag..."
    loadExploreBooks()
  })

  modeUsersBtn?.addEventListener('click', () => {
    exploreSearchMode = 'users'
    modeUsersBtn.classList.add('active')
    modeBooksBtn?.classList.remove('active')
    booksFilterCard?.classList.add('hidden')
    listBooks?.classList.add('hidden')
    listUsers?.classList.remove('hidden')
    if (searchInput) searchInput.placeholder = "Ketik nama lengkap atau username..."
    loadExploreUsers()
  })

  document.querySelectorAll('.filter-media-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-media-btn').forEach(b => b.classList.remove('active'))
      e.target.classList.add('active')
      currentMediaFilter = e.target.getAttribute('data-value')
      loadExploreBooks()
    })
  })

  document.getElementById('explore-search')?.addEventListener('input', () => {
    if (exploreSearchMode === 'books') loadExploreBooks()
    else loadExploreUsers()
  })
}

function setupNotifAndSocialModal() {
  const modalNotif = document.getElementById('modal-notif')
  const btnOpenNotif = document.getElementById('btn-open-notif')
  const btnCloseNotif = document.getElementById('close-modal-notif')

  const modalSocial = document.getElementById('modal-social')
  const btnCloseSocial = document.getElementById('close-modal-social')

  btnOpenNotif?.addEventListener('click', async () => {
    modalNotif?.classList.remove('hidden')
    pushHistoryState('modal', 'modal-notif')
    await loadNotifications()
    await markNotificationsRead()
  })

  btnCloseNotif?.addEventListener('click', () => modalNotif?.classList.add('hidden'))
  btnCloseSocial?.addEventListener('click', () => modalSocial?.classList.add('hidden'))
}

// ==========================================
// 4. DATA FETCHING & RENDERING
// ==========================================

// FUNGSI LOAD DATA DARI TABEL STORIES (AU CATALOG)
async function loadAuStories() {
  const container = document.getElementById('list-au-stories')
  if (!container) return

  try {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!stories || stories.length === 0) {
      container.innerHTML = `<p style="font-size:11px; color:#94a3b8; padding:8px 0;">Belum ada cerita AU.</p>`
      return
    }

    container.innerHTML = stories.map(story => {
      const isAdmin = currentUser?.profile?.role === 'admin'
      const isOwner = currentUser && (currentUser.id === story.user_id || isAdmin)
      
      let actionButtons = ''
      if (isOwner) {
        actionButtons = `
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button onclick="event.stopPropagation(); window.openAuFormById('${story.id}')" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:4px 8px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer; flex:1;">✏️ Edit</button>
            <button onclick="event.stopPropagation(); window.deleteAu('${story.id}')" style="background:rgba(239,68,68,0.25); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); padding:4px 8px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer; flex:1;">🗑️ Hapus</button>
          </div>
        `
      }

      return `
        <div class="book-card-horizontal" style="display:flex; flex-direction:column;" onclick="openAuDetail('${story.id}')">
          <div class="uncropped-cover-container">
            <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
            <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(story.title)}">
            <span class="book-badge">${sanitizeText(story.platform || 'AU')}</span>
          </div>
          <div class="book-info" style="flex:1; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h3 class="book-title">${sanitizeText(story.title)}</h3>
              <p class="book-author">${sanitizeText(story.author)}</p>
              <div class="book-stats">
                <span>📖 ${story.parts ? story.parts.length : 0} Part</span>
              </div>
            </div>
            ${actionButtons}
          </div>
        </div>
      `
    }).join('')
  } catch (err) {
    console.error('Gagal memuat AU Stories:', err.message)
  }
}

async function loadBanners() {
  const { data: banners } = await supabase.from('banners').select('*').order('created_at', { ascending: false })
  const slider = document.getElementById('banner-slider')
  const dotsContainer = document.getElementById('banner-dots')
  const wrapper = document.querySelector('.banner-carousel-wrapper')

  if (!slider || !banners || banners.length === 0) return

  slider.innerHTML = banners.map(b => `
    <div class="banner-item" ${b.link_url ? `onclick="window.open('${sanitizeText(b.link_url)}', '_blank', 'noopener,noreferrer')"` : ''} style="cursor: ${b.link_url ? 'pointer' : 'default'};">
      <img src="${sanitizeText(b.image_url)}" class="banner-bg-blur">
      <img src="${sanitizeText(b.image_url)}" class="banner-img-front">
      <div class="banner-overlay"></div>
      <div class="banner-content">
        <span class="banner-tag">Info / Event</span>
        <h3 style="font-size:15px; font-weight:800; color:white;">${sanitizeText(b.title)}</h3>
        <p style="font-size:11px; color:#cbd5e1;">${sanitizeText(b.description) || ''}</p>
      </div>
    </div>
  `).join('')

  window.goToBanner = function(index) {
    currentSlideIndex = index
    slider.style.transform = `translateX(-${currentSlideIndex * 100}%)`
    document.querySelectorAll('.banner-dot').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentSlideIndex)
    })
    resetBannerTimer(banners.length)
  }

  if (dotsContainer) {
    dotsContainer.innerHTML = banners.map((_, i) => `
      <div class="banner-dot ${i === 0 ? 'active' : ''}" onclick="window.goToBanner(${i})"></div>
    `).join('')
  }

  if (wrapper && !wrapper.dataset.swipeBound) {
    wrapper.dataset.swipeBound = 'true'

    wrapper.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX
      stopBannerTimer()
    }, { passive: true })

    wrapper.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX
      const threshold = 40
      if (touchStartX - touchEndX > threshold) {
        window.goToBanner((currentSlideIndex + 1) % banners.length)
      } else if (touchEndX - touchStartX > threshold) {
        window.goToBanner((currentSlideIndex - 1 + banners.length) % banners.length)
      } else {
        startBannerTimer(banners.length)
      }
    }, { passive: true })
  }

  startBannerTimer(banners.length)
}

function startBannerTimer(total) {
  stopBannerTimer()
  if (total <= 1) return
  bannerInterval = setInterval(() => {
    currentSlideIndex = (currentSlideIndex + 1) % total
    window.goToBanner(currentSlideIndex)
  }, 5000)
}

function stopBannerTimer() {
  if (bannerInterval) clearInterval(bannerInterval)
}

function resetBannerTimer(total) {
  stopBannerTimer()
  startBannerTimer(total)
}

async function loadExploreTags() {
  const container = document.getElementById('explore-tag-group')
  if (!container) return

  const { data: dbTags } = await supabase.from('tags').select('*').order('name', { ascending: true })

  const defaultTags = ['Action', 'Romance', 'Fantasy', 'Drama', 'Comedy', 'Horror', 'Angst', 'Slice of Life']
  let allTags = []

  if (dbTags && dbTags.length > 0) {
    const customTagNames = dbTags.map(t => t.name)
    allTags = Array.from(new Set([...defaultTags, ...customTagNames]))
  } else {
    allTags = defaultTags
  }

  container.innerHTML = `
    <button class="filter-btn filter-tag-btn ${selectedTags.length === 0 ? 'active' : ''}" data-tag="all">Semua Tag</button>
    ${allTags.map(t => `
      <button class="filter-btn filter-tag-btn ${selectedTags.includes(t) ? 'active' : ''}" data-tag="${sanitizeText(t)}">${sanitizeText(t)}</button>
    `).join('')}
  `

  container.querySelectorAll('.filter-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tagValue = e.target.getAttribute('data-tag')

      if (tagValue === 'all') {
        selectedTags = []
        container.querySelectorAll('.filter-tag-btn').forEach(b => b.classList.remove('active'))
        e.target.classList.add('active')
      } else {
        container.querySelector('.filter-tag-btn[data-tag="all"]')?.classList.remove('active')

        if (selectedTags.includes(tagValue)) {
          selectedTags = selectedTags.filter(t => t !== tagValue)
          e.target.classList.remove('active')
        } else {
          selectedTags.push(tagValue)
          e.target.classList.add('active')
        }

        if (selectedTags.length === 0) {
          container.querySelector('.filter-tag-btn[data-tag="all"]')?.classList.add('active')
        }
      }
      loadExploreBooks()
    })
  })
}

async function renderAdminTagList() {
  const container = document.getElementById('tag-admin-list')
  if (!container) return

  const { data: tags } = await supabase.from('tags').select('*').order('name', { ascending: true })

  if (!tags || tags.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8;">Belum ada tag kustom di database.</p>`
    return
  }

  container.innerHTML = tags.map(t => `
    <span style="display:inline-flex; align-items:center; gap:6px; background:rgba(244,63,94,0.15); color:#fda4af; border:1px solid rgba(244,63,94,0.3); padding:4px 10px; border-radius:9999px; font-size:11px; font-weight:600;">
      ${sanitizeText(t.name)}
      <i class="bi bi-x-circle-fill" onclick="deleteTag('${t.id}')" style="cursor:pointer; color:#f87171;"></i>
    </span>
  `).join('')
}

async function loadRecommendedUsersHome() {
  const container = document.getElementById('list-recommended-users-home')
  if (!container) return

  let query = supabase.from('profiles').select('*').limit(8)
  if (currentUser) query = query.neq('id', currentUser.id)

  const { data: users } = await query

  if (!users || users.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8; padding:8px 0;">Belum ada akun lain yang dapat disarankan.</p>`
    return
  }

  container.innerHTML = users.map(user => `
    <div onclick="openUserProfile('${user.id}')" style="min-width:115px; max-width:115px; flex-shrink:0; background:rgba(23, 15, 48, 0.6); border:1px solid rgba(168, 85, 247, 0.25); border-radius:16px; padding:12px 8px; text-align:center; cursor:pointer;">
      <img src="${sanitizeText(user.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.id}" style="width:46px; height:42px; border-radius:50%; object-fit:cover; margin:0 auto 6px; border:2px solid #a855f7;">
      <h4 style="font-size:11px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitizeText(user.full_name) || 'User'}</h4>
      <p style="font-size:9px; color:#38bdf8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:8px;">@${sanitizeText(user.username) || 'user'}</p>
      <button style="width:100%; padding:4px 0; background:rgba(168,85,247,0.2); color:#e9d5ff; border:1px solid rgba(168,85,247,0.4); border-radius:9999px; font-size:9px; font-weight:700; cursor:pointer;">
        Profil
      </button>
    </div>
  `).join('')
}

async function renderAdminBannerList() {
  const container = document.getElementById('banner-admin-list')
  if (!container) return

  const { data: banners } = await supabase.from('banners').select('*').order('created_at', { ascending: false })

  if (!banners || banners.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8;">Belum ada banner buatan admin.</p>`
    return
  }

  container.innerHTML = banners.map(b => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:10px; border:1px solid rgba(168,85,247,0.2);">
      <div style="display:flex; align-items:center; gap:8px; flex:1; overflow:hidden;">
        <img src="${sanitizeText(b.image_url)}" style="width:40px; height:28px; object-fit:cover; border-radius:4px; flex-shrink:0;">
        <span style="font-size:12px; font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitizeText(b.title)}</span>
      </div>
      <div style="display:flex; gap:6px; margin-left:8px;">
        <button onclick="openEditBannerForm('${b.id}')" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">✏️ Edit</button>
        <button onclick="deleteBanner('${b.id}')" style="background:#fee2e2; color:#dc2626; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">Hapus</button>
      </div>
    </div>
  `).join('')
}

async function loadHomeBooks() {
  const { data: allBooks } = await supabase.from('books').select('*').eq('is_published', true)
  let editorPicks = []
  
  if (allBooks && allBooks.length > 0) {
    editorPicks = [...allBooks].sort(() => 0.5 - Math.random()).slice(0, 6)
  }
  renderBookHorizontal('list-popular', editorPicks)

  const { data: recommended } = await supabase.from('books').select('*').eq('is_published', true).order('recommendation_count', { ascending: false }).limit(6)
  renderBookHorizontal('list-recommended-home', recommended)

  const { data: newest } = await supabase.from('books').select('*').eq('is_published', true).order('created_at', { ascending: false }).limit(6)
  renderBookHorizontal('list-newest', newest)
}

async function loadExploreBooks() {
  const searchInput = document.getElementById('explore-search')
  const searchQuery = searchInput ? searchInput.value : ''
  let query = supabase.from('books').select('*').eq('is_published', true)

  if (currentMediaFilter !== 'all') query = query.eq('media_type', currentMediaFilter)

  if (selectedTags.length > 0) {
    const orConditions = selectedTags.map(t => `genre.ilike.%${t}%`).join(',')
    query = query.or(orConditions)
  }

  if (searchQuery.trim() !== '') {
    query = query.or(`title.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%,genre.ilike.%${searchQuery}%,platform.ilike.%${searchQuery}%`)
  }

  const { data: books } = await query.order('created_at', { ascending: false })
  
  const listExplore = document.getElementById('list-explore')
  if (listExplore) {
    renderBookVertical('list-explore', books)
    
    const suggestPromptHTML = `
      <div style="grid-column: span 2; background: linear-gradient(135deg, rgba(168,85,247,0.15), rgba(56,189,248,0.15)); border: 1px dashed rgba(168,85,247,0.4); border-radius: 14px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px;">
        <div>
          <h5 style="font-size:12px; font-weight:800; color:#f8fafc;">Gak nemu novel/komik favoritmu?</h5>
          <p style="font-size:10px; color:#cbd5e1;">Tambah ke semesta FiksiVerse biar dibaca yang lain!</p>
        </div>
        <button onclick="openBookFormById(null)" style="padding:7px 12px; background:linear-gradient(135deg,#a855f7,#38bdf8); color:white; border:none; border-radius:9999px; font-size:11px; font-weight:700; white-space:nowrap; cursor:pointer; flex-shrink:0;">
          + Tambah Buku
        </button>
      </div>
    `
    listExplore.insertAdjacentHTML('afterbegin', suggestPromptHTML)
  }
}

async function loadExploreUsers() {
  const container = document.getElementById('list-explore-users')
  const searchInput = document.getElementById('explore-search')
  const searchQuery = searchInput ? searchInput.value.trim() : ''

  if (!container) return

  let query = supabase.from('profiles').select('*')

  if (searchQuery !== '') {
    query = query.or(`full_name.ilike.%${searchQuery}%,username.ilike.%${searchQuery}%`)
  }

  const { data: users } = await query.limit(20)

  if (!users || users.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:16px 0;">Tidak ada akun pengguna ditemukan.</p>`
    return
  }

  container.innerHTML = users.map(user => `
    <div onclick="openUserProfile('${user.id}')" class="user-item" style="cursor:pointer; padding:12px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="${sanitizeText(user.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.id}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:1px solid #a855f7;">
        <div>
          <h4 style="font-size:13px; font-weight:700; color:#f8fafc;">
            ${sanitizeText(user.full_name) || 'User'} ${user.role === 'admin' ? '👑' : ''}
          </h4>
          <p style="font-size:11px; color:#38bdf8;">@${sanitizeText(user.username) || 'user'}</p>
          ${user.bio ? `<p style="font-size:10px; color:#cbd5e1; margin-top:2px;">${sanitizeText(user.bio).substring(0, 45)}...</p>` : ''}
        </div>
      </div>
      <i class="bi bi-chevron-right" style="color:#c084fc;"></i>
    </div>
  `).join('')
}

function renderBookHorizontal(containerId, books) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!books || books.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8; padding:8px 0;">Belum ada buku di kategori ini.</p>`
    return
  }

  container.innerHTML = books.map(book => `
    <div onclick="openBookDetail('${book.id}')" class="book-card-horizontal">
      <div class="uncropped-cover-container">
        <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
        <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(book.title)}">
        <span class="book-badge">${sanitizeText(book.media_type)}</span>
      </div>
      <div class="book-info">
        <h3 class="book-title">${sanitizeText(book.title)}</h3>
        <p class="book-author">${sanitizeText(book.author)}</p>
        <div class="book-stats">
          <span>⭐ ${book.recommendation_count || 0}</span>
        </div>
      </div>
    </div>
  `).join('')
}

function renderBookVertical(containerId, books) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!books || books.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column: span 2; text-align:center; padding:16px 0;">Belum ada buku.</p>`
    return
  }

  container.innerHTML = books.map(book => `
    <div onclick="openBookDetail('${book.id}')" class="book-card-vertical">
      <div class="uncropped-cover-container" style="height:170px;">
        <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
        <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(book.title)}">
        <span class="book-badge">${sanitizeText(book.media_type)}</span>
      </div>
      <div class="book-info">
        <h3 class="book-title">${sanitizeText(book.title)}</h3>
        <p class="book-author">${sanitizeText(book.author)}</p>
        ${book.genre ? `<p style="font-size:10px; color:#c084fc; margin-top:2px;">🏷️ ${sanitizeText(book.genre)}</p>` : ''}
        <div class="book-stats">
          <span>⭐ ${book.recommendation_count || 0} Rekomendasi</span>
        </div>
      </div>
    </div>
  `).join('')
}

async function loadUserBookmarks() {
  if (!currentUser) return
  const { data: bookmarks } = await supabase.from('bookmarks').select('books(*), stories(*)').eq('user_id', currentUser.id)
  
  const container = document.getElementById('list-bookmark')
  if (!container) return

  if (!bookmarks || bookmarks.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column: span 2; text-align:center; padding:16px 0;">Belum ada bookmark tersimpan.</p>`
    return
  }

  container.innerHTML = bookmarks.map(b => {
    if (b.books && b.books.is_published !== false) {
      const book = b.books
      return `
        <div onclick="openBookDetail('${book.id}')" class="book-card-vertical">
          <div class="uncropped-cover-container" style="height:170px;">
            <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
            <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(book.title)}">
            <span class="book-badge">${sanitizeText(book.media_type)}</span>
          </div>
          <div class="book-info">
            <h3 class="book-title">${sanitizeText(book.title)}</h3>
            <p class="book-author">${sanitizeText(book.author)}</p>
          </div>
        </div>
      `
    } else if (b.stories) {
      const story = b.stories
      return `
        <div onclick="openAuDetail('${story.id}')" class="book-card-vertical">
          <div class="uncropped-cover-container" style="height:170px;">
            <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
            <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(story.title)}">
            <span class="book-badge">${sanitizeText(story.platform || 'Sosmed AU')}</span>
          </div>
          <div class="book-info">
            <h3 class="book-title">${sanitizeText(story.title)}</h3>
            <p class="book-author">${sanitizeText(story.author)}</p>
          </div>
        </div>
      `
    }
    return ''
  }).join('')
}

async function loadUserRecommendations() {
  if (!currentUser) return
  const { data: recs } = await supabase.from('recommendations').select('books(*), stories(*)').eq('user_id', currentUser.id)
  
  const container = document.getElementById('list-user-recommended')
  if (!container) return

  if (!recs || recs.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:#94a3b8; grid-column: span 2; text-align:center; padding:16px 0;">Belum ada cerita yang lo rekomendasikan.</p>`
    return
  }

  container.innerHTML = recs.map(r => {
    if (r.books && r.books.is_published !== false) {
      const book = r.books
      return `
        <div onclick="openBookDetail('${book.id}')" class="book-card-vertical">
          <div class="uncropped-cover-container" style="height:170px;">
            <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
            <img src="${sanitizeText(book.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(book.title)}">
            <span class="book-badge">${sanitizeText(book.media_type)}</span>
          </div>
          <div class="book-info">
            <h3 class="book-title">${sanitizeText(book.title)}</h3>
            <p class="book-author">${sanitizeText(book.author)}</p>
          </div>
        </div>
      `
    } else if (r.stories) {
      const story = r.stories
      return `
        <div onclick="openAuDetail('${story.id}')" class="book-card-vertical">
          <div class="uncropped-cover-container" style="height:170px;">
            <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
            <img src="${sanitizeText(story.cover_url) || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${sanitizeText(story.title)}">
            <span class="book-badge">${sanitizeText(story.platform || 'Sosmed AU')}</span>
          </div>
          <div class="book-info">
            <h3 class="book-title">${sanitizeText(story.title)}</h3>
            <p class="book-author">${sanitizeText(story.author)}</p>
          </div>
        </div>
      `
    }
    return ''
  }).join('')
}

async function loadProfile() {
  const tabProfile = document.getElementById('tab-profile')
  if (!tabProfile) return

  if (!currentUser) {
    tabProfile.innerHTML = `
      <div class="profile-card-hero" style="padding: 32px 16px; text-align:center;">
        <div style="font-size: 40px; color:#c084fc;"><i class="bi bi-person-circle"></i></div>
        <h3 style="font-size:15px; font-weight:800; color:#f8fafc; margin-top:8px;">Belum Log In</h3>
        <p style="font-size:12px; color:#94a3b8; margin-bottom:12px;">Silakan masuk untuk melihat profil Galaxy kamu.</p>
        <button id="btn-profile-login" class="btn-full btn-galaxy-primary">Login / Register</button>
      </div>
    `
    document.getElementById('btn-profile-login')?.addEventListener('click', () => {
      document.getElementById('modal-auth')?.classList.remove('hidden')
      pushHistoryState('modal', 'modal-auth')
    })
    return
  }

  const p = currentUser.profile
  const isAdmin = p?.role === 'admin'

  const { count: bookmarkCount } = await supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id)
  const { count: recCount } = await supabase.from('recommendations').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id)
  const { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', currentUser.id)
  const { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', currentUser.id)

  const { data: userBooks } = await supabase.from('books').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false })
  const { data: userStories } = await supabase.from('stories').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false })

  const totalKarya = (userBooks ? userBooks.length : 0) + (userStories ? userStories.length : 0)

  let pendingCount = 0
  if (isAdmin) {
    const { count } = await supabase.from('books').select('*', { count: 'exact', head: true }).eq('is_published', false)
    pendingCount = count || 0
  }

  tabProfile.innerHTML = `
    <div class="profile-card-hero">
      <div class="profile-bg-banner"></div>
      <div class="profile-avatar-container">
        <img src="${sanitizeText(p?.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + currentUser.id}" class="profile-avatar-img">
      </div>
      <div class="profile-info-box">
        <h3 style="font-size:16px; font-weight:800; color:#f8fafc;">
          ${sanitizeText(p?.full_name) || 'User'} ${isAdmin ? '👑' : ''}
        </h3>
        <p style="font-size:12px; color:#38bdf8; font-weight:600;">@${sanitizeText(p?.username) || 'username'}</p>
        
        <p style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.4;">
          ${sanitizeText(p?.bio) || 'Belum ada bio.'}
        </p>

        <div style="display:flex; justify-content:center; gap:8px; margin-top:12px; flex-wrap:wrap;">
          <button onclick="openEditProfileModal()" style="padding:6px 14px; background:rgba(168,85,247,0.2); color:#e9d5ff; border:1px solid rgba(168,85,247,0.4); border-radius:9999px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
            <i class="bi bi-pencil-square"></i> Edit Profil
          </button>
          
          ${isAdmin ? `
            <button onclick="document.getElementById('admin-pending-section')?.scrollIntoView({ behavior: 'smooth' })" style="padding:6px 14px; background:linear-gradient(135deg,#f59e0b,#d97706); color:white; border:none; border-radius:9999px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <i class="bi bi-inbox-fill"></i> Antrean Verifikasi ${pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ` : `
            <button onclick="openBookFormById(null)" style="padding:6px 14px; background:linear-gradient(135deg,#a855f7,#6366f1); color:white; border:none; border-radius:9999px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <i class="bi bi-plus-circle"></i> Tambah Buku
            </button>
          `}

          <button onclick="window.openAuFormById(null)" style="padding:6px 14px; background:linear-gradient(135deg,#0ea5e9,#3b82f6); color:white; border:none; border-radius:9999px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
            <i class="bi bi-phone"></i> Tambah AU
          </button>
        </div>

        <div class="profile-stats-grid">
          <div class="stat-card" onclick="switchTab('tab-bookmark')">
            <span class="stat-value">${bookmarkCount || 0}</span>
            <span class="stat-label">Bookmark</span>
          </div>
          <div class="stat-card" onclick="switchTab('tab-recommended')">
            <span class="stat-value">${recCount || 0}</span>
            <span class="stat-label">Rekomendasi</span>
          </div>
          <div class="stat-card" onclick="openSocialModal('followers')">
            <span class="stat-value">${followersCount || 0}</span>
            <span class="stat-label">Pengikut</span>
          </div>
          <div class="stat-card" onclick="openSocialModal('following')">
            <span class="stat-value">${followingCount || 0}</span>
            <span class="stat-label">Mengikuti</span>
          </div>
        </div>
      </div>
    </div>

    <!-- CARD DAFTAR KARYA SAYA (BUKU + AU) -->
    ${!isAdmin ? `
      <div class="glass-card space-y-3" style="padding:14px;">
        <h4 style="font-size:13px; font-weight:800; color:#c084fc;">
          📚 Daftar Karya Saya (${totalKarya})
        </h4>

        ${totalKarya === 0 ? `
          <p style="font-size:11px; color:#94a3b8;">Kamu belum pernah menambahkan buku atau AU.</p>
        ` : `
          <div class="space-y-2">
            <!-- DAFTAR AU SAYA -->
            ${userStories && userStories.length > 0 ? userStories.map(s => `
              <div style="background:rgba(56,189,248,0.05); padding:10px; border-radius:12px; border:1px solid rgba(56,189,248,0.25);">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                  <div onclick="openAuDetail('${s.id}')" style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden; cursor:pointer;">
                    <img src="${sanitizeText(s.cover_url) || 'https://via.placeholder.com/50'}" style="width:34px; height:46px; object-fit:cover; border-radius:6px; flex-shrink:0;">
                    <div style="overflow:hidden;">
                      <h5 style="font-size:12px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitizeText(s.title)}</h5>
                      <p style="font-size:10px; color:#94a3b8;">${sanitizeText(s.author)} • <span style="color:#38bdf8;">📱 AU (${s.parts ? s.parts.length : 0} Part)</span></p>
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; margin-left:8px; flex-shrink:0;">
                    <button onclick="openAuFormById('${s.id}')" title="Edit AU" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:4px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                      ✏️ Edit
                    </button>
                    <button onclick="deleteAu('${s.id}')" title="Hapus AU" style="background:rgba(239,68,68,0.25); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); padding:4px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            `).join('') : ''}

            <!-- DAFTAR BUKU SAYA -->
            ${userBooks && userBooks.length > 0 ? userBooks.map(b => {
              const isApproved = b.is_published !== false
              const isRejected = !isApproved && b.rejection_reason

              let badgeHTML = isApproved 
                ? `<span style="font-size:10px; font-weight:800; padding:4px 8px; border-radius:9999px; background:rgba(52,211,153,0.15); color:#34d399;">✅ Aktif</span>`
                : (isRejected ? `<span style="font-size:10px; font-weight:800; padding:4px 8px; border-radius:9999px; background:rgba(239,68,68,0.15); color:#f87171;">❌ Ditolak</span>` : `<span style="font-size:10px; font-weight:800; padding:4px 8px; border-radius:9999px; background:rgba(251,191,36,0.15); color:#fbbf24;">⏳ Verifikasi</span>`)

              return `
                <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid ${isRejected ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.15)'};">
                  <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div onclick="openBookDetail('${b.id}')" style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden; cursor:pointer;">
                      <img src="${sanitizeText(b.cover_url) || 'https://via.placeholder.com/50'}" style="width:34px; height:46px; object-fit:cover; border-radius:6px; flex-shrink:0;">
                      <div style="overflow:hidden;">
                        <h5 style="font-size:12px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitizeText(b.title)}</h5>
                        <p style="font-size:10px; color:#94a3b8;">${sanitizeText(b.author)} • <span style="color:#c084fc;">${sanitizeText(b.media_type)}</span></p>
                      </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; margin-left:8px; flex-shrink:0;">
                      ${badgeHTML}
                      <button onclick="openBookFormById('${b.id}')" title="Edit Buku" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:4px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                        ✏️ Edit
                      </button>
                    </div>
                  </div>
                </div>
              `
            }).join('') : ''}
          </div>
        `}
      </div>
    ` : ''}

    ${isAdmin ? `
      <div class="glass-card space-y-3" style="padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4 style="font-size:13px; font-weight:800; color:#c084fc;">🛠️ PANEL KELOLA ADMIN</h4>
        </div>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button id="btn-admin-add" class="btn-full btn-galaxy-primary" style="font-size:11px;">
            <i class="bi bi-plus-circle"></i> Tambah Buku
          </button>
          <button id="btn-admin-banner" class="btn-full btn-galaxy-cyan" style="font-size:11px;">
            <i class="bi bi-images"></i> Kelola Banner
          </button>
        </div>

        <div>
          <button id="btn-admin-tag" class="btn-full" style="font-size:11px; background:linear-gradient(135deg, #f43f5e, #a855f7); color:white; font-weight:700;">
            <i class="bi bi-tags-fill"></i> Kelola Tag / Genre
          </button>
        </div>

        <!-- SEKSI MODERASI LAPORAN KOMENTAR -->
        <div style="padding-top:10px; border-top:1px dashed rgba(168,85,247,0.3);">
          <h5 style="font-size:12px; font-weight:800; color:#f87171; margin-bottom:8px;">
            🛡️ Kelola Laporan Komentar
          </h5>
          <div id="admin-reports-list" class="space-y-2"></div>
        </div>

        <div style="padding-top:8px;">
          <div id="admin-books-list" class="space-y-3"></div>
        </div>
      </div>
    ` : ''}

    <div class="glass-card" style="overflow:hidden;">
      <button id="btn-logout" class="btn-full" style="background:transparent; color:#f87171; justify-content:space-between; padding:14px 16px;">
        <span style="display:flex; align-items:center; gap:8px;"><i class="bi bi-box-arrow-right"></i> Keluar dari Akun</span>
      </button>
    </div>
  `

  if (isAdmin) {
    document.getElementById('btn-admin-add')?.addEventListener('click', () => openBookFormById(null))
    document.getElementById('btn-admin-banner')?.addEventListener('click', () => {
      document.getElementById('modal-banner-form')?.classList.remove('hidden')
      pushHistoryState('modal', 'modal-banner-form')
      renderAdminBannerList()
    })
    document.getElementById('btn-admin-tag')?.addEventListener('click', () => {
      document.getElementById('modal-tag-form')?.classList.remove('hidden')
      pushHistoryState('modal', 'modal-tag-form')
      renderAdminTagList()
    })
    loadAdminReportsList()
    loadAdminBooksList()
  }
  document.getElementById('btn-logout')?.addEventListener('click', logout)
}

async function loadAdminReportsList() {
  const container = document.getElementById('admin-reports-list')
  if (!container) return

  const { data: reports, error } = await supabase
    .from('comment_reports')
    .select('*, comment:comments(*, user:profiles(*), book:books(*)), reporter:profiles!comment_reports_reporter_id_fkey(*)')
    .order('created_at', { ascending: false })

  if (error || !reports || reports.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8;">Tidak ada laporan komentar saat ini. ✨</p>`
    return
  }

  container.innerHTML = reports.map(r => {
    const bookId = r.comment?.book_id || r.comment?.book?.id

    return `
      <div style="background:rgba(239,68,68,0.08); padding:10px; border-radius:12px; border:1px solid rgba(239,68,68,0.25);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <p style="font-size:11px; color:#f87171; font-weight:700;">⚠️ Pelapor: @${sanitizeText(r.reporter?.username || 'user')}</p>
            <p style="font-size:10px; color:#cbd5e1; margin-top:2px;"><b>Alasan:</b> ${sanitizeText(r.reason)}</p>
          </div>
          <span style="font-size:9px; color:#94a3b8;">${new Date(r.created_at).toLocaleDateString('id-ID')}</span>
        </div>
        
        <div onclick="${bookId ? `openBookDetail('${bookId}')` : ''}" 
             style="background:rgba(0,0,0,0.3); padding:8px; border-radius:8px; margin-top:6px; font-size:11px; color:#cbd5e1; cursor:pointer; border:1px solid rgba(168,85,247,0.2);" 
             title="Klik untuk lihat konteks di buku">
          <b style="color:#a855f7;">@${sanitizeText(r.comment?.user?.username || 'user')}:</b> "${sanitizeText(r.comment?.content || '[Komentar telah dihapus]')}"
          <div style="font-size:9px; color:#38bdf8; margin-top:4px; display:flex; align-items:center; justify-content:space-between;">
            <span>📖 Buku: <b>${sanitizeText(r.comment?.book?.title || '-')}</b></span>
            <span style="color:#c084fc; font-weight:700;">Lihat Konteks 🔍</span>
          </div>
        </div>

        <div style="display:flex; gap:6px; margin-top:8px; justify-content:flex-end;">
          ${bookId ? `
            <button onclick="openBookDetail('${bookId}')" style="padding:4px 10px; background:rgba(56,189,248,0.2); color:#7dd3fc; border:1px solid rgba(56,189,248,0.4); border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">
              🔍 Cek TKP
            </button>
          ` : ''}
          <button onclick="dismissReport('${r.id}')" style="padding:4px 10px; background:rgba(255,255,255,0.1); color:#cbd5e1; border:none; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer;">
            Abaikan
          </button>
          <button onclick="deleteReportedComment('${r.comment_id}', '${r.id}')" style="padding:4px 10px; background:#ef4444; color:white; border:none; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer;">
            Hapus Komentar
          </button>
        </div>
      </div>
    `
  }).join('')
}

window.deleteReportedComment = function(commentId, reportId) {
  window.showConfirmModal('Hapus Komentar', 'Apakah kamu yakin ingin menghapus komentar melanggar ini?', async () => {
    try {
      if (commentId) {
        await supabase.from('comments').delete().eq('id', commentId)
      }
      await supabase.from('comment_reports').delete().eq('id', reportId)
      window.showToast('Komentar berhasil dihapus!')
      loadAdminReportsList()
    } catch(e) {
      window.showToast('Gagal menghapus komentar', 'error')
    }
  })
}

window.dismissReport = async function(reportId) {
  try {
    await supabase.from('comment_reports').delete().eq('id', reportId)
    window.showToast('Laporan diabaikan.')
    loadAdminReportsList()
  } catch(e) {
    window.showToast('Gagal mengabaikan laporan', 'error')
  }
}

async function loadAdminBooksList() {
  const container = document.getElementById('admin-books-list')
  if (!container) return

  const { data: books } = await supabase.from('books').select('*').order('created_at', { ascending: false })

  if (!books || books.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8;">Belum ada buku di database.</p>`
    return
  }

  const pendingBooks = books.filter(b => b.is_published === false)
  const publishedBooks = books.filter(b => b.is_published !== false)

  container.innerHTML = `
    <div id="admin-pending-section">
      <h5 style="font-size:12px; font-weight:800; color:#fbbf24; margin-bottom:6px;">
        ⏳ Menunggu Verifikasi Admin (${pendingBooks.length})
      </h5>
      ${pendingBooks.length === 0 ? `<p style="font-size:11px; color:#94a3b8;">Tidak ada antrean verifikasi buku.</p>` : ''}
      <div class="space-y-2">
        ${pendingBooks.map(b => `
          <div style="background:rgba(251,191,36,0.08); padding:8px 10px; border-radius:12px; border:1px solid rgba(251,191,36,0.25);">
            <div onclick="if(event.target.tagName !== 'BUTTON') openBookDetail('${b.id}')" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
              <div style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden;">
                <img src="${sanitizeText(b.cover_url) || 'https://via.placeholder.com/50'}" style="width:36px; height:50px; object-fit:cover; border-radius:6px; flex-shrink:0;">
                <div style="overflow:hidden;">
                  <h5 style="font-size:12px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitizeText(b.title)}</h5>
                  <p style="font-size:10px; color:#94a3b8;">${sanitizeText(b.author)} • <span style="color:#c084fc;">${sanitizeText(b.media_type)}</span></p>
                </div>
              </div>
              <div style="display:flex; gap:4px; margin-left:8px;">
                <button onclick="togglePublishBook('${b.id}', false)" title="Setujui & Terbit" style="background:#34d399; color:#064e3b; border:none; padding:6px 8px; border-radius:8px; font-size:10px; font-weight:800; cursor:pointer;">
                  ✅ Setujui
                </button>
                <button onclick="rejectBook('${b.id}')" title="Tolak Buku" style="background:#ef4444; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:10px; font-weight:800; cursor:pointer;">
                  ❌ Tolak
                </button>
                <button onclick="openBookFormById('${b.id}')" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:6px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                  ✏️
                </button>
              </div>
            </div>

            ${b.rejection_reason ? `
              <div style="font-size:10px; color:#fca5a5; margin-top:6px; padding-top:4px; border-top:1px dashed rgba(239,68,68,0.3);">
                Status saat ini: <b>Ditolak</b> ("${sanitizeText(b.rejection_reason)}")
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <div style="padding-top:10px;">
      <h5 style="font-size:12px; font-weight:700; color:#f8fafc; margin-bottom:6px;">📚 Buku Terbit (${publishedBooks.length})</h5>
      <div class="space-y-2">
        ${publishedBooks.map(b => `
          <div onclick="if(event.target.tagName !== 'BUTTON') openBookDetail('${b.id}')" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:12px; border:1px solid rgba(168,85,247,0.15);">
            <div style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden;">
              <img src="${sanitizeText(b.cover_url) || 'https://via.placeholder.com/50'}" style="width:36px; height:50px; object-fit:cover; border-radius:6px; flex-shrink:0;">
              <div style="overflow:hidden;">
                <h5 style="font-size:12px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitizeText(b.title)}</h5>
                <p style="font-size:10px; color:#94a3b8;">${sanitizeText(b.author)} • <span style="color:#c084fc;">${sanitizeText(b.media_type)}</span></p>
              </div>
            </div>
            <div style="display:flex; gap:4px; margin-left:8px;">
              <button onclick="togglePublishBook('${b.id}', true)" title="Sembunyikan ke Draft" style="background:rgba(56,189,248,0.2); color:#7dd3fc; border:1px solid rgba(56,189,248,0.4); padding:6px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                👁️
              </button>
              <button onclick="openBookFormById('${b.id}')" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:6px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                ✏️
              </button>
              <button onclick="deleteBook('${b.id}')" style="background:rgba(239,68,68,0.25); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); padding:4px 8px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
                🗑️
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

async function checkUnreadNotifications() {
  if (!currentUser) return
  try {
    const { count, error } = await supabase.from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('is_read', false)

    const badgeDot = document.getElementById('notif-badge-dot')
    if (!error && count && count > 0) badgeDot?.classList.remove('hidden')
    else badgeDot?.classList.add('hidden')
  } catch(e) {
    console.log('Error notif check:', e)
  }
}

async function loadNotifications() {
  const container = document.getElementById('notif-list-container')
  if (!container || !currentUser) return

  try {
    const { data: notifs, error } = await supabase.from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(*), book:books(*)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })

    if (error || !notifs || notifs.length === 0) {
      container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:16px 0;">Belum ada notifikasi.</p>`
      return
    }

    container.innerHTML = notifs.map(n => {
      let notifMsg = ''
      if (n.type === 'follow') {
        notifMsg = 'mulai mengikuti kamu.'
      } else if (n.type === 'comment') {
        notifMsg = `mengomentari buku <b>${sanitizeText(n.book?.title) || ''}</b>.`
      } else if (n.type === 'reply') {
        notifMsg = `membalas komentarmu di buku <b>${sanitizeText(n.book?.title) || ''}</b>.`
      } else if (n.type === 'new_book') {
        notifMsg = `menambahkan buku baru: <b>${sanitizeText(n.book?.title) || ''}</b>.`
      } else if (n.type === 'book_approved') {
        notifMsg = `🎉 Bukumu <b>${sanitizeText(n.book?.title) || ''}</b> telah disetujui Admin & terbit!`
      } else if (n.type === 'comment_report') {
        notifMsg = '⚠️ <b>melaporkan komentar</b> di salah satu cerita.'
      } else {
        notifMsg = `merekomendasikan buku <b>${sanitizeText(n.book?.title) || ''}</b>.`
      }

      const clickAction = n.book_id 
        ? `onclick="openBookDetail('${n.book_id}')"` 
        : (n.actor_id ? `onclick="openUserProfile('${n.actor_id}')"` : '')

      return `
        <div class="notif-item ${!n.is_read ? 'unread' : ''}" ${clickAction} style="cursor:pointer;">
          <img src="${sanitizeText(n.actor?.avatar_url) || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + (n.actor_id || n.id)}" class="notif-avatar">
          <div class="notif-text">
            <b>${sanitizeText(n.actor?.full_name) || 'FiksiVerse'}</b> ${notifMsg}
            <span class="notif-time">${new Date(n.created_at).toLocaleDateString('id-ID')}</span>
          </div>
        </div>
      `
    }).join('')
  } catch (err) {
    container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:16px 0;">Belum ada notifikasi.</p>`
  }
}

async function markNotificationsRead() {
  if (!currentUser) return
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id)
  document.getElementById('notif-badge-dot')?.classList.add('hidden')
}
