import { supabase } from '@/lib/supabase'
import type { AdminUser, Profile, UserRole } from '@/types/database'

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users')

  if (error) throw error

  return data
}

export type UpdateUserAccessInput = {
  userId: string
  role: UserRole
  active: boolean
  canViewFinancials: boolean
  canAdjustInventory: boolean
  canManageCatalog: boolean
}

export async function updateUserAccess(input: UpdateUserAccessInput): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_set_profile', {
    p_user_id: input.userId,
    p_role: input.role,
    p_active: input.active,
    p_can_view_financials: input.canViewFinancials,
    p_can_adjust_inventory: input.canAdjustInventory,
    p_can_manage_catalog: input.canManageCatalog,
  })

  if (error) throw error

  return data
}
