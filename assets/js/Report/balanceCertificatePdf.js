/**
 * Balance Certificate PDF Generator with Bootstrap Modal Popup
 * Uses jsPDF & jsPDF-AutoTable to export formal balance confirmation certificates.
 */

document.addEventListener('DOMContentLoaded', () => {
    const balanceCertificateBtn = document.getElementById('balanceCertificateBtn');

    if (balanceCertificateBtn) {
        balanceCertificateBtn.addEventListener('click', (e) => {
            e.preventDefault();

            // Validate that a party is selected first
            const partySelect = document.getElementById('partyFilter');
            const selectedPartyName = partySelect ? partySelect.value : '';

            if (!selectedPartyName) {
                alert('Please select a specific party/customer from the filter dropdown before generating the Balance Certificate.');
                return;
            }

            // Show Bootstrap Modal for Date Entry
            let dateModalEl = document.getElementById('balanceDateModal');

            // If the modal doesn't exist in HTML yet, dynamically inject it
            if (!dateModalEl) {
                createDateModalDynamically();
                dateModalEl = document.getElementById('balanceDateModal');
            }

            const modalInstance = new bootstrap.Modal(dateModalEl);
            modalInstance.show();

            // Handle confirm button click inside the modal
            const confirmBtn = document.getElementById('confirmGeneratePdfBtn');
            // Remove previous event listeners to avoid duplicate bindings
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', () => {
                const dateInput = document.getElementById('certificateDateInput');
                const rawInputDate = dateInput ? dateInput.value.trim() : '2026-07-31';
                const currentStatementDate = formatToReadableDate(rawInputDate);

                modalInstance.hide();
                generateBalanceCertificatePDF(currentStatementDate, selectedPartyName);
            });
        });
    }
});

// Helper to format date strings into readable text like "31st July 2026"
function formatToReadableDate(dateString) {
    if (!dateString.includes('-') && !dateString.includes('/')) {
        return dateString;
    }

    let parts;
    if (dateString.includes('-')) {
        parts = dateString.split('-');
    } else if (dateString.includes('/')) {
        parts = dateString.split('/');
    } else {
        return dateString;
    }

    let day, monthIndex, year;

    if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        monthIndex = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
    } else {
        day = parseInt(parts[0], 10);
        monthIndex = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
    }

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (isNaN(day) || isNaN(monthIndex) || isNaN(year) || !months[monthIndex]) {
        return dateString;
    }

    const j = day % 10,
        k = day % 100;
    let suffix = 'th';
    if (j === 1 && k !== 11) {
        suffix = 'st';
    } else if (j === 2 && k !== 12) {
        suffix = 'nd';
    } else if (j === 3 && k !== 13) {
        suffix = 'rd';
    }

    return `${day}${suffix} ${months[monthIndex]} ${year}`;
}

