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
  markets: any;
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
