/** A full-page loading placeholder. */
interface StatusScreenProps {
  /** Text announced to the user (and to screen readers via `role="status"`). */
  message: string;
}

/** Full-page placeholder shown while something app-wide is loading. */
export function StatusScreen({ message }: StatusScreenProps): React.JSX.Element {
  return (
    <main className="auth-screen">
      <p role="status">{message}</p>
    </main>
  );
}
