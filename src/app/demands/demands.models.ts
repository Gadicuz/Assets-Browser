export interface MarketItem {
  id: number;
  name: string;
  q_demand?: number;
  q_market?: number;
  ratio: number;
  shortage: boolean;
}

export interface MarketData {
  name: string;
  items: MarketItem[];
}

export interface DemandDataChunk {
  type_id: number;
  quantity: number;
}

export interface DemandDataItem {
  icon: string;
  name: string;
  quantity: number;
  chunks: DemandDataChunk[];
}

export interface DemandLocData {
  id: number;
  name: string;
  items: DemandDataItem[];
  timestamp?: number;
}

export interface DemandLocItems {
  id: number;
  items: DemandDataChunk[];
}

export interface DemandInfo {
  name: string;
  timestamp: number;
  issuer_id: number;
  issuer_name: string;
  avatar: string;
  data: DemandLocData[];
  mail_id: number;
}

export interface DemandsReport {
  cards: DemandInfo[];
  markets: MarketData[];
  message?: string;
  comment?: string;
}

export interface DemandIssuerChip {
  caption: string;
  avatar: string;
  id: number;
}

export interface DemandSubjChip {
  caption: string;
  subject: string;
}

export type DemandChip = DemandIssuerChip | DemandSubjChip;
