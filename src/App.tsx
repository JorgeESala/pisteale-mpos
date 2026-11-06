import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { DefaultConsumablesPage } from '@/features/catalog/DefaultConsumablesPage'
import { GroupFormPage } from '@/features/catalog/GroupFormPage'
import { GroupsPage } from '@/features/catalog/GroupsPage'
import { IceDailyPage } from '@/features/catalog/IceDailyPage'
import { InventoryItemFormPage } from '@/features/catalog/InventoryItemFormPage'
import { InventoryItemsPage } from '@/features/catalog/InventoryItemsPage'
import { ProductFormPage } from '@/features/catalog/ProductFormPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { BottleDetailPage } from '@/features/inventory/BottleDetailPage'
import { BottlesPage } from '@/features/inventory/BottlesPage'
import { MovementsPage } from '@/features/inventory/MovementsPage'
import { PurchaseDetailPage } from '@/features/inventory/PurchaseDetailPage'
import { PurchasesPage } from '@/features/inventory/PurchasesPage'
import { StockDetailPage } from '@/features/inventory/StockDetailPage'
import { StockPage } from '@/features/inventory/StockPage'
import { WastePage } from '@/features/inventory/WastePage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { OrderDetailPage } from '@/features/sales/OrderDetailPage'
import { SalesPage } from '@/features/sales/SalesPage'
import { UserFormPage } from '@/features/users/UserFormPage'
import { UsersPage } from '@/features/users/UsersPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { PromotionFormPage } from '@/features/promotions/PromotionFormPage'
import { PromotionsPage } from '@/features/promotions/PromotionsPage'
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
              path="/insumos/hielo"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <IceDailyPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/stock"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <StockPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/merma"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <WastePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/botellas"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <BottlesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/botellas/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <BottleDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/stock/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <StockDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/movimientos"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <MovementsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/compras"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <PurchasesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos/compras/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <PurchaseDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <SalesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pedidos/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <OrderDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reportes"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <ReportsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/promociones"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <PromotionsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/promociones/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <PromotionFormPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <UsersPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/usuarios/:id"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <UserFormPage />
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
          <PwaUpdatePrompt />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
