// Common catalog choices adapted from FDA SPL dosage-form terminology.
// Custom label text remains available for forms outside this shortlist.
export const dosageFormGroups = [
  { label: 'Tablets and capsules', forms: ['tablet', 'tablet, chewable', 'tablet, effervescent', 'tablet, orally disintegrating', 'tablet, delayed release', 'tablet, extended release', 'capsule', 'capsule, delayed release', 'capsule, extended release'] },
  { label: 'Oral liquids and powders', forms: ['oral solution', 'oral suspension', 'syrup', 'powder for oral solution', 'powder for oral suspension', 'granules'] },
  { label: 'Skin preparations', forms: ['cream', 'ointment', 'gel', 'lotion', 'topical solution', 'patch'] },
  { label: 'Eye, ear, and nasal preparations', forms: ['ophthalmic solution', 'ophthalmic suspension', 'ophthalmic ointment', 'otic solution', 'otic suspension', 'nasal spray'] },
  { label: 'Injections and inhalation', forms: ['injection, solution', 'injection, suspension', 'powder for injection', 'inhalation solution', 'inhalation powder', 'inhalation aerosol'] },
  { label: 'Other preparations', forms: ['suppository', 'enema', 'lozenge'] },
]
export const dosageForms = dosageFormGroups.flatMap((group) => group.forms)
export const dosageFormLabel = (value) => value.charAt(0).toUpperCase() + value.slice(1)
