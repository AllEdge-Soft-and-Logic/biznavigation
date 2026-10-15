let currentPage = 1;
const pageSize = 50;
const CompanyID = localStorage.getItem('CompanyID');
let sortColumn = null;
let sortOrder = 'asc';
let partyNameCache = {};

document.addEventListener('DOMContentLoaded', async () => {
    flatpickr("#dateRange", { mode: "range", dateFormat: "Y-m-d" });

    // Inject freeze styling for columns 1 & 2 dynamically
    injectFreezeStyles();

    document.getElementById("searchBtn").addEventListener("click", async () => {
        const filters = getFilters();

        const hasAnyFilter =
            filters.customerName ||
            filters.invoiceNo ||
            filters.invoiceType ||
            filters.paymentStatus.length > 0 ||
            filters.startDate ||
            filters.endDate ||
            filters.invoiceMonth ||
            filters.invoiceYear ||
            filters.financialYear;

        if (!hasAnyFilter) {
            const ok = confirm("No filters selected.\n\nThis will load all company records.\n\nDo you want to continue?");
            if (!ok) return;
        }

        currentPage = 1;
        await loadTable(filters);

        const filterSection = document.getElementById("filterSection");
        bootstrap.Collapse.getOrCreateInstance(filterSection).hide();
    });

    document.getElementById('exportExcelBtn').addEventListener('click', exportToExcel);
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf);

    await loadReportSuggestions();
    await loadTable(getFilters());
    enableSortableHeaders();
});

