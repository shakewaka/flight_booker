import type { RoundDocuments } from '../../data/sampleRound';
import { BrowserShell } from '../browser/BrowserShell';
import { TabletFrame } from '../browser/TabletFrame';
import { IdentityStack } from '../documents/IdentityStack';
import { MemoPad } from '../documents/MemoPad';
import './workspace.css';

type WorkspaceProps = {
  documents: RoundDocuments;
};

/** 机の上。左80%にタブレット（企画書の「架空PC」）、右20%の上半分に条件メモ、下半分にパスポート・カードを置く。 */
export function Workspace({ documents }: WorkspaceProps) {
  return (
    <main className="desk">
      <section className="desk__pc" aria-label="タブレット">
        <TabletFrame>
          <BrowserShell />
        </TabletFrame>
      </section>
      <aside className="desk__papers" aria-label="手元の資料">
        <MemoPad memo={documents.memo} />
        <IdentityStack passport={documents.passport} card={documents.card} />
      </aside>
    </main>
  );
}
