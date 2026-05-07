/**
 * Sets the prefer-desktop cookie and navigates to the given URL, triggering a
 * full page load so the middleware can read the cookie and render the desktop
 * layout.  All mobile surfaces that offer a "Switch to desktop" action should
 * use this helper to keep the behaviour consistent.
 */
export function switchToDesktop(desktopHref = "/tasks"): void {
  document.cookie = "prefer-desktop=1; path=/; max-age=31536000; SameSite=Lax";
  window.location.href = desktopHref;
}

/**
 * Sets the prefer-desktop cookie without navigating.  Use this when the
 * navigation is handled separately (e.g. by a Next.js <Link>).
 */
export function setDesktopPreference(): void {
  document.cookie = "prefer-desktop=1; path=/; max-age=31536000; SameSite=Lax";
}
