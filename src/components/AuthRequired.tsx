import { useState } from 'react';
import { Loader2, LogIn, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface AuthRequiredProps {
  onAuthSuccess?: () => void;
}

export function AuthRequired({ onAuthSuccess }: AuthRequiredProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      console.log('[Auth] Opening login window...');
      const result = await window.electronAPI.auth.login();
      
      if (result.success) {
        console.log('[Auth] Login successful, validating token...');
        const validation = await window.electronAPI.auth.validateToken();
        
        if (validation.success && validation.isValid) {
          toast.success('Successfully signed in');
          onAuthSuccess?.();
        } else {
          toast.error('Token validation failed');
          setIsLoggingIn(false);
        }
      } else {
        toast.error(result.error || 'Login failed');
        setIsLoggingIn(false);
      }
    } catch (error) {
      console.error('[Auth] Login error:', error);
      toast.error('Login failed');
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen w-full bg-background">
      <div className="w-[content-max] min-w px-6">
        <div className="glass rounded-xl border border-border/50 p-8 shadow-glass animate-scale-in">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center">
              <img src="/logo.svg" alt="Quelo.Tech Logo" className="w-12 h-12 m-4" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
            Authentication Required
          </h1>

          <p className="text-sm text-muted-foreground text-center mb-8">
            Sign in to access Quelo.Tech CloudSync
          </p>

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full bg-primary hover:bg-primary/90 text-white font-medium py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Opening browser...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In with Browser</span>
              </>
            )}
          </button>

          {isLoggingIn && (
            <div className="mt-6 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground text-center">
                A browser window will open. Sign in and return to this app.
              </p>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Secure authentication powered by Quelo.Tech
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
