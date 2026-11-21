// State Management
const state = {
    companyId: localStorage.getItem('CompanyID'),
    activeTab: 'month', // 'month' | 'year'
    tabs: {
        month: {
            tableId: 'bookingTable',
            tbodyId: 'tableBody',
            tfootId: 'tableFoot',
            grandIds: {
                sales: 'grandTotalSales',
                purchase: 'grandTotalPurchase',
                margin: 'grandTotalMargin',
                marginPer: 'grandTotalMarginPer'
            },
            chartCanvasId: 'monthLineChart',
            chartInstance: null,
            groupedData: [],
            grandTotals: { sales: 0, purchase: 0, margin: 0, marginPer: 0 },
            sortColumn: 'Label',
            sortOrder: 'asc'
        },
        year: {
            tableId: 'yearTable',
            tbodyId: 'yearTableBody',
            tfootId: 'yearTableFoot',
            grandIds: {
                sales: 'yearGrandTotalSales',
                purchase: 'yearGrandTotalPurchase',
                margin: 'yearGrandTotalMargin',
                marginPer: 'yearGrandTotalMarginPer'
            },
            chartCanvasId: 'yearLineChart',
            chartInstance: null,
            groupedData: [],
            grandTotals: { sales: 0, purchase: 0, margin: 0, marginPer: 0 },
            sortColumn: 'Label',
            sortOrder: 'asc'
        }
    }
};

function getCurrentFinancialYear() {
    const now = new Date();
    const year = now.getFullYear();
    const startYear = now.getMonth() >= 3 ? year : year - 1; // Apr (3) to Mar (2)
    return `${startYear}-${startYear + 1}`;
}

function getFinancialYearFromDate(date) {
    const year = date.getFullYear();
    const startYear = date.getMonth() >= 3 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Set default Financial Year to current FY
    const fyInput = document.getElementById('financialYear');
    if (fyInput && !fyInput.value) {
        fyInput.value = getCurrentFinancialYear();
    }

    // Bind filter form submit
    const searchForm = document.getElementById('searchFilters');
    if (searchForm) {
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const filterSection = document.getElementById('filterSection');
            if (filterSection && filterSection.classList.contains('show')) {
                bootstrap.Collapse.getOrCreateInstance(filterSection).hide();
            }

            await handleSearch();
        });
    }

    // Track active tab switch
    document.querySelectorAll('#reportTabs button[data-bs-toggle="tab"]').forEach((tabBtn) => {
        tabBtn.addEventListener('shown.bs.tab', (e) => {
            state.activeTab = e.target.dataset.tabType;
            syncExpandAllButton();
        });
    });

    document.getElementById('exportExcelBtn')?.addEventListener('click', exportToExcel);
    document.getElementById('exportPdfBtn')?.addEventListener('click', exportToPdf);
    document.getElementById('toggleExpandAllBtn')?.addEventListener('click', toggleExpandAll);

    enableSortableHeaders();

    // Initial Data Load using default FY filter
    await Promise.all([
        loadReportSuggestions(),
        loadAllReports(getFilters())
    ]);
});

// --- Filters & UI State ---

async function handleSearch() {
    setSearchButtonLoading(true);
    try {
        await loadAllReports(getFilters());
    } finally {
        setSearchButtonLoading(false);
    }
}

function setSearchButtonLoading(isLoading) {
    const btn = document.getElementById('searchBtn');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
        ? `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Processing...`
        : `<i class="bi bi-search" aria-hidden="true"></i> Search`;
}

function getFilters() {
    const getVal = (id) => document.getElementById(id)?.value.trim() || '';
    return {
        customerName: getVal('customerName'),
        bookedMonth: getVal('bookedMonth'),
        financialYear: getVal('financialYear')
    };
}

function applyFilters(query, filters, includeDateFilters = true) {
    if (filters.customerName) {
        query = query.ilike('CustomerName', `%${filters.customerName}%`);
    }

    if (!includeDateFilters) return query;

    // Specific Month Filter (YYYY-MM)
    if (filters.bookedMonth) {
        const [year, month] = filters.bookedMonth.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month)) {
            const start = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            query = query.gte('InvoiceDate', start).lte('InvoiceDate', end);
        }
    }

    // Financial Year Filter (YYYY-YYYY, Apr 1 to Mar 31)
    // if (filters.financialYear) {
    //     const [startYear, endYear] = filters.financialYear.split('-').map(Number);
    //     if (!isNaN(startYear) && !isNaN(endYear)) {
    //         query = query
    //             .gte('InvoiceDate', `${startYear}-04-01`)
    //             .lte('InvoiceDate', `${endYear}-03-31`);
    //     }
    // }

    if (filters.financialYear) {
        const [startYear, endYear] = filters.financialYear.split('-').map(Number);
        if (!isNaN(startYear) && !isNaN(endYear)) {
            query = query.or(
                `and(InvoiceDate.gte.${startYear}-04-01,InvoiceDate.lte.${endYear}-03-31),InvoiceDate.is.null`
            );
        }
    }

    return query;
}

