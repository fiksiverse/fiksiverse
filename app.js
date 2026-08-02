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

// Helper untuk mengekstrak Tweet/Status ID dari URL Twitter/X
function extractTweetId(url) {
  if (!url) return null
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status\/(\d+)/i)
  return match ? match[2] : null
}

function pushHistoryState(type, id = null) {
  history.pushState({ type, id, timestamp: Date.now() }, '')
}

// ==========================================
// 1. REGISTRASI FUNGSI GLOBAL (WINDOW)
// ==========================================

// FIKSIVERSE HYBRID CACHED THREAD READER (DATABASE FIRST)
window.openCleanThreadReader = async function(bookId, tweetUrl, title) {
  const tweetId = extractTweetId(tweetUrl)
  if (!tweetId) return window.showToast('Link Twitter/X tidak valid!', 'error')

  const modal = document.getElementById('modal-clean-reader')
  const titleEl = document.getElementById('clean-reader-title')
  const bodyContainer = document.getElementById('clean-reader-body')

  if (titleEl) titleEl.innerText = `📖 ${sanitizeText(title)}`
  
  // Loading State
  bodyContainer.innerHTML = `
    <div style="text-align:center; padding:40px 15px; color:#c084fc;">
      <i class="bi bi-hourglass-split" style="font-size:28px;"></i>
      <p style="font-size:13px; font-weight:700; margin-top:10px;">Menyiapkan Naskah AU...</p>
      <p style="font-size:10px; color:#94a3b8; margin-top:4px;">Memuat cerita FiksiVerse ✨</p>
    </div>
  `
  
  modal?.classList.remove('hidden')
  pushHistoryState('modal', 'modal-clean-reader')

  try {
    let images = []

    // 1. CEK CACHE SUPABASE DULU (Kilat 0.1 Detik)
    if (bookId) {
      const { data: book } = await supabase.from('books').select('thread_images').eq('id', bookId).single()
      if (book && book.thread_images && Array.isArray(book.thread_images) && book.thread_images.length > 0) {
        images = book.thread_images
      }
    }

    // 2. JIKA DI SUPABASE MASIH KOSONG, SEDOT VIA API & AUTO-SAVE KE SUPABASE
    if (images.length === 0) {
      const res = await fetch(`/api/unroll?id=${tweetId}`)
      const data = await res.json()

      if (res.ok && data.images && data.images.length > 0) {
        images = data.images
        // Auto-save ke Supabase biar pembaca selanjutnya dapet kilat
        if (bookId) {
          await supabase.from('books').update({ thread_images: images }).eq('id', bookId)
        }
      }
    }

    // JIKA BERHASIL DAPET GAMBAR (BAIK DARI SUPABASE MAUPUN API)
    if (images.length > 0) {
      let htmlContent = ''
      images.forEach((imgUrl, idx) => {
        const num = String(idx + 1).padStart(2, '0')
        htmlContent += `
          <div style="border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 800; color: #f8fafc; margin-bottom: 8px;">${num}.</div>
            <img src="${sanitizeText(imgUrl)}" 
                 referrerpolicy="no-referrer"
                 loading="lazy"
                 style="width: 100%; max-width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 16px rgba(0,0,0,0.4); display: block;" 
                 alt="Screenshot AU ${num}">
          </div>
        `
      })
      bodyContainer.innerHTML = htmlContent
      return
    }

    throw new Error('Naskah belum di-sync')

  } catch (err) {
    // FALLBACK IFRAME: Jika API & Supabase gagal/terhalang Cloudflare
    const embeddedUrl = `https://twitter-thread.com/thread/${tweetId}`
    bodyContainer.innerHTML = `
      <div style="margin-bottom: 12px; background: rgba(168,85,247,0.15); border: 1px solid rgba(168,85,247,0.3); padding: 10px 12px; border-radius: 10px; text-align: center;">
        <span style="font-size: 11px; color: #e9d5ff; font-weight: 700;">✨ Menampilkan Reader Engine</span>
      </div>
      <iframe src="${embeddedUrl}" 
              style="width: 100%; height: 70vh; border: none; border-radius: 12px; background: #fff;"
              title="Full Thread Reader">
      </iframe>
    `
  }
}

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

window.shareBook = function(bookId) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?book=${bookId}`

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      window.showToast('Link buku berhasil disalin! 📋')
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
    window.showToast('Link buku berhasil disalin! 📋')
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
      if (document.getElementById('preview-img-3')) document.getElementById('preview-img-3').
