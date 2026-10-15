// --- Global Variables & Caching ---
let currentPage = 1;
const pageSize = 50;
const CompanyID = localStorage.getItem('CompanyID');
let sortColumn = null;
let sortOrder = 'asc';
const partyNameCache = {};
let reportSuggestionData = [];

// DOM Element Cache
const els = {
    searchBtn: document.getElementById("searchBtn"),
    exportExcelBtn: document.getElementById('exportExcelBtn'),
    exportPdfBtn: document.getElementById('exportPdfBtn'),
    filterSection: document.getElementById("filterSection"),
    spinner: document.getElementById('loadingSpinner'),
    tbody: document.querySelector('#bookingTable tbody'),
    pagination: document.getElementById('paginationControls'),
    paymentStatusBtn: document.getElementById("paymentStatusBtn"),
    paymentStatusCheckboxes: document.querySelectorAll(".paymentStatus")
};

// High-performance currency formatter
const currencyFormatter = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

document.addEventListener('DOMContentLoaded', async () => {
    flatpickr("#dateRange", { mode: "range", dateFormat: "Y-m-d" });

    els.searchBtn.addEventListener("click", async () => {
        currentPage = 1;
        await loadTable(getFilters());
        bootstrap.Collapse.getOrCreateInstance(els.filterSection).hide();
    });

    els.exportExcelBtn.addEventListener('click', exportToExcel);
    els.exportPdfBtn.addEventListener('click', exportToPdf);

    els.paymentStatusCheckboxes.forEach(cb => {
        cb.addEventListener("change", updatePaymentStatus);
    });

    await loadReportSuggestions();
    await loadTable(getFilters());
    enableSortableHeaders();
});

function getFilters() {
    const getValue = (id) => document.getElementById(id)?.value.trim() || "";
    const filters = {
        billReferenceNo: getValue("billReferenceNo"),
        vendorName: getValue("vendorName"),
        expenseType: getValue("expenseType"),
        expenseFor: getValue("expenseFor"),
        billNo: getValue("billNo"),
        billingMonth: getValue("billingMonth"),
        billingYear: getValue("billingYear"),
        financialYear: getValue("financialYear"),
        paymentStatus: getSelectedPaymentStatus()
    };

    const dateRange = getValue("dateRange");
    if (dateRange) {
        const [startDate, endDate] = dateRange.split(" to ");
        filters.startDate = startDate || "";
        filters.endDate = endDate || startDate || "";
    } else {
        filters.startDate = "";
        filters.endDate = "";
    }
    return filters;
}

function enableSortableHeaders() {
    document.querySelectorAll('#bookingTable thead th[data-key]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-key');
            if (sortColumn === key) {
                sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = key;
                sortOrder = 'asc';
            }
            loadTable(getFilters());
        });
    });
}

async function loadReportSuggestions() {
    const { data, error } = await supabaseClient
        .from('VendorBillPaymentView')
        .select('BillReferenceNo,AccountedDate,ExpenseType,ExpenseFor, PartyCode, PartyName,BillNo, PaymentStatus')
        .eq('company_id', CompanyID);

    if (error) return console.error('Error fetching suggestions:', error);

    reportSuggestionData = data || [];

    populateDatalists(reportSuggestionData, 'BillReferenceNo', 'billReferenceNoList');
    populateDatalists(reportSuggestionData, 'BillNo', 'billNoList');
    populateDatalists(reportSuggestionData, 'ExpenseType', 'expenseTypeList');
    populateDatalists(reportSuggestionData, 'ExpenseFor', 'expenseForList');
    populateDatalists(reportSuggestionData, 'PartyName', 'vendorNameList');

    const financialYears = [...new Set(reportSuggestionData
        .map(item => item.AccountedDate)
        .filter(Boolean)
        .map(date => {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
        })
    )].sort();

    populateArrayDatalist(financialYears, 'financialYearList');
    attachSuggestionFilters();
}

