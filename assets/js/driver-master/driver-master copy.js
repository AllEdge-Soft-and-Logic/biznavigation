/* ============================================================
 * driver-master.js  (v3 — highly optimized)
 * ------------------------------------------------------------
 * INSERT / UPDATE / SOFT-DELETE driver records in
 *   public."DriverDetails"   (Supabase / PostgREST)
 * ============================================================ */
(function () {
    'use strict';

    /* =========================================================
     * CONFIG
     * ======================================================= */
    const TABLE = 'DriverMaster';
    const CODE_PREFIX = 'DRV';
    const CODE_PAD = 4;
    const CODE_MAX_RETRY = 5;
    const SEARCH_LIMIT = 100;
    const SOFT_DELETE = true;

    /* =========================================================
     * STATE
     * ======================================================= */
    let sb = null;
    let companyId = '';
    let currentDriverId = null; // null => insert mode
    let saving = false;
    let pendingDocs = [];
    let searchResults = [];
    let searchSeq = 0;
    let lockedFields = [];

    /* =========================================================
     * DOM SHORTCUTS (Cached on init)
     * ======================================================= */
    const $ = (id) => document.getElementById(id);

    let form, saveButton, newButton, modifyButton, deleteButton, reportButton,
        formStateBadge, driverIdInput, companyIdInput, tempFormIdInput,
        hiddenStatusInput, searchModalEl, employeeLinkBanner, employeeIdInput,
        driverTypeSelect;

    const ui = {}; // Centralized cache for all FIELD_MAP inputs

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

    const NULLABLE = new Set([
        'driver_name', 'phone_number', 'alternate_phone', 'address', 'pincode',
        'city', 'state', 'license_number', 'license_expiry_date', 'badge_number',
        'aadhar_number', 'pan_number', 'assigned_vehicle_number', 'employee_id'
    ]);

    const EMPLOYEE_OWNED = new Set([
        'driver_name', 'phone_number', 'alternate_phone',
        'address', 'pincode', 'city', 'state',
        'aadhar_number', 'pan_number'
    ]);

    const EMPLOYEE_OWNED_DOM_IDS = [
        'driverName', 'phoneNumber', 'alternatePhone',
        'address', 'pincode', 'city', 'state',
        'aadharNumber', 'panNumber'
    ];

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

        // Cache core controls
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
        employeeIdInput = $('employeeId');
        driverTypeSelect = $('driverType');
        employeeLinkBanner = $('employeeLinkBanner');

        // Cache all dynamic inputs from FIELD_MAP
        Object.keys(FIELD_MAP).forEach(id => {
            ui[id] = $(id);
        });

        sb = resolveClient();
        companyId = resolveCompanyId();

        if (companyIdInput && companyId) companyIdInput.value = companyId;

        bindEvents();
        setMode('insert');
        updateActionButtons();
        updateExpiryHint();
        renderDocuments();
        applyEmployeeLock(false);
    }

    /* =========================================================
     * CLIENT / CONTEXT HELPERS
     * ======================================================= */
    function resolveClient() {
        if (typeof window.getSupabaseClient === 'function') {
            const c = window.getSupabaseClient();
            if (c?.from) return c;
        }
        const candidates = [window.supabaseClient, window.sb, window.db, window.supabaseClientInstance];
        for (const c of candidates) {
            if (c?.from) return c;
        }
        const env = window.ENV || {};
        const url = window.SUPABASE_URL || env.SUPABASE_URL;
        const key = window.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
        if (url && key && window.supabase?.createClient) {
            return (window.supabaseClient = window.supabase.createClient(url, key));
        }
        return null;
    }

    function resolveCompanyId() {
        if (companyIdInput?.value.trim()) return companyIdInput.value.trim();
        for (const k of ['company_id', 'companyId', 'cmp_id']) {
            const v = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (v) return v;
        }
        return window.currentCompany?.id ? String(window.currentCompany.id) : '';
    }

    function getCurrentUserId() {
        for (const k of ['user_id', 'userId', 'username', 'user_name', 'email', 'userEmail']) {
            const v = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (v) return v;
        }
        return window.currentUser?.id || window.currentUser?.email || 'system';
    }

    /* =========================================================
     * EVENTS
     * ======================================================= */
    function bindEvents() {
        form.addEventListener('submit', onSubmit);
        newButton?.addEventListener('click', onNew);
        modifyButton?.addEventListener('click', onModify);
        deleteButton?.addEventListener('click', onDelete);
        reportButton?.addEventListener('click', onPrint);

        if (ui.driverCode) {
            ui.driverCode.style.cursor = 'pointer';
            ui.driverCode.title = 'Click to search saved drivers';
            ui.driverCode.addEventListener('click', openSearchModal);
        }

        const searchBtn = $('btnTriggerDriverSearch');
        const searchInput = $('searchSavedDriverInput');
        searchBtn?.addEventListener('click', runSearch);
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
            });
            searchInput.addEventListener('input', debounce(runSearch, 350));
        }

        searchModalEl?.addEventListener('shown.bs.modal', () => searchInput?.focus());
        ui.licenseExpiry?.addEventListener('change', updateExpiryHint);
        $('addDocumentButton')?.addEventListener('click', addDocumentRow);

        ['driverCode', 'licenseNumber', 'panNumber', 'badgeNumber', 'assignedVehicle'].forEach(id => {
            const el = ui[id];
            if (!el) return;
            const up = () => { el.value = el.value.toUpperCase(); };
            el.addEventListener('input', up);
            el.addEventListener('paste', () => setTimeout(up, 0));
        });

        form.addEventListener('input', (e) => e.target.classList?.remove('is-invalid'));
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

        const mode = saveButton?.dataset.mode === 'update' ? 'update' : 'insert';
        setSaving(true);

        try {
            const payload = buildPayload(companyId);
            let saved;

            if (mode === 'update') {
                const id = currentDriverId || driverIdInput?.value;
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
        const body = { ...payload, created_by: getCurrentUserId(), created_at: new Date().toISOString(), is_deleted: false };
        if (!body.driver_code) body.driver_code = await nextDriverCode(companyId);

        let attempt = 0, lastError = null;

        while (attempt <= CODE_MAX_RETRY) {
            const { data, error } = await sb.from(TABLE).insert(body).select().single();
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
        const body = { ...payload, updated_by: getCurrentUserId(), updated_at: new Date().toISOString() };

        // Immutable / server-owned cleanups
        ['company_id', 'driver_code', 'created_by', 'created_at', 'is_deleted', 'deleted_by', 'deleted_at'].forEach(k => delete body[k]);

        let q = sb.from(TABLE).update(body).eq('id', id).eq('company_id', companyId);
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

        const { error } = await sb.from(TABLE).update(body).eq('id', id).eq('company_id', companyId);
        if (error) throw error;
    }

    /* =========================================================
     * PAYLOAD / VALIDATION
     * ======================================================= */
    function buildPayload(cid) {
        const payload = { company_id: cid };
        const linkedEmployeeId = readEmployeeId();
        const isEmployee = !!linkedEmployeeId;

        payload.employee_id = isEmployee ? linkedEmployeeId : null;

        let dtype = driverTypeSelect?.value?.trim() || '';
        payload.driver_type = isEmployee ? 'Employee' : (dtype || 'Contract');

        Object.entries(FIELD_MAP).forEach(([domId, column]) => {
            if (isEmployee && EMPLOYEE_OWNED.has(column)) return;

            const el = ui[domId];
            let value = el?.value?.trim() || '';

            if (UPPERCASE_COLUMNS.has(column)) value = value.toUpperCase();
            if (NULLABLE.has(column) && value === '') value = null;

            payload[column] = value;
        });

        payload.status = payload.status || 'Active';
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

        const pane = el.closest('.tab-pane');
        if (pane && !pane.classList.contains('active') && window.bootstrap) {
            const trigger = document.querySelector(`[data-bs-target="#${pane.id}"]`);
            trigger && bootstrap.Tab.getOrCreateInstance(trigger).show();
        }
        el.focus?.();
    }

    /* =========================================================
     * EMPLOYEE LINK
     * ======================================================= */
    function readEmployeeId() {
        const raw = employeeIdInput?.value.trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function writeEmployeeId(id) {
        if (employeeIdInput) employeeIdInput.value = id == null ? '' : String(id);
    }

    function applyEmployeeLock(isEmployee) {
        lockedFields = [];

        EMPLOYEE_OWNED_DOM_IDS.forEach(domId => {
            const el = ui[domId];
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
        employeeLinkBanner?.classList.toggle('d-none', !isEmployee);
    }

    /* =========================================================
     * DRIVER CODE GENERATION
     * ======================================================= */
    async function nextDriverCode(cid) {
        let q = sb.from(TABLE).select('driver_code').eq('company_id', cid).like('driver_code', `${CODE_PREFIX}%`).limit(5000);
        if (SOFT_DELETE) q = q.eq('is_deleted', false);

        const { data, error } = await q;
        if (error) return `${CODE_PREFIX}${Date.now().toString().slice(-6)}`;

        let max = 0;
        (data || []).forEach(row => {
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
        return error?.code === '23505' && String(error.message || '').toLowerCase().includes('driver_code');
    }

    function friendlyError(error) {
        if (!error) return 'Something went wrong. Please try again.';
        if (typeof error === 'string') return error;

        const low = `${error.message || ''} ${error.details || ''}`.toLowerCase();

        if (error.code === '23505' || low.includes('duplicate key')) {
            if (low.includes('driver_code')) return 'Driver code collision. Saving again will generate a new code.';
            if (low.includes('license_number')) return 'License number already registered for another driver.';
            if (low.includes('aadhar')) return 'Aadhaar number already linked to another driver.';
            if (low.includes('pan')) return 'PAN already linked to another driver.';
            return 'A record with these details already exists.';
        }
        if (error.code === '23503') return 'Invalid company or employee reference.';
        if (error.code === '23502') return 'A required field is missing. Please review the form.';
        if (error.code === '42501' || low.includes('permission denied')) return 'You do not have permission to perform this action.';
        if (low.includes('failed to fetch') || low.includes('networkerror')) return 'Network problem — please check your connection.';
        return error.message || 'Unable to process request.';
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
            saveButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving…';
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
            const el = ui[domId];
            if (!el) return;
            let value = record[column];
            if (column === 'license_expiry_date' && value) value = String(value).slice(0, 10);
            el.value = value == null ? '' : value;
        });

        if (driverTypeSelect && record.driver_type) driverTypeSelect.value = record.driver_type;
        writeEmployeeId(record.employee_id || null);

        form.classList.remove('was-validated');
        updateExpiryHint();
    }

    function applySavedRecord(record) {
        if (!record) return;
        currentDriverId = record.id;
        if (driverIdInput) driverIdInput.value = record.id;
        if (companyIdInput) companyIdInput.value = record.company_id || companyId;
        if (ui.driverCode) ui.driverCode.value = record.driver_code || '';

        populateForm(record);
        applyEmployeeLock(!!record.employee_id);
    }

    function resetForm() {
        form.reset();
        form.classList.remove('was-validated');
        form.querySelectorAll('.is-invalid, .is-valid').forEach(el => el.classList.remove('is-invalid', 'is-valid'));

        currentDriverId = null;
        [driverIdInput, tempFormIdInput, ui.driverCode].forEach(el => { if (el) el.value = ''; });
        if (ui.statusSelect) ui.statusSelect.value = 'Active';
        if (driverTypeSelect) driverTypeSelect.value = 'Contract';
        writeEmployeeId(null);

        pendingDocs = [];
        renderDocuments();
        updateExpiryHint();
        applyEmployeeLock(false);

        const firstTab = document.querySelector('#driverMasterTabs .nav-link');
        firstTab && window.bootstrap?.Tab.getOrCreateInstance(firstTab).show();
    }

    /* =========================================================
     * ACTION BAR HANDLERS
     * ======================================================= */
    function onNew() {
        if (saving) return;
        resetForm();
        setMode('insert');
        updateActionButtons();
        ui.driverName?.focus();
    }

    function onModify() {
        if (saving) return;
        if (!currentDriverId) return openSearchModal();
        setMode('update');
        ui.driverName?.focus();
    }

    async function onDelete() {
        if (saving || !currentDriverId) return;

        sb = sb || resolveClient();
        if (!sb) return showError('Database connection is not ready.');

        const code = ui.driverCode?.value || '';
        const name = ui.driverName?.value || '';
        const label = `${code} ${name}`.trim() || 'this driver';

        if (!window.confirm(SOFT_DELETE ? `Move ${label} to trash?\n\nRecord can be restored by an administrator.` : `Delete ${label}?\n\nThis action cannot be undone.`)) return;

        setSaving(true);
        try {
            if (SOFT_DELETE) {
                await softDeleteDriver(currentDriverId);
            } else {
                const { error } = await sb.from(TABLE).delete().eq('id', currentDriverId).eq('company_id', companyId);
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
        if (currentDriverId) window.print();
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
        return String(term || '').trim().replace(/[,()*%\\"']/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
    }

    async function runSearch() {
        const tbody = $('searchDriverTableBody');
        const input = $('searchSavedDriverInput');
        if (!tbody) return;

        sb = sb || resolveClient();
        companyId = resolveCompanyId();

        if (!sb || !companyId) {
            tbody.innerHTML = '';
            tbody.appendChild(emptyRow(5, !sb ? 'Database connection not ready.' : 'Company not identified.'));
            return;
        }

        const seq = ++searchSeq;
        const term = sanitizeTerm(input?.value);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Searching…</td></tr>';

        let query = sb.from(TABLE).select('id,driver_code,driver_name,phone_number,license_number,status,driver_type,employee_id').eq('company_id', companyId).order('driver_code', { ascending: true }).limit(SEARCH_LIMIT);
        if (SOFT_DELETE) query = query.eq('is_deleted', false);
        if (term) query = query.or(`driver_code.ilike.%${term}%,driver_name.ilike.%${term}%,phone_number.ilike.%${term}%,license_number.ilike.%${term}%`);

        const { data, error } = await query;
        if (seq !== searchSeq) return;

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
        rows.forEach(row => {
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
                nameTd.appendChild(chip);
            }
            tr.appendChild(nameTd);

            tr.appendChild(cell(row.phone_number || '—'));
            tr.appendChild(cell(row.license_number || '—'));

            const statusTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = `badge ${statusBadgeClass(row.status)}`;
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

        let q = sb.from(TABLE).select('*').eq('id', id).eq('company_id', companyId);
        if (SOFT_DELETE) q = q.eq('is_deleted', false);

        const { data, error } = await q.maybeSingle();
        if (error) return showError(friendlyError(error));
        if (!data) return showError('Driver record not found.');

        applySavedRecord(data);
        setMode('update');
        updateActionButtons();

        bootstrap.Modal.getInstance(searchModalEl)?.hide();
        showSuccess(`Loaded driver ${data.driver_code}.`);
    }

    /* =========================================================
     * LICENSE EXPIRY HINT
     * ======================================================= */
    function updateExpiryHint() {
        const input = ui.licenseExpiry;
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
     * DOCUMENTS TAB
     * ======================================================= */
    function addDocumentRow() {
        const typeEl = $('documentTypeInput');
        const numberEl = $('documentNumber');
        const validEl = $('validUpTo');
        const fileEl = $('documentFile');

        const type = typeEl?.value.trim();
        if (!type) return showError('Please enter a document type.');

        const file = fileEl?.files?.[0] || null;

        pendingDocs.push({
            uid: window.crypto?.randomUUID?.() || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            document_type: type,
            document_number: numberEl?.value.trim() || '',
            valid_up_to: validEl?.value || '',
            file_name: file?.name || '',
            file: file
        });

        [typeEl, numberEl, validEl, fileEl].forEach(el => { if (el) el.value = ''; });
        renderDocuments();
    }

    function removeDocumentRow(uid) {
        pendingDocs = pendingDocs.filter((d) => d.uid !== uid);
        renderDocuments();
    }

    function renderDocuments() {
        const tbody = $('documentTableBody');
        const badge = $('docCountBadge');
        if (badge) badge.textContent = pendingDocs.length;
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!pendingDocs.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="vm-empty"><i class="bi bi-file-earmark-text"></i>No documents attached. Use the form above to add one.</td></tr>';
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
        if (!el || !window.bootstrap) return console.warn('[DriverMaster]', message);

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
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    /* =========================================================
     * PUBLIC API
     * ======================================================= */
    window.DriverMaster = {
        load: selectDriver,
        reset: () => { resetForm(); setMode('insert'); updateActionButtons(); },
        insert: async (partial) => {
            sb = sb || resolveClient();
            companyId = resolveCompanyId();
            if (!sb) throw new Error('Database connection is not ready.');
            if (!companyId) throw new Error('Company not identified.');
            return insertDriver({ ...partial, company_id: companyId });
        },
        update: async (id, partial) => {
            sb = sb || resolveClient();
            companyId = resolveCompanyId();
            if (!sb) throw new Error('Database connection is not ready.');
            return updateDriver(id, { ...partial, company_id: companyId });
        },
        remove: async (id) => {
            sb = sb || resolveClient();
            companyId = resolveCompanyId();
            if (!sb) throw new Error('Database connection is not ready.');
            return softDeleteDriver(id);
        },
        getLinkedEmployeeId: readEmployeeId,
        isPayrollEmployee: () => !!readEmployeeId(),
        linkEmployee: (employeeId, prefill) => {
            const id = Number(employeeId);
            if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid employee id.');
            writeEmployeeId(id);
            if (prefill) populateForm({ ...prefill, employee_id: id });
            applyEmployeeLock(true);
        },
        unlinkEmployee: () => {
            writeEmployeeId(null);
            applyEmployeeLock(false);
            if (driverTypeSelect) driverTypeSelect.value = 'Contract';
        },
        getCurrentDriverId: () => currentDriverId,
        getPendingDocuments: () => pendingDocs.slice(),
        clearPendingDocuments: () => { pendingDocs = []; renderDocuments(); },
        refreshContext: () => {
            companyId = resolveCompanyId();
            if (companyIdInput) companyIdInput.value = companyId;
            return companyId;
        }
    };

    const driverNameInput = document.getElementById('driverName'); // or ui.driverName if using the optimized cache

    if (driverNameInput) {
        driverNameInput.addEventListener('input', function () {
            // 1. Save current cursor position
            const start = this.selectionStart;
            const end = this.selectionEnd;

            // 2. Capitalize the first letter of every word
            // Using /(^\w|\s\w)/g matches the first character of the string, and any character following a space.
            this.value = this.value.replace(/(^\w|\s\w)/g, match => match.toUpperCase());

            // 3. Restore cursor position so it doesn't jump to the end
            this.setSelectionRange(start, end);
        });
    }

})();

