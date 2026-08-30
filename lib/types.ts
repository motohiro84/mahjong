export type Suit = "man" | "pin" | "sou" | "honor";
export type MeldType = "PON" | "CHI" | "KAN" | "ANKAN" | "ADD";
export type AgariType = "ron" | "tsumo";
export type AnalysisTab = "input" | "visible" | "ukeire" | "aim" | "score";

export interface Tile {
  i: number;
  red: boolean;
}

export interface Meld {
  type: MeldType;
  base: number;
  tiles: number[];
  redFlags: boolean[];
  consumed: Tile[];
}

export interface HandSnapshot {
  hand: Tile[];
  melds: Meld[];
  dora: number[];
  uraDora: number[];
  discards: Tile[];
  otherDiscards: number[];
  kuikae: number[];
  riichi: boolean;
  winTile: number | null;
  round: number;
  seat: number;
  agariType: AgariType;
}

export interface AppState extends HandSnapshot {
  tab: AnalysisTab;
  yakuSort: "near" | "han";
  history: HandSnapshot[];
  hydrated: boolean;
}

export interface SetBlock {
  t: number;
  type: "shuntsu" | "kotsu";
}

export interface Decomposition {
  pair: number;
  sets: SetBlock[];
}

export interface YakuResult {
  nm: string;
  han?: number;
  yakuman?: number;
}

export interface ScorePayment {
  label: string;
  amount: string;
}

export interface ScoreResult {
  needWinTile?: boolean;
  noYaku?: boolean;
  yaku?: YakuResult[];
  fu?: number;
  han?: number;
  yakuman?: number;
  dora?: number;
  omoteDora?: number;
  uraDora?: number;
  akaDora?: number;
  wait?: string;
  score?: {
    total: number;
    limit: string;
    detail: string;
    payments: ScorePayment[];
  };
}

export interface UkeireTile {
  i: number;
  left: number;
}

export interface YakuGuide {
  name: string;
  han: string;
  openHan?: string;
  closedOnly?: boolean;
  distance: number;
  description: string;
  sample: number[];
  completed?: boolean;
}
