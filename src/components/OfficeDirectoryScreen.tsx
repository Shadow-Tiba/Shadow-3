import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Mountain, Users, UserX, Truck, ClipboardCheck, UserRound, ClipboardList, Clock3, RefreshCw, AlertTriangle, Pencil, UserMinus, Phone, MoreHorizontal } from 'lucide-react';
import { getLiveSnapshot, LiveSnapshot, liveName } from '../services/liveData';
import { supabase } from '../lib/supabase';
import { AddVehicleForm } from './AddVehicleForm';

type ScreenKey = 'factories' | 'quarries' | 'drivers' | 'vehicles' | 'owners' | 'waiting' | 'loads' | 'actual';
type Row = Record<string, any>;
const tabs: { key: ScreenKey; label: string; icon: React.ElementType }[] = [
  { key: 'factories', label: 'المصانع والعملاء', icon: Building2 },
  { key: 'quarries', label: 'المحاجر والموردون', icon: Mountain },
  { key: 'drivers', label: 'السائقون', icon: Users },
  { key: 'vehicles', label: 'أسطول السيارات', icon: Truck },
  { key: 'owners', label: 'ملاك العربيات', icon: UserRound },
  { key: 'waiting', label: 'قائمة انتظار رأس سدر', icon: Clock3 },
  { key: 'loads', label: 'أوامر التحميل', icon: ClipboardList },
  { key: 'actual', label: 'التحميل الفعلي', icon: ClipboardCheck },
];

const sectionPalette: Record<ScreenKey, { selected: string; accent: string; border: string; action: string; row: string; wash: string }> = {
  factories: { selected: 'border-sky-600 bg-sky-600', accent: 'text-sky-700', border: 'border-sky-200', action: 'bg-sky-600 hover:bg-sky-700', row: 'border-r-sky-400', wash: 'bg-sky-50/50' },
  quarries: { selected: 'border-amber-600 bg-amber-600', accent: 'text-amber-700', border: 'border-amber-200', action: 'bg-amber-600 hover:bg-amber-700', row: 'border-r-amber-400', wash: 'bg-amber-50/50' },
  drivers: { selected: 'border-red-600 bg-red-600', accent: 'text-red-700', border: 'border-red-200', action: 'bg-red-600 hover:bg-red-700', row: 'border-r-red-400', wash: 'bg-red-50/50' },
  vehicles: { selected: 'border-blue-600 bg-blue-600', accent: 'text-blue-700', border: 'border-blue-200', action: 'bg-blue-600 hover:bg-blue-700', row: 'border-r-blue-400', wash: 'bg-blue-50/50' },
  owners: { selected: 'border-teal-600 bg-teal-600', accent: 'text-teal-700', border: 'border-teal-200', action: 'bg-teal-600 hover:bg-teal-700', row: 'border-r-teal-400', wash: 'bg-teal-50/50' },
  waiting: { selected: 'border-violet-600 bg-violet-600', accent: 'text-violet-700', border: 'border-violet-200', action: 'bg-violet-600 hover:bg-violet-700', row: 'border-r-violet-400', wash: 'bg-violet-50/50' },
  loads: { selected: 'border-orange-600 bg-orange-600', accent: 'text-orange-700', border: 'border-orange-200', action: 'bg-orange-600 hover:bg-orange-700', row: 'border-r-orange-400', wash: 'bg-orange-50/50' },
  actual: { selected: 'border-emerald-600 bg-emerald-600', accent: 'text-emerald-700', border: 'border-emerald-200', action: 'bg-emerald-600 hover:bg-emerald-700', row: 'border-r-emerald-400', wash: 'bg-emerald-50/50' },
};

