import { useState, type FormEvent } from 'react';
import type { SignInCredentials } from '../hooks/useSession';

interface AuthScreenProps {
  /** Called with the entered credentials when the form is submitted. */
  onSubmit: (credentials: SignInCredentials) => Promise<void>;
  /** Disables the submit button while a sign-in request is in flight. */
  isSubmitting: boolean;
  /** Shows the "couldn't sign you in" message. */
  hasError: boolean;
}

/**
 * Sign-in screen (brand showcase + form). Purely presentational: it owns only
 * the form field state; `LoginPage` supplies the sign-in behaviour.
 */
export function AuthScreen({ onSubmit, isSubmitting, hasError }: AuthScreenProps): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onSubmit({ email, password });
  };

  return (
    <main className="auth-screen">
      <section className="auth-showcase">
        <div className="brand-lockup"><span className="brand-mark">M</span><span>mercato</span></div>
        <div className="showcase-copy">
          <p className="eyebrow">THE MODERN TECH EDIT</p>
          <h1>Good tools make room for better ideas.</h1>
          <p>Curated hardware for focused work, clear thinking, and the everyday rituals in between.</p>
        </div>
        <div className="showcase-object" aria-hidden="true">
          <div className="object-glow" />
          <div className="object-device"><span>mercato</span><strong>01</strong></div>
        </div>
        <p className="showcase-footer">Independent goods. Thoughtfully shipped.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-brand brand-lockup"><span className="brand-mark">M</span><span>mercato</span></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your desk.</h2>
          <p className="auth-subtitle">Your saved cart and order history are waiting.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <div className="field-row">
              <label htmlFor="password">Password</label>
              <button type="button" className="text-button">Forgot?</button>
            </div>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {hasError && <p className="form-error">We couldn't sign you in. Check your details and try again.</p>}
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Continue'}<span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="auth-note">Development account: <strong>admin@example.com</strong> / <strong>admin</strong></p>
        </div>
        <span className="auth-corner">LOCAL / 001</span>
      </section>
    </main>
  );
}
