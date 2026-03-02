import { useCallback, useRef, useState } from "react";
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}
type SpeechRecognitionEvent = {
    results: SpeechRecognitionResultList;
    resultIndex: number;
};

export const useSpeechToText = (onFinalMessage?: (text: string) => void) => {
    const [transcript, setTranscript] = useState("");
    const [isListening, setIsListening] = useState(false);

    const recognitionRef = useRef<any>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const startListening = useCallback(() => {
        const SpeechRecognition =
            window.SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: any) => {
            let finalChunk = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalChunk += event.results[i][0].transcript + " ";
                }
            }

            if (finalChunk) {
                setTranscript(prev => prev + finalChunk);

                // 🟢 Reset silence timer
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                }

                silenceTimerRef.current = setTimeout(() => {
                    if (onFinalMessage) {
                        onFinalMessage(finalChunk.trim());
                    }
                    setTranscript(""); // reset after sending
                }, 2500); // ⏳ 2.5 sec silence
            }
        };

        recognition.onerror = () => {
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
    }, [onFinalMessage]);

    const stopListening = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    return { transcript, isListening, startListening, stopListening };
};