// Inject CSS rule for freezing Sr No and Invoice No
function injectFreezeStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        #bookingTable th:nth-child(1), #bookingTable td:nth-child(1) {
            position: sticky;
            left: 0;
            z-index: 5;
            background-color: inherit;
        }
        #bookingTable th:nth-child(2), #bookingTable td:nth-child(2) {
            position: sticky;
            left: 50px; /* Adjust depending on Sr No column width */
            z-index: 5;
            background-color: inherit;
        }
        /* Ensure header and footer stay above frozen cells */
        #bookingTable thead th:nth-child(1), #bookingTable thead th:nth-child(2) {
            z-index: 15;
            background-color: #f1f5f9 !important;
        }
        #bookingTable tbody tr th:nth-child(1), #bookingTable tbody tr th:nth-child(2),
        #bookingTable tbody tr td:nth-child(1), #bookingTable tbody tr td:nth-child(2) {
            background-color: #ffffff;
        }
        #bookingTable tbody tr:hover td:nth-child(1), #bookingTable tbody tr:hover td:nth-child(2) {
            background-color: #f8fafc;
        }
        #bookingTable tfoot th:nth-child(1), #bookingTable tfoot th:nth-child(2) {
            z-index: 12;
            background-color: #f1f5f9 !important;
        }
    `;
    document.head.appendChild(style);
}

function getFilters() {
    const filters = {
        customerName: document.getElementById("customerName")?.value.trim(),
        invoiceNo: document.getElementById("invoiceNo")?.value.trim(),
        invoiceType: document.getElementById("invoiceType")?.value.trim(),
        invoiceMonth: document.getElementById("invoiceMonth")?.value,
        invoiceYear: document.getElementById("invoiceYear")?.value.trim(),
        financialYear: document.getElementById("financialYear")?.value.trim(),
        paymentStatus: getSelectedPaymentStatus()
    };

    const dateRange = document.getElementById("dateRange")?.value.trim();
    if (dateRange) {
        const [startDate, endDate] = dateRange.split(" to ");
        filters.startDate = startDate || "";
        filters.endDate = endDate || startDate || "";
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

let reportSuggestionData = [];

async function loadReportSuggestions() {
    const { data, error } = await supabaseClient
        .from('InvoicePaymentView')
        .select('InvoiceNo, PartyCode, PartyName, InvoiceType, PaymentStatus, InvoiceDate')
        .eq('company_id', CompanyID);

    if (error) return console.error('Error fetching suggestions:', error);

    reportSuggestionData = data || [];

    populateDatalists(reportSuggestionData, 'InvoiceNo', 'invoiceNoList');
    populateDatalists(reportSuggestionData, 'PartyName', 'customerNameList');
    populateDatalists(reportSuggestionData, 'InvoiceType', 'invoiceTypeList');
    populateDatalists(reportSuggestionData, 'PaymentStatus', 'paymentStatusBtn');

    const financialYears = [...new Set(reportSuggestionData
        .map(item => item.InvoiceDate)
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
    const uniqueValues = [...new Set(
        data.map(item => item[field]).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    const datalist = document.getElementById(datalistId);
    if (!datalist) return;

    datalist.innerHTML = uniqueValues.map(value => `<option value="${value}">`).join('');
}

function attachSuggestionFilters() {
    attachDatalistFilter('invoiceNo', 'invoiceNoList', 'InvoiceNo');
    attachDatalistFilter('customerName', 'customerNameList', 'PartyName');
    attachDatalistFilter('invoiceType', 'invoiceTypeList', 'InvoiceType');
    attachDatalistFilter('paymentStatus', 'paymentStatusBtn', 'PaymentStatus');
}

function attachDatalistFilter(inputId, datalistId, field) {
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

        datalist.innerHTML = matchedValues.slice(0, 50).map(value => `<option value="${value}">`).join('');
    });
}

function populateArrayDatalist(array, datalistId) {
    const datalist = document.getElementById(datalistId);
    if (datalist) datalist.innerHTML = array.map(value => `<option value="${value}">`).join('');
}

// Unified Query Builder Function
function applyQueryFilters(query, filters) {
    if (filters.invoiceNo) query = query.ilike('InvoiceNo', `%${filters.invoiceNo}%`);
    if (filters.customerName) query = query.ilike('PartyName', `%${filters.customerName}%`);
    if (filters.invoiceType) query = query.ilike('InvoiceType', `%${filters.invoiceType}%`);
    if (filters.paymentStatus && filters.paymentStatus.length > 0) {
        query = query.in("PaymentStatus", filters.paymentStatus);
    }

    const hasExplicitDateFilter = !!filters.startDate || !!filters.endDate || !!filters.invoiceMonth || !!filters.invoiceYear || !!filters.financialYear;
    const onlyCustomerNameSelected = !!filters.customerName && !filters.invoiceNo && !filters.invoiceType && (!filters.paymentStatus || filters.paymentStatus.length === 0) && !hasExplicitDateFilter;

    if (onlyCustomerNameSelected) {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth() + 1;
        const fyStartYear = currentMonth >= 4 ? currentYear : currentYear - 1;
        const fyEndYear = fyStartYear + 1;
        return query.gte('InvoiceDate', `${fyStartYear}-04-01`).lte('InvoiceDate', `${fyEndYear}-03-31`);
    }

    if (filters.financialYear) {
        const [startYear, endYear] = filters.financialYear.split('-').map(Number);
        if (!isNaN(startYear) && !isNaN(endYear)) {
            return query.gte('InvoiceDate', `${startYear}-04-01`).lte('InvoiceDate', `${endYear}-03-31`);
        }
    }

    if (filters.invoiceYear) {
        const year = parseInt(filters.invoiceYear, 10);
        if (!isNaN(year)) {
            return query.gte('InvoiceDate', `${year}-01-01`).lte('InvoiceDate', `${year}-12-31`);
        }
    }

    if (filters.invoiceMonth) {
        const [yearStr, monthStr] = filters.invoiceMonth.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        if (!isNaN(year) && !isNaN(month)) {
            const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const end = new Date(year, month, 0).toISOString().split('T')[0];
            return query.gte('InvoiceDate', start).lte('InvoiceDate', end);
        }
    }

    if (filters.startDate || filters.endDate) {
        if (filters.startDate) query = query.gte('InvoiceDate', filters.startDate);
        if (filters.endDate) query = query.lte('InvoiceDate', filters.endDate);
        return query;
    }

    return query;
}

function buildQuery(filters = {}) {
    let query = supabaseClient
        .from('InvoicePaymentView')
        .select('*', { count: 'exact' })
        .eq('company_id', CompanyID)
        .order('InvoiceNo', { ascending: false });

    return applyQueryFilters(query, filters);
}

async function loadTable(filters = {}) {
    const spinner = document.getElementById('loadingSpinner');
    const tbody = document.querySelector('#bookingTable tbody');

    spinner.style.display = 'block';
    tbody.innerHTML = `
        <tr>
            <td colspan="19" class="text-center text-primary fw-bold py-4">
                <span class="spinner-border spinner-border-sm me-2"></span>
                Processing data, please wait...
            </td>
        </tr>
    `;

    try {
        let pageQuery = buildQuery(filters);
        if (sortColumn) {
            pageQuery = pageQuery.order(sortColumn, { ascending: sortOrder === 'asc' });
        }

        const from = (currentPage - 1) * pageSize;
        const to = currentPage * pageSize - 1;

        const { data: pageData, error: pageError, count } = await pageQuery.range(from, to);

        if (pageError) {
            console.error('Error loading table:', pageError);
            tbody.innerHTML = `<tr><td colspan="19" class="text-center text-danger py-4">Failed to load data</td></tr>`;
            return;
        }

        let totalQuery = buildQuery(filters);
        if (sortColumn) {
            totalQuery = totalQuery.order(sortColumn, { ascending: sortOrder === 'asc' });
        }

        const { data: cumulativeData, error: totalError } = await totalQuery.range(0, currentPage * pageSize - 1);
        if (totalError) console.error('Error loading cumulative totals:', totalError);

        await renderTable(pageData || []);
        updateCumulativeTotals(cumulativeData || []);
        renderPagination(count || 0, loadTable);
        updateHeaderSortIndicators();

    } catch (err) {
        console.error("Unexpected loadTable error:", err);
        tbody.innerHTML = `<tr><td colspan="19" class="text-center text-danger py-4">Something went wrong while loading data</td></tr>`;
    } finally {
        spinner.style.display = 'none';
    }
}

function updateHeaderSortIndicators() {
    document.querySelectorAll('#bookingTable thead th[data-key]').forEach(th => {
        const key = th.getAttribute('data-key');
        th.textContent = th.getAttribute('data-title') || th.textContent.replace(/\s+[\u25B2\u25BC]/, '');
        if (key === sortColumn) {
            th.textContent += sortOrder === 'asc' ? ' ▲' : ' ▼';
        }
    });
}

async function renderTable(data) {
    const tbody = document.querySelector('#bookingTable tbody');
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="19" class="text-center text-muted">No records found</td></tr>`;
        return;
    }

    for (let idx = 0; idx < data.length; idx++) {
        const row = data[idx];
        const tr = document.createElement("tr");

        let partyName = '';
        if (row.PartyCode) {
            if (partyNameCache[row.PartyCode]) {
                partyName = partyNameCache[row.PartyCode];
            } else {
                const details = await getPartyDetailsByCode(row.PartyCode);
                if (details?.PartyName) {
                    partyName = details.PartyName;
                    partyNameCache[row.PartyCode] = partyName;
                }
            }
        }

        tr.innerHTML = `
            <td>${(currentPage - 1) * pageSize + idx + 1}</td>
            <td>
                <a href="../Accounting/CustomerInvoice.html?invoiceNo=${encodeURIComponent(row.InvoiceNo)}"
                class="text-decoration-none fw-bold">
                    ${row.InvoiceNo}
                </a>
            </td>
            <td>${formatDate(row.InvoiceDate) || ''}</td>
            <td>${row.InvoiceType || ''}</td>
            <td>${partyName || ''}</td>
            <td class="text-end">${formatAmount(row.BasicAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.OtherAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.CGSTAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.SGSTAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.IGSTAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.TotalGSTAmount || '0')}</td>
            <td class="text-end fw-bold text-success">${formatAmount(row.GrandTotalAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.PaymentAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.OtherDeductionAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.TDSDeductionAmount || '0')}</td>
            <td class="text-end fw-bold text-info">${formatAmount(row.CreditDebitNoteAmount || '0')}</td>
            <td class="text-end">${formatAmount(row.PaymentTotalAmount || '0')}</td>
            <td class="text-end fw-bold text-danger">${formatAmount(row.BalanceAmount || '0')}</td>
            <td>${row.PaymentStatus || ''}</td>
        `;

        tbody.appendChild(tr);
    }
}

