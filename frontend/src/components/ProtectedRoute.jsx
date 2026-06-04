import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAccessDenied, setShowAccessDenied] = useState(false);
  const [redirectPath, setRedirectPath] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !session.user) {
          if (isMounted) setLoading(false);
          return;
        }

        // Get role from profile
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile && isMounted) {
          setCurrentUser({
            id: profile.id,
            name: profile.name,
            username: session.user.email.split('@')[0],
            role: profile.role
          });
        }
      } catch (err) {
        console.error('ProtectedRoute auth error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    checkAuth();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (loading || !currentUser) return;

    const hasAccess = allowedRoles.includes(currentUser.role);
    if (!hasAccess) {
      setShowAccessDenied(true);

      // Determine where this role should go
      let path = '/';
      if (currentUser.role === 'admin') path = '/admin';
      else if (currentUser.role === 'cashier') path = '/cashier';
      else if (currentUser.role === 'kitchen') path = '/kitchen';
      else if (currentUser.role === 'display') path = '/display';

      const timer = setTimeout(() => {
        setRedirectPath(path);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentUser, allowedRoles, loading]);

  if (loading) {
    return (
      <div className="access-denied-container">
        <div className="access-denied-card">
          <h1>Verifying Session...</h1>
          <div className="access-denied-loader">
            <div className="loader-progress"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (showAccessDenied) {
    if (redirectPath) {
      return <Navigate to={redirectPath} replace />;
    }

    return (
      <div className="access-denied-container">
        <div className="access-denied-card">
          <div className="access-denied-icon">🚨</div>
          <h1>Access Denied</h1>
          <p>You do not have permission to view this page.</p>
          <div className="access-denied-loader">
            <div className="loader-progress"></div>
          </div>
          <span className="access-denied-redirect-msg">
            Redirecting you to your assigned screen...
          </span>
        </div>
      </div>
    );
  }

  return children;
}
