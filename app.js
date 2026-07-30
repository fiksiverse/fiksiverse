import { supabase } from './supabase.js'
import { signUpWithEmail, loginWithEmail, logout, getCurrentUser } from './auth.js'

let currentUser = null
let currentMediaFilter = 'all'
let selectedTags = []
let currentSlideIndex = 0
let bannerInterval = null
let onConfirmCallback = null

// Mode pencarian di Tab Explore: 'books' atau 'users'
let exploreSearchMode = 'books'

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

window.showConfirmModal = function(title, message, callback) {
  const modal = document.getElementById('modal-confirm')
  const titleEl = document.getElementById('confirm-title')
  const msgEl = document.getElementById('confirm-message')

  if (titleEl) titleEl.innerText = title
  if (msgEl) msgEl.innerText = message
  onConfirmCallback = callback
  modal?.classList.remove('hidden')
}

window.switchTab = function(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'))
  const targetTab = document.getElementById(tabId)
  if (targetTab) targetTab.classList.remove('hidden')

  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active')
    else btn.classList.remove('active')
  })
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
}

// FUNGSI MEMBUKA PROFIL AKUN LAIN (PUBLIC PROFILE)
window.openUserProfile = async function(userId) {
  if (currentUser && currentUser.id === userId) {
    window.switchTab('tab-profile')
    return
  }

  const modal = document.getElementById('modal-user-profile')
  const container = document.getElementById('public-profile-content')
  if (!container) return

  container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:20px 0;">Memuat profil...</p>`
  modal?.classList.remove('hidden')

  try {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (!profile) return window.showToast('Profil tidak ditemukan', 'error')

    let isFollowing = false
    if (currentUser) {
      const { data: followData } = await supabase.from('follows').select('id')
        .eq('follower_id', currentUser.id)
        .eq('following_id', userId)
        .single()
      isFollowing = !!followData
    }

    const { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId)
    const { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId)
    const { data: userRecs } = await supabase.from('recommendations').select('books(*)').eq('user_id', userId)

    const books = userRecs ? userRecs.map(r => r.books).filter(Boolean) : []

    container.innerHTML = `
      <div class="profile-card-hero">
        <div class="profile-bg-banner"></div>
        <div class="profile-avatar-container">
          <img src="${profile.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + profile.id}" class="profile-avatar-img">
        </div>
        <div class="profile-info-box">
          <h3 style="font-size:16px; font-weight:800; color:#f8fafc;">
            ${profile.full_name || 'User'} ${profile.role === 'admin' ? '👑' : ''}
          </h3>
          <p style="font-size:12px; color:#38bdf8; font-weight:600;">@${profile.username || 'user'}</p>
          <p style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.4;">${profile.bio || 'Belum ada bio.'}</p>

          <button onclick="toggleFollow('${profile.id}', ${isFollowing})" 
            style="margin:12px auto 0; padding:8px 20px; border-radius:9999px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; border:none; ${isFollowing ? 'background:rgba(255,255,255,0.1); color:#cbd5e1;' : 'background:linear-gradient(135deg,#a855f7,#6366f1); color:white;'}">
            <i class="bi bi-person-${isFollowing ? 'check-fill' : 'plus-fill'}"></i>
            ${isFollowing ? 'Mengikuti' : 'Ikuti (Follow)'}
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

      <div style="padding-top:8px;">
        <h4 style="font-size:13px; font-weight:800; color:#c084fc; margin-bottom:8px;">⭐ Rekomendasi Bacaan (${books.length})</h4>
        ${books.length === 0 ? `<p style="font-size:11px; color:#94a3b8;">User ini belum merekomendasikan buku apa pun.</p>` : ''}
        <div class="book-grid-vertical">
          ${books.map(book => `
            <div onclick="openBookDetail('${book.id}')" class="book-card-vertical">
              <div class="uncropped-cover-container" style="height:150px;">
                <img src="${book.cover_url || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
                <img src="${book.cover_url || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${book.title}">
                <span class="book-badge">${book.media_type}</span>
              </div>
              <div class="book-info">
                <h3 class="book-title">${book.title}</h3>
                <p class="book-author">${book.author}</p>
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

// FUNGSI FOLLOW / UNFOLLOW USER LAIN
window.toggleFollow = async function(targetUserId, isFollowing) {
  if (!currentUser) return window.showToast('Silakan login terlebih dahulu!', 'error')

  try {
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', targetUserId)
      window.showToast('Berhenti mengikuti.')
    } else {
      await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: targetUserId })
      await supabase.from('notifications').insert({
        user_id: targetUserId,
        actor_id: currentUser.id,
        type: 'follow'
      })
      window.showToast('Berhasil mengikuti!')
    }

    window.openUserProfile(targetUserId)
    loadProfile()
    loadRecommendedUsersHome()
  } catch (err) {
    window.showToast('Gagal update ikuti: ' + err.message, 'error')
  }
}

