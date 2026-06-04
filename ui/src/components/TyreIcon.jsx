import { useRef } from 'react';

let _id = 0;

const COMPOUND_COLORS = {
  SOFT:         '#E8002D',
  MEDIUM:       '#FFC906',
  HARD:         '#FFFFFF',
  INTERMEDIATE: '#39B54A',
  WET:          '#0067AD',
  UNKNOWN:      '#888888',
};

const COMPOUND_LETTERS = {
  SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W', UNKNOWN: '?',
};

// ─── Adjust these ──────────────────────────────────────────────────────────────
const OUTER_R     = 16;   // outer radius — also half the viewBox size
const INNER_R     = 13;   // inner radius — smaller = thicker ring
const SLOT_W      = 8;    // vertical slot width
const SPIKE_W     = 4;    // diagonal spike width
const SPIKE_H     = 40;   // diagonal spike height (longer = further past ring edge)
const SPIKE_ANGLE = -45;  // spike rotation in degrees
const FONT_SIZE_1 = 16;   // label font size — single character
const FONT_SIZE_2 = 16;   // label font size — two characters
// ───────────────────────────────────────────────────────────────────────────────

const VB = OUTER_R * 2;  // viewBox size
const CX = OUTER_R;      // center x
const CY = OUTER_R;      // center y

// compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'
// isNew: bool
// label: optional override (e.g. lap count string)
export default function TyreIcon({ compound = 'UNKNOWN', isNew = true, label, size = 32 }) {
  const id     = useRef(`tyre-${_id++}`).current;
  const color  = COMPOUND_COLORS[compound] ?? COMPOUND_COLORS.UNKNOWN;
  const text   = label ?? COMPOUND_LETTERS[compound] ?? '?';
  const maskId = `mask-${id}`;

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${VB} ${VB}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, verticalAlign: 'middle' }}
    >
      <defs>
        <mask id={maskId}>
          <rect width={VB} height={VB} fill="white" />
          <ellipse cx={CX} cy={CY} rx={INNER_R} ry={INNER_R} fill="black" />
          <rect x={CX - SLOT_W / 2} y={0} width={SLOT_W} height={VB} fill="black" />
        </mask>
      </defs>

      <g mask={`url(#${maskId})`}>
        <ellipse cx={CX} cy={CY} rx={OUTER_R} ry={OUTER_R} fill={color} />
        {!isNew && (
          <rect
            x={CX - SPIKE_W / 2}
            y={CY - SPIKE_H / 2}
            width={SPIKE_W}
            height={SPIKE_H}
            transform={`rotate(${SPIKE_ANGLE} ${CX} ${CY})`}
            fill={color}
          />
        )}
      </g>

      <text
        x={CX} y={CY}
        fill="#fff"
        fontFamily="Gotham, Arial, sans-serif"
        fontSize={text.length > 1 ? FONT_SIZE_2 : FONT_SIZE_1}
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </svg>
  );
}
