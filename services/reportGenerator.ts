
import { ProcessedRow } from '../types';
import { OPERATORS } from '../constants';

export type ReportType = 'personal' | 'group' | 'company';

/**
 * Unified Visual Report Generator:
 * - Supports Personal (Static), Group (Operator Filter), and Company (Group + Operator Filter) types.
 * - Dynamically toggles "Manager" column and filter UI based on reportType variable in browser.
 */
export function generateOperatorHtmlReport(
    title: string, 
    data: ProcessedRow[], 
    type: ReportType = 'personal'
): string {
  // Sanitize data string to prevent </script> injection and ensure valid JS syntax
  const dataWithInternalId = data.map((row, index) => ({ ...row, id: index }));
  const dataString = JSON.stringify(dataWithInternalId).replace(/<\/script>/g, '<\\/script>');
  const operatorMapString = JSON.stringify(OPERATORS);
  
  const isPersonal = type === 'personal';
  const isCompany = type === 'company';

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - 库存健康报告</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', 'Microsoft YaHei', 'PingFang SC', sans-serif; background-color: #f3f4f6; color: #1f2937; font-size: 15px; }
        .tab-btn.active { background-color: #4f46e5; color: white; }
        .details-card { transition: all 0.2s; border: 1px solid transparent; background: #fff; border-radius: 1.25rem; }
        .details-card:hover { background-color: #f8fafc; border-color: #c7d2fe; }
        .meta-text { font-weight: 400 !important; color: #6b7280; }
        th { cursor: pointer; transition: color 0.2s; white-space: nowrap; }
        th:hover { color: #4f46e5; }
        .chart-center-btn { 
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
            width: 80px; height: 80px; background-color: white; border-radius: 50%; 
            display: flex; align-items: center; justify-content: center; 
            font-weight: 800; font-size: 0.9rem; color: #4f46e5; cursor: pointer; 
            border: 4px solid #f3f4f6; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            transition: all 0.2s; z-index: 10;
        }
        .chart-center-btn:hover { transform: translate(-50%, -50%) scale(1.05); border-color: #c7d2fe; }
        .tooltip-container { 
            position: fixed; width: auto; min-width: 17rem; padding: 1rem 1.25rem; 
            background-color: #1e293b; color: white; text-align: left; 
            border-radius: 0.75rem; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.5); 
            opacity: 0; transition: opacity 0.2s; visibility: hidden; 
            z-index: 1000; pointer-events: none; border: 1px solid #334155;
        }
        .cost-row { transition: background-color 0.1s; border-bottom: 1px solid #f1f5f9; }
        .cost-row:hover { background-color: #f8fafc; }
        select { background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); background-position: right 0.5rem center; background-repeat: no-repeat; background-size: 1.5em 1.5em; padding-right: 2.5rem; appearance: none; }
    </style>
</head>
<body class="p-6 md:p-10">
    <div class="max-w-7xl mx-auto">
        <header class="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
            <div class="text-center md:text-left">
                <h1 class="text-3xl font-bold text-gray-800 tracking-tight">${isPersonal ? '个人' : type === 'group' ? '小组' : '公司'}库存健康报告</h1>
                <p class="text-gray-500 mt-1 font-medium">报告范围: ${title}</p>
            </div>

            ${!isPersonal ? `
            <div class="flex flex-wrap gap-3 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                ${isCompany ? `
                <div class="space-y-1">
                    <span class="text-[10px] font-bold text-gray-400 uppercase ml-1">筛选小组</span>
                    <select id="group-filter" class="block w-40 text-sm border-gray-200 rounded-xl focus:ring-indigo-500 py-2 px-3">
                        <option value="all">所有小组</option>
                        ${Object.keys(OPERATORS).map(g => `<option value="${g}">${g}</option>`).join('')}
                    </select>
                </div>` : ''}
                <div class="space-y-1">
                    <span class="text-[10px] font-bold text-gray-400 uppercase ml-1">筛选人员</span>
                    <select id="operator-filter" class="block w-40 text-sm border-gray-200 rounded-xl focus:ring-indigo-500 py-2 px-3">
                        <option value="all">所有人员</option>
                    </select>
                </div>
            </div>` : ''}

            <div class="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                <span class="text-xs font-bold text-indigo-400 uppercase tracking-widest block text-right">生成时间</span>
                <span class="text-sm font-bold text-indigo-700">${new Date().toLocaleDateString()}</span>
            </div>
        </header>

        <div class="mb-8 flex justify-center">
            <div class="flex space-x-2 bg-gray-200 p-1 rounded-xl">
                <button id="age-view-btn" class="tab-btn active w-36 py-2.5 rounded-lg font-bold text-sm transition-all">库龄分析</button>
                <button id="cost-view-btn" class="tab-btn w-36 py-2.5 rounded-lg font-bold text-sm text-gray-600 transition-all">费用分析</button>
            </div>
        </div>

        <main>
            <div id="age-view" class="animate-in fade-in duration-300">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div class="lg:col-span-1 bg-white p-8 rounded-3xl shadow-lg flex flex-col items-center justify-center">
                        <h2 class="text-lg font-bold text-gray-700 mb-6 text-center">库龄分布 (按件数)</h2>
                        <div class="relative w-full max-w-xs mx-auto mb-6">
                            <canvas id="age-chart"></canvas>
                            <div id="chart-center-all-btn" class="chart-center-btn">全部库龄</div>
                        </div>
                        <div id="chart-legend" class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-bold text-gray-500 w-full"></div>
                    </div>

                    <div class="lg:col-span-2 bg-white p-8 rounded-3xl shadow-lg">
                        <div class="flex justify-between items-start mb-6">
                            <div>
                                <h2 id="details-title" class="text-2xl font-bold text-gray-800">库存明细汇总</h2>
                                <p id="details-subtitle" class="text-xs text-slate-400 mt-1">点击库龄区块进行交叉筛选</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div class="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
                                <p class="text-[11px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">SKU总数</p>
                                <p id="total-sku" class="text-xl font-bold text-gray-800">0</p>
                            </div>
                            <div class="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
                                <p class="text-[11px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">在库总数量</p>
                                <p id="total-quantity" class="text-xl font-bold text-gray-800">0</p>
                            </div>
                            <div class="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
                                <p class="text-[11px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">在库体积(m³)</p>
                                <p id="total-volume" class="text-xl font-bold text-gray-800">0.000</p>
                            </div>
                            <div class="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100">
                                <p class="text-[11px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">总货值</p>
                                <p id="total-value" class="text-xl font-bold text-indigo-600">￥0</p>
                            </div>
                        </div>

                        <div id="product-list-container" class="space-y-3 overflow-y-auto pr-2" style="max-height: 480px;"></div>
                    </div>
                </div>
            </div>

            <div id="cost-view" class="hidden animate-in fade-in duration-300">
                <div class="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
                    <div class="p-8 border-b border-gray-50 flex justify-between items-center">
                        <h2 class="text-xl font-bold text-gray-800">库存费用明细 analysis</h2>
                        <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">点击表头可排序 | 红色背景代表超龄费用风险</span>
                    </div>
                    <div class="overflow-x-auto max-h-[700px]">
                        <table class="w-full">
                            <thead class="sticky top-0 z-10 bg-gray-50 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b">
                                <tr>
                                    <th class="px-8 py-5 text-left" data-sort="品名">基本信息</th>
                                    ${!isPersonal ? '<th class="px-4 py-5 text-center" data-sort="负责人">负责人</th>' : ''}
                                    <th class="px-4 py-5 text-center" data-sort="在库总数量">数量</th>
                                    <th class="px-4 py-5 text-center" data-sort="在库总体积">体积 (m³)</th>
                                    <th class="px-4 py-5 text-center" data-sort="在库货值">货值 (￥)</th>
                                    <th class="px-4 py-5 text-center" data-sort="基础仓储费预估">基础费 (￥)</th>
                                    <th class="px-4 py-5 text-center" data-sort="超龄附加费预估">超龄费 (￥)</th>
                                    <th class="px-4 py-5 text-center" data-sort="合计仓储费">总费用 (￥)</th>
                                    <th class="px-8 py-5 text-center" data-sort="风险权重">风险权重</th>
                                </tr>
                            </thead>
                            <tbody id="cost-table-body" class="divide-y divide-gray-50"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <div id="common-tooltip" class="tooltip-container"></div>

    <script>
        const rawData = ${dataString};
        const operatorMap = ${operatorMapString};
        const reportType = '${type}';

        // Helper to escape values for innerHTML template strings to avoid syntax errors
        const esc = (val) => {
            if (val === null || val === undefined) return '';
            return String(val)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\`/g, '&#96;')
                .replace(/\\\${/g, '&#36;&#123;');
        };
        
        let ageChart;
        let filters = { segment: null, group: 'all', operator: 'all' };
        let currentSort = { key: '风险权重', order: 'desc' };
        
        const ageSegments = {
            '0-90': d => d['0-90库龄'],
            '91-180': d => (d['90-180库龄']||0) + (d['181-270库龄']||0),
            '271-365': d => (d['271-300库龄']||0) + (d['301-330库龄']||0) + (d['331-365库龄']||0),
            '365+': d => d['大于365库龄']
        };
        const chartColors = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

        document.addEventListener('DOMContentLoaded', () => {
            initFilters();
            initChart();
            bindEvents();
            refreshUI();
        });

        function initFilters() {
            const opSelect = document.getElementById('operator-filter');
            const groupSelect = document.getElementById('group-filter');
            if (!opSelect) return;

            const updateOperators = (groupName) => {
                opSelect.innerHTML = '<option value="all">所有人员</option>';
                let list = [];
                if (groupName === 'all') {
                    list = Object.values(operatorMap).flat();
                } else {
                    list = operatorMap[groupName] || [];
                }
                Array.from(new Set(list)).sort().forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name; opt.textContent = name;
                    opSelect.appendChild(opt);
                });
            };

            if (groupSelect) {
                groupSelect.onchange = (e) => {
                    filters.group = e.target.value;
                    filters.operator = 'all';
                    updateOperators(filters.group);
                    refreshUI();
                };
            }

            if (reportType === 'group') {
                const members = Array.from(new Set(rawData.map(d => d.负责人))).sort();
                members.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m; opt.textContent = m;
                    opSelect.appendChild(opt);
                });
            } else if (reportType === 'company') {
                updateOperators('all');
            }

            opSelect.onchange = (e) => {
                filters.operator = e.target.value;
                refreshUI();
            };
        }

        function bindEvents() {
            document.getElementById('age-view-btn').onclick = () => switchView('age');
            document.getElementById('cost-view-btn').onclick = () => switchView('cost');
            document.getElementById('chart-center-all-btn').onclick = () => { filters.segment = null; refreshUI(); };

            document.querySelectorAll('th[data-sort]').forEach(th => {
                th.onclick = () => {
                    const key = th.dataset.sort;
                    if (currentSort.key === key) currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
                    else { currentSort.key = key; currentSort.order = 'desc'; }
                    renderCostTable();
                };
            });
        }

        function switchView(v) {
            document.getElementById('age-view').classList.toggle('hidden', v !== 'age');
            document.getElementById('cost-view').classList.toggle('hidden', v !== 'cost');
            document.getElementById('age-view-btn').classList.toggle('active', v === 'age');
            document.getElementById('cost-view-btn').classList.toggle('active', v === 'cost');
            document.getElementById('age-view-btn').classList.toggle('text-gray-600', v !== 'age');
            document.getElementById('cost-view-btn').classList.toggle('text-gray-600', v !== 'cost');
        }

        function getFilteredData() {
            return rawData.filter(d => {
                const groupMatch = filters.group === 'all' || (operatorMap[filters.group] && operatorMap[filters.group].includes(d.负责人));
                const operatorMatch = filters.operator === 'all' || d.负责人 === filters.operator;
                return groupMatch && operatorMatch;
            });
        }

        function refreshUI() {
            const data = getFilteredData();
            updateChart(data);
            updateDetailsPanel(data);
            renderCostTable();
        }

        function initChart() {
            const ctx = document.getElementById('age-chart');
            ageChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(ageSegments),
                    datasets: [{ data: [0,0,0,0], backgroundColor: chartColors, borderWidth: 4, borderColor: '#fff', hoverOffset: 15 }]
                },
                options: {
                    cutout: '75%',
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    onClick: (e, elements) => {
                        if (elements.length) {
                            const i = elements[0].index;
                            const key = Object.keys(ageSegments)[i];
                            filters.segment = { label: key, fn: ageSegments[key] };
                            updateDetailsPanel(getFilteredData());
                        }
                    }
                }
            });
            document.getElementById('chart-legend').innerHTML = Object.keys(ageSegments).map((l, i) => \`
                <div class="flex items-center gap-2 py-1">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color:\${chartColors[i]}"></span>
                    <span class="truncate text-[11px] font-bold text-gray-500">\${esc(l)}</span>
                </div>\`).join('');
        }

        function updateChart(data) {
            const counts = Object.values(ageSegments).map(fn => data.reduce((s, d) => s + (fn(d) || 0), 0));
            ageChart.data.datasets[0].data = counts;
            ageChart.update();
        }

        function updateDetailsPanel(baseData) {
            const data = filters.segment ? baseData.filter(d => filters.segment.fn(d) > 0) : baseData;
            const getQty = filters.segment ? filters.segment.fn : (d => d['在库总数量']);
            
            document.getElementById('details-title').textContent = filters.segment ? \`\${filters.segment.label} 库龄明细\` : '库存明细汇总';
            
            let tQty=0, tVol=0, tVal=0;
            data.forEach(d => { 
                const q = getQty(d) || 0; 
                tQty += q; 
                tVol += q * (d['单位体积'] || 0); 
                tVal += q * (d['采购均价'] || 0); 
            });

            document.getElementById('total-sku').textContent = data.length.toLocaleString();
            document.getElementById('total-quantity').textContent = tQty.toLocaleString();
            document.getElementById('total-volume').textContent = tVol.toFixed(3);
            document.getElementById('total-value').textContent = '￥' + Math.round(tVal).toLocaleString();

            const container = document.getElementById('product-list-container');
            const sorted = [...data].sort((a,b) => (getQty(b)||0) - (getQty(a)||0));
            
            container.innerHTML = sorted.map(d => \`
                <div class="details-card p-5 flex justify-between items-center border border-gray-100 cursor-pointer shadow-sm" data-id="\${d.id}">
                    <div class="flex-1 min-w-0 text-left">
                        <p class="font-bold text-gray-800 text-[16px] truncate">\${esc(d['品名'])}</p>
                        <p class="text-xs meta-text mt-1.5 uppercase tracking-wide">\${esc(d.SKU)} | \${esc(d.ASIN)}\${reportType !== 'personal' ? ' | ' + esc(d.负责人) : ''}</p>
                    </div>
                    <div class="text-right ml-4">
                        <p class="text-xl font-bold text-indigo-600 tracking-tighter">\${(getQty(d)||0).toLocaleString()}</p>
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">在库数量</p>
                    </div>
                </div>\`).join('');

            container.querySelectorAll('.details-card').forEach(el => setupTooltip(el));
        }

        function renderCostTable() {
            const tbody = document.getElementById('cost-table-body');
            const data = getFilteredData();
            const sorted = [...data].sort((a, b) => {
                let vA = a[currentSort.key], vB = b[currentSort.key];
                const order = currentSort.order === 'asc' ? 1 : -1;
                if (typeof vA === 'string') return vA.localeCompare(vB) * order;
                return (vA - vB) * order;
            });

            tbody.innerHTML = sorted.map(d => \`
                <tr data-id="\${d.id}" class="cost-row \${(d['超龄附加费预估'] || 0) > 0 ? 'bg-rose-200/40' : ''}">
                    <td class="px-8 py-5 product-info-cell cursor-pointer text-left">
                        <div class="font-bold text-gray-800 text-[14px] leading-snug">\${esc(d['品名'])}</div>
                        <div class="text-[9px] meta-text mt-1 uppercase tracking-wider">\${esc(d.SKU)} | \${esc(d.ASIN)}</div>
                    </td>
                    \${reportType !== 'personal' ? \`<td class="px-4 py-5 text-center text-xs font-medium text-gray-500">\${esc(d.负责人)}</td>\` : ''}
                    <td class="px-4 py-5 text-center font-bold text-slate-700 text-[14px]">\${(d['在库总数量']||0).toLocaleString()}</td>
                    <td class="px-4 py-5 text-center font-bold text-slate-500 text-[13px]">\${(d['在库总体积']||0).toFixed(3)}</td>
                    <td class="px-4 py-5 text-center font-bold text-slate-600 text-[13px]">￥\${Math.round(d['在库货值']||0).toLocaleString()}</td>
                    <td class="px-4 py-5 text-center meta-text text-[13px]">￥\${Math.round(d['基础仓储费预估']||0).toLocaleString()}</td>
                    <td class="px-4 py-5 text-center font-bold \${(d['超龄附加费预估']||0) > 0 ? 'text-rose-600' : 'text-slate-400'} text-[13px]">￥\${Math.round(d['超龄附加费预估']||0).toLocaleString()}</td>
                    <td class="px-4 py-5 text-center font-black text-indigo-600 text-[14px]">￥\${Math.round(d['合计仓储费']||0).toLocaleString()}</td>
                    <td class="px-8 py-5">
                        <div class="flex justify-center items-center h-full">
                            <span class="inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest \${(d['风险权重']||0) > 0.6 ? 'bg-rose-100 text-rose-600 border border-rose-200' : (d['风险权重']||0) > 0.3 ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-slate-100 text-slate-500'}">
                                \${(d['风险权重']||0).toFixed(3)}
                            </span>
                        </div>
                    </td>
                </tr>\`).join('');

            tbody.querySelectorAll('.product-info-cell').forEach(el => setupTooltip(el));
        }

        function generateAgeDistHtml(d) {
            const ageMap = {
                '0-90': { v: d['0-90库龄'] || 0, c: '#10b981' },
                '91-180': { v: d['90-180库龄'] || 0, c: '#f59e0b' },
                '181-270': { v: d['181-270库龄'] || 0, c: '#f97316' },
                '271-300': { v: d['271-300库龄'] || 0, c: '#ef4444' },
                '301-330': { v: d['301-330库龄'] || 0, c: '#ef4444' },
                '331-365': { v: d['331-365库龄'] || 0, c: '#ef4444' },
                '365+': { v: d['大于365库龄'] || 0, c: '#ef4444' }
            };
            const activeSegments = Object.entries(ageMap).filter(([_, info]) => info.v > 0);
            if (activeSegments.length === 0) return '<div class="text-[10px] font-bold text-slate-400 py-1">无在库数据</div>';
            let html = '<div class="space-y-1">';
            activeSegments.forEach(([k, info]) => {
                const totalInStock = d['在库总数量'] || 1;
                const percent = (info.v / totalInStock * 100).toFixed(1);
                html += \`
                    <div class="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-3 h-5">
                        <span class="text-slate-400 text-[10px] font-bold text-left">\${esc(k)}</span>
                        <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30 text-left">
                            <div class="h-full rounded-full transition-all duration-500" style="width: \${percent}%; background-color: \${info.c}"></div>
                        </div>
                        <span class="text-white text-[11px] font-black text-right">\${info.v.toLocaleString()}</span>
                    </div>\`;
            });
            return html + '</div>';
        }

        function setupTooltip(el) {
            const tip = document.getElementById('common-tooltip');
            el.onmouseenter = (e) => {
                const target = e.currentTarget.closest('[data-id]');
                if(!target) return;
                const d = rawData.find(p => p.id == target.dataset.id);
                if (!d) return;
                tip.innerHTML = generateAgeDistHtml(d);
                tip.style.opacity = '1'; tip.style.visibility = 'visible';
            };
            el.onmousemove = (e) => {
                let x = e.clientX + 20, y = e.clientY - 15;
                if (x + tip.offsetWidth > window.innerWidth) x = e.clientX - tip.offsetWidth - 20;
                if (y + tip.offsetHeight > window.innerHeight) y = e.clientY - tip.offsetHeight - 20;
                tip.style.left = x + 'px'; tip.style.top = y + 'px';
            };
            el.onmouseleave = () => { tip.style.opacity = '0'; tip.style.visibility = 'hidden'; };
        }
    </script>
</body>
</html>`;
}
