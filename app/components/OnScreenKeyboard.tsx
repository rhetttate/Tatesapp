"use client";

// On-screen keyboard (the OS keyboard would cover the results). Same look as the
// register's PLU keyboard. Keys fire on pointerdown so taps never wait on a render.
const ROWS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

export function OnScreenKeyboard({ onKey }: { onKey: (k: string) => void }) {
  function key(k: string, label: string, flex = 1, alt = false) {
    return (
      <button
        key={k}
        className={"oskKey" + (alt ? " oskAlt" : "")}
        style={{ flex }}
        onPointerDown={(e) => {
          e.preventDefault();
          onKey(k);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <div className="osk">
      <style>{`
        .osk { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 18px;
          background: #eef3fc; border: 1px solid rgba(10,60,160,0.10); }
        .oskRow { display: flex; gap: 8px; height: 56px; }
        .oskKey { flex: 1; border-radius: 12px; border: 1px solid rgba(10,60,160,0.14); background: #fff;
          color: #0a2a7a; font-weight: 900; font-size: 21px; padding: 0; touch-action: manipulation; cursor: pointer; }
        .oskKey:active { transform: scale(.93); background: #e3ecff; }
        .oskAlt { background: rgba(29,78,216,0.08); font-size: 17px; }
      `}</style>
      {ROWS.map((row, i) => (
        <div className="oskRow" key={i}>
          {i >= 2 && <span style={{ flex: 0.5 }} />}
          {row.map((k) => key(k, k))}
          {i === 2 && <span style={{ flex: 0.5 }} />}
          {i === 3 && key("back", "⌫", 2, true)}
        </div>
      ))}
      <div className="oskRow">
        {key("clear", "Clear", 1, true)}
        {key("space", "Space", 3, true)}
      </div>
    </div>
  );
}
