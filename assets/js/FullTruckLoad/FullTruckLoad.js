let movementDetails = [];
const addShipmentBtn = document.getElementById('addShipmentRow');
const shipmentTableBody = document.querySelector('#shipmentDetailsTable tbody');

// Variables for Tracking Shipment State
let deletedShipmentIds = [];
let currentEditShipmentId = null;

document.addEventListener("DOMContentLoaded", async () => {
    enableForm();

    try {
        const suggestionTasks = [
            loadSuggestions('partySuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
            loadSuggestions('vendorSuggestions', 'PartyDetails', CompanyID, 'PartyCode', 'PartyName'),
        ];

        const dropdownConfigs = [
            ['departmentList', 'Department'],
            ['MovementType', 'movementType'],
            ['ModeType', 'modeType'],
            ['PaymentType', 'paymentType'],
            ['ChargesType', 'chargesTypeList'],
            ['ChargesType', 'vendorChargesTypeList'],
            ['VehicleType', 'vehicleType']
        ];

        const dropdownTasks = dropdownConfigs.map(([id, table]) => loadDropdownOptions(id, table));
        const otherTasks = [loadRouteSuggestions(), loadTaxData()];

        await Promise.all([...suggestionTasks, ...dropdownTasks, ...otherTasks]);

        await Promise.all([
            setupPincodeListener('originPinCode', 'originCity'),
            setupPincodeListener('destinationPinCode', 'destinationCity'),
            setupPincodeListener('shipmentPinCode', 'shipmentCity')
        ]);

        document.getElementById('lrDate').valueAsDate = new Date();

    } catch (error) {
        console.error("Initialization error:", error);
    }
});

// Container number validation
document.getElementById('containerNumber').addEventListener('input', function () {
    this.value = this.value.toUpperCase();
    const feedback = document.getElementById('containerFeedback');
    const result = validateContainerNumber(this.value);

    if (!result.valid) {
        this.classList.add('is-invalid');
        this.classList.remove('is-valid');
        feedback.textContent = result.error;
        feedback.classList.remove('d-none');
    } else {
        this.classList.remove('is-invalid');
        this.classList.add('is-valid');
        feedback.classList.add('d-none');
    }
});

document.getElementById("lrNumber").addEventListener("input", function () {
    loadMovementDetails(this.value.trim());
});

// Helper to map raw database row to application state keys
function mapMovementRow(row) {
    return {
        lrNumber: row.lr_number,
        lrDate: row.pickup_date,
        quotationID: row.quotation_id,
        movementType: row.movement_type,
        transitType: row.transit_type,
        partyCode: row.customer_code,
        partyName: row.customer_name,
        originPinCode: row.origin_pincode,
        originCity: row.origin_city,
        originAddress: row.origin_address,
        destinationPinCode: row.destination_pincode,
        destinationCity: row.destination_city,
        destinationAddress: row.destination_address,
        requestedDate: row.requested_date,
        vehicleType: row.vehicle_type,
        referenceNumber: row.reference_number,
        invoiceValue: row.invoice_value,
        vendorCode: row.vendor_code,
        vendorName: row.vendor_name,
        vehicleNumber: row.vehicle_number,
        containerNumber: row.container_number,
        modeType: row.mode_type,
        quantity: row.quantity,
        actualWT: row.actual_weight,
        chargeWT: row.charge_weight,
        paymentType: row.payment_type,
        routeDetails: row.routedetails,
        descriptionOfGoods: row.description_of_goods,
        status: row.status,
        information: row.information,
        completionDate: row.completion_date,
        waybillno: row.waybillno,
        driverCode: row.driver_code,
        driverName: row.driver_name,
        driverPhoneNo: row.driver_phone_no,
        driverDLNo: row.driver_dl_no
    };
}

async function loadMovementDetails(query = '') {
    const { data, error } = await supabaseClient
        .from('FullLoadBookingDetails')
        .select('*')
        .eq('company_id', CompanyID)
        .ilike('lr_number', `%${query}%`)
        .order('lr_number', { ascending: false });

    if (error || !data) return;

    movementDetails = data.map(mapMovementRow);
    populateLRNumberSuggestions();
}

function populateLRNumberSuggestions() {
    const suggestions = movementDetails.map(m => `<option value="${m.lrNumber}"></option>`).join('');
    document.getElementById("lrNumberSuggestions").innerHTML = suggestions;
}

// When an LR Number is selected from the dropdown
$("#lrNumber").on("change", async function () {
    const lrNumber = $(this).val().trim();
    if (!lrNumber) return;

    let movementData = movementDetails.find(m => m.lrNumber === lrNumber);

    if (!movementData) {
        const { data, error } = await supabaseClient
            .from("FullLoadBookingDetails")
            .select("*")
            .eq("lr_number", lrNumber)
            .maybeSingle();

        if (error || !data) {
            showToast("No data found for LR:", lrNumber);
            return;
        }

        movementData = mapMovementRow(data);
    }

    // Map state keys directly to DOM selector strings
    const elementMap = {
        lrDate: "#lrDate", quotationID: "#quotationID", modeType: "#modeType",
        movementType: "#movementType", partyCode: "#partyCode", partyName: "#partyName",
        originPinCode: "#originPinCode", originCity: "#originCity", originAddress: "#originAddress",
        destinationPinCode: "#destinationPinCode", destinationCity: "#destinationCity",
        destinationAddress: "#destinationAddress", requestedDate: "#requestedDate",
        referenceNumber: "#referenceNumber", invoiceValue: "#invoiceValue", vendorCode: "#vendorCode",
        vendorName: "#vendorName", vehicleType: "#vehicleType", vehicleNumber: "#vehicleNumber",
        containerNumber: "#containerNumber", routeDetails: "#routeDetails", quantity: "#quantity",
        actualWT: "#actualWt", chargeWT: "#chargeWt", paymentType: "#paymentType",
        information: "#information", descriptionOfGoods: "#descriptionofGoods", waybillno: "#wayBillNo",
        driverCode: "#driverCode", driverName: "#driverName", driverPhoneNo: "#driverPhoneNo", driverDLNo: "#driverDLNo"
    };

    Object.entries(movementData).forEach(([key, value]) => {
        if (elementMap[key]) $(elementMap[key]).val(value ?? "");
    });

    await Promise.all([
        loadBillingCharges(lrNumber, "Sale", "chargesDetailsTable"),
        loadBillingCharges(lrNumber, "Buy", "vendorChargesDetailsTable"),
        loadShipmentDetails(lrNumber)
    ]);

    document.getElementById("addFreightRow").disabled = true;
    document.getElementById("addVendorFreightRow").disabled = true;
    saveButton.innerHTML = '<i class="bi bi-save"></i> Update';

    disableForm();
    document.getElementById("modifyButton").disabled = false;
    document.getElementById("newButton").disabled = false;
    document.getElementById("saveButton").disabled = true;
    document.getElementById("reportButton").disabled = false;
});

document.getElementById('newButton').addEventListener('click', async function () {
    enableForm();
    clearForm();

    saveButton.disabled = false;
    modifyButton.disabled = true;
    reportButton.disabled = true;
    deleteButton.disabled = true;

    document.getElementById('saveButton').innerHTML = '<i class="bi bi-save"></i> Save';
    document.getElementById('lrDate').valueAsDate = new Date();
    document.getElementById('quantity').value = "1.00";

    document.getElementById('addFreightRow').disabled = false;
    document.getElementById('addVendorFreightRow').disabled = false;

    deletedShipmentIds = [];
    currentEditShipmentId = null;

    ["chargesDetailsTable", "vendorChargesDetailsTable", "shipmentDetailsTable"].forEach(id => {
        const table = document.getElementById(id);
        if (table) {
            table.querySelector("tbody")?.replaceChildren();
            table.querySelector("tfoot")?.replaceChildren();
        }
    });
});

document.getElementById('modifyButton').addEventListener('click', function () {
    enableForm();
    document.getElementById('saveButton').disabled = false;
    document.getElementById('modifyButton').disabled = true;
    document.getElementById('reportButton').disabled = true;
    saveButton.innerHTML = '<i class="bi bi-save"></i> Update';
    document.getElementById('addFreightRow').disabled = false;
    document.getElementById('addVendorFreightRow').disabled = false;

    document.querySelectorAll('.deleteRow, .delete-shipment-btn, .edit-shipment-btn').forEach(btn => btn.disabled = false);
    document.getElementById("lrNumber").disabled = true;
});

function areRequiredFieldsFilled() {
    const requiredFields = [
        'lrDate', 'movementType', 'partyName', 'originPinCode', 'originCity', 'originAddress',
        'requestedDate', 'vehicleType', 'destinationPinCode', 'destinationCity', 'destinationAddress',
        'vehicleNumber', 'quantity', 'chargeWt', 'modeType'
    ];

    for (let fieldId of requiredFields) {
        const field = document.getElementById(fieldId);
        if (!field || !field.value.trim()) {
            field?.focus();
            alert('Please fill in all required fields. Missing: ' + fieldId);
            return false;
        }
    }
    return true;
}

// =========================================================================
// SAVE BUTTON CLICKED - AUTO TARIFF & DEDUPLICATION LOGIC
// =========================================================================
document.getElementById("saveButton").addEventListener("click", async function (event) {
    event.preventDefault();

    const saveBtn = document.getElementById("saveButton");
    const addBtn = document.getElementById("addFreightRow");
    const vendorAddBtn = document.getElementById("addVendorFreightRow");
    let lrNumber = document.getElementById("lrNumber").value.trim();

    saveBtn.disabled = true;
    addBtn.disabled = true;
    vendorAddBtn.disabled = true;

    if (!areRequiredFieldsFilled()) {
        saveBtn.disabled = false;
        addBtn.disabled = false;
        vendorAddBtn.disabled = false;
        return;
    }

    if (document.querySelectorAll("#chargesDetailsTable tbody tr:not([data-status='deleted'])").length === 0) {
        await applyCustomerTariff();
    }
    if (document.querySelectorAll("#vendorChargesDetailsTable tbody tr:not([data-status='deleted'])").length === 0) {
        await applyVendorTariff();
    }

    const isSaveAction = saveBtn.innerText.trim().toLowerCase() === "save";

    if (!lrNumber) {
        lrNumber = await generateLRNumber();
        document.getElementById("lrNumber").value = lrNumber;
    }

    const val = id => document.getElementById(id)?.value || "";
    const modeType = val("modeType");
    const transitType = modeType === "FTL" ? "By Road" : "By Sea Freight";

    let formData = {
        lr_number: lrNumber,
        pickup_date: val("lrDate"),
        customer_code: val("partyCode"),
        customer_name: val("partyName"),
        requested_date: val("requestedDate"),
        quotation_id: val("quotationID"),
        mode_type: modeType,
        movement_type: val("movementType"),
        transit_type: transitType,
        origin_pincode: val("originPinCode"),
        origin_city: val("originCity"),
        origin_address: val("originAddress"),
        destination_pincode: val("destinationPinCode"),
        destination_city: val("destinationCity"),
        destination_address: val("destinationAddress"),
        reference_number: val("referenceNumber"),
        invoice_value: parseFloat(val("invoiceValue")) || 0,
        vendor_code: val("vendorCode"),
        vendor_name: val("vendorName"),
        vehicle_type: val("vehicleType"),
        vehicle_number: val("vehicleNumber"),
        container_number: val("containerNumber"),
        quantity: val("quantity"),
        actual_weight: val("actualWt"),
        charge_weight: val("chargeWt"),
        payment_type: val("paymentType"),
        routedetails: val("routeDetails") || null,
        information: val("information"),
        description_of_goods: val("descriptionofGoods"),
        waybillno: val("wayBillNo"),
        company_id: CompanyID,
        driver_code: val("driverCode"),
        driver_name: val("driverName"),
        driver_phone_no: val("driverPhoneNo"),
        driver_dl_no: val("driverDLNo")
    };

    try {
        let query;
        if (isSaveAction) {
            formData.created_by = UserLoginID;
            formData.created_at = localtimeStamp;
            query = supabaseClient.from("FullLoadBookingDetails").insert([formData]).select().single();
        } else {
            formData.updated_by = UserLoginID;
            formData.updated_at = localtimeStamp;
            query = supabaseClient.from("FullLoadBookingDetails").update(formData).eq("lr_number", lrNumber).select().single();
        }

        const { data, error } = await query;
        if (error) throw error;

        const bookingId = data.id;

        await Promise.all([
            saveCharges(bookingId, "chargesDetailsTable", "Sale"),
            saveCharges(bookingId, "vendorChargesDetailsTable", "Buy"),
            saveShipments(bookingId, lrNumber)
        ]);

        await loadShipmentDetails(lrNumber);

        disableForm();
        saveBtn.innerHTML = `<i class="bi bi-save"></i> Update`;
        document.getElementById("modifyButton").disabled = false;
        document.getElementById("reportButton").disabled = false;

        alert(`Movement details ${isSaveAction ? "saved" : "updated"} successfully!\nLR Number: ${lrNumber}`);

    } catch (err) {
        console.error("Error saving data:", err);
        alert("Error saving movement details");
        saveBtn.disabled = false;
        addBtn.disabled = false;
        vendorAddBtn.disabled = false;
    }
});

// =========================================================================
// SHIPMENT DETAILS TABS - UI & DB LOGIC
// =========================================================================
addShipmentBtn.addEventListener('click', function () {
    const type = document.getElementById('shipmentType').value;
    const name = document.getElementById('consigneeorConsignorName').value.trim();
    const address = document.getElementById('consigneeorConsignorAddress').value.trim();
    const pincode = document.getElementById('shipmentPinCode').value.trim();
    const city = document.getElementById('shipmentCity').value.trim();
    const refNo = document.getElementById('shipmentReferenceNumber').value.trim();
    const eWayBillNo = document.getElementById('shipmentEWayBillNumber').value.trim();

    const invValue = parseFloat(document.getElementById('shipmentInvoiceValue').value || 0).toFixed(2);
    const qty = parseFloat(document.getElementById('shipmentQuantity').value || 0).toFixed(2);
    const actWt = parseFloat(document.getElementById('shipmentActualWt').value || 0).toFixed(2);
    const chgWt = parseFloat(document.getElementById('shipmentChargeWt').value || 0).toFixed(2);

    if (!name || !address || !pincode || !city) {
        alert('Please fill in Name, Address, Pincode, and City before adding.');
        return;
    }

    let tr = currentEditShipmentId ? shipmentTableBody.querySelector(`tr[data-id="${currentEditShipmentId}"]`) : null;

    if (!tr) {
        tr = document.createElement('tr');
        if (currentEditShipmentId) tr.dataset.id = currentEditShipmentId;
        shipmentTableBody.appendChild(tr);
    }

    Object.assign(tr.dataset, {
        type, name, address, pincode, city, refNo, eWayBillNo, e_waybill_no: eWayBillNo, invValue, qty, actWt, chgWt
    });

    tr.innerHTML = `
        <td>${type}</td>
        <td class="text-cap">${name}</td>
        <td class="text-cap text-truncate" style="max-width: 150px;" title="${address}">${address}</td>
        <td>${pincode}</td>
        <td class="text-cap">${city}</td>
        <td class="text-upper">${refNo}</td>
        <td class="text-upper">${eWayBillNo}</td>
        <td class="text-end">${invValue}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${actWt}</td>
        <td class="text-end">${chgWt}</td>
        <td class="text-center text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary py-0 px-1 edit-shipment-btn" title="Edit Row"><i class="bi bi-pencil"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1 delete-shipment-btn" title="Remove Row"><i class="bi bi-trash"></i></button>
        </td>
    `;

    recalculateShipmentSummary();

    currentEditShipmentId = null;
    document.getElementById('shipmentId').value = '';
    document.getElementById('addShipmentRow').innerHTML = '<i class="bi bi-plus-lg"></i> Add';

    ['consigneeorConsignorName', 'consigneeorConsignorAddress', 'shipmentPinCode', 'shipmentCity',
        'shipmentReferenceNumber', 'shipmentInvoiceValue', 'shipmentQuantity', 'shipmentActualWt', 'shipmentChargeWt', 'shipmentEWayBillNumber']
        .forEach(id => document.getElementById(id).value = '');

    document.getElementById('consigneeorConsignorName').focus();
});

shipmentTableBody.addEventListener('click', function (e) {
    const deleteBtn = e.target.closest('.delete-shipment-btn');
    const editBtn = e.target.closest('.edit-shipment-btn');

    if (deleteBtn) {
        const tr = deleteBtn.closest('tr');
        if (tr.dataset.id) deletedShipmentIds.push(tr.dataset.id);
        tr.remove();
        recalculateShipmentSummary();
    } else if (editBtn) {
        const tr = editBtn.closest('tr');
        currentEditShipmentId = tr.dataset.id || ('temp_' + Date.now());
        tr.dataset.id = currentEditShipmentId;
        document.getElementById('shipmentId').value = currentEditShipmentId;

        document.getElementById('shipmentType').value = tr.dataset.type || '';
        document.getElementById('consigneeorConsignorName').value = tr.dataset.name || '';
        document.getElementById('consigneeorConsignorAddress').value = tr.dataset.address || '';
        document.getElementById('shipmentPinCode').value = tr.dataset.pincode || '';
        document.getElementById('shipmentCity').value = tr.dataset.city || '';
        document.getElementById('shipmentReferenceNumber').value = tr.dataset.refNo || '';
        document.getElementById('shipmentEWayBillNumber').value = tr.dataset.eWayBillNo || tr.dataset.e_waybill_no || '';
        document.getElementById('shipmentInvoiceValue').value = tr.dataset.invValue || '';
        document.getElementById('shipmentQuantity').value = tr.dataset.qty || '';
        document.getElementById('shipmentActualWt').value = tr.dataset.actWt || '';
        document.getElementById('shipmentChargeWt').value = tr.dataset.chgWt || '';

        document.getElementById('addShipmentRow').innerHTML = '<i class="bi bi-pencil"></i> Edit Item';
        document.getElementById('consigneeorConsignorName').focus();
    }
});

async function saveShipments(bookingId, lrNumber) {
    const rows = document.querySelectorAll('#shipmentDetailsTable tbody tr');
    const shipmentsToInsert = [];
    const shipmentsToUpdate = [];

    rows.forEach(tr => {
        const shipment = {
            booking_id: bookingId,
            lr_number: lrNumber,
            shipment_type: tr.dataset.type,
            consignee_or_consignor_name: tr.dataset.name,
            consignee_or_consignor_address: tr.dataset.address,
            pincode: tr.dataset.pincode,
            city: tr.dataset.city,
            reference_number: tr.dataset.refNo,
            e_waybill_no: tr.dataset.e_waybill_no || tr.dataset.eWayBillNo || '',
            invoice_value: parseFloat(tr.dataset.invValue) || 0,
            quantity: parseFloat(tr.dataset.qty) || 0,
            actual_weight: parseFloat(tr.dataset.actWt) || 0,
            charge_weight: parseFloat(tr.dataset.chgWt) || 0,
        };

        const rowId = tr.dataset.id;
        if (rowId && rowId !== "null" && rowId !== "undefined" && rowId.trim() !== "") {
            shipment.id = rowId;
            shipment.updated_at = new Date().toISOString();
            shipmentsToUpdate.push(shipment);
        } else {
            shipmentsToInsert.push(shipment);
        }
    });

    const promises = [];
    if (deletedShipmentIds.length > 0) {
        promises.push(supabaseClient.from('FullLoadShipmentDetails').delete().in('id', deletedShipmentIds));
    }
    if (shipmentsToUpdate.length > 0) {
        promises.push(supabaseClient.from('FullLoadShipmentDetails').upsert(shipmentsToUpdate));
    }
    if (shipmentsToInsert.length > 0) {
        promises.push(supabaseClient.from('FullLoadShipmentDetails').insert(shipmentsToInsert));
    }

    if (promises.length > 0) await Promise.all(promises);
    deletedShipmentIds = [];
}

async function loadShipmentDetails(lrNumber) {
    const { data, error } = await supabaseClient.from('FullLoadShipmentDetails').select('*').eq('lr_number', lrNumber);
    if (error || !data) return;

    shipmentTableBody.innerHTML = '';
    deletedShipmentIds = [];
    currentEditShipmentId = null;

    data.forEach(row => {
        const tr = document.createElement('tr');
        const eWayBillNo = row.e_waybill_no || '';

        Object.assign(tr.dataset, {
            id: row.id,
            type: row.shipment_type,
            name: row.consignee_or_consignor_name,
            address: row.consignee_or_consignor_address,
            pincode: row.pincode,
            city: row.city,
            refNo: row.reference_number,
            eWayBillNo: eWayBillNo,
            e_waybill_no: eWayBillNo,
            invValue: row.invoice_value,
            qty: row.quantity,
            actWt: row.actual_weight,
            chgWt: row.charge_weight
        });

        tr.innerHTML = `
            <td>${row.shipment_type}</td>
            <td class="text-cap">${row.consignee_or_consignor_name}</td>
            <td class="text-cap text-truncate" style="max-width: 150px;" title="${row.consignee_or_consignor_address}">${row.consignee_or_consignor_address}</td>
            <td>${row.pincode}</td>
            <td class="text-cap">${row.city}</td>
            <td class="text-upper">${row.reference_number || ''}</td>
            <td class="text-upper">${eWayBillNo}</td>
            <td class="text-end">${parseFloat(row.invoice_value || 0).toFixed(2)}</td>
            <td class="text-end">${parseFloat(row.quantity || 0).toFixed(2)}</td>
            <td class="text-end">${parseFloat(row.actual_weight || 0).toFixed(2)}</td>
            <td class="text-end">${parseFloat(row.charge_weight || 0).toFixed(2)}</td>
            <td class="text-center text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary py-0 px-1 edit-shipment-btn" title="Edit Row" disabled><i class="bi bi-pencil"></i></button>
                <button type="button" class="btn btn-sm btn-outline-danger py-0 px-1 delete-shipment-btn" title="Remove Row" disabled><i class="bi bi-trash"></i></button>
            </td>
        `;
        shipmentTableBody.appendChild(tr);
    });
    updateShipmentTotals();
}

async function loadBillingCharges(lrNumber, accountType, tableId) {
    const { data, error } = await supabaseClient.from("FullLoadBookingCharges").select("*").eq("LRNumber", lrNumber).eq("AccountType", accountType);
    if (error || !data) return;

    const tableBody = document.getElementById(tableId).querySelector("tbody");
    tableBody.innerHTML = "";

    data.forEach(row => {
        const tr = document.createElement("tr");
        tr.dataset.status = "old";
        tr.dataset.id = row.id;

        tr.innerHTML = `
            <td class="align-middle">${row.ChargesType}</td>
            <td class="align-middle">${row.TaxRate}%</td>
            <td class="text-end align-middle">${parseFloat(row.TotalAmount).toFixed(2)}</td>
            <td class="text-end align-middle">${parseFloat(row.CGSTAmt).toFixed(2)}</td>
            <td class="text-end align-middle">${parseFloat(row.SGSTAmt).toFixed(2)}</td>
            <td class="text-end align-middle">${parseFloat(row.IGSTAmt).toFixed(2)}</td>
            <td class="text-end align-middle">${parseFloat(row.TotalGSTAmt).toFixed(2)}</td>
            <td class="text-end align-middle">${parseFloat(row.GrandTotalAmt).toFixed(2)}</td>
            <td><button type="button" class="btn btn-sm btn-danger deleteRow" disabled>Delete</button></td>
            <td class="align-middle d-none">${row.HSNCode || ""}</td>
            <td class="align-middle d-none">${row.TaxID || ""}</td>
        `;
        tableBody.appendChild(tr);

        tr.querySelector(".deleteRow").onclick = () => {
            tr.dataset.status = "deleted";
            tr.style.display = "none";
            updateChargesTotals(tableId);
        };
    });
    updateChargesTotals(tableId);
}

document.getElementById("addFreightRow").addEventListener("click", async () => {
    await addFreightRow("chargesDetailsTable", "chargesType", "customerFreightAmt", "partyDefaultTax");
    await getFixedCharges("Sell");
});

document.getElementById("addVendorFreightRow").addEventListener("click", async () => {
    await addFreightRow("vendorChargesDetailsTable", "vendorChargesType", "vendorFreightAmt", "vendorDefaultTax");
    await getFixedCharges("Buy");
});

async function addFreightRow(tableId, chargesInput, amountInput, taxInput) {
    const chargesType = document.getElementById(chargesInput).value.trim();
    const amount = parseFloat(document.getElementById(amountInput).value) || 0;
    const taxID = document.getElementById(taxInput).value || 1;
    const HSNCode = await getDropdownDataValue(chargesType, "ChargesType");

    const addVendorBtn = document.getElementById("addVendorFreightRow");
    const addFreightBtn = document.getElementById("addFreightRow");

    addVendorBtn.disabled = true;
    addFreightBtn.disabled = true;

    if (!chargesType || amount <= 0) {
        alert("Enter Charges Type and Amount");
        addVendorBtn.disabled = false;
        addFreightBtn.disabled = false;
        return;
    }

    const tableBody = document.getElementById(tableId).querySelector("tbody");
    for (let row of tableBody.querySelectorAll("tr")) {
        if (row.dataset.status !== "deleted" && row.children[0].textContent.trim() === chargesType) {
            addVendorBtn.disabled = false;
            addFreightBtn.disabled = false;
            return;
        }
    }

    const taxes = await getTaxRatesById(taxID);
    const taxCalculations = calculateTaxes(amount, taxes);
    const tr = document.createElement("tr");
    tr.dataset.status = "new";

    tr.innerHTML = `
        <td>${chargesType}</td>
        <td>${taxCalculations.totalRate}%</td>
        <td class="text-end">${amount.toFixed(2)}</td>
        <td class="text-end">${taxCalculations.sgstAmt.toFixed(2)}</td>
        <td class="text-end">${taxCalculations.cgstAmt.toFixed(2)}</td>
        <td class="text-end">${taxCalculations.igstAmt.toFixed(2)}</td>
        <td class="text-end">${taxCalculations.totalGstAmt.toFixed(2)}</td>
        <td class="text-end">${taxCalculations.grandTotal.toFixed(2)}</td>
        <td><button type="button" class="btn btn-sm btn-danger deleteRow">Delete</button></td>
        <td class="d-none">${HSNCode?.hsn_code || "0"}</td>
        <td class="d-none">${taxID}</td>
    `;
    tableBody.appendChild(tr);

    tr.querySelector(".deleteRow").onclick = () => {
        if (tr.dataset.status === "new") tr.remove();
        else {
            tr.dataset.status = "deleted";
            tr.style.display = "none";
        }
        updateChargesTotals(tableId);
    };

    updateChargesTotals(tableId);
    document.getElementById(chargesInput).value = "";
    document.getElementById(amountInput).value = "";
    document.getElementById(taxInput).selectedIndex = 0;
    addVendorBtn.disabled = false;
    addFreightBtn.disabled = false;
}

function updateChargesTotals(tableId) {
    const table = document.getElementById(tableId);
    const rows = table.querySelectorAll("tbody tr");
    const tfoot = table.querySelector("tfoot") || table.createTFoot();

    let totals = { amount: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, grand: 0 };

    rows.forEach(tr => {
        if (tr.dataset.status === "deleted") return;
        totals.amount += parseFloat(tr.children[2].textContent) || 0;
        totals.cgst += parseFloat(tr.children[3].textContent) || 0;
        totals.sgst += parseFloat(tr.children[4].textContent) || 0;
        totals.igst += parseFloat(tr.children[5].textContent) || 0;
        totals.gst += parseFloat(tr.children[6].textContent) || 0;
        totals.grand += parseFloat(tr.children[7].textContent) || 0;
    });

    tfoot.innerHTML = `
        <tr class="table-secondary fw-bold">
            <td colspan="2">Total</td>
            <td class="text-end">${totals.amount.toFixed(2)}</td>
            <td class="text-end">${totals.cgst.toFixed(2)}</td>
            <td class="text-end">${totals.sgst.toFixed(2)}</td>
            <td class="text-end">${totals.igst.toFixed(2)}</td>
            <td class="text-end">${totals.gst.toFixed(2)}</td>
            <td class="text-end">${totals.grand.toFixed(2)}</td>
            <td></td>
        </tr>
    `;
}

async function saveCharges(bookingId, tableId, accountType) {
    const rows = document.getElementById(tableId).querySelectorAll("tbody tr");
    const insertData = [];
    const deleteIds = [];

    const { data: existingData } = await supabaseClient
        .from("FullLoadBookingCharges")
        .select("ChargesType")
        .eq("ID_FT", bookingId)
        .eq("AccountType", accountType);

    const existingChargeTypes = new Set(existingData?.map(d => d.ChargesType) || []);
    const getNumber = val => (!val || val === "No GST") ? 0 : parseFloat(val) || 0;

    rows.forEach(row => {
        const status = row.dataset.status;
        const cells = row.querySelectorAll("td");
        const chargeType = cells[0].textContent.trim();

        if (status === "new" && !existingChargeTypes.has(chargeType)) {
            insertData.push({
                ID_FT: bookingId,
                LRNumber: document.getElementById("lrNumber").value.trim(),
                ChargesType: chargeType,
                TaxRate: getNumber(cells[1].textContent),
                Quantity: 1,
                PerQtyAmt: getNumber(cells[2].textContent),
                TotalAmount: getNumber(cells[2].textContent),
                CGSTAmt: getNumber(cells[3].textContent),
                SGSTAmt: getNumber(cells[4].textContent),
                IGSTAmt: getNumber(cells[5].textContent),
                TotalGSTAmt: getNumber(cells[6].textContent),
                GrandTotalAmt: getNumber(cells[7].textContent),
                HSNCode: cells[9].textContent || "",
                TaxID: cells[10].textContent || "",
                AccountType: accountType,
                created_by: UserLoginID,
                created_at: localtimeStamp
            });
            existingChargeTypes.add(chargeType);
        }

        if (status === "deleted" && row.dataset.id) {
            deleteIds.push(row.dataset.id);
        }
    });

    const promises = [];
    if (insertData.length > 0) promises.push(supabaseClient.from("FullLoadBookingCharges").insert(insertData));
    if (deleteIds.length > 0) promises.push(supabaseClient.from("FullLoadBookingCharges").delete().in("id", deleteIds));
    if (promises.length > 0) await Promise.all(promises);
}

async function getTariffRate(partyCode, tariffType) {
    const movementType = document.getElementById("movementType").value;
    const modeType = document.getElementById("modeType").value;
    const vehicleType = document.getElementById("vehicleType").value;
    const routeDetails = document.getElementById("routeDetails").value.toLowerCase().trim();
    const chargeWt = parseFloat(document.getElementById("chargeWt").value) || 0;
    const bookingDate = document.getElementById("lrDate").value;

    if (!partyCode || !movementType || !modeType || !vehicleType || !routeDetails) {
        return null;
    }

    const { data, error } = await supabaseClient
        .from("FTL_FCL_Tariff")
        .select("Rate")
        .eq("PartyCode", partyCode)
        .eq("MovementType", movementType)
        .eq("ModeType", modeType)
        .eq("VehicleType", vehicleType)
        .eq("RouteDetails", routeDetails)
        .eq("TariffType", tariffType)
        .gte("CargoWeight", chargeWt)
        .lte("EffectiveDate", bookingDate)
        .order("EffectiveDate", { ascending: false })
        .order("CargoWeight", { ascending: true })
        .limit(1);

    if (error) {
        console.error("Tariff fetch error:", error);
        return null;
    }

    return data?.[0]?.Rate || null;
}

async function applyCustomerTariff() {
    const partyCode = document.getElementById("partyCode").value;
    const rate = await getTariffRate(partyCode, "Sell");

    const amountInput = document.getElementById("customerFreightAmt");
    const chargesInput = document.getElementById("chargesType");

    if (!rate) {
        chargesInput.value = "";
        amountInput.value = "0.00";
        return;
    }

    chargesInput.value = "Freight Amount";
    amountInput.value = rate;

    await addFreightRow("chargesDetailsTable", "chargesType", "customerFreightAmt", "partyDefaultTax");
}

async function applyVendorTariff() {
    const vendorCode = document.getElementById("vendorCode").value;
    const rate = await getTariffRate(vendorCode, "Buy");

    const amountInput = document.getElementById("vendorFreightAmt");
    const chargesInput = document.getElementById("vendorChargesType");

    if (!rate) {
        chargesInput.value = "";
        amountInput.value = "0.00";
        return;
    }

    chargesInput.value = "Freight Amount";
    amountInput.value = rate;

    await addFreightRow("vendorChargesDetailsTable", "vendorChargesType", "vendorFreightAmt", "vendorDefaultTax");
}

["lrDate", "partyCode", "modeType", "movementType", "routeDetails", "vehicleType", "chargeWt", "vendorCode"].forEach(id => {
    document.getElementById(id).addEventListener("change", async () => {
        await Promise.all([applyCustomerTariff(), applyVendorTariff()]);
    });
});

function clearAutoCharges(tableId) {
    document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
        if (row.dataset.auto === "true") row.remove();
    });
}

