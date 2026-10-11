export const doctorsConfig = {
  kind: 'doctors', singular: 'doctor', title: 'Doctors', description: 'The clinic’s doctor directory and specialties.',
  searchLabel: 'Search by name, specialty, phone, or email',
  emptyTitle: 'No doctors yet', emptyMessage: 'Add the doctors who provide care at your clinic.',
  defaults: { name: '', specialty: '', phone: '', email: '' },
  fields: ['name', 'specialty', 'phone', 'email'],
}