// --- Datalist Suggestions ---

async function loadReportSuggestions() {
    const { data, error } = await supabaseClient
        .from('FullLoadMovementDetailsView')
        .select('CustomerName, InvoiceDate')
        .eq('company_id', state.companyId)
        .or('ShipmentStatus.is.null,ShipmentStatus.not.ilike.cancel%')
        .order('InvoiceDate', { ascending: false })
        .limit(1000);

    if (error) return console.error('Error fetching suggestions:', error);

    const customers = new Set();
    const financialYears = new Set();

    data.forEach((item) => {
        if (item.CustomerName) customers.add(item.CustomerName);
        if (item.InvoiceDate) {
            const d = new Date(item.InvoiceDate);
            if (!isNaN(d)) financialYears.add(getFinancialYearFromDate(d));
        }
    });

    populateDatalist([...customers].sort(), 'customerNameList');
    populateDatalist([...financialYears].sort().reverse(), 'financialYearList');
}

function populateDatalist(valuesArray, datalistId) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    const fragment = document.createDocumentFragment();
    valuesArray.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        fragment.appendChild(option);
    });
    datalist.replaceChildren(fragment);
}

// --- Data Fetching & Grouping ---

async function fetchAllFilteredData(filters = {}, includeDateFilters = true) {
    let allData = [];
    let from = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
        let query = supabaseClient
            .from('FullLoadMovementDetailsView')
            .select('InvoiceDate, CustomerName, GrandTotalSale, GrandTotalBuy')
            .eq('company_id', state.companyId)
            .or('ShipmentStatus.is.null,ShipmentStatus.not.ilike.cancel%');

        query = applyFilters(query, filters, includeDateFilters);
        query = query.order('InvoiceDate', { ascending: true });

        const { data, error } = await query.range(from, from + batchSize - 1);

        if (error) {
            console.error('Error fetching report data:', error);
            break;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += batchSize;
            if (data.length < batchSize) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    return allData;
}

function buildPivotData(records, mode = 'month') {
    const groupMap = new Map();
    let grandSales = 0;
    let grandPurchase = 0;

    records.forEach((row) => {
        let sortKey = '9999-99';
        let label = 'UnBilled';

        if (row.InvoiceDate) {
            const date = new Date(row.InvoiceDate);
            if (!isNaN(date)) {
                if (mode === 'month') {
                    sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    label = `${date.toLocaleString('en-US', { month: 'short' })}-${date.getFullYear()}`;
                } else {
                    const fy = getFinancialYearFromDate(date);
                    sortKey = fy;
                    label = fy;
                }
            }
        }

        const customer = row.CustomerName || 'Unknown Customer';
        const sales = Number(row.GrandTotalSale) || 0;
        const purchase = Number(row.GrandTotalBuy) || 0;

        grandSales += sales;
        grandPurchase += purchase;

        if (!groupMap.has(sortKey)) {
            groupMap.set(sortKey, {
                sortKey,
                label,
                sales: 0,
                purchase: 0,
                customersMap: new Map()
            });
        }

        const group = groupMap.get(sortKey);
        group.sales += sales;
        group.purchase += purchase;

        if (!group.customersMap.has(customer)) {
            group.customersMap.set(customer, { name: customer, sales: 0, purchase: 0 });
        }
        const cGroup = group.customersMap.get(customer);
        cGroup.sales += sales;
        cGroup.purchase += purchase;
    });

    const grouped = Array.from(groupMap.values()).map((g) => {
        const margin = g.sales - g.purchase;
        const marginPer = g.sales > 0 ? (margin / g.sales) * 100 : 0;

        const customers = Array.from(g.customersMap.values())
            .map((c) => {
                const cMargin = c.sales - c.purchase;
                const cMarginPer = c.sales > 0 ? (cMargin / c.sales) * 100 : 0;
                return { ...c, margin: cMargin, marginPer: cMarginPer };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            sortKey: g.sortKey,
            label: g.label,
            sales: g.sales,
            purchase: g.purchase,
            margin,
            marginPer,
            customers
        };
    });

    const grandMargin = grandSales - grandPurchase;
    const grandMarginPer = grandSales > 0 ? (grandMargin / grandSales) * 100 : 0;

    return {
        grouped,
        grandTotals: {
            sales: grandSales,
            purchase: grandPurchase,
            margin: grandMargin,
            marginPer: grandMarginPer
        }
    };
}

// --- Load & Render Both Tabs ---

async function loadAllReports(filters = {}) {
    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = 'block';

    // Month-wise uses all filters; Year-wise spans all FYs (still respects Customer filter)
    const [monthRecords, yearRecords] = await Promise.all([
        fetchAllFilteredData(filters, true),
        fetchAllFilteredData(filters, false)
    ]);

    const monthPivot = buildPivotData(monthRecords, 'month');
    state.tabs.month.groupedData = monthPivot.grouped;
    state.tabs.month.grandTotals = monthPivot.grandTotals;

    const yearPivot = buildPivotData(yearRecords, 'year');
    state.tabs.year.groupedData = yearPivot.grouped;
    state.tabs.year.grandTotals = yearPivot.grandTotals;

    spinner.style.display = 'none';

    sortAndRender('month');
    sortAndRender('year');
}

function sortAndRender(tabKey) {
    const tabState = state.tabs[tabKey];

    const sorted = [...tabState.groupedData].sort((a, b) => {
        let valA, valB;
        switch (tabState.sortColumn) {
            case 'TotalSales': valA = a.sales; valB = b.sales; break;
            case 'TotalPurchase': valA = a.purchase; valB = b.purchase; break;
            case 'TotalMargin': valA = a.margin; valB = b.margin; break;
            case 'MarginPer': valA = a.marginPer; valB = b.marginPer; break;
            case 'Label':
            default:
                return tabState.sortOrder === 'asc'
                    ? a.sortKey.localeCompare(b.sortKey)
                    : b.sortKey.localeCompare(a.sortKey);
        }
        return tabState.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    renderPivotTable(tabKey, sorted);
    renderLineChart(tabKey, sorted);
    updateHeaderSortIndicators(tabKey);
}

function renderPivotTable(tabKey, groupedRows) {
    const tabState = state.tabs[tabKey];
    const tbody = document.getElementById(tabState.tbodyId);
    const tfoot = document.getElementById(tabState.tfootId);

    if (!groupedRows || groupedRows.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">
                    <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i>
                    No records found
                </td>
            </tr>`;
        tfoot.style.display = 'none';
        return;
    }

    let html = '';

    groupedRows.forEach((g, idx) => {
        const groupId = `${tabKey}-group-${idx}`;
        const gSales = Math.round(g.sales);
        const gPurchase = Math.round(g.purchase);
        const gMargin = Math.round(g.margin);
        const gMarginPer = `${g.marginPer.toFixed(2)}%`;

        const labelClass = g.label === 'UnBilled' ? 'text-danger' : '';

        html += `
            <tr class="group-row" data-group="${groupId}" data-expanded="false">
                <td>
                    <button type="button" class="group-toggle-btn" aria-label="Toggle ${g.label}">
                        <i class="bi bi-plus"></i>
                    </button>
                    <span class="${labelClass}">${g.label}</span>
                </td>
                <td class="group-val" data-val="${gSales}">${gSales}</td>
                <td class="group-val" data-val="${gPurchase}">${gPurchase}</td>
                <td class="group-val" data-val="${gMargin}">${gMargin}</td>
                <td class="group-val" data-val="${gMarginPer}">${gMarginPer}</td>
            </tr>`;

        g.customers.forEach((c) => {
            html += `
                <tr class="customer-row d-none" data-parent="${groupId}">
                    <td>${c.name}</td>
                    <td>${Math.round(c.sales)}</td>
                    <td>${Math.round(c.purchase)}</td>
                    <td>${Math.round(c.margin)}</td>
                    <td>${c.marginPer.toFixed(2)}%</td>
                </tr>`;
        });
    });

    tbody.innerHTML = html;

    // Update Grand Total Footer
    document.getElementById(tabState.grandIds.sales).textContent = Math.round(tabState.grandTotals.sales);
    document.getElementById(tabState.grandIds.purchase).textContent = Math.round(tabState.grandTotals.purchase);
    document.getElementById(tabState.grandIds.margin).textContent = Math.round(tabState.grandTotals.margin);
    document.getElementById(tabState.grandIds.marginPer).textContent = `${tabState.grandTotals.marginPer.toFixed(2)}%`;
    tfoot.style.display = '';

    // Bind row click events
    tbody.querySelectorAll('tr.group-row').forEach((row) => {
        row.addEventListener('click', () => {
            const isExpanded = row.dataset.expanded === 'true';
            setGroupRowState(tbody, row, !isExpanded);
            syncExpandAllButton();
        });
    });

    syncExpandAllButton();
}

function setGroupRowState(tbody, groupRow, expand) {
    const groupId = groupRow.dataset.group;
    const icon = groupRow.querySelector('.group-toggle-btn i');
    const childRows = tbody.querySelectorAll(`tr.customer-row[data-parent="${groupId}"]`);

    groupRow.dataset.expanded = String(expand);
    icon.className = expand ? 'bi bi-dash' : 'bi bi-plus';

    // Hide parent summary values when expanded (matches Excel pivot style)
    groupRow.querySelectorAll('.group-val').forEach((cell) => {
        cell.textContent = expand ? '' : cell.dataset.val;
    });

    childRows.forEach((row) => row.classList.toggle('d-none', !expand));
}

function toggleExpandAll() {
    const tbody = document.getElementById(state.tabs[state.activeTab].tbodyId);
    const groupRows = Array.from(tbody.querySelectorAll('tr.group-row'));
    if (groupRows.length === 0) return;

    const shouldExpand = groupRows.some((r) => r.dataset.expanded !== 'true');
    groupRows.forEach((r) => setGroupRowState(tbody, r, shouldExpand));
    syncExpandAllButton();
}

function syncExpandAllButton() {
    const btn = document.getElementById('toggleExpandAllBtn');
    if (!btn) return;
    const tbody = document.getElementById(state.tabs[state.activeTab].tbodyId);
    const groupRows = Array.from(tbody.querySelectorAll('tr.group-row'));
    const allExpanded = groupRows.length > 0 && groupRows.every((r) => r.dataset.expanded === 'true');

    btn.innerHTML = allExpanded
        ? '<i class="bi bi-arrows-collapse" aria-hidden="true"></i> Collapse All'
        : '<i class="bi bi-arrows-expand" aria-hidden="true"></i> Expand All';
}

// --- Line Charts (Chart.js) ---

function renderLineChart(tabKey, groupedRows) {
    const tabState = state.tabs[tabKey];
    const canvas = document.getElementById(tabState.chartCanvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    if (tabState.chartInstance) {
        tabState.chartInstance.destroy();
    }

    // Always plot chronologically on the X-axis
    const chartData = [...groupedRows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    tabState.chartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: chartData.map((d) => d.label),
            datasets: [
                {
                    label: 'Total Sales',
                    data: chartData.map((d) => Math.round(d.sales)),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Total Purchase',
                    data: chartData.map((d) => Math.round(d.purchase)),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Total Margin',
                    data: chartData.map((d) => Math.round(d.margin)),
                    borderColor: '#6f8d38',
                    backgroundColor: 'rgba(111, 141, 56, 0.12)',
                    borderWidth: 2.5,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                title: {
                    display: true,
                    text: tabKey === 'month' ? 'Month-wise Performance Trend' : 'Year-wise Performance Trend',
                    font: { size: 14, weight: '600' },
                    color: '#0f172a'
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// --- Sorting ---

function enableSortableHeaders() {
    document.querySelectorAll('.pivot-table thead th[data-key]').forEach((th) => {
        th.addEventListener('click', () => {
            const tabKey = th.closest('table').dataset.tab;
            const tabState = state.tabs[tabKey];
            const key = th.getAttribute('data-key');

            if (tabState.sortColumn === key) {
                tabState.sortOrder = tabState.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                tabState.sortColumn = key;
                tabState.sortOrder = 'asc';
            }
            sortAndRender(tabKey);
        });
    });
}

function updateHeaderSortIndicators(tabKey) {
    const tabState = state.tabs[tabKey];
    document.querySelectorAll(`#${tabState.tableId} thead th[data-key]`).forEach((th) => {
        const key = th.dataset.key;
        const title = th.dataset.title || th.textContent.trim();
        th.dataset.title = title;

        if (key === tabState.sortColumn) {
            th.innerHTML = `${title} <i class="bi bi-arrow-${tabState.sortOrder === 'asc' ? 'up' : 'down'} ms-1"></i>`;
        } else {
            th.textContent = title;
        }
    });
}

// --- Export Functionality (Exports Active Tab) ---

function exportToExcel() {
    const tabKey = state.activeTab;
    const tabState = state.tabs[tabKey];

    if (!tabState.groupedData.length) {
        alert('No data available to export.');
        return;
    }

    const colHeader = tabKey === 'month' ? 'Month / Customer' : 'Financial Year / Customer';
    const excelRows = [];

    tabState.groupedData.forEach((g) => {
        excelRows.push({
            [colHeader]: g.label,
            'Total Sales': Math.round(g.sales),
            'Total Purchase': Math.round(g.purchase),
            'Total Margin': Math.round(g.margin),
            'Margin %': `${g.marginPer.toFixed(2)}%`
        });

        g.customers.forEach((c) => {
            excelRows.push({
                [colHeader]: `    ${c.name}`,
                'Total Sales': Math.round(c.sales),
                'Total Purchase': Math.round(c.purchase),
                'Total Margin': Math.round(c.margin),
                'Margin %': `${c.marginPer.toFixed(2)}%`
            });
        });
    });

    excelRows.push({
        [colHeader]: 'Grand Total',
        'Total Sales': Math.round(tabState.grandTotals.sales),
        'Total Purchase': Math.round(tabState.grandTotals.purchase),
        'Total Margin': Math.round(tabState.grandTotals.margin),
        'Margin %': `${tabState.grandTotals.marginPer.toFixed(2)}%`
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, tabKey === 'month' ? 'Month-wise FTL' : 'Year-wise FTL');
    XLSX.writeFile(workbook, `FTL_Performance_${tabKey}_wise.xlsx`);
}

function exportToPdf() {
    const tabKey = state.activeTab;
    const tabState = state.tabs[tabKey];

    if (!tabState.groupedData.length) {
        alert('No data available to export.');
        return;
    }

    const doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const title = tabKey === 'month'
        ? 'FTL Performance Report (Month-wise)'
        : 'FTL Performance Report (Year-wise)';

    const firstCol = tabKey === 'month' ? 'Month' : 'Financial Year';
    const headers = [[firstCol, 'Total Sales', 'Total Purchase', 'Total Margin', 'Margin %']];
    const body = [];

    // Summary rows only (no customer-wise breakdown)
    tabState.groupedData.forEach((g) => {
        body.push({
            rowType: 'group',
            cells: [
                g.label,
                Math.round(g.sales),
                Math.round(g.purchase),
                Math.round(g.margin),
                `${g.marginPer.toFixed(2)}%`
            ]
        });
    });

    body.push({
        rowType: 'total',
        cells: [
            'Grand Total',
            Math.round(tabState.grandTotals.sales),
            Math.round(tabState.grandTotals.purchase),
            Math.round(tabState.grandTotals.margin),
            `${tabState.grandTotals.marginPer.toFixed(2)}%`
        ]
    });

    doc.autoTable({
        head: headers,
        body: body.map((r) => r.cells),
        startY: 20,
        margin: { top: 20, left: 10, right: 10 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [111, 141, 56], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' }
        },
        didParseCell: function (data) {
            if (data.section === 'body') {
                const rowMeta = body[data.row.index];
                if (rowMeta.rowType === 'total') {
                    data.cell.styles.fillColor = [241, 245, 249];
                    data.cell.styles.fontStyle = 'bold';
                }
                if (data.column.index === 0 && data.cell.raw === 'UnBilled') {
                    data.cell.styles.textColor = [220, 38, 38]; // Red
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        },
        didDrawPage: function (data) {
            doc.setFontSize(12);
            doc.text(title, data.settings.margin.left, 12);
        }
    });

    // Add chart at the bottom (after the table)
    const canvas = document.getElementById(tabState.chartCanvasId);
    if (canvas && tabState.chartInstance) {
        const chartImg = canvas.toDataURL('image/png', 1.0);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const imgWidth = pageWidth - 20; // 10mm left/right margins
        const aspectRatio = canvas.height / canvas.width;
        const imgHeight = Math.min(imgWidth * aspectRatio, 90);

        let chartY = (doc.lastAutoTable?.finalY || 20) + 10;

        // Move chart to a new page if it overflows the bottom margin
        if (chartY + imgHeight > pageHeight - 10) {
            doc.addPage();
            doc.setFontSize(12);
            doc.text(title, 10, 12);
            chartY = 20;
        }

        doc.addImage(chartImg, 'PNG', 10, chartY, imgWidth, imgHeight);
    }

    doc.save(`FTL_Performance_${tabKey}_wise.pdf`);
}