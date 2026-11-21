import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';

type Profile = { nombre: string; telefono: string | null };
type Screen = 'login' | 'register' | 'verify';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (resendAvailableAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) void loadProfile(session.user.id);
    else setProfile(null);
  }, [session?.user.id]);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('perfiles')
      .select('nombre, telefono')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      Alert.alert('No se pudo cargar el perfil', error.message);
      return;
    }
    if (data) {
      setProfile(data);
      setNombre(data.nombre);
      setTelefono(formatPhoneForInput(data.telefono ?? session?.user.phone ?? ''));
    } else {
      const newName = session?.user.user_metadata?.nombre || session?.user.phone || 'Usuario';
      const { data: created, error: insertError } = await supabase
        .from('perfiles')
        .upsert({ id: userId, nombre: newName, telefono: session?.user.phone ?? null })
        .select('nombre, telefono')
        .single();
      if (insertError) Alert.alert('No se pudo crear el perfil', insertError.message);
      else {
        setProfile(created);
        setNombre(created.nombre);
      }
    }
  }

  async function submitAuth() {
    if (screen === 'verify') {
      if (otp.trim().length !== 6) {
        Alert.alert('Código incompleto', 'Escribe los 6 dígitos que recibiste por SMS.');
        return;
      }
      setBusy(true);
      try {
        const { error } = await supabase.auth.verifyOtp({ phone: pendingPhone, token: otp.trim(), type: 'sms' });
        if (error) throw error;
      } catch (error) {
        Alert.alert('No se pudo verificar', error instanceof Error ? error.message : 'Revisa el código e intenta nuevamente.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const phone = normalizeBoliviaPhone(telefono);
    if (!phone) {
      Alert.alert('Revisa tu celular', 'Escribe un número boliviano válido de 8 dígitos, por ejemplo 70000000.');
      return;
    }
    if (password.length < 6 || (screen === 'register' && !nombre.trim())) {
      Alert.alert('Revisa los datos', 'Completa tu nombre y una contraseña de al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      if (screen === 'register') {
        const { data, error } = await supabase.auth.signUp({
          phone,
          password,
          options: { data: { nombre: nombre.trim(), telefono: phone } },
        });
        if (error) throw error;
        if (!data.session) {
          setPendingPhone(phone);
          setTelefono(formatPhoneForInput(phone));
          setOtp('');
          setResendAvailableAt(Date.now() + 60_000);
          setScreen('verify');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ phone, password });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert('No se pudo continuar', friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendPhoneCode() {
    if (resendAvailableAt && resendAvailableAt > Date.now()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'sms', phone: pendingPhone });
      if (error) throw error;
      setResendAvailableAt(Date.now() + 60_000);
      Alert.alert('Código enviado', 'Revisa los mensajes SMS de tu celular.');
    } catch (error) {
      Alert.alert('No se pudo reenviar', friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!session?.user || !nombre.trim()) {
      Alert.alert('Falta tu nombre', 'Escribe el nombre que quieres mostrar en tu cuenta.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from('perfiles')
      .upsert({ id: session.user.id, nombre: nombre.trim(), telefono: session.user.phone ?? profile?.telefono ?? null })
      .select('nombre, telefono')
      .single();
    setBusy(false);
    if (error) Alert.alert('No se pudo guardar', error.message);
    else {
      setProfile(data);
      Alert.alert('Perfil actualizado', 'Tus datos se guardaron en DeudaFácil.');
    }
  }

  if (loading) return <Center><ActivityIndicator size="large" color={colors.teal} /></Center>;

  if (session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Brand />
          <View style={styles.card}>
            <Text style={styles.eyebrow}>MI CUENTA</Text>
            <Text style={styles.title}>Hola{profile?.nombre ? `, ${profile.nombre.split(' ')[0]}` : ''}</Text>
            <Text style={styles.subtitle}>Tus datos ayudan a identificar tus cuentas compartidas.</Text>
            <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Tu nombre" />
            <View style={styles.readOnly}>
              <Text style={styles.label}>Celular</Text>
              <Text style={styles.readOnlyText}>{session.user.phone ?? profile?.telefono ?? 'No registrado'}</Text>
            </View>
            <PrimaryButton title="Guardar perfil" onPress={saveProfile} busy={busy} />
            <TouchableOpacity style={styles.secondaryButton} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.secondaryText}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footer}>Tus registros se guardan asociados a tu cuenta.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <Brand />
          <View style={styles.card}>
            <Text style={styles.eyebrow}>{screen === 'login' ? 'BIENVENIDO DE VUELTA' : screen === 'register' ? 'EMPIEZA GRATIS' : 'VERIFICA TU CELULAR'}</Text>
            <Text style={styles.title}>{screen === 'login' ? 'Ingresa a tu cuenta' : screen === 'register' ? 'Crea tu cuenta' : 'Confirma tu número'}</Text>
            <Text style={styles.subtitle}>{screen === 'verify' ? `Escribe el código de 6 dígitos enviado por SMS a ${pendingPhone}.` : 'Lleva tus cuentas claras, de forma sencilla.'}</Text>
            {screen === 'verify' ? (
              <>
                <Field label="Código SMS" value={otp} onChangeText={setOtp} placeholder="000000" keyboardType="number-pad" maxLength={6} />
                <PrimaryButton title="Confirmar código" onPress={submitAuth} busy={busy} />
                <TouchableOpacity style={styles.secondaryButton} onPress={resendPhoneCode} disabled={busy || Boolean(resendAvailableAt && resendAvailableAt > now)}>
                  <Text style={styles.secondaryText}>{resendAvailableAt && resendAvailableAt > now ? `Reenviar código en ${Math.ceil((resendAvailableAt - now) / 1000)} s` : 'Reenviar código por SMS'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setScreen('login')}>
                  <Text style={styles.secondaryText}>Volver al inicio de sesión</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {screen === 'register' && <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Cómo te llamamos" />}
                <Field label="Celular de Bolivia" value={telefono} onChangeText={setTelefono} placeholder="70000000" keyboardType="phone-pad" />
                <Text style={styles.helper}>Usaremos el código de país +591.</Text>
                <Field label="Contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" secureTextEntry />
                <PrimaryButton title={screen === 'login' ? 'Iniciar sesión' : 'Crear cuenta'} onPress={submitAuth} busy={busy} />
                <View style={styles.switchRow}>
                  <Text style={styles.switchHint}>{screen === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?'}</Text>
                  <TouchableOpacity onPress={() => setScreen(screen === 'login' ? 'register' : 'login')}>
                    <Text style={styles.switchAction}>{screen === 'login' ? 'Regístrate' : 'Inicia sesión'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
          <Text style={styles.footer}>Finanzas sencillas para el día a día.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Brand() {
  return <View style={styles.brand}><View style={styles.brandMark}><Text style={styles.brandMarkText}>D</Text></View><Text style={styles.brandName}>Deuda<Text style={styles.brandAccent}>Fácil</Text></Text><Text style={styles.brandTag}>CUENTAS CLARAS, TRATO JUSTO</Text></View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.muted} /></View>;
}

function PrimaryButton({ title, onPress, busy }: { title: string; onPress: () => void; busy: boolean }) {
  return <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} onPress={onPress} disabled={busy}>
    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
  </TouchableOpacity>;
}

function Center({ children }: { children: React.ReactNode }) { return <View style={styles.center}>{children}</View>; }

function normalizeBoliviaPhone(value: string): string | null {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) return `+591${digits}`;
  if (digits.length === 11 && digits.startsWith('591')) return `+${digits}`;
  return null;
}

function formatPhoneForInput(value: string): string {
  if (value.startsWith('+591')) return value.slice(4);
  if (value.startsWith('591') && value.length === 11) return value.slice(3);
  return value;
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Intenta nuevamente.';
  if (/phone provider.*disabled|phone.*provider.*disabled/i.test(message)) {
    return 'El acceso con celular está desactivado en Supabase. Actívalo en Authentication > Sign In / Providers > Phone.';
  }
  if (/sms provider|twilio|sms.*not configured/i.test(message)) {
    return 'Supabase necesita un proveedor de SMS para enviar códigos. Configura uno en Authentication > Sign In / Providers > Phone.';
  }
  const wait = message.match(/only request this after (\d+) seconds/i);
  if (wait) return `Por seguridad, espera ${wait[1]} segundos antes de volver a solicitar un código.`;
  return message;
}

const colors = { ink: '#152C28', teal: '#138879', pale: '#E9F6F2', muted: '#82908B', line: '#DCE7E2', white: '#FFFFFF' };
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pale }, flex: { flex: 1 },
  page: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 34 },
  brand: { alignItems: 'center', marginBottom: 26 }, brandMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  brandMarkText: { color: colors.white, fontSize: 27, fontWeight: '800' }, brandName: { color: colors.ink, fontSize: 28, fontWeight: '800', letterSpacing: -1 }, brandAccent: { color: colors.teal }, brandTag: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: '#EFF3F0', shadowColor: '#254E43', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  eyebrow: { color: colors.teal, fontSize: 11, letterSpacing: 1.3, fontWeight: '800', marginBottom: 8 }, title: { color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.6 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 18 },
  field: { marginBottom: 14 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 7 }, input: { height: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 14, color: colors.ink, backgroundColor: '#FCFDFC', fontSize: 15 }, helper: { color: colors.muted, fontSize: 12, marginTop: -8, marginBottom: 13 },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, primaryText: { color: colors.white, fontWeight: '800', fontSize: 15 }, disabled: { opacity: 0.65 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18 }, switchHint: { color: colors.muted, fontSize: 13 }, switchAction: { color: colors.teal, fontWeight: '800', fontSize: 13 },
  readOnly: { paddingVertical: 8, marginBottom: 12 }, readOnlyText: { color: colors.muted, fontSize: 15 }, secondaryButton: { alignItems: 'center', padding: 16 }, secondaryText: { color: colors.teal, fontWeight: '700' },
  footer: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 18 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
});
