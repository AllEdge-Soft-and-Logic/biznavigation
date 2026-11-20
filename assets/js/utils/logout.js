const maxIdleTime = 30 * 60 * 1000; // 30 minutes (use 5 * 60 * 1000 for 5 min)
let idleInterval = null;
let sessionInterval = null;
let isLoggingOut = false;
let lastActivityWrite = 0;

/* ------------------ Activity Tracking (Throttled) ------------------ */

function updateLastActivityTime() {
    const now = Date.now();
    // Only write to localStorage once every 5 seconds
    if (now - lastActivityWrite > 5000) {
        localStorage.setItem('lastActivityTime', now);
        lastActivityWrite = now;
    }
}

function checkIdleTime() {
    if (isLoggingOut) return;

    const lastActivityTime = Number(localStorage.getItem('lastActivityTime') || 0);
    if (lastActivityTime && (Date.now() - lastActivityTime >= maxIdleTime)) {
        logoutUser();
    }
}

/* ------------------ Session Validation & Heartbeat ------------------ */

async function checkSessionToken() {
    const sessionToken = sessionStorage.getItem('session_token');
    const userLoginID = localStorage.getItem('UserLoginID');
    if (!sessionToken || !userLoginID) return;

    // 1. Check if session is still active in DB
    const { data, error } = await supabase
        .from('user_sessions')
        .select('is_active')
        .eq('user_id', userLoginID)
        .eq('session_token', sessionToken)
        .single();

    if (error || !data || !data.is_active) {
        // Session was expired by DB or another device
        await logoutUser();
        return;
    }

    // 2. Sync last_active timestamp to DB so pg_cron knows user is still active
    const lastActivityTime = Number(localStorage.getItem('lastActivityTime') || Date.now());
    await supabase
        .from('user_sessions')
        .update({ last_active: new Date(lastActivityTime).toISOString() })
        .eq('session_token', sessionToken);
}

function startSessionValidation() {
    if (sessionInterval) clearInterval(sessionInterval);

    sessionInterval = setInterval(async () => {
        if (isLoggingOut) return;
        try {
            await checkSessionToken();
        } catch (err) {
            console.error("Session token check failed:", err);
        }
    }, 30000);
}

/* ------------------ Idle Monitor ------------------ */

function startIdleMonitor() {
    if (idleInterval) clearInterval(idleInterval);
    idleInterval = setInterval(checkIdleTime, 30000);
}

function stopSessionWatchers() {
    if (idleInterval) {
        clearInterval(idleInterval);
        idleInterval = null;
    }
    if (sessionInterval) {
        clearInterval(sessionInterval);
        sessionInterval = null;
    }
}

/* ------------------ Logout (Web App + Database) ------------------ */

async function logoutUser() {
    if (isLoggingOut) return;
    isLoggingOut = true;

    stopSessionWatchers();

    // Notify other tabs
    localStorage.setItem('logout-event', Date.now());

    await logoutLocalStorageAndDB();
}

async function logoutLocalStorageAndDB() {
    const userLoginID = localStorage.getItem('UserLoginID');
    const sessionToken = sessionStorage.getItem('session_token');

    try {
        if (userLoginID && sessionToken) {
            // Mark THIS session inactive in the database
            await supabase
                .from('user_sessions')
                .update({
                    is_active: false,
                    last_active: new Date().toISOString()
                })
                .eq('user_id', userLoginID)
                .eq('session_token', sessionToken);
        }
    } catch (error) {
        console.error("Database session logout failed:", error);
    } finally {
        if (userLoginID) {
            clearPermissionCache(userLoginID);
        }

        [
            'EmpCode', 'UserName', 'UserLoginID', 'UserType',
            'CompanyID', 'WorkingBranch', 'CompanyShortCode', 'lastActivityTime'
        ].forEach(key => localStorage.removeItem(key));

        sessionStorage.removeItem('session_token');

        window.location.href = '../../index.html';
    }
}

function clearPermissionCache(userLoginID) {
    Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(`permissions_${userLoginID}_`)) {
            localStorage.removeItem(key);
        }
    });
}

/* ------------------ Multi-Tab Logout Sync ------------------ */

window.addEventListener('storage', function (event) {
    if (event.key === 'logout-event') {
        stopSessionWatchers();
        sessionStorage.removeItem('session_token');
        window.location.href = '../../index.html';
    }
});

/* ------------------ Initialize ------------------ */

document.addEventListener("DOMContentLoaded", async () => {
    ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
        .forEach(evt =>
            window.addEventListener(evt, updateLastActivityTime, { passive: true })
        );

    updateLastActivityTime();
    startIdleMonitor();
    startSessionValidation();

    if (localStorage.getItem('UserLoginID')) {
        await autoUnlockMultipleTables();
    }
});