import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App.jsx';
import WelcomePage from './pages/WelcomePage.jsx';
import CashierPage from './pages/CashierPage.jsx';
import KitchenPage from './pages/KitchenPage.jsx';
import DisplayPage from './pages/DisplayPage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import UserManagementPage from './pages/UserManagementPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<WelcomePage />} />
          <Route
            path="cashier"
            element={
              <ProtectedRoute allowedRoles={['cashier']}>
                <CashierPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="kitchen"
            element={
              <ProtectedRoute allowedRoles={['kitchen']}>
                <KitchenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="display"
            element={
              <ProtectedRoute allowedRoles={['display']}>
                <DisplayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="menu"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <MenuPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="user-management"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <UserManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <main className="page">
                <h1>Page not found</h1>
              </main>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
