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

        const accumulatedRef = { current: "" };

        recognition.onresult = (event: any) => {
            let finalChunk = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalChunk += event.results[i][0].transcript + " ";
                }
            }

            if (finalChunk) {
                accumulatedRef.current += finalChunk;
                setTranscript(accumulatedRef.current);

                // 🟢 Reset silence timer — allow pauses (4.5s) before submitting
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                }

                silenceTimerRef.current = setTimeout(() => {
                    const toSend = accumulatedRef.current.trim();
                    accumulatedRef.current = "";
                    if (onFinalMessage && toSend) {
                        onFinalMessage(toSend);
                    }
                    setTranscript("");
                }, 4500); // ⏳ 4.5 sec silence — allows natural pauses while speaking
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