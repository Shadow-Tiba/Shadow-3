import React, { useEffect, useState } from 'react';
import { MapPin, Truck, Clock3, ShieldCheck, LogOut, Navigation, CircleAlert, FileText } from 'lucide-react';
import { supabase, supabaseDiagnostics } from '../lib/supabase';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { Geolocation } from '@capacitor/geolocation';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

type NativeDriverTrackingPlugin = {
  start(options: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    projectUrl: string;
    publishableKey: string;
    expiresAt: number;
  }): Promise<{ started: boolean }>;
  stop(): Promise<void>;
};
const NativeDriverTracking = registerPlugin<NativeDriverTrackingPlugin>('NativeDriverTracking');


// Battery-efficient live-location prototype. Keep office/business workflows unchanged.
const LOCATION_DISTANCE_FILTER_METERS = 15;
// Keep uploads comfortably inside the server's 10-minute freshness window.
const MOVING_LOCATION_UPLOAD_INTERVAL_MS = 2 * 60_000;
const SLOW_LOCATION_UPLOAD_INTERVAL_MS = 5 * 60_000;
const STATIONARY_LOCATION_UPLOAD_INTERVAL_MS = 8 * 60_000;
const STATIONARY_SPEED_THRESHOLD_MPS = 0.5;
const MAX_LOCATION_UPLOAD_ACCURACY_METERS = 100;

type PositionState = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
};

const factoryGlyph = (name: string) => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('إيكوبات') || normalized.includes('ايكوبات') || normalized.includes('ecopat') || normalized.includes('ecobat')) return 'E';
  if (normalized.includes('مايوف') || normalized.includes('mayof')) return 'M';
  if (normalized.includes('الدولية') || normalized.includes('الدوليه')) return 'D';
  return [...name.trim()][0]?.toUpperCase() || 'م';
};

const quarryColor = (quarryId: string | null | undefined, quarryName: string | null | undefined) => {
  const palette = [
    { background: '#27864A', foreground: '#FFFFFF', border: '#176638' },
    { background: '#D97706', foreground: '#FFFFFF', border: '#A65308' },
    { background: '#2874C8', foreground: '#FFFFFF', border: '#1E5594' },
    { background: '#7C4DAD', foreground: '#FFFFFF', border: '#5D3786' },
    { background: '#C2415D', foreground: '#FFFFFF', border: '#923047' },
    { background: '#0F8A8D', foreground: '#FFFFFF', border: '#0B6567' },
  ];
  const key = quarryId || quarryName || 'unknown-quarry';
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return palette[hash % palette.length];
};

const parseDeliveryWeight = (tonsText: string, kilogramsText: string) => {
  const normalizedTons = tonsText.trim();
  const normalizedKilograms = kilogramsText.trim() || '0';
  if (!/^\d+$/.test(normalizedTons) || !/^\d{1,3}$/.test(normalizedKilograms)) return { valid: false, totalTons: 0 };
  const tons = Number(normalizedTons);
  const kilograms = Number(normalizedKilograms);
  const totalTons = tons + kilograms / 1000;
  return { valid: tons <= 1000 && kilograms <= 999 && totalTons > 0 && totalTons <= 1000, totalTons };
};