window.openBookFormById = async function(bookId = null) {
  const modalForm = document.getElementById('modal-book-form')
  const titleEl = document.getElementById('book-form-title')
  const tabsEl = document.getElementById('book-form-tabs')
  
  const tabSingle = document.getElementById('tab-book-single')
  const tabBulk = document.getElementById('tab-book-bulk')
  const formBook = document.getElementById('form-book')
  const formBookBulk = document.getElementById('form-book-bulk')

  tabSingle?.classList.add('active')
  tabBulk?.classList.remove('active')
  formBook?.classList.remove('hidden')
  formBookBulk?.classList.add('hidden')

  if (bookId) {
    try {
      const { data: book } = await supabase.from('books').select('*').eq('id', bookId).single()
      if (!book) return

      if (titleEl) titleEl.innerText = 'Edit Buku'
      if (tabsEl) tabsEl.style.display = 'none'

      document.getElementById('book-id').value = book.id
      document.getElementById('book-title').value = book.title || ''
      document.getElementById('book-author').value = book.author || ''
      document.getElementById('book-platform').value = book.platform || ''
      document.getElementById('book-genre').value = book.genre || ''
      document.getElementById('book-media-type').value = book.media_type || 'Novel'
      document.getElementById('book-status').value = book.status || 'Ongoing'
      document.getElementById('book-cover-url').value = book.cover_url || ''

      const previews = book.preview_images || []
      if (document.getElementById('preview-img-1')) document.getElementById('preview-img-1').value = previews[0] || ''
      if (document.getElementById('preview-img-2')) document.getElementById('preview-img-2').value = previews[1] || ''
      if (document.getElementById('preview-img-3')) document.getElementById('preview-img-3').value = previews[2] || ''
      if (document.getElementById('preview-img-4')) document.getElementById('preview-img-4').value = previews[3] || ''

      if (document.getElementById('book-read-link')) document.getElementById('book-read-link').value = book.read_link || ''
      if (document.getElementById('book-buy-link')) document.getElementById('book-buy-link').value = book.buy_link || ''
      if (document.getElementById('book-synopsis')) document.getElementById('book-synopsis').value = book.synopsis || ''
    } catch (err) {
      window.showToast('Gagal memuat data buku', 'error')
    }
  } else {
    if (titleEl) titleEl.innerText = 'Tambah Buku Baru'
    if (tabsEl) tabsEl.style.display = 'flex'
    document.getElementById('form-book')?.reset()
    const bId = document.getElementById('book-id')
    if (bId) bId.value = ''
  }

  modalForm?.classList.remove('hidden')
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

window.openBookDetail = async function(bookId) {
  try {
    const { data: book } = await supabase.from('books').select('*').eq('id', bookId).single()
    if (!book) return

    let isBookmarked = false
    let isRecommended = false

    if (currentUser) {
      const { data: bm } = await supabase.from('bookmarks').select('id').eq('user_id', currentUser.id).eq('book_id', bookId).single()
      isBookmarked = !!bm

      const { data: rec } = await supabase.from('recommendations').select('id').eq('user_id', currentUser.id).eq('book_id', bookId).single()
      isRecommended = !!rec
    }

    const isAdmin = currentUser?.profile?.role === 'admin'
    const previews = book.preview_images || []

    const detailContent = document.getElementById('detail-content')
    if (detailContent) {
      detailContent.innerHTML = `
        <div style="display:flex; gap:14px;">
          <div class="uncropped-cover-container" style="width:100px; height:140px; flex-shrink:0;">
            <img src="${book.cover_url || 'https://via.placeholder.com/120'}" class="uncropped-cover-bg">
            <img src="${book.cover_url || 'https://via.placeholder.com/120'}" class="uncropped-cover-img">
          </div>
          <div class="space-y-2" style="flex:1;">
            <h2 style="font-size:16px; font-weight:800; color:#f8fafc;">${book.title}</h2>
            <p style="font-size:12px; color:#c084fc; font-weight:600;">${book.author}</p>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
              <span style="padding:2px 8px; background:rgba(168,85,247,0.2); color:#e9d5ff; font-size:10px; border-radius:9999px; font-weight:700;">
                ${book.media_type} • ${book.status}
              </span>
              ${book.platform ? `<span style="padding:2px 8px; background:rgba(56,189,248,0.2); color:#7dd3fc; font-size:10px; border-radius:9999px; font-weight:700;">📱 ${book.platform}</span>` : ''}
              ${book.genre ? `<span style="padding:2px 8px; background:rgba(255,255,255,0.05); color:#cbd5e1; font-size:10px; border-radius:9999px; font-weight:600;">🏷️ ${book.genre}</span>` : ''}
            </div>
            <div style="font-size:12px; color:#fbbf24; padding-top:4px; font-weight:700;">
              <span>⭐ ${book.recommendation_count || 0} Rekomendasi</span>
            </div>
          </div>
        </div>

        ${previews.length > 0 ? `
          <div>
            <h4 style="font-size:11px; font-weight:700; color:#cbd5e1; margin-bottom:4px;">PREVIEW / SAMPLE</h4>
            <div class="preview-gallery-grid">
              ${previews.map(url => `<img src="${url}" class="preview-gallery-img" onclick="window.open('${url}', '_blank')">`).join('')}
            </div>
          </div>
        ` : ''}

        ${isAdmin ? `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding-top:4px;">
            <button onclick="openBookFormById('${book.id}')" style="padding:8px; border-radius:10px; font-size:11px; font-weight:700; background:rgba(99,102,241,0.2); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); cursor:pointer;">
              ✏️ Edit Buku
            </button>
            <button onclick="deleteBook('${book.id}')" style="padding:8px; border-radius:10px; font-size:11px; font-weight:700; background:rgba(239,68,68,0.2); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); cursor:pointer;">
              🗑️ Hapus Buku
            </button>
          </div>
        ` : ''}

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding-top:8px;">
          <button onclick="toggleBookmark('${book.id}', ${isBookmarked})" 
            style="padding:10px; border-radius:12px; font-size:12px; font-weight:600; border:1px solid ${isBookmarked ? '#f87171' : 'rgba(255,255,255,0.1)'}; background:${isBookmarked ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}; color:${isBookmarked ? '#fca5a5' : '#cbd5e1'}; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
            <i class="bi bi-bookmark${isBookmarked ? '-check-fill' : ''}" style="${isBookmarked ? 'color:#f87171' : ''}"></i>
            ${isBookmarked ? 'Tersimpan' : 'Bookmark'}
          </button>
          
          <button onclick="toggleRecommendation('${book.id}', ${isRecommended})" 
            style="padding:10px; border-radius:12px; font-size:12px; font-weight:600; border:1px solid ${isRecommended ? '#fbbf24' : 'rgba(255,255,255,0.1)'}; background:${isRecommended ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)'}; color:${isRecommended ? '#fde047' : '#cbd5e1'}; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;">
            <i class="bi bi-star${isRecommended ? '-fill' : ''}" style="${isRecommended ? 'color:#fbbf24' : ''}"></i>
            ${isRecommended ? 'Direkomendasikan' : 'Rekomendasikan'}
          </button>
        </div>

        <div class="space-y-2" style="padding-top:8px;">
          ${book.read_link ? `<a href="${book.read_link}" target="_blank" class="btn-full btn-galaxy-primary" style="text-decoration:none;"><i class="bi bi-book"></i> Baca Sekarang</a>` : ''}
          ${book.buy_link ? `<a href="${book.buy_link}" target="_blank" class="btn-full btn-galaxy-cyan" style="text-decoration:none;"><i class="bi bi-cart"></i> Beli Sekarang</a>` : ''}
        </div>

        <div style="padding-top:12px; border-top:1px solid rgba(168,85,247,0.2);">
          <h4 style="font-size:12px; font-weight:700; color:#f8fafc; margin-bottom:4px;">Sinopsis</h4>
          <p style="font-size:12px; color:#cbd5e1; line-height:1.5;">${book.synopsis || 'Belum ada sinopsis.'}</p>
        </div>
      `
    }
    document.getElementById('modal-detail')?.classList.remove('hidden')
  } catch(e) {
    window.showToast('Gagal membuka detail buku', 'error')
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
      <div class="user-item" onclick="openUserProfile('${item.user?.id}')" style="cursor:pointer;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${item.user?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + item.user?.id}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
          <div>
            <h4 style="font-size:12px; font-weight:700; color:#f8fafc;">${item.user?.full_name || 'User'}</h4>
            <p style="font-size:10px; color:#94a3b8;">@${item.user?.username || 'user'}</p>
          </div>
        </div>
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
  setupBannerFormModal()
  setupTagFormModal()
  setupNotifAndSocialModal()
  setupEditProfileModal()
  setupConfirmModalEvents()

  initAppData()
})

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
      <img src="${currentUser.profile?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + currentUser.id}" 
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

  btnOpen?.addEventListener('click', () => modalAuth?.classList.remove('hidden'))
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

function setupBannerFormModal() {
  const modalBanner = document.getElementById('modal-banner-form')
  const btnClose = document.getElementById('close-modal-banner-form')
  const formBanner = document.getElementById('form-banner')

  btnClose?.addEventListener('click', () => modalBanner?.classList.add('hidden'))

  formBanner?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const payload = {
      title: document.getElementById('banner-title').value,
      description: document.getElementById('banner-desc').value || null,
      image_url: document.getElementById('banner-img-url').value,
      link_url: document.getElementById('banner-link-url').value || null
    }

    try {
      const { error } = await supabase.from('banners').insert(payload)
      if (error) throw error
      window.showToast('Banner berhasil ditambahkan!')
      formBanner.reset()
      loadBanners()
      renderAdminBannerList()
    } catch (err) {
      window.showToast('Gagal tambah banner: ' + err.message, 'error')
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
        "cover_url": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500",
        "read_link": "https://kakao.com/solo-leveling",
        "buy_link": "https://tokopedia.com/komik-solo-leveling",
        "synopsis": "Sung Jinwoo pemburu terlemah menjadi terkuat."
      },
      {
        "title": "Omniscient Reader",
        "author": "sing N song",
        "platform": "Webtoon",
        "genre": "Action, Drama",
        "media_type": "Novel",
        "status": "Ongoing",
        "cover_url": "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500",
        "read_link": "https://webtoon.com/orv",
        "buy_link": "https://shopee.co.id/novel-orv",
        "synopsis": "Dunia berubah menjadi web novel favoritnya."
      }
    ]
    const bulkInput = document.getElementById('bulk-json-input')
    if (bulkInput) bulkInput.value = JSON.stringify(template, null, 2)
  })

  formBook?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const id = document.getElementById('book-id').value
    
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
      buy_link: document.getElementById('book-buy-link').value || null,
      synopsis: document.getElementById('book-synopsis').value
    }

    try {
      if (id) {
        const { error } = await supabase.from('books').update(payload).eq('id', id)
        if (error) throw error
        window.showToast('Buku berhasil diperbarui!')
      } else {
        const { error } = await supabase.from('books').insert(payload)
        if (error) throw error
        window.showToast('Buku baru berhasil ditambahkan!')
      }

      modalForm?.classList.add('hidden')
      document.getElementById('modal-detail')?.classList.add('hidden')
      formBook.reset()
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
          synopsis: b.synopsis || null,
          read_link: b.read_link || null,
          buy_link: b.buy_link || null,
          preview_images: Array.isArray(b.preview_images) ? b.preview_images : []
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

  // TAB SWITCHER DI EXPLORE: CARI BUKU vs CARI USER
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
    await loadNotifications()
    await markNotificationsRead()
  })

  btnCloseNotif?.addEventListener('click', () => modalNotif?.classList.add('hidden'))
  btnCloseSocial?.addEventListener('click', () => modalSocial?.classList.add('hidden'))
}

