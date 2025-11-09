import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { CapturesView } from '@/views/CapturesView';
import { SettingsDialog } from '@/components/SettingsDialog';
import { UploadProgressDialog } from '@/components/UploadProgressDialog';
import { AuthRequired } from '@/components/AuthRequired';
import { Toaster } from 'sonner';
import { toast } from 'sonner';

function App() {
  const { 
    authStatus,
    isAuthLoading,
    setFiles, 
    setStats, 
    setAuthStatus,
    setAuthLoading,
    setUploadProgress 
  } = useAppStore();

  useEffect(() => {
    // Initialize auth on app start
    const initAuth = async () => {
      setAuthLoading(true);
      try {
        const authResult = await window.electronAPI.auth.isAuthenticated();
        
        if (authResult.success && authResult.isAuthenticated) {
          // Validate token
          const validation = await window.electronAPI.auth.validateToken();
          
          if (validation.success && validation.isValid) {
            setAuthStatus({
              isAuthenticated: true,
              user: validation.user
            });
            console.log('[Auth] User authenticated:', validation.user);
          } else {
            setAuthStatus({ isAuthenticated: false });
          }
        } else {
          setAuthStatus({ isAuthenticated: false });
        }
      } catch (error) {
        console.error('[Auth] Error:', error);
        setAuthStatus({ isAuthenticated: false });
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();

    initAuth();

    // Load initial files
    window.electronAPI.getWatchedFiles().then((files) => {
      setFiles(files);
    });

    // Listen for file updates
    window.electronAPI.onInitialFiles((files) => {
      setFiles(files);
    });

    // Listen for sync status updates
    window.electronAPI.onSyncStatus((data) => {
      setStats(data);
    });

    // Listen for upload progress
    window.electronAPI.onUploadProgress((progress) => {
      setUploadProgress(progress);
    });
  }, [setFiles, setStats, setAuthStatus, setAuthLoading, setUploadProgress]);

  // Handle successful authentication
  const handleAuthSuccess = async () => {
    try {
      const validation = await window.electronAPI.auth.validateToken();
      if (validation.success && validation.isValid) {
        setAuthStatus({
          isAuthenticated: true,
          user: validation.user
        });
      }
    } catch (error) {
      console.error('[Auth] Validation error:', error);
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-foreground overflow-hidden">
      {isAuthLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Checking authentication...</p>
          </div>
        </div>
      ) : !authStatus.isAuthenticated ? (
        <AuthRequired onAuthSuccess={handleAuthSuccess} />
      ) : (
        <>
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 overflow-auto">
              <CapturesView />
            </main>
          </div>

          <SettingsDialog />
          <UploadProgressDialog />
        </>
      )}
      
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default App;