function populateDatalists(data, field, datalistId) {
    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    const uniqueValues = [...new Set(data.map(item => item[field]).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    datalist.innerHTML = uniqueValues.map(value => `<option value="${value}">`).join('');
}

function attachSuggestionFilters() {
    const filters = [
        ['billReferenceNo', 'billReferenceNoList', 'BillReferenceNo'],
        ['vendorName', 'vendorNameList', 'PartyName'],
        ['expenseType', 'expenseTypeList', 'ExpenseType'],
        ['expenseFor', 'expenseForList', 'ExpenseFor'],
        ['billNo', 'billNoList', 'BillNo']
    ];

    filters.forEach(([inputId, datalistId, field]) => {
        const input = document.getElementById(inputId);
        const datalist = document.getElementById(datalistId);
        if (!input || !datalist) return;

        input.addEventListener('input', function () {
            let searchText = this.value.trim().toLowerCase().replace(/%/g, '');
            const matchedValues = [...new Set(
                reportSuggestionData
                    .map(item => item[field])
                    .filter(Boolean)
                    .filter(value => value.toLowerCase().startsWith(searchText))
            )].sort((a, b) => a.localeCompare(b));

            datalist.innerHTML = matchedValues.slice(0, 50)
                .map(value => `<option value="${value}">`).join('');
        });
    });
}

function populateArrayDatalist(array, datalistId) {
    document.getElementById(datalistId).innerHTML = array.map(value => `<option value="${value}">`).join('');
}

async function loadTable(filters = {}) {
    els.spinner.style.display = 'block';
    els.tbody.innerHTML = `<tr><td colspan="22" class="text-center text-primary fw-bold py-4">
        <span class="spinner-border spinner-border-sm me-2"></span>Processing data, please wait...</td></tr>`;

    try {
        let pageQuery = buildQuery(filters);
        let totalQuery = buildQuery(filters);

        if (sortColumn) {
            const sortConfig = { ascending: sortOrder === 'asc' };
            pageQuery = pageQuery.order(sortColumn, sortConfig);
            totalQuery = totalQuery.order(sortColumn, sortConfig);
        }

        const from = (currentPage - 1) * pageSize;
        const to = currentPage * pageSize - 1;
        const cumulativeTo = currentPage * pageSize - 1;

        // Fetch paginated data and cumulative data concurrently to save time
        const [pageResult, totalResult] = await Promise.all([
            pageQuery.range(from, to),
            totalQuery.range(0, cumulativeTo)
        ]);

        if (pageResult.error) throw pageResult.error;
        if (totalResult.error) console.error('Error loading cumulative totals:', totalResult.error);

        await renderTable(pageResult.data || []);
        updateCumulativeTotals(totalResult.data || []);
        renderPagination(pageResult.count || 0, loadTable);
        updateHeaderSortIndicators();

    } catch (err) {
        console.error("Unexpected loadTable error:", err);
        els.tbody.innerHTML = `<tr><td colspan="22" class="text-center text-danger py-4">Failed to load data</td></tr>`;
    } finally {
        els.spinner.style.display = 'none';
    }
}

function buildQuery(filters = {}) {
    let query = supabaseClient
        .from('VendorBillPaymentView')
        .select('*', { count: 'exact' })
        .eq('company_id', CompanyID)
        .order('BillReferenceNo', { ascending: false });

    if (filters.billReferenceNo) query = query.ilike('BillReferenceNo', `%${filters.billReferenceNo}%`);
    if (filters.vendorName) query = query.ilike('PartyName', `%${filters.vendorName}%`);
    if (filters.billNo) query = query.ilike('BillNo', `%${filters.billNo}%`);
    if (filters.expenseType) query = query.ilike('ExpenseType', `%${filters.expenseType}%`);
    if (filters.expenseFor) query = query.ilike('ExpenseFor', `%${filters.expenseFor}%`);
    if (filters.paymentStatus.length > 0) query = query.in("PaymentStatus", filters.paymentStatus);

    const hasExplicitDateFilter = filters.startDate || filters.endDate || filters.billingMonth || filters.billingYear || filters.financialYear;
    const onlyVendorNameSelected = filters.vendorName && !filters.billReferenceNo && !filters.billNo && !filters.expenseType && !filters.expenseFor && !filters.paymentStatus.length && !hasExplicitDateFilter;

    if (onlyVendorNameSelected) {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const fyStartYear = currentMonth >= 4 ? currentYear : currentYear - 1;
        return query.gte('AccountedDate', `${fyStartYear}-04-01`).lte('AccountedDate', `${fyStartYear + 1}-03-31`);
    }

    if (filters.financialYear) {
        const [startYear, endYear] = filters.financialYear.split('-').map(Number);
        if (!isNaN(startYear)) query = query.gte('AccountedDate', `${startYear}-04-01`).lte('AccountedDate', `${endYear}-03-31`);
        return query;
    }

    if (filters.billingYear) {
        const year = parseInt(filters.billingYear, 10);
        if (!isNaN(year)) query = query.gte('AccountedDate', `${year}-01-01`).lte('AccountedDate', `${year}-12-31`);
        return query;
    }

    if (filters.billingMonth) {
        const [yearStr, monthStr] = filters.billingMonth.split('-');
        const year = parseInt(yearStr, 10), month = parseInt(monthStr, 10);
        if (!isNaN(year) && !isNaN(month)) {
            const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const end = new Date(year, month, 0).toISOString().split('T')[0];
            query = query.gte('AccountedDate', start).lte('AccountedDate', end);
        }
        return query;
    }

    if (filters.startDate) query = query.gte('AccountedDate', filters.startDate);
    if (filters.endDate) query = query.lte('AccountedDate', filters.endDate);

    return query;
}

function updateHeaderSortIndicators() {
    document.querySelectorAll('#bookingTable thead th[data-key]').forEach(th => {
        const key = th.getAttribute('data-key');
        th.textContent = th.getAttribute('data-title') || th.textContent.replace(/\s+[\u25B2\u25BC]/, '');
        if (key === sortColumn) th.textContent += sortOrder === 'asc' ? ' ▲' : ' ▼';
    });
}

// Ensure pre-fetching of Party Details executes concurrently to prevent UI waterfall
async function preloadMissingPartyNames(data) {
    const missingCodes = [...new Set(data.map(row => row.PartyCode).filter(code => code && !partyNameCache[code]))];

    if (missingCodes.length > 0) {
        const fetchPromises = missingCodes.map(code =>
            getPartyDetailsByCode(code).then(details => {
                if (details?.PartyName) partyNameCache[code] = details.PartyName;
            }).catch(e => console.error("Error fetching party details", e))
        );
        await Promise.all(fetchPromises);
    }
}

async function renderTable(data) {
    if (!data || data.length === 0) {
        els.tbody.innerHTML = `<tr><td colspan="22" class="text-center text-muted">No records found</td></tr>`;
        return;
    }

    // Preload missing names concurrently (N+1 Query Fix)
    await preloadMissingPartyNames(data);

    let htmlMarkup = "";
    data.forEach((row, idx) => {
        const partyName = row.PartyCode ? (partyNameCache[row.PartyCode] || '') : (row.PartyName || '');

        htmlMarkup += `
            <tr>
                <td>${(currentPage - 1) * pageSize + idx + 1}</td>
                <td class="fw-medium">${row.BillReferenceNo || ''}</td>
                <td>${row.AccountedDate ? new Date(row.AccountedDate).toLocaleDateString() : ''}</td>
                <td>${row.ExpenseType || ''}</td>
                <td>${row.ExpenseFor || ''}</td>
                <td>${partyName}</td>
                <td>${row.BillNo || ''}</td>
                <td>${row.BillDate || ''}</td>
                <td class="text-end">${formatAmount(row.NonTaxableAmount)}</td>
                <td class="text-end">${formatAmount(row.TaxableAmount)}</td>
                <td class="text-end">${formatAmount(row.CGSTAmount)}</td>
                <td class="text-end">${formatAmount(row.SGSTAmount)}</td>
                <td class="text-end">${formatAmount(row.IGSTAmount)}</td>
                <td class="text-end">${formatAmount(row.TotalGSTAmount)}</td>
                <td class="text-end fw-bold text-success">${formatAmount(row.ChargeTotalAmount)}</td>
                <td class="text-end">${formatAmount(row.PaymentAmount)}</td>
                <td class="text-end">${formatAmount(row.OtherDeductionAmount)}</td>
                <td class="text-end">${formatAmount(row.TDSDeductionAmount)}</td>
                <td class="text-end fw-bold text-info">${formatAmount(row.CreditDebitNoteAmount)}</td>
                <td class="text-end">${formatAmount(row.PaymentTotalAmount)}</td>
                <td class="text-end fw-bold text-danger">${formatAmount(row.BalanceAmount)}</td>
                <td>${row.PaymentStatus || ''}</td>
            </tr>`;
    });

    els.tbody.innerHTML = htmlMarkup;
}

function renderPagination(totalCount, loadTableFn) {
    const totalPages = Math.ceil(totalCount / pageSize);
    els.pagination.innerHTML = '';
    const maxVisiblePages = 5;

    // Prev Button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">Previous</a>`;
    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) { currentPage--; loadTableFn(getFilters()); }
    });
    els.pagination.appendChild(prevLi);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    startPage = Math.max(1, endPage - maxVisiblePages + 1);

    const addPageButton = (page) => {
        const li = document.createElement('li');
        li.className = `page-item ${page === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${page}</a>`;
        li.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = page;
            loadTableFn(getFilters());
        });
        els.pagination.appendChild(li);
    };

    const addDots = () => {
        const li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = `<span class="page-link">...</span>`;
        els.pagination.appendChild(li);
    };

    if (startPage > 1) { addPageButton(1); if (startPage > 2) addDots(); }
    for (let i = startPage; i <= endPage; i++) addPageButton(i);
    if (endPage < totalPages) { if (endPage < totalPages - 1) addDots(); addPageButton(totalPages); }

    // Next Button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">Next</a>`;
    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) { currentPage++; loadTableFn(getFilters()); }
    });
    els.pagination.appendChild(nextLi);
}