function renderPagination(totalCount, loadTableFn) {
    const totalPages = Math.ceil(totalCount / pageSize);
    const pagination = document.getElementById('paginationControls');
    pagination.innerHTML = '';

    const maxVisiblePages = 5;
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">Previous</a>`;

    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            loadTableFn(getFilters());
        }
    });
    pagination.appendChild(prevLi);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    startPage = Math.max(1, endPage - maxVisiblePages + 1);

    if (startPage > 1) {
        addPageButton(1);
        if (startPage > 2) addDots();
    }

    for (let i = startPage; i <= endPage; i++) {
        addPageButton(i);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) addDots();
        addPageButton(totalPages);
    }

    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">Next</a>`;

    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            loadTableFn(getFilters());
        }
    });
    pagination.appendChild(nextLi);

    function addPageButton(page) {
        const li = document.createElement('li');
        li.className = `page-item ${page === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#">${page}</a>`;
        li.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = page;
            loadTableFn(getFilters());
        });
        pagination.appendChild(li);
    }

    function addDots() {
        const li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = `<span class="page-link">...</span>`;
        pagination.appendChild(li);
    }
}

async function exportToExcel() {
    const buttonElement = document.querySelector('.btn');
    if (typeof startButtonLoading === 'function') startButtonLoading(buttonElement);

    try {
        const filters = getFilters();
        const allData = await fetchAllFilteredData(filters);

        if (allData.length === 0) {
            alert('No data to export.');
            return;
        }

        let tableHtml = `<table><thead><tr>
        <th>Sr No</th><th>Invoice No</th><th>Invoice Date</th><th>Invoice Type</th><th>Customer Name</th>
        <th>Basic Amount</th><th>Other Amount</th><th>CGST Amount</th><th>SGST Amount</th><th>IGST Amount</th>
        <th>Total GST Amount</th><th>Grand Total Amount</th><th>Collected Amount</th><th>Other Deduction Amount</th>
        <th>TDS Deduction Amount</th><th>Credit Debit Note Amount</th><th>Total Payment Amount</th><th>Balance Amount</th><th>Payment Status</th></tr></thead><tbody>`;

        for (let i = 0; i < allData.length; i++) {
            const row = allData[i];
            let partyName = '';
            if (row.PartyCode) {
                if (partyNameCache[row.PartyCode]) {
                    partyName = partyNameCache[row.PartyCode];
                } else {
                    const details = await getPartyDetailsByCode(row.PartyCode);
                    partyName = details?.PartyName || '';
                    partyNameCache[row.PartyCode] = partyName;
                }
            }

            tableHtml += `<tr>
            <td>${i + 1}</td>
            <td>${row.InvoiceNo || ''}</td>
            <td>${row.InvoiceDate || ''}</td>
            <td>${row.InvoiceType || ''}</td>
            <td>${partyName}</td>
            <td>${row.BasicAmount || '0'}</td>
            <td>${row.OtherAmount || '0'}</td>
            <td>${row.CGSTAmount || '0'}</td>
            <td>${row.SGSTAmount || '0'}</td>
            <td>${row.IGSTAmount || '0'}</td>
            <td>${row.TotalGSTAmount || '0'}</td>
            <td>${row.GrandTotalAmount || '0'}</td>
            <td>${row.PaymentAmount || '0'}</td>
            <td>${row.OtherDeductionAmount || '0'}</td>
            <td>${row.TDSDeductionAmount || '0'}</td>
            <td>${row.CreditDebitNoteAmount || '0'}</td>
            <td>${row.PaymentTotalAmount || '0'}</td>
            <td>${row.BalanceAmount || '0'}</td>
            <td>${row.PaymentStatus || ''}</td>
        </tr>`;
        }

        tableHtml += `</tbody></table>`;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = tableHtml;
        const wb = XLSX.utils.table_to_book(tempDiv.querySelector('table'), { sheet: "Bookings" });
        const date = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
        XLSX.writeFile(wb, `Customer Invoice Report_${date}.xlsx`);

    } catch (error) {
        console.error("Export failed:", error);
        alert("An error occurred while exporting data.");
    } finally {
        if (typeof stopButtonLoading === 'function') stopButtonLoading(buttonElement);
    }
}