// ==========================================
// 4. DATA FETCHING & RENDERING
// ==========================================
async function loadBanners() {
  const { data: banners } = await supabase.from('banners').select('*').order('created_at', { ascending: false })
  const slider = document.getElementById('banner-slider')
  const dotsContainer = document.getElementById('banner-dots')

  if (!slider || !banners || banners.length === 0) return

  slider.innerHTML = banners.map(b => `
    <div class="banner-item" ${b.link_url ? `onclick="window.open('${b.link_url}', '_blank')"` : ''} style="cursor: ${b.link_url ? 'pointer' : 'default'};">
      <img src="${b.image_url}" class="banner-bg-blur">
      <img src="${b.image_url}" class="banner-img-front">
      <div class="banner-overlay"></div>
      <div class="banner-content">
        <span class="banner-tag">Info / Event</span>
        <h3 style="font-size:15px; font-weight:800; color:white;">${b.title}</h3>
        <p style="font-size:11px; color:#cbd5e1;">${b.description || ''}</p>
      </div>
    </div>
  `).join('')

  if (dotsContainer) {
    dotsContainer.innerHTML = banners.map((_, i) => `<div class="banner-dot ${i === 0 ? 'active' : ''}"></div>`).join('')
  }

  if (bannerInterval) clearInterval(bannerInterval)
  if (banners.length > 1) {
    bannerInterval = setInterval(() => {
      currentSlideIndex = (currentSlideIndex + 1) % banners.length
      slider.style.transform = `translateX(-${currentSlideIndex * 100}%)`
      document.querySelectorAll('.banner-dot').forEach((dot, idx) => {
        if (idx === currentSlideIndex) dot.classList.add('active')
        else dot.classList.remove('active')
      })
    }, 4000)
  }
}