// Utility: Fast Number formatting
function toNumber(value) { return parseFloat(value) || 0; }
function formatAmount(value) { return currencyFormatter.format(toNumber(value)); }

function updateCumulativeTotals(allData) {
    const totals = {
        NonTaxableAmount: 0, TaxableAmount: 0, CGSTAmount: 0, SGSTAmount: 0, IGSTAmount: 0,
        TotalGSTAmount: 0, ChargeTotalAmount: 0, PaymentAmount: 0, OtherDeductionAmount: 0,
        TDSDeductionAmount: 0, CreditDebitNoteAmount: 0, PaymentTotalAmount: 0, BalanceAmount: 0
    };

    const endIndex = currentPage * pageSize;
    const cumulativeRows = allData.slice(0, endIndex);

    cumulativeRows.forEach(row => {
        totals.NonTaxableAmount += toNumber(row.NonTaxableAmount);
        totals.TaxableAmount += toNumber(row.TaxableAmount);
        totals.CGSTAmount += toNumber(row.CGSTAmount);
        totals.SGSTAmount += toNumber(row.SGSTAmount);
        totals.IGSTAmount += toNumber(row.IGSTAmount);
        totals.TotalGSTAmount += toNumber(row.TotalGSTAmount);
        totals.ChargeTotalAmount += toNumber(row.ChargeTotalAmount);
        totals.PaymentAmount += toNumber(row.PaymentAmount);
        totals.OtherDeductionAmount += toNumber(row.OtherDeductionAmount);
        totals.TDSDeductionAmount += toNumber(row.TDSDeductionAmount);
        totals.CreditDebitNoteAmount += toNumber(row.CreditDebitNoteAmount);
        totals.PaymentTotalAmount += toNumber(row.PaymentTotalAmount);
        totals.BalanceAmount += toNumber(row.BalanceAmount);
    });

    Object.keys(totals).forEach(key => {
        const el = document.getElementById(`total${key === 'ChargeTotalAmount' ? 'GrandTotal' : key === 'PaymentAmount' ? 'Collected' : key}`);
        if (el) el.textContent = formatAmount(totals[key]);
    });
}

