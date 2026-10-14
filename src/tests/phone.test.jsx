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
  it('limits typing and paste to 11 digits, accepts landlines and mobiles, and keeps blanks optional', async () => {
    const onSave = vi.fn(), user = userEvent.setup()
    render(<PhoneForm workflow={workflow} onSave={onSave} />)
    const input = screen.getByRole('textbox')
    expect(input.maxLength).toBe(11)
    expect(input.type).toBe('tel')
    expect(input.inputMode).toBe('numeric')
    for (const value of ['123', '123456']) {
      await user.clear(input); await user.type(input, value)
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(input.validity.valid).toBe(false)
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(input.value).toBe(value)
    }
    expect(onSave).not.toHaveBeenCalled()
    for (const value of ['5550100', '0281234567', '09171234567', '']) {
      await user.clear(input)
      if (value) await user.type(input, value)
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(input.validity.valid).toBe(true)
      expect(onSave).toHaveBeenLastCalledWith(value)
    }
    expect(onSave).toHaveBeenCalledTimes(4)
    await user.type(input, '000123456789999')
    expect(input.value).toBe('00012345678')
    await user.clear(input)
    await user.paste('091712345678999')
    expect(input.value).toBe('09171234567')
    await user.clear(input)
    await user.type(input, 'abc09-17')
    expect(input.value).toBe('0917')
  })
})