async function exportToPdf() {
    const filters = getFilters();
    const allData = await fetchAllFilteredData(filters);
    if (!allData.length) return alert('No data to export.');

    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const headers = [
        'Sr No', 'Invoice No', 'Invoice Date', 'Invoice Type', 'Customer Name', 'Basic Amount', 'Other Amount',
        'CGST Amount', 'SGST Amount', 'IGST Amount', 'Total GST Amount', 'Grand Total Amount', 'Collected Amount',
        'Other Deduction Amount', 'TDS Deduction Amount', 'Credit Debit Note Amount', 'Total Payment Amount', 'Balance Amount', 'Payment Status'
    ];

    const formatNumber = (value) => (parseFloat(value) || 0).toFixed(2);
    const formatDateStr = (dateStr) => {
        const date = new Date(dateStr);
        return isNaN(date) ? '' : date.toLocaleDateString();
    };

    const uniqueCodes = [...new Set(allData.map(r => r.PartyCode).filter(Boolean))];
    const partyNameMap = {};
    for (const code of uniqueCodes) {
        const details = await getPartyDetailsByCode(code);
        partyNameMap[code] = details?.PartyName || code;
    }

    const rows = allData.map((row, i) => [
        i + 1,
        row.InvoiceNo || '',
        formatDateStr(row.InvoiceDate),
        row.InvoiceType || '',
        partyNameMap[row.PartyCode] || row.PartyCode || '',
        formatNumber(row.BasicAmount),
        formatNumber(row.OtherAmount),
        formatNumber(row.CGSTAmount),
        formatNumber(row.SGSTAmount),
        formatNumber(row.IGSTAmount),
        formatNumber(row.TotalGSTAmount),
        formatNumber(row.GrandTotalAmount),
        formatNumber(row.PaymentAmount),
        formatNumber(row.OtherDeductionAmount),
        formatNumber(row.TDSDeductionAmount),
        formatNumber(row.CreditDebitNoteAmount),
        formatNumber(row.PaymentTotalAmount),
        formatNumber(row.BalanceAmount),
        row.PaymentStatus || ''
    ]);

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 20,
        margin: { left: 10, right: 10 },
        styles: { fontSize: 6.5, overflow: 'linebreak', cellPadding: 1.2 },
        headStyles: { fillColor: [0, 123, 255] },
        didDrawPage: function (data) {
            doc.setFontSize(10);
            doc.text("Customer Invoice Report", data.settings.margin.left, 10);
        },
        pageBreak: 'auto'
    });

    const date = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    doc.save(`Customer Invoice Report_${date}.pdf`);
}

