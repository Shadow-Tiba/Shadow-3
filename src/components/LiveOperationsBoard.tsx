import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, LogOut, MapPin, Factory, Mountain, Truck, ClipboardList, CheckCircle2, Clock3, Users, Bot, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { VehicleTrackingScreen } from './VehicleTrackingScreen';
import { OfficeDirectoryScreen } from './OfficeDirectoryScreen';
import { DirectLoadAssignmentScreen } from './DirectLoadAssignmentScreen';
import { VehicleOwnerReportsScreen } from './VehicleOwnerReportsScreen';
import { AccountStatementsScreen } from './AccountStatementsScreen';
import { BranchEmployeeManagementScreen } from './BranchEmployeeManagementScreen';
import { SystemAiAssistant } from './SystemAiAssistant';
import { getLiveSnapshot, LiveSnapshot, liveName } from '../services/liveData';

const statusLabel: Record<string, string> = {
  DRAFT: 'مسودة',
  PUBLISHED: 'متاح للإسناد',
  IN_PROGRESS: 'جارٍ التنفيذ',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  ASSIGNED: 'تم الإسناد',
  ARRIVED: 'وصل السائق',
  LOADING: 'جاري التحميل',
  LOADED: 'تم التحميل',
  IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم',
};

type OfficeScreen = 'dashboard' | 'tracking' | 'directory' | 'factories' | 'quarries' | 'direct' | 'drivers' | 'vehicles' | 'waiting' | 'orders' | 'actual' | 'vehicleReports' | 'factoryStatement' | 'quarryStatement' | 'analytics' | 'employees' | 'assistant';
const screenPalette: Record<OfficeScreen, { selected: string; wash: string; icon: string; iconBg: string }> = {
  dashboard: { selected: 'bg-teal-700 hover:bg-teal-800', wash: 'bg-slate-50/70', icon: 'text-teal-700', iconBg: 'bg-teal-50' },
  drivers: { selected: 'bg-violet-700 hover:bg-violet-800', wash: 'bg-slate-50/70', icon: 'text-violet-700', iconBg: 'bg-violet-50' },
  vehicles: { selected: 'bg-blue-700 hover:bg-blue-800', wash: 'bg-slate-50/70', icon: 'text-blue-700', iconBg: 'bg-blue-50' },
  waiting: { selected: 'bg-amber-600 hover:bg-amber-700', wash: 'bg-slate-50/70', icon: 'text-amber-700', iconBg: 'bg-amber-50' },
  orders: { selected: 'bg-orange-600 hover:bg-orange-700', wash: 'bg-slate-50/70', icon: 'text-orange-700', iconBg: 'bg-orange-50' },
  actual: { selected: 'bg-emerald-700 hover:bg-emerald-800', wash: 'bg-slate-50/70', icon: 'text-emerald-700', iconBg: 'bg-emerald-50' },
  vehicleReports: { selected: 'bg-sky-700 hover:bg-sky-800', wash: 'bg-slate-50/70', icon: 'text-sky-700', iconBg: 'bg-sky-50' },
  factoryStatement: { selected: 'bg-cyan-700 hover:bg-cyan-800', wash: 'bg-slate-50/70', icon: 'text-cyan-700', iconBg: 'bg-cyan-50' },
  quarryStatement: { selected: 'bg-lime-700 hover:bg-lime-800', wash: 'bg-slate-50/70', icon: 'text-lime-800', iconBg: 'bg-lime-50' },
  analytics: { selected: 'bg-indigo-700 hover:bg-indigo-800', wash: 'bg-slate-50/70', icon: 'text-indigo-700', iconBg: 'bg-indigo-50' },
  tracking: { selected: 'bg-cyan-700 hover:bg-cyan-800', wash: 'bg-slate-50/70', icon: 'text-cyan-700', iconBg: 'bg-cyan-50' },
  directory: { selected: 'bg-slate-700 hover:bg-slate-800', wash: 'bg-slate-50/70', icon: 'text-slate-700', iconBg: 'bg-slate-100' },
  factories: { selected: 'bg-sky-600 hover:bg-sky-700', wash: 'bg-sky-50/50', icon: 'text-sky-700', iconBg: 'bg-sky-50' },
  quarries: { selected: 'bg-amber-600 hover:bg-amber-700', wash: 'bg-amber-50/50', icon: 'text-amber-700', iconBg: 'bg-amber-50' },
  direct: { selected: 'bg-fuchsia-700 hover:bg-fuchsia-800', wash: 'bg-slate-50/70', icon: 'text-fuchsia-700', iconBg: 'bg-fuchsia-50' },
  employees: { selected: 'bg-purple-700 hover:bg-purple-800', wash: 'bg-slate-50/70', icon: 'text-purple-700', iconBg: 'bg-purple-50' },
  assistant: { selected: 'bg-rose-700 hover:bg-rose-800', wash: 'bg-slate-50/70', icon: 'text-rose-700', iconBg: 'bg-rose-50' },
};

