import { z } from 'zod'
import { HttpError } from '../utils/errors.js'
import { profileFieldError } from '../../../shared/profileValidation.js'

const name = z.string().trim().min(2, 'Enter at least 2 characters.').max(100, 'Use 100 characters or fewer.')
const email = z.string().trim().toLowerCase().max(254).email('Enter a valid email address.')
const password = z.string().min(12, 'Use at least 12 characters.').max(128, 'Use 128 characters or fewer.')

export const registerSchema = z.object({
  name, email, password, registrationCode: z.string().min(1, 'Enter the clinic access code.').max(128),
}).strict()
export const loginSchema = z.object({
  email, password: z.string().min(1, 'Enter your password.').max(128),
}).strict()
const profileField = (field) => z.string().trim().superRefine((value, context) => {
  const message = profileFieldError(field, value)
  if (message) context.addIssue({ code: 'custom', message })
})
export const profileSchema = z.object({
  name: profileField('name'), phone: profileField('phone'),
  gender: z.enum(['', 'female', 'male', 'non_binary', 'other', 'prefer_not_to_say']).optional(),
  dateOfBirth: profileField('dateOfBirth').optional(),
  jobTitle: profileField('jobTitle').optional(), department: profileField('department').optional(), workLocation: profileField('workLocation').optional(),
}).strict()

export function validate(schema, input) {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const fields = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.')
    if (field && !fields[field]) fields[field] = issue.message
  }
  throw new HttpError(400, 'Please check the form and try again.', fields)
}