// MEMUAT TAG/GENRE DINAMIS DI MENU EXPLORE
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
      <button class="filter-btn filter-tag-btn ${selectedTags.includes(t) ? 'active' : ''}" data-tag="${t}">${t}</button>
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
      ${t.name}
      <i class="bi bi-x-circle-fill" onclick="deleteTag('${t.id}')" style="cursor:pointer; color:#f87171;"></i>
    </span>
  `).join('')
}

// CAROUSEL HORIZONTAL REKOMENDASI PENGGUNA DI HOME
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
      <img src="${user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.id}" style="width:46px; height:42px; border-radius:50%; object-fit:cover; margin:0 auto 6px; border:2px solid #a855f7;">
      <h4 style="font-size:11px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${user.full_name || 'User'}</h4>
      <p style="font-size:9px; color:#38bdf8; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:8px;">@${user.username || 'user'}</p>
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
      <div style="display:flex; align-items:center; gap:8px;">
        <img src="${b.image_url}" style="width:40px; height:28px; object-fit:cover; border-radius:4px;">
        <span style="font-size:12px; font-weight:600; color:#f8fafc;">${b.title}</span>
      </div>
      <button onclick="deleteBanner('${b.id}')" style="background:#fee2e2; color:#dc2626; border:none; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer;">Hapus</button>
    </div>
  `).join('')
}

