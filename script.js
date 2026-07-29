/**
 * FIKSIVERSE - SPA ENGINE & STATE MANAGEMENT
 * Integrated with Supabase Cloud Database
 */

// 1. HELPER ANTI-BUG GENRE
function parseGenreData(rawGenre) {
    if (!rawGenre) return [];
    if (Array.isArray(rawGenre)) {
        return rawGenre.map(g => String(g).replace(/[\[\]"]/g, '').trim()).filter(Boolean);
    }
    if (typeof rawGenre === 'string') {
        try {
            const parsed = JSON.parse(rawGenre);
            if (Array.isArray(parsed)) {
                return parsed.map(g => String(g).replace(/[\[\]"]/g, '').trim()).filter(Boolean);
            }
        } catch (e) {}
        return rawGenre.replace(/[\[\]"]/g, '').split(',').map(g => g.trim()).filter(Boolean);
    }
    return [];
}

// 2. SUPABASE CONFIGURATION
const SUPABASE_URL = 'https://nqyzdbsgboeyazxkgaeu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xeXpkYnNnYm9leWF6eGtnYWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDc3MjIsImV4cCI6MjEwMDgyMzcyMn0.BBYxWckApOakeNa7E0T0oj6y7De2GHglfdqQV65h078';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const APP_KEYS = {
    GENRES: 'fiksidev_genres_data',
    ADMIN_AUTH: 'fiksidev_admin_logged'
};

const DEFAULT_GENRES = [
    "Action", "Fantasy", "Adventure", "Supernatural", "Apocalyptic", 
    "Psychological", "Isekai", "Magic", "School", "Drama", 
    "Mystery", "Xianxia", "Historical", "Romance", "Angst", 
    "Slice of Life", "Teen Fiction", "Horror", "Thriller", "Sci-Fi", 
    "Comedy", "Building", "Spy", "Martial Arts", "Social", 
    "Tragedy", "Eldritch", "Gaming", "Sports", "Biography"
];

const DEFAULT_MEDIA = [
    "Novel", "Komik", "AU Sosmed"
];

const DEFAULT_BANNERS = [
    {
        id: 1,
        title: "Solo Leveling: Kebangkitan Sang Shadow Monarch",
        subtitle: "Ikuti perjalanan Sung Jinwoo dari Hunter terlemah menjadi entitas terkuat.",
        bookId: null,
        image: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80"
    }
];

class FiksiVerseApp {
    constructor() {
        this.books = [];
        this.genres = [];
        this.banners = [];
        this.mediaTypes = DEFAULT_MEDIA;
        
        this.currentView = 'home';
        this.lastView = 'home';
        
        this.exploreState = {
            search: '',
            media: 'all',
            genre: 'all',
            status: 'all',
            sort: 'latest',
            page: 1,
            itemsPerPage: 12
        };

        this.bannerIndex = 0;
        this.bannerTimer = null;
    }

    /* ==========================================
       1. INITIALIZATION & DATA SYNC
       ========================================== */
    async init() {
        this.initDOMListeners();
        await this.loadInitialData();
        this.populateFilterDropdowns();
        this.handleHashRouting();
        this.initBackToTop();
        this.renderHome();
        this.startBannerAutoplay();
    }

    async loadInitialData() {
        const localGenres = localStorage.getItem(APP_KEYS.GENRES);
        this.genres = localGenres ? JSON.parse(localGenres) : DEFAULT_GENRES;

        await Promise.all([
            this.fetchBooksFromSupabase(),
            this.fetchBannersFromSupabase()
        ]);
    }

    async fetchBooksFromSupabase() {
        try {
            const { data, error } = await supabaseClient
                .from('books')
                .select('*')
                .order('id', { ascending: false });

            if (error) throw error;

            this.books = (data || []).map(b => ({
                id: b.id,
                judul: b.judul || 'Tanpa Judul',
                judulAlternatif: b.judul_alternatif || b.judulAlternatif || '',
                cover: b.cover || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500&auto=format&fit=crop&q=80',
                media: b.media || 'Novel',
                genre: parseGenreData(b.genre),
                status: b.status || 'Ongoing',
                penulis: b.penulis || 'Anonim',
                platform: b.platform || 'Lainnya',
                sinopsis: b.sinopsis || 'Tidak ada sinopsis.',
                link: b.link || '#'
            }));

        } catch (err) {
            console.error('Fetch books error:', err);
            this.books = [];
        }
    }

    async fetchBannersFromSupabase() {
        try {
            const { data, error } = await supabaseClient
                .from('banners')
                .select('*')
                .order('id', { ascending: true });

            if (error || !data || data.length === 0) {
                this.banners = DEFAULT_BANNERS;
                return;
            }

            this.banners = data.map(b => ({
                id: b.id,
                title: b.title || '',
                subtitle: b.subtitle || '',
                image: b.image || '',
                bookId: b.book_id || null
            }));

        } catch (err) {
            console.error('Fetch banners error:', err);
            this.banners = DEFAULT_BANNERS;
        }
    }

    /* ==========================================
       2. SPA ROUTING & NAVIGATION
       ========================================== */
    navigateTo(viewName, param = null) {
        if (this.currentView !== viewName) {
            this.lastView = this.currentView;
        }
        this.currentView = viewName;

        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.add('hidden');
            sec.classList.remove('active');
        });

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.classList.remove('hidden');
            setTimeout(() => targetView.classList.add('active'), 10);
        }

        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-target') === viewName);
        });

        const navMenu = document.getElementById('nav-menu');
        if (navMenu) navMenu.classList.remove('open');

        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (viewName === 'home') this.renderHome();
        else if (viewName === 'explore') {
            if (param && typeof param === 'object') {
                if (param.search) this.exploreState.search = param.search;
                if (param.media) this.exploreState.media = param.media;
            }
            this.syncFilterInputs();
            this.applyFilters();
        } else if (viewName === 'detail') {
            if (param) this.renderDetail(param);
        } else if (viewName === 'admin') {
            if (!this.isLoggedIn()) {
                this.navigateTo('login');
                return;
            }
            this.renderAdmin();
        }

        window.location.hash = viewName === 'detail' ? `detail-${param}` : viewName;
    }

    backToLastView() {
        this.navigateTo(this.lastView && this.lastView !== 'detail' ? this.lastView : 'explore');
    }

    handleHashRouting() {
        const hash = window.location.hash.replace('#', '');
        if (hash.startsWith('detail-')) {
            const bookId = parseInt(hash.replace('detail-', ''));
            this.navigateTo('detail', bookId);
        } else if (['home', 'explore', 'login', 'admin'].includes(hash)) {
            this.navigateTo(hash);
        }
    }

    /* ==========================================
       3. DOM HELPERS & UTILS
       ========================================== */
    initDOMListeners() {
        const mobileToggle = document.getElementById('mobile-toggle');
        const navMenu = document.getElementById('nav-menu');
        if (mobileToggle && navMenu) {
            mobileToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
        }

        window.addEventListener('hashchange', () => this.handleHashRouting());
    }

    initBackToTop() {
        const btt = document.getElementById('back-to-top');
        if (!btt) return;
        window.addEventListener('scroll', () => {
            btt.classList.toggle('visible', window.scrollY > 300);
        });
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> <span>${message}</span>`;
        
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    /* ==========================================
       4. VIEW RENDERERS: HOME VIEW
       ========================================== */
    renderHome() {
        this.renderQuickTags();
        this.renderBannerSlider();
        this.renderEditorRecommendations();
        this.renderRecentAdded();
    }

    renderQuickTags() {
        const container = document.getElementById('quick-media-tags');
        if (!container) return;
        container.innerHTML = this.mediaTypes.map(m => `
            <button class="quick-tag-item" onclick="app.navigateTo('explore', { media: '${m}' })">
                <i class="bi bi-bookmark"></i> ${m}
            </button>
        `).join('');
    }

        renderBannerSlider() {
        const wrapper = document.getElementById('banner-wrapper');
        const dotsContainer = document.getElementById('banner-dots');
        if (!wrapper || !this.banners.length) return;

        wrapper.innerHTML = this.banners.map(b => `
            <div class="banner-slide" style="background-image: url('${b.image}')" onclick="app.onBannerClick(${b.bookId})">
                <div class="banner-overlay"></div>
                <span class="badge-status badge-sorotan"><i class="bi bi-star-fill"></i> Sorotan Utama</span>
                <div class="banner-content">
                    <h2 class="banner-title">${b.title}</h2>
                    <p class="banner-sub">${b.subtitle}</p>
                </div>
            </div>
        `).join('');

        if (dotsContainer) {
            dotsContainer.innerHTML = this.banners.map((_, idx) => `
                <div class="dot ${idx === this.bannerIndex ? 'active' : ''}" onclick="app.setBannerSlide(${idx})"></div>
            `).join('');
        }

        this.updateBannerPosition();
    }

    updateBannerPosition() {
        const wrapper = document.getElementById('banner-wrapper');
        if (wrapper) wrapper.style.transform = `translateX(-${this.bannerIndex * 100}%)`;
        document.querySelectorAll('.banner-dots .dot').forEach((dot, idx) => {
            dot.classList.toggle('active', idx === this.bannerIndex);
        });
    }

    nextBanner() {
        if (!this.banners.length) return;
        this.bannerIndex = (this.bannerIndex + 1) % this.banners.length;
        this.updateBannerPosition();
    }

    prevBanner() {
        if (!this.banners.length) return;
        this.bannerIndex = (this.bannerIndex - 1 + this.banners.length) % this.banners.length;
        this.updateBannerPosition();
    }

    setBannerSlide(index) {
        this.bannerIndex = index;
        this.updateBannerPosition();
    }

    startBannerAutoplay() {
        if (this.bannerTimer) clearInterval(this.bannerTimer);
        this.bannerTimer = setInterval(() => this.nextBanner(), 6000);
    }

    onBannerClick(bookId) {
        if (bookId) this.navigateTo('detail', bookId);
    }

    renderEditorRecommendations() {
        const grid = document.getElementById('editor-grid');
        if (!grid || !this.books.length) return;

        // Bikin rekomendasi tampil variatif (random shuffle 6 buku)
        const shuffled = [...this.books].sort(() => 0.5 - Math.random());
        grid.innerHTML = shuffled.slice(0, 6).map(b => this.generateBookCardHTML(b)).join('');
    }

    renderRecentAdded() {
        const grid = document.getElementById('recent-grid');
        if (!grid || !this.books.length) return;

        // Tampilkan 6 buku paling baru (berdasarkan ID terbesar)
        const recent = [...this.books].sort((a, b) => b.id - a.id).slice(0, 6);
        grid.innerHTML = recent.map(b => this.generateBookCardHTML(b)).join('');
    }

    handleHeroSearch(event) {
        event.preventDefault();
        const query = document.getElementById('hero-search-input').value.trim();
        if (query) this.navigateTo('explore', { search: query });
    }

    generateBookCardHTML(book) {
        const statusClass = `status-${book.status ? book.status.toLowerCase() : 'ongoing'}`;
        const cleanGenres = parseGenreData(book.genre);
        
        return `
            <div class="book-card" onclick="app.navigateTo('detail', ${book.id})">
                <div class="card-cover-wrapper">
                    <img src="${book.cover}" alt="${book.judul}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500&auto=format&fit=crop&q=80'">
                    <span class="badge-status ${statusClass}">${book.status}</span>
                    <span class="badge-media">${book.media}</span>
                </div>
                <div class="card-body">
                    <h3 class="card-title">${book.judul}</h3>
                    <p class="card-author"><i class="bi bi-pen"></i> ${book.penulis}</p>
                    <div class="card-genres">
                        ${cleanGenres.slice(0, 3).map(g => `<span class="genre-tag">${g}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /* ==========================================
       5. VIEW RENDERERS: EXPLORE & FILTERS
       ========================================== */
    populateFilterDropdowns() {
        const mediaSelect = document.getElementById('filter-media');
        const genreSelect = document.getElementById('filter-genre');
        const bookMediaModal = document.getElementById('book-media');

        if (mediaSelect) {
            mediaSelect.innerHTML = '<option value="all">Semua Media</option>' + 
                this.mediaTypes.map(m => `<option value="${m}">${m}</option>`).join('');
            mediaSelect.value = 'all';
        }

        if (genreSelect) {
            genreSelect.innerHTML = '<option value="all">Semua Genre</option>' + 
                this.genres.map(g => `<option value="${g}">${g}</option>`).join('');
            genreSelect.value = 'all';
        }

        if (bookMediaModal) {
            bookMediaModal.innerHTML = this.mediaTypes.map(m => `<option value="${m}">${m}</option>`).join('');
        }
    }

    syncFilterInputs() {
        const searchInput = document.getElementById('explore-search-input');
        const mediaSelect = document.getElementById('filter-media');
        const genreSelect = document.getElementById('filter-genre');
        const statusSelect = document.getElementById('filter-status');
        const sortSelect = document.getElementById('filter-sort');

        if (searchInput) searchInput.value = this.exploreState.search || '';
        if (mediaSelect) mediaSelect.value = this.exploreState.media || 'all';
        if (genreSelect) genreSelect.value = this.exploreState.genre || 'all';
        if (statusSelect) statusSelect.value = this.exploreState.status || 'all';
        if (sortSelect) sortSelect.value = this.exploreState.sort || 'latest';
    }

    applyFilters() {
        const searchInput = document.getElementById('explore-search-input');
        const mediaSelect = document.getElementById('filter-media');
        const genreSelect = document.getElementById('filter-genre');
        const statusSelect = document.getElementById('filter-status');
        const sortSelect = document.getElementById('filter-sort');

        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const mediaVal = (mediaSelect && mediaSelect.value) ? mediaSelect.value : 'all';
        const genreVal = (genreSelect && genreSelect.value) ? genreSelect.value : 'all';
        const statusVal = (statusSelect && statusSelect.value) ? statusSelect.value : 'all';
        const sortVal = (sortSelect && sortSelect.value) ? sortSelect.value : 'latest';

        this.exploreState.search = searchVal;
        this.exploreState.media = mediaVal;
        this.exploreState.genre = genreVal;
        this.exploreState.status = statusVal;
        this.exploreState.sort = sortVal;

        let filtered = this.books.filter(b => {
            const titleMatch = b.judul && b.judul.toLowerCase().includes(searchVal);
            const altMatch = b.judulAlternatif && b.judulAlternatif.toLowerCase().includes(searchVal);
            const authorMatch = b.penulis && b.penulis.toLowerCase().includes(searchVal);
            
            const matchSearch = !searchVal || titleMatch || altMatch || authorMatch;
            const matchMedia = mediaVal === 'all' || b.media === mediaVal;
            
            const bookGenres = parseGenreData(b.genre);
            const matchGenre = genreVal === 'all' || bookGenres.includes(genreVal);
            
            const matchStatus = statusVal === 'all' || b.status === statusVal;

            return matchSearch && matchMedia && matchGenre && matchStatus;
        });

        if (sortVal === 'az') filtered.sort((a, b) => (a.judul || '').localeCompare(b.judul || ''));
        else if (sortVal === 'za') filtered.sort((a, b) => (b.judul || '').localeCompare(a.judul || ''));
        else filtered.sort((a, b) => b.id - a.id);

        this.renderExploreResults(filtered);
    }

    resetFilters() {
        this.exploreState = { search: '', media: 'all', genre: 'all', status: 'all', sort: 'latest', page: 1, itemsPerPage: 12 };
        this.syncFilterInputs();
        this.applyFilters();
    }

    toggleFilterDrawer() {
        const drawer = document.getElementById('filter-drawer');
        if (!drawer) return;
        drawer.classList.toggle('hidden');
    }

    renderExploreResults(filteredBooks) {
        const grid = document.getElementById('explore-grid');
        const emptyState = document.getElementById('explore-empty-state');
        const countText = document.getElementById('results-count-text');

        if (countText) countText.textContent = `Menampilkan ${filteredBooks.length} bacaan`;

        if (!filteredBooks.length) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        grid.innerHTML = filteredBooks.map(b => this.generateBookCardHTML(b)).join('');
    }

    /* ==========================================
       6. DETAIL VIEW
       ========================================== */
    renderDetail(bookId) {
        const container = document.getElementById('detail-container');
        const book = this.books.find(b => b.id === bookId);

        if (!book) {
            container.innerHTML = `<div class="text-center p-5"><h3>Buku tidak ditemukan.</h3></div>`;
            return;
        }

        const genreArray = parseGenreData(book.genre);

        container.innerHTML = `
            <div class="detail-cover">
                <img src="${book.cover}" alt="${book.judul}" onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500&auto=format&fit=crop&q=80'">
            </div>
            <div class="detail-info">
                <h1 style="font-size: 1.5rem; font-weight: 800; line-height: 1.25; margin-bottom: 0.3rem;">${book.judul}</h1>
                ${book.judulAlternatif ? `<p class="text-muted" style="font-size: 0.85rem; margin-bottom: 0.8rem;"><em>${book.judulAlternatif}</em></p>` : ''}
                
                <div class="detail-meta-list">
                    <div class="detail-meta-item"><span>Penulis</span><strong>${book.penulis}</strong></div>
                    <div class="detail-meta-item"><span>Media</span><strong>${book.media}</strong></div>
                    <div class="detail-meta-item"><span>Status</span><strong>${book.status}</strong></div>
                    <div class="detail-meta-item"><span>Platform</span><strong>${book.platform}</strong></div>
                </div>

                <div class="mb-3" style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
                    ${genreArray.map(g => `<span class="genre-tag" style="font-size: 0.75rem; padding: 4px 10px;">${g}</span>`).join('')}
                </div>

                <h3 style="font-size: 1.05rem; font-weight: 700; margin-top: 1.2rem; margin-bottom: 0.4rem;">
                    <i class="bi bi-text-paragraph text-primary"></i> Sinopsis
                </h3>
                <p class="text-muted" style="white-space: pre-line; font-size: 0.88rem; line-height: 1.6;">${book.sinopsis}</p>

                <div class="mt-4">
                    <a href="${book.link}" target="_blank" class="btn btn-primary w-full" style="padding: 0.7rem 1.2rem; font-size: 0.9rem;">
                        <i class="bi bi-box-arrow-up-right"></i> Baca di ${book.platform}
                    </a>
                </div>
            </div>
        `;
    }

    /* ==========================================
       7. ADMIN AUTH & DASHBOARD
       ========================================== */
    isLoggedIn() {
        return localStorage.getItem(APP_KEYS.ADMIN_AUTH) === 'true';
    }

    handleLogin(e) {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;

        if (u === 'GemuruhAngin' && p === 'PutingBeliung') {
            localStorage.setItem(APP_KEYS.ADMIN_AUTH, 'true');
            this.showToast('Login Admin Berhasil!', 'success');
            this.navigateTo('admin');
        } else {
            this.showToast('Username/Password salah', 'error');
        }
    }

    handleLogout() {
        localStorage.removeItem(APP_KEYS.ADMIN_AUTH);
        this.showToast('Logout Berhasil', 'success');
        this.navigateTo('home');
    }

    switchAdminTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

        if (tabName === 'books') {
            document.querySelectorAll('.tab-btn')[0].classList.add('active');
            document.getElementById('admin-tab-books').classList.remove('hidden');
        } else {
            document.querySelectorAll('.tab-btn')[1].classList.add('active');
            document.getElementById('admin-tab-banners').classList.remove('hidden');
        }
    }

    renderAdmin() {
        this.renderAdminBooksTable();
        this.renderAdminBanners();
    }

    renderAdminBooksTable() {
        const tbody = document.getElementById('admin-books-table-body');
        if (!tbody) return;

        tbody.innerHTML = this.books.map(b => `
            <tr>
                <td><img src="${b.cover}" width="40" height="55" style="object-fit:cover; border-radius:4px;"></td>
                <td><strong>${b.judul}</strong><br><small class="text-muted">${b.penulis}</small></td>
                <td>${b.media}</td>
                <td><span class="badge-status status-${b.status.toLowerCase()}">${b.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="app.openBookModal(${b.id})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteBook(${b.id})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    renderAdminBanners() {
        const grid = document.getElementById('admin-banners-grid');
        if (!grid) return;

        grid.innerHTML = this.banners.map(b => `
            <div class="card p-3" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:1rem;">
                <img src="${b.image}" width="100%" height="120" style="object-fit:cover; border-radius:6px;" class="mb-2">
                <p class="font-bold mb-1">${b.title}</p>
                <small class="text-muted">${b.subtitle}</small>
                <div class="mt-2 flex justify-between">
                    <button class="btn btn-sm btn-secondary" onclick="app.openBannerModal(${b.id})"><i class="bi bi-pencil"></i> Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="app.deleteBanner(${b.id})"><i class="bi bi-trash"></i> Hapus</button>
                </div>
            </div>
        `).join('');
    }

    /* ==========================================
       8. CRUD MODALS LOGIC (SUPABASE CLOUD)
       ========================================== */
    openBookModal(bookId = null) {
        const modal = document.getElementById('book-modal');
        const form = document.getElementById('book-form');
        if (form) form.reset();
        document.getElementById('book-id').value = '';

        if (bookId) {
            const b = this.books.find(x => x.id === bookId);
            if (b) {
                document.getElementById('book-id').value = b.id;
                document.getElementById('book-judul').value = b.judul;
                document.getElementById('book-judul-alt').value = b.judulAlternatif;
                document.getElementById('book-media').value = b.media;
                document.getElementById('book-status').value = b.status;
                document.getElementById('book-penulis').value = b.penulis;
                document.getElementById('book-platform').value = b.platform;
                document.getElementById('book-cover').value = b.cover;
                document.getElementById('book-link').value = b.link;
                
                const cleanGenres = parseGenreData(b.genre);
                document.getElementById('book-genre').value = cleanGenres.join(', ');
                document.getElementById('book-sinopsis').value = b.sinopsis;
            }
        }
        if (modal) modal.classList.remove('hidden');
    }

    closeBookModal() {
        const modal = document.getElementById('book-modal');
        if (modal) modal.classList.add('hidden');
    }

    async handleSaveBook(e) {
        e.preventDefault();
        const id = document.getElementById('book-id').value;
        
        const rawGenreInput = document.getElementById('book-genre').value;
        const cleanGenreArray = parseGenreData(rawGenreInput);

        const payload = {
            judul: document.getElementById('book-judul').value.trim(),
            judul_alternatif: document.getElementById('book-judul-alt').value.trim(),
            media: document.getElementById('book-media').value,
            status: document.getElementById('book-status').value,
            penulis: document.getElementById('book-penulis').value.trim(),
            platform: document.getElementById('book-platform').value.trim(),
            cover: document.getElementById('book-cover').value.trim(),
            link: document.getElementById('book-link').value.trim(),
            genre: cleanGenreArray,
            sinopsis: document.getElementById('book-sinopsis').value.trim()
        };

        try {
            if (id) {
                const { error } = await supabaseClient.from('books').update(payload).eq('id', parseInt(id));
                if (error) throw error;
                this.showToast('Buku diperbarui!', 'success');
            } else {
                const { error } = await supabaseClient.from('books').insert([payload]);
                if (error) throw error;
                this.showToast('Buku ditambahkan!', 'success');
            }

            this.closeBookModal();
            await this.fetchBooksFromSupabase();
            this.renderAdmin();
            this.renderHome();
        } catch (err) {
            console.error('Save book error:', err);
            this.showToast('Gagal menyimpan buku', 'error');
        }
    }

    async deleteBook(id) {
        if (!confirm('Hapus buku ini dari cloud?')) return;
        try {
            const { error } = await supabaseClient.from('books').delete().eq('id', id);
            if (error) throw error;
            this.showToast('Buku dihapus', 'success');
            await this.fetchBooksFromSupabase();
            this.renderAdmin();
            this.renderHome();
        } catch (err) {
            this.showToast('Gagal menghapus buku', 'error');
        }
    }

    openBannerModal(bannerId = null) {
        const modal = document.getElementById('banner-modal');
        const form = document.getElementById('banner-form');
        if (form) form.reset();
        document.getElementById('banner-id').value = '';

        if (bannerId) {
            const b = this.banners.find(x => x.id === bannerId);
            if (b) {
                document.getElementById('banner-id').value = b.id;
                document.getElementById('banner-title').value = b.title;
                document.getElementById('banner-subtitle').value = b.subtitle;
                document.getElementById('banner-image').value = b.image;
                document.getElementById('banner-book-id').value = b.bookId || '';
            }
        }
        if (modal) modal.classList.remove('hidden');
    }

    closeBannerModal() {
        const modal = document.getElementById('banner-modal');
        if (modal) modal.classList.add('hidden');
    }

    async handleSaveBanner(e) {
        e.preventDefault();
        const id = document.getElementById('banner-id').value;
        const bookIdVal = document.getElementById('banner-book-id').value;

        const payload = {
            title: document.getElementById('banner-title').value.trim(),
            subtitle: document.getElementById('banner-subtitle').value.trim(),
            image: document.getElementById('banner-image').value.trim(),
            book_id: bookIdVal ? parseInt(bookIdVal) : null
        };

        try {
            if (id) {
                const { error } = await supabaseClient.from('banners').update(payload).eq('id', parseInt(id));
                if (error) throw error;
                this.showToast('Banner diperbarui!', 'success');
            } else {
                const { error } = await supabaseClient.from('banners').insert([payload]);
                if (error) throw error;
                this.showToast('Banner ditambahkan!', 'success');
            }

            this.closeBannerModal();
            await this.fetchBannersFromSupabase();
            this.renderAdmin();
            this.renderHome();
        } catch (err) {
            console.error('Save banner error:', err);
            this.showToast('Gagal menyimpan banner', 'error');
        }
    }

    async deleteBanner(id) {
        if (!confirm('Hapus banner ini?')) return;
        try {
            const { error } = await supabaseClient.from('banners').delete().eq('id', id);
            if (error) throw error;
            this.showToast('Banner dihapus', 'success');
            await this.fetchBannersFromSupabase();
            this.renderAdmin();
            this.renderHome();
        } catch (err) {
            this.showToast('Gagal menghapus banner', 'error');
        }
    }
}

// Inisialisasi Aplikasi Saat DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new FiksiVerseApp();
    window.app.init();
});