function rowTitle(row: Row, key: ScreenKey) {
  if (key === 'factories') return liveName(row);
  if (key === 'quarries') return liveName(row);
  if (key === 'drivers') return row.name ?? row.driver_name ?? 'سائق بدون اسم';
  if (key === 'vehicles') return row.plate_number ?? row.vehicle_code ?? 'عربية بدون لوحة';
  if (key === 'owners') return row.name ?? 'مالك بدون اسم';
  if (key === 'waiting') return row.plate_number ?? row.driver_name ?? 'عنصر انتظار';
  if (key === 'loads') return liveName(row, row.load_order_id ?? 'أمر تحميل');
  return row.trip_code ?? row.ticket_number ?? row.record_number ?? row.actual_loading_record_id ?? 'سجل تحميل فعلي';
}
function rowDetails(row: Row, key: ScreenKey) {
  if (key === 'factories') return [row.address, row.phone, row.is_active === false ? 'غير نشط' : 'نشط'].filter(Boolean).join(' · ');
  if (key === 'quarries') return [row.address, row.phone, row.is_active === false ? 'غير نشط' : 'نشط'].filter(Boolean).join(' · ');
  if (key === 'drivers') return [row.phone, row.is_active === false ? 'غير نشط' : 'نشط'].filter(Boolean).join(' · ');
  if (key === 'vehicles') return [row.owner_name ? 'المالك: ' + row.owner_name : '', Array.isArray(row.assigned_drivers) && row.assigned_drivers.length ? 'السائقون: ' + row.assigned_drivers.map((driver: Row) => driver.name).filter(Boolean).join('، ') : 'لا يوجد سائقون مرتبطون', row.truck_type ?? row.vehicle_type, row.capacity_tons ? row.capacity_tons + ' طن' : '', row.is_active === false ? 'غير نشطة' : 'نشطة'].filter(Boolean).join(' · ');
  if (key === 'owners') return [row.phone, row.is_active === false ? 'غير نشط' : 'نشط'].filter(Boolean).join(' · ');
  if (key === 'waiting') return [row.driver_name, row.status === 'WAITING' ? 'في الانتظار' : row.status === 'ASSIGNED' ? 'تم التخصيص' : row.status, row.selected_factory_name && row.selected_quarry_name ? `اختار: ${row.selected_factory_name} ← ${row.selected_quarry_name}` : '', row.choice_status === 'CHOSEN' ? 'الاختيار مسجل — في انتظار التوزيع' : row.choice_status === 'ALLOCATED' ? 'تم التوزيع النهائي' : row.choice_status === 'NOT_ALLOCATED' ? 'لم يتم تخصيص اختيارك' : '', row.trip_code ? `كود النقلة: ${row.trip_code}` : '', row.arrived_at ? new Date(row.arrived_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : ''].filter(Boolean).join(' · ');
  if (key === 'loads') return [row.status, row.requested_quantity ? 'المطلوب: ' + row.requested_quantity : '', row.created_at ? new Date(row.created_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : ''].filter(Boolean).join(' · ');
  return [row.loading_sequence_date || row.load_date, row.factory_name ? 'المصنع: ' + row.factory_name : '', row.quarry_name ? 'المحجر: ' + row.quarry_name : '', row.redirect_reason ? 'سبب التحويل: ' + row.redirect_reason : '', row.daily_load_number ? 'تحميل اليوم #' + row.daily_load_number : '', row.ticket_number ? 'تذكرة: ' + row.ticket_number : '', row.actual_weight != null ? 'الوزن: ' + row.actual_weight + ' طن' : 'الوزن لم يُسجل', row.created_at ? new Date(row.created_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : ''].filter(Boolean).join(' · ');
}

export const OfficeDirectoryScreen: React.FC<{ initialSection?: ScreenKey; showSectionTabs?: boolean }> = ({ initialSection = 'factories', showSectionTabs = true }) => {
  const [active, setActive] = useState<ScreenKey>(initialSection);
  useEffect(() => { setActive(initialSection); }, [initialSection]);
  useEffect(() => { setShowMasterForm(false); setEditingMasterEntry(null); setEditingOwner(null); }, [active]);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [waiting, setWaiting] = useState<Row[]>([]);
  const [waitingWindow, setWaitingWindow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverTemporaryPassword, setDriverTemporaryPassword] = useState('');
  const [driverTemporaryPasswordConfirmation, setDriverTemporaryPasswordConfirmation] = useState('');
  const [pendingAccount, setPendingAccount] = useState<{ driverId: string; name: string } | null>(null);
  const [retryingInvite, setRetryingInvite] = useState(false);
  const [passwordResetDriver, setPasswordResetDriver] = useState<Row | null>(null);
  const [newDriverPassword, setNewDriverPassword] = useState('');
  const [confirmDriverPassword, setConfirmDriverPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [driverCode, setDriverCode] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');
  const [entitySearch, setEntitySearch] = useState('');
  const [showMasterForm, setShowMasterForm] = useState(false);
  const [editingMasterEntry, setEditingMasterEntry] = useState<Row | null>(null);
  const [masterForm, setMasterForm] = useState({ name: '', code: '', address: '', phone: '', is_active: true });
  const [savingMaster, setSavingMaster] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [availableVehicles, setAvailableVehicles] = useState<Row[]>([]);
  const [ownerDirectory, setOwnerDirectory] = useState<Row[]>([]);
  const [editingOwner, setEditingOwner] = useState<Row | null>(null);
  const [ownerEditName, setOwnerEditName] = useState('');
  const [ownerEditPhone, setOwnerEditPhone] = useState('');
  const [editingDriver, setEditingDriver] = useState<Row | null>(null);
  const [driverEditName, setDriverEditName] = useState('');
  const [driverEditPhone, setDriverEditPhone] = useState('');
  const [driverEditCode, setDriverEditCode] = useState('');
  const [driverEditVehicleId, setDriverEditVehicleId] = useState('');
  const [driverEditVehicles, setDriverEditVehicles] = useState<Row[]>([]);
  const [driverEditOptionsLoaded, setDriverEditOptionsLoaded] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Row | null>(null);
  const [vehicleEditPlate, setVehicleEditPlate] = useState('');
  const [vehicleEditCode, setVehicleEditCode] = useState('');
  const [vehicleEditOwnerId, setVehicleEditOwnerId] = useState('');
  const [vehicleOwnerMode, setVehicleOwnerMode] = useState<'existing' | 'new'>('existing');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, directoryResult, waitingResult] = await Promise.all([
        getLiveSnapshot(),
        supabase.rpc('main_office_get_directory'),
        supabase.rpc('get_office_waiting_list'),
      ]);
      if (directoryResult.error) throw directoryResult.error;
      if (waitingResult.error) throw waitingResult.error;
      let liveData = data;
      if (active === 'actual') {
        const reportsResult = await supabase.rpc('get_vehicle_owner_reports', { p_from: null, p_to: null });
        if (reportsResult.error) throw reportsResult.error;
        liveData = {
          ...data,
          actual_loading_records: Array.isArray(reportsResult.data?.trips) ? reportsResult.data.trips : [],
        };
      }
      const directory = directoryResult.data ?? {};
      const factories = (directory.factories ?? []).map((r: Row) => ({ factory_id: r.id, code: r.code, factory_code: r.code, name: r.name, notes: r.notes, is_active: r.is_active }));
      const quarries = (directory.quarries ?? []).map((r: Row) => ({ quarry_id: r.id, code: r.code, quarry_code: r.code, name: r.name, notes: r.notes, is_active: r.is_active, latitude: r.latitude, longitude: r.longitude }));
      const ownerById = new Map<string, Row>((directory.owners ?? []).map((owner: Row) => [String(owner.id), owner] as [string, Row]));
      const vehicles = (directory.vehicles ?? []).map((r: Row) => { const linkedOwner = ownerById.get(r.owner_id); return ({ vehicle_id: r.id, vehicle_code: r.code, plate_number: r.plate_number, owner_id: r.owner_id, owner_name: r.owner_name ?? linkedOwner?.name ?? null, owner_code: r.owner_code ?? linkedOwner?.code ?? null, owner_phone: r.owner_phone ?? linkedOwner?.phone ?? null, office_id: r.office_id, is_active: r.is_active, assigned_drivers: Array.isArray(r.assigned_drivers) ? r.assigned_drivers : (r.assigned_driver_id ? [{ id: r.assigned_driver_id, name: r.assigned_driver_name }] : []) }); });
      const vehicleById = new Map<string, Row>(vehicles.map((vehicle: Row) => [String(vehicle.vehicle_id), vehicle] as [string, Row]));
      const drivers = (directory.drivers ?? []).map((r: Row) => ({ driver_id: r.id, driver_code: r.code, code: r.code, name: r.name, phone: r.phone, office_id: r.office_id, is_active: r.is_active, vehicle_id: r.vehicle_id, vehicle_code: r.vehicle_code, plate_number: r.plate_number, vehicle_owner_name: vehicleById.get(String(r.vehicle_id))?.owner_name ?? null }));
      setSnapshot({ ...liveData, factories, quarries, drivers, vehicles });
      setWaiting(Array.isArray(waitingResult.data?.entries) ? waitingResult.data.entries : []);
      setWaitingWindow(waitingResult.data?.selection_window ?? null);
      setAvailableVehicles(vehicles.filter((v: Row) => v.is_active !== false));
      setOwnerDirectory((directory.owners ?? []).map((r: Row) => ({ owner_id: r.id, owner_code: r.code, name: r.name, phone: r.phone, is_active: r.is_active })));
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل دليل بيانات المكتب.');
    } finally {
      setLoading(false);
    }
  }, [active]);
  useEffect(() => { void load(); }, [load]);

  const refreshWaitingQueue = useCallback(async () => {
    const { data, error: waitingError } = await supabase.rpc('get_office_waiting_list');
    if (waitingError) {
      setError(waitingError.message || 'تعذر تحديث قائمة الانتظار.');
      return;
    }
    setWaiting(Array.isArray(data?.entries) ? data.entries : []);
    setWaitingWindow(data?.selection_window ?? null);
  }, []);

  useEffect(() => {
    if (active !== 'waiting') return;
    void refreshWaitingQueue();
    const timer = window.setInterval(() => void refreshWaitingQueue(), 10000);
    return () => window.clearInterval(timer);
  }, [active, refreshWaitingQueue]);

  async function addDirectoryEntity(kind: 'factories' | 'quarries') {
    const isFactory = kind === 'factories';
    const label = isFactory ? 'العميل / المصنع' : 'المحجر';
    const name = window.prompt(`اكتب اسم ${label}:`);
    if (!name?.trim()) return;
    const code = window.prompt(`اكتب كود ${label} (مطلوب وفريد):`) || '';
    setError('');
    setSuccess('');
    setSavingEdit(true);
    try {
      if (!code.trim()) throw new Error('لازم تدخل كود واضح وفريد للسجل.');
      const { data, error: insertError } = await supabase.rpc('main_office_upsert_directory', {
        p_entity_type: kind === 'factories' ? 'FACTORY' : 'QUARRY',
        p_name: name.trim(),
        p_code: code.trim(),
        p_notes: null,
        p_is_active: true,
      });
      if (insertError) throw insertError;
      if (!data?.id) throw new Error('تعذر تأكيد إضافة السجل.');
      setSuccess(`تمت إضافة ${label} بنجاح.`);
      setEntitySearch('');
      await load();
    } catch (e: any) {
      setError(e?.message || `تعذرت إضافة ${label}. راجع صلاحيات حساب المكتب وسياسة قاعدة البيانات.`);
    } finally {
      setSavingEdit(false);
    }
  }

  async function setMasterDirectoryActive(row: Row) {
    const isFactory = active === 'factories';
    const entityType = isFactory ? 'FACTORY' : 'QUARRY';
    const entityId = isFactory ? row.factory_id : row.quarry_id;
    const label = isFactory ? 'العميل / المصنع' : 'المحجر / المورد';
    const nextActive = row.is_active === false;
    if (!entityId) { setError('تعذر تحديد السجل المطلوب. حدّث القائمة وحاول مرة أخرى.'); return; }
    if (!window.confirm(nextActive
      ? `تأكيد إعادة تفعيل ${label} ${liveName(row)}؟`
      : `تأكيد إيقاف ${label} ${liveName(row)}؟ سيظل محفوظًا في تاريخ النقلات القديمة، ولن يظهر ضمن السجلات النشطة.`)) return;
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_set_directory_active', {
        p_entity_type: entityType, p_entity_id: entityId, p_is_active: nextActive,
      });
      if (rpcError) throw rpcError;
      if (!data?.id || data.is_active !== nextActive) throw new Error('تعذر تأكيد تغيير حالة السجل.');
      setSuccess(nextActive ? `تم تفعيل ${label}.` : `تم إيقاف ${label} مع الاحتفاظ بالسجلات التاريخية.`);
      await load();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const messages: Record<string, string> = {
        ENTITY_NOT_FOUND: 'السجل غير موجود. حدّث القائمة وحاول مرة أخرى.',
        MAIN_OFFICE_ACCESS_REQUIRED: 'تغيير حالة السجل متاح للمكتب الرئيسي فقط.',
        AUTH_REQUIRED: 'انتهت جلسة المكتب. سجّل الدخول مرة أخرى.',
      };
      const key = Object.keys(messages).find(code => raw.includes(code));
      setError(key ? messages[key] : (raw || 'تعذر تغيير حالة السجل.'));
    } finally { setSavingEdit(false); }
  }

  async function cancelDirectoryEntity(entityType: 'FACTORY' | 'QUARRY' | 'DRIVER' | 'VEHICLE', row: Row) {
    const identity: Record<typeof entityType, { id: string; code: string; label: string }> = {
      FACTORY: { id: String(row.factory_id ?? ''), code: String(row.factory_code ?? row.code ?? ''), label: 'المصنع' },
      QUARRY: { id: String(row.quarry_id ?? ''), code: String(row.quarry_code ?? row.code ?? ''), label: 'المحجر' },
      DRIVER: { id: String(row.driver_id ?? ''), code: String(row.driver_code ?? row.code ?? ''), label: 'السائق' },
      VEHICLE: { id: String(row.vehicle_id ?? ''), code: String(row.vehicle_code ?? ''), label: 'العربية' },
    };
    const item = identity[entityType];
    if (!item.id || !item.code) { setError('تعذر تحديد كود السجل. حدّث القائمة وحاول مرة أخرى.'); return; }
    if (!window.confirm(`إلغاء نهائي لـ${item.label} ${row.name ?? row.plate_number ?? ''}؟ سيختفي من القوائم، ويظل محفوظًا في السجلات القديمة، ولا يمكن إعادة استخدام كوده.`)) return;
    const confirmation = window.prompt(`تأكيد ثانٍ: اكتب النص كما هو لإلغاء السجل نهائيًا:\nCANCEL ${entityType} ${item.code}`);
    if (confirmation !== `CANCEL ${entityType} ${item.code}`) {
      if (confirmation !== null) setError('لم يتطابق نص التأكيد؛ لم يتم الإلغاء.');
      return;
    }
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_cancel_directory_entity', {
        p_entity_type: entityType, p_entity_id: item.id, p_confirmation: confirmation,
      });
      if (rpcError) throw rpcError;
      if (!data?.cancelled) throw new Error('تعذر تأكيد الإلغاء النهائي.');
      setSuccess(`تم إلغاء ${item.label} نهائيًا. اختفى من القوائم وكوده ${item.code} محجوز للسجلات التاريخية.`);
      await load();
    } catch (e: any) {
      const raw = String(e?.message ?? '');
      const messages: Record<string, string> = {
        ENTITY_HAS_OPEN_LOAD_ORDERS: 'لا يمكن إلغاء المصنع أو المحجر قبل إنهاء أوامر التحميل المفتوحة المرتبطة به.',
        ENTITY_HAS_ACTIVE_BOOKING: 'لا يمكن إلغاء السجل قبل إنهاء النقلات النشطة المرتبطة به.',
        ENTITY_IS_IN_DISPATCH_QUEUE: 'لا يمكن إلغاء السائق وهو في قائمة الانتظار أو لديه اختيار توزيع قائم.',
        ENTITY_ALREADY_CANCELLED: 'تم إلغاء هذا السجل من قبل. حدّث القائمة.',
        CANCELLATION_CONFIRMATION_MISMATCH: 'لم يتطابق نص التأكيد؛ لم يتم الإلغاء.',
        ENTITY_NOT_FOUND: 'السجل غير موجود. حدّث القائمة وحاول مرة أخرى.',
      };
      const key = Object.keys(messages).find(code => raw.includes(code));
      setError(key ? messages[key] : raw || 'تعذر إلغاء السجل نهائيًا.');
    } finally { setSavingEdit(false); }
  }

  async function cancelTrip(row: Row) {
    const reason = window.prompt(`اكتب سبب إلغاء النقلة ${row.trip_code ?? ''}:`);
    if (!reason?.trim()) return;
    if (!window.confirm(`تأكيد إلغاء النقلة ${row.trip_code ?? ''}؟ ستظل محفوظة في التاريخ بنفس الكود.`)) return;
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_cancel_booking', { p_booking_id: row.booking_id, p_reason: reason.trim() });
      if (rpcError) throw rpcError;
      if (data?.status !== 'CANCELLED') throw new Error('تعذر تأكيد إلغاء النقلة.');
      setSuccess(`تم إلغاء النقلة ${data.trip_code} مع الاحتفاظ بكودها وسجلها.`);
      await load();
    } catch (e: any) {
      const raw = String(e?.message ?? '');
      setError(raw.includes('DELIVERY_ALREADY_CONFIRMED') ? 'لا يمكن إلغاء النقلة بعد تسجيل الوزن أو تأكيد التسليم.' : raw || 'تعذر إلغاء النقلة.');
    } finally { setSavingEdit(false); }
  }

  async function redirectTrip(row: Row) {
    const targets = (snapshot?.factories ?? []).filter((factory: Row) => factory.is_active !== false && String(factory.factory_id) !== String(row.factory_id));
    if (!targets.length) { setError('لا يوجد مصنع نشط آخر متاح للتحويل إليه.'); return; }
    const targetCode = window.prompt(`اكتب كود المصنع البديل للنقلة ${row.trip_code ?? ''}:\n${targets.map((factory: Row) => `${factory.factory_code ?? factory.code} — ${factory.name}`).join('\n')}`);
    if (!targetCode?.trim()) return;
    const target = targets.find((factory: Row) => String(factory.factory_code ?? factory.code).trim().toLowerCase() === targetCode.trim().toLowerCase());
    if (!target) { setError('كود المصنع غير موجود في قائمة المصانع النشطة؛ لم يتم التحويل.'); return; }
    const reason = window.prompt(`اكتب سبب تحويل النقلة إلى ${target.name}:`);
    if (!reason?.trim()) return;
    if (!window.confirm(`تحويل النقلة ${row.trip_code} إلى ${target.name}؟ سيبقى كود النقلة كما هو.`)) return;
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_redirect_booking', { p_booking_id: row.booking_id, p_factory_id: target.factory_id, p_reason: reason.trim() });
      if (rpcError) throw rpcError;
      if (!data?.factory_id || data.trip_code !== row.trip_code) throw new Error('تعذر تأكيد تحويل النقلة مع الحفاظ على كودها.');
      setSuccess(`تم تحويل النقلة ${data.trip_code} إلى ${data.factory_name}، وأُرسل تنويه للسائق. كود النقلة لم يتغير.`);
      await load();
    } catch (e: any) {
      const raw = String(e?.message ?? '');
      setError(raw.includes('DELIVERY_ALREADY_CONFIRMED') ? 'لا يمكن تحويل النقلة بعد تسجيل الوزن أو تأكيد التسليم.' : raw.includes('TRIP_NOT_READY_FOR_REDIRECTION') ? 'التحويل متاح للنقلة النشطة قبل تأكيد التسليم فقط.' : raw || 'تعذر تحويل النقلة.');
    } finally { setSavingEdit(false); }
  }

  async function setOwnerActive(row: Row) {
    const nextActive = row.is_active === false;
    if (!nextActive && !window.confirm(`تأكيد إيقاف المالك ${row.name}؟ لا يمكن إيقافه طالما عنده عربيات نشطة.`)) return;
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_set_directory_active', {
        p_entity_type: 'OWNER', p_entity_id: row.owner_id, p_is_active: nextActive,
      });
      if (rpcError) throw rpcError;
      if (!data?.id) throw new Error('تعذر تأكيد تغيير حالة المالك.');
      setSuccess(nextActive ? 'تم تفعيل المالك.' : 'تم إيقاف المالك.');
      await load();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const messages: Record<string,string> = {
        OWNER_HAS_ACTIVE_VEHICLES: 'لا يمكن إيقاف المالك قبل إيقاف كل العربيات التابعة له.',
        ENTITY_NOT_FOUND: 'المالك غير موجود.',
        MAIN_OFFICE_ACCESS_REQUIRED: 'الإجراء متاح للمكتب الرئيسي فقط.',
      };
      const key = Object.keys(messages).find(code => raw.includes(code));
      setError(Object.entries(messages).find(([code]) => raw.includes(code))?.[1] ?? (raw || 'تعذر تغيير حالة المالك.'));
    } finally { setSavingEdit(false); }
  }

  function beginOwnerEdit(row: Row) {
    setEditingOwner(row);
    setOwnerEditName(String(row.name ?? ''));
    setOwnerEditPhone(String(row.phone ?? ''));
    setError(''); setSuccess('');
  }

  async function saveOwnerEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOwner) return;
    if (!ownerEditName.trim()) { setError('اسم المالك مطلوب.'); return; }
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_update_vehicle_owner', {
        p_owner_id: editingOwner.owner_id,
        p_name: ownerEditName.trim(),
        p_phone: ownerEditPhone.trim() || null,
        p_notes: editingOwner.notes ?? null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success || data?.owner_id !== editingOwner.owner_id) throw new Error('تعذر تأكيد تحديث بيانات المالك.');
      setEditingOwner(null);
      setSuccess('تم تحديث بيانات المالك مع الاحتفاظ بكود المالك وربطه بالعربيات الحالية.');
      await load();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const messages: Record<string, string> = {
        OWNER_ID_AND_NAME_REQUIRED: 'اسم المالك مطلوب.',
        OWNER_NOT_FOUND: 'المالك غير موجود. حدّث القائمة وحاول مرة أخرى.',
        MAIN_OFFICE_ACCESS_REQUIRED: 'تعديل بيانات المالك متاح للمكتب الرئيسي فقط.',
        AUTH_REQUIRED: 'انتهت جلسة المكتب. سجّل الدخول مرة أخرى.',
      };
      const key = Object.keys(messages).find(code => raw.includes(code));
      setError(key ? messages[key] : raw || 'تعذر تحديث بيانات المالك.');
    } finally { setSavingEdit(false); }
  }

  async function addVehicleOwner() {
    const name = window.prompt('اكتب اسم مالك العربية:');
    if (!name?.trim()) return;
    const phone = window.prompt('رقم موبايل المالك (اختياري):') || '';
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_create_vehicle_owner', {
        p_name: name.trim(), p_phone: phone.trim() || null, p_notes: null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success || !data?.owner_id) throw new Error('تعذر تأكيد إضافة المالك.');
      setSuccess(`تمت إضافة المالك ${name.trim()} بنجاح.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'تعذرت إضافة مالك العربية.');
    } finally { setSavingEdit(false); }
  }

  async function removeWaitingEntry(row: Row) {
    if (!row.entry_id || row.status !== 'WAITING') return;
    if (!window.confirm(`إزالة السائق ${row.driver_name || ''} من قائمة الانتظار؟`)) return;
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_remove_waiting_entry', { p_entry_id: row.entry_id });
      if (rpcError) throw rpcError;
      if (!data?.success || data?.status !== 'LEFT') throw new Error('لم يؤكد النظام إزالة السائق من قائمة الانتظار.');
      setSuccess(`تمت إزالة ${row.driver_name || 'السائق'} من قائمة الانتظار مع الاحتفاظ بالسجل.`);
      await load();
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (raw.includes('WAITING_ENTRY_NOT_ACTIVE')) setError('السائق لم يعد في قائمة الانتظار النشطة. حدّث البيانات.');
      else setError(raw || 'تعذر إزالة السائق من قائمة الانتظار.');
    } finally { setSavingEdit(false); }
  }
  async function beginDriverEdit(row: Row) {
    setEditingDriver(row);
    setDriverEditName(String(row.name ?? row.driver_name ?? ''));
    setDriverEditPhone(String(row.phone ?? ''));
    setDriverEditCode(String(row.driver_code ?? ''));
    setDriverEditVehicleId(String(row.vehicle_id ?? ''));
    setDriverEditVehicles((snapshot?.vehicles ?? []).filter((vehicle: Row) => vehicle.is_active !== false));
    setDriverEditOptionsLoaded(true);
    setError(''); setSuccess('');
  }

  function beginVehicleEdit(row: Row) {
    setError(''); setSuccess('');
    setEditingVehicle(row);
    setVehicleEditPlate(String(row.plate_number ?? ''));
    setVehicleEditCode(String(row.vehicle_code ?? ''));
    setVehicleEditOwnerId(String(row.owner_id ?? ''));
    setVehicleOwnerMode('existing');
    setNewOwnerName(''); setNewOwnerPhone('');
  }

  async function deactivateDriver(row: Row) {
    const name = String(row.name ?? row.driver_name ?? 'السائق');
    const hasActiveBooking = (snapshot?.bookings ?? []).some((booking: Row) =>
      String(booking.driver_id) === String(row.driver_id) &&
      ['ASSIGNED', 'ARRIVED', 'LOADING', 'LOADED', 'IN_TRANSIT'].includes(String(booking.status).toUpperCase())
    );
    if (hasActiveBooking) { setError('لا يمكن إيقاف السائق لأن عليه نقلة نشطة. أنهِ النقلة أو ألغها أولًا.'); return; }
    if (!window.confirm('تأكيد إيقاف ' + name + '؟ سيتم الاحتفاظ بكل سجلات التحميل والربط السابقة.')) return;
    setError(''); setSuccess(''); setSavingEdit(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_set_directory_active', { p_entity_type: 'DRIVER', p_entity_id: row.driver_id, p_is_active: false });
      if (rpcError) throw rpcError; if (!data?.id) throw new Error('تعذر تأكيد إيقاف السائق.');
      setEditingDriver(null); setSuccess('تم إيقاف السائق مع الاحتفاظ بالسجلات التاريخية.'); await load();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const messages: Record<string,string> = { AUTH_REQUIRED: 'انتهت جلسة المكتب. سجّل الدخول مرة أخرى.', MAIN_OFFICE_ACCESS_REQUIRED: 'إيقاف السائق متاح للمكتب الرئيسي فقط.', DRIVER_NOT_FOUND: 'السائق غير موجود.', DRIVER_HAS_ACTIVE_BOOKING: 'لا يمكن إيقاف السائق لأن عليه نقلة نشطة.' };
      const key = Object.keys(messages).find(code => raw.includes(code)); setError(key ? messages[key] : raw || 'تعذر إيقاف السائق.');
    } finally { setSavingEdit(false); }
  }

  async function saveDriverEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDriver) return;
    setSavingEdit(true); setError(''); setSuccess('');
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_update_driver', {
        p_driver_id: editingDriver.driver_id, p_name: driverEditName.trim(),
        p_phone: driverEditPhone.trim(), p_driver_code: driverEditCode.trim() || null, p_vehicle_id: driverEditVehicleId || null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error('تعذر تأكيد تعديل السائق.');
      setEditingDriver(null); setSuccess('تم تحديث بيانات السائق وربط العربية به.'); await load();
    } catch (e: any) {
      const raw=String(e?.message||'');
      const messages: Record<string,string> = {
        DRIVER_ID_NAME_PHONE_AND_VEHICLE_REQUIRED:'أكمل بيانات السائق واختار العربية.',
        VEHICLE_NOT_AVAILABLE:'العربية غير نشطة أو غير متاحة للاستخدام.',
        VEHICLE_NOT_AVAILABLE_IN_TARGET_BRANCH:'العربية ليست ضمن أسطول مكتب رأس سدر.',
        RAS_SEDR_BRANCH_CONFIGURATION_INVALID:'إعداد مكتب رأس سدر غير صحيح. راجع إعدادات الفرع.',
        DRIVER_HAS_ACTIVE_BOOKING:'لا يمكن تغيير ربط السائق أثناء وجود نقلة نشطة عليه. أنهِ النقلة أو ألغها أولًا.',
        VEHICLE_HAS_ACTIVE_BOOKING:'لا يمكن تغيير ربط العربية أثناء وجود نقلة نشطة عليها.',
        
        DRIVER_NOT_ASSIGNED_TO_RAS_SEDR:'السائق ليس تابعًا لمكتب رأس سدر.',
        DRIVER_PHONE_INVALID:'أدخل رقم موبايل مصري صحيحًا.',
        DRIVER_PHONE_EXISTS:'رقم الموبايل مسجل لسائق آخر.',
        DRIVER_NOT_FOUND:'السائق غير موجود.',
        DRIVER_LOGIN_PHONE_CHANGE_REQUIRES_ACCOUNT_UPDATE:'لا يمكن تغيير رقم دخول سائق مرتبط بحساب من هنا. استخدم تدفق تحديث الحساب الآمن.',
        DRIVER_CODE_EXISTS:'كود السائق مستخدم بالفعل.',
        MAIN_OFFICE_ACCESS_REQUIRED:'تعديل بيانات السائق متاح للمكتب الرئيسي فقط.',
      };
      const key=Object.keys(messages).find(code=>raw.includes(code)); setError(key?messages[key]:raw||'تعذر تعديل بيانات السائق.');
    } finally { setSavingEdit(false); }
  }

  async function saveVehicleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingVehicle) return;
    if (!vehicleEditOwnerId) { setError('اختار مالكًا مسجلًا ونشطًا للعربية.'); return; }
    setSavingEdit(true); setError(''); setSuccess('');
    try {
      const { data, error: rpcError } = await supabase.rpc('main_office_update_vehicle', {
        p_vehicle_id: editingVehicle.vehicle_id, p_plate_number: vehicleEditPlate.trim(),
        p_owner_id: vehicleEditOwnerId, p_notes: editingVehicle.notes ?? null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error('تعذر تأكيد تعديل العربية.');
      setEditingVehicle(null); setSuccess('تم تحديث بيانات العربية ومالكها.'); await load();
    } catch (e: any) {
      const raw=String(e?.message||'');
      const messages: Record<string,string> = {
        VEHICLE_ID_PLATE_OWNER_REQUIRED:'أكمل رقم اللوحة واختار المالك.',
        VEHICLE_HAS_ACTIVE_BOOKING:'لا يمكن تعديل بيانات العربية أثناء وجود نقلة نشطة عليها.',
        OWNER_NOT_ACTIVE:'المالك المحدد غير نشط.',
        VEHICLE_PLATE_EXISTS:'رقم اللوحة مسجل لعربية أخرى.',
        VEHICLE_NOT_FOUND:'العربية غير موجودة.',
        MAIN_OFFICE_ACCESS_REQUIRED:'تعديل العربيات متاح للمكتب الرئيسي فقط.',
      };
      const key=Object.keys(messages).find(code=>raw.includes(code)); setError(key?messages[key]:raw||'تعذر تعديل بيانات العربية.');
    } finally { setSavingEdit(false); }
  }

  async function createDriverAccount(driverId: string, temporaryPassword: string) {
    const { data, error: invokeError } = await supabase.functions.invoke('create-driver-account', {
      body: { driver_id: driverId, temporary_password: temporaryPassword },
    });
    if (invokeError) throw invokeError;
    if (!data?.success) {
      const code = String(data?.error ?? 'ACCOUNT_CREATION_FAILED');
      const messages: Record<string, string> = {
        AUTH_REQUIRED: 'انتهت جلسة الدخول. سجّل دخول المكتب مرة تانية.',
        INSUFFICIENT_ROLE: 'حسابك مش عنده صلاحية إنشاء حسابات للسائقين.',
        PHONE_ALREADY_REGISTERED: 'رقم الموبايل مربوط بحساب موجود. راجع الحساب قبل إعادة المحاولة.',
        DRIVER_ACCOUNT_ALREADY_LINKED: 'السواق ده مربوط بحساب بالفعل.',
        DRIVER_NOT_FOUND_OR_INACTIVE: 'السواق غير موجود أو غير نشط.',
        DRIVER_PHONE_INVALID: 'رقم موبايل السواق غير صالح. استخدم رقمًا مصريًا صحيحًا.',
        DRIVER_ID_REQUIRED: 'معرّف السواق مطلوب لإنشاء الحساب.',
        TEMPORARY_PASSWORD_TOO_SHORT: 'كلمة المرور يجب ألا تقل عن 8 أحرف.',
        ACCOUNT_CREATION_FAILED: 'تعذر إنشاء حساب الدخول. تحقق من إعدادات Supabase Auth.',
        SERVER_CONFIGURATION_MISSING: 'وظيفة إنشاء الحساب محتاجة إعدادات Supabase على الخادم.',
      };
      throw new Error(messages[code] ?? 'تعذر إنشاء حساب الدخول للسواق.');
    }
  }

  async function retryDriverAccount() {
    if (!pendingAccount) return;
    setRetryingInvite(true);
    setError('');
    try {
      await createDriverAccount(pendingAccount.driverId, driverTemporaryPassword);
      setSuccess('تم إنشاء حساب السائق. اسم المستخدم هو رقم الموبايل، وكلمة المرور هي التي حددتها.');
      setPendingAccount(null);
      setDriverTemporaryPassword('');
      setDriverTemporaryPasswordConfirmation('');
    } catch (e: any) {
      setError(e?.message || 'تعذر إنشاء حساب السائق.');
    } finally {
      setRetryingInvite(false);
    }
  }

  async function resetDriverPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordResetDriver) return;
    setError('');
    setSuccess('');
    if (newDriverPassword.length < 8) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (newDriverPassword !== confirmDriverPassword) {
      setError('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    setResettingPassword(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-driver-account', {
        body: { action: 'reset_password', driver_id: passwordResetDriver.driver_id, temporary_password: newDriverPassword },
      });
      if (invokeError) throw invokeError;
      if (!data?.success) {
        const code = String(data?.error ?? 'PASSWORD_RESET_FAILED');
        const messages: Record<string, string> = {
          AUTH_REQUIRED: 'انتهت جلسة المكتب. سجّل الدخول مرة أخرى.',
          INSUFFICIENT_ROLE: 'إدارة كلمات المرور متاحة للمكتب الرئيسي فقط.',
          DRIVER_NOT_FOUND_OR_INACTIVE: 'السائق غير موجود أو غير نشط.',
          DRIVER_ACCOUNT_NOT_LINKED: 'السائق ليس لديه حساب دخول مرتبط. أنشئ حسابه أولًا من قائمة السائقين.',
          TEMPORARY_PASSWORD_TOO_SHORT: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.',
        };
        throw new Error(messages[code] ?? 'تعذر تحديث كلمة مرور السائق.');
      }
      setPasswordResetDriver(null);
      setNewDriverPassword('');
      setConfirmDriverPassword('');
      setSuccess('تم تحديث كلمة المرور المؤقتة. لازم السائق يغيّرها عند أول تسجيل دخول.');
    } catch (e: any) {
      setError(e?.message || 'تعذر تحديث كلمة مرور السائق.');
    } finally {
      setResettingPassword(false);
    }
  }

  async function createDriver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (driverTemporaryPassword.length < 8) { setError('كلمة المرور يجب ألا تقل عن 8 أحرف.'); return; }
    if (driverTemporaryPassword !== driverTemporaryPasswordConfirmation) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
    setSavingDriver(true);
    try {
      const { data: result, error: createError } = await supabase.rpc('main_office_create_driver', {
        p_name: driverName.trim(), p_phone: driverPhone.trim(), p_driver_code: driverCode.trim() || null, p_vehicle_id: selectedVehicleId || null,
      });
      if (createError) throw createError;
      if (!result?.success || !result?.driver_id) throw new Error('تعذر تأكيد حفظ السائق.');
      const savedDriver = { driverId: String(result.driver_id), name: driverName.trim() };
      setDriverName(''); setDriverPhone(''); setDriverCode(''); setVehicleSearch(''); setSelectedVehicleId(''); setShowDriverForm(false);
      try {
        await createDriverAccount(savedDriver.driverId, driverTemporaryPassword);
        setSuccess('تم إنشاء السائق وحساب الدخول وربط العربية المختارة به.');
        setDriverTemporaryPassword(''); setDriverTemporaryPasswordConfirmation('');
      } catch (accountError: any) {
        setPendingAccount(savedDriver);
        setDriverTemporaryPasswordConfirmation('');
        setError(`تم حفظ سجل السائق، لكن إنشاء حساب الدخول لم يكتمل: ${accountError?.message || 'تعذر إنشاء الحساب'}. أعد المحاولة من بطاقة السائق.`);
      }
      await load();
    } catch (e: any) {
      const raw=String(e?.message||'');
      const messages: Record<string,string> = {
        DRIVER_NAME_PHONE_AND_VEHICLE_REQUIRED:'أكمل اسم السائق ورقم الموبايل واختار العربية.',
        VEHICLE_NOT_AVAILABLE:'العربية غير نشطة أو غير متاحة للاستخدام.',
        
        DRIVER_PHONE_INVALID:'أدخل رقم موبايل مصري صحيحًا.',
        DRIVER_PHONE_EXISTS:'رقم الموبايل مسجل لسائق بالفعل.',
        DRIVER_CODE_EXISTS:'كود السائق مستخدم بالفعل.',
        MAIN_OFFICE_ACCESS_REQUIRED:'إنشاء السائقين متاح للمكتب الرئيسي فقط.',
        RAS_SEDR_BRANCH_CONFIGURATION_INVALID:'إعداد مكتب رأس سدر غير صحيح.',
      };
      const key=Object.keys(messages).find(code=>raw.includes(code)); setError(key?messages[key]:raw||'تعذر حفظ بيانات السائق.');
    } finally { setSavingDriver(false); }
  }

  function beginMasterEntryEdit(row?: Row) {
    setEditingMasterEntry(row ?? null);
    setMasterForm({ name: String(row?.name ?? ''), code: String(row?.code ?? ''), address: String(row?.notes ?? row?.address ?? ''), phone: String(row?.phone ?? ''), is_active: row?.is_active !== false });
    setShowMasterForm(true); setError(''); setSuccess('');
  }

  async function saveMasterEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!['factories', 'quarries'].includes(active)) return;
    setSavingMaster(true); setError(''); setSuccess('');
    try {
      if (editingMasterEntry) {
        const entityId = active === 'factories' ? editingMasterEntry.factory_id : editingMasterEntry.quarry_id;
        const { data, error: rpcError } = await supabase.rpc('main_office_update_master_directory', {
          p_entity_type: active === 'factories' ? 'FACTORY' : 'QUARRY',
          p_entity_id: entityId,
          p_code: masterForm.code.trim(),
          p_name: masterForm.name.trim(),
          p_notes: masterForm.address.trim() || null,
          p_is_active: masterForm.is_active,
        });
        if (rpcError) throw rpcError;
        if (!data?.success) throw new Error('تعذر تأكيد تحديث بيانات الدليل.');
      } else {
        if (!masterForm.code.trim() || !masterForm.name.trim()) throw new Error('الكود والاسم مطلوبان.');
        const { data, error: rpcError } = await supabase.rpc('main_office_upsert_directory', {
          p_entity_type: active === 'factories' ? 'FACTORY' : 'QUARRY',
          p_code: masterForm.code.trim(),
          p_name: masterForm.name.trim(),
          p_notes: [masterForm.address.trim(), masterForm.phone.trim()].filter(Boolean).join(' | ') || null,
          p_is_active: masterForm.is_active,
        });
        if (rpcError) throw rpcError;
        if (!data?.id) throw new Error('تعذر تأكيد حفظ بيانات الدليل.');
      }
      setShowMasterForm(false); setEditingMasterEntry(null);
      setMasterForm({ name: '', code: '', address: '', phone: '', is_active: true });
      setSuccess(editingMasterEntry ? 'تم تحديث بيانات الدليل بنجاح.' : 'تمت إضافة البيانات إلى دليل المكتب.');
      await load();
    } catch (e: any) {
      const raw = String(e?.message || '');
      const messages: Record<string, string> = {
        AUTH_REQUIRED: 'انتهت جلسة المكتب. سجّل الدخول مرة أخرى.',
        INSUFFICIENT_ROLE: 'إضافة وتعديل المصانع والمحاجر متاحان للمكتب الرئيسي فقط.',
        INVALID_DIRECTORY_ENTITY_TYPE: 'نوع السجل غير صالح.',
        DIRECTORY_NAME_REQUIRED: 'اكتب اسم المصنع أو المحجر.',
        DIRECTORY_NAME_EXISTS: 'اسم المصنع أو المحجر مستخدم بالفعل في هذا الدليل.',
        DIRECTORY_CODE_EXISTS: 'الكود مستخدم بالفعل في هذا الدليل. راجع السجلات قبل الحفظ.',
        DIRECTORY_ENTRY_NOT_FOUND: 'السجل المراد تعديله لم يعد موجودًا.',
      };
      const key = Object.keys(messages).find(code => raw.includes(code));
      setError(key ? messages[key] : raw || 'تعذر حفظ بيانات الدليل. تأكد من نشر Migration المعتمدة أولًا.');
    } finally { setSavingMaster(false); }
  }

  const lists: Record<ScreenKey, Row[]> = {
    factories: snapshot?.factories ?? [],
    quarries: snapshot?.quarries ?? [],
    drivers: snapshot?.drivers ?? [],
    vehicles: snapshot?.vehicles ?? [],
    owners: ownerDirectory,
    waiting,
    loads: snapshot?.load_orders ?? [],
    actual: [
      ...(snapshot?.actual_loading_records ?? []),
      ...(snapshot?.bookings ?? []).filter((booking: Row) => ['ASSIGNED', 'ARRIVED', 'LOADING', 'LOADED', 'IN_TRANSIT'].includes(String(booking.status).toUpperCase()) && !(snapshot?.actual_loading_records ?? []).some((record: Row) => String(record.booking_id) === String(booking.booking_id))),
    ],
  };
  const rows = lists[active] ?? [];
  const visibleRows = active === 'drivers' ? rows.filter(row => String(row.name ?? row.driver_name ?? '').toLocaleLowerCase().includes(driverSearch.trim().toLocaleLowerCase())) : ['factories', 'quarries', 'owners'].includes(active) ? rows.filter(row => [liveName(row), row.code, row.owner_code, row.address, row.phone].some(value => String(value ?? '').toLocaleLowerCase().includes(entitySearch.trim().toLocaleLowerCase()))) : rows;
  const filteredAvailableVehicles = availableVehicles.filter((vehicle: Row) => [vehicle.plate_number, vehicle.vehicle_code].some(value => String(value ?? '').toLowerCase().includes(vehicleSearch.trim().toLowerCase())));
  const selectedVehicle = availableVehicles.find((vehicle: Row) => String(vehicle.vehicle_id) === selectedVehicleId);
  const ActiveIcon = tabs.find(tab => tab.key === active)?.icon ?? ClipboardList;

  return (
    <section className={`space-y-4 rounded-[2rem] p-2 transition-colors sm:p-3 ${sectionPalette[active].wash}`}>
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -left-8 -top-10 h-32 w-32 rounded-full bg-sky-100/70 blur-2xl"/>
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md ${sectionPalette[active].selected}`}><ActiveIcon size={25}/></span><div className="min-w-0"><div className="text-[11px] font-black tracking-wider text-slate-400">TIBA SUPPLIES · DIRECTORY</div><h2 className="text-xl font-black tracking-tight sm:text-2xl">{tabs.find(tab => tab.key === active)?.label ?? 'إدارة المكتب'}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{active === 'factories' ? 'إدارة بيانات المصانع والعملاء والأكواد المرتبطة بالتشغيل.' : active === 'quarries' ? 'إدارة بيانات المحاجر والموردين ومصادر التحميل.' : active === 'drivers' ? 'ملفات السائقين وحالة الحساب وربط العربية.' : active === 'vehicles' ? 'بيانات الأسطول وملاك العربيات وربط السائقين.' : active === 'owners' ? 'إدارة مستقلة لملفات ملاك العربيات وأكوادهم.' : active === 'waiting' ? 'متابعة السائقين الموجودين في قائمة انتظار رأس سدر.' : active === 'loads' ? 'متابعة أوامر التحميل وحالتها من بيانات التشغيل.' : 'سجلات التحميل الفعلي والبيانات المسجلة يوميًا.'}</p></div></div>
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/> تحديث البيانات</button>
        </div>
      </div>
      {showSectionTabs && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const selected = active === tab.key;
          return <button key={tab.key} type="button" onClick={() => setActive(tab.key)} aria-pressed={selected} className={selected ? `group flex min-h-[88px] items-center gap-3 rounded-2xl border p-3 text-right text-sm font-black text-white shadow-md ring-2 ring-offset-1 transition ${sectionPalette[tab.key].selected} ring-white/70` : 'group flex min-h-[88px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-right text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'}>
            <span className={selected ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20' : `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${sectionPalette[tab.key].wash} ${sectionPalette[tab.key].accent}`}><Icon size={22} strokeWidth={2.2}/></span>
            <span className="min-w-0 flex-1 leading-5">{tab.label}</span>
            <span className={selected ? 'flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-xs tabular-nums' : `flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs tabular-nums ${sectionPalette[tab.key].wash} ${sectionPalette[tab.key].accent}`}>{lists[tab.key].length}</span>
          </button>;
        })}
      </div>}
      {active === 'waiting' && waitingWindow && <div className={`rounded-2xl border p-4 text-sm ${waitingWindow.status === 'OPEN' ? 'border-violet-200 bg-violet-50 text-violet-950' : 'border-slate-200 bg-slate-50 text-slate-700'}`}><strong>نافذة اختيار النقلات:</strong> {waitingWindow.status === 'OPEN' ? 'مفتوحة' : waitingWindow.status === 'CLOSED' ? 'مغلقة' : 'ملغاة'}{waitingWindow.selection_ends_at ? ` · تنتهي ${new Date(waitingWindow.selection_ends_at).toLocaleTimeString('ar-EG')}` : ''}{waitingWindow.opened_at ? ` · بدأت ${new Date(waitingWindow.opened_at).toLocaleTimeString('ar-EG')}` : ''}. التوزيع النهائي يتم على السيرفر بعد انتهاء الخمس دقائق.</div>}
      {success && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>}
      {error && <div role="alert" className="flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={18} className="shrink-0"/><span>{error}</span></div>}
      {pendingAccount && <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="text-sm text-amber-950"><p className="font-black">بيانات السواق اتحفظت، ولسه إنشاء الحساب محتاج إعادة محاولة</p><p className="mt-1">{pendingAccount.name}</p><p className="mt-1 text-xs">رقم السجل: {pendingAccount.driverId}</p></div><button type="button" onClick={() => void retryDriverAccount()} disabled={retryingInvite} className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{retryingInvite ? 'جاري إنشاء الحساب...' : 'إعادة محاولة إنشاء الحساب'}</button></div>}
      {active === 'vehicles' && <section className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${sectionPalette[active].border}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-black">إضافة عربية جديدة</h3><p className="mt-1 text-sm text-slate-500">تسجيل العربية ومالكها. ربط السواق خطوة منفصلة.</p></div>
          <button type="button" onClick={() => setShowVehicleForm(v => !v)} className={`rounded-xl px-4 py-2.5 text-sm font-black text-white transition ${sectionPalette[active].action}`}>{showVehicleForm ? 'إلغاء' : 'إضافة عربية'}</button>
        </div>
        {showVehicleForm && <div className="mt-4"><AddVehicleForm owners={ownerDirectory as Array<{ owner_id: string; name: string; owner_code?: string; is_active?: boolean }>} onSaved={() => { void load(); setSuccess('تمت إضافة العربية بكود تلقائي وربطها بالمالك المختار.'); }} /></div>}
      </section>}
      {active === 'drivers' && <section className={`rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${sectionPalette[active].border}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-black">إضافة سائق جديد</h3><p className="mt-1 text-sm text-slate-500">ممكن تربط أكتر من سواق بنفس العربية، مع منع تعارض النقلات الفعلية.</p></div>
          <button type="button" onClick={() => { setShowDriverForm(v => !v); setError(''); setSuccess(''); }} className={`rounded-xl px-4 py-2.5 text-sm font-black text-white transition ${sectionPalette[active].action}`}>{showDriverForm ? 'إلغاء' : 'إضافة سائق'}</button>
        </div>
        {showDriverForm && <form onSubmit={createDriver} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">اسم السواق بالكامل<input required value={driverName} onChange={e => setDriverName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" placeholder="اسم السواق"/><span className="mt-1 block text-xs font-normal text-slate-500">مسموح تكرار الاسم؛ التمييز بيكون برقم الموبايل وكود السائق إن وُجد.</span></label>
          <label className="text-sm font-bold text-slate-700">رقم الموبايل — اسم المستخدم<div className="relative mt-1.5"><Phone size={18} className="absolute right-3 top-3.5 text-slate-400"/><input required type="tel" inputMode="tel" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-3 pr-10 font-normal" placeholder="01012345678"/></div><span className="mt-1 block text-xs font-normal text-slate-500">السائق سيدخل بهذا الرقم وكلمة المرور التي تحددها.</span></label>
          <label className="text-sm font-bold text-slate-700">كلمة مرور السائق<input required type="password" autoComplete="new-password" minLength={8} value={driverTemporaryPassword} onChange={e => setDriverTemporaryPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /><span className="mt-1 block text-xs font-normal text-slate-500">دي كلمة المرور التي ستنشئ بها حساب السائق. سلّمها له مباشرة.</span></label>
          <label className="text-sm font-bold text-slate-700">تأكيد كلمة المرور<input required type="password" autoComplete="new-password" minLength={8} value={driverTemporaryPasswordConfirmation} onChange={e => setDriverTemporaryPasswordConfirmation(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /></label>
          <div className="sm:col-span-2 text-sm font-bold text-slate-700">العربية المرتبطة بالسائق
            <label className="relative mt-1.5 block"><span className="sr-only">ابحث عن العربية</span><input value={vehicleSearch} onChange={e => { setVehicleSearch(e.target.value); setSelectedVehicleId(''); }} className="w-full rounded-xl border border-slate-300 bg-white p-3 pr-10 font-normal" placeholder="ابحث برقم اللوحة أو كود العربية..."/><span className="absolute right-3 top-3 text-slate-400"><Truck size={18}/></span></label>
            <select required value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
              <option value="">اختار عربية متاحة</option>
              {filteredAvailableVehicles.map((vehicle: Row) => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.plate_number} — المالك: {vehicle.owner_name || 'غير مسجل'}{Array.isArray(vehicle.assigned_drivers) && vehicle.assigned_drivers.length ? ` — مرتبط بها ${vehicle.assigned_drivers.length} سواق` : ''}</option>)}
            </select>
            {selectedVehicle && <span className="mt-1 block text-xs font-normal text-slate-600">مالك العربية المختارة: {selectedVehicle.owner_name || 'غير مسجل'}</span>}
            <span className="mt-1 block text-xs font-normal text-slate-500">{filteredAvailableVehicles.length} عربية نشطة في الأسطول</span>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            تقدر تربط نفس العربية بأكتر من سواق نشط. النظام بيحتفظ بتاريخ كل ربط، وبيمنع تعارض النقلات الفعلية على نفس العربية.
          </div>
          <label className="text-sm font-bold text-slate-700">كود السواق (اختياري)<input value={driverCode} onChange={e => setDriverCode(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" placeholder="لو عنده كود بالفعل"/></label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button disabled={savingDriver} type="submit" className={`rounded-xl px-5 py-3 text-sm font-black text-white transition disabled:opacity-60 ${sectionPalette[active].action}`}>{savingDriver ? 'جاري حفظ البيانات وإنشاء الحساب...' : 'حفظ السواق وإنشاء الحساب'}</button><p className="text-xs leading-5 text-slate-500">رقم الموبايل هو اسم المستخدم، وكلمة المرور التي تحددها هنا هي كلمة الدخول. لا تُرسل رسائل أو إيميلات.</p></div>
        </form>}
      </section>}

      {passwordResetDriver && active === 'drivers' && <section className="rounded-3xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4"><h3 className="font-black">تعيين كلمة مرور جديدة</h3><p className="mt-1 text-sm text-slate-500">السائق: {passwordResetDriver.name ?? passwordResetDriver.driver_name ?? 'سائق'}. سيتم طلب تغيير كلمة المرور عند أول دخول.</p></div>
        <form onSubmit={resetDriverPassword} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">كلمة المرور الجديدة<input required type="password" autoComplete="new-password" minLength={8} value={newDriverPassword} onChange={e => setNewDriverPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"/></label>
          <label className="text-sm font-bold text-slate-700">تأكيد كلمة المرور<input required type="password" autoComplete="new-password" minLength={8} value={confirmDriverPassword} onChange={e => setConfirmDriverPassword(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"/></label>
          <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={resettingPassword} type="submit" className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{resettingPassword ? 'جاري تحديث كلمة المرور...' : 'تأكيد كلمة المرور الجديدة'}</button><button type="button" onClick={() => { setPasswordResetDriver(null); setNewDriverPassword(''); setConfirmDriverPassword(''); }} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">إلغاء</button></div>
        </form>
      </section>}

      {editingDriver && active === 'drivers' && <section className="rounded-3xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4"><h3 className="font-black">تعديل بيانات السائق</h3><p className="mt-1 text-sm text-slate-500">عدّل بياناته أو اربطه بأي عربية نشطة؛ العربية ممكن يكون عليها سواقين تانيين.</p></div>
        <form onSubmit={saveDriverEdit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">اسم السائق<input required value={driverEditName} onChange={e => setDriverEditName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"/></label>
          <label className="text-sm font-bold text-slate-700">رقم الموبايل<input required type="tel" disabled={Boolean(editingDriver.auth_user_id)} value={driverEditPhone} onChange={e => setDriverEditPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal disabled:bg-slate-100"/>{editingDriver.auth_user_id && <span className="mt-1 block text-xs font-normal text-slate-500">هذا الرقم هو اسم دخول السائق، لذلك تعديله يحتاج إجراءً منفصلًا للحساب.</span>}</label>
          <label className="text-sm font-bold text-slate-700">كود السائق (اختياري)<input value={driverEditCode} onChange={e => setDriverEditCode(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"/></label>
          <label className="text-sm font-bold text-slate-700">العربية المرتبطة<select value={driverEditVehicleId} onChange={e => setDriverEditVehicleId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"><option value="">اختار عربية نشطة</option>{driverEditVehicles.map(vehicle => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.plate_number} — المالك: {vehicle.owner_name || 'غير مسجل'}{Array.isArray(vehicle.assigned_drivers) && vehicle.assigned_drivers.length > 1 ? ` — ${vehicle.assigned_drivers.length} سواقين مرتبطين` : ''}</option>)}</select></label>
          <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={savingEdit || !driverEditOptionsLoaded} type="submit" className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60">{savingEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}</button><button type="button" onClick={() => setEditingDriver(null)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">إلغاء</button></div>
        </form>
      </section>}

      {editingOwner && active === 'owners' && <section className="rounded-3xl border border-teal-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4"><h3 className="font-black">تعديل بيانات مالك العربية</h3><p className="mt-1 text-sm text-slate-500">كود المالك ثابت، وتعديل الاسم أو الهاتف لا يغيّر ملكية العربيات المرتبطة به.</p></div>
        <form onSubmit={saveOwnerEdit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">اسم المالك *<input required maxLength={200} value={ownerEditName} onChange={e => setOwnerEditName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /></label>
          <label className="text-sm font-bold text-slate-700">رقم الموبايل<input type="tel" maxLength={40} value={ownerEditPhone} onChange={e => setOwnerEditPhone(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal" /></label>
          <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={savingEdit} type="submit" className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{savingEdit ? 'جاري الحفظ...' : 'حفظ بيانات المالك'}</button><button type="button" onClick={() => setEditingOwner(null)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">إلغاء</button></div>
        </form>
      </section>}

      {editingVehicle && active === 'vehicles' && <section className="rounded-3xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4"><h3 className="font-black">تعديل بيانات العربية</h3><p className="mt-1 text-sm text-slate-500">تعديل اللوحة والمالك المسجل فقط. كود العربية ثابت، ولا يمكن تعديلها أثناء نقلة نشطة.</p></div>
        <form onSubmit={saveVehicleEdit} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">رقم العربية / اللوحة<input required maxLength={40} value={vehicleEditPlate} onChange={e => setVehicleEditPlate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal"/></label>
          <label className="text-sm font-bold text-slate-700">كود العربية (ثابت)<input readOnly value={vehicleEditCode} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-normal text-slate-500"/></label>
          <label className="sm:col-span-2 text-sm font-bold text-slate-700">المالك المسجل والنشط
            <select required value={vehicleEditOwnerId} onChange={e => setVehicleEditOwnerId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal">
              <option value="">اختر المالك</option>
              {ownerDirectory.map(owner => <option key={owner.owner_id} value={owner.owner_id} disabled={!owner.is_active}>{owner.name}{!owner.is_active ? ' · غير نشط' : ''}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">لإضافة مالك جديد، استخدم تبويب «ملاك العربيات» أولًا.</span>
          </label>
          <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={savingEdit || ownerDirectory.filter(owner => owner.is_active !== false).length === 0} type="submit" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60">{savingEdit ? 'جاري الحفظ...' : 'حفظ التعديل'}</button><button type="button" onClick={() => setEditingVehicle(null)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">إلغاء</button></div>
        </form>
      </section>}

      {['factories', 'quarries'].includes(active) && <>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block flex-1 text-sm font-bold text-slate-700">البحث بالاسم أو الكود أو العنوان أو التليفون<input value={entitySearch} onChange={e => setEntitySearch(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" placeholder={active === 'factories' ? 'ابحث عن مصنع أو عميل...' : 'ابحث عن محجر أو مورد...'} /></label>
          <button type="button" onClick={() => beginMasterEntryEdit()} className={`rounded-xl px-4 py-3 text-sm font-black text-white ${sectionPalette[active].action}`}>إضافة {active === 'factories' ? 'مصنع / عميل' : 'محجر / مورد'}</button>
        </div>
        {showMasterForm && <form onSubmit={saveMasterEntry} className={`grid gap-3 rounded-3xl border bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-5 ${sectionPalette[active].border}`}>
          <div className="sm:col-span-2"><h3 className="font-black">{editingMasterEntry ? 'تعديل بيانات' : 'إضافة'} {active === 'factories' ? 'مصنع / عميل' : 'محجر / مورد'}</h3><p className="mt-1 text-xs text-slate-500">الحفظ يتم في Supabase بصلاحيات المكتب الرئيسي، مع التحقق من عدم تكرار الكود.</p></div>
          <label className="text-sm font-bold text-slate-700">الاسم *<input required maxLength={200} value={masterForm.name} onChange={e => setMasterForm(v => ({...v, name:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <label className="text-sm font-bold text-slate-700">الكود<input maxLength={80} value={masterForm.code} onChange={e => setMasterForm(v => ({...v, code:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <label className="text-sm font-bold text-slate-700">العنوان / المنطقة<input maxLength={300} value={masterForm.address} onChange={e => setMasterForm(v => ({...v, address:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <label className="text-sm font-bold text-slate-700">رقم التليفون<input type="tel" maxLength={40} value={masterForm.phone} onChange={e => setMasterForm(v => ({...v, phone:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={masterForm.is_active} onChange={e => setMasterForm(v => ({...v, is_active:e.target.checked}))} /> سجل نشط</label>
          <div className="sm:col-span-2 flex flex-wrap gap-3"><button disabled={savingMaster} type="submit" className={`rounded-xl px-5 py-3 text-sm font-black text-white disabled:opacity-60 ${sectionPalette[active].action}`}>{savingMaster ? 'جاري الحفظ...' : 'حفظ البيانات'}</button><button type="button" onClick={() => {setShowMasterForm(false);setEditingMasterEntry(null);}} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold">إلغاء</button></div>
        </form>}
      </>}
      {active === 'drivers' && <div className="rounded-2xl border border-slate-200 bg-white p-3"><label className="block text-sm font-bold text-slate-700">البحث عن سائق بالاسم<input value={driverSearch} onChange={e => setDriverSearch(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 font-normal" placeholder="اكتب اسم السائق..." /></label></div>}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className={`flex flex-wrap items-center justify-between gap-4 border-b p-4 sm:p-5 ${sectionPalette[active].border} ${sectionPalette[active].wash}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${sectionPalette[active].accent}`}><ActiveIcon size={25} strokeWidth={2.2}/></span>
            <div><h3 className="font-black">{tabs.find(tab => tab.key === active)?.label}</h3><p className="mt-1 text-xs text-slate-500">بيانات التشغيل الفعلية · محدثة من النظام</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{active === 'factories' && <button type="button" disabled={savingEdit} onClick={() => void addDirectoryEntity('factories')} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50"><Building2 size={15}/> إضافة عميل / مصنع</button>}{active === 'quarries' && <button type="button" disabled={savingEdit} onClick={() => void addDirectoryEntity('quarries')} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50"><Mountain size={15}/> إضافة محجر</button>}{active === 'owners' && <button type="button" disabled={savingEdit} onClick={() => void addVehicleOwner()} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-black text-white hover:bg-teal-700 disabled:opacity-50"><UserRound size={15}/> إضافة مالك</button>}<span className={`inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-black shadow-sm ring-1 ring-black/5 ${sectionPalette[active].accent}`}><ClipboardList size={15}/>{visibleRows.length} سجل</span></div>
        </div>
        <div className={active === 'waiting' ? 'divide-y divide-violet-100 overflow-x-auto' : active === 'drivers' ? 'min-w-0 divide-y divide-slate-100 overflow-x-hidden' : 'divide-y divide-slate-100'}>
          {visibleRows.map((row, index) => <article key={String(row.factory_id ?? row.quarry_id ?? row.driver_id ?? row.vehicle_id ?? row.entry_id ?? row.load_order_id ?? row.booking_id ?? row.actual_loading_record_id ?? index)} className={active === 'waiting' ? 'flex min-w-0 items-center gap-2 border-r-2 border-r-violet-400 px-2 py-1 transition-colors hover:bg-violet-50/60' : active === 'drivers' ? 'flex w-full min-w-0 flex-col items-stretch gap-2 overflow-hidden border-r-2 border-r-red-400 px-3 py-3 transition-colors hover:bg-red-50/50' : `border-r-4 p-4 transition-colors hover:bg-slate-50/70 sm:p-5 ${sectionPalette[active].row}`}>
            <div className={active === 'waiting' ? 'flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap text-xs leading-5' : active === 'drivers' ? 'flex w-full min-w-0 flex-col items-stretch gap-2' : 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3'}>
              {active === 'waiting' && <span className="w-5 shrink-0 text-center font-bold tabular-nums text-violet-700">{index + 1}</span>}
              <div className={active === 'waiting' ? 'flex min-w-0 flex-1 items-center gap-2' : active === 'drivers' ? 'flex w-full min-w-0 flex-1 items-start gap-2' : 'flex min-w-0 flex-1 items-start gap-3'}>
                {active !== 'waiting' && <span className={`flex ${active === 'drivers' ? 'h-5 w-5 rounded-md' : 'h-7 w-7 rounded-lg'} shrink-0 items-center justify-center ${sectionPalette[active].wash} ${sectionPalette[active].accent}`}><ActiveIcon size={active === 'drivers' ? 12 : 18} strokeWidth={2.1}/></span>}
                <div className={active === 'waiting' ? 'flex min-w-0 flex-1 items-center gap-x-2 whitespace-nowrap' : active === 'drivers' ? 'flex min-w-0 flex-1 flex-col items-start gap-0.5' : 'min-w-0 flex-1'}><h4 className={active === 'waiting' ? 'shrink-0 font-semibold text-xs leading-5' : active === 'drivers' ? 'block w-full min-w-0 whitespace-normal break-words text-base font-bold leading-6' : 'font-black leading-6 [overflow-wrap:anywhere]'}>{active === 'waiting' ? `${row.plate_number || 'عربية غير محددة'} · ${row.driver_name || 'سائق غير محدد'} · ${row.arrived_at ? new Date(row.arrived_at).toLocaleDateString('ar-EG') : '—'}` : rowTitle(row, active)}</h4>{active === 'waiting' && row.driver_phone && <a href={`tel:${String(row.driver_phone).replace(/[^+\d]/g, '')}`} onClick={event => event.stopPropagation()} aria-label={`اتصال بالسائق ${row.driver_name || ''}`} title={String(row.driver_phone)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"><Phone size={13}/></a>}{active !== 'waiting' && active !== 'drivers' && <p className="mt-1 break-words text-sm leading-6 text-slate-500">{rowDetails(active === 'vehicles' ? { ...row, owner_name: ownerDirectory.find(owner => String(owner.owner_id) === String(row.owner_id))?.name } : row, active) || 'لا توجد تفاصيل إضافية في السجل الحالي.'}</p>}{active === 'drivers' && <div className="flex min-w-0 flex-wrap items-center gap-1.5">{row.phone && <a href={`tel:${String(row.phone).replace(/[^+\\d]/g, '')}`} onClick={event => event.stopPropagation()} title={`اتصال ${row.phone}`} className="inline-flex h-6 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[11px] font-bold text-emerald-800"><Phone size={12}/>{row.phone}</a>}<span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-1 text-[11px] font-semibold text-slate-700">العربية {row.vehicle_id ? snapshot?.vehicles?.find((vehicle: Row) => String(vehicle.vehicle_id) === String(row.vehicle_id))?.plate_number ?? '—' : '—'}</span><span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold ${row.is_active === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${row.is_active === false ? 'bg-red-500' : 'bg-emerald-500'}`}/>{row.is_active === false ? 'متوقف' : 'نشط'}</span></div>}</div>
              </div>
              <div className={active === 'waiting' ? 'flex shrink-0 items-center gap-1 whitespace-nowrap' : active === 'drivers' ? 'flex w-full min-w-0 flex-wrap items-center justify-start gap-2 border-t border-red-100 pt-2' : 'flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0'}>{['factories', 'quarries'].includes(active) && <button type="button" onClick={() => beginMasterEntryEdit(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700"><Pencil size={14}/> تعديل</button>}{active === 'waiting' && row.status === 'WAITING' && <details className="relative shrink-0"><summary aria-label={`خيارات العربية ${row.plate_number || ''}`} title="خيارات العربية" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-violet-300 hover:bg-violet-50 [&::-webkit-details-marker]:hidden"><MoreHorizontal size={18}/></summary><div className="absolute left-0 top-full z-50 mt-1 min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button type="button" disabled={savingEdit} onClick={() => void removeWaitingEntry(row)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><UserMinus size={14}/> إزالة من الانتظار</button></div></details>}{active === 'vehicles' && <button type="button" disabled={savingEdit} onClick={async () => {
                const label = String(row.plate_number ?? 'العربية');
                if (row.is_active === false) {
                  if (!window.confirm('تأكيد إعادة تفعيل ' + label + '؟')) return;
                } else if (!window.confirm('تأكيد إيقاف ' + label + '؟ لن تُقبل عليها إسنادات جديدة، ولن يتم الإيقاف لو عليها نقلة نشطة.')) return;
                setError(''); setSuccess(''); setSavingEdit(true);
                try {
                  const { data, error: rpcError } = await supabase.rpc('main_office_set_directory_active', {
                    p_entity_type: 'VEHICLE', p_entity_id: row.vehicle_id, p_is_active: row.is_active === false,
                  });
                  if (rpcError) throw rpcError;
                  if (!data?.id) throw new Error('تعذر تأكيد حالة العربية.');
                  setSuccess(row.is_active === false ? 'تم تفعيل العربية.' : 'تم إيقاف العربية مع الاحتفاظ بسجلاتها.');
                  await load();
                } catch (e: any) {
                  const raw = String(e?.message || '');
                  const messages: Record<string,string> = {
                    VEHICLE_HAS_ACTIVE_BOOKING: 'لا يمكن إيقاف العربية لأن عليها نقلة نشطة.',
                    VEHICLE_HAS_ACTIVE_DRIVER: 'لا يمكن إيقاف العربية وهي مرتبطة بسائق نشط. أوقف السائق أولًا أو غيّر العربية المرتبطة به.',
                    ENTITY_NOT_FOUND: 'العربية غير موجودة.',
                    MAIN_OFFICE_ACCESS_REQUIRED: 'تغيير حالة العربية متاح للمكتب الرئيسي فقط.',
                  };
                  const key = Object.keys(messages).find(code => raw.includes(code));
                  setError(Object.entries(messages).find(([code]) => raw.includes(code))?.[1] ?? (raw || 'تعذر تغيير حالة العربية.'));
                } finally { setSavingEdit(false); }
              }} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${row.is_active === false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{row.is_active === false ? 'تفعيل العربية' : 'إيقاف العربية'}</button>}{(['factories', 'quarries'].includes(active)) && <button type="button" disabled={savingEdit} onClick={() => void setMasterDirectoryActive(row)} aria-label={row.is_active === false ? 'تفعيل السجل' : 'إيقاف السجل'} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${row.is_active === false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{row.is_active === false ? 'تفعيل' : 'إيقاف'}</button>}{active === 'owners' && <button type="button" disabled={savingEdit} onClick={() => beginOwnerEdit(row)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700"><Pencil size={10}/> تعديل</button>}{active === 'owners' && <button type="button" disabled={savingEdit} onClick={() => void setOwnerActive(row)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 ${row.is_active === false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{row.is_active === false ? 'تفعيل المالك' : 'إيقاف المالك'}</button>}{active === 'drivers' && row.is_active !== false && row.auth_user_id && <button type="button" onClick={() => { setPasswordResetDriver(row); setNewDriverPassword(''); setConfirmDriverPassword(''); setEditingDriver(null); setError(''); setSuccess(''); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800">كلمة المرور</button>}{active === "drivers" && row.is_active !== false && <button type="button" disabled={savingEdit} onClick={() => void deactivateDriver(row)} aria-label="إيقاف السائق" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50"><UserX size={10}/> إيقاف</button>}{(active === 'drivers' || active === 'vehicles') && <button type="button" onClick={() => active === 'drivers' ? void beginDriverEdit(row) : beginVehicleEdit(row)} aria-label={active === 'drivers' ? 'تعديل بيانات السائق' : 'تعديل بيانات العربية'} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"><Pencil size={10}/> تعديل</button>}
              {['factories', 'quarries', 'drivers', 'vehicles'].includes(active) && <button type="button" disabled={savingEdit} onClick={() => void cancelDirectoryEntity(active === 'factories' ? 'FACTORY' : active === 'quarries' ? 'QUARRY' : active === 'drivers' ? 'DRIVER' : 'VEHICLE', row)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-800 disabled:opacity-50">إلغاء نهائي</button>}
              {active === 'actual' && row.booking_id && !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(String(snapshot?.bookings?.find((b: Row) => String(b.booking_id) === String(row.booking_id))?.status ?? row.status ?? '').toUpperCase()) && !row.delivery_confirmed_at && row.actual_weight == null && <button type="button" disabled={savingEdit} onClick={() => void cancelTrip(row)} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50">إلغاء النقلة</button>}
              {active === 'actual' && row.booking_id && !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(String(snapshot?.bookings?.find((b: Row) => String(b.booking_id) === String(row.booking_id))?.status ?? row.status ?? '').toUpperCase()) && !row.delivery_confirmed_at && row.actual_weight == null && <button type="button" disabled={savingEdit} onClick={() => void redirectTrip(row)} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 disabled:opacity-50">إعادة توجيه</button>}{active !== 'waiting' && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">#{index + 1}</span>}</div></div>
          </article>)}
          {!loading && rows.length === 0 && <div className="p-10 text-center text-sm leading-6 text-slate-500">لا توجد سجلات في هذا القسم حاليًا. لن نعرض بيانات تجريبية بدل البيانات الحقيقية.</div>}
          {loading && <div className="p-8 text-center text-sm text-slate-500">جاري تحميل بيانات المكتب...</div>}
        </div>
      </div>
    </section>
  );
};
