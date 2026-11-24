//server.js
let supabaseClient; // Declare global variable

// Configuration Constants
const SUPABASE_CONFIG = Object.freeze({
    url: 'https://qfdrugniulwovfaijgkr.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmZHJ1Z25pdWx3b3ZmYWlqZ2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg1OTA4MjIsImV4cCI6MjA0NDE2NjgyMn0.Jnh7qgfwZlU-REZIML3cub8FHSfdkpZkDQUFgpIjo74',
    tables: {
        COMPANY_PROFILE: 'company_profile',
        USER_LOGIN: 'user_login'
    }
});

// Supabase Service
class SupabaseService {
    static #client = null;

    static get client() {
        if (!this.#client) {
            this.#client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        }
        supabaseClient = this.#client; // For backward compatibility
        // console.log("Supabase client initialized");
        return this.#client;
    }

    static async testConnection(maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const { data, error } = await this.client
                    .from(SUPABASE_CONFIG.tables.COMPANY_PROFILE)
                    .select('id')
                    .limit(1);

                if (error) throw error;

                // console.log("Supabase connection successful");
                return true;
            } catch (error) {
                console.error(`Connection attempt ${attempt} failed:`, error.message);
                if (attempt === maxRetries) return false;
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
}

// Network Service
class NetworkService {
    static #online = navigator.onLine;

    static init() {
        window.addEventListener('online', () => {
            this.#online = true;
            console.log("Back online");
        });

        window.addEventListener('offline', () => {
            this.#online = false;
            console.warn("No network connection");
        });

        return this.#online;
    }

    static get isOnline() {
        return this.#online;
    }
}

// Session Service
class SessionService {
    static _SESSION_KEYS = Object.freeze([
        'EmpCode', 'UserName', 'UserLoginID',
        'UserType', 'CompanyID', 'WorkingBranch'
    ]);

    static loadGlobals() {
        this._SESSION_KEYS.forEach(key => {
            window[key] = localStorage.getItem(key) || null;
        });
    }

    static saveGlobals() {
        this._SESSION_KEYS.forEach(key => {
            if (window[key] !== undefined && window[key] !== null) {
                localStorage.setItem(key, window[key]);
            }
        });
    }

    static setSession(user) {
        const {
            emp_code, user_name, user_login_id,
            user_type, company_id, working_branch
        } = user;

        const sessionMap = {
            EmpCode: emp_code,
            UserName: user_name,
            UserLoginID: user_login_id,
            UserType: user_type,
            CompanyID: company_id,
            WorkingBranch: working_branch || 'default',
        };

        this._SESSION_KEYS.forEach(key => {
            const value = sessionMap[key];
            localStorage.setItem(key, value);
            window[key] = value;
        });
    }

    static clearSession() {
        this._SESSION_KEYS.forEach(key => {
            localStorage.removeItem(key);
            window[key] = null;
        });
    }

    static getSession() {
        const session = this._SESSION_KEYS.reduce((acc, key) => {
            acc[key] = localStorage.getItem(key);
            return acc;
        }, {});

        session.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        session.localTime = new Date().toISOString();

        return session;
    }
}

// ✅ Global sync across tabs
window.addEventListener('storage', (e) => {
    if (SessionService._SESSION_KEYS.includes(e.key)) {
        window[e.key] = e.newValue;
    }
});

// ✅ Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {

    NetworkService.init();

    // Load global session variables
    SessionService.loadGlobals();

    SupabaseService.testConnection().then(isConnected => {
        if (!isConnected && !NetworkService.isOnline) {
            console.error("No network connection and Supabase unavailable");
        }
    });
    // console.log('Session Data:', SessionService.getSession());
});

function handleUserTypePermissions() {
    saveButton.disabled = !(UserType === 1 || UserType === 2);
    console.log("UserType:", UserType);
    newButton.disabled = UserType !== 1;
}

