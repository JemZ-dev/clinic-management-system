import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecordField from '../components/records/RecordField.jsx'
import { Field } from '../features/workflow/components/WorkflowUI.jsx'

function PhoneForm({ workflow, onSave }) {
  const [phone, setPhone] = useState('')
  return <form onSubmit={(event) => { event.preventDefault(); onSave(phone) }}>
    {workflow ? <Field type="tel" label="Doctor phone" value={phone} onChange={setPhone} /> : <RecordField type="tel" name="emergencyContact.phone" label="Contact phone" value={phone} onChange={(_name, value) => setPhone(value)} errors={{}} />}
    <button type="submit">Save</button>
  </form>
}

describe.each([false, true])('phone field in workflow=%s', (workflow) => {
  it('blocks invalid digit counts and formatting, accepts landlines and mobiles, and keeps blanks optional', async () => {
    const onSave = vi.fn(), user = userEvent.setup()
    render(<PhoneForm workflow={workflow} onSave={onSave} />)
    const input = screen.getByRole('textbox')
    expect(input.maxLength).toBe(30)
    expect(input.type).toBe('tel')
    for (const value of ['123456', '1234567890123456', '0917+1234567', '(02 81234567']) {
      await user.clear(input); await user.type(input, value)
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(input.validity.valid).toBe(false)
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(input.value).toBe(value)
    }
    expect(onSave).not.toHaveBeenCalled()
    for (const value of ['(02) 8123-4567', '09171234567', '+63 917 123 4567', '']) {
      await user.clear(input)
      if (value) await user.type(input, value)
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(input.validity.valid).toBe(true)
      expect(onSave).toHaveBeenLastCalledWith(value)
    }
    expect(onSave).toHaveBeenCalledTimes(4)
  })
})
