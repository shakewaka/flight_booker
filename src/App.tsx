import { sampleRound } from './data/sampleRound';
import { Workspace } from './ui/workspace/Workspace';

export default function App() {
  return <Workspace scenario={sampleRound} />;
}
