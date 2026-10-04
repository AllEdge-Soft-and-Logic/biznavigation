/* ============================================================
 * driver-master.js  (v2 — optimized)
 * ------------------------------------------------------------
 * INSERT / UPDATE / SOFT-DELETE driver records in
 *   public."DriverDetails"   (Supabase / PostgREST)
 *
 * Supports:
 *   - Employee link        (employee_id  →  EmployeeMaster.id)
 *   - Driver type          (Employee | Contract | Owner)
 *   - Soft delete          (is_deleted / deleted_by / deleted_at)
 *   - Auto driver_code     (DRV0001 ...)
 *   - Staged documents     (in-memory until driver is saved)
 *
 * Depends on:
 *   - Supabase JS client (via window.getSupabaseClient() / window.sb / window.supabaseClient)
 *   - Bootstrap 5 bundle (toasts, modal, tabs)
 *
 * Exposes: window.DriverMaster
 * ============================================================ */
(function () {
    'use strict';

    /* =========================================================
     * CONFIG
     * ======================================================= */
    const TABLE = 'DriverDetails';
    const CODE_PREFIX = 'DRV';
    const CODE_PAD = 4;
    const CODE_MAX_RETRY = 5;
    const SEARCH_LIMIT = 100;
    const SOFT_DELETE = true;   // set false if you haven't migrated yet

    /* =========================================================
     * STATE
     * ======================================================= */
    let sb = null;
    let companyId = '';
    let currentDriverId = null;   // null  => insert mode
    let saving = false;
    let pendingDocs = [];
    let searchResults = [];     // 🐞 FIX: was implicit global
    let searchSeq = 0;      // race guard for live search
    let lockedFields = [];     // fields locked because of employee link

    /* =========================================================
     * DOM SHORTCUTS (cached)
     * ======================================================= */
    const $ = (id) => document.getElementById(id);

    let form, saveButton, newButton, modifyButton, deleteButton, reportButton,
        formStateBadge, driverIdInput, companyIdInput, tempFormIdInput,
        hiddenStatusInput, searchModalEl, employeeLinkBanner, employeeIdInput,
        driverTypeSelect;

    /* =========================================================
     * FIELD MAP  (input id  ->  DB column)
     * ======================================================= */
    const FIELD_MAP = {
        driverCode: 'driver_code',
        driverName: 'driver_name',
        statusSelect: 'status',
        assignedVehicle: 'assigned_vehicle_number',
        phoneNumber: 'phone_number',
        alternatePhone: 'alternate_phone',
        pincode: 'pincode',
        city: 'city',
        state: 'state',
        address: 'address',
        licenseNumber: 'license_number',
        licenseExpiry: 'license_expiry_date',
        badgeNumber: 'badge_number',
        aadharNumber: 'aadhar_number',
        panNumber: 'pan_number'
    };

    /* Fields that must be NULL (not '') when empty */
    const NULLABLE = new Set([
        'driver_name', 'phone_number', 'alternate_phone', 'address', 'pincode',
        'city', 'state', 'license_number', 'license_expiry_date', 'badge_number',
        'aadhar_number', 'pan_number', 'assigned_vehicle_number', 'employee_id'
    ]);

    /* Fields owned by EmployeeMaster — become READ-ONLY when linked */
    const EMPLOYEE_OWNED = new Set([
        'driver_name', 'phone_number', 'alternate_phone',
        'address', 'pincode', 'city', 'state',
        'aadhar_number', 'pan_number'
    ]);

    /* DOM ids of employee-owned fields (for lock/unlock) */
    const EMPLOYEE_OWNED_DOM_IDS = [
        'driverName', 'phoneNumber', 'alternatePhone',
        'address', 'pincode', 'city', 'state',
        'aadharNumber', 'panNumber'
    ];

    /* Columns that should be upper-cased on write */
    const UPPERCASE_COLUMNS = new Set([
        'driver_code', 'license_number', 'pan_number',
        'badge_number', 'assigned_vehicle_number'
    ]);

    /* =========================================================
     * BOOTSTRAP
     * ======================================================= */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        form = $('driverMasterForm');
        if (!form) return;

        saveButton = $('saveButton');
        newButton = $('newButton');
        modifyButton = $('modifyButton');
        deleteButton = $('deleteButton');
        reportButton = $('reportButton');
        formStateBadge = $('formStateBadge');
        driverIdInput = $('driverId');
        companyIdInput = $('companyId');
        tempFormIdInput = $('tempFormID');
        hiddenStatusInput = $('status');
        searchModalEl = $('searchDriverModal');
        employeeIdInput = $('employeeId');        // optional hidden input
        driverTypeSelect = $('driverType');        // optional select
        employeeLinkBanner = $('employeeLinkBanner');

        sb = resolveClient();
        companyId = resolveCompanyId();

        if (companyIdInput && companyId) companyIdInput.value = companyId;

        bindEvents();
        setMode('insert');
        updateActionButtons();
        updateExpiryHint();
        renderDocuments();
        applyEmployeeLock(false);   // start unlocked
    }

    /* =========================================================
     * CLIENT / CONTEXT HELPERS
     * ======================================================= */
    function resolveClient() {
        try {
            if (typeof window.getSupabaseClient === 'function') {
                const c = window.getSupabaseClient();
                if (c && typeof c.from === 'function') return c;
            }
        } catch (_) { /* ignore */ }

        const candidates = [window.supabaseClient, window.sb, window.db, window.supabaseClientInstance];
        for (const c of candidates) {
            if (c && typeof c.from === 'function') return c;
        }

        const url = window.SUPABASE_URL || (window.ENV && window.ENV.SUPABASE_URL);
        const key = window.SUPABASE_ANON_KEY || (window.ENV && window.ENV.SUPABASE_ANON_KEY);
        if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabaseClient = window.supabase.createClient(url, key);
            return window.supabaseClient;
        }
        return null;
    }

    function resolveCompanyId() {
        const el = $('companyId');
        if (el && el.value.trim()) return el.value.trim();

        for (const k of ['company_id', 'companyId', 'cmp_id']) {
            const v = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (v) return v;
        }
        if (window.currentCompany && window.currentCompany.id) return String(window.currentCompany.id);
        return '';
    }

    function getCurrentUserId() {
        for (const k of ['user_id', 'userId', 'username', 'user_name', 'email', 'userEmail']) {
            const v = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (v) return v;
        }
        if (window.currentUser) {
            return window.currentUser.id || window.currentUser.email || String(window.currentUser);
        }
        return 'system';
    }

    /* =========================================================
     * EVENTS
     * ======================================================= */
    function bindEvents() {
        form.addEventListener('submit', onSubmit);

        if (newButton) newButton.addEventListener('click', onNew);
        if (modifyButton) modifyButton.addEventListener('click', onModify);
        if (deleteButton) deleteButton.addEventListener('click', onDelete);
        if (reportButton) reportButton.addEventListener('click', onPrint);

        const codeEl = $('driverCode');
        if (codeEl) {
            codeEl.style.cursor = 'pointer';
            codeEl.title = 'Click to search saved drivers';
            codeEl.addEventListener('click', openSearchModal);
        }

        // search modal
        const searchBtn = $('btnTriggerDriverSearch');
        const searchInput = $('searchSavedDriverInput');
        if (searchBtn) searchBtn.addEventListener('click', runSearch);
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
            });
            searchInput.addEventListener('input', debounce(runSearch, 350));
        }
        if (searchModalEl) {
            searchModalEl.addEventListener('shown.bs.modal', () => searchInput && searchInput.focus());
        }

        // expiry hint
        const expiry = $('licenseExpiry');
        if (expiry) expiry.addEventListener('change', updateExpiryHint);

        // documents
        const addDocBtn = $('addDocumentButton');
        if (addDocBtn) addDocBtn.addEventListener('click', addDocumentRow);

        // uppercase helpers (input + paste)
        ['driverCode', 'licenseNumber', 'panNumber', 'badgeNumber', 'assignedVehicle']
            .forEach((id) => {
                const el = $(id);
                if (!el) return;
                const up = () => { el.value = el.value.toUpperCase(); };
                el.addEventListener('input', up);
                el.addEventListener('paste', () => setTimeout(up, 0));
            });

        // clear invalid styling on typing
        form.addEventListener('input', (e) => {
            if (e.target.classList) e.target.classList.remove('is-invalid');
        });
    }

    /* =========================================================
     * SUBMIT  ->  INSERT or UPDATE
     * ======================================================= */
    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;

        sb = sb || resolveClient();
        if (!sb) return showError('Database connection is not ready. Please reload the page.');

        companyId = resolveCompanyId();
        if (!companyId) return showError('Company could not be identified. Please sign in again.');
        if (companyIdInput) companyIdInput.value = companyId;

        if (!validateForm()) {
            showError('Please correct the highlighted fields.');
            focusFirstInvalid();
            return;
        }

        const mode = saveButton && saveButton.dataset.mode === 'update' ? 'update' : 'insert';

        setSaving(true);
        try {
            const payload = buildPayload(companyId);
            let saved;

            if (mode === 'update') {
                const id = currentDriverId || (driverIdInput && driverIdInput.value);
                if (!id) throw new Error('No driver selected for update.');
                saved = await updateDriver(id, payload);
                showSuccess(`Driver "${saved.driver_name || saved.driver_code}" updated successfully.`);
            } else {
                saved = await insertDriver(payload);
                showSuccess(`Driver "${saved.driver_name || saved.driver_code}" saved successfully.`);
            }

            applySavedRecord(saved);
            setMode('update');
            updateActionButtons();
        } catch (err) {
            console.error('[DriverMaster] save failed:', err);
            showError(friendlyError(err));
        } finally {
            setSaving(false);
        }
    }

    /* ---------------------------------------------------------
     * INSERT  (with duplicate driver_code retry)
     * ------------------------------------------------------- */
    async function insertDriver(payload) {
        const body = { ...payload };
        const nowIso = new Date().toISOString();

        body.created_by = getCurrentUserId();
        body.created_at = nowIso;
        body.is_deleted = false;

        if (!body.driver_code) {
            body.driver_code = await nextDriverCode(companyId);
        }

        let attempt = 0;
        let lastError = null;

        while (attempt <= CODE_MAX_RETRY) {
            const { data, error } = await sb
                .from(TABLE)
                .insert(body)
                .select()
                .single();

            if (!error) return data;

            lastError = error;

            if (isDuplicateCodeError(error) && attempt < CODE_MAX_RETRY) {
                attempt++;
                body.driver_code = bumpCode(body.driver_code || CODE_PREFIX);
                continue;
            }
            throw error;
        }
        throw lastError || new Error('Unable to generate a unique driver code.');
    }

    /* ---------------------------------------------------------
     * UPDATE
     * ------------------------------------------------------- */
    async function updateDriver(id, payload) {
        const body = { ...payload };

        // immutable / server-owned
        delete body.company_id;
        delete body.driver_code;
        delete body.created_by;
        delete body.created_at;
        delete body.is_deleted;
        delete body.deleted_by;
        delete body.deleted_at;

        body.updated_by = getCurrentUserId();
        body.updated_at = new Date().toISOString();

        let q = sb
            .from(TABLE)
            .update(body)
            .eq('id', id)
            .eq('company_id', companyId);

        if (SOFT_DELETE) q = q.eq('is_deleted', false);

        const { data, error } = await q.select().maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Driver not found, or you do not have permission to modify it.');
        return data;
    }

    /* ---------------------------------------------------------
     * SOFT DELETE
     * ------------------------------------------------------- */
    async function softDeleteDriver(id) {
        const body = {
            is_deleted: true,
            deleted_by: getCurrentUserId(),
            deleted_at: new Date().toISOString(),
            updated_by: getCurrentUserId(),
            updated_at: new Date().toISOString()
        };

        const { error } = await sb
            .from(TABLE)
            .update(body)
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) throw error;
    }

    /* =========================================================
     * PAYLOAD / VALIDATION
     * ======================================================= */
    function buildPayload(cid) {
        const payload = { company_id: cid };
        const linkedEmployeeId = readEmployeeId();
        const isEmployee = !!linkedEmployeeId;

        // Employee ID (number or null)
        payload.employee_id = isEmployee ? linkedEmployeeId : null;

        // Driver type — auto-derive if linked, else use select, else default
        let dtype = driverTypeSelect ? String(driverTypeSelect.value || '').trim() : '';
        if (isEmployee) dtype = 'Employee';
        if (!dtype) dtype = 'Contract';
        payload.driver_type = dtype;

        Object.entries(FIELD_MAP).forEach(([domId, column]) => {
            // Skip employee-owned fields when linked — don't overwrite
            if (isEmployee && EMPLOYEE_OWNED.has(column)) return;

            const el = $(domId);
            let value = el ? String(el.value || '').trim() : '';

            if (UPPERCASE_COLUMNS.has(column)) value = value.toUpperCase();
            if (NULLABLE.has(column) && value === '') value = null;

            payload[column] = value;
        });

        if (!payload.status) payload.status = 'Active';
        return payload;
    }

    function validateForm() {
        const valid = form.checkValidity();
        form.classList.add('was-validated');
        return valid;
    }

    function focusFirstInvalid() {
        const el = form.querySelector(':invalid');
        if (!el) return;

        const pane = el.closest ? el.closest('.tab-pane') : null;
        if (pane && !pane.classList.contains('active') && window.bootstrap) {
            const trigger = document.querySelector(`[data-bs-target="#${pane.id}"]`);
            if (trigger) bootstrap.Tab.getOrCreateInstance(trigger).show();
        }
        if (typeof el.focus === 'function') el.focus();
    }

    /* =========================================================
     * EMPLOYEE LINK
     * ======================================================= */
    function readEmployeeId() {
        if (!employeeIdInput) return null;
        const raw = String(employeeIdInput.value || '').trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function writeEmployeeId(id) {
        if (!employeeIdInput) return;
        employeeIdInput.value = id == null ? '' : String(id);
    }

    function applyEmployeeLock(isEmployee) {
        lockedFields = [];

        EMPLOYEE_OWNED_DOM_IDS.forEach((domId) => {
            const el = $(domId);
            if (!el) return;

            el.readOnly = isEmployee;
            el.classList.toggle('bg-light', isEmployee);
            el.title = isEmployee ? 'Managed in Employee Master' : '';

            if (isEmployee) lockedFields.push(domId);
        });

        if (driverTypeSelect) {
            driverTypeSelect.disabled = isEmployee;
            if (isEmployee) driverTypeSelect.value = 'Employee';
        }

        if (employeeLinkBanner) {
            employeeLinkBanner.classList.toggle('d-none', !isEmployee);
        }
    }

    /* =========================================================
     * DRIVER CODE GENERATION
     * ======================================================= */
    async function nextDriverCode(cid) {
        let q = sb
            .from(TABLE)
            .select('driver_code')
            .eq('company_id', cid)
            .like('driver_code', `${CODE_PREFIX}%`)
            .limit(5000);

        if (SOFT_DELETE) q = q.eq('is_deleted', false);

        const { data, error } = await q;

        if (error) {
            console.warn('[DriverMaster] could not read existing codes:', error.message);
            return `${CODE_PREFIX}${Date.now().toString().slice(-6)}`;
        }

        let max = 0;
        (data || []).forEach((row) => {
            const m = /(\d+)\s*$/.exec(row.driver_code || '');
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });

        return `${CODE_PREFIX}${String(max + 1).padStart(CODE_PAD, '0')}`;
    }

    function bumpCode(code) {
        const m = /^(.*?)(\d+)\s*$/.exec(code || '');
        if (!m) return `${CODE_PREFIX}${Date.now().toString().slice(-6)}`;
        const next = String(parseInt(m[2], 10) + 1).padStart(m[2].length, '0');
        return `${m[1]}${next}`;
    }

    /* =========================================================
     * ERROR MAPPING
     * ======================================================= */
    function isDuplicateCodeError(error) {
        if (!error) return false;
        const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
        return error.code === '23505' && msg.includes('driver_code');
    }

    function friendlyError(error) {
        if (!error) return 'Something went wrong. Please try again.';
        if (typeof error === 'string') return error;

        const msg = `${error.message || ''} ${error.details || ''}`;
        const low = msg.toLowerCase();
        const code = error.code;

        if (code === '23505' || low.includes('duplicate key')) {
            if (low.includes('driver_code')) return 'Driver code collision. Please try saving again — a new code will be generated.';
            if (low.includes('license_number')) return 'This license number is already registered for another driver in your company.';
            if (low.includes('aadhar')) return 'This Aadhaar number is already linked to another driver.';
            if (low.includes('pan')) return 'This PAN is already linked to another driver.';
            if (low.includes('employee_id')) return 'This employee is already linked to another driver.';
            return 'A record with these details already exists.';
        }
        if (code === '23503' || low.includes('foreign key')) {
            return 'Invalid company or employee reference.';
        }
        if (code === '23502' || low.includes('not-null')) {
            return 'A required field is missing. Please review the form.';
        }
        if (code === '23514' || low.includes('check constraint')) {
            return 'One of the values is not allowed (check status / driver type).';
        }
        if (code === '42501' || low.includes('row-level security') || low.includes('permission denied')) {
            return 'You do not have permission to save this driver.';
        }
        if (low.includes('failed to fetch') || low.includes('networkerror')) {
            return 'Network problem — please check your connection and try again.';
        }
        return error.message || 'Unable to save the driver record.';
    }

    /* =========================================================
     * FORM MODE / STATE
     * ======================================================= */
    function setMode(mode) {
        if (!saveButton) return;
        saveButton.dataset.mode = mode;

        if (mode === 'update') {
            saveButton.innerHTML = '<i class="bi bi-arrow-repeat"></i> Update';
            if (formStateBadge) {
                formStateBadge.textContent = 'Editing';
                formStateBadge.className = 'badge rounded-pill text-bg-warning fw-normal';
            }
            if (hiddenStatusInput) hiddenStatusInput.value = 'Modify';
        } else {
            saveButton.innerHTML = '<i class="bi bi-check2-circle"></i> Save';
            if (formStateBadge) {
                formStateBadge.textContent = 'New';
                formStateBadge.className = 'badge rounded-pill text-bg-light border fw-normal';
            }
            if (hiddenStatusInput) hiddenStatusInput.value = 'New';
        }
    }

    function updateActionButtons() {
        const hasDriver = !!currentDriverId;
        if (deleteButton) deleteButton.disabled = !hasDriver;
        if (reportButton) reportButton.disabled = !hasDriver;
        if (modifyButton) modifyButton.disabled = false;
    }

    function setSaving(isSaving) {
        saving = isSaving;
        if (!saveButton) return;

        if (isSaving) {
            saveButton.disabled = true;
            saveButton.dataset.originalHtml = saveButton.innerHTML;
            saveButton.innerHTML =
                '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving…';
        } else {
            saveButton.disabled = false;
            if (saveButton.dataset.originalHtml) {
                saveButton.innerHTML = saveButton.dataset.originalHtml;
                delete saveButton.dataset.originalHtml;
            }
            setMode(saveButton.dataset.mode === 'update' ? 'update' : 'insert');
        }
    }

    /* =========================================================
     * FORM POPULATION / RESET
     * ======================================================= */
    function populateForm(record) {
        if (!record) return;

        Object.entries(FIELD_MAP).forEach(([domId, column]) => {
            const el = $(domId);
            if (!el) return;

            let value = record[column];

            if (column === 'license_expiry_date' && value) {
                value = String(value).slice(0, 10);
            }
            el.value = value === null || value === undefined ? '' : value;
        });

        // driver_type
        if (driverTypeSelect && record.driver_type) {
            driverTypeSelect.value = record.driver_type;
        }

        // employee link
        writeEmployeeId(record.employee_id || null);

        form.classList.remove('was-validated');
        updateExpiryHint();
    }

    function applySavedRecord(record) {
        if (!record) return;

        currentDriverId = record.id;
        if (driverIdInput) driverIdInput.value = record.id;
        if (companyIdInput) companyIdInput.value = record.company_id || companyId;
        if ($('driverCode')) $('driverCode').value = record.driver_code || '';

        populateForm(record);
        applyEmployeeLock(!!record.employee_id);
    }

    function resetForm() {
        form.reset();
        form.classList.remove('was-validated');

        currentDriverId = null;
        if (driverIdInput) driverIdInput.value = '';
        if (tempFormIdInput) tempFormIdInput.value = '';
        if ($('driverCode')) $('driverCode').value = '';
        if ($('statusSelect')) $('statusSelect').value = 'Active';
        if (driverTypeSelect) driverTypeSelect.value = 'Contract';
        writeEmployeeId(null);

        form.querySelectorAll('.is-invalid, .is-valid').forEach((el) =>
            el.classList.remove('is-invalid', 'is-valid'));

        pendingDocs = [];
        renderDocuments();
        updateExpiryHint();
        applyEmployeeLock(false);

        const firstTab = document.querySelector('#driverMasterTabs .nav-link');
        if (firstTab && window.bootstrap) bootstrap.Tab.getOrCreateInstance(firstTab).show();
    }

    /* =========================================================
     * ACTION BAR HANDLERS
     * ======================================================= */
    function onNew() {
        if (saving) return;
        resetForm();
        setMode('insert');
        updateActionButtons();
        if ($('driverName')) $('driverName').focus();
    }

    function onModify() {
        if (saving) return;
        if (!currentDriverId) return openSearchModal();
        setMode('update');
        if ($('driverName')) $('driverName').focus();
    }

    async function onDelete() {
        if (saving || !currentDriverId) return;

        sb = sb || resolveClient();
        if (!sb) return showError('Database connection is not ready.');

        const code = $('driverCode') ? $('driverCode').value : '';
        const name = $('driverName') ? $('driverName').value : '';
        const label = `${code || ''} ${name || ''}`.trim() || 'this driver';

        if (!window.confirm(
            SOFT_DELETE
                ? `Move ${label} to trash?\n\nThe record can be restored by an administrator.`
                : `Delete ${label}?\n\nThis action cannot be undone.`
        )) return;

        setSaving(true);
        try {
            if (SOFT_DELETE) {
                await softDeleteDriver(currentDriverId);
            } else {
                const { error } = await sb
                    .from(TABLE)
                    .delete()
                    .eq('id', currentDriverId)
                    .eq('company_id', companyId);
                if (error) throw error;
            }

            showSuccess(`Driver ${label} ${SOFT_DELETE ? 'moved to trash' : 'deleted'}.`);
            resetForm();
            setMode('insert');
            updateActionButtons();
        } catch (err) {
            console.error('[DriverMaster] delete failed:', err);
            showError(friendlyError(err));
        } finally {
            setSaving(false);
        }
    }

    function onPrint() {
        if (!currentDriverId) return;
        window.print();
    }

    /* =========================================================
     * SEARCH SAVED DRIVERS
     * ======================================================= */
    function openSearchModal() {
        if (!searchModalEl || !window.bootstrap) return;
        bootstrap.Modal.getOrCreateInstance(searchModalEl).show();
        if (!searchResults.length) runSearch();
    }

    function sanitizeTerm(term) {
        return String(term || '')
            .trim()
            .replace(/[,()*%\\"']/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 60);
    }

    async function runSearch() {
        const tbody = $('searchDriverTableBody');
        const input = $('searchSavedDriverInput');
        if (!tbody) return;

        sb = sb || resolveClient();
        companyId = resolveCompanyId();

        if (!sb) {
            tbody.innerHTML = '';
            tbody.appendChild(emptyRow(5, 'Database connection is not ready.'));
            return;
        }
        if (!companyId) {
            tbody.innerHTML = '';
            tbody.appendChild(emptyRow(5, 'Company not identified.'));
            return;
        }

        const seq = ++searchSeq;
        const term = sanitizeTerm(input ? input.value : '');

        tbody.innerHTML =
            '<tr><td colspan="5" class="text-center py-3 text-muted">' +
            '<span class="spinner-border spinner-border-sm me-2"></span>Searching…</td></tr>';

        let query = sb
            .from(TABLE)
            .select('id,driver_code,driver_name,phone_number,license_number,status,driver_type,employee_id')
            .eq('company_id', companyId)
            .order('driver_code', { ascending: true })
            .limit(SEARCH_LIMIT);

        if (SOFT_DELETE) query = query.eq('is_deleted', false);

        if (term) {
            const like = `%${term}%`;
            query = query.or([
                `driver_code.ilike.${like}`,
                `driver_name.ilike.${like}`,
                `phone_number.ilike.${like}`,
                `license_number.ilike.${like}`
            ].join(','));
        }

        const { data, error } = await query;

        if (seq !== searchSeq) return; // stale response — ignore

        if (error) {
            console.error('[DriverMaster] search failed:', error);
            tbody.innerHTML = '';
            tbody.appendChild(emptyRow(5, friendlyError(error)));
            return;
        }

        searchResults = data || [];
        renderSearchResults(searchResults);
    }

    function renderSearchResults(rows) {
        const tbody = $('searchDriverTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!rows.length) {
            tbody.appendChild(emptyRow(5, 'No matching drivers found.'));
            return;
        }

        const frag = document.createDocumentFragment();

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.dataset.id = row.id;
            tr.title = 'Click to load this driver';

            tr.appendChild(cell(row.driver_code || '—', 'fw-semibold'));

            const nameTd = document.createElement('td');
            nameTd.textContent = row.driver_name || '—';
            if (row.employee_id) {
                const chip = document.createElement('span');
                chip.className = 'badge text-bg-info ms-1';
                chip.textContent = 'Employee';
                chip.title = 'Linked to EmployeeMaster';
                nameTd.appendChild(chip);
            }
            tr.appendChild(nameTd);

            tr.appendChild(cell(row.phone_number || '—'));
            tr.appendChild(cell(row.license_number || '—'));

            const statusTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'badge ' + statusBadgeClass(row.status);
            badge.textContent = row.status || 'Active';
            statusTd.appendChild(badge);
            tr.appendChild(statusTd);

            tr.addEventListener('click', () => selectDriver(row.id));
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
    }

    function cell(text, extraClass) {
        const td = document.createElement('td');
        if (extraClass) td.className = extraClass;
        td.textContent = text;
        return td;
    }

    function emptyRow(colspan, message) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = colspan;
        td.className = 'text-center text-muted fst-italic py-3';
        td.textContent = message;
        tr.appendChild(td);
        return tr;
    }

    function statusBadgeClass(status) {
        switch (String(status || '').toLowerCase()) {
            case 'active': return 'text-bg-success';
            case 'inactive': return 'text-bg-secondary';
            case 'suspended': return 'text-bg-danger';
            case 'on leave': return 'text-bg-warning';
            default: return 'text-bg-light border';
        }
    }

    async function selectDriver(id) {
        sb = sb || resolveClient();
        if (!sb) return showError('Database connection is not ready.');

        let q = sb
            .from(TABLE)
            .select('*')
            .eq('id', id)
            .eq('company_id', companyId);

        if (SOFT_DELETE) q = q.eq('is_deleted', false);

        const { data, error } = await q.maybeSingle();

        if (error) return showError(friendlyError(error));
        if (!data) return showError('Driver record not found.');

        applySavedRecord(data);
        setMode('update');
        updateActionButtons();
        closeSearchModal();

        showSuccess(`Loaded driver ${data.driver_code}.`);
    }

    function closeSearchModal() {
        if (!searchModalEl || !window.bootstrap) return;
        const instance = bootstrap.Modal.getInstance(searchModalEl);
        if (instance) instance.hide();
    }

    /* =========================================================
     * LICENSE EXPIRY HINT
     * ======================================================= */
    function updateExpiryHint() {
        const input = $('licenseExpiry');
        const hint = $('licenseExpiryHint');
        if (!input || !hint) return;

        hint.textContent = '';
        hint.className = 'form-text';

        if (!input.value) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const expiry = new Date(input.value + 'T00:00:00');
        if (isNaN(expiry.getTime())) return;

        const days = Math.round((expiry - today) / 86400000);

        if (days < 0) {
            hint.textContent = `Expired ${Math.abs(days)} day(s) ago.`;
            hint.classList.add('text-danger', 'fw-semibold');
        } else if (days <= 30) {
            hint.textContent = `Expires in ${days} day(s) — renew soon.`;
            hint.classList.add('text-warning', 'fw-semibold');
        } else {
            hint.textContent = `Valid for ${days} day(s).`;
            hint.classList.add('text-success');
        }
    }

    /* =========================================================
     * DOCUMENTS TAB  (in-memory staging)
     * ======================================================= */
    function addDocumentRow() {
        const typeEl = $('documentTypeInput');
        const numberEl = $('documentNumber');
        const validEl = $('validUpTo');
        const fileEl = $('documentFile');

        const type = typeEl ? typeEl.value.trim() : '';
        if (!type) return showError('Please enter a document type.');

        const file = fileEl && fileEl.files ? fileEl.files[0] : null;

        pendingDocs.push({
            uid: (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            document_type: type,
            document_number: numberEl ? numberEl.value.trim() : '',
            valid_up_to: validEl ? validEl.value : '',
            file_name: file ? file.name : '',
            file: file || null
        });

        if (typeEl) typeEl.value = '';
        if (numberEl) numberEl.value = '';
        if (validEl) validEl.value = '';
        if (fileEl) fileEl.value = '';

        renderDocuments();
    }

    function removeDocumentRow(uid) {
        pendingDocs = pendingDocs.filter((d) => d.uid !== uid);
        renderDocuments();
    }

    function renderDocuments() {
        const tbody = $('documentTableBody');
        const badge = $('docCountBadge');
        if (badge) badge.textContent = String(pendingDocs.length);
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!pendingDocs.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.className = 'vm-empty';
            td.innerHTML =
                '<i class="bi bi-file-earmark-text"></i>' +
                'No documents attached. Use the form above to add one.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        const frag = document.createDocumentFragment();

        pendingDocs.forEach((doc) => {
            const tr = document.createElement('tr');

            tr.appendChild(cell(doc.document_type || '—', 'fw-semibold'));
            tr.appendChild(cell(doc.document_number || '—'));
            tr.appendChild(cell(doc.valid_up_to || '—'));
            tr.appendChild(cell(doc.file_name || '—'));

            const actionTd = document.createElement('td');
            actionTd.className = 'text-center';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-danger';
            btn.title = 'Remove document';
            btn.innerHTML = '<i class="bi bi-x-lg"></i>';
            btn.addEventListener('click', () => removeDocumentRow(doc.uid));
            actionTd.appendChild(btn);
            tr.appendChild(actionTd);

            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
    }

    /* =========================================================
     * TOASTS
     * ======================================================= */
    function showToast(elementId, messageId, message) {
        const el = $(elementId);
        if (!el || !window.bootstrap) {
            console.warn('[DriverMaster]', message);
            return;
        }
        const msgEl = $(messageId);
        if (msgEl) msgEl.textContent = message;

        bootstrap.Toast.getOrCreateInstance(el, { delay: 4500 }).show();
    }

    function showError(message) { showToast('errorToast', 'errorToastMessage', message); }
    function showSuccess(message) { showToast('successToast', 'successToastMessage', message); }

    /* =========================================================
     * MISC UTILITIES
     * ======================================================= */
    function debounce(fn, wait) {
        let t = null;
        return function debounced(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    /* =========================================================
     * PUBLIC API
     * ======================================================= */
    window.DriverMaster = {
        /** Load a driver by primary key into the form (edit mode). */
        load: selectDriver,

        /** Reset the form to "new driver" state. */
        reset: () => { resetForm(); setMode('insert'); updateActionButtons(); },

        /** Programmatic insert (bypasses the form). */
        insert: async (partial) => {
            sb = sb || resolveClient();
            companyId = resolveCompanyId();
            if (!sb) throw new Error('Database connection is not ready.');
            if (!companyId) throw new Error('Company not identified.');
            return insertDriver({ ...partial, company_id: companyId });
        },

        /** Programmatic update (bypasses the form). */
        update: async (id, partial) => {
            sb = sb || resolveClient();
            companyId = resolveCompanyId();
            if (!sb) throw new Error('Database connection is not ready.');
            return updateDriver(id, { ...partial, company_id: companyId });
        },

        /** Soft-delete a driver by id. */
        remove: async (id) => {
            sb = sb || resolveClient();
            companyId = resolveCompanyId();
            if (!sb) throw new Error('Database connection is not ready.');
            return softDeleteDriver(id);
        },

        /* ---------- Employee link ---------- */
        getLinkedEmployeeId: () => readEmployeeId(),
        isPayrollEmployee: () => !!readEmployeeId(),

        /**
         * Link an employee to the currently loaded driver.
         * @param {number} employeeId
         * @param {object} [prefill]  optional { driver_name, phone_number, ... }
         *                            to display while the DB trigger syncs
         */
        linkEmployee: (employeeId, prefill) => {
            const id = Number(employeeId);
            if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid employee id.');
            writeEmployeeId(id);
            if (prefill) populateForm({ ...prefill, employee_id: id });
            applyEmployeeLock(true);
        },

        /** Clear the employee link — driver becomes a contract driver. */
        unlinkEmployee: () => {
            writeEmployeeId(null);
            applyEmployeeLock(false);
            if (driverTypeSelect) driverTypeSelect.value = 'Contract';
        },

        /* ---------- State getters ---------- */
        getCurrentDriverId: () => currentDriverId,
        getPendingDocuments: () => pendingDocs.slice(),
        clearPendingDocuments: () => { pendingDocs = []; renderDocuments(); },

        refreshContext: () => {
            companyId = resolveCompanyId();
            if (companyIdInput) companyIdInput.value = companyId;
            return companyId;
        }
    };

})();