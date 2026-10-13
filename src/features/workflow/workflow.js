export const STAGES = { awaiting_assessment: 'Awaiting assessment', waiting: 'Waiting for doctor', in_consultation: 'In consultation', finished: 'Finished', left: 'Left before completion' }
export const ORDER_STAGES = { requested: 'Requested', scheduled: 'Scheduled', performed: 'Collected / performed', result_available: 'Result available', reviewed: 'Reviewed', cancelled: 'Cancelled' }
export const money = (centavos) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((centavos || 0) / 100)
export const dateTime = (value) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value)) : 'Not recorded'
export const cents = (value) => Math.round(Number(value) * 100)
