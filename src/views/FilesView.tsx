import { Upload, FileIcon } from 'lucide-react';
import { useAppStore } from '@/store';
import { FileCard } from '@/components/FileCard';
import { useEffect, useRef } from 'react';

export function FilesView() {
  const { filteredFiles, searchQuery, files, setFiles } = useAppStore();
  const lastFetchedNoteIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Fetch previews when files change
    const fetchPreviews = async () => {
      // Get all note IDs from files that have them and don't have a preview yet
      const noteIdsToFetch = files
        .filter((file: any) => file.noteId && !file.preview && !lastFetchedNoteIdsRef.current.has(file.noteId))
        .map((file: any) => file.noteId);

      if (noteIdsToFetch.length === 0) {
        return;
      }

      console.log(`[FilesView] Fetching previews for ${noteIdsToFetch.length} notes`);

      try {
        const result = await window.electronAPI.fetchNotePreviews(noteIdsToFetch);
        
        if (result.success && result.previews) {
          // Mark these note IDs as fetched
          noteIdsToFetch.forEach(id => lastFetchedNoteIdsRef.current.add(id));

          // Update files with preview URLs
          const updatedFiles = files.map((file: any) => {
            if (file.noteId && result.previews[file.noteId]) {
              return {
                ...file,
                preview: result.previews[file.noteId]
              };
            }
            return file;
          });
          
          setFiles(updatedFiles);
        }
      } catch (error) {
        console.error('Error fetching note previews:', error);
      }
    };

    fetchPreviews();
  }, [files, setFiles]); // Depend on files array

  return (
    <div className="h-full bg-background">
      {/* Header */}
      <div className="border-b border-[#1f1f1f] bg-[#0a0a0a] px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-semibold text-white mb-1">My Notes</h1>
            <p className="text-sm text-gray-400">Upload documents and view all your notes with AI-powered annotations</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-8 space-y-6">
        {/* Upload Section */}
        {filteredFiles.length === 0 && !searchQuery && (
          <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-8">
            <div className="flex items-start gap-3 mb-6">
              <Upload className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <h2 className="text-base font-medium text-white mb-1">Upload Documents</h2>
                <p className="text-sm text-gray-400">Drag and drop files or click to browse</p>
              </div>
            </div>
            
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-12 text-center hover:border-[#3a3a3a] transition-colors cursor-pointer">
              <Upload className="w-12 h-12 mx-auto text-gray-600 mb-4" />
              <h3 className="text-base font-medium text-white mb-2">Drag & drop files here</h3>
              <p className="text-sm text-gray-400 mb-4">or click to browse from your computer</p>
              <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
                <span className="px-3 py-1 bg-[#1a1a1a] rounded">PDF</span>
                <span className="px-3 py-1 bg-[#1a1a1a] rounded">Images</span>
                <span className="px-3 py-1 bg-[#1a1a1a] rounded">Text</span>
              </div>
              <p className="text-xs text-gray-600 mt-4">Max file size: 100MB per file</p>
            </div>
          </div>
        )}

        {/* Files Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredFiles.length === 0 ? (
            <div className="col-span-full text-center py-20">
              <div className="text-gray-500 mb-4">
                <FileIcon className="w-16 h-16 mx-auto opacity-20" />
              </div>
              <h3 className="text-sm font-medium text-white mb-1">No files found</h3>
              <p className="text-xs text-gray-400">
                {searchQuery
                  ? 'Try adjusting your search'
                  : 'Add files to your watched folder to get started'}
              </p>
            </div>
          ) : (
            filteredFiles.map((file) => <FileCard key={file.path} file={file} />)
          )}
        </div>
      </div>
    </div>
  );
}

