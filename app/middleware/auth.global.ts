/**
 * Every page except /login requires a session. The check runs on each
 * navigation (cheap: single user, one cookie). API calls that return 401
 * later on also redirect to /login (see useApi).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const api = useApi()
  // Server unreachable or erroring counts as signed out; the login page
  // surfaces the real error when the user tries to sign in.
  const authenticated = await api.session().then(r => r.authenticated, () => false)
  if (to.path === '/login') {
    if (authenticated) return navigateTo(safeRedirect(to.query.redirect), { replace: true })
    return
  }
  if (!authenticated) {
    return navigateTo({ path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }, { replace: true })
  }
})
