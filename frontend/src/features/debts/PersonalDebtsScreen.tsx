import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { parsePersonalDebtStatement } from './parsePersonalDebtStatement';
import { useDebtSpeechInput } from './useDebtSpeechInput';
import type { NewPersonalDebt, NewPersonalDebtEntry, PersonalDebt, PersonalDebtDirection, PersonalDebtInputMethod } from './personalDebtStorage';

type Props = {
  debts: PersonalDebt[];
  loading: boolean;
  loadError: string;
  onCreate: (debt: NewPersonalDebt) => Promise<void>;
  onAddEntry: (debtId: string, entry: NewPersonalDebtEntry) => Promise<void>;
};

type Page = 'list' | 'create' | 'detail' | 'entry';
type FormMode = 'write' | 'voice';

const colors = { ink: '#152C28', teal: '#138879', pale: '#E9F6F2', muted: '#71817B', line: '#DCE7E2', white: '#FFFFFF', red: '#A83E37' };

export function PersonalDebtsScreen({ debts, loading, loadError, onCreate, onAddEntry }: Props) {
  const [page, setPage] = useState<Page>('list');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [person, setPerson] = useState('');
  const [direction, setDirection] = useState<PersonalDebtDirection>('yo_debo');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<FormMode>('write');
  const [transcript, setTranscript] = useState('');
  const [reviewPlayed, setReviewPlayed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [readingReview, setReadingReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const speechInput = useDebtSpeechInput();

  const selectedDebt = debts.find(item => item.id === selectedDebtId) ?? null;
  const balance = selectedDebt ? getBalance(selectedDebt) : 0;

  function resetReview() {
    setReviewPlayed(false);
    setReviewConfirmed(false);
  }

  function clearForm() {
    setPerson('');
    setDirection('yo_debo');
    setAmount('');
    setNote('');
    setTranscript('');
    setMode('write');
    resetReview();
    setError('');
    setSuccess('');
  }

  function openCreate() {
    clearForm();
    setPage('create');
  }

  function openEntry() {
    clearForm();
    setPage('entry');
  }

  function setFormMode(nextMode: FormMode) {
    if (speechInput.isListening) speechInput.stop();
    void Speech.stop();
    setMode(nextMode);
    setTranscript('');
    resetReview();
  }

  async function startDictation() {
    setError('');
    setSuccess('');
    setAmount('');
    setNote('');
    setTranscript('');
    resetReview();
    await speechInput.start((spokenText, isFinal) => {
      setTranscript(spokenText);
      if (!isFinal) return;
      const parsed = parsePersonalDebtStatement(spokenText);
      if (parsed.person) setPerson(parsed.person);
      if (parsed.direction) setDirection(parsed.direction);
      setNote(parsed.note);
      setAmount(parsed.amount ?? '');
      resetReview();
      if (page === 'create' && !parsed.person && !person.trim()) {
        setError('No reconocí el nombre. Prueba “debo a José 800 Bs de cereal” o “José me debe 800 Bs” y revisa el campo del nombre.');
      } else if (!parsed.amount) {
        setError('No detecté un monto exacto. Escríbelo y escucha el resumen antes de guardar.');
      } else {
        setError('');
      }
    }, setError);
  }

  function playReview() {
    if (!validateForm()) return;
    const amountWords = Number(amount.trim().replace(',', '.')).toFixed(2).replace('.', ' coma ');
    const text = page === 'create'
      ? `${direction === 'yo_debo' ? `Registraremos que le debes` : `Registraremos que te debe`} ${person.trim()} ${amountWords} bolivianos. ${note.trim() ? `Detalle: ${note.trim()}.` : 'Sin detalle adicional.'} La fecha y hora se guardarán automáticamente.`
      : `${selectedDebt?.direction === 'yo_debo' ? `Registraré que pagaste a ${selectedDebt.person}` : `${selectedDebt?.person} te pagó`} ${amountWords} bolivianos a cuenta. ${note.trim() ? `Detalle: ${note.trim()}.` : 'Sin detalle adicional.'} La fecha y hora se guardarán automáticamente.`;

    resetReview();
    setError('');
    void Speech.stop();
    Speech.speak(text, {
      language: 'es-ES',
      rate: 0.88,
      onStart: () => setReadingReview(true),
      onDone: () => {
        setReadingReview(false);
        setReviewPlayed(true);
      },
      onStopped: () => setReadingReview(false),
      onError: () => {
        setReadingReview(false);
        setError('No se pudo leer el resumen. Revisa el volumen y vuelve a intentarlo.');
      },
    });
  }

  function validateForm(): boolean {
    if (page === 'create' && (!person.trim() || person.trim().length > 120)) {
      setError('Escribe el nombre de la persona (máximo 120 caracteres).');
      return false;
    }
    if (!isValidAmount(amount)) {
      setError('Ingresa un monto positivo con hasta dos decimales.');
      return false;
    }
    if (note.trim().length > 500) {
      setError('El detalle admite hasta 500 caracteres.');
      return false;
    }
    if (page === 'entry' && Number(amount.replace(',', '.')) > balance) {
      setError(`El abono no puede ser mayor al saldo actual de ${money(balance)}.`);
      return false;
    }
    return true;
  }

  async function submitForm() {
    if (page !== 'create' && page !== 'entry') return;
    if (!validateForm()) return;
    if (mode === 'voice' && (!reviewPlayed || !reviewConfirmed)) {
      setError('Escucha el resumen y confirma los datos antes de guardar.');
      return;
    }
    if (page === 'entry' && !selectedDebt) {
      setError('No se encontró la deuda seleccionada. Vuelve a Mis deudas e inténtalo otra vez.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    const normalizedAmount = Number(amount.trim().replace(',', '.')).toFixed(2);
    const inputMethod: PersonalDebtInputMethod = mode;
    try {
      if (page === 'create') {
        await onCreate({ person: person.trim(), direction, initialAmount: normalizedAmount, note: note.trim(), inputMethod });
        setPage('list');
      } else if (selectedDebt) {
        await onAddEntry(selectedDebt.id, { amount: normalizedAmount, note: note.trim(), inputMethod });
        setPage('detail');
      }
      clearForm();
      setSuccess(page === 'create' ? 'Deuda personal guardada en este dispositivo.' : 'Abono guardado con su fecha y hora.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar. Intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  function backToList() {
    if (speechInput.isListening) speechInput.stop();
    void Speech.stop();
    setPage('list');
    setError('');
  }

  if (page === 'list') {
    return (
      <View>
        <View style={styles.headingRow}>
          <View style={styles.flex}>
            <Text style={styles.title}>Mis deudas</Text>
            <Text style={styles.muted}>Tu control personal: a quién debes o quién te debe.</Text>
          </View>
          <TouchableOpacity style={[styles.addButton, loading && styles.disabled]} onPress={openCreate} disabled={loading} accessibilityRole="button" accessibilityLabel="Agregar deuda personal">
            <MaterialCommunityIcons name="plus" size={30} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.localNote}>Guardado en este dispositivo · puedes agregar abonos en cada deuda</Text>
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.teal} /><Text style={styles.muted}>Cargando tus deudas…</Text></View> : null}
        {loadError ? <Message tone="error" text={loadError} /> : null}
        {error ? <Message tone="error" text={error} /> : null}
        {success ? <Message tone="success" text={success} /> : null}
        {!loading && debts.length === 0 ? <EmptyState title="Aún no tienes deudas" text="Toca + para registrar a quién debes o quién te debe." /> : null}
        {debts.map(debt => {
          const remaining = getBalance(debt);
          const isPaid = remaining <= 0;
          return (
            <TouchableOpacity key={debt.id} style={styles.debtCard} onPress={() => { setSelectedDebtId(debt.id); setPage('detail'); setError(''); setSuccess(''); }} accessibilityRole="button">
              <View style={styles.between}>
                <Text style={styles.person}>{debt.person}</Text>
                <Text style={[styles.directionTag, debt.direction === 'yo_debo' ? styles.tagOwed : styles.tagReceivable]}>{debt.direction === 'yo_debo' ? 'Debes' : 'Te deben'}</Text>
              </View>
              <View style={styles.between}>
                <Text style={styles.amount}>{money(remaining)}</Text>
                <Text style={[styles.statusTag, isPaid ? styles.tagPaid : styles.tagPending]}>{isPaid ? 'Pagado' : 'Pendiente'}</Text>
              </View>
              <Text style={styles.muted}>Registrada {formatDateTime(debt.createdAt)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  if (page === 'detail') {
    if (!selectedDebt) {
      return <View><SmallButton title="Volver a Mis deudas" onPress={backToList} /><EmptyState title="No se encontró el registro" text="Vuelve a Mis deudas y selecciona un registro existente." /></View>;
    }
    const paid = Number(selectedDebt.initialAmount) - balance;
    const entryLabel = selectedDebt.direction === 'yo_debo' ? 'Pagué a cuenta' : 'Me pagó a cuenta';
    return (
      <View>
        <SmallButton title="Volver a Mis deudas" onPress={backToList} secondary />
        <View style={styles.detailCard}>
          <View style={styles.between}>
            <Text style={styles.title}>{selectedDebt.person}</Text>
            <Text style={[styles.directionTag, selectedDebt.direction === 'yo_debo' ? styles.tagOwed : styles.tagReceivable]}>{selectedDebt.direction === 'yo_debo' ? 'Tú debes' : 'Te deben'}</Text>
          </View>
          <Text style={[styles.statusTag, balance <= 0 ? styles.tagPaid : styles.tagPending]}>{balance <= 0 ? 'Pagado' : 'Pendiente'}</Text>
          <Text style={styles.muted}>Registro creado {formatDateTime(selectedDebt.createdAt)}</Text>
          <View style={styles.amountGrid}>
            <AmountStat label="Monto inicial" value={money(selectedDebt.initialAmount)} />
            <AmountStat label={selectedDebt.direction === 'yo_debo' ? 'Pagado a cuenta' : 'Recibido a cuenta'} value={money(paid)} />
            <AmountStat label={balance <= 0 ? 'Saldo final' : 'Saldo pendiente'} value={money(balance)} emphasized />
          </View>
          {selectedDebt.note ? <Text style={styles.bodyText}>{selectedDebt.note}</Text> : null}
          {balance > 0 ? <PrimaryButton title={entryLabel} onPress={openEntry} /> : <Message tone="success" text="Esta deuda ya está saldada." />}
        </View>
        <Text style={styles.sectionTitle}>Movimientos a cuenta</Text>
        {selectedDebt.entries.length === 0 ? <EmptyState title="Sin abonos todavía" text="Cuando pagues o recibas una parte, agrégala aquí." /> : null}
        {selectedDebt.entries.map(entry => (
          <View key={entry.id} style={styles.entryCard}>
            <View style={styles.between}>
              <Text style={styles.person}>{money(entry.amount)}</Text>
              <Text style={styles.directionTag}>{selectedDebt.direction === 'yo_debo' ? 'Pagaste' : 'Recibiste'}</Text>
            </View>
            {entry.note ? <Text style={styles.bodyText}>{entry.note}</Text> : null}
            <Text style={styles.muted}>{formatDateTime(entry.createdAt)} · {entry.inputMethod === 'voice' ? 'Dictado por voz' : 'Escrito'}</Text>
          </View>
        ))}
        {error ? <Message tone="error" text={error} /> : null}
        {success ? <Message tone="success" text={success} /> : null}
      </View>
    );
  }

  const creatingDebt = page === 'create';
  const pageTitle = creatingDebt ? 'Registrar deuda personal' : 'Agregar a cuenta';
  const submitLabel = creatingDebt ? 'Guardar deuda' : 'Guardar abono';

  return (
    <View>
      <SmallButton title={creatingDebt ? 'Volver a Mis deudas' : 'Volver al detalle'} onPress={() => setPage(creatingDebt ? 'list' : 'detail')} secondary />
      <Text style={styles.title}>{pageTitle}</Text>
      <Text style={styles.muted}>{creatingDebt ? 'Indica quién debe y registra el monto inicial.' : `Disponible: ${money(balance)} · la fecha y hora se guardan automáticamente.`}</Text>
      <View style={styles.formCard}>
        <View style={styles.modeSwitch}>
          <ModeButton title="Escribir" icon="keyboard-outline" selected={mode === 'write'} onPress={() => setFormMode('write')} />
          <ModeButton title="Decir por audio" icon="microphone-outline" selected={mode === 'voice'} onPress={() => setFormMode('voice')} />
        </View>
        {mode === 'voice' ? (
          <View style={styles.voiceCard}>
            <Text style={styles.helper}>{creatingDebt ? 'Di quién debe, el monto y el detalle. Ejemplo: “Debo a José 800 Bs de cereal”. Se completarán el nombre, quién debe, el monto y el detalle para que los revises.' : 'Dicta el monto y el detalle del abono. Ejemplo: “Pagué 120 bolivianos en efectivo”. Si no se reconoce el monto, escríbelo antes de continuar.'}</Text>
            <TouchableOpacity style={[styles.recordButton, speechInput.isListening && styles.recording]} onPress={speechInput.isListening ? speechInput.stop : () => void startDictation()} accessibilityRole="button" accessibilityLabel={speechInput.isListening ? 'Detener dictado' : 'Iniciar dictado'}>
              <MaterialCommunityIcons name={speechInput.isListening ? 'stop-circle-outline' : 'microphone'} size={23} color={colors.white} />
              <Text style={styles.recordText}>{speechInput.isListening ? 'Detener dictado' : 'Comenzar a dictar'}</Text>
            </TouchableOpacity>
            {transcript ? <View style={styles.transcript}><Text style={styles.fieldLabel}>Transcripción</Text><Text style={styles.bodyText}>{transcript}</Text></View> : null}
          </View>
        ) : null}

        {creatingDebt ? (
          <>
            <Field label="¿A quién corresponde?" value={person} onChangeText={value => { setPerson(value); resetReview(); }} placeholder="Nombre de la persona o proveedor" maxLength={120} />
            <Text style={styles.fieldLabel}>¿Quién debe?</Text>
            <View style={styles.directionRow}>
              <ModeButton title="Yo debo" icon="arrow-up-right" selected={direction === 'yo_debo'} onPress={() => { setDirection('yo_debo'); resetReview(); }} />
              <ModeButton title="Me deben" icon="arrow-down-left" selected={direction === 'me_deben'} onPress={() => { setDirection('me_deben'); resetReview(); }} />
            </View>
          </>
        ) : null}
        <Field label="Monto (Bs)" value={amount} onChangeText={value => { setAmount(value); resetReview(); }} placeholder="0,00" keyboardType="decimal-pad" />
        <Field label="Detalle (opcional)" value={note} onChangeText={value => { setNote(value); resetReview(); }} placeholder={creatingDebt ? 'Ej. compra de mercadería' : 'Ej. pago en efectivo'} maxLength={500} />

        {mode === 'voice' ? (
          <>
            <TouchableOpacity style={[styles.readBackButton, (!isValidAmount(amount) || readingReview || speechInput.isListening) && styles.disabled]} onPress={playReview} disabled={!isValidAmount(amount) || readingReview || speechInput.isListening} accessibilityRole="button">
              <MaterialCommunityIcons name="volume-high" size={22} color={colors.teal} />
              <Text style={styles.readBackText}>{readingReview ? 'Leyendo resumen…' : 'Escuchar y revisar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmRow, !reviewPlayed && styles.disabled]} onPress={() => setReviewConfirmed(value => !value)} disabled={!reviewPlayed} accessibilityRole="checkbox" accessibilityState={{ checked: reviewConfirmed, disabled: !reviewPlayed }}>
              <View style={[styles.checkbox, reviewConfirmed && styles.checkboxChecked]}>{reviewConfirmed ? <MaterialCommunityIcons name="check" size={16} color={colors.white} /> : null}</View>
              <Text style={styles.confirmText}>Escuché y verifiqué el monto y el detalle.</Text>
            </TouchableOpacity>
            {!reviewPlayed ? <Text style={styles.helper}>Debes escuchar y confirmar el resumen antes de guardar.</Text> : null}
          </>
        ) : null}
        {error ? <Message tone="error" text={error} /> : null}
        <PrimaryButton title={submitLabel} onPress={() => void submitForm()} busy={busy} disabled={speechInput.isListening || readingReview || (mode === 'voice' && (!reviewPlayed || !reviewConfirmed))} />
      </View>
    </View>
  );
}

function ModeButton({ title, icon, selected, onPress }: { title: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.modeButton, selected && styles.modeSelected]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      <MaterialCommunityIcons name={icon} size={19} color={selected ? colors.teal : colors.muted} />
      <Text style={[styles.modeText, selected && styles.modeTextSelected]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...inputProps} style={styles.input} placeholderTextColor={colors.muted} /></View>;
}

function PrimaryButton({ title, onPress, busy = false, disabled = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <TouchableOpacity style={[styles.primaryButton, (busy || disabled) && styles.disabled]} onPress={onPress} disabled={busy || disabled}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{title}</Text>}</TouchableOpacity>;
}

function SmallButton({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <TouchableOpacity style={[styles.smallButton, secondary && styles.smallButtonSecondary]} onPress={onPress}><Text style={[styles.smallButtonText, secondary && styles.smallButtonTextSecondary]}>{title}</Text></TouchableOpacity>;
}

function AmountStat({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <View style={styles.amountStat}><Text style={styles.muted}>{label}</Text><Text style={[styles.statAmount, emphasized && styles.emphasizedAmount]}>{value}</Text></View>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <View style={styles.empty}><Text style={styles.person}>{title}</Text><Text style={styles.muted}>{text}</Text></View>;
}

function Message({ text, tone }: { text: string; tone: 'error' | 'success' }) {
  return <View style={[styles.message, tone === 'error' ? styles.errorMessage : styles.successMessage]}><Text style={styles.messageText}>{text}</Text></View>;
}

function isValidAmount(value: string): boolean {
  const normalized = value.trim().replace(',', '.');
  return /^\d{1,10}(\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0;
}

function getBalance(debt: PersonalDebt): number {
  const cents = (value: string) => Math.round(Number(value) * 100);
  const initial = cents(debt.initialAmount);
  const entries = debt.entries.reduce((sum, entry) => sum + cents(entry.amount), 0);
  return Math.max(0, initial - entries) / 100;
}

function money(value: string | number): string {
  const amount = Number(value);
  return `Bs ${Number.isFinite(amount) ? amount.toFixed(2).replace('.', ',') : '0,00'}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 7, marginBottom: 13 },
  addButton: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  title: { color: colors.ink, fontSize: 23, fontWeight: '800', marginTop: 12 },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  localNote: { color: colors.muted, fontSize: 11, marginBottom: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  debtCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 15, marginBottom: 10 },
  detailCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 17, marginTop: 14 },
  entryCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 9 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 9 },
  person: { color: colors.ink, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  directionTag: { color: colors.ink, backgroundColor: '#EAF3EF', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  tagOwed: { color: '#9A5A05', backgroundColor: '#FFF1D6' },
  tagReceivable: { color: colors.teal, backgroundColor: '#DDF3E9' },
  statusTag: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8, fontSize: 11, fontWeight: '800' },
  tagPaid: { color: '#14755F', backgroundColor: '#DDF3E9' },
  tagPending: { color: '#9A5A05', backgroundColor: '#FFF1D6' },
  amount: { color: colors.teal, fontSize: 20, fontWeight: '800', marginTop: 8 },
  amountGrid: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  amountStat: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  statAmount: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: 3 },
  emphasizedAmount: { color: colors.teal, fontSize: 21 },
  bodyText: { color: colors.ink, fontSize: 13, lineHeight: 19, marginTop: 6 },
  formCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 17, marginTop: 12, marginBottom: 15 },
  field: { marginTop: 11 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 13, color: colors.ink, backgroundColor: '#FCFDFC', fontSize: 14 },
  directionRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#EAF3EF', borderRadius: 13, padding: 4, gap: 5 },
  modeButton: { flex: 1, minHeight: 43, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingHorizontal: 5 },
  modeSelected: { backgroundColor: colors.white, elevation: 1 },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  modeTextSelected: { color: colors.teal },
  voiceCard: { backgroundColor: '#F8FBF9', padding: 12, borderRadius: 13, marginTop: 12, gap: 9 },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  recordButton: { minHeight: 49, borderRadius: 13, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  recording: { backgroundColor: colors.red },
  recordText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  transcript: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: 10 },
  readBackButton: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: colors.teal, borderRadius: 12, marginTop: 14 },
  readBackText: { color: colors.teal, fontSize: 13, fontWeight: '800' },
  confirmRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 6 },
  checkbox: { width: 23, height: 23, borderWidth: 1.5, borderColor: colors.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.teal, borderColor: colors.teal },
  confirmText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 50, borderRadius: 13, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', marginTop: 13, paddingHorizontal: 14 },
  primaryText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  smallButton: { minHeight: 38, borderRadius: 10, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, marginTop: 8, alignSelf: 'flex-start' },
  smallButtonSecondary: { backgroundColor: '#E9F6F2', borderWidth: 1, borderColor: colors.line },
  smallButtonText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  smallButtonTextSecondary: { color: colors.ink },
  empty: { backgroundColor: '#F8FBF9', borderColor: colors.line, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 16, marginVertical: 8, gap: 5 },
  message: { borderRadius: 12, padding: 12, marginTop: 10 },
  errorMessage: { backgroundColor: '#FCE4E2' },
  successMessage: { backgroundColor: '#DDF3E9' },
  messageText: { color: colors.ink, fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.5 },
});
