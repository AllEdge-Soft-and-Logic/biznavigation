/**
 * Suspense Account Report
 * Path: assets/js/Report/suspenseAccountReport.js
 * Depends on: Supabase v2, Flatpickr, jsPDF + AutoTable, server.js
 */

document.addEventListener("DOMContentLoaded", () => {
    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    const VIEW_NAME = "SuspenseLedger_view";
    const PAGE_SIZE = 25;

    // Adjust these two helpers if your server.js / utils.js uses different names
    // const getSupabaseClient = () => window.supabaseClient || window.supabase;
    const getCompanyId = () =>
        localStorage.getItem("CompanyID") ||
        sessionStorage.getItem("CompanyID") ||
        null;

    const state = {
        currentPage: 1,
        totalRecords: 0,
        allFilteredData: [], // Cached for exports when needed
        dateFrom: null,
        dateTo: null,
        fpInstance: null,
    };

    // =========================================================================
    // 2. DOM ELEMENTS
    // =========================================================================
    const el = {
        partyCode: document.getElementById("partyCode"),
        partyCodeList: document.getElementById("partyCodeList"),
        dateRange: document.getElementById("dateRange"),
        financialYear: document.getElementById("financialYear"),
        financialYearList: document.getElementById("financialYearList"),
        searchBtn: document.getElementById("searchBtn"),
        resetBtn: document.getElementById("resetBtn"),
        loadingSpinner: document.getElementById("loadingSpinner"),
        emptyState: document.getElementById("emptyState"),
        tableBody: document.getElementById("suspenseTableBody"),
        totalSuspenseAmount: document.getElementById("totalSuspenseAmount"),
        paginationControls: document.getElementById("paginationControls"),
        exportExcelBtn: document.getElementById("exportExcelBtn"),
        exportPdfBtn: document.getElementById("exportPdfBtn"),
    };

    // =========================================================================
    // 3. INITIALIZATION
    // =========================================================================
    initFlatpickr();
    populateFinancialYears();
    loadPartySuggestions();
    bindEvents();
    fetchSuspenseReport(1);

    function initFlatpickr() {
        if (typeof flatpickr === "undefined") return;

        state.fpInstance = flatpickr(el.dateRange, {
            mode: "range",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d-m-Y",
            allowInput: false,
            onChange: (selectedDates) => {
                if (selectedDates.length === 2) {
                    state.dateFrom = formatDateISO(selectedDates[0]);
                    state.dateTo = formatDateISO(selectedDates[1]);
                    el.financialYear.value = ""; // Clear FY when custom range is picked
                } else if (selectedDates.length === 0) {
                    state.dateFrom = null;
                    state.dateTo = null;
                }
            },
        });
    }

    function populateFinancialYears() {
        const now = new Date();
        // Indian Financial Year: April (month 3) to March
        const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < 6; i++) {
            const startYear = currentFYStart - i;
            const fyLabel = `${startYear}-${startYear + 1}`;
            const option = document.createElement("option");
            option.value = fyLabel;
            fragment.appendChild(option);
        }

        el.financialYearList.innerHTML = "";
        el.financialYearList.appendChild(fragment);
    }

    async function loadPartySuggestions() {
        const db = await supabaseClient;
        if (!db) return;

        try {
            let query = db
                .from(VIEW_NAME)
                .select("PartyCode, PartyName");

            const companyId = getCompanyId();
            if (companyId) query = query.eq("company_id", companyId);

            const { data, error } = await query;
            if (error) throw error;

            // Deduplicate parties
            const uniqueParties = new Map();
            (data || []).forEach((row) => {
                if (row.PartyCode && !uniqueParties.has(row.PartyCode)) {
                    uniqueParties.set(row.PartyCode, row.PartyName || "");
                }
            });

            const fragment = document.createDocumentFragment();
            uniqueParties.forEach((name, code) => {
                const option = document.createElement("option");
                option.value = name ? `${code} - ${name}` : code;
                fragment.appendChild(option);
            });

            el.partyCodeList.innerHTML = "";
            el.partyCodeList.appendChild(fragment);
        } catch (err) {
            console.error("Failed to load party suggestions:", err);
        }
    }

    function bindEvents() {
        el.searchBtn.addEventListener("click", () => fetchSuspenseReport(1));

        el.resetBtn.addEventListener("click", () => {
            el.partyCode.value = "";
            el.financialYear.value = "";
            state.dateFrom = null;
            state.dateTo = null;
            if (state.fpInstance) state.fpInstance.clear();
            fetchSuspenseReport(1);
        });

        // Allow pressing Enter in filter inputs to trigger search
        [el.partyCode, el.financialYear].forEach((input) => {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    fetchSuspenseReport(1);
                }
            });
        });

        // When Financial Year is selected, clear custom date range
        el.financialYear.addEventListener("change", () => {
            if (el.financialYear.value.trim() && state.fpInstance) {
                state.fpInstance.clear();
                state.dateFrom = null;
                state.dateTo = null;
            }
        });

        el.exportExcelBtn.addEventListener("click", exportToExcel);
        el.exportPdfBtn.addEventListener("click", exportToPDF);
    }

    // =========================================================================
    // 4. QUERY BUILDER & DATA FETCHING
    // =========================================================================
    function applyFilters(query) {
        const companyId = getCompanyId();
        if (companyId) {
            query = query.eq("company_id", companyId);
        }

        // Party filter (supports "CODE - Name", "CODE", or "Name")
        const rawParty = el.partyCode.value.trim();
        if (rawParty) {
            const searchTerm = rawParty.includes(" - ")
                ? rawParty.split(" - ")[0].trim()
                : rawParty;
            const safeTerm = searchTerm.replace(/[%_,]/g, "");
            query = query.or(
                `PartyCode.ilike.%${safeTerm}%,PartyName.ilike.%${safeTerm}%`
            );
        }

        // Date Range vs Financial Year
        const fy = el.financialYear.value.trim();
        if (state.dateFrom && state.dateTo) {
            query = query
                .gte("ReceiptOn", state.dateFrom)
                .lte("ReceiptOn", state.dateTo);
        } else if (/^\d{4}-\d{4}$/.test(fy)) {
            const [startYear, endYear] = fy.split("-");
            query = query
                .gte("ReceiptOn", `${startYear}-04-01`)
                .lte("ReceiptOn", `${endYear}-03-31`);
        }

        return query;
    }

    async function fetchSuspenseReport(page = 1) {
        const db = await supabaseClient;
        if (!db) {
            console.error("Supabase client not found. Check server.js.");
            return;
        }

        state.currentPage = page;
        toggleLoading(true);

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        try {
            let query = db
                .from(VIEW_NAME)
                .select("*", { count: "exact" })
                .order("ReceiptOn", { ascending: false })
                .order("PaymentID", { ascending: false })
                .range(from, to);

            query = applyFilters(query);

            const { data, count, error } = await query;
            if (error) throw error;

            state.totalRecords = count || 0;
            renderTable(data || [], from);
            renderPagination();
        } catch (err) {
            console.error("Error fetching suspense report:", err);
            el.tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-danger py-4">
                        Failed to load suspense records. Please try again.
                    </td>
                </tr>`;
            el.totalSuspenseAmount.textContent = "0.00";
        } finally {
            toggleLoading(false);
        }
    }

    /**
     * Fetches ALL matching rows (unpaginated) for Excel/PDF exports
     */
    async function fetchAllForExport() {
        const db = await supabaseClient;
        let query = db
            .from(VIEW_NAME)
            .select("*")
            .order("ReceiptOn", { ascending: false })
            .order("PaymentID", { ascending: false });

        query = applyFilters(query);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    // =========================================================================
    // 5. RENDERING
    // =========================================================================
    function renderTable(rows, startIndex) {
        if (!rows.length) {
            el.tableBody.innerHTML = "";
            el.totalSuspenseAmount.textContent = "0.00";
            el.emptyState.classList.remove("d-none");
            return;
        }

        el.emptyState.classList.add("d-none");

        let pageTotal = 0;
        const html = rows
            .map((row, idx) => {
                const amount = Number(row.SuspenseAmount) || 0;
                pageTotal += amount;

                const partyDisplay = row.PartyName
                    ? `<div class="fw-medium">${escapeHtml(row.PartyCode || "-")}</div>
                       <div class="text-muted small">${escapeHtml(row.PartyName)}</div>`
                    : escapeHtml(row.PartyCode || "-");

                const txType = (row.TransactionType || "").trim().toLowerCase();
                const amountColorClass =
                    txType === "credit"
                        ? "text-success"
                        : txType === "debit"
                            ? "text-danger"
                            : "";

                return `
                        <tr>
                            <td class="text-center">${startIndex + idx + 1}</td>
                            <td class="text-center text-nowrap">${formatDateDisplay(row.ReceiptOn)}</td>
                            <td class="text-center fw-medium">${escapeHtml(row.PaymentID || "-")}</td>
                            <td>${partyDisplay}</td>
                            <td class="text-center">${escapeHtml(row.PaymentMode || "-")}</td>
                            <td class="text-center">${escapeHtml(row.ReferenceNo || "-")}</td>
                            <td>${escapeHtml(row.Narration || "-")}</td>
                            <td class="text-end fw-semibold text-nowrap ${amountColorClass}">${formatCurrency(amount)}</td>
                        </tr>
                    `;
            })
            .join("");

        el.tableBody.innerHTML = html;
        el.totalSuspenseAmount.textContent = formatCurrency(pageTotal);
    }

    function renderPagination() {
        const totalPages = Math.ceil(state.totalRecords / PAGE_SIZE);
        el.paginationControls.innerHTML = "";

        if (totalPages <= 1) return;

        const createItem = (label, page, disabled = false, active = false) => {
            const li = document.createElement("li");
            li.className = `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}`;
            const a = document.createElement("a");
            a.className = "page-link";
            a.href = "#";
            a.textContent = label;
            a.addEventListener("click", (e) => {
                e.preventDefault();
                if (!disabled && !active) fetchSuspenseReport(page);
            });
            li.appendChild(a);
            return li;
        };

        el.paginationControls.appendChild(
            createItem("Prev", state.currentPage - 1, state.currentPage === 1)
        );

        // Windowed page numbers (max 5 visible)
        const startPage = Math.max(1, state.currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        for (let p = startPage; p <= endPage; p++) {
            el.paginationControls.appendChild(
                createItem(String(p), p, false, p === state.currentPage)
            );
        }

        el.paginationControls.appendChild(
            createItem("Next", state.currentPage + 1, state.currentPage === totalPages)
        );
    }

    // =========================================================================
    // 6. EXPORTS (EXCEL / CSV & PDF)
    // =========================================================================
    async function exportToExcel() {
        try {
            el.exportExcelBtn.disabled = true;
            const rows = await fetchAllForExport();
            if (!rows.length) {
                alert("No records available to export.");
                return;
            }

            const headers = [
                "Sr No",
                "Receipt Date",
                "Payment ID",
                "Party Code",
                "Party Name",
                "Payment Mode",
                "Reference No.",
                "Narration",
                "Suspense Amount",
            ];

            let grandTotal = 0;
            const csvRows = [headers.join(",")];

            rows.forEach((row, idx) => {
                const amount = Number(row.SuspenseAmount) || 0;
                grandTotal += amount;

                const line = [
                    idx + 1,
                    formatDateDisplay(row.ReceiptOn),
                    row.PaymentID || "",
                    row.PartyCode || "",
                    row.PartyName || "",
                    row.PaymentMode || "",
                    row.ReferenceNo || "",
                    row.Narration || "",
                    amount.toFixed(2),
                ].map(csvEscape);

                csvRows.push(line.join(","));
            });

            csvRows.push(["", "", "", "", "", "", "", "Total Suspense Amount", grandTotal.toFixed(2)].map(csvEscape).join(","));

            // UTF-8 BOM ensures Excel opens special characters properly
            const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
                type: "text/csv;charset=utf-8;",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Suspense_Account_Report_${formatDateISO(new Date())}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Excel export failed:", err);
            alert("Failed to export Excel file.");
        } finally {
            el.exportExcelBtn.disabled = false;
        }
    }

    async function exportToPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("PDF library failed to load. Please refresh and try again.");
            return;
        }

        try {
            el.exportPdfBtn.disabled = true;
            const rows = await fetchAllForExport();
            if (!rows.length) {
                alert("No records available to export.");
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

            doc.setFontSize(14);
            doc.text("Suspense Account Report", 40, 40);
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text(`Generated on: ${formatDateDisplay(new Date())}`, 40, 56);

            let grandTotal = 0;
            const tableBody = rows.map((row, idx) => {
                const amount = Number(row.SuspenseAmount) || 0;
                grandTotal += amount;
                return [
                    idx + 1,
                    formatDateDisplay(row.ReceiptOn),
                    row.PaymentID || "-",
                    row.PartyName ? `${row.PartyCode} (${row.PartyName})` : (row.PartyCode || "-"),
                    row.PaymentMode || "-",
                    row.ReferenceNo || "-",
                    row.Narration || "-",
                    formatCurrency(amount),
                ];
            });

            doc.autoTable({
                startY: 70,
                head: [[
                    "Sr No",
                    "Receipt Date",
                    "Payment ID",
                    "Party",
                    "Payment Mode",
                    "Reference No.",
                    "Narration",
                    "Suspense Amount",
                ]],
                body: tableBody,
                foot: [[
                    { content: "Total Suspense Amount", colSpan: 7, styles: { halign: "right", fontStyle: "bold" } },
                    { content: formatCurrency(grandTotal), styles: { halign: "right", fontStyle: "bold" } },
                ]],
                styles: { fontSize: 8, cellPadding: 5 },
                headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                footStyles: { fillColor: [241, 245, 249], textColor: 15 },
                columnStyles: {
                    0: { halign: "center", cellWidth: 38 },
                    1: { halign: "center", cellWidth: 68 },
                    7: { halign: "right", cellWidth: 85 },
                },
            });

            doc.save(`Suspense_Account_Report_${formatDateISO(new Date())}.pdf`);
        } catch (err) {
            console.error("PDF export failed:", err);
            alert("Failed to export PDF file.");
        } finally {
            el.exportPdfBtn.disabled = false;
        }
    }

    // =========================================================================
    // 7. UTILITIES
    // =========================================================================
    function toggleLoading(isLoading) {
        el.loadingSpinner.classList.toggle("d-none", !isLoading);
        el.searchBtn.disabled = isLoading;
    }

    function formatCurrency(val) {
        return Number(val || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function formatDateISO(date) {
        const d = new Date(date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    function formatDateDisplay(dateStr) {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function csvEscape(val) {
        const str = String(val ?? "");
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }
});