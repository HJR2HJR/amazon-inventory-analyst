
import { ProductInfo, InventoryData, StorageData, AnalysisResult, ProcessedRow } from '../types';
import { STORE_NAME_MAPPING, AUD_TO_CNY_RATE } from '../constants';

const getNum = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const numStr = String(val).replace(/,/g, '');
  const num = parseFloat(numStr);
  return isNaN(num) ? 0 : num;
};

function calculateRemovalFee(storageType: string, weight_kg: number): number {
    const weight_g = weight_kg * 1000;
    if (storageType === '标准件') {
        if (weight_g <= 500) return 0.65; 
        if (weight_g <= 1000) return 0.84;
        return 1.01 + 0.29 * (Math.max(0, weight_kg - 1));
    } 
    else if (storageType === '大件') {
        if (weight_g <= 500) return 0.75;
        if (weight_g <= 1000) return 1.13;
        if (weight_g <= 2000) return 1.45;
        if (weight_g <= 5000) return 2.20;
        return 3.30 + 0.29 * (Math.max(0, weight_kg - 5));
    }
    return 0;
}

function calculateDisposalFee(storageType: string, weight_kg: number): number {
    const weight_g = weight_kg * 1000;
    if (storageType === '标准件') {
        if (weight_g <= 200) return 0.21;
        if (weight_g <= 500) return 0.37;
        if (weight_g <= 1000) return 0.53;
        return 0.59 + 0.29 * (Math.max(0, weight_kg - 1));
    } 
    else if (storageType === '大件') {
        if (weight_g <= 500) return 0.26;
        if (weight_g <= 1000) return 0.47;
        if (weight_g <= 2000) return 0.70;
        if (weight_g <= 5000) return 1.29;
        return 2.20 + 0.29 * (Math.max(0, weight_kg - 5));
    }
    return 0;
}

function calculateClearanceMetrics(
  unitVolume: number,
  qty_ab: number, // 271-300
  qty_ac: number, // 301-330
  qty_ad: number, // 331-365
  qty_ae: number, // >365
  dailySales: number,
  exchangeRate: number
) {
    const rate_ab_vol = 155 * unitVolume;
    const rate_ac_vol = 175 * unitVolume;
    const rate_ad_vol = 185 * unitVolume;
    const rate_ae_vol = 370 * unitVolume;
    const rate_ae_item = 0.12;
    
    if (dailySales <= 0) {
        const currentMonthlyCostAUD = (qty_ab * rate_ab_vol) + (qty_ac * rate_ac_vol) + (qty_ad * rate_ad_vol) + (qty_ae * Math.max(rate_ae_vol, rate_ae_item));
        const currentMonthlyCostCNY = currentMonthlyCostAUD * exchangeRate;
        return {
            costString: `∞ (月费: ${currentMonthlyCostCNY.toFixed(2)} CNY)`,
            totalCostCNY: Infinity,
            monthsToClear: Infinity,
            avgMonthlyCost: currentMonthlyCostCNY
        };
    }

    let totalCostAUD = 0;
    const salesPerMonth = dailySales * 30; 
    let month = 0; 
    
    let temp_ab = qty_ab;
    let temp_ac = qty_ac;
    let temp_ad = qty_ad;
    let temp_ae = qty_ae;

    for (month = 0; month < 120; month++) {
        const totalOverAgeQty = temp_ab + temp_ac + temp_ad + temp_ae;
        if (totalOverAgeQty <= 0) break;
        const costThisMonth = (temp_ab * rate_ab_vol) + (temp_ac * rate_ac_vol) + (temp_ad * rate_ad_vol) + (temp_ae * Math.max(rate_ae_vol, rate_ae_item));
        totalCostAUD += costThisMonth;
        let remainingSales = salesPerMonth;
        let sold_ae = Math.min(temp_ae, remainingSales); temp_ae -= sold_ae; remainingSales -= sold_ae;
        let sold_ad = Math.min(temp_ad, remainingSales); temp_ad -= sold_ad; remainingSales -= sold_ad;
        let sold_ac = Math.min(temp_ac, remainingSales); temp_ac -= sold_ac; remainingSales -= sold_ac;
        let sold_ab = Math.min(temp_ab, remainingSales); temp_ab -= sold_ab;
        temp_ae += temp_ad;
        temp_ad = temp_ac;
        temp_ac = temp_ab;
        temp_ab = 0; 
    }
    
    const finalQty = temp_ab + temp_ac + temp_ad + temp_ae;
    if (finalQty > 0) {
        const currentMonthlyCostAUD = (qty_ab * rate_ab_vol) + (qty_ac * rate_ac_vol) + (qty_ad * rate_ad_vol) + (qty_ae * Math.max(rate_ae_vol, rate_ae_item));
        const currentMonthlyCostCNY = currentMonthlyCostAUD * exchangeRate;
        return {
            costString: `> 10年 (月费: ${currentMonthlyCostCNY.toFixed(2)} CNY)`,
            totalCostCNY: Infinity,
            monthsToClear: Infinity,
            avgMonthlyCost: currentMonthlyCostCNY
        };
    }
    
    const totalCostCNY = totalCostAUD * exchangeRate;
    return {
        costString: totalCostCNY.toFixed(2),
        totalCostCNY: totalCostCNY,
        monthsToClear: month,
        avgMonthlyCost: month > 0 ? totalCostCNY / month : 0
    };
}

