export interface Memo {
  id: string;
  title?: string;
  body: string;
  createdAt: string;
  tags: string[];
  starred?: boolean;
  sortOrder?: number;
}
