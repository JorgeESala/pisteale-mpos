import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { DefaultConsumablesPage } from '@/features/catalog/DefaultConsumablesPage'
import { GroupFormPage } from '@/features/catalog/GroupFormPage'
import { GroupsPage } from '@/features/catalog/GroupsPage'
import { InventoryItemFormPage } from '@/features/catalog/InventoryItemFormPage'
import { InventoryItemsPage } from '@/features/catalog/InventoryItemsPage'
import { ProductFormPage } from '@/features/catalog/ProductFormPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { queryClient } from '@/lib/queryClient'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <DashboardPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/perfil"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ProfilePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/catalogo"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <CatalogPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/catalogo/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ProductFormPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <InventoryItemsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/grupos"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <GroupsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/grupos/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <GroupFormPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/consumibles"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <DefaultConsumablesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <InventoryItemFormPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
