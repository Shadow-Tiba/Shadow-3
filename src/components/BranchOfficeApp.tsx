import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ClipboardList, Clock3, Truck, Users, RefreshCw, LogOut, Phone, MapPin, Factory, Mountain, CheckCircle2, Eye, Bot } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SystemAiAssistant } from './SystemAiAssistant';

type Tab = 'overview' | 'loads' | 'allocations' | 'actual' | 'waiting' | 'directory' | 'assistant';
type Item = Record<string, any>;
const tabs: {key:Tab; label:string; icon:React.ElementType}[] = [
  {key:'overview',label:'ملخص الفرع',icon:Eye},
  {key:'loads',label:'التحميلات المتاحة',icon:ClipboardList},
  {key:'allocations',label:'تخصيص العربيات',icon:Truck},
  {key:'actual',label:'التحميل الفعلي',icon:ClipboardCheck},
  {key:'waiting',label:'قائمة الانتظار',icon:Clock3},
  {key:'directory',label:'دليل التواصل',icon:Users},
  {key:'assistant',label:'مساعد النظام AI',icon:Bot},
];
const dateTime=(v:any)=>v?new Date(v).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }):'—';
const phoneLink=(v:any)=>v? <a href={'tel:'+v} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800"><Phone size={15}/>{v}</a> : <span className="text-slate-400">لا يوجد رقم</span>;