export function processAllData(
  productInfo: ProductInfo[],
  allInventory: InventoryData[],
  allStorage: { storeName: string, data: StorageData[] }[]
): AnalysisResult {
  let tempProcessedData: any[] = [];
  const storageMap = new Map<string, number>();

  // Helper to normalize store name for comparison
  const normStore = (s: string) => (s || '').trim().toLowerCase();

  allStorage.forEach(({ storeName, data }) => {
    const mappedStoreName = STORE_NAME_MAPPING[storeName] || storeName;
    const nMapped = normStore(mappedStoreName);
    data.forEach(item => {
      const key = `${item.asin}-${nMapped}`;
      storageMap.set(key, getNum(item.weight));
    });
  });

  allInventory.forEach(({ storeName, data }) => {
    const mappedStoreName = STORE_NAME_MAPPING[storeName] || storeName;
    const nMapped = normStore(mappedStoreName);
    
    data.forEach(row => {
      // Relaxed column check: Inventory reports vary slightly but 60 is a safe threshold for AIS columns.
      if (!row || row.length < 60) return;

      const summary_qty_0_90 = getNum(row[8]);
      const summary_qty_90_180 = getNum(row[9]);
      const summary_qty_181_270 = getNum(row[10]);
      const summary_qty_271_365 = getNum(row[11]);
      const summary_qty_over_365 = getNum(row[12]);

      const totalInStock = summary_qty_0_90 + summary_qty_90_180 + summary_qty_181_270 + summary_qty_271_365 + summary_qty_over_365;
      const inTransit = getNum(row[49]);
      if (totalInStock === 0 && inTransit === 0) return;

      const asin = row[3];
      // Store-aware matching with normalization
      const product = productInfo.find(p => p.ASIN === asin && normStore(p.店铺) === nMapped);
      const avgCost = product ? getNum(product['采购均价']) : 0;
      const unitVolume = getNum(row[25]);
      const unitWeight = storageMap.get(`${asin}-${nMapped}`) || 0;

      const ais_qty_271_300 = getNum(row[57]);
      const ais_qty_301_330 = getNum(row[59]);
      const ais_qty_331_365 = getNum(row[61]);
      const ais_qty_over_365 = getNum(row[63]);

      const qty_0_90 = summary_qty_0_90;
      const qty_90_180 = summary_qty_90_180;
      const qty_181_270 = Math.max(0,
        (summary_qty_181_270 + summary_qty_271_365 + summary_qty_over_365)
        - (ais_qty_271_300 + ais_qty_301_330 + ais_qty_331_365 + ais_qty_over_365)
      );

      const redundantQty = summary_qty_90_180 + summary_qty_181_270 + summary_qty_271_365 + summary_qty_over_365;
      const redundantValue_AT = redundantQty * avgCost;

      const surcharge_271_300_aud = ais_qty_271_300 * unitVolume * 155;
      const surcharge_301_330_aud = ais_qty_301_330 * unitVolume * 175;
      const surcharge_331_365_aud = ais_qty_331_365 * unitVolume * 185;
      const surcharge_over_365_aud = Math.max(ais_qty_over_365 * unitVolume * 370, ais_qty_over_365 * 0.12);
      const totalSurcharge_AU_aud = surcharge_271_300_aud + surcharge_301_330_aud + surcharge_331_365_aud + surcharge_over_365_aud;

      const storageType = row[27] === 'Standard' ? '标准件' : '大件';
      const redundantVolume = redundantQty * unitVolume;
      const redundantBaseFee_AV_aud = storageType === '标准件' ? redundantVolume * 37 : redundantVolume * 34.20;

      const aw_numerator = (qty_90_180 * 1) + (qty_181_270 * 2) + (ais_qty_271_300 * 4) + (ais_qty_301_330 * 5) + (ais_qty_331_365 * 6) + (ais_qty_over_365 * 8);
      const aw_denominator_qty = qty_90_180 + qty_181_270 + ais_qty_271_300 + ais_qty_301_330 + ais_qty_331_365 + ais_qty_over_365;
      const redundantAgeScore_AW = aw_denominator_qty > 0 ? aw_numerator / (8 * aw_denominator_qty) : 0;

      const totalInStockVolume = totalInStock * unitVolume;
      const baseFeeAUD = storageType === '标准件' ? totalInStockVolume * 37 : totalInStockVolume * 34.20;
      const over270StockCount = ais_qty_271_300 + ais_qty_301_330 + ais_qty_331_365 + ais_qty_over_365;

      const sales90d = getNum(row[17]);
      const dailySales = sales90d / 90;
      const overAgeMetrics = calculateClearanceMetrics(unitVolume, ais_qty_271_300, ais_qty_301_330, ais_qty_331_365, ais_qty_over_365, dailySales, AUD_TO_CNY_RATE);

      const removalFeeAUD = calculateRemovalFee(storageType, unitWeight);
      const disposalFeeAUD = calculateDisposalFee(storageType, unitWeight);

      const manager = product ? product['Listing负责人'] : '未匹配';

      tempProcessedData.push({
        'ASIN': asin,
        '店铺名': mappedStoreName,
        '负责人': manager,
        'SKU': row[1],
        '品名': product ? product['品名'] : 'N/A',
        '商品名称': row[4],
        '采购均价': avgCost,
        '单位体积': unitVolume,
        '仓储类型': storageType,
        '单位重量': unitWeight,
        '当前售出率': getNum(row[24]),
        '90天内的销量': sales90d,
        '在库货值': totalInStock * avgCost,
        '在库总数量': totalInStock,
        '在库总体积': totalInStockVolume,
        '总货值': (totalInStock + inTransit) * avgCost,
        '在途数量': inTransit,
        '超龄货值': over270StockCount * avgCost,
        '超龄体积': over270StockCount * unitVolume,
        '冗余货值': redundantValue_AT,
        '0-90库龄': qty_0_90,
        '90-180库龄': qty_90_180,
        '181-270库龄': qty_181_270,
        '271-300库龄': ais_qty_271_300,
        '301-330库龄': ais_qty_301_330,
        '331-365库龄': ais_qty_331_365,
        '大于365库龄': ais_qty_over_365,
        '基础仓储费预估_AUD': baseFeeAUD,
        '超龄附加费预估_AUD': totalSurcharge_AU_aud,
        '合计仓储费_AUD': baseFeeAUD + totalSurcharge_AU_aud,
        '超龄单位仓储费_AUD': over270StockCount > 0 ? ((totalInStockVolume > 0 ? (over270StockCount * unitVolume / totalInStockVolume) * baseFeeAUD : 0) + totalSurcharge_AU_aud) / over270StockCount : 0,
        'intermediate_redundantValue_AT': redundantValue_AT,
        'intermediate_redundantBaseFee_AV_aud': redundantBaseFee_AV_aud,
        'intermediate_redundantAgeScore_AW': redundantAgeScore_AW,
        
        'removalCostCNY': over270StockCount * removalFeeAUD * AUD_TO_CNY_RATE,
        'disposalCostCNY': over270StockCount * disposalFeeAUD * AUD_TO_CNY_RATE,
        'sellingCostCNY': overAgeMetrics.costString,
        'monthsToClear': overAgeMetrics.monthsToClear,
        'avgMonthlyCost': overAgeMetrics.avgMonthlyCost
      });
    });
  });

  const max_AT = Math.max(...tempProcessedData.map(d => d.intermediate_redundantValue_AT)) || 1;
  const max_AU = Math.max(...tempProcessedData.map(d => d.超龄附加费预估_AUD)) || 1;
  const max_AV = Math.max(...tempProcessedData.map(d => d.intermediate_redundantBaseFee_AV_aud)) || 1;

  const finalData = tempProcessedData.map((d) => {
    const valueScore = d.intermediate_redundantValue_AT / max_AT;
    const surchargeScore = d.超龄附加费预估_AUD / max_AU;
    const redundantFeeScore = d.intermediate_redundantBaseFee_AV_aud / max_AV;
    const riskWeight = 0.27 * valueScore + 0.48 * surchargeScore + 0.1 * redundantFeeScore + 0.15 * d.intermediate_redundantAgeScore_AW;

    return {
      'ASIN': d.ASIN,
      '店铺名': d.店铺名,
      '负责人': d.负责人,
      'SKU': d.SKU,
      '品名': d.品名,
      '商品名称': d.商品名称,
      '采购均价': d.采购均价,
      '单位体积': d.单位体积,
      '仓储类型': d.仓储类型,
      '单位重量': d.单位重量,
      '当前售出率': d.当前售出率,
      '90天内的销量': d['90天内的销量'],
      '在库货值': d.在库货值,
      '在库总数量': d.在库总数量,
      '在库总体积': d.在库总体积,
      '基础仓储费预估': d.基础仓储费预估_AUD * AUD_TO_CNY_RATE,
      '超龄附加费预估': d.超龄附加费预估_AUD * AUD_TO_CNY_RATE,
      '合计仓储费': d.合计仓储费_AUD * AUD_TO_CNY_RATE,
      '总货值': d.总货值,
      '在途数量': d.在途数量,
      '超龄货值': d.超龄货值,
      '超龄体积': d.超龄体积,
      '冗余货值': d.冗余货值,
      '超龄单位仓储费': d.超龄单位仓储费_AUD * AUD_TO_CNY_RATE,
      '0-90库龄': d['0-90库龄'],
      '90-180库龄': d['90-180库龄'],
      '181-270库龄': d['181-270库龄'],
      '271-300库龄': d['271-300库龄'],
      '301-330库龄': d['301-330库龄'],
      '331-365库龄': d['331-365库龄'],
      '大于365库龄': d['大于365库龄'],
      '货值分数': valueScore,
      '超龄附加费分数': surchargeScore,
      '冗余基础仓储费分数': redundantFeeScore,
      '冗余年龄分数': d.intermediate_redundantAgeScore_AW,
      '风险权重': riskWeight,
      
      'removalCostCNY': d.removalCostCNY,
      'disposalCostCNY': d.disposalCostCNY,
      'sellingCostCNY': d.sellingCostCNY,
      'monthsToClear': d.monthsToClear,
      'avgMonthlyCost': d.avgMonthlyCost
    };
  });

  return { processedData: finalData as ProcessedRow[] };
}
