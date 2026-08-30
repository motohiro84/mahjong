const KANSU = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR = ["東", "南", "西", "北", "白", "發", "中"];
const IVORY = "#f2ecde";
const INK = "#1a1d23";
const MAN = "#b8382c";
const PIN = "#2f63ad";
const SOU = "#2c7a4e";

function pinLayout(n: number): [number, number, number][] {
  const layouts: Record<number, [number, number, number][]> = {
    1: [[30, 42, 14]], 2: [[30, 26, 9.5], [30, 58, 9.5]], 3: [[16, 20, 9], [30, 42, 9], [44, 64, 9]],
    4: [[18, 26, 9], [42, 26, 9], [18, 58, 9], [42, 58, 9]],
    5: [[17, 24, 8.5], [43, 24, 8.5], [30, 42, 8.5], [17, 60, 8.5], [43, 60, 8.5]],
    6: [[18, 20, 8.5], [42, 20, 8.5], [18, 42, 8.5], [42, 42, 8.5], [18, 64, 8.5], [42, 64, 8.5]],
    7: [[15, 15, 7], [30, 22, 7], [45, 29, 7], [18, 52, 7.5], [42, 52, 7.5], [18, 69, 7.5], [42, 69, 7.5]],
    8: [[18, 14, 7], [42, 14, 7], [18, 33, 7], [42, 33, 7], [18, 52, 7], [42, 52, 7], [18, 71, 7], [42, 71, 7]],
    9: [[14, 18, 7.5], [30, 18, 7.5], [46, 18, 7.5], [14, 42, 7.5], [30, 42, 7.5], [46, 42, 7.5], [14, 66, 7.5], [30, 66, 7.5], [46, 66, 7.5]],
  };
  return layouts[n];
}

function pinColor(n: number, index: number) {
  if (n === 1) return MAN;
  if (n === 5) return index === 2 ? MAN : PIN;
  if (n === 7) return index < 3 ? MAN : PIN;
  if ([3, 4, 9].includes(n)) return index % 2 ? SOU : PIN;
  return PIN;
}

function souLayout(n: number): [number, number][] {
  const layouts: Record<number, [number, number][]> = {
    2: [[30, 24], [30, 60]], 3: [[30, 20], [20, 58], [40, 58]], 4: [[20, 24], [40, 24], [20, 60], [40, 60]],
    5: [[19, 22], [41, 22], [30, 42], [19, 62], [41, 62]], 6: [[20, 20], [40, 20], [20, 42], [40, 42], [20, 64], [40, 64]],
    7: [[30, 15], [20, 38], [40, 38], [20, 56], [40, 56], [20, 73], [40, 73]],
    8: [[20, 15], [40, 15], [20, 34], [40, 34], [20, 53], [40, 53], [20, 72], [40, 72]],
    9: [[14, 19], [30, 19], [46, 19], [14, 42], [30, 42], [46, 42], [14, 65], [30, 65], [46, 65]],
  };
  return layouts[n];
}

function stick(x: number, y: number, color: string) {
  return `<rect x="${x - 4}" y="${y - 10.5}" width="8" height="21" rx="4" fill="${color}"/><rect x="${x - 1.3}" y="${y - 7}" width="2.6" height="14" rx="1.3" fill="${IVORY}" opacity=".5"/>`;
}

export function tileFace(i: number, red = false) {
  if (i < 9) return `<text x="30" y="40" font-size="36" text-anchor="middle" fill="${red ? MAN : INK}" font-family="serif" font-weight="600">${KANSU[i]}</text><text x="30" y="76" font-size="27" text-anchor="middle" fill="${MAN}" font-family="serif" font-weight="600">萬</text>`;
  if (i < 18) {
    const n = i - 8;
    return pinLayout(n).map(([x, y, radius], index) => {
      const color = red ? MAN : pinColor(n, index);
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="${INK}" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="${radius * 0.4}" fill="${IVORY}"/>`;
    }).join("");
  }
  if (i < 27) {
    const n = i - 17;
    if (n === 1) return `<path d="M30 12 L37 4 L24 6 Z" fill="${MAN}"/><circle cx="30" cy="22" r="8.5" fill="${SOU}"/><ellipse cx="30" cy="48" rx="13" ry="19" fill="${SOU}"/><path d="M30 62 L19 80 L41 80 Z" fill="${MAN}"/>`;
    return souLayout(n).map(([x, y], index) => stick(x, y, red ? MAN : n === 5 && index === 2 ? MAN : SOU)).join("");
  }
  const honor = i - 27;
  if (honor === 4) return `<rect x="11" y="11" width="38" height="62" fill="none" stroke="${PIN}" stroke-width="2.6"/><rect x="16" y="16" width="28" height="52" fill="none" stroke="${PIN}" stroke-width="1"/>`;
  const color = honor === 5 ? SOU : honor === 6 ? MAN : INK;
  return `<text x="30" y="60" font-size="44" text-anchor="middle" fill="${color}" font-family="serif" font-weight="600">${HONOR[honor]}</text>`;
}
