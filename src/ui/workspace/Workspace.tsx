import { describeRequirements } from '../../game/requirements';
import type { RoundScenario } from '../../game/types';
import { BrowserShell } from '../browser/BrowserShell';
import { TabletFrame } from '../browser/TabletFrame';
import { IdentityStack } from '../documents/IdentityStack';
import { MemoPad } from '../documents/MemoPad';
import './workspace.css';

type WorkspaceProps = {
  scenario: RoundScenario;
};

/** 机の上。左80%にタブレット（企画書の「架空PC」）、右20%の上半分に条件メモ、下半分にパスポート・カードを置く。 */
export function Workspace({ scenario }: WorkspaceProps) {
  const memo = describeRequirements(scenario.requirements, scenario.airports, scenario.airlines);

  return (
    <main className="desk">
      <section className="desk__pc" aria-label="タブレット">
        <TabletFrame>
          <BrowserShell />
        </TabletFrame>
      </section>
      <aside className="desk__papers" aria-label="手元の資料">
        <MemoPad memo={memo} />
        <IdentityStack passport={scenario.passport} card={scenario.card} />
      </aside>
    </main>
  );
}
