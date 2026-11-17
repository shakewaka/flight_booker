import type { ReactNode } from 'react';
import './tablet.css';

type TabletFrameProps = {
  children: ReactNode;
};

/** 机に平置きしたタブレットの外枠。画面の中身は children で受け取る。 */
export function TabletFrame({ children }: TabletFrameProps) {
  return (
    <div className="tablet">
      <span className="tablet__button tablet__button--power" aria-hidden="true" />
      <span className="tablet__button tablet__button--volume" aria-hidden="true" />
      <div className="tablet__body">
        <span className="tablet__camera" aria-hidden="true" />
        <div className="tablet__screen">{children}</div>
      </div>
    </div>
  );
}