export const BranchOfficeApp: React.FC = () => {
  const [snapshot,setSnapshot]=useState<Item|null>(null);
  const [tab,setTab]=useState<Tab>('overview');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [updatedAt,setUpdatedAt]=useState<Date|null>(null);

  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const {data,error:rpcError}=await supabase.rpc('branch_get_snapshot');
      if(rpcError) throw rpcError;
      setSnapshot(data||{});
      setUpdatedAt(new Date());
    }catch(e:any){
      const raw=String(e?.message||'');
      const labels:Record<string,string>={
        AUTH_REQUIRED:'سجّل الدخول بحساب موظف الفرع.',
        BRANCH_ACCOUNT_REQUIRED:'الحساب ده مش مربوط بموظف في مكتب رأس سدر. راجع المكتب الرئيسي.',
        BRANCH_OFFICE_INACTIVE:'مكتب رأس سدر غير نشط حاليًا.',
        ACTIVE_HEAD_OFFICE_NOT_CONFIGURED:'إعدادات مكتب التشغيل الرئيسي ناقصة.',
        INSUFFICIENT_ROLE:'الحساب لا يملك صلاحية دخول تطبيق رأس سدر.',
      };
      const key=Object.keys(labels).find(k=>raw.includes(k));
      setError(key?labels[key]:'تعذر تحميل بيانات الفرع. تأكد من تطبيق تحديث قاعدة البيانات أولًا.');
    }finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const counts=useMemo(()=>({
    loads:(snapshot?.available_loads||[]).filter((x:Item)=>Number(x.committed_quantity||0)<Number(x.requested_quantity||0)).length,
    allocations:(snapshot?.allocations||[]).length,
    actual:(snapshot?.actual_loading_records||[]).length,
    waiting:(snapshot?.waiting_list||[]).length,
  }),[snapshot]);
  const rows:Item[]=tab==='loads'?(snapshot?.available_loads||[]).filter((x:Item)=>Number(x.committed_quantity||0)<Number(x.requested_quantity||0))
    :tab==='allocations'?(snapshot?.allocations||[])
    :tab==='actual'?(snapshot?.actual_loading_records||[])
    :tab==='waiting'?(snapshot?.waiting_list||[])
    :tab==='directory'?(snapshot?.directory||[]):[];

  return <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-100 text-teal-800"><Truck size={26}/></div><div><div className="text-xs font-black tracking-wider text-teal-700">TIBA SUPPLIES · BRANCH</div><h1 className="text-xl font-black sm:text-2xl">مكتب طيبة للتوريدات — رأس سدر</h1><div className="mt-1 text-xs text-slate-500"><MapPin className="ml-1 inline h-3 w-3"/>{snapshot?.office?.name||'عرض بيانات الفرع فقط'}{updatedAt?' · آخر تحديث '+updatedAt.toLocaleTimeString('ar-EG'):''}</div></div></div>
        <div className="flex gap-2"><button onClick={()=>void load()} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"><RefreshCw className="ml-1 inline h-4 w-4"/>تحديث</button><button onClick={()=>void supabase.auth.signOut()} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"><LogOut className="ml-1 inline h-4 w-4"/>خروج</button></div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
      {error&&<div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map(({key,label,icon:Icon})=><button key={key} onClick={()=>setTab(key)} className={tab===key?'flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2.5 text-sm font-black text-white':'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100'}><Icon size={17}/>{label}</button>)}
      </div>
      {loading&&!snapshot?<div className="rounded-3xl border bg-white p-10 text-center text-slate-500">جاري تحميل بيانات رأس سدر...</div>:null}
      {tab==='overview'&&snapshot&&<><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{label:'أوامر متاحة',value:counts.loads,icon:ClipboardList},{label:'تخصيصات العربيات',value:counts.allocations,icon:Truck},{label:'سجلات التحميل الفعلي',value:counts.actual,icon:CheckCircle2},{label:'قائمة الانتظار',value:counts.waiting,icon:Clock3}].map(card=><div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><card.icon className="mb-3 text-teal-700" size={23}/><div className="text-sm text-slate-500">{card.label}</div><div className="mt-1 text-3xl font-black">{card.value}</div></div>)}
      </div><div className="grid gap-4 md:grid-cols-2">
        <button onClick={()=>setTab('loads')} className="rounded-2xl border border-orange-200 bg-white p-5 text-right hover:bg-orange-50"><Factory className="mb-3 text-orange-700" size={24}/><h2 className="font-black">أوامر التحميل المتاحة</h2><p className="mt-1 text-sm text-slate-500">أوامر المكتب الرئيسي الموجّهة إلى فرع رأس سدر.</p></button>
        <button onClick={()=>setTab('actual')} className="rounded-2xl border border-emerald-200 bg-white p-5 text-right hover:bg-emerald-50"><ClipboardCheck className="mb-3 text-emerald-700" size={24}/><h2 className="font-black">كشف التحميل الفعلي</h2><p className="mt-1 text-sm text-slate-500">عرض السجلات الحالية والسابقة للتحميل الفعلي.</p></button>
      </div></>}
      {tab==='overview'&&snapshot&&Array.isArray(snapshot.office_notifications)&&snapshot.office_notifications.length>0&&<section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-black text-slate-900">تنبيهات أوامر التحميل الجديدة</h2><div className="space-y-3">{snapshot.office_notifications.slice(0,10).map((notice:Item)=><article key={notice.id} className="rounded-xl border border-amber-100 bg-amber-50/60 p-3"><div className="font-bold">{notice.title}</div><div className="mt-1 text-sm text-slate-700">{notice.body}</div><div className="mt-1 text-xs text-slate-500">{dateTime(notice.created_at)}{notice.payload?.order_number? ' · رقم الأمر '+notice.payload.order_number:''}</div></article>)}</div></section>}
      {tab==='assistant'&&snapshot&&<SystemAiAssistant audience="BRANCH" context={{
        office: snapshot?.office?.name ?? 'مكتب رأس سدر',
        totals: { available_loads: counts.loads, allocations: counts.allocations, actual_loading_records: counts.actual, waiting_entries: counts.waiting },
        available_loads: (snapshot?.available_loads ?? []).slice(0, 60).map((row:Item)=>({ factory:row.factory_name, quarry:row.quarry_name, status:row.status, requested_quantity:row.requested_quantity, committed_quantity:row.committed_quantity })),
        allocations: (snapshot?.allocations ?? []).slice(0, 60).map((row:Item)=>({ plate_number:row.plate_number, driver_name:row.driver_name, factory:row.factory_name, quarry:row.quarry_name, status:row.status, trip_code:row.trip_code })),
        actual_loading_records: (snapshot?.actual_loading_records ?? []).slice(0, 60).map((row:Item)=>({ plate_number:row.plate_number, driver_name:row.driver_name, factory:row.factory_name, quarry:row.quarry_name, actual_weight:row.actual_weight, status:row.status, loading_sequence_date:row.loading_sequence_date })),
        waiting_list: (snapshot?.waiting_list ?? []).slice(0, 60).map((row:Item)=>({ plate_number:row.plate_number, driver_name:row.driver_name, status:row.status, arrived_at:row.arrived_at }))
      }} />}
      {tab!=='overview'&&tab!=='assistant'&&<section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">{tabs.find(x=>x.key===tab)?.label}</h2><p className="text-xs text-slate-500">عرض فقط · {rows.length} سجل</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">بدون صلاحيات تعديل</span></div>
        {rows.length===0?<div className="rounded-xl bg-slate-50 p-8 text-center text-slate-500">{loading?'جاري التحديث...':'لا توجد سجلات للعرض حاليًا.'}</div>:<div className="space-y-3">
          {rows.map((row:Item,index:number)=><article key={row.booking_id||row.load_order_id||row.actual_load_id||row.entry_id||row.driver_id||index} className={tab==='waiting'?'rounded-lg border border-slate-200 px-2 py-1.5':'rounded-2xl border border-slate-200 p-4'}>
            {tab==='waiting'&&<div className="flex min-w-0 items-center gap-2 text-xs leading-5"><span className="w-5 shrink-0 text-center font-bold tabular-nums text-teal-700">{index+1}</span><span className="min-w-0 flex-1 font-semibold">{row.plate_number||'عربية غير محددة'} · {row.driver_name||'سائق غير محدد'} · {row.arrived_at?new Date(row.arrived_at).toLocaleDateString('ar-EG'):'—'}</span>{row.driver_phone&&<a href={'tel:'+String(row.driver_phone).replace(/[^+\d]/g,'')} onClick={event=>event.stopPropagation()} aria-label={'اتصال بالسائق '+(row.driver_name||'')} title={String(row.driver_phone)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"><Phone size={13}/></a>}<span className="shrink-0 text-[10px] text-slate-500">{row.status}</span></div>}
            {tab==='loads'&&<><div className="flex flex-wrap items-start justify-between gap-2"><div className="font-black">{row.factory_name||'مصنع غير محدد'} <span className="text-slate-400">←</span> {row.quarry_name||'محجر غير محدد'}</div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-800">{row.status}</span></div><div className="mt-2 text-sm text-slate-600">المطلوب: {row.requested_quantity} نقلة · المخصص: {row.committed_quantity||0} · المتبقي: {Math.max(0,Number(row.requested_quantity||0)-Number(row.committed_quantity||0))}</div><div className="mt-1 text-xs text-slate-400">تاريخ الأمر: {dateTime(row.created_at)}</div></>}
            {tab==='allocations'&&<><div className="flex flex-wrap justify-between gap-2"><div className="font-black">{row.plate_number||'عربية غير محددة'} · {row.driver_name||'سائق غير محدد'}</div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">{row.status}</span></div><div className="mt-2 text-sm text-slate-600">{row.factory_name} ← {row.quarry_name}</div><div className="mt-1 text-xs font-bold text-teal-700">كود النقلة: {row.trip_code||'—'} · رقم الإسناد اليومي: {row.assignment_daily_number??'—'}</div><div className="mt-3 flex flex-wrap gap-2">{phoneLink(row.driver_phone)}{row.owner_phone&&phoneLink(row.owner_phone)}</div><div className="mt-2 text-xs text-slate-500">مالك العربية: {row.owner_name||'غير محدد'} · {dateTime(row.booked_at)}</div></>}
            {tab==='actual'&&<><div className="flex flex-wrap justify-between gap-2"><div className="font-black">{row.plate_number||'عربية غير محددة'} · {row.driver_name||'سائق غير محدد'}</div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">{row.delivery_confirmed_at&&row.actual_weight!=null?String(row.actual_weight)+' طن':'لم يُؤكد الوزن'}</span></div><div className="mt-2 text-sm text-slate-600">{row.factory_name||'مصنع غير محدد'} ← {row.quarry_name||'محجر غير محدد'} · تذكرة {row.ticket_number||'—'}</div><div className="mt-1 text-xs font-bold text-teal-700">كود النقلة: {row.trip_code||'—'} · تحميل اليوم: {row.daily_load_number??'—'}</div><div className="mt-1 text-xs text-slate-500">تاريخ التحميل: {row.loading_sequence_date||row.load_date||'—'} · التسليم: {row.delivery_confirmed_at?dateTime(row.delivery_confirmed_at):'غير مؤكد'}</div></>}
            {tab==='waiting'&&<div className="mt-1 flex flex-wrap items-center gap-x-3 text-[10px] leading-4 text-slate-500"><span>وقت الوصول: {dateTime(row.arrived_at)}</span>{row.owner_name&&<span>المالك: {row.owner_name}</span>}</div>}
            {tab==='directory'&&<><div className="text-sm font-black">{row.driver_name||'سائق بدون اسم'}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{phoneLink(row.driver_phone)}{row.owner_phone&&phoneLink(row.owner_phone)}</div><div className="mt-1 text-xs text-slate-600">العربية: {row.plate_number||'غير مرتبطة'} · المالك: {row.owner_name||'غير محدد'}</div></>}
          </article>)}
        </div>}
      </section>}
      <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900"><ShieldCheckIcon/> التطبيق مخصص لموظفي فرع رأس سدر للعرض والمتابعة فقط. الإضافة والتعديل والإلغاء والتوجيه والحسابات تظل من صلاحيات المكتب الرئيسي.</div>
    </main>
  </div>;
};

function ShieldCheckIcon(){return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/>;}
