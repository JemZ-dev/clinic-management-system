export const ROLE_LABELS = { admin: 'Administrator', staff: 'Receptionist', doctor: 'Doctor' }
export const EXTRA_PERMISSIONS = ['assess', 'diagnostics', 'dispense']
const roles = {
  admin: ['accounts', 'schedule', 'reception', 'billing', 'catalog', 'directory', 'dispense'],
  staff: ['reception', 'billing', 'directory'],
  doctor: ['clinical', 'assess', 'directory'],
}
export function can(user, permission) {
  if (permission === 'medicineCatalog') return can(user, 'catalog') || can(user, 'dispense')
  return !!user && user.active !== false && ((roles[user.role] || []).includes(permission) || (user.permissions || []).includes(permission))
}
export function clinicalAccess(user) { return can(user, 'clinical') || can(user, 'assess') }
