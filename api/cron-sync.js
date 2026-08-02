import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Hanya ijinkan method GET atau request dari Vercel Cron
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase Environment Variables' });
  }

  // Gunakan Service Role Key agar bisa update data tanpa terhalang RLS
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Ambil buku yang punya link Twitter AU tapi thread_images-nya masih kosong/null
    const { data: books, error: fetchError } = await supabase
      .from('books')
      .select('id, read_link_2, title')
      .not('read_link_2', 'is', null)
      .or('thread_images.is.null,thread_images.eq.[]');

    if (fetchError) throw fetchError;

    if (!books || books.length === 0) {
      return res.status(200).json({ message: 'Tidak ada buku yang perlu disinkronisasi.' });
    }

    const updatedBooks = [];

    // 2. Loop tiap buku dan ekstrak Tweet ID
    for (const book of books) {
      const match = book.read_link_2.match(/status\/(\d+)/);
      if (!match || !match[1]) continue;

      const tweetId = match[1];

      // 3. Panggil API internal unroll
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host;
      const unrollUrl = `${protocol}://${host}/api/unroll?id=${tweetId}`;

      const unrollRes = await fetch(unrollUrl);
      if (unrollRes.ok) {
        const unrollData = await unrollRes.json();
        if (unrollData.success && unrollData.images && unrollData.images.length > 0) {
          // 4. Update data buku di Supabase
          const { error: updateError } = await supabase
            .from('books')
            .update({
              thread_images: unrollData.images,
              last_synced_at: new Date().toISOString()
            })
            .eq('id', book.id);

          if (!updateError) {
            updatedBooks.push({ title: book.title, imagesCount: unrollData.images.length });
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      processed: updatedBooks.length,
      details: updatedBooks
    });

  } catch (err) {
    console.error('Cron sync error:', err);
    return res.status(500).json({ error: 'Gagal menjalankan cron sync: ' + err.message });
  }
}