async function getFixedCharges(accountType = "Sell") {
    const partyCode = accountType === "Sell" ? document.getElementById("partyCode").value : document.getElementById("vendorCode").value;
    const movementType = document.getElementById("movementType").value;
    const modeType = document.getElementById("modeType").value;
    const bookingDate = document.getElementById("lrDate").value;
    const freightAmt = accountType === "Sell" ? parseFloat(document.getElementById("customerFreightAmt").value) || 0 : parseFloat(document.getElementById("vendorFreightAmt").value) || 0;

    if (!partyCode) return;

    const { data } = await supabaseClient
        .from("FixedCharges")
        .select("*")
        .eq("PartyCode", partyCode)
        .eq("FixedChargesType", accountType)
        .lte("EffectiveDate", bookingDate)
        .order("EffectiveDate", { ascending: false });

    if (!data || data.length === 0) return;

    const applicableCharges = [];
    data.forEach(row => {
        if ((row.MovementType === movementType || row.MovementType === "All") &&
            (row.TransitType === "All") &&
            (row.ModeType === modeType || row.ModeType === "All")) {
            let charge = (row.Percentage > 0) ? (freightAmt * row.Percentage) / 100 : 0;
            if (row.Amount > charge) charge = row.Amount;
            applicableCharges.push({ type: row.ChargesType, amount: charge });
        }
    });
    applyFixedCharges(applicableCharges, accountType);
}

