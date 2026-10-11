/** Only a server-confirmed false releases the first-login UX gate. */
export function requiresInitialPasswordChange(value: boolean | undefined): boolean {
  return value !== false;
}
