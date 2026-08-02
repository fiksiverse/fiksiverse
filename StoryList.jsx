import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient'; // Pastikan path-nya sesuai

export default function StoryList() {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStories();
  }, []);

  // Fungsi buat ngambil data dari Supabase
  const fetchStories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories(data || []);
    } catch (error) {
      console.error('Error fetching stories:', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4 text-center">Lagi ngambil data AU... ⏳</div>;

  return (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">FiksiVerse AU Catalog 📚</h1>
      
      {stories.length === 0 ? (
        <p className="text-gray-500">Belum ada cerita yang di-input.</p>
      ) : (
        stories.map((story) => (
          <div key={story.id} className="border border-gray-200 rounded-xl p-4 shadow-sm bg-white">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-xl font-bold text-gray-900">{story.title}</h2>
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                {story.platform}
              </span>
            </div>
            
            <p className="text-sm text-gray-600 mb-3">by <span className="font-semibold">{story.author}</span></p>
            
            {story.synopsis && (
              <p className="text-sm text-gray-700 mb-4 line-clamp-3">{story.synopsis}</p>
            )}

            {/* List Part / Link AU */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daftar Part</p>
              <div className="flex flex-wrap gap-2">
                {story.parts && story.parts.map((p, index) => (
                  <a
                    key={index}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg font-medium transition"
                  >
                    📖 {p.title || `Part ${p.part}`}
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