function applyFixedCharges(charges, accountType) {
    const tableId = accountType === "Sell" ? "chargesDetailsTable" : "vendorChargesDetailsTable";
    const chargesInput = accountType === "Sell" ? "chargesType" : "vendorChargesType";
    const amountInput = accountType === "Sell" ? "customerFreightAmt" : "vendorFreightAmt";
    const taxInput = accountType === "Sell" ? "partyDefaultTax" : "vendorDefaultTax";

    clearAutoCharges(tableId);

    charges.forEach(ch => {
        document.getElementById(chargesInput).value = ch.type;
        document.getElementById(amountInput).value = ch.amount.toFixed(2);
        addFreightRow(tableId, chargesInput, amountInput, taxInput);

        const rows = document.querySelectorAll(`#${tableId} tbody tr`);
        if (rows.length > 0) rows[rows.length - 1].dataset.auto = "true";
    });
}

async function generateLRNumber() {
    const companyId = localStorage.getItem("CompanyID");
    const companyProfile = await getCompanyProfile(companyId);
    const { data } = await supabaseClient.rpc("generate_lr_number", {
        p_company_id: companyId,
        p_short_code: companyProfile.short_code
    });
    return data;
}

// Handle clicks on the LR Print dropdown options
document.querySelectorAll('.dropdown-menu [data-print-type]').forEach(item => {
    item.addEventListener('click', async (e) => {
        e.preventDefault();

        const printType = e.currentTarget.getAttribute('data-print-type');
        const lrNumberField = document.getElementById("lrNumber");
        const lrNumber = lrNumberField ? lrNumberField.value.trim() : "";

        if (!lrNumber) {
            alert("Please enter or select an LR Number first.");
            return;
        }

        if (printType === 'lr_report') {
            await generateConsignmentNote(lrNumber);
        } else if (printType === 'lr_annexure_Report') {
            await generateConsignmentNote_annexure(lrNumber);
        }
    });
});