// Helper to inject modal if missing in HTML
function createDateModalDynamically() {
    const modalHTML = `
    <div class="modal fade" id="balanceDateModal" tabindex="-1" aria-labelledby="balanceDateModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title fw-bold" id="balanceDateModalLabel">Enter Balance Certificate Date</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="certificateDateInput" class="form-label">As of Date (e.g., 31st July 2026)</label>
                        <input type="text" class="form-control" id="certificateDateInput" value="31st July 2026" placeholder="Enter date">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary btn-sm" id="confirmGeneratePdfBtn">Generate PDF</button>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function generateBalanceCertificatePDF(currentStatementDate, selectedPartyName) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            alert('jsPDF library is not loaded properly.');
            return;
        }

        // Determine whether we are on the Customer or Vendor tab
        const activeTab = document.querySelector('#outstandingTabs .nav-link.active');
        const isVendor = activeTab && activeTab.id === 'vendor-tab';

        // Fetch fresh data directly from Supabase
        const viewName = isVendor ? 'VendorBillPaymentView' : 'InvoicePaymentView';
        const dateColumn = isVendor ? 'AccountedDate' : 'InvoiceDate';
        const noColumn = isVendor ? 'BillNo' : 'InvoiceNo';
        const partyField = isVendor ? 'PartyName' : 'PartyName';

        const allRecords = await fetchOutstandingData(viewName, dateColumn, noColumn);

        // Filter records belonging strictly to the selected party
        const partyRecords = allRecords.filter(row =>
            row[partyField] && row[partyField].toLowerCase() === selectedPartyName.toLowerCase()
        );

        if (partyRecords.length === 0) {
            alert(`No outstanding records found for "${selectedPartyName}".`);
            return;
        }

        const partyInvoices = [];
        let totalInvoiceAmt = 0;
        let totalBalanceAmt = 0;

        partyRecords.forEach(record => {
            const invoiceNo = record[noColumn] || '';
            const rawDate = record[dateColumn] || '';

            const invoiceDate = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '';
            const invoiceAmt = parseFloat(isVendor ? record.ChargeTotalAmount : record.GrandTotalAmount) || 0;
            const balanceAmt = parseFloat(record.BalanceAmount) || invoiceAmt;

            totalInvoiceAmt += invoiceAmt;
            totalBalanceAmt += balanceAmt;

            partyInvoices.push([
                invoiceDate,
                invoiceNo,
                invoiceAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                balanceAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                invoiceDate
            ]);
        });

        const partyDetails = await getPartyProfileByName(selectedPartyName);
        const companyDetails = await getCompanyProfile(CompanyID);

        // Initialize jsPDF document (A4 size, Portrait)
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pageWidth = doc.internal.pageSize.getWidth(); // ~210 mm
        const rightMargin = 14;

        // --- Calculate Maximum Column Widths for Address Wrapping ---
        const toColWidth = 85;
        const fromX = 115;
        const fromColWidth = pageWidth - fromX - rightMargin;

        // Format system date as DD-MM-YYYY
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const currentDate = `${day}-${month}-${year}`;

        // --- Header Section ---
        doc.setFont('Inter', 'normal');
        doc.setFontSize(10);

        doc.text(`Date: ${currentDate}`, 14, 15);

        // --- To Address (Left Side: X = 14) ---
        let toY = 25;
        doc.setFont(undefined, 'bold');
        doc.text('To,', 14, toY);
        toY += 5;

        let fullPartyAddress = selectedPartyName;
        if (partyDetails.Address) {
            fullPartyAddress += '\n' + toProperCase(partyDetails.Address);
        }
        doc.setFont(undefined, 'normal');
        const partyCityState = `${partyDetails.City || ''}, ${partyDetails.State || ''} - ${partyDetails.PinCode || ''} - ${partyDetails.Country || ''}`;
        if (partyCityState.trim() !== ',  -  - ') {
            fullPartyAddress += '\n' + partyCityState;
        }

        const partyAddressLines = doc.splitTextToSize(fullPartyAddress, toColWidth);
        doc.text(partyAddressLines, 14, toY);
        toY += (partyAddressLines.length * 5);

        // --- From Address (Right Side: X = 115) ---
        let fromY = 25;
        doc.setFont(undefined, 'bold');
        doc.text('From,', fromX, fromY);
        fromY += 5;

        let fullCompanyAddress = companyDetails.company_name;
        if (companyDetails.address) {
            fullCompanyAddress += '\n' + toProperCase(companyDetails.address);
        }
        doc.setFont(undefined, 'normal');
        const companyCityState = `${companyDetails.city || ''}, ${companyDetails.state || ''} - ${companyDetails.pin_code || ''} - ${companyDetails.country || ''}`;
        if (companyCityState.trim() !== ',  -  - ') {
            fullCompanyAddress += '\n' + companyCityState;
        }

        const companyAddressLines = doc.splitTextToSize(fullCompanyAddress, fromColWidth);
        doc.text(companyAddressLines, fromX, fromY);
        fromY += (companyAddressLines.length * 5);

        let subjectY = Math.max(toY, fromY) + 12;

        // --- Subject & Body ---
        doc.setFont(undefined, 'bold');
        doc.text(`Subject: Confirmation of Balance as of ${currentStatementDate}.`, 14, subjectY);

        doc.setFont(undefined, 'normal');
        doc.text('Dear Sir / Madam,', 14, subjectY + 10);

        // --- Paragraph 1 with Inline Bold Variables and Word Wrapping ---
        let currentY = subjectY + 17;
        let currentX = 14;
        const maxTextX = pageWidth - rightMargin;
        const lineHeight = 5;

        const p1Segments = [
            { text: "This is to certify that there is no other amount receivable from ", style: 'normal' },
            { text: selectedPartyName, style: 'bold' },
            { text: ", as of ", style: 'normal' },
            { text: currentStatementDate, style: 'bold' },
            { text: ", except for the details as given below.", style: 'normal' }
        ];

        p1Segments.forEach(seg => {
            doc.setFont('Inter', seg.style);
            const tokens = seg.text.match(/(\S+|\s+)/g) || [];

            tokens.forEach(token => {
                const tokenWidth = doc.getTextWidth(token);
                if (currentX + tokenWidth > maxTextX && token.trim() !== '') {
                    currentX = 14;
                    currentY += lineHeight;
                }
                if (currentX === 14 && token.trim() === '') {
                    return;
                }
                doc.text(token, currentX, currentY);
                currentX += tokenWidth;
            });
        });

        // --- Paragraph 2 ---
        currentY += 10;
        const bodyText2 = `All the bills till the period ${currentStatementDate} has been raised and payment has been received except as mentioned below.`;
        doc.text(doc.splitTextToSize(bodyText2, pageWidth - 28), 14, currentY);

        currentY += 10;
        doc.setFont('Inter', 'bold');
        doc.text(`Outstanding Bills as of ${currentStatementDate}.`, 14, currentY);

        // --- AutoTable ---
        doc.autoTable({
            startY: currentY + 5,
            head: [[
                'Date of Invoice',
                'Invoice No',
                'Invoice Amt',
                'Balance Amt',
                'Date of Submission'
            ]],
            body: partyInvoices,
            foot: [[
                'Total Amount Rs', '',
                totalInvoiceAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                totalBalanceAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                ''
            ]],
            theme: 'grid',
            headStyles: {
                fillColor: [37, 99, 235],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                fontSize: 8
            },
            bodyStyles: {
                fontSize: 8,
                textColor: [15, 23, 42]
            },
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontStyle: 'bold',
                fontSize: 8,
                halign: 'right'
            },
            columnStyles: {
                0: { halign: 'left' },
                1: { halign: 'left' },
                2: { halign: 'right' }, // Invoice Amt column
                3: { halign: 'right' }, // Balance Amt column
                4: { halign: 'center' }
            },
            didParseCell: function (data) {
                // Ensures the 'Total Amount Rs' label stays left-aligned in the footer row
                if (data.section === 'foot' && data.column.index === 0) {
                    data.cell.styles.halign = 'left';
                }
            },
            margin: { left: 14, right: rightMargin }
        });

        // --- Sign-off Section ---
        let finalY = doc.lastAutoTable.finalY + 15;

        if (finalY > 240) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFont('Inter', 'normal');
        doc.text('Kindly check and confirm.', 14, finalY);

        finalY += 8;
        doc.setFont('Inter', 'bold');
        doc.text('For ' + companyDetails.company_name, 14, finalY);

        finalY += 25;
        doc.setFont('Inter', 'normal');
        doc.text('Authorised Signatory with Stamp.', 14, finalY);

        finalY += 8;
        doc.text('Sign Authority Name:___________________', 14, finalY);

        finalY += 8;
        doc.text('Contact No:________________', 14, finalY);

        doc.save(`Balance_Certificate_${selectedPartyName.replace(/\s+/g, '_')}.pdf`);

    } catch (error) {
        console.error('Error generating Balance Certificate PDF:', error);
        alert('An error occurred while generating the PDF. Please check console logs.');
    }
}