function updatePaymentStatus() {
    const selected = [...els.paymentStatusCheckboxes]
        .filter(cb => cb.checked)
        .map(cb => cb.nextElementSibling.textContent.trim());

    els.paymentStatusBtn.textContent = selected.length ? selected.join(", ") : "All Status";
}

function getSelectedPaymentStatus() {
    return [...els.paymentStatusCheckboxes].filter(cb => cb.checked).map(cb => cb.value);
}

async function fetchAllFilteredData(filters = {}) {
    let allData = [], batchSize = 1000, from = 0, to = batchSize - 1, hasMore = true;

    while (hasMore) {
        let query = buildQuery(filters).range(from, to);
        const { data, error } = await query;

        if (error) { console.error('Error fetching data for export:', error); break; }

        if (data.length > 0) {
            allData = allData.concat(data);
            from += batchSize;
            to += batchSize;
        } else {
            hasMore = false;
        }
    }
    return allData;
}

// Exports
async function exportToExcel() {
    const filters = getFilters();
    const allData = await fetchAllFilteredData(filters);
    if (allData.length === 0) return alert('No data to export.');

    await preloadMissingPartyNames(allData); // Pre-fetch for export as well

    let tableHtml = `<table><thead><tr>
        <th>Sr No</th><th>Bill Reference No</th><th>Accounted Date</th><th>Expense Type</th><th>Expense For</th>
        <th>Vendor Name</th><th>Non-Taxable Amount</th><th>Taxable Amount</th><th>CGST Amount</th><th>SGST Amount</th>
        <th>IGST Amount</th><th>Total GST Amount</th><th>Grand Total Amount</th><th>Collected Amount</th>
        <th>Other Deduction Amount</th><th>TDS Deduction Amount</th><th>Credit Debit Note Amount</th><th>Total Payment Amount</th>
        <th>Balance Amount</th><th>Payment Status</th></tr></thead><tbody>`;

    allData.forEach((row, i) => {
        tableHtml += `<tr>
            <td>${i + 1}</td>
            <td>${row.BillReferenceNo || ''}</td>
            <td>${row.AccountedDate || ''}</td>
            <td>${row.ExpenseType || ''}</td>
            <td>${row.ExpenseFor || ''}</td>
            <td>${partyNameCache[row.PartyCode] || row.PartyName || ''}</td>
            <td>${row.NonTaxableAmount || '0'}</td>
            <td>${row.TaxableAmount || '0'}</td>
            <td>${row.CGSTAmount || '0'}</td>
            <td>${row.SGSTAmount || '0'}</td>
            <td>${row.IGSTAmount || '0'}</td>
            <td>${row.TotalGSTAmount || '0'}</td>
            <td>${row.ChargeTotalAmount || '0'}</td>
            <td>${row.PaymentAmount || '0'}</td>
            <td>${row.OtherDeductionAmount || '0'}</td>
            <td>${row.TDSDeductionAmount || '0'}</td>
            <td>${row.CreditDebitNoteAmount || '0'}</td>
            <td>${row.PaymentTotalAmount || '0'}</td>
            <td>${row.BalanceAmount || '0'}</td>
            <td>${row.PaymentStatus || ''}</td>
        </tr>`;
    });

    tableHtml += `</tbody></table>`;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = tableHtml;
    const wb = XLSX.utils.table_to_book(tempDiv.querySelector('table'), { sheet: "Vendor Billing" });
    const date = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    XLSX.writeFile(wb, `Vendor Billing Report_${date}.xlsx`);
}

