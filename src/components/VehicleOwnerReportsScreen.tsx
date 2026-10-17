import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Truck, Users, Search, CalendarDays, Weight, Printer, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AddVehicleForm } from './AddVehicleForm';

type Vehicle = { vehicle_id: string; plate_number: string; vehicle_code?: string | null; owner_id?: string | null; owner_name?: string | null; owner_phone?: string | null; is_active: boolean };
type Owner = { owner_id: string; name: string; phone?: string | null; vehicle_count: number; is_active: boolean };
type Trip = { actual_load_id: string; trip_code?: string | null; daily_load_number?: number | null; loading_sequence_date?: string | null; booking_id?: string | null; load_date?: string | null; created_at: string; vehicle_id?: string | null; plate_number?: string | null; owner_id?: string | null; owner_name?: string | null; driver_name?: string | null; quarry_name?: string | null; factory_name?: string | null; ticket_number?: string | null; actual_weight?: number | string | null; delivery_confirmed_at?: string | null; is_completed: boolean };
type FactoryOption = { id: string; name: string; is_active?: boolean };
type QuarryOption = { id: string; name: string; is_active?: boolean };
type Snapshot = { vehicles: Vehicle[]; owners: Owner[]; trips: Trip[] };
const dateValue = (d: Date) => { const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); };
const dateOf = (t: Trip) => String(t.loading_sequence_date ?? t.load_date ?? t.created_at ?? '').slice(0, 10);
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('ar-EG') : '—';
const weight = (value: Trip['actual_weight']) => { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; };
const tons = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

