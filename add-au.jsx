import { useState } from 'react';
import { supabase } from './supabaseClient'; // Pastikan path-nya sesuai posisi file supabaseClient.js lo

export default function AdminForm() {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [platform, setPlatform] = useState('X/Twitter');
  
  // State buat nampung array of link parts
  const [parts, setParts] = useState([{ part: 1, title: 'Part 1', url: '' }]);
  const [loading, setLoading] = useState(false);

  // Fungsi buat nambah kolom input Part baru
  const handleAddPart = () => {
    setParts([...parts, { part: parts.length + 1, title: `Part ${parts.length + 1}`, url: '' }]);
  };

  // Fungsi buat update isi URL/Judul Part
  const handlePartChange = (index, field, value) => {
    const newParts = [...parts];
    newParts[index][field] = value;
    setParts(newParts);
  };

  // Fungsi Kirim Data ke Supabase
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Buang part yang URL-nya kosong
    const validParts = parts.filter((p) => p.url.trim() !== '');

    const { data, error } = await supabase.from('stories').insert([
      {
        title,
        author,
        synopsis,
        cover_url: coverUrl,
        platform,
        parts: validParts,
      },
    ]);

    setLoading(false);

    if (error) {
      alert('Gagal nambahin AU: ' + error.message);
    } else {
      alert('Mantap, Din! AU berhasil disimpan ke database!');
      // Reset form
      setTitle('');
      setAuthor('');
      setSynopsis('');
      setCoverUrl('');
      setParts([{ part: 1, title: 'Part 1', url: '' }]);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-gray-900 text-white rounded-xl my-6">
      <h1 className="text-xl font-bold mb-4">Tambah AU Baru</h1>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Judul AU"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="p-2 rounded bg-gray-800 border border-gray-700 text-sm"
        />

        <input
          type="text"
          placeholder="Penulis / Username (ex: @username)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          required
          className="p-2 rounded bg-gray-800 border border-gray-700 text-sm"
        />

        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="p-2 rounded bg-gray-800 border border-gray-700 text-sm"
        >
          <option value="X/Twitter">X / Twitter</option>
          <option value="Instagram">Instagram</option>
          <option value="TikTok">TikTok</option>
        </select>

        <input
          type="url"
          placeholder="URL Cover Image (Optional)"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          className="p-2 rounded bg-gray-800 border border-gray-700 text-sm"
        />

        <textarea
          placeholder="Sinopsis singkat..."
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          className="p-2 rounded bg-gray-800 border border-gray-700 text-sm h-20"
        />

        <hr className="border-gray-700 my-2" />

        <label className="text-sm font-semibold">Daftar Link Part / Thread:</label>
        
        {parts.map((p, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              placeholder="Judul Part"
              value={p.title}
              onChange={(e) => handlePartChange(index, 'title', e.target.value)}
              className="w-1/3 p-2 rounded bg-gray-800 border border-gray-700 text-xs"
            />
            <input
              type="url"
              placeholder="Paste Link IG/X di sini"
              value={p.url}
              onChange={(e) => handlePartChange(index, 'url', e.target.value)}
              className="w-2/3 p-2 rounded bg-gray-800 border border-gray-700 text-xs"
            />
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddPart}
          className="bg-gray-800 hover:bg-gray-700 text-xs py-2 rounded text-purple-400 border border-purple-500/30"
        >
          + Tambah Part
        </button>

        <button
          type="submit"
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 p-2 rounded text-sm font-bold mt-3"
        >
          {loading ? 'Menyimpan...' : 'Simpan AU'}
        </button>
      </form>
    </div>
  );
}
