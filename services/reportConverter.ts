
const CHINESE_HEADERS = [
    "快照日期", "SKU", "FNSKU", "ASIN", "产品名称", "商品状况", "可用库存", "待移除库存",
    "库存龄 0-90 天", "库存龄 91-180 天", "库存龄 181-270 天", "库存龄 271-365 天", "库存龄 365 天以上", "货币",
    "7天销量", "30天销量", "60天销量", "90天销量", "警告", "你的售价", "销售价", "全新品最低含运价",
    "二手最低价", "推荐操作", "售出率", "商品体积", "体积单位", "存储类型", "存储体积", "站点", "商品类型",
    "销售排名", "供应天数", "预估超量库存", "30天周转周数", "90天周转周数", "特色优惠价",
    "7天销售额", "30天销售额", "60天销售额", "90天销售额", "库存龄 0-30 天", "库存龄 31-60 天", "库存龄 61-90 天",
    "库存龄 181-330 天", "库存龄 331-365 天", "下月预计仓储费", "入库中", "入库-处理中", "入库-已发货",
    "入库-已接收", "预留库存总计", "不可售库存", "供应周数", "预估超量供应周数", "建议补货数量", "建议补货日期",
    "AIS 271-300 天将收取费用数量", "AIS 271-300 天预估费用", "AIS 301-330 天将收取费用数量", "AIS 301-330 天预估费用",
    "AIS 331-365 天将收取费用数量", "AIS 331-365 天预估费用", "AIS 365 天以上将收取费用数量", "AIS 365 天以上预估费用",
    "库存龄快照日期", "FBA库存供应", "转运预留", "处理预留", "客户订单预留", "含在途库存的总供应天数"
];

const STORE_OWNER_MAP: Record<string, string> = {
    "aussie-warehouse": "Aussie-Warehouse-宋总",
    "aussievalue": "AussieValue-贺总",
    "cupking": "CupKing-彭总",
    "hotlabel-direct-au": "HotLabel-Direct-AU-贺总",
    "lian-au": "LIAN-AU-涂总",
    "liweght": "LIWEGHT-彭总",
    "lastinglife-au": "LastingLife-AU-洋总",
    "li-fitness-au": "Li-fitness-AU-金总",
    "oz-depot": "Oz-Depot-彭总",
    "oz-sales": "Oz-Sales-宋总",
    "ozquality": "OzQuality-彭总",
    "ozvalue": "OzValue-彭总",
    "ozvault": "OzVault-金总",
    "ozwarehouse": "OzWarehouse-洋总",
    "ozzydeals": "OzzyDeals-宋总",
    "usor-home": "USOR-Home-金总",
    "malkway-au": "malkway-AU-海总",
    "upet-au": "upet-AU-洋总",
    "dynamx-official-au": "Dynamx Official-AU-金总"
};

function normalizeKey(name: string) {
    return name.toLowerCase().replace(/[_-]/g, '').replace(/\s+/g, '');
}

export function findMatchedStoreName(fileName: string): string | null {
    const normalizedFileName = normalizeKey(fileName);
    for (const storePrefix in STORE_OWNER_MAP) {
        if (normalizedFileName.includes(normalizeKey(storePrefix))) {
            return STORE_OWNER_MAP[storePrefix];
        }
    }
    return null;
}

async function readFileAsTextWithBom(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(u8);
    }
    if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) {
        return new TextDecoder('utf-16le').decode(u8);
    }
    if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) {
        return new TextDecoder('utf-16be').decode(u8);
    }

    let text = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    // Logic for Amazon files that are UTF-16LE but have no BOM
    if (!text.includes('\t') && text.includes('\0')) {
        try {
            text = new TextDecoder('utf-16le', { fatal: false }).decode(u8);
        } catch { /* ignore */ }
    }
    return text;
}

function csvQuoteAll(value: any) {
    const s = (value ?? '').toString().replace(/"/g, '""');
    return `"${s}"`;
}

/**
 * Smartly converts TSV to CSV. If the input doesn't contain tabs, returns original.
 * If it does contain tabs, it replaces headers with standardized Chinese headers
 * if the column count matches, ensuring the analysis engine finds correct indices.
 */
export function tsvToCsv(rawText: string): string {
    let cleanText = rawText;
    if (cleanText.charCodeAt(0) === 0xFEFF) cleanText = cleanText.slice(1);

    const lines = cleanText.split(/\r?\n/).filter(l => l.trim() !== '');
    
    // Check if it's actually TSV (Amazon often names TSV as .csv)
    const hasTabs = lines.some(l => l.includes('\t'));
    if (!hasTabs) {
        return rawText; 
    }

    // Find the real header line
    const headerIdx = lines.findIndex(l => l.includes('\t') && (l.toLowerCase().includes('asin') || l.toLowerCase().includes('sku') || l.toLowerCase().includes('snapshot')));
    const actualHeaderIdx = headerIdx === -1 ? lines.findIndex(l => l.includes('\t')) : headerIdx;
    
    if (actualHeaderIdx === -1) {
        return rawText; 
    }

    const dataLines = lines.slice(actualHeaderIdx);
    const headerCells = dataLines[0].split('\t');
    const colCount = headerCells.length;

    // Use standardized headers if column count matches Inventory Health Report (typically 65-70 cols)
    // We check if it's at least 60 columns to be safe.
    const headerCsv = (colCount >= 60 && colCount <= 80)
        ? CHINESE_HEADERS.map(csvQuoteAll).join(',')
        : headerCells.map(csvQuoteAll).join(',');

    const csvRows = [headerCsv];

    for (let i = 1; i < dataLines.length; i++) {
        const row = dataLines[i].split('\t');
        if (row.length === 1 && row[0].trim() === '') continue;

        const alignedRow = [...row];
        // Align column count to header to prevent PapaParse issues
        if (alignedRow.length < colCount) {
            while (alignedRow.length < colCount) alignedRow.push('');
        } else if (alignedRow.length > colCount) {
            alignedRow.length = colCount;
        }

        const quoted = alignedRow.map(csvQuoteAll).join(',');
        csvRows.push(quoted);
    }

    return csvRows.join('\r\n');
}

export async function processFileContent(file: File): Promise<{ csvContent: string, matchedName: string }> {
    const rawText = await readFileAsTextWithBom(file);
    
    // Smart Detection: Always try to convert if tabs are present, regardless of extension.
    // This solves the issue where Amazon .csv files are actually TSV.
    const csvContent = tsvToCsv(rawText);
    
    const rawName = file.name.replace(/_/g, '-').toLowerCase();
    const matched = findMatchedStoreName(rawName);
    
    // Fallback name logic
    const storeName = matched || file.name.replace(/\.(txt|csv)$/i, '');
    
    return { csvContent, matchedName: storeName };
}
