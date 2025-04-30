// loginManager.ts
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig, authConfig } from "../../env-config"; 

// טיפוסים
interface LoginResponse {
  success: boolean;
  error?: string;
}

console.log("login methods", {
  initializeApp,
  getAuth,
  signInWithEmailAndPassword,
});

function createLoginModal() {
  // הוספת סטיילים
  const style = document.createElement("style");
  style.textContent = `
      .indi-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
      }
  
      .indi-modal {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        width: 400px;
        position: relative;
      }
  
      .indi-modal h2 {
        margin: 0 0 1.5rem;
        font-size: 1.5rem;
        font-weight: 600;
        background: linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-align: center;
      }
  
      .indi-modal-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
  
      .indi-input {
        padding: 0.75rem 1rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.875rem;
        transition: all 0.2s;
      }
  
      .indi-input:focus {
        outline: none;
        border-color: #cf556c;
        box-shadow: 0 0 0 3px rgba(207, 85, 108, 0.1);
      }
  
      .indi-button {
        padding: 0.75rem 1rem;
        border: none;
    border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        color: white;
        cursor: pointer;
        background: linear-gradient(to right, #ff8177 0%, #ff867a 0%, #ff8c7f 21%, #f99185 52%, #cf556c 78%, #b12a5b 100%);
        transition: opacity 0.2s;
      }
  
      .indi-button:hover {
        opacity: 0.9;
      }
  
      .indi-error {
        color: #e53e3e;
        font-size: 0.75rem;
        margin-top: 0.5rem;
      }
  
      .indi-modal-footer {
        margin-top: 1rem;
        text-align: center;
        font-size: 0.75rem;
        color: #718096;
      }

      .close-login-modal {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        cursor: pointer;
    }
    `;

  document.head.appendChild(style);

  // יצירת המודל
  const overlay = document.createElement("div");
  overlay.className = "indi-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "indi-modal";
  modal.style.position = "relative";

  modal.innerHTML = `
      <h2>Welcome to indi</h2>
      <form class="indi-modal-form">
        <input 
          type="email" 
          placeholder="Email" 
          class="indi-input" 
          required
        />
        <input 
          type="password" 
          placeholder="Password" 
          class="indi-input" 
          required
        />
        <button type="submit" class="indi-button">
          Sign In
        </button>
        <div class="indi-error" style="display: none;"></div>
      </form>
      <div class="indi-modal-footer">
        Need help? Contact support
      </div>
      <div class='close-login-modal' id='indi-login-close'> X </div>
    `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeButton = modal.querySelector(".close-login-modal");
  closeButton?.addEventListener("click", (e: unknown) => {
    console.log("close", e);
    overlay.remove();
  });

  // הוספת האזנה לפורם
  const form = modal.querySelector("form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (
      form.querySelector('input[type="email"]') as HTMLInputElement
    ).value;
    const password = (
      form.querySelector('input[type="password"]') as HTMLInputElement
    ).value;

    try {
      // כאן תבוא הלוגיקה של ההתחברות
      await handleLogin(email, password);
      overlay.remove();
    } catch (error) {
      const errorDiv = form.querySelector(".indi-error") as HTMLDivElement;
      errorDiv.style.display = "block";
      errorDiv.textContent =
        error instanceof Error ? error.message : "Login failed";
    }
  });

  return overlay;
}

async function handleLogin(
  email: string,
  password: string
): Promise<LoginResponse> {
  try {
    let app;
    try {
      app = initializeApp(firebaseConfig);
    } catch (e) {
      // אם האפליקציה כבר אותחלה, נקבל את הקיימת
      app = initializeApp(firebaseConfig, "indi-mapper");
    }
    
    // נקבל את אובייקט האימות
    const auth = getAuth(app);
    
    // התחברות עם אימייל וסיסמה
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // שמירת הטוקן בסטורג'
    await chrome.storage.local.set({
      authToken: await user.getIdToken(),
      userId: user.uid,
      userEmail: user.email,
      lastLogin: Date.now()
    });
    
    console.log("User logged in successfully:", user.uid);
    // lets close the modal
    const modal = document.querySelector(".indi-modal-overlay");
    if (modal) {
      modal.remove();
    }
    // refresh page
    window.location.reload();
    // Add this line to dispatch the event
    window.dispatchEvent(new CustomEvent('indi-user-authenticated'));
    
    return { 
      success: true 
    };
  } catch (error) {
    console.error("Login failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Login failed"
    };
  }
}

// נוסיף פונקציה לבדיקת תוקף הטוקן
async function validateAuthToken(): Promise<boolean> {
  try {
    const { authToken, lastLogin } = await chrome.storage.local.get(['authToken', 'lastLogin']);
    
    if (!authToken) return false;
    
    // בדיקה אם הטוקן פג תוקף (למשל אחרי 24 שעות)
    const tokenAge = Date.now() - (lastLogin || 0);
    const tokenExpiryTime = authConfig.tokenExpiryTime;

    
    if (tokenAge > tokenExpiryTime) {
      // הטוקן פג תוקף, ננקה את האחסון
      await chrome.storage.local.remove(['authToken', 'userId', 'userEmail', 'lastLogin']);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error validating token:", error);
    return false;
  }
}

export async function isUserLoggedIn(): Promise<boolean> {
  try {
    return await validateAuthToken();
  } catch (error) {
    console.error("Error checking login status:", error);
    return false;
  }
}

// נוסיף פונקציית התנתקות
export async function logout(): Promise<void> {
  try {
    const auth = getAuth();
    await auth.signOut();
    await chrome.storage.local.remove(['authToken', 'userId', 'userEmail', 'lastLogin']);
    console.log("User logged out successfully");
  } catch (error) {
    console.error("Error during logout:", error);
  }
}
// פונקציה ראשית שעוטפת את loadIndicators
export async function authenticatedLoadIndicators(
  originalLoadFunction: () => void
) {
  const isLoggedIn = await isUserLoggedIn();
  if (!isLoggedIn) {
    createLoginModal();
    
    // Add this listener to run originalLoadFunction after login
    window.addEventListener('indi-user-authenticated', () => {
      originalLoadFunction();
    }, { once: true }); // 'once: true' ensures the listener is removed after it runs once
    
    return;
  }

  originalLoadFunction();
}