// LOGIKA HOME BOOKS (TERMASUK RANDOM EDITOR PICKS)
async function loadHomeBooks() {
  const { data: allBooks } = await supabase.from('books').select('*')
  let editorPicks = []
  
  if (allBooks && allBooks.length > 0) {
    editorPicks = [...allBooks].sort(() => 0.5 - Math.random()).slice(0, 6)
  }
  renderBookHorizontal('list-popular', editorPicks)

  const { data: recommended } = await supabase.from('books').select('*').order('recommendation_count', { ascending: false }).limit(6)
  renderBookHorizontal('list-recommended-home', recommended)

  const { data: newest } = await supabase.from('books').select('*').order('created_at', { ascending: false }).limit(6)
  renderBookHorizontal('list-newest', newest)
}

async function loadExploreBooks() {
  const searchInput = document.getElementById('explore-search')
  const searchQuery = searchInput ? searchInput.value : ''
  let query = supabase.from('books').select('*')

  if (currentMediaFilter !== 'all') query = query.eq('media_type', currentMediaFilter)

  if (selectedTags.length > 0) {
    const orConditions = selectedTags.map(t => `genre.ilike.%${t}%`).join(',')
    query = query.or(orConditions)
  }

  if (searchQuery.trim() !== '') {
    query = query.or(`title.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%,genre.ilike.%${searchQuery}%,platform.ilike.%${searchQuery}%`)
  }

  const { data: books } = await query.order('created_at', { ascending: false })
  renderBookVertical('list-explore', books)
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
        <img src="${user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.id}" style="width:42px; height:42px; border-radius:50%; object-fit:cover; border:1px solid #a855f7;">
        <div>
          <h4 style="font-size:13px; font-weight:700; color:#f8fafc;">
            ${user.full_name || 'User'} ${user.role === 'admin' ? '👑' : ''}
          </h4>
          <p style="font-size:11px; color:#38bdf8;">@${user.username || 'user'}</p>
          ${user.bio ? `<p style="font-size:10px; color:#cbd5e1; margin-top:2px;">${user.bio.substring(0, 45)}...</p>` : ''}
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
        <img src="${book.cover_url || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
        <img src="${book.cover_url || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${book.title}">
        <span class="book-badge">${book.media_type}</span>
      </div>
      <div class="book-info">
        <h3 class="book-title">${book.title}</h3>
        <p class="book-author">${book.author}</p>
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
        <img src="${book.cover_url || 'https://via.placeholder.com/150'}" class="uncropped-cover-bg">
        <img src="${book.cover_url || 'https://via.placeholder.com/150'}" class="uncropped-cover-img" alt="${book.title}">
        <span class="book-badge">${book.media_type}</span>
      </div>
      <div class="book-info">
        <h3 class="book-title">${book.title}</h3>
        <p class="book-author">${book.author}</p>
        ${book.genre ? `<p style="font-size:10px; color:#c084fc; margin-top:2px;">🏷️ ${book.genre}</p>` : ''}
        <div class="book-stats">
          <span>⭐ ${book.recommendation_count || 0} Rekomendasi</span>
        </div>
      </div>
    </div>
  `).join('')
}

async function loadUserBookmarks() {
  if (!currentUser) return
  const { data: bookmarks } = await supabase.from('bookmarks').select('books(*)').eq('user_id', currentUser.id)
  renderBookVertical('list-bookmark', bookmarks ? bookmarks.map(b => b.books) : [])
}

async function loadUserRecommendations() {
  if (!currentUser) return
  const { data: recs } = await supabase.from('recommendations').select('books(*)').eq('user_id', currentUser.id)
  renderBookVertical('list-user-recommended', recs ? recs.map(r => r.books) : [])
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
    })
    return
  }

  const p = currentUser.profile
  const isAdmin = p?.role === 'admin'

  const { count: bookmarkCount } = await supabase.from('bookmarks').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id)
  const { count: recCount } = await supabase.from('recommendations').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id)
  const { count: followersCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', currentUser.id)
  const { count: followingCount } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', currentUser.id)

  tabProfile.innerHTML = `
    <div class="profile-card-hero">
      <div class="profile-bg-banner"></div>
      <div class="profile-avatar-container">
        <img src="${p?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + currentUser.id}" class="profile-avatar-img">
      </div>
      <div class="profile-info-box">
        <h3 style="font-size:16px; font-weight:800; color:#f8fafc;">
          ${p?.full_name || 'User'} ${isAdmin ? '👑' : ''}
        </h3>
        <p style="font-size:12px; color:#38bdf8; font-weight:600;">@${p?.username || 'username'}</p>
        
        <p style="font-size:12px; color:#cbd5e1; margin-top:8px; line-height:1.4;">
          ${p?.bio || 'Belum ada bio.'}
        </p>

        <button onclick="openEditProfileModal()" style="margin:12px auto 0; padding:6px 14px; background:rgba(168,85,247,0.2); color:#e9d5ff; border:1px solid rgba(168,85,247,0.4); border-radius:9999px; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
          <i class="bi bi-pencil-square"></i> Edit Profil
        </button>

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

        <div style="padding-top:8px;">
          <h5 style="font-size:12px; font-weight:700; color:#f8fafc; margin-bottom:8px;">📚 Buku yang Ada di Semesta</h5>
          <div id="admin-books-list" class="space-y-2"></div>
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
      renderAdminBannerList()
    })
    document.getElementById('btn-admin-tag')?.addEventListener('click', () => {
      document.getElementById('modal-tag-form')?.classList.remove('hidden')
      renderAdminTagList()
    })
    loadAdminBooksList()
  }
  document.getElementById('btn-logout')?.addEventListener('click', logout)
}

