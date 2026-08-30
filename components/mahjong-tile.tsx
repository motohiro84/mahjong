import Image from "next/image";
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
  const honors = ["east", "south", "west", "north", "white", "green", "red"];
  const file = i < 9 ? `m${i + 1}` : i < 18 ? `p${i - 8}` : i < 27 ? `s${i - 17}` : honors[i - 27];
  const className = `mahjong-tile${small ? " small" : ""}${tiny ? " tiny" : ""}${dora ? " dora" : ""}${red ? " red" : ""}${selected ? " selected" : ""}`;
  const face = <><Image src={`/tiles/generated/${file}.png`} width={180} height={240} sizes="60px" unoptimized draggable={false} alt="" aria-hidden="true" />{red && <span className="red-badge" aria-hidden="true">赤</span>}</>;
  if (!onClick) return <span className={className} role="img" aria-label={label || tileName(i, red)}>{face}</span>;
  return <button type="button" className={className} disabled={disabled} onClick={onClick} aria-label={label || tileName(i, red)} aria-pressed={selected}>{face}</button>;
}