document.getElementById("partyName").addEventListener("change", async function () {
    const selectedPartyName = this.value.trim();
    if (!selectedPartyName) { clearOriginFields(); return; }

    const { data: partyData } = await supabaseClient
        .from('PartyDetails')
        .select('PartyCode, PinCode, City, Address')
        .eq('PartyName', selectedPartyName)
        .eq('company_id', CompanyID)
        .maybeSingle();

    if (partyData) {
        document.getElementById("partyCode").value = partyData.PartyCode;
        const { data: addressData } = await supabaseClient
            .from('PartyBillingAddress')
            .select('Address, City, PinCode, State')
            .eq('PartyCode', partyData.PartyCode)
            .eq('company_id', CompanyID)
            .eq('Status', 'Active');

        if (addressData?.length > 1) showAddressSelectionModal(addressData);
        else if (addressData?.length === 1) populateOriginFields(addressData[0].PinCode, addressData[0].City, addressData[0].Address);
        else populateOriginFields(partyData.PinCode, partyData.City, partyData.Address);
    }
});

function populateOriginFields(pincode, city, address) {
    document.getElementById("originPinCode").value = pincode || "";
    document.getElementById("originCity").value = city || "";
    document.getElementById("originAddress").value = address || "";
    document.getElementById("originPinCode").dispatchEvent(new Event('change'));
    applyCustomerTariff();
}

