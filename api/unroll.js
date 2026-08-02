// api/unroll.js (FiksiVerse Nitter SSR Thread Engine)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Tweet ID tidak ditemukan' });

  const rawImages = [];

  // Daftar Nitter Mirrors (HTML Full Thread Tanpa SPA/JavaScript)
  const nitterInstances = [
    `https://nitter.poast.org/i/status/${id}`,
    `https://nitter.privacydev.net/i/status/${id}`,
    `https://nitter.space/i/status/${id}`
  ];

  // 1. ENGINE UTAMA: Sedot dari Nitter SSR
  for (const url of nitterInstances) {
    try {
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
        },
        signal: AbortSignal.timeout(4000) // Timeout 4 detik per mirror
      });

      if (response.ok) {
        const html = await response.text();
        // Ekstrak semua URL foto Twitter pbs.twimg.com/media/...
        const matches = html.match(/https:\/\/pbs\.twimg\.com\/media\/[a-zA-Z0-9_-]+(?:\?format=[a-zA-Z]+&name=[a-zA-Z0-9_]+|\.[a-zA-Z]+)?/g) || [];
        
        if (matches.length > 0) {
          matches.forEach(m => rawImages.push(m));
          break; // Kalau udah dapet gambarnya, stop pencarian
        }
      }
    } catch (e) {
      console.log(`Nitter mirror error: ${url}`);
    }
  }

  // 2. ENGINE FALLBACK: FXTwitter API
  if (rawImages.length === 0) {
    try {
      const fxRes = await fetch(`https://api.fxtwitter.com/status/${id}`);
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        const tweet = fxData.tweet;
        if (tweet) {
          if (tweet.media?.photos) tweet.media.photos.forEach(p => rawImages.push(p.url));
          if (tweet.thread && Array.isArray(tweet.thread)) {
            tweet.thread.forEach(t => {
              if (t.media?.photos) t.media.photos.forEach(p => rawImages.push(p.url));
            });
          }
        }
      }
    } catch (e) {
      console.log('FX API fallback error');
    }
  }

  // Deduplikasi & Ubah ke Format HD
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
}
