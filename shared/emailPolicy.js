// Registration policy. Match whole domains and their subdomains, never substrings.
export const BLOCKED_EMAIL_DOMAINS = ['pornhub.com', 'pornhub.org', 'pornhub.net', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'tube8.com']

export function emailDomainError(email) {
  const domain = email.trim().toLowerCase().split('@').at(-1)
  return BLOCKED_EMAIL_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))
    ? 'This email domain is not allowed. Use your personal or clinic email address.'
    : ''
}
