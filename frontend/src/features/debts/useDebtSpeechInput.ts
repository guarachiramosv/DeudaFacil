import { useCallback, useEffect, useRef, useState } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type RecognitionModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
type ListenerSubscription = { remove: () => void };
type TranscriptListener = (transcript: string, isFinal: boolean) => void;
type FailureListener = (message: string) => void;

export function useDebtSpeechInput() {
  const [isListening, setIsListening] = useState(false);
  const moduleRef = useRef<RecognitionModule | null>(null);
  const listenersRef = useRef<ListenerSubscription[]>([]);

  const clearListeners = useCallback(() => {
    listenersRef.current.forEach(listener => listener.remove());
    listenersRef.current = [];
  }, []);

  const start = useCallback(async (onTranscript: TranscriptListener, onFailure: FailureListener) => {
    clearListeners();
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      setIsListening(false);
      onFailure('El dictado de voz no está incluido en Expo Go. Para usar “Por audio”, abre DeudaFácil en su compilación de desarrollo; mientras tanto puedes registrar la deuda por escrito.');
      return;
    }

    try {
      const { ExpoSpeechRecognitionModule } = await import('expo-speech-recognition');
      moduleRef.current = ExpoSpeechRecognitionModule;
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        throw new Error('El reconocimiento de voz no está disponible en este dispositivo.');
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Se necesita permiso para usar el micrófono y el reconocimiento de voz.');

      listenersRef.current = [
        ExpoSpeechRecognitionModule.addListener('start', () => setIsListening(true)),
        ExpoSpeechRecognitionModule.addListener('result', event => {
          const transcript = event.results[0]?.transcript?.trim();
          if (transcript) onTranscript(transcript, event.isFinal);
        }),
        ExpoSpeechRecognitionModule.addListener('error', event => {
          setIsListening(false);
          if (event.error !== 'aborted') onFailure(speechErrorMessage(event.error));
        }),
        ExpoSpeechRecognitionModule.addListener('end', () => setIsListening(false)),
      ];
      ExpoSpeechRecognitionModule.start({ lang: 'es-ES', interimResults: true, continuous: false, maxAlternatives: 1 });
      setIsListening(true);
    } catch (reason) {
      setIsListening(false);
      clearListeners();
      const message = reason instanceof Error ? reason.message : '';
      if (/cannot find native module|expoSpeechRecognition/i.test(message)) {
        onFailure('El dictado requiere abrir DeudaFácil en una compilación de desarrollo. Expo Go no incluye reconocimiento de voz.');
      } else {
        onFailure(message || 'No se pudo iniciar el reconocimiento de voz.');
      }
    }
  }, [clearListeners]);

  const stop = useCallback(() => {
    try {
      moduleRef.current?.stop();
    } catch {
      setIsListening(false);
    }
  }, []);

  useEffect(() => () => {
    try {
      moduleRef.current?.abort();
    } catch {
      // Ignore cleanup errors when the native module is unavailable.
    }
    clearListeners();
  }, [clearListeners]);

  return { isListening, start, stop };
}

function speechErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'no-speech': 'No se detectó voz. Intenta nuevamente y habla después de iniciar el micrófono.',
    'not-allowed': 'No se concedió permiso para el micrófono o el reconocimiento de voz.',
    'service-not-allowed': 'Activa un servicio de reconocimiento de voz en los ajustes del dispositivo.',
    'language-not-supported': 'El reconocimiento en español no está disponible en este dispositivo.',
    network: 'El servicio de voz no pudo conectarse. Revisa la conexión e inténtalo otra vez.',
    'audio-capture': 'No se pudo acceder al micrófono.',
  };
  return messages[code] ?? 'El reconocimiento de voz se interrumpió. Intenta nuevamente.';
}
