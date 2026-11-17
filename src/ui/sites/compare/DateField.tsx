import { useRef, useState } from 'react';
import { formatInput } from '../booking/inputFormat';

type DateFieldProps = {
  label: string;
  /** 決まった日付（YYYY-MM-DD）。8桁そろっていなければ空文字。 */
  value: string;
  onChange: (isoDate: string) => void;
};

/** 表示用の YYYY/MM/DD を、8桁そろっていれば YYYY-MM-DD にする。 */
function toIso(display: string): string {
  const digits = display.replace(/\D/g, '');
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
    : '';
}

/**
 * 日付の入力欄。「20270518」と打てば「2027/05/18」と区切って表示する。
 * 横のボタンから、ブラウザのカレンダーで選ぶこともできる。
 */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const [text, setText] = useState(value ? value.replaceAll('-', '/') : '');
  const pickerRef = useRef<HTMLInputElement>(null);

  // カレンダーで選ばれたときなど、外から日付が変わったら表示もそろえる。
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value && toIso(text) !== value) setText(value.replaceAll('-', '/'));
  }

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      // showPicker に対応していないブラウザでは、欄に移って選んでもらう。
      picker.focus();
    }
  };

  return (
    <label className="compare-form__field">
      <span>{label}</span>
      <span className="date-field">
        <input
          type="text"
          inputMode="numeric"
          placeholder="YYYY/MM/DD"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            const next = formatInput('date', event.target.value, text);
            setText(next);
            onChange(toIso(next));
          }}
        />
        <button
          type="button"
          className="date-field__calendar"
          aria-label={`${label}をカレンダーから選ぶ`}
          onClick={openPicker}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor">
            <rect x="3.5" y="5" width="17" height="15" rx="2" />
            <path d="M3.5 9.5h17M8 3v4M16 3v4" />
          </svg>
        </button>
        {/* カレンダーを開くためだけの欄。画面には見せず、Tab や Enter でも止まらない。 */}
        <input
          ref={pickerRef}
          type="date"
          className="date-field__picker"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          onChange={(event) => {
            setText(event.target.value.replaceAll('-', '/'));
            onChange(event.target.value);
          }}
        />
      </span>
    </label>
  );
}
