
import { ProcessedRow } from '../types';

/**
 * Generates the "Over-age Inventory Analysis Report" HTML.
 * Focusing on hyper-focused stock clear-out analysis for the 271+ days segment.
 * Includes Total In-stock Quantity and Volume for better overall context.
 */
export function generateOverAgeHtmlReport(groupName: string, data: ProcessedRow[]): string {
    const unassignedKey = '未匹配';
    const reportFilterMembers = Array.from(new Set(data.map(d => d.负责人))).filter(m => m !== unassignedKey).sort();
    
    const headers = [
        'ASIN', '负责人', '品名', '在库总数', '在库总体积(m³)', '超龄总数', '超龄货值', 
        '当前移除费 (CNY)', '当前弃置费 (CNY)', '预估总超龄仓储费 (CNY)',
        '清完月数', '月均超龄仓储 (CNY)', '仓储类型', '单位体积(m³)', '单位重量(kg)',
        '当前售出率', '90天销量', '商品名称' 
    ];

    const keys = [
        'ASIN', '负责人', '品名', '在库总数量', '在库总体积', '超龄总数量', '超龄货值',
        'removalCostCNY', 'disposalCostCNY', 'sellingCostCNY',
        'monthsToClear', 'avgMonthlyCost', '仓储类型', '单位体积', '单位重量',
        '当前售出率', '90天内的销量', '商品名称' 
    ];

    let tableRows = '';
    data.forEach(row => {
        const overAgeQty = (row['271-300库龄'] || 0) + (row['301-330库龄'] || 0) + (row['331-365库龄'] || 0) + (row['大于365库龄'] || 0);
        if (overAgeQty <= 0) return;

        tableRows += `<tr data-manager="${row.负责人}">`;
        keys.forEach(key => {
            let value: any = (row as any)[key];
            let attributes = '';
            
            if (key === '超龄总数量') {
                value = overAgeQty;
                const tooltipText = `271-300天: ${row['271-300库龄']}\n301-330天: ${row['301-330库龄']}\n331-365天: ${row['331-365库龄']}\n>365天: ${row['大于365库龄']}`;
                attributes += ` data-tooltip="${tooltipText}" style="cursor: pointer; font-weight: bold; color: #ef4444;"`;
            }

            // Fix Infinity display
            if (value === Infinity || value === 'Infinity') {
                value = '∞';
            }
            
            if (typeof value === 'number' && !Number.isInteger(value)) {
                if (['超龄货值', 'removalCostCNY', 'disposalCostCNY', 'avgMonthlyCost', '在库总体积'].includes(key)) {
                    value = value.toFixed(2);
                } else {
                    value = value.toFixed(3); 
                }
            }

            if (key === '商品名称') {
                const safeValue = (value || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                attributes += ` title="${safeValue}" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; font-size: 11px; color: #6b7280;"`;
            }

            if (key === 'ASIN' || key === '负责人' || key === '品名') {
                attributes += ` style="background: #fff;"`;
            }

            tableRows += `<td${attributes}>${value}</td>`;
        });
        tableRows += '</tr>\n';
    });

    const filterOptions = reportFilterMembers.map(m => `<option value="${m}">${m}</option>`).join('');

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>超龄库存分析报告 - ${groupName}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <style>
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; overflow: hidden; font-family: "Inter", -apple-system, sans-serif; background-color: #f8f9fa; color: #212529; display: flex; flex-direction: column; }
        header { flex-shrink: 0; padding: 20px 20px 0 20px; }
        h1 { text-align: center; color: #343a40; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.025em; }
        p { text-align: center; color: #6c757d; margin: 0 0 16px 0; font-size: 14px; }
        .filters-container { flex-shrink: 0; background: #fff; border-radius: 12px; padding: 16px 20px; margin: 0 20px 20px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e9ecef; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
        .filters-container label { font-size: 13px; font-weight: 600; color: #4b5563; display: flex; align-items: center; gap: 8px; }
        .filters-container select { padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1px solid #d1d5db; cursor: pointer; outline: none; }
        .export-button { margin-left: auto; padding: 10px 20px; font-size: 13px; font-weight: 700; background-color: #059669; color: white; border: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
        .export-button:hover { background-color: #047857; transform: translateY(-1px); }
        .table-container { flex-grow: 1; overflow: auto; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); background-color: #fff; margin: 0 20px 20px 20px; }
        
        table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 13px; }
        thead { position: sticky; top: 0; z-index: 100; }
        th, td { border: 1px solid #f3f4f6; padding: 12px 15px; text-align: left; white-space: nowrap; min-width: 100px; color: #374151; }
        th { background-color: #f9fafb; font-weight: 700; color: #6b7280; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; box-shadow: 0 1px 2px rgba(0,0,0,0.05); cursor: pointer; position: relative; padding-right: 30px; }
        th:hover { background-color: #f3f4f6; color: #111827; }
        
        /* Frozen columns logic */
        th:nth-child(1), td:nth-child(1) { position: sticky; left: 0; z-index: 25; width: 130px; min-width: 130px; border-right: 2px solid #e5e7eb; background: #fff; }
        th:nth-child(2), td:nth-child(2) { position: sticky; left: 130px; z-index: 25; width: 100px; min-width: 100px; border-right: 2px solid #e5e7eb; background: #fff; }
        th:nth-child(3), td:nth-child(3) { position: sticky; left: 230px; z-index: 25; width: 180px; min-width: 180px; border-right: 2px solid #e5e7eb; background: #fff; }
        
        tr:hover td { background-color: #f0f7ff !important; }
        .total-row { font-weight: bold; background-color: #eff6ff; }
        
        [data-tooltip]::after { content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #1f2937; color: #fff; padding: 8px; border-radius: 6px; font-size: 11px; font-weight: normal; white-space: pre-line; visibility: hidden; opacity: 0; transition: opacity 0.2s; z-index: 200; pointer-events: none; width: 120px; text-align: center; }
        [data-tooltip]:hover::after { visibility: visible; opacity: 1; }
    </style>
</head>
<body>
    <header>
        <h1>超龄库存分析报告 (${groupName})</h1>
        <p>数据范围：271+天库龄商品。移除/弃置费用基于单位体积和重量估算。</p>
    </header>

    <div class="filters-container">
        <label>
            <span>筛选人员：</span>
            <select id="managerFilter">
                <option value="all">全部人员</option>
                ${filterOptions}
            </select>
        </label>
        <button class="export-button" onclick="exportToExcel()">导出此表格为 Excel</button>
    </div>

    <div class="table-container">
        <table id="analysisTable">
            <thead>
                <tr>
                    ${headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody id="tableBody">
                ${tableRows}
            </tbody>
        </table>
    </div>

    <script>
        const managerFilter = document.getElementById('managerFilter');
        const rows = Array.from(document.querySelectorAll('#tableBody tr'));

        managerFilter.onchange = () => {
            const val = managerFilter.value;
            rows.forEach(r => {
                r.style.display = (val === 'all' || r.dataset.manager === val) ? '' : 'none';
            });
        };

        function exportToExcel() {
            const table = document.getElementById('analysisTable');
            const wb = XLSX.utils.table_to_book(table, {sheet: "超龄库存分析"});
            XLSX.writeFile(wb, "超龄库存分析报告_${groupName}_" + new Date().toISOString().split('T')[0] + ".xlsx");
        }

        // Sorting Logic
        document.querySelectorAll('th').forEach((th, idx) => {
            let asc = true;
            th.onclick = () => {
                const tbody = document.getElementById('tableBody');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                rows.sort((a, b) => {
                    let vA = a.cells[idx].innerText.replace('￥', '').replace(',', '');
                    let vB = b.cells[idx].innerText.replace('￥', '').replace(',', '');
                    if (vA === '∞') vA = 99999999;
                    if (vB === '∞') vB = 99999999;
                    if (!isNaN(vA) && !isNaN(vB)) return asc ? vA - vB : vB - vA;
                    return asc ? vA.localeCompare(vB) : vB.localeCompare(vA);
                });
                asc = !asc;
                rows.forEach(r => tbody.appendChild(r));
            };
        });
    </script>
</body>
</html>`;
}
