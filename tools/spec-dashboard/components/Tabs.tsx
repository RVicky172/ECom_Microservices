'use client';

import { useState } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

/** Simple accessible tabs; the content is rendered on the server and passed in. */
export function Tabs({ tabs }: { tabs: Tab[] }): React.JSX.Element | null {
  const [active, setActive] = useState(tabs[0]?.id);
  if (tabs.length === 0) return null;

  return (
    <div className="tabs">
      <div role="tablist" aria-label="Feature documents">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== active}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
