// ==========================================================================
// The Unclaimed Project — Firebase Authentication Integration
// Comprehensive logging, iframe session resilience, and Google Sign-In
// ==========================================================================

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB6gv2r7zQXpRJm93e3xQgCjLmQG4PUkiM",
  authDomain: "unclaimed-project.firebaseapp.com",
  projectId: "unclaimed-project",
  storageBucket: "unclaimed-project.firebasestorage.app",
  messagingSenderId: "372577389428",
  appId: "1:372577389428:web:773b28f4ab5c15ca4e7a21",
  measurementId: "G-ERHMW7DZR3"
};

let authInstance = null;
let isInitializing = false;
let isSyncingSession = false;

function logAuth(message, data = null) {
  const prefix = '[Firebase Auth ' + new Date().toISOString().substring(11, 19) + ']';
  if (data !== null) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

function logError(message, err = null) {
  const prefix = '[Firebase Auth ERROR ' + new Date().toISOString().substring(11, 19) + ']';
  console.error(prefix, message, err || '');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      return resolve();
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = (e) => reject(new Error('Failed to load script: ' + src));
    document.head.appendChild(s);
  });
}

async function getFirebaseAuth() {
  if (authInstance) return authInstance;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 50));
    }
    return authInstance;
  }

  isInitializing = true;
  try {
    logAuth('Fetching configuration...');
    let config = DEFAULT_FIREBASE_CONFIG;
    try {
      const res = await fetch('/api/firebase-config');
      if (res.ok) {
        const serverConfig = await res.json();
        if (serverConfig && serverConfig.apiKey) {
          config = { ...DEFAULT_FIREBASE_CONFIG, ...serverConfig };
        }
      }
    } catch (e) {
      logAuth('Using local configuration fallback.');
    }

    logAuth('App Hostname:', window.location.hostname);
    logAuth('Firebase Project ID:', config.projectId);
    logAuth('Firebase Auth Domain:', config.authDomain);

    // Load Firebase Compat SDKs if not present
    if (typeof firebase === 'undefined') {
      logAuth('Loading Firebase App & Auth SDK from gstatic CDN...');
      await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');
      logAuth('Firebase SDK scripts loaded successfully.');
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(config);
      logAuth('firebase.initializeApp completed.');
    }

    authInstance = firebase.auth();

    // Ensure persistence is set to LOCAL
    try {
      await authInstance.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      logAuth('Auth persistence set to LOCAL.');
    } catch (pErr) {
      logError('Could not set LOCAL persistence (using default):', pErr);
    }

    // Register onAuthStateChanged listener for diagnostic logging
    authInstance.onAuthStateChanged((user) => {
      if (user) {
        logAuth('onAuthStateChanged: Active Firebase user in client session:', {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        });
      } else {
        logAuth('onAuthStateChanged: No active Firebase user in client session.');
      }
    });

  } catch (err) {
    logError('Firebase initialization failed:', err);
  } finally {
    isInitializing = false;
  }

  return authInstance;
}

// Synchronize Firebase user with Express backend session
async function syncUserWithBackend(user, destinationUrl = '/dashboard') {
  if (isSyncingSession) return;
  isSyncingSession = true;

  try {
    logAuth('Sending sync request to POST /api/auth/firebase-login...');
    const syncRes = await fetch('/api/auth/firebase-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      })
    });

    const data = await syncRes.json();
    logAuth('Backend sync response:', data);

    if (data.success) {
      // Save token in localStorage for cross-session/iframe resilience
      if (data.token) {
        localStorage.setItem('unclaimed_user_id', String(data.token));
      }

      const target = destinationUrl || data.redirect || '/dashboard';
      // Append auth_token parameter so the backend accepts the session even if third-party cookies are partitioned
      const separator = target.includes('?') ? '&' : '?';
      const finalUrl = data.token ? `${target}${separator}auth_token=${encodeURIComponent(data.token)}` : target;

      logAuth('Redirecting user to:', finalUrl);
      window.location.href = finalUrl;
      return true;
    } else {
      logError('Backend sync failed:', data.error);
      return false;
    }
  } catch (err) {
    logError('Error contacting /api/auth/firebase-login:', err);
    return false;
  } finally {
    isSyncingSession = false;
  }
}

