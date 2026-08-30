import { tileFace } from "@/lib/tile-svg";
import { tileName } from "@/lib/tiles";

interface MahjongTileProps {
  i: number;
  red?: boolean;
  dora?: boolean;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  tiny?: boolean;
  onClick?: () => void;
  label?: string;
}

export function MahjongTile({ i, red = false, dora = false, selected = false, disabled = false, small = false, tiny = false, onClick, label }: MahjongTileProps) {
  const className = `mahjong-tile${small ? " small" : ""}${tiny ? " tiny" : ""}${dora ? " dora" : ""}${selected ? " selected" : ""}`;
  const svg = (
    <svg aria-hidden="true" viewBox="0 0 60 84">
      <rect width="60" height="84" rx="6" fill={dora ? "#fbeae6" : "#f2ecde"} stroke={dora ? "#b8382c" : "#d9d2c0"} strokeWidth={dora ? 3 : 1.5} />
      <g dangerouslySetInnerHTML={{ __html: tileFace(i, red) }} />
    </svg>
  );
  if (!onClick) return <span className={className} role="img" aria-label={label || tileName(i, red)}>{svg}</span>;
  return <button type="button" className={className} disabled={disabled} onClick={onClick} aria-label={label || tileName(i, red)} aria-pressed={selected}>{svg}</button>;
}