function clearOriginFields() {
    ["partyCode", "originPinCode", "originCity", "originAddress"].forEach(id => document.getElementById(id).value = "");
}

function showAddressSelectionModal(addresses) {
    let modalEl = document.getElementById("addressSelectionModal");
    if (!modalEl) {
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="addressSelectionModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-md">
                <div class="modal-content shadow-lg border-0">
                    <div class="modal-header bg-light pb-2 pt-2">
                        <h6 class="modal-title mb-0">Select Pickup Address</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-0"><div class="list-group list-group-flush" id="addressModalList"></div></div>
                </div>
            </div>
        </div>`);
        modalEl = document.getElementById("addressSelectionModal");
    }

    const listContainer = document.getElementById("addressModalList");
    listContainer.innerHTML = "";

    addresses.forEach(addr => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "list-group-item list-group-item-action p-3";
        btn.innerHTML = `<h6 class="mb-1 text-cap">${addr.City || 'Unknown'} - ${addr.PinCode || ''}</h6><p class="mb-1 small text-muted text-cap">${addr.Address || ''}</p>`;
        btn.onclick = () => {
            populateOriginFields(addr.PinCode, addr.City, addr.Address);
            bootstrap.Modal.getInstance(modalEl).hide();
        };
        listContainer.appendChild(btn);
    });

    new bootstrap.Modal(modalEl).show();
}

function updateShipmentTotals() {
    let totalQty = 0, totalActWt = 0, totalChgWt = 0;
    document.querySelectorAll('#shipmentDetailsTable tbody tr').forEach(tr => {
        totalQty += parseFloat(tr.dataset.qty) || 0;
        totalActWt += parseFloat(tr.dataset.actWt) || 0;
        totalChgWt += parseFloat(tr.dataset.chgWt) || 0;
    });

    document.getElementById('quantity').value = totalQty.toFixed(2);
    document.getElementById('actualWt').value = totalActWt.toFixed(2);
    const chargeWtInput = document.getElementById('chargeWt');
    chargeWtInput.value = totalChgWt.toFixed(2);
    chargeWtInput.dispatchEvent(new Event('change'));
}

function recalculateShipmentSummary() {
    const allRows = shipmentTableBody.querySelectorAll('tr');
    let uniqueCities = new Set(), uniqueRefs = new Set();
    let totalInvoiceValue = 0;

    allRows.forEach(row => {
        if (row.dataset.city) uniqueCities.add(row.dataset.city);
        if (row.dataset.refNo) uniqueRefs.add(row.dataset.refNo);
        totalInvoiceValue += parseFloat(row.dataset.invValue) || 0;
    });

    const firstRow = allRows[0];
    const firstPinCode = firstRow ? firstRow.dataset.pincode : '';
    const firstAddress = firstRow ? firstRow.dataset.address : '';
    const citiesString = Array.from(uniqueCities).join(', ');
    const refsString = Array.from(uniqueRefs).join(', ');

    if (firstRow) {
        const type = firstRow.dataset.type;
        if (type === 'Delivery') {
            document.getElementById('destinationPinCode').value = firstPinCode;
            document.getElementById('destinationCity').value = citiesString;
            document.getElementById('destinationAddress').value = firstAddress;
        } else if (type === 'Pickup') {
            document.getElementById('originPinCode').value = firstPinCode;
            document.getElementById('originCity').value = citiesString;
            document.getElementById('originAddress').value = firstAddress;
        }
    }

    document.getElementById('referenceNumber').value = refsString;
    document.getElementById('invoiceValue').value = totalInvoiceValue.toFixed(2);

    updateShipmentTotals();
}