// Bind DOM event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Pre-initialize Firebase in background
  getFirebaseAuth();

  // 1. Google Sign-In Buttons
  const googleBtns = document.querySelectorAll('#googleSignInBtn, .btn-google-auth');
  googleBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      logAuth('User clicked Sign in with Google button.');

      const statusMsg = document.getElementById('firebaseAuthMsg');
      const setStatus = (msg, isError = true) => {
        if (!statusMsg) return;
        statusMsg.innerHTML = msg;
        statusMsg.className = isError 
          ? 'alert alert-danger py-2 px-3 small text-start my-2' 
          : 'alert alert-success py-2 px-3 small text-start my-2';
        statusMsg.classList.remove('d-none');
      };

      if (statusMsg) statusMsg.classList.add('d-none');
      btn.disabled = true;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        <span>Connecting with Google...</span>
      `;

      try {
        const auth = await getFirebaseAuth();
        if (!auth) {
          throw new Error('Failed to initialize Firebase Auth instance.');
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        provider.setCustomParameters({ prompt: 'select_account' });

        logAuth('Calling auth.signInWithPopup(GoogleAuthProvider)...');
        const result = await auth.signInWithPopup(provider);
        logAuth('signInWithPopup resolved successfully!');
        
        const user = result.user;
        logAuth('Authenticated User Details:', {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        });

        setStatus('Google authentication successful! Loading your studio...', false);

        const queryParams = new URLSearchParams(window.location.search);
        const nextUrl = queryParams.get('next') || '/dashboard';

        const syncSuccess = await syncUserWithBackend(user, nextUrl);
        if (!syncSuccess) {
          setStatus('Authenticated with Google, but could not create studio session. Please try again.');
          btn.disabled = false;
          btn.innerHTML = originalHtml;
        }

      } catch (err) {
        logError('signInWithPopup Exception:', err);
        const code = err.code || '';
        const message = err.message || '';

        if (code === 'auth/popup-closed-by-user') {
          setStatus('Google account selection window was closed before completing sign-in.');
        } else if (code === 'auth/cancelled-popup-request') {
          setStatus('Sign-in request was superseded by another action.');
        } else if (code === 'auth/unauthorized-domain') {
          const hostname = window.location.hostname;
          setStatus(`
            <strong>Domain Not Authorized in Firebase:</strong><br>
            Please add <code>${hostname}</code> to your Firebase Console under:<br>
            <em>Authentication &gt; Settings &gt; Authorized Domains</em>.
          `);
          console.error('[Firebase Auth] Add this domain to Authorized Domains in Firebase Console:', hostname);
        } else if (code === 'auth/popup-blocked') {
          setStatus('The Google Sign-In popup was blocked by your browser. Please allow popups for this site.');
        } else {
          setStatus(`<strong>Sign-In Error:</strong> ${message || code || 'An unexpected error occurred.'}`);
        }

        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  });

  // 2. Intercept Logout links
  const logoutLinks = document.querySelectorAll('a[href*="/logout"]');
  logoutLinks.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetUrl = link.href || '/logout';
      logAuth('Logout clicked. Clearing local session and Firebase auth...');
      try {
        localStorage.removeItem('unclaimed_user_id');
        sessionStorage.clear();
        const auth = await getFirebaseAuth();
        if (auth) {
          await auth.signOut();
          logAuth('Firebase signOut() completed.');
        }
      } catch (err) {
        logError('Error during signOut:', err);
      } finally {
        window.location.href = targetUrl;
      }
    });
  });
});
