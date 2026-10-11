export const patientsConfig = {
  kind: 'patients', singular: 'patient', title: 'Patients', description: 'Patient profiles, contact details, and medical history.',
  searchLabel: 'Search by name, patient ID, phone, or email',
  emptyTitle: 'No patients yet', emptyMessage: 'Add your first patient to begin keeping their profile and medical history.',
  defaults: { name: '', dateOfBirth: '', phone: '', email: '', address: '', emergencyContact: { name: '', relationship: '', phone: '' }, medicalHistory: { allergies: '', conditions: '', pastSurgeries: '', currentMedications: '' } },
  fields: ['name', 'dateOfBirth', 'phone', 'email', 'address', 'emergencyContact', 'medicalHistory'],
}
