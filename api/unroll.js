// api/unroll.js (FiksiVerse Full Thread Unroller Engine)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Tweet ID tidak ditemukan' });
  }

  const rawImages = [];

  try {
    // 1. ENGINE UTAMA: Jina AI Headless Reader (Render JavaScript twitter-thread.com)
    try {
      const jinaTarget = `https://r.jina.ai/https://twitter-thread.com/thread/${id}`;
      const jinaRes = await fetch(jinaTarget, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (jinaRes.ok) {
        const text = await jinaRes.text();
        const matches = text.match(/https:\/\/pbs\.twimg\.com\/media\/[a-zA-Z0-9_-]+(?:\?format=[a-zA-Z]+&name=[a-zA-Z0-9_]+|\.[a-zA-Z]+)?/g) || [];
        matches.forEach(m => rawImages.push(m));
      }
    } catch (e) {
      console.log('Jina Engine 1 Error:', e);
    }

    // 2. ENGINE CADANGAN: Jina AI Headless Reader (Render ThreadReaderApp)
    if (rawImages.length <= 4) {
      try {
        const jinaTarget2 = `https://r.jina.ai/https://threadreaderapp.com/thread/${id}.html`;
        const jinaRes2 = await fetch(jinaTarget2);

        if (jinaRes2.ok) {
          const text2 = await jinaRes2.text();
          const matches2 = text2.match(/https:\/\/pbs\.twimg\.com\/media\/[a-zA-Z0-9_-]+(?:\?format=[a-zA-Z]+&name=[a-zA-Z0-9_]+|\.[a-zA-Z]+)?/g) || [];
          matches2.forEach(m => rawImages.push(m));
        }
      } catch (e) {
        console.log('Jina Engine 2 Error:', e);
      }
    }

    // 3. ENGINE FALLBACK: FXTwitter API
    if (rawImages.length === 0) {
      try {
        const fxRes = await fetch(`https://api.fxtwitter.com/status/${id}`);
        if (fxRes.ok) {
          const fxData = await fxRes.json();
          const tweet = fxData.tweet;
          if (tweet) {
            if (tweet.media?.photos) tweet.media.photos.forEach(p => rawImages.push(p.url));
            if (tweet.media_urls) tweet.media_urls.forEach(u => rawImages.push(u));

            if (tweet.thread && Array.isArray(tweet.thread)) {
              tweet.thread.forEach(t => {
                if (t.media?.photos) t.media.photos.forEach(p => rawImages.push(p.url));
                if (t.media_urls) t.media_urls.forEach(u => rawImages.push(u));
              });
            }
          }
        }
      } catch (e) {
        console.log('FX API Error:', e);
      }
    }

    // Deduplikasi Gambar & Format HD
    const imageMap = new Map();
    rawImages.forEach(url => {
      const match = url.match(/media\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        const imgId = match[1];
        if (!imageMap.has(imgId) && !url.includes('profile_images') && !url.includes('emoji')) {
          imageMap.set(imgId, `https://pbs.twimg.com/media/${imgId}?format=jpg&name=large`);
        }
      }
    });

    const images = Array.from(imageMap.values());

    if (images.length === 0) {
      return res.status(404).json({ error: 'Naskah AU tidak ditemukan atau akun diprivat.' });
    }

    return res.status(200).json({ success: true, count: images.length, images });

  } catch (err) {
    return res.status(500).json({ error: 'Gagal memproses thread dari server.' });
  }
}
