import { useMemo } from 'react';
import {
  FaFlag, FaFlagCheckered, FaCar, FaBolt,
  FaStopwatch, FaSearch, FaCloudRain,
  FaExclamationTriangle, FaInfoCircle,
  FaListOl, FaPauseCircle, FaCheck,
  FaPlayCircle, FaSignOutAlt, FaPen, FaTimes, FaSignInAlt, FaRedo, FaThermometerHalf, FaCarSide, FaRoad,
} from 'react-icons/fa';
import { GiFullMotorcycleHelmet } from 'react-icons/gi';
import { FaTent } from 'react-icons/fa6';
import { PiCraneBold } from 'react-icons/pi';
import { TbArrowsShuffle } from 'react-icons/tb';
import { FLAG_COLORS } from '../../flagColors';
import TEAM_STYLES from '../../teamStyles';

// Raw F1 feed uses Category, Flag, Status, Mode — no SubCategory field.
// "Other" category messages are matched on message text.
function getMsgStyle(msg) {
  const cat  = String(msg?.Category ?? '').toLowerCase();
  const flag = String(msg?.Flag     ?? '').toLowerCase();
  const stat = String(msg?.Status   ?? '').toLowerCase();
  const mode = String(msg?.Mode     ?? '').toLowerCase();
  const text = String(msg?.Message  ?? '').toLowerCase();

  if (cat === 'flag') {
    if (flag === 'yellow')          return { icon: FaFlag,               color: FLAG_COLORS['YELLOW'] };
    if (flag === 'double yellow')   return { icon: FaFlag,               color: FLAG_COLORS['DOUBLE YELLOW'] };
    if (flag === 'red')             return { icon: FaFlag,               color: FLAG_COLORS['RED'] };
    if (flag === 'clear')           return { icon: FaFlag,               color: FLAG_COLORS['GREEN'] };
    if (flag === 'blue')            return { icon: FaFlag,               color: FLAG_COLORS['BLUE'] };
    if (flag === 'black and white') return { icon: FaFlag,               color: FLAG_COLORS['BLACK AND WHITE'] };
    if (flag === 'chequered')       return { icon: FaFlagCheckered,      color: FLAG_COLORS['CHEQUERED'] };
    if (flag === 'green')           return { icon: FaSignOutAlt,         color: FLAG_COLORS['GREEN'] };
    return { icon: FaFlag, color: 'rgba(255,255,255,0.35)' };
  }

  if (cat === 'safetycar') {
    if (mode.includes('virtual') || mode === 'vsc')
      return { icon: FaCar, color: FLAG_COLORS['VIRTUAL SAFETY CAR'] };
    return { icon: FaCar, color: FLAG_COLORS['SAFETY CAR'] };
  }

  if (cat === 'drs') {
    if (stat === 'enabled') return { icon: FaBolt, color: FLAG_COLORS['GREEN'] };
    return { icon: FaBolt, color: FLAG_COLORS['RED'] };
  }

  // Other — match on message text
  if (text.includes('all cars through the pit lane')) return { icon: FaCarSide, color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('pit lane entry open'))   return { icon: FaSignInAlt,          color: FLAG_COLORS['GREEN'] };
  if (text.includes('pit lane entry closed')) return { icon: FaSignInAlt,          color: FLAG_COLORS['RED'] };
  if (text.includes('pit exit open') || text.includes('pit lane clear')) return { icon: FaSignOutAlt, color: FLAG_COLORS['GREEN'] };
  if (text.includes('pit exit closed'))       return { icon: FaSignOutAlt,         color: FLAG_COLORS['RED'] };
  if (text.includes('drs enabled'))          return { icon: FaBolt,               color: FLAG_COLORS['GREEN'] };
  if (text.includes('drs disabled'))         return { icon: FaBolt,               color: FLAG_COLORS['RED'] };
  if (text.includes('overtake enabled'))     return { icon: TbArrowsShuffle,      color: FLAG_COLORS['GREEN'] };
  if (text.includes('overtake disabled'))    return { icon: TbArrowsShuffle,      color: FLAG_COLORS['RED'] };
  if (text.includes('red flag'))             return { icon: FaFlag,                color: FLAG_COLORS['RED'] };
  if (text.includes('yellow in pit lane'))   return { icon: FaFlag,                color: FLAG_COLORS['YELLOW'] };
  if (text.includes('deleted'))              return { icon: FaTimes,               color: FLAG_COLORS['RED'] };
  if (text.includes('penalty served'))        return { icon: FaCheck,               color: FLAG_COLORS['GREEN'] };
  if (text.includes('penalty for car'))      return { icon: FaStopwatch,           color: FLAG_COLORS['RED'] };
  if (text.includes('investigat'))           return { icon: FaSearch,              color: FLAG_COLORS['YELLOW'] };
  if (text.includes('no further'))           return { icon: FaCheck,               color: FLAG_COLORS['GREEN'] };
  if (text.includes('noted'))                return { icon: FaPen,                 color: FLAG_COLORS['YELLOW'] };
  if (text.includes('chequered') || text.includes('first car to take')) return { icon: FaFlagCheckered, color: FLAG_COLORS['CHEQUERED'] };
  if (text.includes('black and orange'))     return { icon: FaFlag,               color: FLAG_COLORS['BLACK AND ORANGE'] };
  if (text.includes('black and white'))      return { icon: FaFlag,               color: FLAG_COLORS['BLACK AND WHITE'] };
  if (text.includes('recovery vehicle'))     return { icon: PiCraneBold,           color: FLAG_COLORS['YELLOW'] };
  if (text.includes('marshals on track'))    return { icon: FaExclamationTriangle, color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('medical car'))          return { icon: FaExclamationTriangle, color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('slippery'))             return { icon: FaExclamationTriangle, color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('low grip'))             return { icon: FaRoad,                color: FLAG_COLORS['DOUBLE YELLOW'] };
  if (text.includes('normal grip'))          return { icon: FaRoad,                color: FLAG_COLORS['WHITE'] };
  if (text.includes('straight mode') && text.includes('disabled')) return { icon: FaRoad, color: FLAG_COLORS['RED'] };
  if (text.includes('straight mode') && text.includes('enabled'))  return { icon: FaRoad, color: FLAG_COLORS['GREEN'] };
  if (text.includes('temperatures') || text.includes('air temperature')) return { icon: FaThermometerHalf, color: FLAG_COLORS['BLUE'] };
  if (text.includes('weather') || text.includes('risk of rain')) return { icon: FaCloudRain, color: FLAG_COLORS['BLUE'] };
  if (text.includes('restart'))              return { icon: FaListOl,              color: FLAG_COLORS['WHITE'] };
  if (text.includes('aborted') || text.includes('delayed')) return { icon: FaPauseCircle, color: FLAG_COLORS['RED'] };
  if (text.includes('resume') || text.includes('will start')) return { icon: FaPlayCircle, color: FLAG_COLORS['GREEN'] };
  if (text.includes('estimated time'))       return { icon: FaPlayCircle,          color: FLAG_COLORS['WHITE'] };
  if (text.includes('formation lap'))        return { icon: FaRedo,                color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('rolling start') || text.includes('standing start')) return { icon: FaCarSide, color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('virtual safety car') || text.includes('vsc')) return { icon: FaCar, color: FLAG_COLORS['VIRTUAL SAFETY CAR'] };
  if (text.includes('safety car'))           return { icon: FaCar,                 color: FLAG_COLORS['SAFETY CAR'] };
  if (text.includes('helmet') || text.includes('padding'))   return { icon: GiFullMotorcycleHelmet, color: FLAG_COLORS['PINK'] };
  if (text.includes('awning'))                               return { icon: FaTent,                color: FLAG_COLORS['BLUE'] };

  return { icon: FaInfoCircle, color: FLAG_COLORS['WHITE'] };
}

