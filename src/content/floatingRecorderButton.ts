import { ScreenRecorderService } from "./services/screenRecorderService";
import Swal from 'sweetalert2';


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

  // פונקציה להמרת משך זמן ממילישניות לפורמט קריא
  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
    const hours = Math.floor(milliseconds / (1000 * 60 * 60));
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // פונקציה להמרת גודל קובץ לפורמט קריא
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

    // פתיחת צפיין ההקלטה המלא
    private openRecordingViewer(recordingData: { videoBlob: Blob; metadata: any }): void {
      // שמירת ההקלטה בזיכרון זמני או שליחה למרכיב הצפיין
      console.log('פותח צפיין עם הנתונים:', recordingData);
      
      // כאן תבוא קריאה לפונקציה שפותחת את הצפיין המלא
      // לדוגמה:
      // this.router.navigate(['/recording-viewer'], { state: { recordingData } });
      // או
      // this.showRecordingViewerComponent(recordingData);
    }

    // פתיחת טופס יצירת טיקט
    private openTicketCreation(recordingData: { videoBlob: Blob; metadata: any }): void {
      console.log('פותח טופס יצירת טיקט עם הנתונים:', recordingData);
      
      // כאן תבוא קריאה לפונקציה שפותחת את טופס יצירת הטיקט
      // Send a message to the background with the right details and data      
    }



  private showRecordingPopup(recordingData: {
    videoBlob: Blob;
    metadata: any;
  }): void {
    console.log({ recordingData });
    const duration = this.formatDuration(recordingData.metadata.endTime - recordingData.metadata.startTime);
    console.log(recordingData?.metadata?.networkCalls);
    const requestCount = recordingData?.metadata?.networkCalls?.length || 0;
    const fileSize = this.formatFileSize(recordingData.videoBlob.size);
    
    // אפשר ליצור תמונה ממוזערת מהווידאו, או להשתמש באייקון כללי
    const videoIcon = '<i class="fas fa-video" style="font-size: 48px; color: #cf556c;"></i>';
  
    Swal.fire({
      title: 'Recording Completed',
      html: `
        <div class="recording-preview">
          ${videoIcon}
        </div>
        <div class="recording-info">
          <p><strong>Duration:</strong> ${duration}</p>
          <p><strong>Network Calls:</strong> ${requestCount}</p>
          <p><strong>File Size:</strong> ${fileSize}</p>
        </div>
      `,
      showDenyButton: true,
      showCloseButton: true,
      showCancelButton: true,
      confirmButtonText: 'Download File',
      denyButtonText: 'Create Ticket',
      confirmButtonColor: '#cf556c',
      denyButtonColor: '#0052CC',
      cancelButtonColor: 'rgba(200, 50, 50, 0.5)',
      reverseButtons: true,
      focusConfirm: true,
      allowOutsideClick: false,
    }).then((result) => {
      if (result.isConfirmed) {
        this.recorderService.downloadRecording(recordingData.videoBlob);
      } else if (result.isDenied) {
        this.openTicketCreation(recordingData);
      }
    });
  }

  private makeDraggable(button: HTMLElement): () => void {
    if (!button) return () => {};
  
    // וודא שהכפתור נמצא בפוזיציה הנכונה עם גודל מוחלט
    const computedStyle = window.getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    
    // הגדר את הפוזיציה, הגודל והמיקום ההתחלתי
    button.style.position = 'absolute'; // או 'fixed' אם צריך
    button.style.width = rect.width + 'px';
    button.style.height = rect.height + 'px';
    // button.style.left = rect.left + 'px';
    // button.style.top = rect.top + 'px';
    button.style.margin = '0'; // חשוב - ביטול שוליים שיכולים להשפיע
    
    console.log("Initial button size/position:", {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });
  
    // משתנים למעקב אחר הגרירה
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
  
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      
      isDragging = true;
      
      // חישוב אופסט בין נקודת הלחיצה לפינה של הכפתור
      const buttonRect = button.getBoundingClientRect();
      offsetX = e.clientX - buttonRect.left;
      offsetY = e.clientY - buttonRect.top;
      
      console.log("Mouse down at:", {
        mouseX: e.clientX,
        mouseY: e.clientY,
        buttonLeft: buttonRect.left,
        buttonTop: buttonRect.top,
        offsetX,
        offsetY
      });
      
      button.style.cursor = 'grabbing';
    };
  
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      e.preventDefault();
      
      // חישוב המיקום החדש
      const newLeft = e.clientX - offsetX;
      const newTop = e.clientY - offsetY;
      
      // שינוי המיקום בלבד, לא הגודל
      button.style.left = newLeft + 'px';
      button.style.top = newTop + 'px';
      
      console.log("Moving to:", { left: newLeft, top: newTop });
    };
  
    const onMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      button.style.cursor = 'grab';
    };
  
    // הוספת מאזינים
    button.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    
    // סגנון התחלתי
    button.style.cursor = 'grab';
    button.style.boxSizing = 'border-box'; // חשוב - מונע שינוי גודל מפתיע בגלל padding
    
    // החזרת פונקציית ניקוי
    return () => {
      button.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }

}

// יצירת הכפתור
export const initFloatingButton = (): void => {
  new FloatingRecorderButton();
};

export default initFloatingButton;
