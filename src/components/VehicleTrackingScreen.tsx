import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, RefreshCw, Truck, Clock3, AlertTriangle, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type VehicleLocation = {
  driver_id: string;
  driver_name: string;
  vehicle_id: string;
  plate_number: string;
  vehicle_code?: string | null;
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  speed_kmh?: number | null;
  heading?: number | null;
  captured_at: string;
  updated_at: string;
  is_stale: boolean;
};

function timeLabel(value?: string) {
  if (!value) return 'غير معروف';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير معروف';
  return date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' });
}

export const VehicleTrackingScreen: React.FC = () => {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const [locations, setLocations] = useState<VehicleLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');

  const loadLocations = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_vehicle_live_locations');
      if (rpcError) throw rpcError;
      const parsed = Array.isArray(data) ? data : [];
      setLocations(parsed.filter((item: any) =>
        Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
      ) as VehicleLocation[]);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل مواقع السيارات. تأكد من تطبيق ترحيل تتبع السيارات في Supabase.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
    const timer = window.setInterval(() => void loadLocations(), 60000);
    return () => window.clearInterval(timer);
  }, [loadLocations]);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    const map = L.map(mapElement.current, { zoomControl: true, preferCanvas: true }).setView([29.59, 32.72], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const invalidate = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(invalidate);
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  const visibleLocations = locations.filter(location => {
    const query = vehicleSearch.trim().toLocaleLowerCase('ar-EG');
    return !query || [location.plate_number, location.vehicle_code, location.driver_name].some(value => String(value ?? '').toLocaleLowerCase('ar-EG').includes(query));
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activeIds = new Set(visibleLocations.map(location => location.driver_id));
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      if (!activeIds.has(id)) {
        marker.remove();
        delete markersRef.current[id];
      }
    });
    visibleLocations.forEach(location => {
      const position: L.LatLngExpression = [location.latitude, location.longitude];
      const markerIcon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:${location.is_stale ? '#b45309' : '#1d4ed8'};color:#fff;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 7px #0f172a55;font:16px system-ui">🚚</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const popup = `<div dir="rtl" style="font-family:system-ui;min-width:160px"><strong>${String(location.plate_number ?? '')}</strong><br/>${String(location.driver_name ?? 'سائق غير محدد')}<br/>آخر تحديث: ${timeLabel(location.updated_at)}<br/>${location.is_stale ? '⚠️ الموقع قديم' : '🟢 موقع حديث'}${location.speed_kmh != null ? '<br/>السرعة: ' + Math.round(location.speed_kmh) + ' كم/س' : ''}</div>`;
      const existing = markersRef.current[location.driver_id];
      if (existing) {
        existing.setLatLng(position).setIcon(markerIcon).bindPopup(popup);
      } else {
        markersRef.current[location.driver_id] = L.marker(position, { icon: markerIcon }).addTo(map).bindPopup(popup);
      }
    });
    const points: L.LatLngExpression[] = visibleLocations.map(x => [x.latitude, x.longitude] as L.LatLngExpression);
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 13 });
  }, [visibleLocations]);

  const recentCount = locations.filter(location => !location.is_stale).length;

  return (
    <section className="space-y-2.5 text-sm">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
        <div>
          <div className="flex items-center gap-2"><MapPin className="text-blue-700" size={18}/><h2 className="text-base font-black">تتبع السيارات على الخريطة</h2></div>
          <p className="mt-1 text-xs leading-5 text-slate-500">تُحدَّث الخريطة كل 60 ثانية، بالتزامن مع دورة إرسال موقع السائق. الموقع القديم يظهر بوضوح ولا يُعرض على أنه مباشر.</p>
        </div>
        <button onClick={() => void loadLocations(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-60">
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''}/>{refreshing ? 'جاري التحديث' : 'تحديث المواقع'}
        </button>
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><div><strong>تعذر تحميل التتبع.</strong><p className="mt-1 break-words">{error}</p><p className="mt-1">تأكد من تطبيق ملف الترحيل الجديد في Supabase وربط حساب السائق بسجل السائق والعربية.</p></div></div>}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5"><Truck className="text-blue-700" size={16}/><div className="mt-1 text-lg font-black">{locations.length}</div><div className="text-[11px] leading-4 text-slate-500">سيارات لها موقع محفوظ</div></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><MapPin className="text-emerald-600" size={20}/><div className="mt-2 text-2xl font-black">{recentCount}</div><div className="text-[11px] leading-4 text-slate-500">موقع حديث (أقل من 10 دقائق)</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5"><Clock3 className="text-amber-600" size={20}/><div className="mt-1 text-xs font-bold">{loading ? 'جاري التحميل...' : 'تحديث تلقائي كل 60 ثانية'}</div><div className="text-xs text-slate-500">الموقع يحتاج إذن السائق</div></div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-2"><label className="flex items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-2"><Search size={18} className="text-slate-500"/><input value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="ابحث برقم اللوحة أو اسم السائق" aria-label="البحث عن عربية على الخريطة"/>{vehicleSearch && <button type="button" onClick={() => setVehicleSearch('')} aria-label="مسح البحث"><X size={17}/></button>}</label><p className="mt-2 text-xs text-slate-500">العربيات الظاهرة: {visibleLocations.length} من {locations.length}</p></div>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div ref={mapElement} className="h-[38vh] min-h-[230px] max-h-[430px] w-full" aria-label="خريطة مواقع السيارات"/>
        {!loading && visibleLocations.length === 0 && !error && <div className="border-t border-slate-200 p-5 text-center text-sm leading-6 text-slate-500">{vehicleSearch.trim() ? 'مفيش عربية مطابقة للبحث ضمن العربيات اللي لها موقع مسجل.' : 'لا توجد مواقع سيارات مسجلة حتى الآن. عند تسجيل دخول سائق مع تفعيل إذن الموقع وربط حسابه بعربية، سيظهر موقعه هنا.'}</div>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-black">قائمة السيارات</h3>
        <div className="mt-1 divide-y divide-slate-100">
          {visibleLocations.map(location => (
            <button key={location.driver_id} type="button" onClick={() => {
              mapRef.current?.setView([location.latitude, location.longitude], 15);
              markersRef.current[location.driver_id]?.openPopup();
            }} className="flex w-full items-center justify-between gap-2 py-2 text-right">
              <div className="min-w-0"><div className="text-sm font-bold">{location.plate_number} · {location.driver_name}</div><div className="mt-0.5 text-[11px] text-slate-500">آخر تحديث: {timeLabel(location.updated_at)}{location.accuracy_m != null ? ` · دقة ±${Math.round(location.accuracy_m)} م` : ''}</div></div>
              <span className={location.is_stale ? 'shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700' : 'shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700'}>{location.is_stale ? 'موقع قديم' : 'حديث'}</span>
            </button>
          ))}
          {!visibleLocations.length && <p className="py-4 text-sm text-slate-500">{vehicleSearch.trim() ? 'لا توجد نتيجة مطابقة.' : 'لا توجد سيارات لعرضها بعد.'}</p>}
        </div>
      </div>
    </section>
  );
};
