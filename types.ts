
export interface ProductInfo {
  ASIN: string;
  店铺: string;
  Listing负责人: string;
  品名: string;
  采购均价: number;
}

export interface InventoryData {
  storeName: string;
  headers: string[];
  data: any[][];
  type: 'inventory';
}

export interface StorageData {
  asin: string;
  weight: number;
}

export interface ProcessedRow {
  ASIN: string;
  店铺名: string;
  负责人: string;
  SKU: string;
  品名: string;
  商品名称: string;
  采购均价: number;
  单位体积: number;
  仓储类型: string;
  单位重量: number;
  当前售出率: number;
  '90天内的销量': number;
  在库货值: number;
  在库总数量: number;
  在库总体积: number;
  基础仓储费预估: number;
  超龄附加费预估: number;
  合计仓储费: number;
  总货值: number;
  在途数量: number;
  超龄货值: number;
  超龄体积: number;
  冗余货值: number;
  冗余体积: number;
  超龄单位仓储费: number;
  '0-90库龄': number;
  '90-180库龄': number;
  '181-270库龄': number;
  '271-300库龄': number;
  '301-330库龄': number;
  '331-365库龄': number;
  '大于365库龄': number;
  货值分数: number;
  超龄附加费分数: number;
  冗余基础仓储费分数: number;
  冗余年龄分数: number;
  风险权重: number;
  
  // Over-age report specific fields
  removalCostCNY: number;
  disposalCostCNY: number;
  sellingCostCNY: string; // String to handle infinity symbols/text
  monthsToClear: number | string;
  avgMonthlyCost: number;
}

export interface AnalysisResult {
  processedData: ProcessedRow[];
}
