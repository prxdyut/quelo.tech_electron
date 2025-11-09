import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { View } from './View';
import { SettingsDialog } from '@/components/SettingsDialog';
import { UploadProgressDialog } from '@/components/UploadProgressDialog';
import { AuthRequired } from '@/components/AuthRequired';
import { Toaster } from 'sonner';

function App() {
  const { 
    authStatus,
    isAuthLoading,
    setFiles, 
    setStats, 
    setAuthStatus,
    setAuthLoading,
    setUploadProgress,
    setLoadingFiles,
    currentSession,
    setCurrentSession,
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

    // Load initial files
    const loadFiles = async () => {
      setLoadingFiles(true);
      try {
        const files = await window.electronAPI.getWatchedFiles();
        setFiles(files);
      } finally {
        setLoadingFiles(false);
      }
    };

    loadFiles();

    // Lis
    // ten for file updates
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

    // Listen for session selection
    // @ts-ignore - onSessionSelected will be available after preload
    if (window.electronAPI?.session?.onSessionSelected) {
      // @ts-ignore
      window.electronAPI.session.onSessionSelected((session: any) => {
        console.log('[App] Session selected:', session);
        setCurrentSession(session);
      });
    }
  }, [setFiles, setStats, setAuthStatus, setAuthLoading, setUploadProgress, setLoadingFiles, setCurrentSession]);

  // Load sessions when authenticated
  useEffect(() => {
    if (authStatus.isAuthenticated && currentSession === null) {
      // Show session overlay
      window.electronAPI.sessionOverlay?.show();
    }
  }, [authStatus.isAuthenticated]);

  // Sync current session ID to main process
  useEffect(() => {
    const syncSessionToMain = async () => {
      try {
        // @ts-ignore
        await window.electronAPI.session.setCurrent(currentSession?.sessionId || null);
        console.log('[App] Current session ID synced to main process:', currentSession?.sessionId);
      } catch (error) {
        console.error('[App] Failed to sync session to main process:', error);
      }
    };
    
    syncSessionToMain();
  }, [currentSession]);

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
              <View />
            </main>
          </div>

          <SettingsDialog />
          <UploadProgressDialog />

          {/* Session Selection is now displayed as an overlay window */}
        </>
      )}
      
      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default App;
