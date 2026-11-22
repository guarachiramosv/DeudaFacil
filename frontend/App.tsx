import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  Keyboard,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ExpoLinking from 'expo-linking';
import * as Speech from 'expo-speech';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { BottomNavigation } from './src/components/BottomNavigation';
import type { MainTab } from './src/components/BottomNavigation';
import { ApiError, apiRequest, checkApiHealth, firstRow } from './src/lib/api';
import type { ApiProfile, Debt, DebtBalance, Movement, Pasanacu, PasanacuDetail, Plan } from './src/lib/api';
import { parseDebtAmount } from './src/features/debts/parseDebtAmount';
import { useDebtSpeechInput } from './src/features/debts/useDebtSpeechInput';
import { PersonalDebtsScreen } from './src/features/debts/PersonalDebtsScreen';
import { addPersonalDebtEntryInCloud, createPersonalDebtInCloud, loadPersonalDebtsFromCloud } from './src/features/debts/personalDebtApi';
import type { NewPersonalDebt, NewPersonalDebtEntry, PersonalDebt } from './src/features/debts/personalDebtStorage';
import { supabase } from './src/lib/supabase';

type DebtDetail = { balance: DebtBalance | null; movements: Movement[] };
type Dashboard = { profile: ApiProfile | null; debts: Debt[]; plan: Plan | null; groups: Pasanacu[] };

export default function App() {
  return <SafeAreaProvider><DeudaFacilApp /></SafeAreaProvider>;
}

function DeudaFacilApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<'login' | 'register'>('login');
  const [authMethod] = useState<'phone' | 'email'>('email');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tab, setTab] = useState<MainTab>('deudas');
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [premiumPreview, setPremiumPreview] = useState(false);
  const [groups, setGroups] = useState<Pasanacu[]>([]);
  const [personalDebts, setPersonalDebts] = useState<PersonalDebt[]>([]);
  const [personalDebtsLoading, setPersonalDebtsLoading] = useState(false);
  const [personalDebtError, setPersonalDebtError] = useState('');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [debtDetail, setDebtDetail] = useState<DebtDetail | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<PasanacuDetail | null>(null);
  const [showSharedDebtForm, setShowSharedDebtForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [counterpart, setCounterpart] = useState('');
  const [debtRole, setDebtRole] = useState<'deudor' | 'acreedor'>('deudor');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtReason, setDebtReason] = useState('');
  const [registrationMode, setRegistrationMode] = useState<'write' | 'voice'>('write');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [reviewHasBeenPlayed, setReviewHasBeenPlayed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [isReadingReview, setIsReadingReview] = useState(false);
  const debtSpeech = useDebtSpeechInput();
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentRegistrationMode, setPaymentRegistrationMode] = useState<'write' | 'voice'>('write');
  const [paymentTranscript, setPaymentTranscript] = useState('');
  const [paymentReviewPlayed, setPaymentReviewPlayed] = useState(false);
  const [paymentReviewConfirmed, setPaymentReviewConfirmed] = useState(false);
  const [isReadingPaymentReview, setIsReadingPaymentReview] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupFee, setGroupFee] = useState('');
  const [groupSlots, setGroupSlots] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const handledAuthLinks = useRef(new Set<string>());
  const welcomeShown = useRef(false);
  const authScrollRef = useRef<ScrollViewInstance | null>(null);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.94)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeOffset = useRef(new Animated.Value(12)).current;
  const { width: windowWidth } = useWindowDimensions();
  const horizontalPadding = Math.min(24, Math.max(14, windowWidth * 0.055));

  useEffect(() => {
    const keyboardEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(keyboardEvent, () => {
      requestAnimationFrame(() => authScrollRef.current?.scrollToEnd({ animated: true }));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (authLoading || welcomeShown.current) return;
    welcomeShown.current = true;
    if (session) return;
    setShowWelcome(true);
    Animated.parallel([
      Animated.timing(splashOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(splashScale, { toValue: 1, speed: 16, bounciness: 7, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => setShowWelcome(false));
    }, 1150);
    return () => clearTimeout(timer);
  }, [authLoading, session, splashOpacity, splashScale]);

  useEffect(() => {
    welcomeOpacity.stopAnimation();
    welcomeOffset.stopAnimation();
    if (!session) {
      welcomeOpacity.setValue(0);
      welcomeOffset.setValue(12);
      return;
    }
    welcomeOpacity.setValue(0);
    welcomeOffset.setValue(12);
    const animation = Animated.parallel([
      Animated.timing(welcomeOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(welcomeOffset, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [session?.user.id, welcomeOpacity, welcomeOffset]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthLoading(false);
      }
    }).catch(() => {
      if (active) setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function handleAuthLink(url: string) {
      if (!url.toLowerCase().includes('auth/callback') || handledAuthLinks.current.has(url)) return;
      handledAuthLinks.current.add(url);
      try {
        const parsed = ExpoLinking.parse(url);
        const params: Record<string, string | string[] | undefined> = { ...(parsed.queryParams ?? {}) };
        const fragment = url.split('#')[1];
        if (fragment) new URLSearchParams(fragment).forEach((value, key) => { params[key] = value; });
        const getParam = (key: string) => {
          const value = params[key];
          return Array.isArray(value) ? value[0] : value;
        };
        const authError = getParam('error_description') || getParam('error');
        if (authError) throw new Error(authError);

        const code = getParam('code');
        const tokenHash = getParam('token_hash');
        const type = getParam('type') || 'signup';
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (tokenHash) {
          const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (verifyError) throw verifyError;
        } else {
          const accessToken = getParam('access_token');
          const refreshToken = getParam('refresh_token');
          if (!accessToken || !refreshToken) throw new Error('El enlace no contiene los datos de confirmación. Solicita un correo nuevo.');
          const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sessionError) throw sessionError;
        }
        if (active) {
          setScreen('login');
          setError('');
          Alert.alert('Correo confirmado', 'Tu cuenta quedó verificada. Ya puedes continuar en DeudaFácil.');
        }
      } catch (reason) {
        if (active) {
          const message = reason instanceof Error ? reason.message : 'Solicita un nuevo correo de confirmación.';
          setError(`No se pudo confirmar el correo: ${message}`);
          Alert.alert('No se pudo confirmar el correo', message);
        }
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => { void handleAuthLink(url); });
    Linking.getInitialURL().then(url => { if (url) void handleAuthLink(url); });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  async function fetchDashboard(current: Session): Promise<Dashboard> {
    if (!(await checkApiHealth())) {
      throw new ApiError('La API no está disponible. Comprueba que el backend esté iniciado y que EXPO_PUBLIC_API_URL sea accesible desde este dispositivo.');
    }
    const [profileData, debtData, planData] = await Promise.all([
      apiRequest<ApiProfile[] | ApiProfile>(current, '/api/perfil'),
      apiRequest<Debt[]>(current, '/api/deudas'),
      apiRequest<Plan | Plan[]>(current, '/api/plan'),
    ]);
    const currentPlan = firstRow(planData);
    const groupData = currentPlan?.plan === 'premium'
      ? await apiRequest<Pasanacu[]>(current, '/api/pasanacus')
      : [];
    return {
      profile: firstRow(profileData),
      debts: Array.isArray(debtData) ? debtData : [],
      plan: currentPlan,
      groups: Array.isArray(groupData) ? groupData : [],
    };
  }

  function applyDashboard(data: Dashboard) {
    setProfile(data.profile);
    setDebts(data.debts);
    setPlan(data.plan);
    setGroups(data.groups);
  }

  function handleError(reason: unknown) {
    if (reason instanceof ApiError && reason.status === 401) {
      setError(reason.message);
      void supabase.auth.signOut();
      return;
    }
    setError(reason instanceof Error ? reason.message : 'Ocurrió un error. Intenta nuevamente.');
  }

  async function refreshDashboard(showNotice = false) {
    if (!session) return;
    setDashboardLoading(true);
    setError('');
    try {
      applyDashboard(await fetchDashboard(session));
      if (showNotice) setNotice('Información actualizada.');
    } catch (reason) {
      handleError(reason);
    } finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      setTab('deudas');
      setPremiumPreview(false);
      setProfile(null);
      setDebts([]);
      setPlan(null);
      setGroups([]);
      setSelectedGroup(null);
      setSelectedDebtId(null);
      setDebtDetail(null);
      setPersonalDebts([]);
      setPersonalDebtsLoading(false);
      setPersonalDebtError('');
      return;
    }
    let active = true;
    setDashboardLoading(true);
    setError('');
    fetchDashboard(session).then(data => {
      if (active) applyDashboard(data);
    }).catch(reason => {
      if (active) handleError(reason);
    }).finally(() => {
      if (active) setDashboardLoading(false);
    });
    return () => { active = false; };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const checkPlan = async () => {
      try {
        const data = await apiRequest<Plan | Plan[]>(session, '/api/plan');
        if (active) setPlan(firstRow(data));
      } catch (reason) {
        if (active && reason instanceof ApiError && reason.status === 401) handleError(reason);
      }
    };
    void checkPlan();
    const appStateListener = AppState.addEventListener('change', state => {
      if (state === 'active') void checkPlan();
    });
    const poll = tab === 'perfil' ? setInterval(() => void checkPlan(), 30_000) : undefined;
    return () => {
      active = false;
      appStateListener.remove();
      if (poll) clearInterval(poll);
    };
  }, [session?.access_token, tab]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    setPersonalDebtsLoading(true);
    setPersonalDebtError('');
    loadPersonalDebtsFromCloud(session).then(items => {
      if (active) setPersonalDebts(items);
    }).catch(reason => {
      if (reason instanceof ApiError && reason.status === 401) handleError(reason);
      if (active) setPersonalDebtError(reason instanceof Error ? reason.message : 'No se pudieron cargar tus deudas personales.');
    }).finally(() => {
      if (active) setPersonalDebtsLoading(false);
    });
    return () => { active = false; };
  }, [session?.access_token]);

  async function refreshPersonalDebts(current: Session) {
    setPersonalDebtsLoading(true);
    setPersonalDebtError('');
    try {
      setPersonalDebts(await loadPersonalDebtsFromCloud(current));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) handleError(reason);
      setPersonalDebtError(reason instanceof Error ? reason.message : 'No se pudieron cargar tus deudas personales.');
    } finally {
      setPersonalDebtsLoading(false);
    }
  }

  async function createPersonalDebt(input: NewPersonalDebt) {
    if (!session) throw new Error('Inicia sesión para guardar tus registros.');
    setPersonalDebts(await createPersonalDebtInCloud(session, input));
    setPersonalDebtError('');
  }

  async function addPersonalDebtEntry(debtId: string, input: NewPersonalDebtEntry) {
    if (!session) throw new Error('Inicia sesión para guardar tus registros.');
    setPersonalDebts(await addPersonalDebtEntryInCloud(session, debtId, input));
    setPersonalDebtError('');
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (reason) {
      handleError(reason);
    } finally {
      setBusy(false);
    }
  }

  async function loadDebtDetail(debtId: string) {
    if (!session) return;
    const [balanceData, movementsData] = await Promise.all([
      apiRequest<DebtBalance[]>(session, `/api/deudas/${encodeURIComponent(debtId)}/saldo`),
      apiRequest<Movement[]>(session, `/api/deudas/${encodeURIComponent(debtId)}/abonos`),
    ]);
    setSelectedDebtId(debtId);
    setDebtDetail({ balance: firstRow(balanceData), movements: Array.isArray(movementsData) ? movementsData : [] });
  }

  async function loadGroup(groupId: string) {
    if (!session) return;
    const result = await apiRequest<PasanacuDetail[]>(session, `/api/pasanacus/${encodeURIComponent(groupId)}`);
    const detail = firstRow(result);
    setSelectedGroup(detail);
  }

  function normalizedBolivianPhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');
    const local = digits.startsWith('591') ? digits.slice(3) : digits;
    if (!/^[67]\d{7}$/.test(local)) return null;
    return `+591${local}`;
  }

  async function requestPhoneCode() {
    const normalizedPhone = normalizedBolivianPhone(phone);
    if (!normalizedPhone) {
      Alert.alert('Revisa el celular', 'Ingresa un número celular boliviano válido de 8 dígitos.');
      return;
    }
    if (screen === 'register' && !nombre.trim()) {
      Alert.alert('Revisa tus datos', 'Escribe tu nombre para crear la cuenta.');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: {
          channel: 'sms',
          shouldCreateUser: screen === 'register',
          ...(screen === 'register' ? { data: { nombre: nombre.trim(), telefono: normalizedPhone } } : {}),
        },
      });
      if (authError) throw authError;
      setPhoneCodeSent(true);
      setPhoneCode('');
      Alert.alert('Código enviado', `Revisa tus SMS en el número terminado en ${normalizedPhone.slice(-4)}.`);
    } catch (reason) {
      Alert.alert('No se pudo enviar el código', friendlyAuthError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhoneCode() {
    const normalizedPhone = normalizedBolivianPhone(phone);
    const code = phoneCode.trim();
    if (!normalizedPhone) {
      Alert.alert('Revisa el celular', 'Ingresa un número celular boliviano válido de 8 dígitos.');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      Alert.alert('Código incompleto', 'Ingresa los 6 dígitos que recibiste por WhatsApp.');
      return;
    }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.verifyOtp({ phone: normalizedPhone, token: code, type: 'sms' });
      if (authError) throw authError;
    } catch (reason) {
      Alert.alert('No se pudo verificar', friendlyAuthError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth() {
    const email = correo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Revisa tu correo', 'Escribe un correo electrónico válido.');
      return;
    }
    if (password.length < 6 || (screen === 'register' && !nombre.trim())) {
      Alert.alert('Revisa los datos', 'Completa tu nombre y una contraseña de al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (screen === 'register') {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nombre: nombre.trim() },
            emailRedirectTo: ExpoLinking.createURL('auth/callback'),
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setScreen('login');
          Alert.alert('Revisa tu correo', 'Te enviamos un enlace para confirmar tu cuenta antes de iniciar sesión.');
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (reason) {
      Alert.alert('No se pudo continuar', friendlyAuthError(reason));
    } finally {
      setBusy(false);
    }
  }

  function invalidateVoiceReview() {
    setReviewHasBeenPlayed(false);
    setReviewConfirmed(false);
  }

  function openDebtRegistration() {
    setCounterpart('');
    setDebtAmount('');
    setDebtReason('');
    setVoiceTranscript('');
    setRegistrationMode('write');
    invalidateVoiceReview();
    setError('');
    setNotice('');
    setTab('registros');
  }

  function chooseRegistrationMode(mode: 'write' | 'voice') {
    if (debtSpeech.isListening) debtSpeech.stop();
    void Speech.stop();
    setRegistrationMode(mode);
    setVoiceTranscript('');
    invalidateVoiceReview();
  }

  async function startDebtDictation() {
    setError('');
    setVoiceTranscript('');
    setDebtAmount('');
    setDebtReason('');
    invalidateVoiceReview();
    await debtSpeech.start((transcript, isFinal) => {
      setVoiceTranscript(transcript);
      if (!isFinal) return;
      const safeTranscript = transcript.slice(0, 500);
      setDebtReason(safeTranscript);
      const amount = parseDebtAmount(transcript);
      setDebtAmount(amount ?? '');
      invalidateVoiceReview();
      setError(amount ? '' : 'No pude identificar un monto exacto. Escríbelo y vuelve a escuchar el resumen antes de guardar.');
    }, setError);
  }

  function invalidatePaymentReview() {
    setPaymentReviewPlayed(false);
    setPaymentReviewConfirmed(false);
  }

  async function startPaymentDictation() {
    setError('');
    setPaymentTranscript('');
    setPaymentAmount('');
    setPaymentNote('');
    invalidatePaymentReview();
    await debtSpeech.start((transcript, isFinal) => {
      setPaymentTranscript(transcript);
      if (!isFinal) return;
      const safeTranscript = transcript.slice(0, 500);
      const amount = parseDebtAmount(safeTranscript);
      setPaymentAmount(amount ?? '');
      setPaymentNote(safeTranscript);
      invalidatePaymentReview();
      setError(amount ? '' : 'No pude reconocer el monto del abono. Escríbelo y vuelve a escuchar el resumen antes de guardar.');
    }, setError);
  }

  function readPaymentSummary() {
    if (!validAmount(paymentAmount)) {
      setError('Revisa el monto del abono antes de escuchar el resumen.');
      return;
    }
    const amountForSpeech = Number(paymentAmount.trim().replace(',', '.')).toFixed(2).replace('.', ' coma ');
    const noteForSpeech = paymentNote.trim() ? `El detalle es: ${paymentNote.trim()}.` : 'No agregaste un detalle.';
    const summary = `Revisa este abono. Vas a registrar ${amountForSpeech} bolivianos. ${noteForSpeech}`;
    invalidatePaymentReview();
    setError('');
    void Speech.stop();
    Speech.speak(summary, {
      language: 'es-ES',
      rate: 0.88,
      onStart: () => setIsReadingPaymentReview(true),
      onDone: () => {
        setIsReadingPaymentReview(false);
        setPaymentReviewPlayed(true);
      },
      onStopped: () => setIsReadingPaymentReview(false),
      onError: () => {
        setIsReadingPaymentReview(false);
        setError('No se pudo leer el resumen del abono. Revisa el volumen y vuelve a intentarlo.');
      },
    });
  }

  function readDebtSummary() {
    if (!isUuid(counterpart.trim())) {
      setError('Primero ingresa el UUID válido de la contraparte.');
      return;
    }
    if (!validAmount(debtAmount)) {
      setError('Revisa el monto: debe ser positivo y tener hasta dos decimales.');
      return;
    }
    const amountForSpeech = Number(debtAmount.trim().replace(',', '.')).toFixed(2).replace('.', ' coma ');
    const roleForSpeech = debtRole === 'deudor' ? 'Tú debes' : 'Te deben';
    const descriptionForSpeech = debtReason.trim() ? `El detalle es: ${debtReason.trim()}.` : 'No agregaste un detalle.';
    const summary = `Revisa esta deuda. ${roleForSpeech} ${amountForSpeech} bolivianos. ${descriptionForSpeech} El registro quedará pendiente de confirmación.`;
    invalidateVoiceReview();
    setError('');
    void Speech.stop();
    Speech.speak(summary, {
      language: 'es-ES',
      rate: 0.88,
      onStart: () => setIsReadingReview(true),
      onDone: () => {
        setIsReadingReview(false);
        setReviewHasBeenPlayed(true);
      },
      onStopped: () => setIsReadingReview(false),
      onError: () => {
        setIsReadingReview(false);
        setError('No se pudo leer el resumen. Revisa el volumen y vuelve a intentarlo.');
      },
    });
  }

  async function createDebt() {
    if (!session || !isUuid(counterpart.trim())) {
      setError('Ingresa el UUID de perfil válido de la contraparte.');
      return;
    }
    if (counterpart.trim().toLowerCase() === profile?.id.toLowerCase()) {
      setError('No puedes compartir una deuda contigo. Usa el ID de la otra persona.');
      return;
    }
    if (!validAmount(debtAmount)) {
      setError('Ingresa un monto positivo con hasta dos decimales.');
      return;
    }
    if (registrationMode === 'voice' && (!reviewHasBeenPlayed || !reviewConfirmed)) {
      setError('Escucha el resumen y confirma que el monto y los datos sean correctos antes de registrar.');
      return;
    }
    await perform(async () => {
      await apiRequest<string>(session, '/api/deudas', {
        method: 'POST',
        body: JSON.stringify({ contraparte: counterpart.trim(), rol: debtRole, monto: debtAmount.trim().replace(',', '.'), motivo: debtReason.trim() || undefined }),
      });
      setCounterpart('');
      setDebtAmount('');
      setDebtReason('');
      setVoiceTranscript('');
      invalidateVoiceReview();
      setRegistrationMode('write');
      setShowSharedDebtForm(false);
      setTab('registros');
      applyDashboard(await fetchDashboard(session));
      setNotice('Deuda compartida. La otra persona puede verla en Compartido y confirmarla o pedir revisión.');
    });
  }

  async function respondDebt(debtId: string, confirm: boolean) {
    if (!session) return;
    await perform(async () => {
      await apiRequest<string>(session, `/api/deudas/${encodeURIComponent(debtId)}/respuesta`, {
        method: 'POST', body: JSON.stringify({ confirmar: confirm }),
      });
      applyDashboard(await fetchDashboard(session));
      if (confirm) await loadDebtDetail(debtId);
      setNotice(confirm ? 'Deuda confirmada.' : 'Deuda marcada en revisión.');
    });
  }

  async function createPayment(debtId: string) {
    if (!session || !validAmount(paymentAmount)) {
      setError('Ingresa un monto positivo con hasta dos decimales.');
      return;
    }
    const targetDebt = debts.find(debt => debt.id === debtId);
    if (!targetDebt || targetDebt.creada_por !== session.user.id) {
      setError('Solo quien creó la deuda puede registrar abonos.');
      return;
    }
    const currentBalance = Number(debtDetail?.balance?.saldo_pendiente ?? targetDebt.monto_inicial);
    if (Number.isFinite(currentBalance) && Number(paymentAmount.replace(',', '.')) > currentBalance) {
      setError(`El abono no puede superar el saldo pendiente de ${formatMoney(currentBalance)}.`);
      return;
    }
    if (paymentRegistrationMode === 'voice' && (!paymentReviewPlayed || !paymentReviewConfirmed)) {
      setError('Escucha el resumen y confirma que el monto del abono es correcto antes de guardarlo.');
      return;
    }
    await perform(async () => {
      await apiRequest<string>(session, `/api/deudas/${encodeURIComponent(debtId)}/abonos`, {
        method: 'POST', body: JSON.stringify({ monto: paymentAmount.trim().replace(',', '.'), nota: paymentNote.trim() || undefined }),
      });
      setPaymentAmount('');
      setPaymentNote('');
      setPaymentTranscript('');
      setPaymentRegistrationMode('write');
      invalidatePaymentReview();
      await loadDebtDetail(debtId);
      applyDashboard(await fetchDashboard(session));
      setNotice('Abono registrado como pendiente. La contraparte debe confirmarlo en Compartido para actualizar el saldo.');
    });
  }

  async function respondPayment(movementId: string, confirm: boolean, debtId: string) {
    if (!session) return;
    await perform(async () => {
      await apiRequest<string>(session, `/api/abonos/${encodeURIComponent(movementId)}/respuesta`, {
        method: 'POST', body: JSON.stringify({ confirmar: confirm }),
      });
      await loadDebtDetail(debtId);
      setNotice(confirm ? 'Abono aceptado; el saldo se actualizó.' : 'Abono rechazado; no se descontó del saldo.');
    });
  }

  async function createGroup() {
    if (!session || !hasPasanakuAccess) return;
    const slots = Number(groupSlots);
    if (!groupName.trim() || !validAmount(groupFee) || !Number.isInteger(slots) || slots < 2 || slots > 25) {
      setError('Completa el nombre, una cuota válida y entre 2 y 25 cupos.');
      return;
    }
    await perform(async () => {
      const groupId = await apiRequest<string>(session, '/api/pasanacus', {
        method: 'POST', body: JSON.stringify({ nombre: groupName.trim(), cuota: groupFee.trim().replace(',', '.'), cupos: slots }),
      });
      const code = await apiRequest<string>(session, `/api/pasanacus/${encodeURIComponent(groupId)}/invitacion`, {
        method: 'POST', body: JSON.stringify({}),
      });
      setInviteCode(code);
      setGroupName('');
      setGroupFee('');
      setGroupSlots('');
      await refreshGroups(session);
      await loadGroup(groupId);
      setShowGroupForm(true);
      setNotice('Pasanacu creado. Comparte el código de invitación con los participantes.');
    });
  }

  async function refreshGroups(current: Session) {
    const data = await apiRequest<Pasanacu[]>(current, '/api/pasanacus');
    setGroups(Array.isArray(data) ? data : []);
  }

  async function joinGroup() {
    if (!session || !hasPasanakuAccess) return;
    if (!isUuid(joinCode.trim())) {
      setError('Ingresa un código de invitación válido.');
      return;
    }
    await perform(async () => {
      const groupId = await apiRequest<string>(session, '/api/pasanacus/unirse', {
        method: 'POST', body: JSON.stringify({ codigo: joinCode.trim() }),
      });
      setJoinCode('');
      await refreshGroups(session);
      await loadGroup(groupId);
      setNotice('Te uniste al Pasanacu.');
    });
  }

  async function startGroup(groupId: string) {
    if (!session) return;
    await perform(async () => {
      await apiRequest<string>(session, `/api/pasanacus/${encodeURIComponent(groupId)}/inicio`, {
        method: 'POST', body: JSON.stringify({}),
      });
      await refreshGroups(session);
      await loadGroup(groupId);
      setNotice('Pasanacu iniciado.');
    });
  }

  async function recordContribution(group: PasanacuDetail) {
    if (!session) return;
    await perform(async () => {
      await apiRequest<number>(session, `/api/pasanacus/${encodeURIComponent(group.id)}/aportes`, {
        method: 'POST', body: JSON.stringify({ turno: group.turno }),
      });
      await loadGroup(group.id);
      setNotice('Aporte registrado. El beneficiario debe confirmar la recepción.');
    });
  }

  async function confirmContribution(group: PasanacuDetail, aportante: string) {
    if (!session) return;
    await perform(async () => {
      await apiRequest<string>(session, `/api/pasanacus/${encodeURIComponent(group.id)}/aportes/confirmacion`, {
        method: 'POST', body: JSON.stringify({ turno: group.turno, aportante }),
      });
      await loadGroup(group.id);
      await refreshGroups(session);
      setNotice('Recepción confirmada; se actualizó el turno del grupo.');
    });
  }

  function requestSignOut() {
    Alert.alert('Cerrar sesión', '¿Quieres salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => void perform(async () => {
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) throw signOutError;
        }),
      },
    ]);
  }

  if (authLoading) return <Center><ActivityIndicator size="large" color={colors.teal} /></Center>;

  if (showWelcome && !session) {
    return <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <Center>
        <Animated.View style={[styles.splashContent, { opacity: splashOpacity, transform: [{ scale: splashScale }] }]}>
          <Brand />
          <Text style={styles.splashWelcome}>Bienvenido</Text>
          <Text style={styles.splashSubtitle}>Tus cuentas claras, en un solo lugar.</Text>
        </Animated.View>
      </Center>
    </SafeAreaView>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
          <ScrollView
            ref={authScrollRef}
            contentContainerStyle={[styles.page, { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: horizontalPadding }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
            <Brand />
            <View style={styles.card}>
              <Text style={styles.eyebrow}>{screen === 'login' ? 'BIENVENIDO DE VUELTA' : 'EMPIEZA GRATIS'}</Text>
              <Text style={styles.title}>{screen === 'login' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta'}</Text>
              <Text style={styles.subtitle}>{authMethod === 'phone' ? 'Te enviaremos un código de verificación por SMS.' : 'Lleva tus cuentas claras, de forma sencilla.'}</Text>
              {authMethod === 'phone' ? <>
                {screen === 'register' && <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Cómo te llamamos" autoComplete="name" />}
                <View style={styles.field}>
                  <Text style={styles.label}>Número de celular</Text>
                  <View style={styles.phoneInputWrap}>
                    <Text style={styles.phonePrefix}>+591</Text>
                    <TextInput
                      value={phone}
                      onChangeText={value => { setPhone(value.replace(/\D/g, '').slice(0, 8)); setPhoneCodeSent(false); }}
                      placeholder="71234567"
                      placeholderTextColor={colors.muted}
                      keyboardType="phone-pad"
                      autoComplete="tel-national"
                      maxLength={8}
                      editable={!phoneCodeSent}
                      style={styles.phoneInput}
                      accessibilityLabel="Número celular boliviano, después del prefijo más 591"
                    />
                  </View>
                  <Text style={styles.helper}>El prefijo +591 ya está incluido. Escribe los 8 dígitos de tu celular.</Text>
                </View>
                {phoneCodeSent ? <>
                  <Field label="PIN de verificación por SMS (6 dígitos)" value={phoneCode} onChangeText={value => setPhoneCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
                  <Text style={styles.helper}>El código vence según la configuración de seguridad de tu cuenta.</Text>
                  <PrimaryButton title="Verificar e ingresar" onPress={verifyPhoneCode} busy={busy} />
                  <TouchableOpacity style={styles.resendButton} onPress={requestPhoneCode} disabled={busy}><Text style={styles.switchAction}>Reenviar código por SMS</Text></TouchableOpacity>
                </> : <PrimaryButton title={screen === 'login' ? 'Enviar código por SMS' : 'Crear cuenta y enviar código'} onPress={requestPhoneCode} busy={busy} />}
              </> : <>
                {screen === 'register' && <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Cómo te llamamos" />}
                <Field label="Correo electrónico" value={correo} onChangeText={setCorreo} placeholder="tu@gmail.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <PasswordField label="Contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" visible={passwordVisible} onToggleVisibility={() => setPasswordVisible(value => !value)} autoCapitalize="none" />
                <PrimaryButton title={screen === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} onPress={submitAuth} busy={busy} />
              </>}
              <View style={styles.switchRow}>
                <Text style={styles.switchHint}>{screen === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'}</Text>
              <TouchableOpacity onPress={() => { setScreen(screen === 'login' ? 'register' : 'login'); setPhoneCodeSent(false); setPhoneCode(''); }}>
                  <Text style={styles.switchAction}>{screen === 'login' ? 'Regístrate' : 'Inicia sesión'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.footer}>Finanzas sencillas para el día a día.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const selectedDebt = debts.find(item => item.id === selectedDebtId) ?? null;
  const registeredName = String(session.user.user_metadata?.nombre ?? '').trim();
  const displayName = profile?.nombre?.trim() || registeredName;
  const hasPasanakuAccess = plan?.plan === 'premium' || premiumPreview;

  function togglePremiumPreview() {
    const next = !premiumPreview;
    setPremiumPreview(next);
    setError('');
    setNotice(next
      ? 'Prueba local activada: podrás abrir la pantalla de Pasanaku. El servidor seguirá validando el plan al guardar.'
      : 'Prueba local desactivada.');
    if (next) setTab('pasanaku');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[styles.dashboard, styles.dashboardWithBottomNav, { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: horizontalPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Animated.View style={{ opacity: welcomeOpacity, transform: [{ translateY: welcomeOffset }] }}>
          <View style={styles.topline}><Brand compact /></View>
          <Text style={styles.welcome}>Hola{displayName ? `, ${displayName}` : ''}</Text>
          <Text style={styles.dashboardSubtitle}>{session.user.email || session.user.phone || ''}</Text>
        </Animated.View>

        {error && tab !== 'deudas' ? <Notice tone="error" message={error} actionLabel="Reintentar" onAction={() => void refreshDashboard()} /> : null}
        {notice ? <Notice tone="success" message={notice} /> : null}
        {dashboardLoading && tab !== 'deudas' ? <View style={styles.loadingRow}><ActivityIndicator color={colors.teal} /><Text style={styles.muted}>Actualizando tus datos…</Text></View> : null}

        {tab === 'deudas' ? <PersonalDebtsScreen debts={personalDebts} loading={personalDebtsLoading} loadError={personalDebtError} onRetry={() => { if (session) void refreshPersonalDebts(session); }} onCreate={createPersonalDebt} onAddEntry={addPersonalDebtEntry} /> : null}

        {tab === 'registros' ? (
          <>
            <View style={styles.headingRow}>
              <View style={styles.flex}>
                <SectionTitle title="Deudas compartidas" subtitle="Comparte un registro con la otra persona para que lo confirme y consulte el saldo." />
              </View>
              <AddActionButton label="Agregar deuda compartida" onPress={() => { setShowSharedDebtForm(value => !value); setError(''); setNotice(''); }} />
            </View>
            {debts.length === 0 ? <EmptyState title="Sin deudas compartidas" text="Las deudas compartidas aparecerán aquí cuando la API esté disponible." /> : null}
            {debts.map(debt => renderDebtCard(debt, profile?.id, session.user.id, selectedDebtId, debtDetail, setSelectedDebtId, () => void perform(() => loadDebtDetail(debt.id)), respondDebt, createPayment, respondPayment, paymentAmount, setPaymentAmount, paymentNote, setPaymentNote, busy))}
            {selectedDebt && selectedDebt.estado === 'confirmada' && selectedDebtId && debtDetail ? (
              <View style={styles.card}>
                <SectionTitle title="Saldo y abonos" subtitle="El saldo lo calcula y devuelve el backend." />
                <View style={styles.balanceBox}>
                  <Text style={styles.label}>Saldo pendiente</Text>
                  <Text style={styles.balanceAmount}>{formatMoney(debtDetail.balance?.saldo_pendiente ?? selectedDebt.monto_inicial)}</Text>
                </View>
                {debtDetail.movements.length === 0 ? <EmptyState title="Sin abonos" text="Todavía no hay abonos registrados." /> : null}
                {debtDetail.movements.map(movement => (
                  <View key={movement.id} style={styles.movement}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.itemTitle}>{formatMoney(movement.monto)}</Text>
                      <StatusPill status={movement.estado} label={movement.estado === 'reportado' ? 'Rechazado' : undefined} />
                    </View>
                    <Text style={styles.muted}>{movement.registrado_por === profile?.id ? 'Registrado por ti' : `Registrado por ${shortId(movement.registrado_por)}`} · {formatDate(movement.fecha_creacion)}</Text>
                    {movement.nota ? <Text style={styles.bodyText}>{movement.nota}</Text> : null}
                    {movement.estado === 'pendiente' && movement.registrado_por !== session.user.id ? (
                      <View style={styles.actionRow}>
                        <SmallButton title="Aceptar abono" onPress={() => void respondPayment(movement.id, true, selectedDebt.id)} disabled={busy} />
                        <SmallButton title="Rechazar abono" secondary onPress={() => void respondPayment(movement.id, false, selectedDebt.id)} disabled={busy} />
                      </View>
                    ) : null}
                    {movement.estado === 'pendiente' && movement.registrado_por === session.user.id ? <Text style={styles.helper}>Pendiente de respuesta de la otra persona. Este abono todavía no reduce el saldo.</Text> : null}
                  </View>
                ))}
                {selectedDebt.creada_por !== session.user.id ? (
                  <Notice tone="success" message="Solo quien creó esta deuda puede registrar abonos. Revisa cada abono pendiente y acéptalo o recházalo." />
                ) : (
                <>
                <View style={styles.separator} />
                <SectionTitle title="Registrar un abono" subtitle="Solo quien creó la deuda puede registrar el pago a cuenta. Escribe o dicta el monto y revisa el resumen antes de guardar." />
                <View style={styles.modeSwitch}>
                  <TouchableOpacity
                    style={[styles.modeOption, paymentRegistrationMode === 'write' && styles.modeOptionSelected]}
                    onPress={() => {
                      if (debtSpeech.isListening) debtSpeech.stop();
                      void Speech.stop();
                      setPaymentRegistrationMode('write');
                      setPaymentTranscript('');
                      invalidatePaymentReview();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: paymentRegistrationMode === 'write' }}
                  >
                    <MaterialCommunityIcons name="keyboard-outline" size={19} color={paymentRegistrationMode === 'write' ? colors.teal : colors.muted} />
                    <Text style={[styles.modeLabel, paymentRegistrationMode === 'write' && styles.modeLabelSelected]}>Escribir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeOption, paymentRegistrationMode === 'voice' && styles.modeOptionSelected]}
                    onPress={() => {
                      if (debtSpeech.isListening) debtSpeech.stop();
                      void Speech.stop();
                      setPaymentRegistrationMode('voice');
                      setPaymentTranscript('');
                      invalidatePaymentReview();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: paymentRegistrationMode === 'voice' }}
                  >
                    <MaterialCommunityIcons name="microphone-outline" size={19} color={paymentRegistrationMode === 'voice' ? colors.teal : colors.muted} />
                    <Text style={[styles.modeLabel, paymentRegistrationMode === 'voice' && styles.modeLabelSelected]}>Por audio</Text>
                  </TouchableOpacity>
                </View>
                {paymentRegistrationMode === 'voice' ? (
                  <View style={styles.voiceSection}>
                    <Text style={styles.helper}>Di cuánto recibiste o pagaste a cuenta y agrega el detalle. Ejemplo: “Me dio 500 bolivianos en efectivo”.</Text>
                    <TouchableOpacity
                      style={[styles.recordButton, debtSpeech.isListening && styles.recordButtonActive]}
                      onPress={debtSpeech.isListening ? debtSpeech.stop : () => void startPaymentDictation()}
                      accessibilityRole="button"
                      accessibilityLabel={debtSpeech.isListening ? 'Detener dictado del abono' : 'Dictar abono'}
                    >
                      <MaterialCommunityIcons name={debtSpeech.isListening ? 'stop-circle-outline' : 'microphone'} size={22} color={colors.white} />
                      <Text style={styles.recordButtonText}>{debtSpeech.isListening ? 'Detener dictado' : 'Comenzar a dictar'}</Text>
                    </TouchableOpacity>
                    {paymentTranscript ? <View style={styles.transcriptCard}><Text style={styles.label}>Transcripción para revisar</Text><Text style={styles.bodyText}>{paymentTranscript}</Text></View> : null}
                  </View>
                ) : null}
                <Field label="Monto (Bs)" value={paymentAmount} onChangeText={value => { setPaymentAmount(value); invalidatePaymentReview(); }} placeholder="0,00" keyboardType="decimal-pad" />
                <Field label="Nota (opcional)" value={paymentNote} onChangeText={value => { setPaymentNote(value); invalidatePaymentReview(); }} placeholder="Efectivo, transferencia…" maxLength={500} />
                {paymentRegistrationMode === 'voice' ? (
                  <>
                    <TouchableOpacity
                      style={[styles.readSummaryButton, (!validAmount(paymentAmount) || isReadingPaymentReview || debtSpeech.isListening) && styles.disabled]}
                      onPress={readPaymentSummary}
                      disabled={!validAmount(paymentAmount) || isReadingPaymentReview || debtSpeech.isListening}
                      accessibilityRole="button"
                    >
                      <MaterialCommunityIcons name="volume-high" size={20} color={colors.teal} />
                      <Text style={styles.readSummaryText}>{isReadingPaymentReview ? 'Leyendo resumen…' : 'Escuchar y revisar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reviewCheckRow, !paymentReviewPlayed && styles.reviewCheckDisabled]}
                      onPress={() => setPaymentReviewConfirmed(value => !value)}
                      disabled={!paymentReviewPlayed}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: paymentReviewConfirmed, disabled: !paymentReviewPlayed }}
                    >
                      <View style={[styles.reviewCheckbox, paymentReviewConfirmed && styles.reviewCheckboxSelected]}>
                        {paymentReviewConfirmed ? <MaterialCommunityIcons name="check" size={15} color={colors.white} /> : null}
                      </View>
                      <Text style={styles.reviewCheckText}>Escuché y verifiqué el monto y el detalle del abono.</Text>
                    </TouchableOpacity>
                    {!paymentReviewPlayed ? <Text style={styles.helper}>Debes escuchar y confirmar el resumen antes de guardar.</Text> : null}
                  </>
                ) : null}
                <PrimaryButton
                  title="Registrar abono pendiente"
                  onPress={() => void createPayment(selectedDebt.id)}
                  busy={busy}
                  disabled={debtSpeech.isListening || isReadingPaymentReview || (paymentRegistrationMode === 'voice' && (!paymentReviewPlayed || !paymentReviewConfirmed))}
                />
                </>
                )}
              </View>
            ) : null}
          </>
        ) : null}

        {tab === 'registros' && showSharedDebtForm ? (
          <>
            <IconBackButton label="Regresar a Compartido" onPress={() => setShowSharedDebtForm(false)} />
            <SectionTitle title="Registrar deuda compartida" subtitle="Al guardar, la contraparte podrá verla en Compartido y confirmarla o pedir revisión." />
            <View style={styles.card}>
              <View style={styles.modeSwitch}>
                <TouchableOpacity
                  style={[styles.modeOption, registrationMode === 'write' && styles.modeOptionSelected]}
                  onPress={() => chooseRegistrationMode('write')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: registrationMode === 'write' }}
                >
                  <MaterialCommunityIcons name="keyboard-outline" size={20} color={registrationMode === 'write' ? colors.teal : colors.muted} />
                  <Text style={[styles.modeLabel, registrationMode === 'write' && styles.modeLabelSelected]}>Escribir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeOption, registrationMode === 'voice' && styles.modeOptionSelected]}
                  onPress={() => chooseRegistrationMode('voice')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: registrationMode === 'voice' }}
                >
                  <MaterialCommunityIcons name="microphone-outline" size={20} color={registrationMode === 'voice' ? colors.teal : colors.muted} />
                  <Text style={[styles.modeLabel, registrationMode === 'voice' && styles.modeLabelSelected]}>Por audio</Text>
                </TouchableOpacity>
              </View>

              {registrationMode === 'voice' ? (
                <View style={styles.voiceSection}>
                  <Text style={styles.helper}>Dicta quién debe, el monto y el motivo. Ejemplo: “Yo debo 120 bolivianos por mercadería”. El ID de la otra persona se ingresa al final.</Text>
                  <TouchableOpacity
                    style={[styles.recordButton, debtSpeech.isListening && styles.recordButtonActive]}
                    onPress={debtSpeech.isListening ? debtSpeech.stop : () => void startDebtDictation()}
                    accessibilityRole="button"
                    accessibilityLabel={debtSpeech.isListening ? 'Detener dictado' : 'Iniciar dictado de deuda'}
                  >
                    <MaterialCommunityIcons name={debtSpeech.isListening ? 'stop-circle-outline' : 'microphone'} size={24} color={colors.white} />
                    <Text style={styles.recordButtonText}>{debtSpeech.isListening ? 'Detener dictado' : 'Comenzar a dictar'}</Text>
                  </TouchableOpacity>
                  {voiceTranscript ? (
                    <View style={styles.transcriptCard}>
                      <Text style={styles.label}>Transcripción para revisar</Text>
                      <Text style={styles.bodyText}>{voiceTranscript}</Text>
                    </View>
                  ) : (
                    <EmptyState title="Todavía no hay transcripción" text="Toca el micrófono y dicta el monto y el motivo de la deuda." />
                  )}
                </View>
              ) : null}

              <Text style={styles.label}>Mi rol en esta deuda</Text>
              <View style={styles.roleRow}>
                <ChoiceButton title="Yo debo" selected={debtRole === 'deudor'} onPress={() => { setDebtRole('deudor'); invalidateVoiceReview(); }} />
                <ChoiceButton title="Me deben" selected={debtRole === 'acreedor'} onPress={() => { setDebtRole('acreedor'); invalidateVoiceReview(); }} />
              </View>
              <Field label="Monto (Bs)" value={debtAmount} onChangeText={value => { setDebtAmount(value); invalidateVoiceReview(); }} placeholder="0,00" keyboardType="decimal-pad" />
              <Field label="Motivo (opcional)" value={debtReason} onChangeText={value => { setDebtReason(value); invalidateVoiceReview(); }} placeholder="Detalle de la deuda" maxLength={500} />
              <Field label="ID de usuario de la contraparte" value={counterpart} onChangeText={value => { setCounterpart(value); invalidateVoiceReview(); }} placeholder="Pega aquí el ID que comparte desde Perfil" autoCapitalize="none" maxLength={36} />
              <Text style={styles.helper}>La otra persona debe tener cuenta en DeudaFácil. Puede copiar su ID desde Perfil. No ingreses tu propio ID.</Text>

              {registrationMode === 'voice' ? (
                <>
                  <TouchableOpacity
                    style={[styles.readSummaryButton, (!validAmount(debtAmount) || !isUuid(counterpart.trim()) || debtSpeech.isListening || isReadingReview) && styles.disabled]}
                    onPress={readDebtSummary}
                    disabled={!validAmount(debtAmount) || !isUuid(counterpart.trim()) || debtSpeech.isListening || isReadingReview}
                    accessibilityRole="button"
                  >
                    <MaterialCommunityIcons name={isReadingReview ? 'volume-high' : 'play-circle-outline'} size={22} color={colors.teal} />
                    <Text style={styles.readSummaryText}>{isReadingReview ? 'Leyendo resumen…' : 'Escuchar resumen de la deuda'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.reviewCheckRow, !reviewHasBeenPlayed && styles.reviewCheckDisabled]}
                    onPress={() => setReviewConfirmed(value => !value)}
                    disabled={!reviewHasBeenPlayed}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: reviewConfirmed, disabled: !reviewHasBeenPlayed }}
                  >
                    <View style={[styles.reviewCheckbox, reviewConfirmed && styles.reviewCheckboxSelected]}>
                      {reviewConfirmed ? <MaterialCommunityIcons name="check" size={16} color={colors.white} /> : null}
                    </View>
                    <Text style={styles.reviewCheckText}>Ya escuché y verifiqué el monto y los datos.</Text>
                  </TouchableOpacity>
                  {!reviewHasBeenPlayed ? <Text style={styles.helper}>Escucha el resumen antes de confirmar y registrar.</Text> : null}
                </>
              ) : null}
              <PrimaryButton
                title={registrationMode === 'voice' ? 'Confirmar y registrar deuda' : 'Registrar como pendiente'}
                onPress={createDebt}
                busy={busy}
                disabled={debtSpeech.isListening || isReadingReview || (registrationMode === 'voice' && (!reviewHasBeenPlayed || !reviewConfirmed))}
              />
            </View>
          </>
        ) : null}

        {tab === 'perfil' ? (
          <>
            <SectionTitle title="Mi perfil" subtitle="Información de tu cuenta DeudaFácil." />
            <View style={styles.card}>
              <ProfileDataRow label="Nombre" value={displayName || 'No disponible'} />
              <ProfileDataRow label={session.user.email ? 'Correo electrónico' : 'Celular'} value={session.user.email || session.user.phone || 'No disponible'} />
              <ProfileDataRow label="Celular" value={profile ? (profile.telefono || 'No registrado') : dashboardLoading ? 'Cargando…' : 'No disponible sin conexión'} />
              <View style={styles.profileIdRow}>
                <Text style={styles.label}>ID para compartir</Text>
                <Text selectable style={styles.accountId}>{profile?.id ?? (dashboardLoading ? 'Cargando…' : 'No disponible sin conexión')}</Text>
              </View>
            </View>
            <SectionTitle title="Suscripción" subtitle="Consulta tu plan y vuelve a comprobarlo después de que el equipo active Premium." />
            <View style={styles.card}>
              <Text style={styles.sectionHeading}>Mi plan</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.itemTitle}>{premiumPreview && plan?.plan !== 'premium' ? 'Premium (prueba local)' : plan ? (plan.plan === 'premium' ? 'Premium activo' : 'Plan gratis') : dashboardLoading ? 'Consultando plan…' : 'Estado no disponible'}</Text>
                {plan ? <StatusPill status={premiumPreview && plan.plan !== 'premium' ? 'premium' : plan.plan} /> : null}
              </View>
              {plan ? <Text style={styles.bodyText}>Precio: {formatMoney(plan.precio_mensual)} al mes</Text> : null}
              {plan?.vigente_hasta ? <Text style={styles.muted}>Vigente hasta {formatDate(plan.vigente_hasta)}</Text> : null}
              {plan?.plan !== 'premium' ? <Text style={styles.helper}>Después de pagar Bs 10, el equipo verificará el pago y activará Premium. La app no procesa pagos todavía.</Text> : null}
              {premiumPreview && plan?.plan !== 'premium' ? <Text style={styles.helper}>Esta prueba solo habilita la vista en el teléfono. El backend conserva sus validaciones y puede rechazar la creación del grupo.</Text> : null}
              {plan?.plan !== 'premium' ? <SmallButton title={premiumPreview ? 'Desactivar prueba de Pasanaku' : 'Probar plan Premium y abrir Pasanaku'} onPress={togglePremiumPreview} disabled={busy || dashboardLoading} /> : null}
              <SmallButton title="Comprobar activación" onPress={() => void refreshDashboard(true)} disabled={busy || dashboardLoading} />
              <Text style={styles.helper}>La app comprueba el plan al volver a abrirse y cada 30 segundos mientras estés en Perfil.</Text>
            </View>
            <PrimaryButton title="Cerrar sesión" onPress={requestSignOut} busy={busy} />
          </>
        ) : null}

        {tab === 'pasanaku' ? (
          <>
            {premiumPreview && plan?.plan !== 'premium' ? <Notice tone="success" message="Modo de prueba local: puedes revisar el flujo de Pasanaku. Crear o unirte a grupos requiere Premium vigente en el backend." /> : null}
            <View style={styles.headingRow}>
              <View style={styles.flex}>
                <SectionTitle title="Pasanaku" subtitle="Crea un grupo, invita a sus miembros y registra los aportes por turno." />
              </View>
              {hasPasanakuAccess ? <AddActionButton label="Crear Pasanaku" onPress={() => { setShowGroupForm(value => !value); setError(''); setNotice(''); }} /> : null}
            </View>
            {!hasPasanakuAccess ? (
              <EmptyState title="Necesitas Premium" text="Cada miembro debe tener Premium vigente. Revisa tu plan en Perfil para ver el precio y el proceso de activación." />
            ) : (
              <>
                {showGroupForm ? (
                  <View style={styles.card}>
                    <View style={styles.rowBetween}><Text style={styles.itemTitle}>Nuevo Pasanaku</Text><SmallButton title="Cerrar" onPress={() => setShowGroupForm(false)} secondary /></View>
                    <Text style={styles.helper}>El creador cuenta como primer miembro. El grupo empieza cuando se llenan los cupos.</Text>
                    <Field label="Nombre del Pasanaku" value={groupName} onChangeText={setGroupName} placeholder="Ej. Pasanaku del mercado" maxLength={80} />
                    <Field label="Cuota por turno (Bs)" value={groupFee} onChangeText={setGroupFee} placeholder="0,00" keyboardType="decimal-pad" />
                    <Field label="Cantidad de miembros (2–25)" value={groupSlots} onChangeText={value => setGroupSlots(value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="5" keyboardType="number-pad" />
                    <PrimaryButton title="Crear y generar invitación" onPress={createGroup} busy={busy} />
                    {inviteCode ? <View style={styles.codeBox}><Text style={styles.label}>Código para compartir con los miembros</Text><Text selectable style={styles.accountId}>{inviteCode}</Text></View> : null}
                  </View>
                ) : null}
                <View style={styles.card}>
                  <Text style={styles.itemTitle}>Unirme a un grupo</Text>
                  <Field label="Código de invitación" value={joinCode} onChangeText={setJoinCode} placeholder="UUID de invitación" autoCapitalize="none" />
                  <PrimaryButton title="Unirme al Pasanaku" onPress={joinGroup} busy={busy} />
                </View>
                <SectionTitle title="Mis grupos" subtitle="Selecciona un grupo para ver participantes y movimientos." />
                {groups.length === 0 ? <EmptyState title="No tienes grupos" text="Toca + para crear un Pasanaku o únete con un código de invitación." /> : null}
                {groups.map(group => (
                  <TouchableOpacity key={group.id} style={[styles.listCard, selectedGroup?.id === group.id && styles.selectedCard]} onPress={() => void perform(() => loadGroup(group.id))}>
                    <View style={styles.rowBetween}><Text style={styles.itemTitle}>{group.nombre}</Text><StatusPill status={group.estado} /></View>
                    <Text style={styles.muted}>{formatMoney(group.cuota)} por cuota · {group.cupos} cupos · turno {group.turno}</Text>
                  </TouchableOpacity>
                ))}
                {selectedGroup ? renderGroup(selectedGroup, session.user.id, busy, startGroup, recordContribution, confirmContribution) : null}
              </>
            )}
          </>
        ) : null}

        {tab === 'deudas' ? <Text style={styles.footer}>Tus registros personales se guardan en tu cuenta y se sincronizan. Las deudas compartidas están en Compartido.</Text> : null}
      </ScrollView>
      <BottomNavigation selected={tab} onSelect={nextTab => { if (nextTab !== tab && debtSpeech.isListening) debtSpeech.stop(); setTab(nextTab); }} />
    </SafeAreaView>
  );
}

function renderDebtCard(
  debt: Debt,
  profileId: string | undefined,
  userId: string,
  selectedDebtId: string | null,
  debtDetail: DebtDetail | null,
  setSelectedDebtId: (id: string | null) => void,
  onView: () => void,
  onRespond: (id: string, confirm: boolean) => void,
  onPayment: (id: string) => void,
  onRespondPayment: (movementId: string, confirm: boolean, debtId: string) => void,
  paymentAmount: string,
  setPaymentAmount: (value: string) => void,
  paymentNote: string,
  setPaymentNote: (value: string) => void,
  busy: boolean,
) {
  const otherId = debt.deudor_id === profileId ? debt.acreedor_id : debt.deudor_id;
  const isCreator = debt.creada_por === userId;
  return (
    <View key={debt.id} style={styles.listCard}>
      <View style={styles.rowBetween}><Text style={styles.itemTitle}>{formatMoney(debt.monto_inicial)}</Text><StatusPill status={debt.estado} /></View>
      <Text style={styles.muted}>{isCreator ? 'Registrada por ti' : 'Compartida contigo'} · {debtRoleLabel(debt, profileId)} · contraparte {shortId(otherId)} · {formatDate(debt.fecha_creacion)}</Text>
      {debt.motivo ? <Text style={styles.bodyText}>{debt.motivo}</Text> : null}
      {debt.estado === 'pendiente' && !isCreator ? (
        <View style={styles.actionRow}>
          <SmallButton title="Confirmar" onPress={() => onRespond(debt.id, true)} disabled={busy} />
          <SmallButton title="En revisión" secondary onPress={() => onRespond(debt.id, false)} disabled={busy} />
        </View>
      ) : null}
      {debt.estado === 'pendiente' && isCreator ? <Text style={styles.helper}>Pendiente de respuesta de la contraparte.</Text> : null}
      {debt.estado === 'en_revision' ? <Text style={styles.helper}>La contraparte pidió revisar este registro.</Text> : null}
      {debt.estado === 'confirmada' ? (
        <View style={styles.actionRow}>
          <SmallButton title={selectedDebtId === debt.id && debtDetail ? 'Ocultar saldo y abonos' : 'Ver saldo y abonos'} onPress={() => selectedDebtId === debt.id && debtDetail ? setSelectedDebtId(null) : onView()} disabled={busy} />
          {selectedDebtId === debt.id && debtDetail ? <Text style={styles.helper}>Saldo actual: {formatMoney(debtDetail.balance?.saldo_pendiente ?? debt.monto_inicial)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function renderGroup(
  group: PasanacuDetail,
  userId: string,
  busy: boolean,
  onStart: (id: string) => void,
  onContribution: (group: PasanacuDetail) => void,
  onConfirm: (group: PasanacuDetail, contributor: string) => void,
) {
  const members = group.pasanacu_miembros ?? [];
  const contributions = group.pasanacu_aportes ?? [];
  const myMember = members.find(member => member.perfil_id === userId);
  const beneficiary = members.find(member => member.posicion === group.turno);
  const turnContributions = contributions.filter(item => item.turno === group.turno);
  const myTurnEntry = turnContributions.some(item => item.aportante_id === userId);
  const canContribute = group.estado === 'activo' && myMember?.posicion !== group.turno && !myTurnEntry;
  const canStart = group.estado === 'abierto' && group.creador_id === userId && members.length === group.cupos;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}><Text style={styles.itemTitle}>{group.nombre}</Text><StatusPill status={group.estado} /></View>
      <Text style={styles.bodyText}>Cuota: {formatMoney(group.cuota)} · {members.length}/{group.cupos} participantes</Text>
      {group.estado === 'abierto' ? <Text style={styles.helper}>El creador inicia el grupo cuando se llenen todos los cupos.</Text> : null}
      {canStart ? <SmallButton title="Iniciar Pasanacu" onPress={() => onStart(group.id)} disabled={busy} /> : null}
      {group.estado === 'activo' ? (
        <View style={styles.balanceBox}>
          <Text style={styles.label}>Turno actual: {group.turno} de {group.cupos}</Text>
          <Text style={styles.bodyText}>Beneficiario: {beneficiary ? (beneficiary.perfil_id === userId ? 'Tú' : shortId(beneficiary.perfil_id)) : 'Sin asignar'}</Text>
          <Text style={styles.helper}>{canContribute ? 'Registra tu cuota cuando la hayas entregado fuera de la app.' : myMember?.posicion === group.turno ? 'Eres beneficiario: confirma cada aporte cuando lo recibas.' : myTurnEntry ? 'Tu aporte de este turno ya está registrado.' : ''}</Text>
          {canContribute ? <SmallButton title="Registrar mi aporte" onPress={() => onContribution(group)} disabled={busy} /> : null}
        </View>
      ) : null}
      {group.estado === 'completado' ? <Text style={styles.helper}>Este Pasanacu completó todos sus turnos.</Text> : null}
      <Text style={styles.label}>Participantes</Text>
      {members.map(member => (
        <Text key={member.perfil_id} style={styles.muted}>#{member.posicion} · {member.perfil_id === userId ? 'Tú' : shortId(member.perfil_id)}{member.posicion === group.turno && group.estado === 'activo' ? ' · beneficiario' : ''}</Text>
      ))}
      {group.estado === 'activo' ? (
        <>
          <Text style={[styles.label, styles.topGap]}>Aportes del turno actual</Text>
          {turnContributions.length === 0 ? <Text style={styles.muted}>Aún no hay aportes registrados.</Text> : null}
          {turnContributions.map(contribution => (
            <View key={`${contribution.turno}-${contribution.aportante_id}`} style={styles.movement}>
              <View style={styles.rowBetween}>
                <Text style={styles.bodyText}>{contribution.aportante_id === userId ? 'Tu aporte' : shortId(contribution.aportante_id)} · {formatMoney(group.cuota)}</Text>
                <StatusPill status={contribution.confirmado_en ? 'confirmado' : 'pendiente'} />
              </View>
              {contribution.confirmado_en ? <Text style={styles.muted}>Recepción confirmada {formatDate(contribution.confirmado_en)}</Text> : null}
              {myMember?.posicion === group.turno && !contribution.confirmado_en ? <SmallButton title="Confirmar recepción" onPress={() => onConfirm(group, contribution.aportante_id)} disabled={busy} /> : null}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={[styles.brand, compact && styles.brandCompact]}><Image source={require('./assets/deudafacil-logo.png')} style={[styles.brandLogo, compact && styles.brandLogoCompact]} resizeMode="contain" accessibilityLabel="Logo de DeudaFácil" />{!compact ? <><Text style={styles.brandName}>Deuda<Text style={styles.brandAccent}>Fácil</Text></Text><Text style={styles.brandTag}>CUENTAS CLARAS, TRATO JUSTO</Text></> : null}</View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.muted} /></View>;
}

function PasswordField(props: React.ComponentProps<typeof TextInput> & { label: string; visible: boolean; onToggleVisibility: () => void }) {
  const { label, visible, onToggleVisibility, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordInputWrap}>
        <TextInput {...inputProps} secureTextEntry={!visible} style={[styles.input, styles.passwordInput]} placeholderTextColor={colors.muted} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          accessibilityState={{ selected: visible }}
          style={styles.passwordToggle}
          onPress={onToggleVisibility}
        >
          <View style={styles.eyeIcon}>
            <View style={styles.eyePupil} />
            {!visible ? <View style={styles.eyeSlash} /> : null}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PrimaryButton({ title, onPress, busy, disabled = false }: { title: string; onPress: () => void; busy: boolean; disabled?: boolean }) {
  return <TouchableOpacity style={[styles.primaryButton, (busy || disabled) && styles.disabled]} onPress={onPress} disabled={busy || disabled}>
    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
  </TouchableOpacity>;
}

function AddActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.addActionButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name="plus" size={28} color={colors.white} />
    </TouchableOpacity>
  );
}

function IconBackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.backIconButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name="arrow-left" size={23} color={colors.ink} />
    </TouchableOpacity>
  );
}

function SmallButton({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <TouchableOpacity style={[styles.smallButton, secondary && styles.smallButtonSecondary, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
    <Text style={[styles.smallButtonText, secondary && styles.smallButtonTextSecondary]}>{title}</Text>
  </TouchableOpacity>;
}

function ProfileDataRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.profileDataRow}><Text style={styles.label}>{label}</Text><Text selectable style={styles.profileValue}>{value}</Text></View>;
}

function ChoiceButton({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{title}</Text></TouchableOpacity>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionHeading}>{title}</Text>{subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}</View>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <View style={styles.empty}><Text style={styles.itemTitle}>{title}</Text><Text style={styles.muted}>{text}</Text></View>;
}

function Notice({ tone, message, actionLabel, onAction }: { tone: 'error' | 'success'; message: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={[styles.notice, tone === 'error' ? styles.noticeError : styles.noticeSuccess]}><Text style={styles.noticeText}>{message}</Text>{actionLabel && onAction ? <SmallButton title={actionLabel} onPress={onAction} secondary /> : null}</View>;
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  return <View style={[styles.pill, status === 'pendiente' || status === 'abierto' || status === 'gratis' ? styles.pillPending : status === 'en_revision' || status === 'reportado' ? styles.pillReview : styles.pillOk]}><Text style={styles.pillText}>{label ?? statusLabel(status)}</Text></View>;
}

function Center({ children }: { children: React.ReactNode }) { return <View style={styles.center}>{children}</View>; }

function validAmount(value: string): boolean {
  const normalized = value.trim().replace(',', '.');
  return /^\d{1,10}(\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  return `Bs ${Number.isFinite(amount) ? amount.toFixed(2).replace('.', ',') : '0,00'}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-BO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function shortId(value: string): string { return `${value.slice(0, 8)}…`; }

function debtRoleLabel(debt: Debt, profileId?: string): string {
  if (debt.deudor_id === profileId) return 'Tú debes';
  if (debt.acreedor_id === profileId) return 'Te deben';
  return 'Deuda compartida';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendiente: 'Pendiente', confirmada: 'Confirmada', en_revision: 'En revisión', pagada: 'Pagada', cancelada: 'Cancelada',
    confirmado: 'Confirmado', reportado: 'Reportado', gratis: 'Gratis', premium: 'Premium', abierto: 'Abierto', activo: 'Activo', completado: 'Completado',
  };
  return labels[status] ?? status;
}

function friendlyAuthError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : 'Intenta nuevamente.';
  if (/phone_provider_disabled|phone.*disabled|sms.*disabled/i.test(message)) return 'El acceso por celular está desactivado en Supabase Auth. Activa Phone y configura un proveedor SMS, como Vonage.';
  if (/vonage|messagebird|twilio|whatsapp.*provider|sms provider|phone.*provider/i.test(message)) return 'Supabase no pudo enviar el SMS. Revisa el proveedor y sus credenciales en Auth > Providers > Phone.';
  if (/rate.?limit|too many requests/i.test(message)) return 'Solicitaste varios códigos. Espera un minuto antes de volver a intentarlo.';
  if (/otp.*expired|token.*expired/i.test(message)) return 'El código venció. Solicita uno nuevo por WhatsApp.';
  if (/invalid.*otp|otp.*invalid|token.*invalid/i.test(message)) return 'El código no es correcto. Revísalo e inténtalo otra vez.';
  if (/invalid login credentials/i.test(message)) return 'El correo o la contraseña no son correctos.';
  if (/email not confirmed/i.test(message)) return 'Confirma tu correo desde el enlace que te enviamos y vuelve a iniciar sesión.';
  return message;
}

const colors = { ink: '#152C28', teal: '#138879', pale: '#E9F6F2', muted: '#71817B', line: '#DCE7E2', white: '#FFFFFF', red: '#A83E37' };
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pale }, flex: { flex: 1 },
  page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 34 },
  splashContent: { alignItems: 'center', paddingHorizontal: 24 }, splashWelcome: { color: colors.ink, fontSize: 29, fontWeight: '800', marginTop: -12 }, splashSubtitle: { color: colors.muted, fontSize: 14, marginTop: 8, textAlign: 'center' },
  dashboard: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 }, dashboardWithBottomNav: { paddingBottom: 30 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backIconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  addActionButton: { width: 50, height: 50, borderRadius: 17, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: colors.ink, shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  debtListHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 7, marginBottom: 12 }, debtTitleCopy: { flex: 1 }, addDebtButton: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: colors.ink, shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  eyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.3, fontWeight: '800', marginBottom: 8 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 18 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  brand: { alignItems: 'center', marginBottom: 26 }, brandCompact: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  brandLogo: { width: 92, height: 92, marginBottom: 8 }, brandLogoCompact: { width: 40, height: 40, marginBottom: 0 },
  brandName: { color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: -1 }, brandAccent: { color: colors.teal }, brandTag: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },
  welcome: { color: colors.ink, fontSize: 25, fontWeight: '800' }, dashboardSubtitle: { color: colors.muted, fontSize: 13, marginTop: 3, marginBottom: 14 },
  accountId: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 5 }, profileDataRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line }, profileValue: { color: colors.ink, fontSize: 14, lineHeight: 20 }, profileIdRow: { paddingTop: 14 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#EFF3F0', marginBottom: 14, shadowColor: '#254E43', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  field: { marginBottom: 13 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 13, color: colors.ink, backgroundColor: '#FCFDFC', fontSize: 14 },
  phoneInputWrap: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: '#FCFDFC' }, phonePrefix: { color: colors.ink, fontSize: 15, fontWeight: '800', paddingHorizontal: 14, borderRightWidth: 1, borderRightColor: colors.line }, phoneInput: { minHeight: 48, flex: 1, paddingHorizontal: 12, color: colors.ink, fontSize: 15 },
  passwordInputWrap: { justifyContent: 'center' }, passwordInput: { paddingRight: 56 }, passwordToggle: { position: 'absolute', right: 4, top: 3, width: 44, height: 42, alignItems: 'center', justifyContent: 'center' }, eyeIcon: { width: 20, height: 14, borderWidth: 1.8, borderColor: colors.muted, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, eyePupil: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.teal }, eyeSlash: { position: 'absolute', width: 24, height: 2, backgroundColor: colors.muted, transform: [{ rotate: '-38deg' }] },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#EAF3EF', borderRadius: 13, padding: 4, marginBottom: 16, gap: 5 }, modeOption: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10 }, modeOptionSelected: { backgroundColor: colors.white, elevation: 1 }, modeLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' }, modeLabelSelected: { color: colors.teal }, voiceSection: { marginBottom: 14, gap: 10 }, recordButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16 }, recordButtonActive: { backgroundColor: colors.red }, recordButtonText: { color: colors.white, fontSize: 14, fontWeight: '800' }, transcriptCard: { backgroundColor: '#F8FBF9', borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 13 },
  readSummaryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.teal, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 }, readSummaryText: { color: colors.teal, fontWeight: '800', fontSize: 13 }, reviewCheckRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }, reviewCheckDisabled: { opacity: 0.5 }, reviewCheckbox: { width: 23, height: 23, borderWidth: 1.5, borderColor: colors.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, reviewCheckboxSelected: { backgroundColor: colors.teal, borderColor: colors.teal }, reviewCheckText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 50, borderRadius: 13, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginTop: 5, paddingHorizontal: 14 }, primaryText: { color: colors.white, fontWeight: '800', fontSize: 14 }, disabled: { opacity: 0.55 },
  smallButton: { minHeight: 38, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, marginTop: 8, alignSelf: 'flex-start' }, smallButtonSecondary: { backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line }, smallButtonText: { color: colors.white, fontWeight: '800', fontSize: 12 }, smallButtonTextSecondary: { color: colors.ink },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 }, switchHint: { color: colors.muted, fontSize: 13 }, switchAction: { color: colors.teal, fontWeight: '800', fontSize: 13 }, resendButton: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  sectionTitle: { marginTop: 7, marginBottom: 10 }, sectionHeading: { color: colors.ink, fontSize: 19, fontWeight: '800', marginBottom: 4 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, bodyText: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 6 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 }, choice: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 11, alignItems: 'center', padding: 12 }, choiceSelected: { backgroundColor: colors.pale, borderColor: colors.teal }, choiceText: { color: colors.muted, fontWeight: '700' }, choiceTextSelected: { color: colors.teal },
  listCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 15, marginBottom: 10 }, selectedCard: { borderColor: colors.teal, borderWidth: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, itemTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', flexShrink: 1 }, actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 }, pillPending: { backgroundColor: '#FFF1D6' }, pillReview: { backgroundColor: '#FCE4E2' }, pillOk: { backgroundColor: '#DDF3E9' }, pillText: { color: colors.ink, fontSize: 10, fontWeight: '800' },
  balanceBox: { backgroundColor: colors.pale, borderRadius: 13, padding: 14, marginVertical: 9 }, balanceAmount: { color: colors.teal, fontSize: 24, fontWeight: '800' }, movement: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line }, separator: { height: 1, backgroundColor: colors.line, marginVertical: 14 }, topGap: { marginTop: 16 },
  empty: { backgroundColor: '#F8FBF9', borderColor: colors.line, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 16, marginBottom: 12, gap: 5 }, codeBox: { backgroundColor: colors.pale, padding: 13, borderRadius: 12, marginTop: 12 },
  notice: { borderRadius: 13, padding: 13, marginBottom: 10 }, noticeError: { backgroundColor: '#FCE4E2' }, noticeSuccess: { backgroundColor: '#DDF3E9' }, noticeText: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 }, footer: { textAlign: 'center', color: colors.muted, fontSize: 11, marginTop: 18 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
});
