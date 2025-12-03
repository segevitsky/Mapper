// src/services/screenRecorderService.ts
import { NetworkCall } from "../../types";

interface RecordingMetadata {
  startTime: number;
  endTime?: number;
  networkCalls: Array<{
    timestamp: number;
    callData: NetworkCall;
  }>;
}

export class ScreenRecorderService {
  private static instance: ScreenRecorderService;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isRecording = false;
  private recordingStartTime = 0;
  private recordingMetadata: RecordingMetadata | null = null;
  private capturedNetworkCalls: Array<{ timestamp: number; request: any }> = [];

  // Singleton pattern
  private constructor() {
    this.initializeNetworkListener();
  }

  public static getInstance(): ScreenRecorderService {
    if (!ScreenRecorderService.instance) {
      ScreenRecorderService.instance = new ScreenRecorderService();
    }
    return ScreenRecorderService.instance;
  }

  private initializeNetworkListener(): void {
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message.type === "NETWORK_IDLE" &&
        this.isRecording &&
        message.requests.length > 0
      ) {
        // כאן נשמור את קריאות הרשת בזמן ההקלטה
        const elapsedTime = Date.now() - this.recordingStartTime;

        message.requests.forEach((request: any) => {
          this.capturedNetworkCalls.push({
            timestamp: elapsedTime,
            request: request,
          });
        });

      }
    });
  }

  /**
   * מתחיל הקלטת מסך
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.warn("already recording");
      return;
    }

    try {
      // בקשת הרשאה להקלטת מסך
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          frameRate: 30,
        } as MediaTrackConstraints,
        audio: false,
      });

      // יצירת מקליט עם הסטרים
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: "video/webm;codecs=vp9",
      });

      // איפוס מידע קודם
      this.recordedChunks = [];
      this.capturedNetworkCalls = [];

      // הגדרת מאזינים לאירועים
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // שמירת זמן תחילת ההקלטה
      this.recordingStartTime = Date.now();
      this.recordingMetadata = {
        startTime: this.recordingStartTime,
        networkCalls: [],
      };

      // התחלת הקלטה
      this.mediaRecorder.start(1000); // איסוף מידע כל שנייה
      this.isRecording = true;

    } catch (error) {
      this.cleanupRecording();
      throw error;
    }
  }

  public async stopRecording(): Promise<{
    videoBlob: Blob;
    metadata: RecordingMetadata;
  }> {
    if (!this.isRecording || !this.mediaRecorder || !this.stream) {
      throw new Error("אין הקלטה פעילה לעצירה");
    }

    return new Promise((resolve, reject) => {
      try {
        // עדכון מטא-דאטה עם זמן סיום
        if (this.recordingMetadata) {
          this.recordingMetadata.endTime = Date.now();
          // העברת הקריאות שנאספו למטא-דאטה
          this.recordingMetadata.networkCalls = this.capturedNetworkCalls.map(
            (call) => ({
              timestamp: call.timestamp,
              callData: call.request,
            })
          );
        }

        this.mediaRecorder!.onstop = () => {
          // יצירת בלוב אחד מכל החלקים
          const videoBlob = new Blob(this.recordedChunks, {
            type: "video/webm",
          });

          // ניקוי משאבים
          this.cleanupRecording();

          // החזרת ההקלטה
          resolve({
            videoBlob,
            metadata: this.recordingMetadata!,
          });
        };

        // עצירת המקליט
        if (this.mediaRecorder) {
          this.mediaRecorder.stop();
        }
      } catch (error) {
        this.cleanupRecording();
        reject(error);
      }
    });
  }

  /**
   * האם יש הקלטה פעילה
   */
  public isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * הורדת ההקלטה כקובץ
   */
  public downloadRecording(blob: Blob, filename: string = ""): void {
    if (!filename) {
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-");
      filename = `screen-recording-${timestamp}.webm`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // ניקוי
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * ניקוי משאבים לאחר ההקלטה
   */
  private cleanupRecording(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.mediaRecorder = null;
    this.isRecording = false;
  }
}

export default ScreenRecorderService;
