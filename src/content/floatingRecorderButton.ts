// src/content/floatingRecorderButton.ts
import { ScreenRecorderService } from "./services/screenRecorderService";

class FloatingRecorderButton {
  private container: HTMLElement | null = null;
  private recorderService: ScreenRecorderService;
  private isRecording: boolean = false;
  private timerElement: HTMLElement | null = null;
  private timerInterval: number | null = null;
  private recordingStartTime: number = 0;
  private recordingData: { videoBlob?: Blob; metadata?: any } = {};

  constructor() {
    this.recorderService = ScreenRecorderService.getInstance();
    this.initialize();
  }

  private initialize(): void {
    this.createButtonContainer();
  }

  private createButtonContainer(): void {
    // בדיקה אם הכפתור כבר קיים
    if (document.getElementById("indi-recorder-button")) {
      return;
    }

    // יצירת מיכל לכפתור
    this.container = document.createElement("div");
    this.container.id = "indi-recorder-button";
    this.container.className = "indi-floating-button";

    // יצירת כפתור הקלטה
    const recordButton = document.createElement("button");
    recordButton.className = "indi-record-button";
    recordButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="6" fill="currentColor" />
      </svg>
      <span>Record</span>
    `;
    recordButton.addEventListener("click", () => this.toggleRecording());

    // יצירת אלמנט לטיימר
    this.timerElement = document.createElement("div");
    this.timerElement.className = "indi-timer";
    this.timerElement.textContent = "00:00";
    this.timerElement.style.display = "none";

    // הוספת הכפתור למיכל
    this.container.appendChild(recordButton);
    this.container.appendChild(this.timerElement);

    // הפיכת הכפתור לגריר
    this.makeDraggable(this.container);

    // הוספה לגוף הדף
    document.body.appendChild(this.container);
  }

  private async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording(): Promise<void> {
    try {
      await this.recorderService.startRecording();
      this.isRecording = true;
      this.recordingStartTime = Date.now();

      // עדכון ממשק
      const recordButton = this.container?.querySelector(".indi-record-button");
      if (recordButton) {
        recordButton.classList.add("recording");
        recordButton.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16">
            <rect x="8" y="8" width="8" height="8" fill="currentColor" />
          </svg>
          <span>Stop</span>
        `;
      }

      if (this.timerElement) {
        this.timerElement.style.display = "block";
        this.startTimer();
      }
    } catch (error) {
      console.error("שגיאה בהתחלת הקלטה:", error);
      alert(
        "We couldn't start the recording. Please confirm permission to record screen."
      );
    }
  }

  private async stopRecording(): Promise<void> {
    try {
      // עצירת הטיימר
      this.stopTimer();

      // עצירת ההקלטה
      const result = await this.recorderService.stopRecording();
      this.recordingData = result;
      this.isRecording = false;

      // עדכון ממשק
      const recordButton = this.container?.querySelector(".indi-record-button");
      if (recordButton) {
        recordButton.classList.remove("recording");
        recordButton.innerHTML = `
          <svg viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="6" fill="currentColor" />
          </svg>
          <span>Record</span>
        `;
      }

      if (this.timerElement) {
        this.timerElement.style.display = "none";
      }

      // הצגת הפופאפ עם ההקלטה
      this.showRecordingPopup(result);
    } catch (error) {
      console.error("שגיאה בעצירת הקלטה:", error);
    }
  }

  private startTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;

      if (this.timerElement) {
        this.timerElement.textContent = `${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private showRecordingPopup(recordingData: {
    videoBlob: Blob;
    metadata: any;
  }): void {
    // כאן נציג את הפופאפ עם ההקלטה והקריאות
    // נממש את זה בהמשך
    console.log("הקלטה הושלמה, מציג פופאפ...", recordingData);

    // בינתיים נאפשר הורדה ישירה
    this.recorderService.downloadRecording(recordingData.videoBlob);
  }

  private makeDraggable(button: HTMLElement): () => void {
    if (!button) {
      console.error("Button to make draggable is undefined");
      return () => {};
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    // קבל את המיקום הנוכחי או השתמש ב-0 אם לא מוגדר עדיין
    const currentTransform = window.getComputedStyle(button).transform;

    // אם כבר יש טרנספורם, נסה לשלוף את הערכים
    if (currentTransform && currentTransform !== "none") {
      const matrix = new DOMMatrix(currentTransform);
      currentX = matrix.e;
      currentY = matrix.f;
    }

    console.log("Making button draggable:", button);
    console.log("Initial position:", { currentX, currentY });

    const onMouseDown = (e: MouseEvent) => {
      // חשוב: נעצור התנהגות ברירת מחדל כדי למנוע בעיות
      e.preventDefault();

      console.log("Mouse down on draggable button");
      isDragging = true;

      // חישוב הדלתא בין מיקום העכבר למיקום הנוכחי של הכפתור
      startX = e.clientX - currentX;
      startY = e.clientY - currentY;

      // מנע ברירה של טקסט בזמן גרירה
      button.style.userSelect = "none";
      document.body.style.cursor = "move";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      e.preventDefault();

      // חישוב המיקום החדש
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;

      // הגבלת תזוזה לתוך החלון
      const maxX = window.innerWidth - button.offsetWidth;
      const maxY = window.innerHeight - button.offsetHeight;

      currentX = Math.max(0, Math.min(currentX, maxX));
      currentY = Math.max(0, Math.min(currentY, maxY));

      console.log("Dragging to:", { currentX, currentY });
      button.style.transform = `translate(${currentX}px, ${currentY}px)`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;

      console.log("Drag ended at:", { currentX, currentY });
      isDragging = false;
      button.style.userSelect = "";
      document.body.style.cursor = "";
    };

    // הוסף מאזינים ישירות לכפתור
    button.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    // החזר פונקציית ניקוי שמסירה את כל המאזינים
    return () => {
      button.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      console.log("Draggable cleanup complete");
    };
  }
}

// יצירת הכפתור
export const initFloatingButton = (): void => {
  new FloatingRecorderButton();
};

export default initFloatingButton;