export const DriverApp: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [driverAuthorized, setDriverAuthorized] = useState(false);
  const [error, setError] = useState(supabaseDiagnostics.configurationError);
  const [position, setPosition] = useState<PositionState | null>(null);
  const [locating, setLocating] = useState(false);
  const [portal, setPortal] = useState<any>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [pendingDirectAssignments, setPendingDirectAssignments] = useState<any[]>([]);
  const [acceptingBookingId, setAcceptingBookingId] = useState<string | null>(null);
  const [acceptanceMessage, setAcceptanceMessage] = useState('');
  const [dispatchState, setDispatchState] = useState<any>(null);
  const [selectingLoadOrderId, setSelectingLoadOrderId] = useState<string | null>(null);
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [deliveryBusyBookingId, setDeliveryBusyBookingId] = useState<string | null>(null);
  const [deliveryWeightTons, setDeliveryWeightTons] = useState<Record<string, string>>({});
  const [deliveryWeightKilograms, setDeliveryWeightKilograms] = useState<Record<string, string>>({});
  const [deliveryScaleImages, setDeliveryScaleImages] = useState<Record<string, File | null>>({});

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | undefined;

    async function initialize() {
      if (supabaseDiagnostics.configurationError) {
        setLoading(false);
        return;
      }
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        setSession(data.session);
        const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
          if (active) setSession(next);
        });
        subscription = listener.subscription;
      } catch (e: any) {
        if (active) setError(e?.message || 'تعذر الاتصال بخدمة الدخول.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function refreshPendingDirectAssignments() {
    const { data, error: pendingError } = await supabase.rpc('driver_get_pending_assignments');
    if (pendingError) {
      setError(pendingError.message || 'تعذر تحميل أوامر الإسناد المباشر.');
      return;
    }
    setPendingDirectAssignments(Array.isArray(data) ? data : []);
  }

  async function refreshDispatchState() {
    const { data, error: dispatchError } = await supabase.rpc('driver_get_dispatch_state');
    if (dispatchError) {
      setError(dispatchError.message || 'تعذر تحميل حالة قائمة الانتظار والتوزيع.');
      return;
    }
    setDispatchState(data);
  }

  async function refreshPortal() {
    if (!session) return;
    setPortalLoading(true);
    const { data, error: portalError } = await supabase.rpc('driver_get_portal_snapshot');
    if (portalError) {
      setError(portalError.message || 'تعذر تحميل حالة التشغيل.');
    } else {
      setPortal(data);
      await refreshPendingDirectAssignments();
      await refreshDispatchState();
    }
    setPortalLoading(false);
  }

  async function selectLoad(loadOrderId: string) {
    if (selectingLoadOrderId) return;
    setSelectingLoadOrderId(loadOrderId);
    setDispatchMessage('');
    setError('');
    try {
      const { data, error: selectionError } = await supabase.rpc('driver_select_load', { p_load_order_id: loadOrderId });
      if (selectionError) throw selectionError;
      if (!data?.choice_id || data?.status !== 'CHOSEN' || !data?.selection_ends_at) throw new Error('لم يؤكد النظام تسجيل اختيارك.');
      setDispatchMessage('تم تسجيل اختيارك. ده مش تخصيص نهائي؛ التوزيع هيتم بعد انتهاء نافذة الخمس دقائق حسب أقدم وقت دخول لقائمة الانتظار.');
      await refreshDispatchState();
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (raw.includes('DRIVER_NOT_IN_WAITING_QUEUE')) setError('سجّل وصولك لقائمة الانتظار أولًا من زر «أنا وصلت».');
      else if (raw.includes('SELECTION_WINDOW_CLOSED')) setError('نافذة الاختيار انتهت. استنى نافذة التوزيع التالية.');
      else if (raw.includes('OUTSIDE_RAS_SEDR_GEOFENCE')) setError('لازم تكون داخل نطاق 10 كم من مكتب رأس سدر.');
      else if (raw.includes('LOCATION_STALE_OR_INACCURATE')) setError('موقع GPS قديم أو دقته غير كافية. حدّث موقعك وحاول تاني.');
      else if (raw.includes('DRIVER_HAS_ACTIVE_BOOKING') || raw.includes('VEHICLE_HAS_ACTIVE_BOOKING')) setError('السائق أو العربية عليه نقلة نشطة بالفعل.');
      else if (raw.includes('LOAD_ORDER_FULL')) setError('الحمولة اكتمل عدد نقلاتها المتاحة. اختار طلبًا آخر قبل انتهاء النافذة.');
      else setError(raw || 'تعذر تسجيل اختيار النقلة.');
    } finally {
      setSelectingLoadOrderId(null);
    }
  }

  async function confirmDelivery(bookingId: string) {
    if (deliveryBusyBookingId) return;
    const parsedWeight = parseDeliveryWeight(deliveryWeightTons[bookingId] ?? '', deliveryWeightKilograms[bookingId] ?? '');
    const actualWeight = parsedWeight.totalTons;
    if (!parsedWeight.valid) {
      setError('اكتب وزنًا صحيحًا: عدد الأطنان، ثم الكيلوجرامات من 0 إلى 999. لازم يكون الوزن أكبر من صفر ومجموعه لا يتجاوز 1000 طن.');
      return;
    }
    setDeliveryBusyBookingId(bookingId);
    setError('');
    let uploadedImagePath: string | null = null;
    try {
      const image = deliveryScaleImages[bookingId] ?? null;
      if (image) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
          throw new Error('صورة الميزان لازم تكون JPG أو PNG أو WEBP.');
        }
        if (image.size > 10 * 1024 * 1024) {
          throw new Error('حجم صورة الميزان لازم يكون 10 ميجابايت أو أقل.');
        }
        const extension = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg';
        uploadedImagePath = `${bookingId}/${Date.now()}.${extension}`;
        const { data: authData, error: authError } = await supabase.auth.getSession();
        const accessToken = authData.session?.access_token;
        const projectUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
        const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
        if (authError || !accessToken || !projectUrl || !publishableKey) {
          throw new Error('انتهت جلسة الدخول أو إعدادات رفع صورة الميزان غير مكتملة. احذف الصورة لو حابب تكمل من غيرها.');
        }
        const uploadResponse = await fetch(`${projectUrl}/storage/v1/object/scale-tickets/${uploadedImagePath}`, {
          method: 'POST',
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': image.type,
            'x-upsert': 'false',
          },
          body: image,
        });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text();
          throw new Error(`تعذر رفع صورة الميزان: ${detail || uploadResponse.statusText}`);
        }
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      const { latitude, longitude, accuracy } = position.coords;
      const { data, error: deliveryError } = await supabase.rpc('driver_confirm_delivery', {
        p_booking_id: bookingId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_m: accuracy,
        p_captured_at: new Date(position.timestamp).toISOString(),
        p_actual_weight: actualWeight,
        p_scale_image_path: uploadedImagePath,
        p_notes: null,
      });
      if (deliveryError) throw deliveryError;
      if (!data?.confirmed) throw new Error('لم يؤكد النظام تسجيل الوزن والتسليم.');
      setDeliveryWeightTons(current => ({ ...current, [bookingId]: '' }));
      setDeliveryWeightKilograms(current => ({ ...current, [bookingId]: '' }));
      setDeliveryScaleImages(current => ({ ...current, [bookingId]: null }));
      await refreshPortal();
      setError(`تم تسجيل التسليم والوزن الفعلي ${Number(data.actual_weight ?? actualWeight).toLocaleString('en-US', { maximumFractionDigits: 3 })} طن بنجاح. المكتب الرئيسي هيعتمد الحالة النهائية.`);
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (raw.includes('LOCATION_ACCURACY_TOO_LOW')) setError('دقة GPS أقل من المطلوب. جرّب في مكان مفتوح وحدّث الموقع.');
      else if (raw.includes('LOCATION_TIMESTAMP_STALE_OR_INVALID')) setError('قراءة GPS قديمة. حاول تاني مع تحديث الموقع.');
      else if (raw.includes('BOOKING_NOT_IN_TRANSIT')) setError('تأكيد التسليم متاح بعد ما حالة النقلة تبقى في الطريق.');
      else if (raw.includes('BOOKING_NOT_YOURS')) setError('النقلة دي مش مرتبطة بحسابك.');
      else if (raw.includes('POSITIVE_ACTUAL_WEIGHT_REQUIRED')) setError('اكتب وزنًا فعليًا أكبر من صفر قبل التأكيد.');
      else if (raw.includes('ACTUAL_WEIGHT_ALREADY_RECORDED')) setError('تم تسجيل وزن مختلف للنقلة دي بالفعل. راجع المكتب قبل تغيير الوزن.');
      else setError(raw || 'تعذر تأكيد التسليم. فعّل GPS وحاول تاني.');
      if (uploadedImagePath) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          const accessToken = authData.session?.access_token;
          const projectUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
          const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
          if (accessToken && projectUrl && publishableKey) {
            const cleanupResponse = await fetch(`${projectUrl}/storage/v1/object/scale-tickets/${uploadedImagePath}`, {
              method: 'DELETE',
              headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
            });
            if (!cleanupResponse.ok) console.warn('Optional scale image cleanup failed after delivery confirmation error.', cleanupResponse.status);
          }
        } catch (cleanupError) {
          console.warn('Optional scale image cleanup failed after delivery confirmation error.', cleanupError);
        }
      }
    } finally {
      setDeliveryBusyBookingId(null);
    }
  }

  async function acceptDirectAssignment(bookingId: string) {
    if (acceptingBookingId) return;
    setAcceptingBookingId(bookingId);
    setAcceptanceMessage('');
    setError('');
    try {
      const { data, error: acceptanceError } = await supabase.rpc('accept_direct_assignment', {
        p_booking_id: bookingId,
      });
      if (acceptanceError) throw acceptanceError;
      if (!data?.accepted || data?.acceptance_status !== 'ACCEPTED' || !data?.accepted_at) {
        throw new Error('لم يؤكد النظام تسجيل قبول التخصيص ووقته.');
      }
      setAcceptanceMessage(`تم قبول التخصيص بنجاح. كود النقلة: ${data.trip_code || '—'} · وقت القبول: ${new Date(data.accepted_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}.`);
      await refreshPortal();
    } catch (e: any) {
      const raw = String(e?.message || '');
      if (raw.includes('BOOKING_NOT_YOURS')) setError('التخصيص ده مش مرتبط بحسابك.');
      else if (raw.includes('DIRECT_ASSIGNMENT_NOT_PENDING')) setError('التخصيص لم يعد في انتظار القبول. حدّث القائمة.');
      else if (raw.includes('NOT_A_DIRECT_ASSIGNMENT')) setError('الطلب ده مش تخصيص مباشر.');
      else if (raw.includes('BOOKING_NOT_FOUND')) setError('التخصيص غير موجود.');
      else setError(raw || 'تعذر قبول التخصيص. حاول تحديث القائمة.');
    } finally {
      setAcceptingBookingId(null);
    }
  }

  useEffect(() => {
    if (!session) {
      setDriverAuthorized(false);
      return;
    }
    let active = true;
    setDriverAuthorized(false);
    void (async () => {
      const { data, error: portalError } = await supabase.rpc('driver_get_portal_snapshot');
      if (!active) return;
      if (portalError || !data?.driver_id) {
        setError('هذا الحساب غير مرتبط بسائق نشط في النظام.');
        await supabase.auth.signOut();
        if (active) setSession(null);
        return;
      }
      setPortal(data);
      const { data: pendingData } = await supabase.rpc('driver_get_pending_assignments');
      if (active) setPendingDirectAssignments(Array.isArray(pendingData) ? pendingData : []);
      const { data: dispatchData } = await supabase.rpc('driver_get_dispatch_state');
      if (active) setDispatchState(dispatchData);
      setError('');
      setDriverAuthorized(true);
    })();
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session || !driverAuthorized) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const { data, error: portalError } = await supabase.rpc('driver_get_portal_snapshot');
        if (portalError) return;
        setPortal(data);
        const { data: pendingData } = await supabase.rpc('driver_get_pending_assignments');
        setPendingDirectAssignments(Array.isArray(pendingData) ? pendingData : []);
        const { data: dispatchData } = await supabase.rpc('driver_get_dispatch_state');
        setDispatchState(dispatchData);
      })();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [session?.user?.id, driverAuthorized]);

  useEffect(() => {
    if (!session || !driverAuthorized) return;
    let active = true;
    let watcherId: string | undefined;
    // Throttle successful uploads, not failed attempts. Retry failures after 60s.
    let lastSentAt = 0;
    let lastAttemptAt = 0;
    let lastUploadFailed = false;
    let nativeServiceStarted = false;
    let nativeStartPending = false;

    // Android: start the native foreground service as soon as the permission watcher
    // is initialized. Do not wait for its first GPS callback; that can delay or prevent
    // the native service from starting and creates a circular startup dependency.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      void (async () => {
        try {
          watcherId = await BackgroundGeolocation.addWatcher({
            backgroundMessage: 'مشاركة موقعك مع طيبة مفعّلة أثناء العمل. أوقف التتبع بتسجيل الخروج.',
            backgroundTitle: 'Tiba Supplies — تتبع موقع السائق',
            requestPermissions: true,
            stale: false,
            distanceFilter: LOCATION_DISTANCE_FILTER_METERS,
          }, (location, watcherError) => {
            if (!active) return;
            if (watcherError) {
              setError(watcherError.message || 'تعذر طلب أذونات تتبع الموقع.');
              return;
            }
            if (location) {
              setPosition({
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                capturedAt: new Date(location.time ?? Date.now()).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
              });
            }
          });

          if (!active) {
            if (watcherId) await BackgroundGeolocation.removeWatcher({ id: watcherId });
            return;
          }
          if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
            setError('إعدادات الاتصال الآمن بقاعدة البيانات غير مكتملة.');
            return;
          }

          // Start without depending on a successful first location callback.
          const result = await NativeDriverTracking.start({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            userId: session.user.id,
            projectUrl: String(import.meta.env.VITE_SUPABASE_URL || ''),
            publishableKey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''),
            expiresAt: (session.expires_at || 0) * 1000,
          });
          nativeServiceStarted = result.started;
          if (!active && nativeServiceStarted) {
            await NativeDriverTracking.stop();
            nativeServiceStarted = false;
            return;
          }
          if (!result.started) setError('لم تؤكد خدمة أندرويد بدء التتبع.');
          else setError('');
        } catch (trackingError: any) {
          if (active) setError(trackingError?.message || 'تعذر تشغيل خدمة تتبع الموقع في الخلفية.');
        }
      })();

      return () => {
        active = false;
        if (watcherId) void BackgroundGeolocation.removeWatcher({ id: watcherId });
        if (nativeServiceStarted) void NativeDriverTracking.stop();
      };
    }

    void (async () => {
      try {
        watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'مشاركة موقعك مع طيبة مفعّلة أثناء العمل. أوقف التتبع بتسجيل الخروج.',
            backgroundTitle: 'Tiba Supplies — تتبع موقع السائق',
            requestPermissions: true,
            stale: false,
            distanceFilter: LOCATION_DISTANCE_FILTER_METERS,
          },
          async (location, watcherError) => {
            if (!active) return;
            if (watcherError) {
              setError(watcherError.message || 'تعذر تشغيل تتبع الموقع في الخلفية.');
              return;
            }
            if (!location) return;

            const locationTimestamp = location.time ?? Date.now();
            const capturedAt = new Date(locationTimestamp).toISOString();
            setPosition({
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              capturedAt: new Date(locationTimestamp).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
            });

            // Ignore poor GPS fixes and reduce uploads while stopped or moving slowly.
            if (location.accuracy > MAX_LOCATION_UPLOAD_ACCURACY_METERS) return;
            const speedMps = location.speed ?? 0;
            const minUploadInterval = speedMps >= 2
              ? MOVING_LOCATION_UPLOAD_INTERVAL_MS
              : speedMps >= STATIONARY_SPEED_THRESHOLD_MPS
                ? SLOW_LOCATION_UPLOAD_INTERVAL_MS
                : STATIONARY_LOCATION_UPLOAD_INTERVAL_MS;
            const now = Date.now();
            if (!lastUploadFailed && now - lastSentAt < minUploadInterval) return;
            if (lastUploadFailed && now - lastAttemptAt < 60_000) return;
            lastAttemptAt = now;
            const locationPayload = {
              p_latitude: location.latitude,
              p_longitude: location.longitude,
              p_accuracy_m: location.accuracy,
              p_captured_at: capturedAt,
            };

            // Refresh the session for each upload; a captured access token can expire
            // during a long-running background work session.
            let locationError: { message?: string } | null = null;
            try {
              let { data: authData, error: authError } = await supabase.auth.getSession();
              // Background callbacks can resume after the normal foreground token-refresh
              // timer has been suspended. Refresh proactively if the access token is near expiry.
              if (!authError && authData.session && (authData.session.expires_at ?? 0) * 1000 <= Date.now() + 120_000) {
                const refreshed = await supabase.auth.refreshSession();
                authData = refreshed.data;
                authError = refreshed.error;
              }
              const accessToken = authData.session?.access_token;
              if (authError || !accessToken) {
                locationError = { message: authError?.message || 'انتهت جلسة السائق؛ افتح التطبيق وسجّل الدخول من جديد.' };
              } else if (Capacitor.isNativePlatform() && import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
                // Native HTTP avoids WebView throttling with the screen off.
                const response = await CapacitorHttp.post({
                  url: `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '')}/rest/v1/rpc/driver_update_live_location`,
                  headers: {
                    apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  data: locationPayload,
                  connectTimeout: 15000,
                  readTimeout: 15000,
                });
                if (response.status < 200 || response.status >= 300) {
                  const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                  locationError = { message: `HTTP ${response.status}: ${detail}` };
                }
              } else {
                const result = await supabase.rpc('driver_update_live_location', locationPayload);
                locationError = result.error;
              }
            } catch (uploadError: any) {
              locationError = { message: uploadError?.message || 'فشل إرسال الموقع في الخلفية.' };
            }

            if (locationError) {
              lastUploadFailed = true;
            } else {
              lastSentAt = Date.now();
              lastUploadFailed = false;
            }
            if (!active) return;
            if (locationError) {
              setError(locationError.message || 'تعذر حفظ الموقع. تأكد من إعدادات السائق في النظام.');
            } else {
              setError('');
            }
          },
        );
      } catch (trackingError: any) {
        if (active) setError(trackingError?.message || 'تعذر تشغيل خدمة تتبع الموقع. راجع أذونات الموقع والإشعارات.');
      }
    })();

    return () => {
      active = false;
      if (watcherId) void BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
  }, [session?.user?.id, driverAuthorized]);

  function normalizePhone(input: string) {
    let value = input.trim().replace(/[\s()-]/g, '');
    if (value.startsWith('00')) value = `+${value.slice(2)}`;
    if (/^01[0125]\d{8}$/.test(value)) value = `+20${value.slice(1)}`;
    if (/^20(10|11|12|15)\d{8}$/.test(value)) value = `+${value}`;
    if (/^\+20(10|11|12|15)\d{8}$/.test(value)) return value;
    throw new Error('أدخل رقم موبايل مصري صحيحًا مثل 01012345678.');
  }

  // The driver enters only their phone digits; this alias is internal to Supabase Auth.
  function driverLoginEmail(input: string) {
    const normalized = normalizePhone(input);
    return `${normalized.replace(/\D/g, '')}@driver-login.tiba.invalid`;
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setAuthBusy(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: driverLoginEmail(phone),
        password,
      });
      if (signInError) throw signInError;
      if (!data.session) throw new Error('لم يتم إنشاء جلسة دخول.');
      setPassword('');
      setSession(data.session);
    } catch (e: any) {
      setError(e?.message || 'تعذر تسجيل الدخول.');
    } finally {
      setAuthBusy(false);
    }
  }


  function locationPermissionInstructions() {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') {
      return 'افتح إعدادات iPhone > الخصوصية والأمان > خدمات الموقع > Tiba Supplies Driver، واسمح بالموقع أثناء الاستخدام. للتتبع أثناء الرحلة في الخلفية اختر «دائمًا» إذا ظهر الخيار.';
    }
    if (platform === 'android') {
      return 'افتح إعدادات الهاتف > التطبيقات > Tiba Supplies Driver > الأذونات > الموقع، واسمح بالموقع دائمًا، ثم فعّل الإشعارات.';
    }
    return 'اسمح للموقع من إعدادات المتصفح، واترك صفحة التطبيق مفتوحة أثناء الرحلة.';
  }

  function captureLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع على هذا الجهاز.');
      return;
    }
    setLocating(true);
    void (async () => {
      try {
        const permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
          const requested = await Geolocation.requestPermissions();
          if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
            setError('إذن الموقع غير ممنوح. ' + locationPermissionInstructions());
            setLocating(false);
            return;
          }
        }
      } catch (permissionError: any) {
        setError((permissionError?.message || 'تعذر طلب إذن GPS.') + ' ' + locationPermissionInstructions());
        setLocating(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
      async ({ coords, timestamp }) => {
        setPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          capturedAt: new Date(timestamp).toLocaleString('ar-EG'),
        });
        try {
          const { error: saveError } = await supabase.rpc('driver_update_live_location', {
            p_latitude: coords.latitude, p_longitude: coords.longitude, p_accuracy_m: coords.accuracy,
            p_captured_at: new Date(timestamp).toISOString(),
          });
          if (saveError) throw new Error(saveError.message || 'تعذر حفظ الموقع. فعّل مشاركة الموقع وتأكد من ربط حسابك بالعربية.');

          // Ordinary drivers check in to the queue; an already assigned trip uses the existing trip-arrival workflow.
          const assignedBooking = (portal?.my_bookings || []).find((booking: any) => booking.raw_status === 'ASSIGNED');
          const capturedAt = new Date(timestamp).toISOString();
          if (assignedBooking?.booking_id) {
            if (pendingDirectAssignments.some((item: any) => item.booking_id === assignedBooking.booking_id)) {
              throw new Error('التخصيص المباشر لسه في انتظار قبولك. اضغط «تأكيد القبول» الأول.');
            }
            const { data: arrival, error: arrivalError } = await supabase.rpc('driver_confirm_arrival', {
              p_booking_id: assignedBooking.booking_id,
              p_latitude: coords.latitude,
              p_longitude: coords.longitude,
              p_accuracy_m: coords.accuracy,
              p_captured_at: capturedAt,
            });
            if (arrivalError) {
              const raw = String(arrivalError.message || '');
              if (raw.includes('OUTSIDE_RAS_SEDR_GEOFENCE')) throw new Error('أنت خارج نطاق مكتب رأس سدر البالغ 10 كم.');
              if (raw.includes('LOCATION_TIMESTAMP_STALE_OR_INVALID')) throw new Error('بيانات GPS قديمة. حدّث الموقع وحاول تاني.');
              if (raw.includes('DRIVER_ACCEPTANCE_REQUIRED')) throw new Error('اقبل التخصيص المباشر الأول قبل تسجيل الوصول للنقلة.');
              if (raw.includes('BOOKING_NOT_AWAITING_ARRIVAL')) throw new Error('النقلة لم تعد في حالة انتظار الوصول.');
              throw new Error(raw || 'تعذر تأكيد الوصول للنقلة.');
            }
            await refreshPortal();
            setError(arrival?.status === 'ARRIVED' || arrival?.success
              ? `تم تأكيد وصولك للنقلة. المسافة من المكتب: ${Math.round(Number(arrival.distance_meters ?? arrival.distance_m ?? 0))} متر.`
              : 'تم حفظ الموقع، لكن النظام لم يؤكد الوصول. حاول مرة أخرى.');
          } else {
            const { data: checkIn, error: checkInError } = await supabase.rpc('driver_check_in_queue', {
              p_latitude: coords.latitude,
              p_longitude: coords.longitude,
              p_accuracy_m: coords.accuracy,
              p_captured_at: capturedAt,
            });
            if (checkInError) {
              const raw = String(checkInError.message || '');
              if (raw.includes('OUTSIDE_RAS_SEDR_GEOFENCE')) throw new Error('أنت خارج نطاق مكتب رأس سدر البالغ 10 كم.');
              if (raw.includes('LOCATION_ACCURACY_TOO_LOW')) throw new Error('دقة GPS لازم تكون 100 متر أو أفضل. اتحرك لمكان مفتوح وحاول تاني.');
              if (raw.includes('LOCATION_TIMESTAMP_STALE_OR_INVALID')) throw new Error('قراءة GPS قديمة. حدّث الموقع وحاول تاني.');
              if (raw.includes('DRIVER_HAS_ACTIVE_BOOKING')) throw new Error('عندك نقلة نشطة بالفعل؛ مش ممكن تدخل قائمة الانتظار دلوقتي.');
              throw new Error(raw || 'تعذر تسجيل الوصول لقائمة الانتظار.');
            }
            await refreshPortal();
            setError(`تم تسجيل وصولك لقائمة الانتظار. دورك الحالي رقم ${checkIn?.queue_position ?? '—'}؛ اختار نقلة متاحة أثناء نافذة الاختيار.`);
          }
        } catch (checkInError: any) {
          setError(checkInError?.message || 'تعذر تسجيل الوصول. حاول مرة أخرى.');
        } finally {
          setLocating(false);
        }
      },
      (locationError) => {
        const message = locationError.code === 1 ? 'تم رفض إذن الموقع. ' + locationPermissionInstructions() + ' ثم جرّب مرة أخرى.' : locationError.code === 2 ? 'الهاتف لم يستطع تحديد موقعك. فعّل خدمات الموقع وحاول في مكان مفتوح.' : 'انتهت مهلة تحديد الموقع. تأكد من تشغيل خدمات الموقع وحاول مرة أخرى.';
        setError(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    })();
  }

  if (loading) {
    return <div dir="rtl" className="grid min-h-screen place-items-center bg-gradient-to-br from-red-50 via-white to-orange-50 p-6 text-slate-900"><div className="rounded-3xl border border-red-100 bg-white/90 px-8 py-9 text-center shadow-lg shadow-red-900/5"><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-sky-700"><Truck size={30}/></div><p className="text-xs font-black tracking-widest text-teal-700">TIBA SUPPLIES · DRIVER</p><p className="mt-2 text-lg font-black">جاري تجهيز تطبيق السائق</p><div className="mx-auto mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-red-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-red-600"/></div></div></div>;
  }

  if (!session) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-100 p-5 flex items-center justify-center">
        <form onSubmit={signIn} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-800"><Truck size={28} /></div>
          <p className="text-xs font-black tracking-widest text-teal-700">TIBA SUPPLIES · DRIVER</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">دخول السائق</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">استخدم رقم الموبايل بالأرقام فقط كاسم مستخدم، مع كلمة المرور التي استلمتها من المكتب.</p>
          {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <label className="mt-5 block text-sm font-bold text-slate-700">اسم المستخدم (رقم الموبايل بالأرقام فقط)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
          <label className="mt-4 block text-sm font-bold text-slate-700">كلمة المرور</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 outline-none focus:border-red-500" />
          <button disabled={authBusy} className="mt-5 w-full rounded-xl bg-gradient-to-l from-teal-700 to-cyan-600 p-3 font-black text-white shadow-sm transition hover:from-sky-800 hover:to-teal-700 disabled:opacity-60">{authBusy ? 'جارٍ الدخول...' : 'دخول'}</button>
        </form>
      </main>
    );
  }


  if (!driverAuthorized) {
    return <div dir="rtl" className="min-h-screen grid place-items-center bg-gradient-to-br from-sky-50 via-white to-emerald-50 text-slate-700">جاري التحقق من حساب السائق...</div>;
  }


  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-teal-700"><Truck size={23} /></div>
            <div><p className="text-xs font-black text-teal-700">TIBA SUPPLIES</p><h1 className="font-black">تطبيق السائق</h1></div>
          </div>
          <button aria-label="تسجيل الخروج" onClick={() => void supabase.auth.signOut()} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600"><LogOut size={18} /></button>
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-10">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.04]">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm text-slate-500">أهلًا بك</p><h2 className="mt-1 break-all text-lg font-black">{session.user?.phone}</h2></div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">متصل</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-white p-4 ring-1 ring-sky-100"><MapPin className="mb-2 text-teal-700" size={21}/><p className="text-xs text-slate-500">مكتب تسجيل الوصول</p><p className="mt-1 font-black">رأس سدر</p></div>
            <div className="rounded-2xl bg-slate-100 p-4"><Navigation className="mb-2 text-teal-700" size={21}/><p className="text-xs text-slate-500">نطاق الوصول</p><p className="mt-1 font-black">10 كم</p></div>
          </div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ShieldCheck className="text-teal-700" size={22}/><h2 className="font-black">تسجيل الوصول</h2></div>
          <p className="mt-2 text-sm leading-6 text-slate-600">مشاركة الموقع تعمل تلقائيًا بعد تسجيل الدخول. اضغط الزر لفحص موقعك ومعرفة هل أنت داخل نطاق 10 كم من مكتب رأس سدر.</p>
          <button onClick={captureLocation} disabled={locating} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-teal-700 to-cyan-600 p-4 font-black text-white shadow-md shadow-sky-900/15 transition hover:from-sky-800 hover:to-teal-700 disabled:opacity-60">
            <MapPin size={20}/>{locating ? 'جاري فحص الموقع...' : 'أنا وصلت — فحص الموقع'}
          </button>
          {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-slate-100 p-3 text-sm text-teal-700"><CircleAlert className="shrink-0" size={18}/><span>{error}</span></div>}
          {position && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-black">تم تحديد الموقع على الجهاز</p>
            <p className="mt-2">دقة GPS: {Math.round(position.accuracy)} متر</p>
            <p>وقت القراءة: {position.capturedAt}</p>
            <p className="mt-2 break-all font-mono text-xs">{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</p>
            <p className="mt-3 text-xs leading-5">قراءة الموقع وحدها لا تكفي؛ زر «أنا وصلت» يتحقق من النطاق والدقة وحداثة القراءة ويسجّل دخولك لقائمة الانتظار على السيرفر.</p>
          </div>}
          {error && <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-slate-100 p-3 text-sm text-teal-700"><CircleAlert className="shrink-0" size={18}/><span>{error}</span></div>}
        </section>
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="text-amber-300" size={22}/><h2 className="font-black">إسناد مباشر — في انتظار قبولك</h2></div>
          <p className="mt-2 text-sm leading-6 text-amber-800">الأوامر دي اتخصصت لك مباشرة من المكتب. راجع المصنع والمحجر وكود النقلة والعربية، واضغط «تأكيد القبول». وصول الإشعار وحده مش معناه إنك قبلت التخصيص، والنقلة لن تبدأ قبل تسجيل قبولك.</p>
          {acceptanceMessage && <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-800">{acceptanceMessage}</div>}
          {pendingDirectAssignments.length ? <div className="mt-4 space-y-3">{pendingDirectAssignments.map((assignment: any) => <article key={assignment.booking_id} className="rounded-2xl border border-amber-200 bg-white p-4">
            <div className="flex items-start gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-xl font-black text-amber-800">{factoryGlyph(String(assignment.factory_name || 'م'))}</div><div className="min-w-0 flex-1"><h3 className="font-black">{assignment.factory_name || 'مصنع غير محدد'}</h3><p className="mt-1 text-sm text-slate-600">المحجر: {assignment.quarry_name || 'غير محدد'}</p><p className="mt-1 text-sm font-black text-cyan-700">كود النقلة: <span dir="ltr" className="font-mono">{assignment.trip_code || 'جارٍ تجهيز الكود'}</span></p><p className="mt-1 text-xs text-slate-500">رقم الإسناد اليومي: {assignment.assignment_daily_number ?? '—'} · {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleString('ar-EG') : ''}</p></div></div>
            <button type="button" onClick={() => void acceptDirectAssignment(assignment.booking_id)} disabled={acceptingBookingId !== null} className="mt-4 w-full rounded-xl bg-emerald-700 p-3 font-black text-white disabled:opacity-60">{acceptingBookingId === assignment.booking_id ? 'جارٍ تسجيل القبول...' : 'تأكيد القبول'}</button>
          </article>)}</div> : <p className="mt-3 rounded-xl bg-slate-50/80 p-3 text-sm text-slate-600">مفيش أوامر مباشرة معلّقة حاليًا.</p>}
        </section>
        {(portal?.my_bookings || []).filter((booking: any) => booking.is_direct_assignment && ['LOADING', 'LOADED', 'IN_TRANSIT'].includes(booking.raw_status)).length > 0 && <section className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm">
          <div className="flex items-center gap-2"><Truck className="text-emerald-800" size={22}/><h2 className="font-black">نقلات الإسناد المباشر النشطة</h2></div>
          <p className="mt-2 text-sm leading-6 text-emerald-800">تم قبول الإسناد، والنقلة أصبحت ضمن التشغيل. ظهورها هنا لا يعتمد على بقاء موقعك داخل نطاق مكتب رأس سدر.</p>
          <div className="mt-3 space-y-3">{portal.my_bookings.filter((booking: any) => booking.is_direct_assignment && ['LOADING', 'LOADED', 'IN_TRANSIT'].includes(booking.raw_status)).map((booking: any) => <article key={booking.booking_id} className="rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="font-black">{booking.factory_name} ← {booking.quarry_name}</div>
            <p className="mt-2 text-sm text-slate-600">الحالة: {booking.raw_status === 'LOADING' ? 'جاري التحميل' : booking.raw_status === 'LOADED' ? 'تم التحميل' : 'في الطريق'}</p>
            <p className="mt-1 text-sm font-black text-cyan-700">كود النقلة: <span dir="ltr" className="font-mono">{booking.trip_code || '—'}</span></p><p className="mt-1 text-xs text-slate-500">رقم التحميل اليومي: {booking.daily_load_number ?? '—'}</p>
          </article>)}</div>
        </section>}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="text-teal-700" size={22}/><h2 className="font-black">سجل النقلات السابقة</h2></div>
          <p className="mt-2 text-sm leading-6 text-slate-600">السجل ده متاح لك في أي مكان، ومش مرتبط بنطاق الـ 10 كم. النطاق خاص بالحمولات المتاحة وتسجيل الوصول وقائمة الانتظار فقط.</p>
          {(portal?.my_bookings || []).length ? <div className="mt-4 space-y-3">{portal.my_bookings.map((booking: any) => <article key={booking.booking_id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold">{booking.factory_name || 'مصنع غير محدد'} ← {booking.quarry_name || 'محجر غير محدد'}</div><p className="mt-2 text-sm text-slate-600">الحالة: {({ASSIGNED:'تم الإسناد',ARRIVED:'وصل السائق',LOADING:'جاري التحميل',LOADED:'تم التحميل',IN_TRANSIT:'في الطريق',DELIVERED:'تم التسليم',CANCELLED:'ملغاة'} as Record<string,string>)[booking.raw_status] || booking.status}</p><p className="mt-1 text-xs text-slate-500">{booking.booked_at ? new Date(booking.booked_at).toLocaleString('ar-EG') : ''}</p>{booking.raw_status === 'IN_TRANSIT' && <div className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold text-slate-700">الوزن بالطن *
                <input type="text" inputMode="numeric" value={deliveryWeightTons[booking.booking_id] ?? ''} onChange={e => setDeliveryWeightTons(current => ({ ...current, [booking.booking_id]: e.target.value.replace(/\D/g, '') }))} placeholder="مثال: 80" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-base font-black" aria-label="الوزن بالطن" />
              </label>
              <label className="block text-sm font-bold text-slate-700">الوزن بالكيلو
                <input type="text" inputMode="numeric" value={deliveryWeightKilograms[booking.booking_id] ?? ''} onChange={e => setDeliveryWeightKilograms(current => ({ ...current, [booking.booking_id]: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder="مثال: 500" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-base font-black" aria-label="الوزن بالكيلوجرام" />
              </label>
            </div>
            <span className="-mt-2 block text-xs font-normal text-slate-500">مثال: 80 طن و500 كيلو. الخانتان تتحولان تلقائيًا لوزن واحد في التقارير.</span>
            <label className="block text-sm font-bold text-slate-700">صورة الميزان (اختياري)
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setDeliveryScaleImages(current => ({ ...current, [booking.booking_id]: e.target.files?.[0] ?? null }))} className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm font-normal" />
              <span className="mt-1 block text-xs font-normal text-slate-500">JPG أو PNG أو WEBP، بحد أقصى 10 ميجابايت.</span>
            </label>
            <button type="button" onClick={() => void confirmDelivery(booking.booking_id)} disabled={deliveryBusyBookingId !== null || !parseDeliveryWeight(deliveryWeightTons[booking.booking_id] ?? '', deliveryWeightKilograms[booking.booking_id] ?? '').valid} className="w-full rounded-xl bg-emerald-700 p-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{deliveryBusyBookingId === booking.booking_id ? 'جارٍ تسجيل الوزن والتسليم...' : 'تأكيد التسليم والوزن'}</button>
          </div>}</article>)}</div> : <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-500">مفيش نقلات سابقة مسجلة على حسابك حتى الآن.</p>}
        </section>
        {!portal?.inside_geofence ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><ShieldCheck className="text-teal-700" size={22}/><h2 className="font-black">الخدمات داخل نطاق المكتب</h2></div>
            <p className="mt-2 text-sm leading-7 text-slate-600">لن تظهر الحمولات المتاحة أو ترتيب الانتظار أو سجل أوامرك إلا بعد أن يؤكد النظام وجودك داخل نطاق 10 كم من مكتب رأس سدر، مع موقع GPS حديث.</p>
            {portal && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{portal.location_updated_at ? 'آخر موقع محفوظ قد يكون خارج النطاق أو أقدم من 10 دقائق.' : 'لم يصل موقع GPS حديث للنظام حتى الآن.'}</p>}
            <p className="mt-3 text-sm font-bold text-slate-700">استخدم زر «أنا وصلت — فحص الموقع» أعلاه لتحديث موقعك والتحقق من النطاق.</p>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><ShieldCheck className="text-emerald-700" size={22}/><h2 className="font-black">أنت داخل نطاق المكتب</h2></div>
              <p className="mt-2 text-sm text-slate-600">المسافة التقريبية: {Math.round(Number(portal.distance_m || 0))} متر من مكتب {portal.office_name || 'رأس سدر'}.</p>
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Clock3 className="text-teal-700" size={22}/><h2 className="font-black">رقمك في الانتظار</h2></div>
              {dispatchState?.queue_status === 'WAITING' ? <><p className="mt-3 text-2xl font-black text-teal-700">الدور رقم {dispatchState.queue_position || '—'}</p><p className="mt-1 text-xs text-slate-500">وقت دخول القائمة: {dispatchState.queue_arrived_at ? new Date(dispatchState.queue_arrived_at).toLocaleString('ar-EG') : '—'}</p></> : dispatchState?.queue_status === 'ASSIGNED' ? <p className="mt-2 text-sm font-bold text-emerald-700">تم تخصيص نقلة لك. راجع سجل النقلات واتبع خطوات الوصول والتحميل.</p> : <p className="mt-2 text-sm leading-7 text-slate-600">أنت داخل النطاق لكنك غير مسجل حاليًا في قائمة الانتظار. اضغط «أنا وصلت» لتسجيل وقت دخولك على السيرفر.</p>}
              {dispatchState?.selection_window?.is_open && <p className="mt-3 rounded-xl bg-violet-50 p-3 text-sm font-bold text-violet-900">نافذة اختيار النقلات مفتوحة حتى {new Date(dispatchState.selection_window.selection_ends_at).toLocaleTimeString('ar-EG')}.</p>}
              {dispatchState?.choice_status === 'CHOSEN' && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">اختيارك مسجل، لكنه ليس تخصيصًا نهائيًا. التوزيع يتم بعد انتهاء الخمس دقائق حسب أقدم وقت دخول.</p>}
              {dispatchState?.choice_status === 'ALLOCATED' && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">تم تخصيص النقلة المختارة لك.</p>}
              {dispatchMessage && <p role="status" className="mt-3 rounded-xl bg-sky-50 p-3 text-sm font-bold text-sky-900">{dispatchMessage}</p>}
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Truck className="text-teal-700" size={22}/><h2 className="font-black">الحمولات المتاحة</h2></div>
              {(dispatchState?.available_loads || []).length ? <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{dispatchState.available_loads.map((load: any) => { const factoryName = String(load.factory_name || 'مصنع غير محدد'); const quarryName = String(load.quarry_name || 'محجر غير محدد'); const color = quarryColor(load.quarry_id, quarryName); return <article key={load.load_order_id} className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm"><div aria-label={factoryName + ' — ' + quarryName} className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border-2 text-2xl font-black shadow-sm" style={{ backgroundColor: color.background, color: color.foreground, borderColor: color.border }}>{factoryGlyph(factoryName)}</div><h3 className="mt-3 font-black leading-6">{factoryName}</h3><p className="mt-1 text-sm font-bold text-slate-600">{quarryName}</p><p className="mt-3 rounded-xl bg-slate-50 px-2 py-2 text-xs text-slate-600">المتبقي: <strong>{load.remaining_quantity}</strong> نقلة</p><p className="mt-2 text-[11px] text-slate-500">أمر: {String(load.load_order_id).slice(0, 8)}</p><button type="button" onClick={() => void selectLoad(load.load_order_id)} disabled={selectingLoadOrderId !== null || dispatchState?.queue_status !== 'WAITING' || (dispatchState?.choice_status && dispatchState.choice_status !== 'CHOSEN')} className={`mt-3 w-full rounded-xl p-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${load.is_selected ? 'bg-emerald-700' : 'bg-violet-700 hover:bg-violet-800'}`}>{selectingLoadOrderId === load.load_order_id ? 'جارٍ تسجيل الاختيار...' : load.is_selected ? 'اختيارك الحالي' : 'اختيار النقلة'}</button></article>; })}</div> : <p className="mt-2 text-sm leading-7 text-slate-500">لا توجد حمولات مفتوحة للاختيار حاليًا. لازم تكون مسجلًا في قائمة الانتظار، ويكون طلب التحميل داخل نافذة الخمس دقائق.</p>}
            </section>
          </>
        )}

        {(dispatchState?.notifications || []).length > 0 && <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="flex items-center gap-2"><FileText className="text-sky-800" size={22}/><h2 className="font-black text-sky-950">إشعارات التوزيع</h2></div>
          <p className="mt-1 text-xs text-sky-800">تظهر إشعارات نتيجة التوزيع حتى لو كنت خارج نطاق الـ 10 كم؛ النطاق يظل شرطًا لاختيار النقلات الجديدة فقط.</p>
          <div className="mt-3 space-y-2">{dispatchState.notifications.map((notice: any) => <article key={notice.notification_id} className="rounded-xl border border-sky-100 bg-white p-3"><p className="font-black text-slate-900">{notice.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{notice.body}</p><p className="mt-1 text-[11px] text-slate-500">{notice.created_at ? new Date(notice.created_at).toLocaleString('ar-EG') : ''}</p></article>)}</div>
        </section>}
      </div>
    </main>
  );
};