async function loadAdminBooksList() {
  const container = document.getElementById('admin-books-list')
  if (!container) return

  const { data: books } = await supabase.from('books').select('*').order('created_at', { ascending: false })

  if (!books || books.length === 0) {
    container.innerHTML = `<p style="font-size:11px; color:#94a3b8;">Belum ada buku yang ditambahkan.</p>`
    return
  }

  container.innerHTML = books.map(b => `
    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:12px; border:1px solid rgba(168,85,247,0.15);">
      <div style="display:flex; align-items:center; gap:10px; flex:1; overflow:hidden;">
        <img src="${b.cover_url || 'https://via.placeholder.com/50'}" style="width:36px; height:50px; object-fit:cover; border-radius:6px; flex-shrink:0;">
        <div style="overflow:hidden;">
          <h5 style="font-size:12px; font-weight:700; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.title}</h5>
          <p style="font-size:10px; color:#94a3b8;">${b.author} • <span style="color:#c084fc;">${b.media_type}</span> ${b.platform ? `• <span style="color:#38bdf8;">${b.platform}</span>` : ''}</p>
        </div>
      </div>
      <div style="display:flex; gap:6px; margin-left:8px;">
        <button onclick="openBookFormById('${b.id}')" style="background:rgba(99,102,241,0.25); color:#c7d2fe; border:1px solid rgba(99,102,241,0.4); padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
          ✏️ Edit
        </button>
        <button onclick="deleteBook('${b.id}')" style="background:rgba(239,68,68,0.25); color:#fca5a5; border:1px solid rgba(239,68,68,0.4); padding:6px 10px; border-radius:8px; font-size:11px; font-weight:700; cursor:pointer;">
          🗑️
        </button>
      </div>
    </div>
  `).join('')
}