async function logoutOtherSessions(userId) {
    try {
        console.log('Logging out other sessions for user:', userId);
        const { error } = await supabaseClient
            .from('user_sessions')
            .update({ is_active: false })
            .eq('user_id', userId);

        if (error) throw error;
        // alert('Logout other sessions successful');
        return { success: true };
    } catch (err) {
        console.error('Logout other sessions failed:', err);
        return { success: false, error: err };
    }
}

function getDeviceId() {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
}


async function checkSessionToken() {
    const sessionToken = localStorage.getItem('session_token');

    if (!sessionToken || !UserLoginID) {
        redirectToLogin();
        return;
    }

    const { data, error } = await supabaseClient
        .from('user_sessions')
        .select('is_active')
        .eq('user_id', UserLoginID)
        .eq('session_token', sessionToken)
        .maybeSingle();

    if (error || !data || !data.is_active) {
        clearSession();
        redirectToLogin();
        return;
    }

    await supabaseClient
        .from('user_sessions')
        .update({ last_active: new Date().toISOString() })
        .eq('session_token', sessionToken);
}


function clearSession() {
    sessionStorage.removeItem('session_token');
}
function redirectToLogin() {
    window.location.replace('/index.html');
}

async function autoUnlockMultipleTables() {
    if (!NetworkService.isOnline) return;

    const tables = [
        'international_booking',
        'FullLoadBookingDetails',
        'DomesticBookingDetails',
        'CustomsClearance_Details'
    ];

    const cutoffTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const client = SupabaseService.client;

    const results = await Promise.allSettled(
        tables.map(async (tableName) => {
            const { error } = await client
                .from(tableName)
                .update({
                    IsLocked: false,
                    LockedBy: null,
                    LockedAt: null
                })
                .eq('IsLocked', true)
                .not('LockedAt', 'is', null)
                .lt('LockedAt', cutoffTime);

            if (error) {
                throw new Error(`${tableName}: ${error.message}`);
            }
        })
    );

    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.warn('Auto-unlock warning:', result.reason.message);
        }
    });
}

// Listen for a new service worker taking control and auto-reload the page
// let refreshing = false;
// if ('serviceWorker' in navigator) {
//     navigator.serviceWorker.addEventListener('controllerchange', () => {
//         if (!refreshing) {
//             refreshing = true;
//             window.location.reload();
//         }
//     });
// }

const now = new Date();
const localtimeStamp = now.toLocaleString(); // Local date and time
const ISODateTimeNow = new Date().toISOString();
let rowIDEdit = null;
let bankRowIDEdit = null;
let branchCode = null;

// Global variables for permissions
let formName = '';
let formID = null;
let perRead = false;
let perWrite = false;
let perDelete = false;
let perUpdate = false;
const newButton = document.getElementById('newButton');
const modifyButton = document.getElementById('modifyButton');
const deleteButton = document.getElementById('deleteButton');
const reportButton = document.getElementById('reportButton');
const saveButton = document.getElementById('saveButton');
let lockedBookingIds = [];
let alertMessage = '';
let debounceTimer;
let partyCode = null;
let currentPageNumber = 1;
let totalPageCount = 1;
let invoiceNo = null;
let partyName = null;
let customerGSTRate = null;
// const USER_TYPE = Number(UserType);

const reSetPass = '12345'; // Default password for new users
const sessionToken = crypto.randomUUID();
let infomationData = null;
let reportType = null;
let fscPercentManual = 0; // To store manual FSC % if needed

const parseFloatSafe = (value) => parseFloat(value) || 0;

const CHARGE_TYPES = {
    FREIGHT: 'freight amount',
    FSC: 'fuel surcharge',
    FREIGHT_VARIANTS: ['freight amount', 'freight', 'basic freight', 'basic freight amount'],
    FSC_VARIANTS: ['fuel surcharge', 'fsc', 'fuel charge', 'fuel adjustment']
};
const getElementValue = (id) => document.getElementById(id)?.value?.trim() || '';