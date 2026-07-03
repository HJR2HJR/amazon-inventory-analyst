
export const OPERATORS = {
  "一组": ["陈蓉", "陈淑婷", "方敏慧", "贺月", "金曌萍", "李海海", "宋泽晨", "周勇梅"],
  "二组": ["王理洋", "方俊蕾", "洪嘉瑞", "李攀", "涂文珊", "汪龙冉", "韦斯泽", "游萌菲", "祝欣依"],
  "三组": ["彭灏", "蔡泽峰", "黄青丹", "贾莹", "潘嘉惠", "饶钦妮", "王珂子", "徐玲", "周梦媛"],
  "未匹配组": ["未匹配"]
};

export const ALL_COLUMNS = [
  "ASIN", "店铺名", "负责人", "SKU", "品名", "商品名称", "采购均价", "单位体积", 
  "仓储类型", "单位重量", "当前售出率", "90天内的销量", "在库货值", "在库总数量", 
  "在库总体积", "基础仓储费预估", "超龄附加费预估", "合计仓储费", "总货值", 
  "在途数量", "超龄货值", "超龄体积", "冗余货值", "冗余体积", "超龄单位仓储费", 
  "0-90库龄", "90-180库龄", "181-270库龄", "271-300库龄", "301-330库龄", 
  "331-365库龄", "大于365库龄", "货值分数", "超龄附加费分数", 
  "冗余基础仓储费分数", "冗余年龄分数", "风险权重"
];

export const DEFAULT_COLUMNS = [
  "ASIN", "负责人", "品名", "当前售出率", "90天内的销量", "在库货值", 
  "冗余货值", "冗余体积", "在库总数量", "在库总体积", "基础仓储费预估", "超龄附加费预估", 
  "合计仓储费", "风险权重"
];

export const STORE_NAME_MAPPING: Record<string, string> = {
  'Aussie-Warehouse-宋总': 'Aussie-Warehouse-AU',
  'AussieValue-贺总': 'AussieValue-AU',
  'CupKing-彭总': 'Cupking-AU',
  'Dynamx Official-AU-金总': 'Dynamx Official-AU',
  'HotLabel-Direct-AU-贺总': 'HotLabel-Direct-AU',
  'LastingLife-AU-洋总': 'LastingLife-AU',
  'Li-fitness-AU-金总': 'Li Fitness-AU',
  'LIAN-AU-涂总': 'LIAN-AU',
  'LIWEGHT-彭总': 'LIWEGHT-AU',
  'malkway-AU-海总': 'Malkway-AU',
  'Oz-Depot-彭总': 'Oz-Depot-AU',
  'OzQuality-彭总': 'OzQuality-AU',
  'Oz-Sales-宋总': 'Oz-Sales-AU',
  'OzValue-彭总': 'OzValue-AU',
  'OzVault-金总': 'OZ-Vault-AU',
  'OzWarehouse-洋总': 'OzWarehouse-AU',
  'OzzyDeals-宋总': 'OzzyDeals-AU',
  'upet-AU-洋总': 'upet-AU',
  'USOR-Home-金总': 'USOR-Home-AU'
};

export const AUD_TO_CNY_RATE = 4.8;
