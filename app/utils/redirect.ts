/** Only same-origin paths are allowed as a post-login redirect target. */
export function safeRedirect(target: unknown) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
}
