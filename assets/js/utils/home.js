/* =========================================================
   DASHBOARD — Home Page Controller (Optimized)
========================================================= */

(function () {
    'use strict';

    /* =========================================================
       CONFIGURATION
    ========================================================= */
    const TABLES = {
        CUSTOMER_INVOICES: 'InvoiceDetails',
        VENDOR_BILLING: 'VendorBillingDetails',
        PARTY: 'PartyDetails',
        PAYMENT_VIEW: 'InvoicePaymentView',      // Customer Outstanding SQL View
        VENDOR_PAYMENT_VIEW: 'VendorBillPaymentView', // Vendor Outstanding SQL View
        INTERNATIONAL_BOOKING: 'InternationalBookingView',
        DOMESTIC_BOOKING: 'DomesticBookingView',
        CUSTOMS_CLEARANCE: 'CustomsClearanceView',
        FULL_LOAD_MOVEMENT: 'FullLoadMovementDetailsView'
    };

    const COLUMNS = {
        INVOICE_DATE: 'InvoiceDate',
        INVOICE_AMOUNT: 'GrandTotalAmount',
        INVOICE_NO: 'InvoiceNo',
        PARTY_CODE: 'PartyCode',
        PARTY_NAME: 'PartyName',
        COMPANY: 'company_id'
    };

    /* =========================================================
       CONSTANTS & STATE
    ========================================================= */
    const COLORS = {
        customer: { line: '#2563eb', fill: 'rgba(37, 99, 235, 0.08)' },
        vendor: { line: '#ea580c', fill: 'rgba(234, 88, 12, 0.08)' },
        margin: { line: '#059669', fill: 'rgba(5, 150, 105, 0.08)' }
    };

    const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const QUARTERS = ['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)'];

    // Cached DOM Elements (populated in init)
    const DOM = {};

    let chart = null;
    let activeTab = 'customer';
    let currentView = 'Monthly';
    let currentFY = '';

    // State Guards
    let isRefreshing = false; // Spam-click guard for full refresh
    let isHoverFetching = false; // Prevents overlapping hover fetches
    let lastPendingHoverTime = 0; // Cooldown timer for hover

    const dashboardData = {
        labels: MONTHS.slice(),
        customer: new Array(12).fill(0),
        vendor: new Array(12).fill(0),
        margin: new Array(12).fill(0)
    };

    /* =========================================================
       FAST HELPERS (Optimized for Large Data Arrays)
    ========================================================= */
    function formatCurrency(v) {
        return '₹' + (Number(v) || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });
    }

    function formatCompactINR(v) {
        const n = Number(v) || 0;
        const absN = Math.abs(n);
        if (absN >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
        if (absN >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
        if (absN >= 1000) return '₹' + (n / 1000).toFixed(1) + ' K';
        return '₹' + n.toFixed(0);
    }

    function getFYStringFromDate(dateStr) {
        if (!dateStr) return null;
        if (typeof dateStr === 'string' && dateStr.length >= 10) {
            const year = parseInt(dateStr.substring(0, 4), 10);
            const month = parseInt(dateStr.substring(5, 7), 10);
            if (!isNaN(year) && !isNaN(month)) {
                return month < 4 ? `${year - 1}-${String(year).slice(-2)}` : `${year}-${String(year + 1).slice(-2)}`;
            }
        }
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const year = d.getFullYear();
        return d.getMonth() < 3 ? `${year - 1}-${String(year).slice(-2)}` : `${year}-${String(year + 1).slice(-2)}`;
    }

    function getFYMonthIndex(dateStr) {
        if (!dateStr) return -1;
        if (typeof dateStr === 'string' && dateStr.length >= 10) {
            const month = parseInt(dateStr.substring(5, 7), 10);
            if (!isNaN(month)) return (month + 8) % 12; // Fast Indian FY calc (Apr=0, Mar=11)
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? -1 : (d.getMonth() + 9) % 12;
    }

    function getFYRange(fyLabel) {
        const startYear = parseInt((fyLabel || '').split('-')[0], 10) || new Date().getFullYear();
        return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
    }

    function bucketize(rows, view) {
        if (view === 'Yearly') {
            return [rows.reduce((acc, r) => acc + r.amount, 0)];
        }

        const isQuarterly = view === 'Quarterly';
        const buckets = new Array(isQuarterly ? 4 : 12).fill(0);

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const monthIdx = getFYMonthIndex(r.date);
            if (monthIdx >= 0) {
                const targetIdx = isQuarterly ? Math.floor(monthIdx / 3) : monthIdx;
                buckets[targetIdx] += r.amount;
            }
        }
        return buckets;
    }

    /* =========================================================
       DYNAMIC FY DROPDOWN
    ========================================================= */
    async function populateFYDropdown() {
        if (!DOM.fyFilter) return;
        DOM.fyFilter.innerHTML = '<option>Loading...</option>';

        const actualCurrentFY = getFYStringFromDate(new Date().toISOString());
        let sortedFYs = [actualCurrentFY];

        try {
            const { data, error } = await supabaseClient
                .from(TABLES.CUSTOMER_INVOICES)
                .select(COLUMNS.INVOICE_DATE)
                .eq(COLUMNS.COMPANY, CompanyID);

            if (!error && data && data.length > 0) {
                const uniqueFYs = new Set([actualCurrentFY]);
                for (let i = 0; i < data.length; i++) {
                    const fy = getFYStringFromDate(data[i][COLUMNS.INVOICE_DATE]);
                    if (fy) uniqueFYs.add(fy);
                }
                sortedFYs = Array.from(uniqueFYs).sort((a, b) => b.localeCompare(a));
            }
        } catch (err) {
            console.error('Failed to populate FY dropdown:', err);
        }

        DOM.fyFilter.innerHTML = sortedFYs.map(fy =>
            `<option value="${fy}" ${fy === actualCurrentFY ? 'selected' : ''}>FY ${fy}</option>`
        ).join('');

        currentFY = DOM.fyFilter.value;
    }

    /* =========================================================
       CHART LOGIC
    ========================================================= */
    function getVisibleDatasets() {
        const all = [
            { key: 'customer', label: 'Customer Billing', data: dashboardData.customer, color: COLORS.customer },
            { key: 'vendor', label: 'Vendor Total Costing', data: dashboardData.vendor, color: COLORS.vendor },
            { key: 'margin', label: 'Total Margin', data: dashboardData.margin, color: COLORS.margin }
        ];

        if (activeTab === 'customer') return all.filter(d => d.key === 'customer' || d.key === 'vendor');
        if (activeTab === 'vendor') return all.filter(d => d.key === 'vendor');
        return all.filter(d => d.key === 'margin');
    }

    function buildChartDatasets() {
        return getVisibleDatasets().map(ds => ({
            label: ds.label,
            data: ds.data,
            borderColor: ds.color.line,
            backgroundColor: ds.color.fill,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: ds.color.line,
            pointBorderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: ds.color.line,
            pointHoverBorderColor: '#ffffff',
            pointHoverBorderWidth: 2
        }));
    }

    function initChart() {
        if (!DOM.chartCtx || typeof Chart === 'undefined') return;

        chart = new Chart(DOM.chartCtx, {
            type: 'line',
            data: { labels: dashboardData.labels, datasets: buildChartDatasets() },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'bottom', align: 'center',
                        labels: { font: { family: 'Inter', size: 12, weight: '500' }, color: '#0f172a', usePointStyle: true, padding: 20 }
                    },
                    tooltip: { backgroundColor: '#0f172a', titleFont: { family: 'Inter', size: 12, weight: '600' }, padding: 12, cornerRadius: 8, callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + formatCurrency(c.parsed.y) } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11, weight: '500' }, color: '#64748b' } },
                    y: { beginAtZero: true, border: { display: false }, ticks: { font: { family: 'Inter', size: 11, weight: '500' }, color: '#64748b', callback: formatCompactINR } }
                }
            }
        });
    }

    function refreshChart() {
        if (!chart) return;
        chart.data.labels = dashboardData.labels;
        chart.data.datasets = buildChartDatasets();
        chart.update('active');
    }

    /* =========================================================
       DATA FETCHING & UI STATE
    ========================================================= */
    function setKPI(id, text, deltaId, deltaValue) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
        if (deltaId) {
            const dEl = document.getElementById(deltaId);
            if (dEl) {
                dEl.textContent = (deltaValue >= 0 ? '+' : '') + deltaValue.toFixed(1) + '%';
                const parent = dEl.closest('.kpi-delta');
                if (parent) parent.className = `kpi-delta ${deltaValue >= 0 ? 'up' : 'down'} mt-1`;
            }
        }
    }

    async function fetchData(table, dateColumn, amtColumn, fyRange) {
        const { data, error } = await supabaseClient
            .from(table)
            .select(`${dateColumn}, ${amtColumn}`)
            .eq(COLUMNS.COMPANY, CompanyID)
            .gte(dateColumn, fyRange.start)
            .lte(dateColumn, fyRange.end);

        if (error) return [];
        return (data || []).map(r => ({ date: r[dateColumn], amount: Number(r[amtColumn]) || 0 }));
    }

    // Customer Outstanding
    async function fetchCustomerOutstanding() {
        const { data, error } = await supabaseClient
            .from(TABLES.PAYMENT_VIEW)
            .select('BalanceAmount')
            .eq(COLUMNS.COMPANY, CompanyID)
            .gt('BalanceAmount', 0);

        if (error) {
            console.error('Failed to fetch customer outstanding:', error);
            return 0;
        }
        return data.reduce((sum, row) => sum + (Number(row.BalanceAmount) || 0), 0);
    }

    // Vendor Outstanding
    async function fetchVendorOutstanding() {
        const { data, error } = await supabaseClient
            .from(TABLES.VENDOR_PAYMENT_VIEW)
            .select('BalanceAmount')
            .eq(COLUMNS.COMPANY, CompanyID)
            .gt('BalanceAmount', 0);

        if (error) {
            console.error('Failed to fetch vendor outstanding:', error);
            return 0;
        }
        return data.reduce((sum, row) => sum + (Number(row.BalanceAmount) || 0), 0);
    }

    // Total Pending Invoices & Individual Breakdown
    async function fetchTotalPendingInvoices(isHover = false) {
        // Anti-spam: If it's a hover event, enforce a 30-second cooldown
        if (isHover) {
            if (isHoverFetching) return;
            if (Date.now() - lastPendingHoverTime < 30000) return; // 30 sec cooldown

            isHoverFetching = true;

            // Show temporary loading dots on the hover breakdown while fetching
            const loadingText = '...';
            if (DOM.intPending) DOM.intPending.textContent = loadingText;
            if (DOM.domPending) DOM.domPending.textContent = loadingText;
            if (DOM.customsPending) DOM.customsPending.textContent = loadingText;
            if (DOM.fullLoadPending) DOM.fullLoadPending.textContent = loadingText;
        }

        const checks = [
            { key: 'international', table: TABLES.INTERNATIONAL_BOOKING, domEl: DOM.intPending },
            { key: 'domestic', table: TABLES.DOMESTIC_BOOKING, domEl: DOM.domPending },
            { key: 'customs', table: TABLES.CUSTOMS_CLEARANCE, domEl: DOM.customsPending },
            { key: 'fullLoad', table: TABLES.FULL_LOAD_MOVEMENT, domEl: DOM.fullLoadPending }
        ];

        try {
            const promises = checks.map(item =>
                supabaseClient
                    .from(item.table)
                    .select('*', { count: 'exact', head: true })
                    .eq(COLUMNS.COMPANY, CompanyID)
                    .eq('InvoiceStatus', 'Pending')
            );

            const results = await Promise.all(promises);
            let totalPending = 0;

            results.forEach((res, index) => {
                const count = res.error ? 0 : (res.count || 0);
                totalPending += count;

                // Update individual UI sub-metric in the hover list
                const targetDom = checks[index].domEl;
                if (targetDom) {
                    targetDom.textContent = count.toLocaleString('en-IN');
                }

                if (res.error) {
                    console.error(`Failed to fetch pending count from ${checks[index].table}:`, res.error);
                }
            });

            // If triggered by hover, also update the main UI number in case it changed
            if (isHover) {
                if (DOM.pendingKpi) DOM.pendingKpi.textContent = totalPending.toLocaleString('en-IN');
                if (DOM.pendingSub) DOM.pendingSub.textContent = totalPending > 0 ? 'Awaiting action' : 'All clear';
            }

            return totalPending;
        } catch (err) {
            console.error('Error fetching total pending invoices:', err);
            return 0;
        } finally {
            if (isHover) {
                lastPendingHoverTime = Date.now();
                isHoverFetching = false;
            }
        }
    }

    async function loadDashboardData() {
        if (isRefreshing) return;
        isRefreshing = true;
        setLoadingState(true);

        try {
            const fyRange = getFYRange(currentFY);
            const prevFYYear = parseInt(currentFY.split('-')[0], 10) - 1;
            const prevFYRange = getFYRange(`${prevFYYear}-${String(prevFYYear + 1).slice(-2)}`);

            const [
                custRows,
                vendRows,
                prevCustRows,
                prevVendRows,
                totalPendingInvoices,
                customerOutstandingTotal,
                vendorOutstandingTotal
            ] = await Promise.all([
                fetchData(TABLES.CUSTOMER_INVOICES, COLUMNS.INVOICE_DATE, COLUMNS.INVOICE_AMOUNT, fyRange),
                fetchData(TABLES.VENDOR_BILLING, 'AccountedDate', 'BilledAmount', fyRange),
                fetchData(TABLES.CUSTOMER_INVOICES, COLUMNS.INVOICE_DATE, COLUMNS.INVOICE_AMOUNT, prevFYRange),
                fetchData(TABLES.VENDOR_BILLING, 'AccountedDate', 'BilledAmount', prevFYRange),
                fetchTotalPendingInvoices(),
                fetchCustomerOutstanding(),
                fetchVendorOutstanding()
            ]);

            dashboardData.customer = bucketize(custRows, currentView);
            dashboardData.vendor = bucketize(vendRows, currentView);
            dashboardData.margin = dashboardData.customer.map((c, i) => c - dashboardData.vendor[i]);
            dashboardData.labels = currentView === 'Yearly' ? [currentFY] : currentView === 'Quarterly' ? QUARTERS : MONTHS;

            const custTotal = dashboardData.customer.reduce((a, b) => a + b, 0);
            const vendTotal = dashboardData.vendor.reduce((a, b) => a + b, 0);
            const marginTotal = custTotal - vendTotal;

            const prevCustTotal = prevCustRows.reduce((acc, r) => acc + r.amount, 0);
            const prevVendTotal = prevVendRows.reduce((acc, r) => acc + r.amount, 0);

            const calcDelta = (curr, prev) => prev ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

            setKPI('kpiCustomerBilling', formatCurrency(custTotal), 'kpiCustomerBillingDelta', calcDelta(custTotal, prevCustTotal));
            setKPI('kpiVendorCosting', formatCurrency(vendTotal), 'kpiVendorCostingDelta', calcDelta(vendTotal, prevVendTotal));
            setKPI('kpiTotalMargin', formatCurrency(marginTotal), 'kpiTotalMarginDelta', calcDelta(marginTotal, prevCustTotal - prevVendTotal));

            if (DOM.customerOutstanding) DOM.customerOutstanding.textContent = formatCurrency(customerOutstandingTotal);
            if (DOM.vendorOutstanding) DOM.vendorOutstanding.textContent = formatCurrency(vendorOutstandingTotal);

            if (DOM.pendingKpi) DOM.pendingKpi.textContent = totalPendingInvoices.toLocaleString('en-IN');
            if (DOM.pendingSub) DOM.pendingSub.textContent = totalPendingInvoices > 0 ? 'Awaiting action' : 'All clear';

            refreshChart();
            await loadRecentInvoices();

        } catch (err) {
            console.error('Dashboard load failed:', err);
            ['kpiCustomerBilling', 'kpiVendorCosting', 'kpiTotalMargin', 'kpiPendingInvoices', 'kpiCustomerOutstanding', 'kpiVendorOutstanding'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '—';
            });
        } finally {
            setLoadingState(false);
            isRefreshing = false;
        }
    }

    async function loadRecentInvoices() {
        if (!DOM.recentList) return;
        DOM.recentList.innerHTML = `<div class="text-center text-muted py-4 small"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</div>`;

        try {
            const { data: invoices, error } = await supabaseClient
                .from(TABLES.CUSTOMER_INVOICES)
                .select(`${COLUMNS.INVOICE_NO}, ${COLUMNS.PARTY_CODE}, ${COLUMNS.INVOICE_AMOUNT}, ${COLUMNS.INVOICE_DATE}`)
                .eq(COLUMNS.COMPANY, CompanyID)
                .order(COLUMNS.INVOICE_DATE, { ascending: false })
                .limit(5);

            if (error || !invoices?.length) {
                DOM.recentList.innerHTML = `<div class="text-center text-muted py-4 small"><i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i>No recent invoices</div>`;
                return;
            }

            const partyCodes = [...new Set(invoices.map(i => i[COLUMNS.PARTY_CODE]).filter(Boolean))];
            const nameMap = {};
            if (partyCodes.length) {
                const { data: parties } = await supabaseClient.from(TABLES.PARTY).select(`${COLUMNS.PARTY_CODE}, ${COLUMNS.PARTY_NAME}`).eq(COLUMNS.COMPANY, CompanyID).in(COLUMNS.PARTY_CODE, partyCodes);
                (parties || []).forEach(p => nameMap[p[COLUMNS.PARTY_CODE]] = p[COLUMNS.PARTY_NAME]);
            }

            const colors = ['blue', 'green', 'orange', 'purple'];
            DOM.recentList.innerHTML = invoices.map((inv, idx) => {
                const name = nameMap[inv[COLUMNS.PARTY_CODE]] || inv[COLUMNS.PARTY_CODE] || 'Unknown';
                const color = colors[idx % 4];
                const dateDt = new Date(inv[COLUMNS.INVOICE_DATE]);
                const dateStr = isNaN(dateDt) ? '' : `${String(dateDt.getDate()).padStart(2, '0')} ${dateDt.toLocaleString('en-US', { month: 'short' })} ${dateDt.getFullYear()}`;

                return `<div class="activity-item">
                            <div class="activity-avatar bg-${color}-soft text-${color}">${name.substring(0, 2).toUpperCase()}</div>
                            <div class="activity-meta">
                                <p class="activity-title text-truncate" style="max-width:200px;">${name.replace(/</g, '&lt;')}</p>
                                <p class="activity-sub">${(inv[COLUMNS.INVOICE_NO] || '').replace(/</g, '&lt;')} · ${dateStr}</p>
                            </div>
                            <div class="activity-amount fw-semibold">${formatCurrency(inv[COLUMNS.INVOICE_AMOUNT])}</div>
                        </div>`;
            }).join('');
        } catch (err) {
            DOM.recentList.innerHTML = `<div class="text-center text-danger py-4 small"><i class="bi bi-exclamation-triangle me-1"></i> Failed to load</div>`;
        }
    }

    function setLoadingState(isLoading) {
        ['kpiCustomerBilling', 'kpiVendorCosting', 'kpiTotalMargin', 'kpiPendingInvoices', 'kpiCustomerOutstanding', 'kpiVendorOutstanding'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (isLoading) {
                el.dataset.prevText = el.textContent;
                el.innerHTML = '<span class="spinner-border spinner-border-sm opacity-50"></span>';
            } else if (el.dataset.prevText) {
                delete el.dataset.prevText;
            }
        });
    }

    /* =========================================================
       INITIALIZATION & EVENT BINDINGS
    ========================================================= */
    async function init() {
        DOM.fyFilter = document.getElementById('fyFilter');
        DOM.viewFilter = document.getElementById('viewFilter');
        DOM.refreshBtn = document.getElementById('refreshBtn');
        DOM.recentList = document.getElementById('recentInvoicesList');
        DOM.chartCtx = document.getElementById('financeChart');

        // Cache DOM elements for Pending Invoices KPI & Breakdown List
        DOM.pendingKpi = document.getElementById('kpiPendingInvoices');
        DOM.pendingSub = document.getElementById('kpiPendingInvoicesSub');
        DOM.intPending = document.getElementById('kpiIntPending');
        DOM.domPending = document.getElementById('kpiDomPending');
        DOM.customsPending = document.getElementById('kpiCustomsPending');
        DOM.fullLoadPending = document.getElementById('kpiFullLoadPending');

        DOM.customerOutstanding = document.getElementById('kpiCustomerOutstanding');
        DOM.vendorOutstanding = document.getElementById('kpiVendorOutstanding');
        DOM.exportBtn = document.getElementById('exportBtn');

        await populateFYDropdown();

        currentFY = DOM.fyFilter?.value || currentFY;
        currentView = DOM.viewFilter?.value || currentView;

        initChart();

        ['customer', 'vendor', 'margin'].forEach(key => {
            document.getElementById(`tab-${key}`)?.addEventListener('shown.bs.tab', () => {
                activeTab = key;
                refreshChart();
            });
        });

        DOM.fyFilter?.addEventListener('change', async (e) => { currentFY = e.target.value; await loadDashboardData(); });
        DOM.viewFilter?.addEventListener('change', async (e) => { currentView = e.target.value; await loadDashboardData(); });

        DOM.refreshBtn?.addEventListener('click', async () => {
            const icon = DOM.refreshBtn.querySelector('i');
            icon?.classList.add('spin');
            await loadDashboardData();
            setTimeout(() => icon?.classList.remove('spin'), 600);
        });

        DOM.exportBtn?.addEventListener('click', () => {
            alert(typeof window.jspdf === 'undefined' ? 'PDF library not loaded.' : 'Export feature coming soon.');
        });

        // Add Live Hover Refresh to Pending Invoices Card
        const pendingCardEl = DOM.pendingKpi?.closest('.kpi-card');
        if (pendingCardEl) {
            pendingCardEl.addEventListener('mouseenter', () => {
                fetchTotalPendingInvoices(true); // 'true' flags it as a hover refresh
            });
        }

        await loadDashboardData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();