function parseMessage(text, tlaMap) {
  const parts = [];
  let last = 0;
  const re = /\(([A-Z]{2,3})\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    const tla = m[1];
    parts.push({ type: 'badge', tla, style: tlaMap[tla] ?? null });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

function formatTime(utc, gmtOffset) {
  if (!utc) return '';
  const date = new Date(String(utc).endsWith('Z') ? utc : utc + 'Z');
  if (isNaN(date)) return '';
  if (gmtOffset) {
    const m = String(gmtOffset).match(/^([+-]?)(\d{2}):(\d{2})/);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      const offsetMs = sign * (parseInt(m[2]) * 60 + parseInt(m[3])) * 60000;
      return new Date(date.getTime() + offsetMs).toISOString().slice(11, 19);
    }
  }
  return date.toISOString().slice(11, 19);
}

function msgKey(msg) {
  return `${msg?.Utc ?? ''}|${msg?.Message ?? ''}`;
}

export default function RaceControlWidget({ state, maxMessages = 6 }) {
  const gmtOffset = state?.SessionInfo?.GmtOffset ?? null;

  const tlaMap = useMemo(() => {
    const dl = state?.DriverList ?? {};
    const map = {};
    Object.values(dl).forEach(d => {
      const tla = d.Tla ?? d.Abbr;
      if (tla) map[tla] = TEAM_STYLES[d.TeamName] ?? null;
    });
    return map;
  }, [state?.DriverList]);

  const messages = useMemo(() => {
    const raw = state?.RaceControlMessages?.Messages;
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : Object.values(raw);
    const sorted = [...arr].sort((a, b) =>
      String(b?.Utc ?? '').localeCompare(String(a?.Utc ?? ''))
    );
    return maxMessages != null ? sorted.slice(0, maxMessages) : sorted;
  }, [state?.RaceControlMessages, maxMessages]);

  if (!messages.length) return null;

  return (
    <div style={{
      width: '100%',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      rowGap: 2,
      columnGap: 10,
    }}>
      {messages.map(msg => {
        const key = msgKey(msg);
        const { icon: Icon, color } = getMsgStyle(msg);
        const time = formatTime(msg?.Utc, gmtOffset);
        const lap  = msg?.Lap != null ? `L${msg.Lap}` : null;
        const bg = `linear-gradient(${color}1a, ${color}1a), rgba(255,255,255,0.08)`;

        return (
          <div key={key} style={{
            display: 'grid',
            gridColumn: '1 / -1',
            gridTemplateColumns: 'subgrid',
            gridTemplateRows: 'auto auto',
            rowGap: 2,
            background: bg,
            borderRadius: 4,
            padding: 8,
          }}>
            <Icon style={{ color, fontSize: 14, gridRow: '1 / 3', alignSelf: 'center', justifySelf: 'center' }} />
            <span style={{ fontSize: 14, lineHeight: 1.3, color: 'rgba(255,255,255,0.92)' }}>
              {parseMessage(msg?.Message ?? '', tlaMap).map((part, i) =>
                part.type === 'text'
                  ? <span key={i}>{part.value}</span>
                  : <mark key={i} style={{ background: part.style?.background ?? '#555', color: part.style?.text ?? '#fff' }}>{part.tla}</mark>
              )}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', whiteSpace: 'nowrap' }}>
              {lap ? `${lap}  ` : ''}{time}
            </span>
          </div>
        );
      })}
    </div>
  );
}
