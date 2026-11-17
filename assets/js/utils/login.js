document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await login();
});

// Cached DOM elements
const el = {
    username: document.getElementById('userName'),
    password: document.getElementById('password'),
    errorMsg: document.getElementById('errorMessage'),
    loginBtn: document.getElementById('loginButton'),
    loginText: document.getElementById('loginButtonText'),
    loginSpinner: document.getElementById('loginSpinner')
};

// Show error message
const showError = (message) => {
    el.errorMsg.textContent = message;
    el.errorMsg.classList.remove('d-none');
};

// Hide error message
const hideError = () => {
    el.errorMsg.classList.add('d-none');
};

// Store user details locally
const storeUserDetails = ({ emp_code, user_name, user_login_id, user_type, company_id, working_branch }) => {
    // 🔥 CLEAR OLD PERMISSIONS (very important)
    Object.keys(localStorage)
        .filter(key => key.startsWith("permissions_"))
        .forEach(key => localStorage.removeItem(key));

    localStorage.setItem('EmpCode', emp_code);
    localStorage.setItem('UserName', user_name);
    localStorage.setItem('UserLoginID', user_login_id);
    localStorage.setItem('UserType', user_type);
    localStorage.setItem('CompanyID', company_id);
    localStorage.setItem('WorkingBranch', working_branch || 'default');
};
const storeDeriveDetails = ({ driver_id, driver_name, driver_login_id, user_type, company_id, working_branch }) => {
    // 🔥 CLEAR OLD PERMISSIONS (very important)
    Object.keys(localStorage)
        .filter(key => key.startsWith("permissions_"))
        .forEach(key => localStorage.removeItem(key));

    localStorage.setItem('DriverID', driver_id);
    localStorage.setItem('DriverName', driver_name);
    localStorage.setItem('DriverLoginID', driver_login_id);
    localStorage.setItem('UserType', user_type);
    localStorage.setItem('CompanyID', company_id);
    localStorage.setItem('WorkingBranch', working_branch || 'default');
};

// Toggle loading state
const setLoading = (isLoading) => {
    el.loginBtn.disabled = isLoading;
    el.loginText.textContent = isLoading ? 'Logging in...' : 'Login';
    el.loginSpinner.classList.toggle('d-none', !isLoading);
};

// Main login handler

async function login() {
    const username = el.username.value.trim();
    const password = el.password.value.trim();
    const deviceId = getDeviceId();
    // store locally
    localStorage.setItem('session_token', sessionToken);

    if (!username || !password) {
        showError('Please enter both username and password.');
        return;
    }

    hideError();
    setLoading(true);

    try {
        const hashedPassword = sha256(password).toString();

        if (username.trim().toUpperCase().startsWith("DRV")) {

            const { data, error } = await supabaseClient
                .from('DriverAuth')
                .select('*')
                .eq('driver_id', username)
                .eq('password_hash', hashedPassword)
                .maybeSingle();

            if (error || !data) {
                showError('Invalid username or password.');
                return;
            }

            const { data: activeSessions, error: sessionErr } = await supabaseClient
                .from('DriverSessions')
                .select('*')
                .eq('driver_id', username)
                .eq('is_active', true);

            if (sessionErr) {
                console.error(sessionErr);
                showError('Session validation failed.');
                return;
            }

            // If logged in from another device
            if (activeSessions.length > 0 &&
                !activeSessions.some(s => s.device_name === deviceId)) {

                showError('You are already logged in from another device.');
                // Optionally, you could add a "Logout Other Sessions" button here to allow the user to terminate other sessions.
                document.getElementById('logoutOtherSessionsBtn').classList.remove('d-none');
                return;
            }

            /* ---------- CREATE / UPDATE SESSION ---------- */
            // sessionToken = crypto.randomUUID();

            await supabaseClient
                .from('user_sessions')
                .upsert({
                    driver_id: username,
                    token_hash: sessionToken,
                    device_id: deviceId,
                    device_name: navigator.userAgent,
                    ip_address: '' + (await fetch('https://api.ipify.org?format=json').then(res => res.json()).then(data => data.ip)) + '',
                    user_agent: navigator.userAgent,
                    last_activity_at: localtimeStamp,
                    is_active: true,
                    issued_at: localtimeStamp,
                    company_id: CompanyID
                });

            storeDeriveDetails(data);


            if (password === reSetPass) {
                localStorage.setItem('ForcePasswordReset', 'true');
                window.location.href = '/pages/auth/new-password.html';
                return;
            }

            window.location.href = '/pages/driver-portal/dashboard.html';

            // showError('Driver login is not allowed here. Please use the mobile app.');
            return;
        }

        const { data, error } = await supabaseClient
            .from('user_login')
            .select('*')
            .eq('user_login_id', username)
            .eq('user_password', hashedPassword)
            .maybeSingle();

        if (error || !data) {
            showError('Invalid username or password.');
            return;
        }

        /* ---------- CHECK ACTIVE SESSIONS ---------- */
        const { data: activeSessions, error: sessionErr } = await supabaseClient
            .from('user_sessions')
            .select('*')
            .eq('user_id', username)
            .eq('is_active', true);

        if (sessionErr) {
            console.error(sessionErr);
            showError('Session validation failed.');
            return;
        }

        // If logged in from another device
        if (activeSessions.length > 0 &&
            !activeSessions.some(s => s.device_id === deviceId)) {

            showError('You are already logged in from another device.');
            // Optionally, you could add a "Logout Other Sessions" button here to allow the user to terminate other sessions.
            document.getElementById('logoutOtherSessionsBtn').classList.remove('d-none');
            return;
        }

        /* ---------- CREATE / UPDATE SESSION ---------- */
        // sessionToken = crypto.randomUUID();

        await supabaseClient
            .from('user_sessions')
            .upsert({
                user_id: username,
                session_token: sessionToken,
                device_id: deviceId,
                device_name: navigator.userAgent,
                ip_address: '' + (await fetch('https://api.ipify.org?format=json').then(res => res.json()).then(data => data.ip)) + '',
                user_agent: navigator.userAgent,
                last_active: localtimeStamp,
                is_active: true,
                created_at: localtimeStamp
            });

        /* ---------- STORE USER ---------- */
        storeUserDetails(data);


        if (password === reSetPass) {
            localStorage.setItem('ForcePasswordReset', 'true');
            window.location.href = '/pages/auth/new-password.html';
            return;
        }

        window.location.href = '/pages/Tools/home.html';

    } catch (err) {
        console.error(err);
        showError('An error occurred during login.');
    } finally {
        setLoading(false);
    }
}


document.getElementById('logoutOtherSessionsBtn')
    .addEventListener('click', async () => {

        const username = el.username.value.trim();


        const result = await logoutOtherSessions(username);

        if (!result.success) {
            alert('Failed to terminate sessions');
            return;
        }

        alert('Other sessions logged out. Please login again.');
        location.reload();
    });

