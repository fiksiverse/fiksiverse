import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient'; // Sesuaikan path supabaseClient lo

export default function AUDetail({ storyId }) {
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStory() {
      // Ambil data AU spesifik dari Supabase berdasarkan ID
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('id', storyId)
        .single();

      if (!error && data) {
        setStory(data);
      }
      setLoading(false);
    }

    if (storyId) fetchStory();
  }, [storyId]);

  if (loading) {
    return <div className="text-center p-8 text-gray-400">Loading AU...</div>;
  }

  if (!story) {
    return <div className="text-center p-8 text-red-400">Cerita tidak ditemukan!</div>;
  }

  return (
    <div className="max-w-md mx-auto p-4 text-white min-h-screen">
      {/* Header & Info AU */}
      <div className="flex gap-4 mb-6 items-start">
        {story.cover_url ? (
          <img
            src={story.cover_url}
            alt={story.title}
            className="w-24 h-36 object-cover rounded-lg border border-gray-800"
          />
        ) : (
          <div className="w-24 h-36 bg-gray-800 rounded-lg flex items-center justify-center text-xs text-gray-500">
            No Cover
          </div>
        )}

        <div className="flex-1">
          <span className="text-[10px] bg-purple-900/60 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded font-mono">
            {story.platform}
          </span>
          <h1 className="text-xl font-bold mt-2 leading-tight">{story.title}</h1>
          <p className="text-xs text-gray-400 mt-1">by {story.author}</p>
          <p className="text-xs text-gray-300 mt-3 line-clamp-3">{story.synopsis}</p>
        </div>
      </div>

      <hr className="border-gray-800 my-4" />

      {/* List Part Link */}
      <h2 className="text-sm font-semibold mb-3 text-gray-300">Daftar Part / Thread</h2>
      
      <div className="flex flex-col gap-2">
        {story.parts && story.parts.length > 0 ? (
          story.parts.map((item, index) => (
            <a
              key={index}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-between items-center bg-gray-900 hover:bg-gray-800 border border-gray-800 p-3 rounded-lg transition active:scale-[0.99]"
            >
              <span className="text-xs font-medium text-purple-300">
                {item.title || `Part ${item.part}`}
              </span>
              <span className="text-[10px] text-gray-500">
                Buka di {story.platform} ↗
              </span>
            </a>
          ))
        ) : (
          <p className="text-xs text-gray-500">Belum ada part yang diisi.</p>
        )}
      </div>
    </div>
  );
}
