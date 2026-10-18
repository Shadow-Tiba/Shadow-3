import React, { useState } from 'react';
import { FilePlus2, LoaderCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ImportRow = { source_row_number: number; load_date: string; vehicle_code: string; driver_code: string; factory_code: string; quarry_code: string; actual_weight: string; ticket_number?: string; notes?: string; source_record_id?: string };

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('ملف CSV يحتوي على علامة اقتباس غير مكتملة.');
  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
};

export const PaperLoadingEntryScreen: React.FC = () => {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [importing, setImporting] = useState(false);

  async function prepareCsv(file: File | null) {
    setImportFile(file);
    setImportRows([]);
    setImportError('');
    setImportMessage('');
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('ملف CSV لازم يحتوي على صف عناوين وصف بيانات واحد على الأقل.');
      const headers = parsed[0].map(value => value.trim().toLowerCase());
      const required = ['load_date', 'vehicle_code', 'driver_code', 'factory_code', 'quarry_code', 'actual_weight'];
      const missing = required.filter(header => !headers.includes(header));
      if (missing.length) throw new Error(`أعمدة مطلوبة ناقصة: ${missing.join(', ')}`);
      const rows = parsed.slice(1).map((values, index) => {
        const get = (key: string) => {
          const at = headers.indexOf(key);
          return at < 0 ? '' : String(values[at] ?? '').trim();
        };
        return { source_row_number: index + 2, load_date: get('load_date'), vehicle_code: get('vehicle_code'), driver_code: get('driver_code'), factory_code: get('factory_code'), quarry_code: get('quarry_code'), actual_weight: get('actual_weight'), ticket_number: get('ticket_number'), notes: get('notes'), source_record_id: get('source_record_id') };
      });
      if (rows.length > 2000) throw new Error('الحد الأقصى للاستيراد في المرة الواحدة 2000 صف.');
      const seenSourceIds = new Set<string>();
      const duplicateSourceIds = new Set<string>();
      for (const row of rows) {
        const sourceId = row.source_record_id?.trim();
        if (!sourceId) continue;
        if (seenSourceIds.has(sourceId)) duplicateSourceIds.add(sourceId);
        seenSourceIds.add(sourceId);
      }
      if (duplicateSourceIds.size) throw new Error(`معرّفات مصدر مكررة داخل الملف: ${Array.from(duplicateSourceIds).slice(0, 5).join(', ')}. صحّح التكرارات قبل الاستيراد.`);
      setImportRows(rows);
      setImportMessage(`تمت قراءة ${rows.length} صفًا. راجع المعاينة؛ سيجري التحقق من الأكواد والتكرارات والتعارضات في قاعدة البيانات قبل حفظ أي سجل.`);
    } catch (e: any) {
      setImportError(e?.message || 'تعذر قراءة ملف CSV.');
    }
  }

  async function importCsv() {
    if (!importFile || importRows.length === 0) return;
    setImporting(true);
    setImportError('');
    setImportMessage('');
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_import_paper_loads', { p_source_file_name: importFile.name, p_rows: importRows });
      if (rpcError) throw rpcError;
      if (data?.ok !== true) {
        const first = Array.isArray(data?.errors) ? data.errors[0] : null;
        if (String(first?.error ?? '').includes('SOURCE_IDENTITY_CONFLICT')) throw new Error(`تعارض في الصف ${first.source_row_number ?? first.row}: اسم الملف ورقم الصف مستخدمان سابقًا ببيانات مختلفة. لم يتم حفظ أي صف. راجع السجل قبل إعادة المحاولة.`);
        throw new Error(first ? `رفض الاستيراد دون حفظ أي صف. الصف ${first.source_row_number ?? first.row}: ${first.error}` : 'فشل التحقق من بيانات الملف؛ لم يتم حفظ أي صف.');
      }
      setImportMessage(`اكتمل الاستيراد: ${data.inserted} سجل جديد، ${data.duplicates} صف مكرر تم تخطيه، من إجمالي ${data.received} صف.`);
      setImportFile(null);
      setImportRows([]);
    } catch (e: any) {
      setImportError(e?.message || 'تعذر استيراد ملف التحميلات الورقية.');
    } finally {
      setImporting(false);
    }
  }

  return <section dir="rtl" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-100 text-sky-800"><FilePlus2 size={22}/></span>
      <div><h2 className="text-lg font-black text-slate-900">استيراد التحميل الفعلي من CSV</h2><p className="mt-1 text-sm leading-6 text-slate-600">استيراد بيانات الدفاتر الفعلية دفعة واحدة. لا يوجد تسجيل يدوي من هذه الشاشة.</p></div>
    </div>
    <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <h3 className="font-black text-slate-900">ملف التحميلات الورقية (CSV)</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">تُراجع البيانات والأكواد والتكرارات والتعارضات كاملةً قبل الحفظ. إذا وُجد خطأ في أي صف، يرفض الخادم الملف دون حفظ جزئي.</p>
      <p className="mt-2 text-xs leading-6 text-slate-600">الأعمدة المطلوبة: <code>load_date, vehicle_code, driver_code, factory_code, quarry_code, actual_weight</code>. اختيارية: <code>ticket_number, notes, source_record_id</code>.</p>
      <input type="file" accept=".csv,text/csv" disabled={importing} onChange={event => void prepareCsv(event.target.files?.[0] ?? null)} className="mt-3 block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm"/>
      {importError && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{importError}</div>}
      {importMessage && <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{importMessage}</div>}
      {importRows.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3"><span className="text-sm font-bold text-slate-700">معاينة: {importRows.length} صف · أول صف: {importRows[0].load_date} · {importRows[0].vehicle_code} · {importRows[0].actual_weight} طن</span><button type="button" onClick={() => void importCsv()} disabled={importing} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{importing ? <LoaderCircle size={16} className="animate-spin"/> : <FilePlus2 size={16}/>} بدء الاستيراد</button></div>}
    </div>
  </section>;
};