async function fetchAllFilteredData(filters = {}) {
    let allData = [], batchSize = 1000, from = 0, to = batchSize - 1, hasMore = true;

    while (hasMore) {
        let query = supabaseClient
            .from('InvoicePaymentView')
            .select('*')
            .eq('company_id', CompanyID)
            .order('InvoiceNo', { ascending: true });

        query = applyQueryFilters(query, filters);

        const { data, error } = await query.range(from, to);
        if (error) {
            console.error('Error fetching data for export:', error);
            break;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += batchSize;
            to += batchSize;
        } else {
            hasMore = false;
        }
    }

    return allData;
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    return parseFloat(String(value).replace(/,/g, "")) || 0;
}

function formatAmount(value) {
    return toNumber(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function updateCumulativeTotals(allData) {
    const totals = {
        BasicAmount: 0, OtherAmount: 0, CGSTAmount: 0, SGSTAmount: 0,
        IGSTAmount: 0, TotalGSTAmount: 0, GrandTotalAmount: 0, PaymentAmount: 0,
        OtherDeductionAmount: 0, TDSDeductionAmount: 0, CreditDebitNoteAmount: 0,
        PaymentTotalAmount: 0, BalanceAmount: 0
    };

    const endIndex = currentPage * pageSize;
    const cumulativeRows = allData.slice(0, endIndex);

    cumulativeRows.forEach(row => {
        totals.BasicAmount += toNumber(row.BasicAmount);
        totals.OtherAmount += toNumber(row.OtherAmount);
        totals.CGSTAmount += toNumber(row.CGSTAmount);
        totals.SGSTAmount += toNumber(row.SGSTAmount);
        totals.IGSTAmount += toNumber(row.IGSTAmount);
        totals.TotalGSTAmount += toNumber(row.TotalGSTAmount);
        totals.GrandTotalAmount += toNumber(row.GrandTotalAmount);
        totals.PaymentAmount += toNumber(row.PaymentAmount);
        totals.OtherDeductionAmount += toNumber(row.OtherDeductionAmount);
        totals.TDSDeductionAmount += toNumber(row.TDSDeductionAmount);
        totals.CreditDebitNoteAmount += toNumber(row.CreditDebitNoteAmount);
        totals.PaymentTotalAmount += toNumber(row.PaymentTotalAmount);
        totals.BalanceAmount += toNumber(row.BalanceAmount);
    });

    document.getElementById("totalBasicAmount").textContent = formatAmount(totals.BasicAmount);
    document.getElementById("totalOtherAmount").textContent = formatAmount(totals.OtherAmount);
    document.getElementById("totalCGSTAmount").textContent = formatAmount(totals.CGSTAmount);
    document.getElementById("totalSGSTAmount").textContent = formatAmount(totals.SGSTAmount);
    document.getElementById("totalIGSTAmount").textContent = formatAmount(totals.IGSTAmount);
    document.getElementById("totalGSTAmount").textContent = formatAmount(totals.TotalGSTAmount);
    document.getElementById("totalGrandTotal").textContent = formatAmount(totals.GrandTotalAmount);
    document.getElementById("totalCollected").textContent = formatAmount(totals.PaymentAmount);
    document.getElementById("totalOtherDeduction").textContent = formatAmount(totals.OtherDeductionAmount);
    document.getElementById("totalTDSDeduction").textContent = formatAmount(totals.TDSDeductionAmount);
    document.getElementById("totalCreditDebitNoteAmount").textContent = formatAmount(totals.CreditDebitNoteAmount);
    document.getElementById("totalPayment").textContent = formatAmount(totals.PaymentTotalAmount);
    document.getElementById("totalBalance").textContent = formatAmount(totals.BalanceAmount);
}

const paymentStatusBtn = document.getElementById("paymentStatusBtn");
const paymentStatusCheckboxes = document.querySelectorAll(".paymentStatus");

paymentStatusCheckboxes.forEach(cb => {
    cb.addEventListener("change", updatePaymentStatus);
});

function updatePaymentStatus() {
    const selected = [...paymentStatusCheckboxes]
        .filter(cb => cb.checked)
        .map(cb => cb.nextElementSibling.textContent.trim());

    paymentStatusBtn.textContent = selected.length ? selected.join(", ") : "All Status";
}

function getSelectedPaymentStatus() {
    return [...paymentStatusCheckboxes].filter(cb => cb.checked).map(cb => cb.value);
}