export const VehicleOwnerReportsScreen: React.FC = () => {
  const today = new Date(); const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
  const [from, setFrom] = useState(dateValue(weekAgo)); const [to, setTo] = useState(dateValue(today));
  const [snapshot, setSnapshot] = useState<Snapshot>({ vehicles: [], owners: [], trips: [] });
  const [factoryOptions, setFactoryOptions] = useState<FactoryOption[]>([]);
  const [quarryOptions, setQuarryOptions] = useState<QuarryOption[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [query, setQuery] = useState(''); const [tripCode, setTripCode] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState(''); const [ownerFilter, setOwnerFilter] = useState('');
  const [factoryFilter, setFactoryFilter] = useState(''); const [quarryFilter, setQuarryFilter] = useState('');
  const [mode, setMode] = useState<'vehicles' | 'owners'>('vehicles');
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [addingOwner, setAddingOwner] = useState(false);

  async function refresh() {
    setLoading(true); setError('');
    try {
      const [reportsResult, directoryResult] = await Promise.all([
        supabase.rpc('get_vehicle_owner_reports', { p_from: from || null, p_to: to || null }),
        supabase.rpc('main_office_get_directory'),
      ]);
      if (reportsResult.error) throw reportsResult.error;
      if (directoryResult.error) throw directoryResult.error;
      const data = reportsResult.data;
      const directory = directoryResult.data ?? {};
      setSnapshot({ vehicles: Array.isArray(data?.vehicles) ? data.vehicles : [], owners: Array.isArray(data?.owners) ? data.owners : [], trips: Array.isArray(data?.trips) ? data.trips : [] });
      setFactoryOptions(Array.isArray(directory?.factories) ? directory.factories.filter((item: FactoryOption) => item.is_active !== false) : []);
      setQuarryOptions(Array.isArray(directory?.quarries) ? directory.quarries.filter((item: QuarryOption) => item.is_active !== false) : []);
    } catch (e: any) { setError(e?.message || 'تعذر تحميل تقارير أوزان العربيات والملاك.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function addOwner() {
    const name = window.prompt('اسم مالك العربية:');
    if (!name?.trim()) return;
    const phone = window.prompt('رقم هاتف المالك (اختياري):') || '';
    setAddingOwner(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_create_vehicle_owner', {
        p_name: name.trim(), p_phone: phone.trim() || null, p_notes: null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success || !data?.owner_id) throw new Error('تعذر تأكيد إضافة المالك.');
      await refresh();
    } catch (e: any) { setError(e?.message || 'تعذرت إضافة مالك العربية.'); }
    finally { setAddingOwner(false); }
  }

  const completedTrips = useMemo(() => snapshot.trips.filter(t => t.is_completed && t.actual_weight != null), [snapshot.trips]);
  const filteredTrips = useMemo(() => completedTrips.filter(t =>
    (!tripCode || (t.trip_code ?? '').toLowerCase().includes(tripCode.toLowerCase())) &&
    (!vehicleFilter || t.vehicle_id === vehicleFilter) &&
    (!ownerFilter || t.owner_id === ownerFilter) &&
    (!factoryFilter || t.factory_name === factoryFilter) &&
    (!quarryFilter || t.quarry_name === quarryFilter)
  ), [completedTrips, tripCode, vehicleFilter, ownerFilter, factoryFilter, quarryFilter]);
  const visibleVehicles = snapshot.vehicles.filter(v => (!ownerFilter || v.owner_id === ownerFilter || filteredTrips.some(t => t.owner_id === ownerFilter && t.vehicle_id === v.vehicle_id)) && `${v.plate_number} ${v.owner_name ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const visibleOwners = snapshot.owners.filter(o => `${o.name} ${o.phone ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const vehicleTrips = filteredTrips.filter(t => t.vehicle_id === selectedVehicle);
  const ownerTrips = filteredTrips.filter(t => t.owner_id === selectedOwner);
  const selectedVehicleInfo = snapshot.vehicles.find(v => v.vehicle_id === selectedVehicle);
  const selectedOwnerInfo = snapshot.owners.find(o => o.owner_id === selectedOwner);
  const factories = [...new Set([...factoryOptions.map(item => item.name), ...completedTrips.map(t => t.factory_name).filter((v): v is string => !!v)])].sort((a, b) => a.localeCompare(b, 'ar'));
  const quarries = [...new Set([...quarryOptions.map(item => item.name), ...completedTrips.map(t => t.quarry_name).filter((v): v is string => !!v)])].sort((a, b) => a.localeCompare(b, 'ar'));

  function TripTable({ trips }: { trips: Trip[] }) {
    if (!trips.length) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">مفيش نقلات مكتملة بوزن فعلي مطابقة للفلاتر.</p>;
    return <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[920px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">التاريخ</th><th className="p-3">كود النقلة</th><th className="p-3">تحميل اليوم</th><th className="p-3">العربية</th><th className="p-3">السواق</th><th className="p-3">المحجر</th><th className="p-3">المصنع النهائي</th><th className="p-3">رقم التذكرة</th><th className="p-3">المالك العربية</th><th className="p-3">الوزن الفعلي (طن)</th></tr></thead><tbody>{trips.map(t => <tr key={t.actual_load_id} className="border-t border-slate-100"><td className="p-3">{displayDate(t.loading_sequence_date ?? t.load_date ?? t.created_at)}</td><td className="p-3 font-black">{t.trip_code ?? '—'}</td><td className="p-3">{t.daily_load_number ?? '—'}</td><td className="p-3 font-bold">{t.plate_number ?? '—'}</td><td className="p-3">{t.driver_name ?? '—'}</td><td className="p-3">{t.quarry_name ?? '—'}</td><td className="p-3">{t.factory_name ?? '—'}</td><td className="p-3">{t.ticket_number ?? '—'}</td><td className="p-3">{t.owner_name ?? 'غير مسجل'}</td><td className="p-3 font-black tabular-nums">{tons(weight(t.actual_weight))}</td></tr>)}</tbody></table></div>;
  }
  const totalFilteredWeight = filteredTrips.reduce((sum, t) => sum + weight(t.actual_weight), 0);
  const selectClass = "mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm";

  return <section className="space-y-4">
    <header className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black">كشوف أوزان العربيات والملاك</h2><p className="mt-1 text-sm text-slate-500">تقارير تشغيلية بالأطنان فقط؛ تشمل النقلات التي تم تأكيد التسليم وتسجيل وزنها الفعلي. المالك التاريخي يظهر من سجل النقلة، والبيانات القديمة غير المثبتة تظهر كغير معروفة.</p></div><div className="flex flex-wrap gap-2 print:hidden"><button type="button" onClick={() => setShowAddVehicle(value => !value)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800"><Plus size={16}/> إضافة عربية</button><button type="button" disabled={addingOwner} onClick={() => void addOwner()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-800 disabled:opacity-50"><Plus size={16}/>{addingOwner ? 'جاري الإضافة...' : 'إضافة مالك'}</button><button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>{loading ? 'جاري التحديث' : 'تحديث'}</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"><Printer size={16}/> طباعة / PDF</button></div></div>
      {showAddVehicle && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-black">إضافة عربية وربطها بمالك مسجل</h3><button type="button" onClick={() => setShowAddVehicle(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">إغلاق</button></div><AddVehicleForm owners={snapshot.owners} onSaved={() => { setShowAddVehicle(false); void refresh(); }}/></div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3 print:hidden"><label className="text-xs font-bold text-slate-600">من تاريخ<input type="date" max={to || undefined} value={from} onChange={e => setFrom(e.target.value)} className={selectClass}/></label><label className="text-xs font-bold text-slate-600">إلى تاريخ<input type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} className={selectClass}/></label><div className="flex items-end"><button onClick={() => void refresh()} className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white"><CalendarDays className="ml-2 inline" size={16}/>عرض الفترة</button></div></div>
      {error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-3"><Truck size={18} className="text-blue-700"/><div className="mt-2 text-xl font-black">{snapshot.vehicles.length}</div><div className="text-xs text-slate-500">إجمالي العربيات</div></div><div className="rounded-2xl bg-slate-50 p-3"><Users size={18} className="text-violet-700"/><div className="mt-2 text-xl font-black">{snapshot.owners.length}</div><div className="text-xs text-slate-500">إجمالي الملاك</div></div><div className="rounded-2xl bg-slate-50 p-3"><Weight size={18} className="text-emerald-700"/><div className="mt-2 text-xl font-black">{filteredTrips.length}</div><div className="text-xs text-slate-500">نقلات مكتملة مطابقة</div></div><div className="rounded-2xl bg-slate-50 p-3"><Weight size={18} className="text-emerald-700"/><div className="mt-2 text-xl font-black">{tons(totalFilteredWeight)}</div><div className="text-xs text-slate-500">إجمالي الأوزان (طن)</div></div></div>
    </header>
    <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="mb-3 font-black">فلاتر التقرير</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <label className="text-xs font-bold text-slate-600">كود النقلة<input value={tripCode} onChange={e => setTripCode(e.target.value)} placeholder="اكتب كود النقلة" className={selectClass}/></label>
        <label className="text-xs font-bold text-slate-600">العربية<select value={vehicleFilter} onChange={e => { const nextVehicleId = e.target.value; setVehicleFilter(nextVehicleId); const linkedVehicle = snapshot.vehicles.find(v => v.vehicle_id === nextVehicleId); setOwnerFilter(linkedVehicle?.owner_id ?? ""); }} className={selectClass}><option value="">كل العربيات</option>{snapshot.vehicles.map(v => <option key={v.vehicle_id} value={v.vehicle_id}>{v.plate_number}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">المالك<select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className={selectClass}><option value="">كل الملاك</option>{snapshot.owners.map(o => <option key={o.owner_id} value={o.owner_id}>{o.name}</option>)}</select>{vehicleFilter && <span className="mt-1 block font-normal text-slate-500">تم اختيار مالك العربية تلقائيًا، ويمكن تغييره يدويًا.</span>}</label>
        <label className="text-xs font-bold text-slate-600">المصنع<select value={factoryFilter} onChange={e => setFactoryFilter(e.target.value)} className={selectClass}><option value="">كل المصانع</option>{factories.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">المحجر<select value={quarryFilter} onChange={e => setQuarryFilter(e.target.value)} className={selectClass}><option value="">كل المحاجر</option>{quarries.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <div className="flex items-end"><button onClick={() => {setTripCode('');setVehicleFilter('');setOwnerFilter('');setFactoryFilter('');setQuarryFilter('');setQuery('');}} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold">مسح الفلاتر</button></div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2"><button onClick={() => {setMode('vehicles');setSelectedOwner(null)}} className={mode==='vehicles'?'rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white':'rounded-xl border px-4 py-2 text-sm font-bold'}>كشف العربية</button><button onClick={() => {setMode('owners');setSelectedVehicle(null)}} className={mode==='owners'?'rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white':'rounded-xl border px-4 py-2 text-sm font-bold'}>كشف المالك</button></div>{!(mode === 'vehicles' ? selectedVehicle : selectedOwner) && <label className="relative block sm:w-72"><Search size={16} className="absolute right-3 top-3 text-slate-400"/><input value={query} onChange={e => mode === 'vehicles' ? (setSelectedVehicle(null), setQuery(e.target.value)) : (setSelectedOwner(null), setQuery(e.target.value))} placeholder={mode==='vehicles'?'بحث برقم العربية أو المالك':'بحث باسم المالك أو الهاتف'} className="w-full rounded-xl border border-slate-300 py-2.5 pr-9 pl-3 text-sm"/></label>}</div>
      {mode === 'vehicles' ? selectedVehicle && selectedVehicleInfo ? <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-black">كشف حركة العربية {selectedVehicleInfo.plate_number}</h3><p className="text-sm text-slate-500">المالك: {selectedVehicleInfo.owner_name ?? 'غير مسجل'} · الفترة المحددة</p></div><button onClick={() => setSelectedVehicle(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold">اختيار عربية أخرى</button></div><TripTable trips={vehicleTrips}/></section> : <div className="mt-4 grid gap-3 md:grid-cols-2">{visibleVehicles.map(v => {const trips=filteredTrips.filter(t=>t.vehicle_id===v.vehicle_id);const total=trips.reduce((s,t)=>s+weight(t.actual_weight),0);return <button key={v.vehicle_id} onClick={()=>setSelectedVehicle(v.vehicle_id)} className="rounded-2xl border border-slate-200 p-4 text-right hover:bg-slate-50"><div className="flex items-center justify-between"><span className="font-black">{v.plate_number}</span><span className="text-xs text-slate-500">{v.owner_name ? 'مالك مرتبط' : 'المالك غير مرتبط'}</span></div><div className="mt-1 text-sm text-slate-500">المالك: {v.owner_name??'غير مسجل'}</div><div className="mt-3 flex justify-between text-sm"><span>{trips.length} نقلة مكتملة</span><strong>{tons(total)} طن</strong></div></button>})}</div> : selectedOwner && selectedOwnerInfo ? <section className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-black">كشف حركة المالك {selectedOwnerInfo.name}</h3><p className="text-sm text-slate-500">{selectedOwnerInfo.phone ?? 'بدون هاتف'} · نقلات كل العربيات المسجلة على هذا المالك.</p></div><button onClick={() => setSelectedOwner(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold">اختيار مالك آخر</button></div><TripTable trips={ownerTrips}/></section> : <div className="mt-4 grid gap-3 md:grid-cols-2">{visibleOwners.map(o => {const trips=filteredTrips.filter(t=>t.owner_id===o.owner_id);const total=trips.reduce((s,t)=>s+weight(t.actual_weight),0);return <button key={o.owner_id} onClick={()=>setSelectedOwner(o.owner_id)} className="rounded-2xl border border-slate-200 p-4 text-right hover:bg-slate-50"><div className="font-black">{o.name}</div><div className="mt-1 text-sm text-slate-500">{o.phone??'بدون هاتف'} · {o.vehicle_count} عربية</div><div className="mt-3 flex justify-between text-sm"><span>{trips.length} نقلة مكتملة</span><strong>{tons(total)} طن</strong></div></button>})}</div>}
    </div>
  </section>;
};