export const LiveOperationsBoard: React.FC = () => {
  const [data, setData] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [quarryId, setQuarryId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [priority, setPriority] = useState('3');
  const [savingOrder, setSavingOrder] = useState(false);
  const [draftOrderId, setDraftOrderId] = useState<string | null>(null);
  const [publishingOrder, setPublishingOrder] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [activeScreen, setActiveScreen] = useState<OfficeScreen>('dashboard');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getLiveSnapshot());
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات التشغيل');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const localNow = new Date();
  const todayKey = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
  const todaysActualCount = new Set(
    (data?.actual_loading_records ?? [])
      .filter((row: Record<string, any>) => {
        // Count only trips that have an actual-loading record, regardless of normal/direct assignment.
        // Dashboard RPC returns loaded_at; report RPCs may instead return date-only fields.
        const explicitDate = row.loading_sequence_date ?? row.load_date;
        if (explicitDate != null && String(explicitDate).trim() !== '') {
          return String(explicitDate).slice(0, 10) === todayKey;
        }

        if (row.loaded_at == null || String(row.loaded_at).trim() === '') return false;
        const loadedAt = new Date(row.loaded_at);
        if (Number.isNaN(loadedAt.getTime())) return false;
        const loadedAtLocalKey = `${loadedAt.getFullYear()}-${String(loadedAt.getMonth() + 1).padStart(2, '0')}-${String(loadedAt.getDate()).padStart(2, '0')}`;
        return loadedAtLocalKey === todayKey;
      })
      // A booking represents one trip; avoid counting duplicate records for the same trip twice.
      .map((row: Record<string, any>) => String(row.booking_id ?? row.actual_load_id ?? ''))
      .filter((tripId: string) => tripId !== '')
  ).size;

  async function createLoadOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!factoryId || !quarryId) {
      setError('اختار المصنع والمحجر الأول.');
      return;
    }

    const requestedQuantity = Number(quantity);
    const orderPriority = Number(priority);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      setError('الكمية المطلوبة لازم تكون عددًا صحيحًا أكبر من صفر.');
      return;
    }
    if (!Number.isInteger(orderPriority) || orderPriority < 1 || orderPriority > 5) {
      setError('الأولوية لازم تكون من 1 إلى 5.');
      return;
    }

    setSavingOrder(true);
    try {
      const { data: draft, error: createError } = await supabase.rpc('main_office_create_load_order', {
        p_factory_id: factoryId,
        p_quarry_id: quarryId,
        p_requested_quantity: requestedQuantity,
        p_priority: orderPriority,
        p_notes: null,
      });
      if (createError) throw createError;
      if (!draft?.load_order_id || draft?.status !== 'DRAFT') {
        throw new Error('لم يتم تأكيد إنشاء مسودة أمر التحميل.');
      }

      setDraftOrderId(draft.load_order_id);
      const { data: published, error: publishError } = await supabase.rpc('main_office_publish_load_order', { p_load_order_id: draft.load_order_id });
      if (publishError) {
        setSuccessMessage('تم حفظ الأمر، لكن النشر لم يكتمل. استخدم إعادة محاولة النشر لنفس الأمر لتجنب التكرار.');
        throw publishError;
      }
      if (published?.status !== 'PUBLISHED') {
        setSuccessMessage('تم حفظ الأمر، لكن لم نتأكد من نشره. أعد محاولة نشر نفس الأمر.');
        throw new Error('لم يتم تأكيد نشر أمر التحميل؛ الأمر محفوظ ولم يُعتبر متاحًا للسائقين.');
      }
      setDraftOrderId(null);
      setSuccessMessage(`تم إنشاء ونشر أمر التحميل. نافذة الاختيار تنتهي ${published.selection_ends_at ? new Date(published.selection_ends_at).toLocaleTimeString('ar-EG') : 'بعد 5 دقائق'}، وتم إنشاء إشعار لـ ${Number(published.eligible_drivers_notified ?? 0)} سائق مؤهل داخل النطاق ومسجل في الانتظار.`);
      setQuantity('1');
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذر إنشاء أمر التحميل.');
    } finally {
      setSavingOrder(false);
    }
  }


  async function publishDraftOrder() {
    if (!draftOrderId) return;
    setError('');
    setSuccessMessage('');
    setPublishingOrder(true);
    try {
      const { data: published, error: publishError } = await supabase.rpc('main_office_publish_load_order', {
        p_load_order_id: draftOrderId,
      });
      if (publishError) throw publishError;
      if (published?.status !== 'PUBLISHED') {
        throw new Error('لم يتم تأكيد نشر أمر التحميل؛ المسودة ما زالت بحاجة للمراجعة.');
      }
      setDraftOrderId(null);
      setSuccessMessage(`تم نشر أمر التحميل. نافذة الاختيار تنتهي ${published.selection_ends_at ? new Date(published.selection_ends_at).toLocaleTimeString('ar-EG') : 'بعد 5 دقائق'}، وتم إنشاء إشعار لـ ${Number(published.eligible_drivers_notified ?? 0)} سائق مؤهل داخل النطاق ومسجل في الانتظار.`);
      setQuantity('1');
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذر نشر أمر التحميل.');
    } finally {
      setPublishingOrder(false);
    }
  }


  const counts = useMemo(() => {
    const orders = data?.load_orders ?? [];
    const bookings = data?.bookings ?? [];
    const activeBookings = bookings.filter(b => ['ASSIGNED', 'ARRIVED', 'LOADING', 'LOADED', 'IN_TRANSIT'].includes(String(b.status).toUpperCase())).length;
    const requested = orders.reduce((n, o) => n + Number(o.requested_quantity || 0), 0);
    return { orders: orders.length, requested, activeBookings };
  }, [data]);

  if (loading && !data) {
    return <div dir="rtl" className="grid min-h-screen place-items-center bg-gradient-to-br from-teal-50 via-white to-orange-50 p-6 text-slate-800"><div className="rounded-3xl border border-teal-100 bg-white/90 px-8 py-9 text-center shadow-lg shadow-teal-900/5"><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-teal-100 text-teal-700"><ClipboardList size={30}/></div><p className="text-xs font-black tracking-widest text-teal-700">TIBA SUPPLIES</p><p className="mt-2 text-lg font-black">جاري تجهيز مركز التشغيل</p><p className="mt-1 text-sm text-slate-500">بنحمّل بيانات التشغيل الحقيقية...</p><div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-teal-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-teal-600"/></div></div></div>;
  }

  const operationalOffice = data?.operational_office ?? data?.office;
  const checkInOffice = data?.check_in_office;
  const checkInRadiusKm = Number(checkInOffice?.geofence_radius_m ?? 10000) / 1000;

  return (
    <div dir="rtl" className="min-h-screen bg-[#f3f6fa] text-slate-900 selection:bg-cyan-200">
      <header className="relative sm:sticky sm:top-0 z-30 overflow-hidden border-b border-slate-800 bg-gradient-to-l from-[#071426] via-[#0c2340] to-[#102f4b] text-white shadow-xl shadow-slate-950/15">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-6">
          <div className="min-w-0 w-full sm:w-auto">
            <div className="inline-flex items-center gap-3 text-[11px] font-black tracking-[0.12em] text-cyan-100 sm:text-xs"><span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-cyan-300 shadow-lg shadow-black/10"><Truck className="h-6 w-6" /></span><span><span className="block text-sm tracking-[0.16em] text-white">TIBA SUPPLIES</span><span className="mt-1 block text-[10px] tracking-[0.2em] text-cyan-300">SHADOW OPERATIONS · LIVE CORE</span></span></div>
            <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">مركز تشغيل طيبة للتوريدات</h1>
            <div className="mt-3 max-w-3xl text-xs leading-6 text-slate-300 break-words sm:text-sm">
              <MapPin className="inline h-3 w-3 ml-1" />
              مكتب التشغيل: {operationalOffice?.name ?? 'طيبة للتوريدات - الإسماعيلية'}
              {' · '}
              تسجيل الوصول: {checkInOffice?.name ?? 'طيبة للتوريدات - رأس سدر'}
              {' · '}
              نطاق تسجيل الوصول {checkInRadiusKm} كم
            </div>
          </div>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:self-auto">
            <button onClick={load} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 sm:flex-none">
              <RefreshCw className="inline h-4 w-4 ml-1" /> تحديث
            </button>
            <button onClick={() => supabase.auth.signOut()} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-400/10 px-4 py-2.5 text-sm font-bold text-rose-100 transition hover:bg-rose-400/20 sm:flex-none">
              <LogOut className="inline h-4 w-4 ml-1" /> خروج
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6">
        {error && <div className="rounded-2xl border border-red-500/30 bg-red-50 p-4 text-sm text-red-800">خطأ: {error}</div>}

        {successMessage && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-800">{successMessage}</div>}

        {activeScreen === 'dashboard' && (data?.office_notifications ?? []).length > 0 && <section aria-label="تنبيهات المكتب" className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2"><CheckCircle2 className="text-amber-700" size={21}/><h2 className="font-black text-slate-900">تنبيهات التشغيل والوزن الفعلي</h2></div>
          <div className="space-y-2">{(data?.office_notifications ?? []).slice(0, 10).map((notice: Record<string, any>) => <article key={notice.id} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
            <div className="font-bold">{notice.title}</div>
            <p className="mt-1 text-sm leading-6 text-slate-700">{notice.body}</p>
            <div className="mt-1 text-xs text-slate-500">{notice.created_at ? new Date(notice.created_at).toLocaleString('ar-EG') : ''}</div>
          </article>)}</div>
        </section>}

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <aside className="w-full shrink-0 rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_14px_38px_rgba(15,40,60,0.07)] xl:sticky xl:top-28 xl:w-[290px] xl:p-4" aria-label="القائمة الرئيسية للمكتب">
            <div className="mb-3 rounded-2xl border border-slate-100 bg-gradient-to-l from-[#e4f7fa] via-white to-[#edf3ff] px-4 py-4">
              <div className="text-[10px] font-black tracking-[0.14em] text-teal-800">TIBA SUPPLIES</div>
              <h2 className="mt-1 text-lg font-black text-slate-900">إدارة المكتب</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">كل شاشات التشغيل في مكان واحد</p>
            </div>
            <nav className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-1 xl:overflow-visible" aria-label="التنقل بين شاشات المكتب">
              {([
                ['dashboard', 'مركز التشغيل', ClipboardList],
                ['drivers', 'قائمة السائقين', Users],
                ['analytics', 'تحليل البيانات والتقارير', BarChart3],
                ['vehicleReports', 'حسابات العربيات والملاك', Users],
                ['factoryStatement', 'كشف حساب المصانع والعملاء', Factory],
                ['quarryStatement', 'كشف حساب المحاجر', Mountain],
                ['waiting', 'قائمة الانتظار', Clock3],
                ['orders', 'أوامر التحميل', ClipboardList],
                ['actual', 'التحميل الفعلي', CheckCircle2],
                ['tracking', 'تتبع السيارات', MapPin],
                ['directory', 'دليل البيانات الكامل', Users],
                ['direct', 'إسناد نقلة مباشرة', ClipboardList],
                ['employees', 'موظفو مكتب رأس سدر', Users],
                ['assistant', 'مساعد النظام AI', Bot],
              ] as const).map(([key, label, Icon]) => {
                const selected = activeScreen === key;
                return <button key={key} type="button" onClick={() => setActiveScreen(key as typeof activeScreen)} className={selected ? `flex min-h-[46px] shrink-0 items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-right text-xs font-black text-white shadow-md transition xl:w-full xl:text-sm ${screenPalette[key].selected}` : 'flex min-h-[46px] shrink-0 items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-right text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 xl:w-full xl:text-sm'}>
                  <span className={selected ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15" : `grid h-8 w-8 shrink-0 place-items-center rounded-lg ${screenPalette[key].iconBg} ${screenPalette[key].icon}`}><Icon className="h-4 w-4 shrink-0" /></span>
                  <span className="min-w-0 flex-1 leading-5">{label}</span>
                  {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </button>;
              })}
            </nav>
          </aside>
          <section className={`min-w-0 flex-1 space-y-4 rounded-[1.75rem] border border-white/80 p-2 shadow-sm transition-colors sm:space-y-5 sm:p-4 ${screenPalette[activeScreen].wash}`}>
        {activeScreen === 'analytics' ? <section className="space-y-5">
          <div className="rounded-3xl border border-indigo-100 bg-gradient-to-l from-indigo-950 via-blue-950 to-slate-900 p-5 text-white shadow-lg sm:p-6">
            <p className="text-xs font-black tracking-widest text-cyan-300">PERFORMANCE ANALYTICS</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">تحليل أداء التشغيل</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">ملخص مؤشرات الأداء من السجلات الحقيقية المتاحة: الطلبات، التخصيصات، التحميل الفعلي، والسائقون. كشوف الحسابات موجودة في أقسام منفصلة.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {label:'إجمالي أوامر التحميل',value:counts.orders,sub:'كل الأوامر المسجلة',color:'border-blue-200 bg-blue-50 text-blue-800',Icon:ClipboardList},
              {label:'تخصيصات نشطة',value:counts.activeBookings,sub:'حجوزات في دورة التشغيل',color:'border-violet-200 bg-violet-50 text-violet-800',Icon:CheckCircle2},
              {label:'تحميلات اليوم',value:todaysActualCount,sub:'من سجلات التحميل الفعلي',color:'border-emerald-200 bg-emerald-50 text-emerald-800',Icon:Truck},
              {label:'السائقون النشطون',value:data?.drivers.filter(row=>row.is_active!==false).length??0,sub:'حسب دليل السائقين',color:'border-cyan-200 bg-cyan-50 text-cyan-800',Icon:Users},
            ].map(({label,value,sub,color,Icon})=><article key={label} className={`rounded-2xl border p-4 shadow-sm ${color}`}><Icon className="h-5 w-5"/><p className="mt-3 text-3xl font-black tabular-nums">{value}</p><h3 className="mt-1 text-sm font-black">{label}</h3><p className="mt-1 text-xs opacity-75">{sub}</p></article>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black">حالة أوامر التحميل</h3><p className="mt-1 text-xs text-slate-500">توزيع الأوامر حسب الحالة الحالية</p><div className="mt-4 space-y-3">
              {(['PUBLISHED','IN_PROGRESS','COMPLETED','CANCELLED','DRAFT'] as const).map(status=>{const n=(data?.load_orders??[]).filter(o=>String(o.status).toUpperCase()===status).length;const label=statusLabel[status]??status;const pct=counts.orders?Math.round(n/counts.orders*100):0;return <div key={status}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="font-bold">{label}</span><span className="tabular-nums text-slate-500">{n} · {pct}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-blue-700 to-cyan-500" style={{width:`${pct}%`}}/></div></div>})}
            </div></section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black">مؤشرات الأسطول والتشغيل</h3><p className="mt-1 text-xs text-slate-500">أعداد فعلية من قاعدة بيانات المكتب</p><div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 p-4"><Truck className="h-5 w-5 text-blue-700"/><b className="mt-2 block text-2xl">{data?.vehicles.length??0}</b><span className="text-xs text-slate-500">عربية مسجلة</span></div>
              <div className="rounded-2xl bg-slate-50 p-4"><Factory className="h-5 w-5 text-sky-700"/><b className="mt-2 block text-2xl">{data?.factories.length??0}</b><span className="text-xs text-slate-500">مصنع / عميل</span></div>
              <div className="rounded-2xl bg-slate-50 p-4"><Mountain className="h-5 w-5 text-amber-700"/><b className="mt-2 block text-2xl">{data?.quarries.length??0}</b><span className="text-xs text-slate-500">محجر / مورد</span></div>
              <div className="rounded-2xl bg-slate-50 p-4"><ClipboardList className="h-5 w-5 text-emerald-700"/><b className="mt-2 block text-2xl">{data?.actual_loading_records.length??0}</b><span className="text-xs text-slate-500">سجل تحميل فعلي</span></div>
            </div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setActiveScreen('vehicleReports')} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white">تحليل أداء العربيات والملاك</button><button type="button" onClick={()=>setActiveScreen('actual')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold">مراجعة التحميل الفعلي</button></div></section>
          </div>
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">ملاحظة: المؤشرات هنا وصفية وتعتمد على السجلات المتاحة حاليًا. لا نحسب زمن الدورة أو الالتزام بالمواعيد قبل التأكد من اكتمال طوابع الوقت المطلوبة.</p>
        </section> : activeScreen === 'assistant' ? <SystemAiAssistant audience="HEAD_OFFICE" context={{ office: data?.operational_office?.name ?? data?.office?.name ?? 'مكتب الإسماعيلية', check_in_office: data?.check_in_office?.name ?? 'مكتب رأس سدر', totals: { factories: data?.factories.length ?? 0, quarries: data?.quarries.length ?? 0, load_orders: data?.load_orders.length ?? 0, bookings: data?.bookings.length ?? 0, actual_loading_records: data?.actual_loading_records.length ?? 0, active_drivers: data?.drivers.filter(row => row.is_active !== false).length ?? 0, active_vehicles: data?.vehicles.filter(row => row.is_active !== false).length ?? 0 }, load_orders: (data?.load_orders ?? []).slice(0, 80).map(order => ({ factory: liveName(data?.factories.find(row => row.factory_id === order.factory_id)), quarry: liveName(data?.quarries.find(row => row.quarry_id === order.quarry_id)), status: order.status, requested_quantity: order.requested_quantity, priority: order.priority })), bookings_by_status: Object.entries((data?.bookings ?? []).reduce((acc: Record<string, number>, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {})), actual_loads_today: todaysActualCount }} /> : activeScreen === 'employees' ? <BranchEmployeeManagementScreen /> : activeScreen === 'factoryStatement' ? <AccountStatementsScreen kind="factory" /> : activeScreen === 'quarryStatement' ? <AccountStatementsScreen kind="quarry" /> : activeScreen === 'vehicleReports' ? <VehicleOwnerReportsScreen /> : activeScreen === 'tracking' ? <VehicleTrackingScreen /> : activeScreen === 'drivers' ? <OfficeDirectoryScreen initialSection="drivers" showSectionTabs={false} /> : activeScreen === 'vehicles' ? <OfficeDirectoryScreen initialSection="vehicles" showSectionTabs={false} /> : activeScreen === 'waiting' ? <OfficeDirectoryScreen initialSection="waiting" showSectionTabs={false} /> : activeScreen === 'orders' ? <OfficeDirectoryScreen initialSection="loads" showSectionTabs={false} /> : activeScreen === 'actual' ? <OfficeDirectoryScreen initialSection="actual" showSectionTabs={false} /> : activeScreen === 'factories' ? <OfficeDirectoryScreen initialSection="factories" showSectionTabs={false} /> : activeScreen === 'quarries' ? <OfficeDirectoryScreen initialSection="quarries" showSectionTabs={false} /> : activeScreen === 'directory' ? <OfficeDirectoryScreen /> : activeScreen === 'direct' ? <DirectLoadAssignmentScreen /> : <>
        <section className="relative isolate overflow-hidden rounded-[28px] border border-[#163552] bg-gradient-to-br from-[#061426] via-[#0b2a49] to-[#11536a] p-5 text-white shadow-[0_20px_50px_rgba(8,35,60,0.22)] sm:rounded-[32px] sm:p-7"><div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"/><div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-1/3 h-56 w-56 rounded-full bg-blue-400/10 blur-3xl"/>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-100"><span className="h-2 w-2 rounded-full bg-emerald-400" /> بيانات التشغيل الحقيقية</div>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-4xl">لوحة تشغيل <span className="text-cyan-300">Tiba-Supplies</span></h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300">متابعة أوامر التحميل والسائقين والمصانع والمحاجر من مكان واحد، مع الانتقال إلى شاشة مستقلة لكل قسم.</p>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-200"><span className="rounded-lg bg-white/10 px-3 py-2">مكتب التشغيل: {operationalOffice?.name ?? 'طيبة للتوريدات'}</span><span className="rounded-lg bg-white/10 px-3 py-2">مكتب الوصول: {checkInOffice?.name ?? 'رأس سدر'}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:min-w-64">
              <div className="rounded-2xl border border-white/10 bg-white/[0.08] p-4 shadow-lg shadow-black/5 backdrop-blur-sm"><ClipboardList className="h-5 w-5 text-cyan-300"/><div className="mt-2 text-2xl font-black">{counts.orders}</div><div className="text-xs text-slate-300">أوامر التحميل</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><Truck className="h-5 w-5 text-emerald-300"/><div className="mt-2 text-2xl font-black">{counts.activeBookings}</div><div className="text-xs text-slate-300">تخصيصات نشطة</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><Factory className="h-5 w-5 text-sky-300"/><div className="mt-2 text-2xl font-black">{data?.factories.length ?? 0}</div><div className="text-xs text-slate-300">المصانع والعملاء</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><Mountain className="h-5 w-5 text-amber-300"/><div className="mt-2 text-2xl font-black">{data?.quarries.length ?? 0}</div><div className="text-xs text-slate-300">المحاجر والموردون</div></div>
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-800">OPERATIONS WORKFLOW</p><h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">مراحل النقلة من الطلب للتسليم</h2><p className="mt-1 text-xs leading-5 text-slate-500">اضغط على أي مرحلة للانتقال لشاشة التشغيل المرتبطة بها.</p></div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">مركز التشغيل · Shadow</span>
          </div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] xl:grid xl:grid-cols-4 2xl:grid-cols-7">
            {([
              { n:'01', title:'المكتب الرئيسي', desc:'إنشاء ومراجعة طلب التحميل', count:counts.orders, metric:'أمر تحميل', key:'orders' as OfficeScreen, Icon:ClipboardList, tone:'from-blue-700 to-blue-950', ring:'border-blue-200' },
              { n:'02', title:'قائمة الانتظار', desc:'السائقون المسجل وصولهم', count:(data?.bookings ?? []).filter(x => ['QUEUED','WAITING','ARRIVED'].includes(String(x.status).toUpperCase())).length, metric:'سائق منتظر', key:'waiting' as OfficeScreen, Icon:Clock3, tone:'from-emerald-600 to-emerald-900', ring:'border-emerald-200' },
              { n:'03', title:'تأكيد التحميل', desc:'مراجعة الإسناد وتفاصيل الطلب', count:counts.activeBookings, metric:'تخصيص نشط', key:'direct' as OfficeScreen, Icon:CheckCircle2, tone:'from-violet-600 to-violet-950', ring:'border-violet-200' },
              { n:'04', title:'السائق والعربية', desc:'بيانات السائقين والمركبات', count:data?.drivers.length ?? 0, metric:'سائق مسجل', key:'drivers' as OfficeScreen, Icon:Users, tone:'from-orange-500 to-orange-800', ring:'border-orange-200' },
              { n:'05', title:'تنفيذ التحميل', desc:'متابعة التحميل الفعلي المسجل', count:data?.actual_loading_records.length ?? 0, metric:'سجل تحميل فعلي', key:'actual' as OfficeScreen, Icon:Truck, tone:'from-sky-600 to-sky-950', ring:'border-sky-200' },
              { n:'06', title:'المسار والتوجيه', desc:'فتح شاشة تتبع السيارات', count:data?.vehicles.length ?? 0, metric:'مركبة مسجلة', key:'tracking' as OfficeScreen, Icon:MapPin, tone:'from-indigo-600 to-indigo-950', ring:'border-indigo-200' },
              { n:'07', title:'التسليم والحسابات', desc:'مراجعة السجلات وكشوف الحساب', count:todaysActualCount, metric:'تحميل اليوم', key:'factoryStatement' as OfficeScreen, Icon:Factory, tone:'from-teal-600 to-teal-950', ring:'border-teal-200' },
            ]).map(({n,title,desc,count,metric,key,Icon,tone,ring}) => (
              <button key={n} type="button" onClick={() => setActiveScreen(key)} className={`group relative flex min-h-[220px] w-[235px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border ${ring} bg-white text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 xl:w-auto`}>
                <div className={`bg-gradient-to-l ${tone} p-4 text-white`}>
                  <div className="flex items-center justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl border border-white/20 bg-white/15 text-sm font-black">{n}</span><Icon className="h-6 w-6 text-white/90"/></div>
                  <h3 className="mt-3 text-base font-black">{title}</h3><p className="mt-1 text-[11px] leading-5 text-white/80">{desc}</p>
                </div>
                <div className="flex flex-1 flex-col justify-between p-4">
                  <div><div className="text-2xl font-black tabular-nums text-slate-900">{count}</div><div className="mt-1 text-[11px] text-slate-500">{metric}</div></div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-black text-slate-700"><span>فتح المرحلة</span><span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 transition group-hover:bg-slate-900 group-hover:text-white">←</span></div>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,40,60,0.05)] sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-black">إنشاء أمر تحميل جديد</h2>
            <p className="mt-1 text-xs text-slate-500">يُنشأ الأمر على مكتب الإسماعيلية ويُوجَّه تسجيل وصول السواقين إلى مكتب رأس سدر.</p>
          </div>
          <form onSubmit={createLoadOrder} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-slate-500">
              المصنع
              <select value={factoryId} onChange={e => setFactoryId(e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900">
                <option value="">اختار المصنع</option>
                {(data?.factories ?? []).map(factory => <option key={factory.factory_id} value={factory.factory_id}>{liveName(factory)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              المحجر
              <select value={quarryId} onChange={e => setQuarryId(e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900">
                <option value="">اختار المحجر</option>
                {(data?.quarries ?? []).map(quarry => <option key={quarry.quarry_id} value={quarry.quarry_id}>{liveName(quarry)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              عدد النقلات المطلوبة
              <input type="number" min="1" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900" />
            </label>
            <label className="text-xs text-slate-500">
              الأولوية
              <select value={priority} onChange={e => setPriority(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-900">
                <option value="1">1 — عاجلة جدًا</option>
                <option value="2">2 — عاجلة</option>
                <option value="3">3 — عادية</option>
                <option value="4">4 — منخفضة</option>
                <option value="5">5 — الأقل</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={savingOrder || !data?.factories.length || !data?.quarries.length || Boolean(draftOrderId)} className="w-full rounded-xl bg-teal-700 p-3 text-sm font-black text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
                {savingOrder ? 'جاري إنشاء الأمر ونشره...' : 'إنشاء الطلب ونشره'}
              </button>
            </div>
          </form>
          {draftOrderId && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-black text-amber-900">المسودة محفوظة ولم تُنشر</p><p className="mt-1 text-sm leading-6 text-amber-800">راجع المصنع والمحجر والكمية والأولوية قبل إتاحتها للإسناد. لن تظهر للسائقين قبل النشر.</p></div>
            <button type="button" onClick={() => void publishDraftOrder()} disabled={publishingOrder} className="shrink-0 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50">{publishingOrder ? 'جاري النشر...' : 'نشر الأمر بعد المراجعة'}</button>
          </div>}
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['طلبات التحميل', counts.orders, ClipboardList],
            ['إجمالي النقلات المطلوبة', counts.requested, Truck],
            ['تخصيصات نشطة', counts.activeBookings, CheckCircle2],
            ['السائقون النشطون', data?.drivers.length ?? 0, Users],
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
              <Icon className="h-5 w-5 text-blue-700" />
              <div className="mt-3 text-2xl font-black">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </section>

        <section className="grid lg:grid-cols-2 gap-5">
          <div className="rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h2 className="font-black text-lg">طلبات التحميل الحقيقية</h2>
              <p className="text-xs text-slate-500 mt-1">مصدرها load_orders في Supabase</p>
            </div>
            <div className="p-4 space-y-3">
              {(data?.load_orders ?? []).map(order => {
                const factory = data?.factories.find(f => f.factory_id === order.factory_id);
                const quarry = data?.quarries.find(q => q.quarry_id === order.quarry_id);
                const committedStatuses = ['BOOKED', 'LOADING_STATEMENT', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
                const booked = (data?.bookings ?? []).filter(b => b.load_order_id === order.load_order_id && committedStatuses.includes(b.status)).length;
                return (
                  <article key={order.load_order_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="font-black">{liveName(factory)}</div>
                        <div className="text-xs text-slate-500 mt-1"><Mountain className="inline h-3 w-3 ml-1" />{liveName(quarry)}</div>
                      </div>
                      <span className="text-xs rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700">{statusLabel[order.status] ?? order.status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                      <div className="rounded-xl bg-white p-2"><b>{order.requested_quantity}</b><div className="text-[10px] text-slate-500">مطلوب</div></div>
                      <div className="rounded-xl bg-white p-2"><b>{booked}</b><div className="text-[10px] text-slate-500">محجوز</div></div>
                      <div className="rounded-xl bg-white p-2"><b>{Math.max(0, Number(order.requested_quantity) - booked)}</b><div className="text-[10px] text-slate-500">متبقي</div></div>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-500">{order.load_order_id}</div>
                  </article>
                );
              })}
              {!data?.load_orders.length && <div className="py-10 text-center text-sm text-slate-500">مفيش طلبات تحميل حقيقية مسجلة للمكتب حتى الآن.</div>}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
              <h2 className="font-black text-lg">البيانات الرئيسية</h2>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-2xl bg-slate-50 p-4"><Factory className="h-5 w-5 text-blue-700" /><b className="block mt-2 text-xl">{data?.factories.length ?? 0}</b><span className="text-xs text-slate-500">مصنع نشط</span></div>
                <div className="rounded-2xl bg-slate-50 p-4"><Mountain className="h-5 w-5 text-orange-600" /><b className="block mt-2 text-xl">{data?.quarries.length ?? 0}</b><span className="text-xs text-slate-500">محجر نشط</span></div>
                <div className="rounded-2xl bg-slate-50 p-4"><Clock3 className="h-5 w-5 text-violet-600" /><b className="block mt-2 text-xl">{data?.actual_loading_records.length ?? 0}</b><span className="text-xs text-slate-500">إجمالي سجلات التحميل</span></div>
                <div className="rounded-2xl bg-emerald-50 p-4"><Truck className="h-5 w-5 text-emerald-700" /><b className="block mt-2 text-xl">{todaysActualCount}</b><span className="text-xs text-slate-500">تحميلات اليوم</span></div>
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="text-sm font-black text-emerald-700">قاعدة التشغيل الأساسية</div>
              <div className="mt-2 text-sm text-slate-300">
                أوامر التحميل تصدر من مكتب الإسماعيلية، وتسجيل وصول السواقين يتم في مكتب رأس سدر. وجود السواق داخل نطاق {checkInRadiusKm} كم وحده لا يضيفه لقائمة الانتظار؛ لازم يسجل وصوله صراحةً.
              </div>
            </div>
          </div>
        </section>
        </>}
          </section>
        </div>
      </main>
    </div>
  );
};