async function exportToPdf() {
    const filters = getFilters();
    const allData = await fetchAllFilteredData(filters);
    if (!allData.length) return alert('No data to export.');

    await preloadMissingPartyNames(allData); // Pre-fetch for export

    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const headers = [
        'Sr No', 'Bill Ref No', 'Acc Date', 'Expense Type', 'Vendor Name', 'Basic Amt',
        'CGST Amt', 'SGST Amt', 'IGST Amt', 'Total GST', 'Grand Total', 'Paid',
        'Other Ded', 'TDS', 'C/D Note', 'Total Pay', 'Balance', 'Status'
    ];

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return isNaN(date) ? '' : date.toLocaleDateString();
    };

    const rows = allData.map((row, i) => [
        i + 1,
        row.BillReferenceNo || '',
        formatDate(row.AccountedDate),
        row.ExpenseType || '',
        partyNameCache[row.PartyCode] || row.PartyName || '',
        toNumber(row.NonTaxableAmount).toFixed(2),
        toNumber(row.CGSTAmount).toFixed(2),
        toNumber(row.SGSTAmount).toFixed(2),
        toNumber(row.IGSTAmount).toFixed(2),
        toNumber(row.TotalGSTAmount).toFixed(2),
        toNumber(row.ChargeTotalAmount).toFixed(2),
        toNumber(row.PaymentAmount).toFixed(2),
        toNumber(row.OtherDeductionAmount).toFixed(2),
        toNumber(row.TDSDeductionAmount).toFixed(2),
        toNumber(row.CreditDebitNoteAmount).toFixed(2),
        toNumber(row.PaymentTotalAmount).toFixed(2),
        toNumber(row.BalanceAmount).toFixed(2),
        row.PaymentStatus || ''
    ]);

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 20,
        margin: { left: 10, right: 10 },
        styles: { fontSize: 6.5, overflow: 'linebreak', cellPadding: 1.2 },
        headStyles: { fillColor: [37, 99, 235] }, /* Matches Bootstrap Primary Blue */
        didDrawPage: function (data) {
            doc.setFontSize(10);
            doc.text("Vendor Billing Report", data.settings.margin.left, 10);
        },
        pageBreak: 'auto'
    });

    const date = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    doc.save(`Vendor_Billing_Report_${date}.pdf`);
}