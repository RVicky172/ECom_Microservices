/** The shopping assistant's launcher button. */
import { useState } from 'react';
import { useAssistantChat } from '../../hooks/useAssistantChat';
import { useSession } from '../../hooks/useSession';
import { AssistantPanel } from './AssistantPanel';

/**
 * Floating "Ask mercato" button and its chat panel. Mounted once in
 * `StoreLayout`, so it is on every signed-in page and the conversation stays
 * alive while the user navigates or closes the panel.
 */
export function AssistantLauncher(): React.JSX.Element | null {
  const { user } = useSession();
  if (!user) return null;
  return <AssistantLauncherForUser userId={user.id} />;
}

function AssistantLauncherForUser({ userId }: { userId: string }): React.JSX.Element {
  const chat = useAssistantChat(userId);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen && <AssistantPanel chat={chat} onClose={() => setIsOpen(false)} />}
      {!isOpen && (
        <button type="button" className="assistant-launcher" onClick={() => setIsOpen(true)}>
          <span aria-hidden="true">✦</span> Ask mercato
        </button>
      )}
    </>
  );
}
