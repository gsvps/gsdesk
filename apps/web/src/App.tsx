import { Navigate, Route, Routes } from 'react-router-dom';
import BrowserConfigBanner from './components/BrowserConfigBanner';
import { AuthProvider, useAuth } from './lib/auth';
import HomePage from './pages/HomePage';
import RemotePage from './pages/RemotePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { tokenVerified, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">加载中...</div>;
  }
  if (!tokenVerified) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-950">
        <BrowserConfigBanner />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Routes>
            <Route path="/install" element={<Navigate to="/" replace />} />
            <Route path="/settings" element={<Navigate to="/" replace />} />
            <Route path="/" element={<HomePage />} />
            <Route
              path="/remote/:sessionId"
              element={
                <ProtectedRoute>
                  <RemotePage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </AuthProvider>
  );
}
