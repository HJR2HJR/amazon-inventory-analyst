
import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { 
  BarChart3, 
  FileText, 
  Package, 
  Users, 
  Download, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  Trash2,
  Table as TableIcon,
  LayoutDashboard,
  Boxes,
  Activity,
  ChevronDown
} from 'lucide-react';

import { OPERATORS, ALL_COLUMNS, DEFAULT_COLUMNS } from './constants';
import { ProductInfo, InventoryData, StorageData, ProcessedRow, AnalysisResult } from './types';
import { processAllData } from './services/analysisEngine';
import { generateOperatorHtmlReport, ReportType } from './services/reportGenerator';
import { generateOverAgeHtmlReport } from './services/overAgeReportGenerator';
import { processFileContent } from './services/reportConverter';

const formatMonths = (value: number) => `${Math.max(1, Math.ceil(value))}月`;

const parseEstimatedCost = (value: any): number => {
  if (value === Infinity || value === 'Infinity') return Infinity;
  if (typeof value === 'number') return Number.isFinite(value) ? value : Infinity;
  const text = String(value || '');
  if (text.includes('∞') || text.includes('> 10年')) return Infinity;
  const parsed = parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getClearMonths = (value: number | string): number => {
  if (value === Infinity || value === 'Infinity' || value === '∞') return Infinity;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : Infinity;
};

const getCostAdvice = (row: ProcessedRow, prefix: string) => {
  const estimatedCost = parseEstimatedCost(row.sellingCostCNY);
  const threshold = (row.超龄货值 || 0) * 3 / 5;
  if (!Number.isFinite(estimatedCost)) {
    return `${prefix}，清货成本无限，考虑特殊处理，需关注`;
  }
  if (estimatedCost < threshold) {
    return `${prefix}，清货超龄成本小于3/5货值，需关注`;
  }
  return `${prefix}，清货超龄成本大于等于3/5货值，考虑特殊处理，需关注`;
};

const getSheet2Advice = (row: ProcessedRow): string => {
  const monthlySales = (row['90天内的销量'] || 0) / 3;
  const inventoryToMonthlySales = monthlySales > 0 ? (row.在库总数量 || 0) / monthlySales : Infinity;
  const clearMonths = getClearMonths(row.monthsToClear);
  const overAgeStages = [
    { key: '271-300库龄' as const, value: row['271-300库龄'] || 0 },
    { key: '301-330库龄' as const, value: row['301-330库龄'] || 0 },
    { key: '331-365库龄' as const, value: row['331-365库龄'] || 0 },
    { key: '大于365库龄' as const, value: row['大于365库龄'] || 0 }
  ];
  const maxOverAgeStage = overAgeStages.reduce((max, current) => current.value > max.value ? current : max, overAgeStages[0]);

  if (maxOverAgeStage.value <= 0) {
    const age90To180 = row['90-180库龄'] || 0;
    const age181To270 = row['181-270库龄'] || 0;
    if (monthlySales <= 0 && (age90To180 > 0 || age181To270 > 0)) {
      return '高货值冗余，售出接近0，强超龄风险，需关注';
    }
    if (age181To270 > age90To180) {
      if (inventoryToMonthlySales <= 1) return '高货值冗余，售出快，无超龄风险，预计1月内卖完';
      if (inventoryToMonthlySales <= 2.5) return `高货值冗余，售出一般，弱超龄风险，预计${formatMonths(inventoryToMonthlySales)}卖完，需提醒`;
      return `高货值冗余，售出慢，强超龄风险，预计${formatMonths(inventoryToMonthlySales)}卖完，需关注`;
    }
    if (age90To180 > 0) {
      if (inventoryToMonthlySales <= 1.5) return '高货值冗余，售出快，无超龄风险，预计1月内卖完';
      if (inventoryToMonthlySales <= 4.5) return `高货值冗余，售出一般，弱超龄风险，预计${formatMonths(inventoryToMonthlySales)}卖完，需提醒`;
      return `高货值冗余，售出慢，强超龄风险，预计${formatMonths(inventoryToMonthlySales)}卖完，需关注`;
    }
    return '无超龄风险';
  }

  if (!Number.isFinite(clearMonths)) {
    const prefix = maxOverAgeStage.key === '大于365库龄'
      ? '365+产品，售出接近0'
      : '超龄产品，售出接近0，强365+风险';
    return getCostAdvice(row, prefix);
  }

  if (maxOverAgeStage.key === '271-300库龄') {
    if (clearMonths <= 1) return '超龄产品，售出快，无365+风险，预计1月内卖完';
    if (clearMonths <= 3) return '超龄产品，售出一般，弱365+风险，需提醒';
    return getCostAdvice(row, '超龄产品，售出一般，强365+风险');
  }

  if (maxOverAgeStage.key === '301-330库龄') {
    if (clearMonths <= 1) return '超龄产品，售出快，无365+风险，预计1月内卖完';
    if (clearMonths <= 2) return '超龄产品，售出一般，强365+风险，需提醒';
    return getCostAdvice(row, '超龄产品，售出一般，强365+风险');
  }

  if (maxOverAgeStage.key === '331-365库龄') {
    if (clearMonths <= 1) return '超龄产品，售出快，弱365+风险，预计1月内卖完';
    return getCostAdvice(row, '超龄产品，售出一般，强365+风险');
  }

  return getCostAdvice(row, '365+产品');
};

export default function App() {
  const [productInfoFile, setProductInfoFile] = useState<File | null>(null);
  const [inventoryFiles, setInventoryFiles] = useState<File[]>([]);
  const [storageFiles, setStorageFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'none' }>({ message: '', type: 'none' });
  
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [selectedGroupForHealth, setSelectedGroupForHealth] = useState<string>('');
  const [selectedGroupForOverAge, setSelectedGroupForOverAge] = useState<string>('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [includeOverAgeSheet, setIncludeOverAgeSheet] = useState<boolean>(false);

  const resetAnalysis = () => {
    setAnalysisResult(null);
    setStatus({ message: '', type: 'none' });
  };

  const parseProductInfo = async (file: File): Promise<ProductInfo[]> => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as ProductInfo[];
  };

  const parseInventoryFile = async (file: File): Promise<InventoryData> => {
    const { csvContent, matchedName } = await processFileContent(file);
    return new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[][];
          const headers = (rows[0] || []).map(cell => String(cell || '').trim());
          resolve({ storeName: matchedName, headers, data: rows.slice(1), type: 'inventory' });
        },
        error: (error) => reject(error)
      });
    });
  };

  const parseStorageFile = async (file: File): Promise<{ storeName: string, data: StorageData[] }> => {
    const { csvContent, matchedName } = await processFileContent(file);
    return new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const storeName = matchedName.replace(/(_Storage)?$/i, '');
          const mappedData = (results.data.slice(1) as any[][]).map(row => ({
            asin: row[0],
            weight: parseFloat(row[9]) || 0
          })).filter(item => item.asin);
          resolve({ storeName, data: mappedData });
        },
        error: (error) => reject(error)
      });
    });
  };

  const runAnalysis = async () => {
    if (!productInfoFile || inventoryFiles.length === 0) {
      setStatus({ message: '请确保已上传产品信息表和至少一个库存报告。', type: 'error' });
      return null;
    }
    
    if (analysisResult) return analysisResult;

    setLoading(true);
    setStatus({ message: '正在处理数据，请稍候...', type: 'info' });

    try {
      const pInfo = await parseProductInfo(productInfoFile);
      const invs = await Promise.all(inventoryFiles.map(parseInventoryFile));
      const stors = await Promise.all(storageFiles.map(parseStorageFile));
      
      const result = processAllData(pInfo, invs, stors);
      
      if (result.processedData.length === 0) {
        throw new Error('分析完成，但未匹配到任何有效数据。请检查文件关联性。');
      }

      setAnalysisResult(result);
      setStatus({ message: `成功分析 ${result.processedData.length} 条SKU数据。`, type: 'success' });
      return result;
    } catch (err: any) {
      console.error(err);
      setStatus({ message: `处理失败: ${err.message}`, type: 'error' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFullExcel = async () => {
    const result = await runAnalysis();
    if (result) {
      const wb = XLSX.utils.book_new();

      const sheet1Data = result.processedData.map(row => {
        const entry: any = {};
        ALL_COLUMNS.forEach(col => entry[col] = (row as any)[col]);
        return entry;
      });
      const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
      XLSX.utils.book_append_sheet(wb, ws1, "库存分析总表");

      if (includeOverAgeSheet) {
        const sheet2Data = result.processedData.map(row => {
          const entry: any = {};
          ALL_COLUMNS.forEach(col => entry[col] = (row as any)[col]);
          const formatInf = (val: any) => (val === Infinity || val === 'Infinity' || (typeof val === 'number' && isNaN(val))) ? '∞' : val;
          entry['当前移除费用 (CNY)'] = formatInf(row.removalCostCNY);
          entry['当前弃置费用 (CNY)'] = formatInf(row.disposalCostCNY);
          entry['预估总超龄仓储费 (CNY)'] = formatInf(row.sellingCostCNY);
          entry['清完月数'] = formatInf(row.monthsToClear);
          entry['月均超龄仓储 (CNY)'] = formatInf(row.avgMonthlyCost);
          entry['建议'] = getSheet2Advice(row);
          return entry;
        });
        const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
        XLSX.utils.book_append_sheet(wb, ws2, "超龄补充数据");
      }
      XLSX.writeFile(wb, `Amazon库存全表_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const handleDownloadSimpleExcel = async () => {
    const result = await runAnalysis();
    if (result) {
      const filtered = result.processedData.map(row => {
        let n: any = {};
        selectedColumns.forEach(c => n[c] = (row as any)[c]);
        return n;
      });
      const ws = XLSX.utils.json_to_sheet(filtered);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "库存简表");
      XLSX.writeFile(wb, `库存简表_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const getDisplayData = (data: ProcessedRow[]) => data.map(d => {
    if (!d['负责人'] || String(d['负责人']).trim() === '') {
      return { ...d, '负责人': '未匹配' };
    }
    return d;
  });

  const handleDownloadPersonalReports = async () => {
    if (selectedOperators.length === 0) {
      setStatus({ message: '请先选择运营人员。', type: 'error' });
      return;
    }
    const result = await runAnalysis();
    if (result) {
      setLoading(true);
      const zip = new JSZip();
      let count = 0;
      
      const displayData = getDisplayData(result.processedData);

      selectedOperators.forEach(op => {
        const opData = displayData.filter(d => d['负责人'] === op);
        if (opData.length > 0) {
          zip.file(`${op}_库存健康报告.html`, generateOperatorHtmlReport(op, opData, 'personal'));
          count++;
        }
      });
      if (count > 0) {
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "个人运营分析包.zip");
        setStatus({ message: `已成功生成 ${count} 份个人报告。`, type: 'success' });
      } else {
        setStatus({ message: '所选运营无匹配数据。', type: 'error' });
      }
      setLoading(false);
    }
  };

  const handleDownloadAllVisualReports = async () => {
    const result = await runAnalysis();
    if (result) {
      setLoading(true);
      try {
        const zip = new JSZip();
        const displayData = getDisplayData(result.processedData);
        let count = 0;

        zip.file('公司总报告/全公司_库存健康可视化报告.html', generateOperatorHtmlReport('全公司', displayData, 'company'));
        count++;

        Object.entries(OPERATORS).forEach(([group, members]) => {
          const groupData = displayData.filter(d => (members as string[]).includes(d['负责人']));
          if (groupData.length > 0) {
            zip.file(`小组报告/${group}_库存健康可视化报告.html`, generateOperatorHtmlReport(group, groupData, 'group'));
            count++;
          }
        });

        Array.from(new Set(displayData.map(d => d['负责人']))).sort().forEach(op => {
          const opData = displayData.filter(d => d['负责人'] === op);
          if (opData.length > 0) {
            zip.file(`个人报告/${op}_库存健康报告.html`, generateOperatorHtmlReport(op, opData, 'personal'));
            count++;
          }
        });

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "全部库存健康可视化报告.zip");
        setStatus({ message: `已成功生成 ${count} 份可视化报告。`, type: 'success' });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownloadVisualReport = async (type: ReportType) => {
    if (type === 'group' && !selectedGroupForHealth) {
        setStatus({ message: '请选择要导出的小组。', type: 'error' });
        return;
    }
    const result = await runAnalysis();
    if (result) {
        const displayData = getDisplayData(result.processedData);

        let dataToUse = displayData;
        let title = "全公司";
        if (type === 'group') {
            const groupOps = (OPERATORS as any)[selectedGroupForHealth];
            dataToUse = displayData.filter(d => groupOps.includes(d['负责人']));
            title = selectedGroupForHealth;
        }
        const html = generateOperatorHtmlReport(title, dataToUse, type);
        saveAs(new Blob([html], { type: "text/html" }), `${title}_库存健康可视化报告.html`);
    }
  };

  const handleDownloadAllOverAgeReports = async () => {
    const result = await runAnalysis();
    if (result) {
      setLoading(true);
      try {
        const zip = new JSZip();
        const displayData = getDisplayData(result.processedData);
        let count = 0;

        zip.file('公司超龄总表/超龄库存分析报告_全公司.html', generateOverAgeHtmlReport('全公司', displayData));
        count++;

        Object.entries(OPERATORS).forEach(([group, members]) => {
          const groupData = displayData.filter(d => (members as string[]).includes(d['负责人']));
          if (groupData.length > 0) {
            zip.file(`小组超龄总表/超龄库存分析报告_${group}.html`, generateOverAgeHtmlReport(group, groupData));
            count++;
          }
        });

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "全部超龄库存分析报告.zip");
        setStatus({ message: `已成功生成 ${count} 份超龄库存报告。`, type: 'success' });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownloadOverAgeReport = async (scope: 'group' | 'all') => {
    if (scope === 'group' && !selectedGroupForOverAge) {
        setStatus({ message: '请选择一个小组。', type: 'error' });
        return;
    }
    const result = await runAnalysis();
    if (result) {
        const displayData = getDisplayData(result.processedData);

        let dataToUse = displayData;
        let title = "全公司";
        if (scope === 'group') {
            const groupOps = (OPERATORS as any)[selectedGroupForOverAge];
            dataToUse = displayData.filter(d => groupOps.includes(d['负责人']));
            title = selectedGroupForOverAge;
        }
        const html = generateOverAgeHtmlReport(title, dataToUse);
        saveAs(new Blob([html], { type: "text/html" }), `超龄库存分析报告_${title}.html`);
    }
  };

  const toggleOperator = (name: string) => {
    setSelectedOperators(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const toggleGroupSelection = (group: string) => {
    const members = (OPERATORS as any)[group];
    const allSelected = members.every((m: string) => selectedOperators.includes(m));
    if (allSelected) {
      setSelectedOperators(prev => prev.filter(n => !members.includes(n)));
    } else {
      setSelectedOperators(prev => Array.from(new Set([...prev, ...members])));
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <nav className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-8 h-8" />
            <span className="text-xl font-bold tracking-tight">Amazon Analyst <span className="text-indigo-200">Pro</span></span>
          </div>
          <div className="text-xs font-medium bg-indigo-600 px-3 py-1 rounded-full border border-indigo-400">
            Engine V2.6 (Multi-Level Reports)
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        {/* Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">1</div>
              产品信息表 (xlsx)
            </div>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <FileText className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs text-slate-500 font-medium text-center px-4">
                  {productInfoFile ? productInfoFile.name : 'ASIN、负责人、品名、采购均价'}
                </p>
              </div>
              <input type="file" className="hidden" accept=".xlsx" onChange={(e) => {
                if(e.target.files?.[0]) { setProductInfoFile(e.target.files[0]); resetAnalysis(); }
              }} />
            </label>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">2</div>
              库存报告 (批量上传)
            </div>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Boxes className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs text-slate-500 font-medium text-center px-4">
                  {inventoryFiles.length > 0 ? `已选择 ${inventoryFiles.length} 个文件` : '支持 TXT 官方原始文件'}
                </p>
              </div>
              <input type="file" className="hidden" multiple accept=".csv,.txt" onChange={(e) => {
                if(e.target.files) { setInventoryFiles(Array.from(e.target.files)); resetAnalysis(); }
              }} />
            </label>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs">3</div>
              重量报告 (可选)
            </div>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Package className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs text-slate-500 font-medium text-center px-4">
                  {storageFiles.length > 0 ? `已选择 ${storageFiles.length} 个文件` : '用于计算超龄移除/弃置成本'}
                </p>
              </div>
              <input type="file" className="hidden" multiple accept=".csv,.txt" onChange={(e) => {
                if(e.target.files) { setStorageFiles(Array.from(e.target.files)); resetAnalysis(); }
              }} />
            </label>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <button 
            disabled={loading || !productInfoFile || inventoryFiles.length === 0}
            onClick={runAnalysis}
            className="px-12 py-4 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 disabled:bg-slate-300 transition-all flex items-center gap-2"
          >
            {loading ? '核心计算引擎处理中...' : (analysisResult ? '刷新分析结果' : '运行库存健康分析')}
          </button>
          
          {status.type !== 'none' && (
            <div className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold border ${
              status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
              status.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 
              'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
               status.type === 'error' ? <AlertCircle className="w-4 h-4" /> : 
               <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
              {status.message}
            </div>
          )}
        </div>

        {analysisResult && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Visual Health Reports Column */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                库存健康可视化报告
              </h3>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                
                {/* Personal Section */}
                <div className="space-y-3 pb-6 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">个人报告 (批量)</span>
                        <button onClick={() => { const all = Object.values(OPERATORS).flat(); setSelectedOperators(selectedOperators.length === all.length ? [] : all); }} className="text-[10px] font-bold text-indigo-600 hover:underline">
                        {selectedOperators.length === Object.values(OPERATORS).flat().length ? '取消全选' : '全选所有人员'}
                        </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                        {Object.entries(OPERATORS).map(([group, members]) => (
                        <div key={group} className="space-y-1">
                            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg cursor-pointer" onClick={() => toggleGroupSelection(group)}>
                                <Users className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[11px] font-bold text-slate-600">{group}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 px-1">
                            {members.map(name => (
                                <label key={name} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={selectedOperators.includes(name)} onChange={() => toggleOperator(name)} className="w-3 h-3 rounded border-slate-300 text-indigo-600" />
                                <span className="text-[11px] text-slate-600">{name}</span>
                                </label>
                            ))}
                            </div>
                        </div>
                        ))}
                    </div>
                    <button onClick={handleDownloadPersonalReports} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all">
                        <Download className="w-4 h-4" /> 导出个人报告压缩包
                    </button>
                </div>

                {/* Group Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">小组汇总报告</span>
                        <select 
                            value={selectedGroupForHealth}
                            onChange={(e) => setSelectedGroupForHealth(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">-- 选择小组 --</option>
                            {Object.keys(OPERATORS).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button onClick={() => handleDownloadVisualReport('group')} className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all">
                            导出小组可视化报告
                        </button>
                    </div>

	                    <div className="space-y-2">
	                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">全公司总报告</span>
	                        <button onClick={handleDownloadAllVisualReports} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
	                            <Download className="w-4 h-4" /> 导出所有可视化报告
	                        </button>
	                        <button onClick={() => handleDownloadVisualReport('company')} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-all">
	                            导出公司总可视化报告
	                        </button>
	                    </div>
                </div>
              </div>

              {/* Over-age Reports Section */}
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 pt-4">
                <Activity className="w-5 h-5 text-emerald-500" />
                超龄库存专题报告
              </h3>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <select 
                            value={selectedGroupForOverAge}
                            onChange={(e) => setSelectedGroupForOverAge(e.target.value)}
                            className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
                        >
                            <option value="">-- 选择小组 --</option>
                            {Object.keys(OPERATORS).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button onClick={() => handleDownloadOverAgeReport('group')} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                            <Download className="w-4 h-4" /> 小组超龄报告
                        </button>
                    </div>
	                    <div className="space-y-2">
	                        <button onClick={handleDownloadAllOverAgeReports} className="w-full py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-all flex items-center justify-center gap-2">
	                            <Download className="w-4 h-4" /> 导出所有超龄总表
	                        </button>
	                        <button onClick={() => handleDownloadOverAgeReport('all')} className="w-full py-3 bg-slate-700 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
	                            <Download className="w-4 h-4" /> 公司超龄总表
	                        </button>
                    </div>
                </div>
              </div>
            </div>

            {/* Excel Data Exports Column */}
            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <TableIcon className="w-5 h-5 text-indigo-500" />
                数据源表格导出
              </h3>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div>
                  <h4 className="font-bold text-slate-800">Excel 分析总表 (.xlsx)</h4>
                  <p className="text-xs text-slate-500 mt-1">包含货值分数、AIS 库龄明细及加权风险评估。</p>
                </div>
                <div className="flex items-center gap-2 p-2 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <input type="checkbox" id="overage-chk" checked={includeOverAgeSheet} onChange={(e) => setIncludeOverAgeSheet(e.target.checked)} className="rounded text-indigo-600" />
                  <label htmlFor="overage-chk" className="text-xs font-medium text-slate-600 cursor-pointer">在 Sheet 2 包含移除/弃置/清货成本明细</label>
                </div>
                <button onClick={handleDownloadFullExcel} className="w-full py-3 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                  <Download className="w-4 h-4" /> 下载库存分析总表
                </button>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <h4 className="font-bold text-slate-800">自定义字段简表</h4>
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl max-h-48 overflow-y-auto scrollbar-thin">
                    {ALL_COLUMNS.map(col => (
                        <label key={col} className="flex items-center gap-2 cursor-pointer p-1">
                            <input type="checkbox" checked={selectedColumns.includes(col)} onChange={() => setSelectedColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])} className="w-3.5 h-3.5 rounded text-indigo-600" />
                            <span className="text-[10px] font-medium text-slate-700 truncate">{col}</span>
                        </label>
                    ))}
                </div>
                <button onClick={handleDownloadSimpleExcel} className="w-full py-3 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all">
                    导出选定字段简表
                </button>
              </div>

              <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                <h4 className="font-bold text-indigo-800 text-sm mb-2">报告层级说明</h4>
                <ul className="text-[11px] text-indigo-600 space-y-2 list-disc list-inside font-medium">
                    <li><b>个人报告：</b>精简视图，仅展示该运营名下的产品，无负责人列。</li>
                    <li><b>小组报告：</b>包含该组内所有运营，支持按人员筛选切换。</li>
                    <li><b>公司报告：</b>包含全量数据，支持【小组 -&gt; 人员】两级穿透筛选。</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 border-t border-slate-200 py-10 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-400 font-medium">Amazon Inventory Analyst Pro</p>
          <p className="text-[10px] text-slate-300 mt-2 uppercase tracking-[0.2em]">Engine Version 2.6 • Multi-Level Visual Logic System</p>
        </div>
      </footer>
    </div>
  );
}