async function checkUnreadNotifications() {
  if (!currentUser) return
  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('is_read', false)
  const badgeDot = document.getElementById('notif-badge-dot')
  if (count && count > 0) badgeDot?.classList.remove('hidden')
  else badgeDot?.classList.add('hidden')
}

async function loadNotifications() {
  const container = document.getElementById('notif-list-container')
  if (!container) return
  const { data: notifs } = await supabase.from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(*), book:books(*)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })

  if (!notifs || notifs.length === 0) {
    container.innerHTML = `<p style="font-size:12px; color:#94a3b8; text-align:center; padding:16px 0;">Belum ada notifikasi.</p>`
    return
  }

  container.innerHTML = notifs.map(n => `
    <div class="notif-item ${!n.is_read ? 'unread' : ''}" ${n.actor_id ? `onclick="openUserProfile('${n.actor_id}')"` : ''} style="cursor:pointer;">
      <img src="${n.actor?.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + n.actor_id}" class="notif-avatar">
      <div class="notif-text">
        <b>${n.actor?.full_name || 'Seseorang'}</b> 
        ${n.type === 'follow' ? 'mulai mengikuti kamu.' : `merekomendasikan buku <b>${n.book?.title || ''}</b>.`}
        <span class="notif-time">${new Date(n.created_at).toLocaleDateString('id-ID')}</span>
      </div>
    </div>
  `).join('')
}

async function markNotificationsRead() {
  if (!currentUser) return
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id)
  document.getElementById('notif-badge-dot')?.classList.add('hidden')
}
