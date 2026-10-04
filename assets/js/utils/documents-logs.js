/* ============================================================
   DocumentsLogsPanel
   Shared controller for public."DocumentsLogs"
   Works for BOTH vehicles and drivers by swapping entityType.
   ============================================================ */
(() => {
    'use strict';

    const TABLE = 'DocumentsLogs';       // ← renamed
    const STORAGE_BUCKET = 'vehicle-documents';   // keep or rename to 'documents'
    const MAX_FILE_BYTES = 5 * 1024 * 1024;

    // ---- Expiry classification -------------------------------------
    function expiryMeta(dateStr) {
        if (!dateStr) return { cls: 'text-bg-secondary', label: '—', days: null };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const exp = new Date(dateStr + 'T00:00:00');
        const days = Math.round((exp - today) / 86400000);

        if (days < 0) return { cls: 'text-bg-danger', label: `Expired ${Math.abs(days)}d ago`, days };
        if (days <= 30) return { cls: 'text-bg-warning', label: `${days}d left`, days };
        return { cls: 'text-bg-success', label: exp.toLocaleDateString(), days };
    }

    function safeName(name) {
        return name.replace(/[^\w.\-]+/g, '_').slice(-100);
    }

    // ---- Main class -----------------------------------------------
    class DocumentsLogsPanel {
        constructor(opts) {
            this.root = opts.root;
            this.entityType = opts.entityType;   // 'VEHICLE' | 'DRIVER'
            this.entityId = opts.entityId;
            this.companyId = opts.companyId;
            this.sb = opts.supabase;

            this.form = this.root.querySelector('#docAddForm');
            this.tbody = this.root.querySelector('#docTableBody');
            this.loader = this.root.querySelector('#docLoader');
            this.cancelBtn = this.root.querySelector('#docCancelBtn');
            this.saveBtn = this.root.querySelector('#docSaveBtn');
            this.docIdInput = this.root.querySelector('#docId');
            this.countBadge = document.querySelector('#docCountBadge');
            this.fileInput = this.root.querySelector('#docFile');

            this.rows = [];

            this.form.addEventListener('submit', e => this.#onSubmit(e));
            this.cancelBtn.addEventListener('click', () => this.#resetForm());
            this.tbody.addEventListener('click', e => this.#onTableClick(e));
        }

        setEntity(entityType, entityId) {
            this.entityType = entityType;
            this.entityId = entityId;
            this.#resetForm();
            return this.load();
        }

        async load() {
            this.#setLoading(true);
            try {
                const col = this.entityType === 'VEHICLE' ? 'vehicle_id' : 'driver_id';
                const { data, error } = await this.sb
                    .from(TABLE)                                // ← renamed
                    .select('*')
                    .eq(col, this.entityId)
                    .order('expiry_date', { ascending: true, nullsFirst: false });

                if (error) throw error;
                this.rows = data || [];
                this.#render();
                this.#updateBadge();
            } catch (err) {
                window.showToast?.(err.message || 'Failed to load documents', 'error');
                this.#renderEmpty('Could not load documents.');
            } finally {
                this.#setLoading(false);
            }
        }

        async #onSubmit(e) {
            e.preventDefault();
            if (!this.form.checkValidity()) {
                this.form.classList.add('was-validated');
                return;
            }
            if (!this.entityId) {
                window.showToast?.('Save the master record first.', 'error');
                return;
            }

            this.saveBtn.disabled = true;
            const originalBtnHTML = this.saveBtn.innerHTML;
            this.saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving…';

            try {
                const fd = new FormData(this.form);
                const editingId = fd.get('document_id') || null;

                // --- 1. Upload file if provided ---
                let filePath = null;
                const file = this.fileInput.files[0];
                if (file) {
                    if (file.size > MAX_FILE_BYTES) throw new Error('File exceeds 5 MB limit.');
                    filePath = await this.#uploadFile(file);
                }

                // --- 2. Build payload ---
                const payload = {
                    document_type: (fd.get('document_type') || '').trim(),
                    document_number: (fd.get('document_number') || '').trim() || null,
                    issue_date: fd.get('issue_date') || null,
                    expiry_date: fd.get('expiry_date') || null,
                    issuing_authority: (fd.get('issuing_authority') || '').trim() || null,
                    cost: fd.get('cost') ? Number(fd.get('cost')) : null,
                    notes: (fd.get('notes') || '').trim() || null,
                    updated_by: window.currentUserId || null,
                    updated_at: new Date().toISOString(),
                };

                if (!editingId) {
                    Object.assign(payload, {
                        vehicle_id: this.entityType === 'VEHICLE' ? this.entityId : null,
                        driver_id: this.entityType === 'DRIVER' ? Number(this.entityId) : null,
                        created_by: window.currentUserId || null,
                    });
                }
                if (filePath) payload.document_file_path = filePath;

                // --- 3. Insert or Update ---
                const query = editingId
                    ? this.sb.from(TABLE).update(payload).eq('document_id', editingId)
                    : this.sb.from(TABLE).insert(payload);

                const { error } = await query;
                if (error) throw error;

                window.showToast?.(editingId ? 'Document updated.' : 'Document added.', 'success');
                this.#resetForm();
                await this.load();
            } catch (err) {
                window.showToast?.(err.message || 'Save failed', 'error');
            } finally {
                this.saveBtn.disabled = false;
                this.saveBtn.innerHTML = originalBtnHTML;
            }
        }

        async #onTableClick(e) {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const id = btn.dataset.id;
            const action = btn.dataset.action;

            if (action === 'edit') return this.#editRow(id);
            if (action === 'delete') return this.#deleteRow(id);
            if (action === 'view') return this.#viewFile(id);
        }

        #editRow(id) {
            const row = this.rows.find(r => String(r.document_id) === String(id));
            if (!row) return;

            this.docIdInput.value = row.document_id;
            this.#setVal('docType', row.document_type);
            this.#setVal('docNumber', row.document_number);
            this.#setVal('docIssueDate', row.issue_date);
            this.#setVal('docExpiryDate', row.expiry_date);
            this.#setVal('docAuthority', row.issuing_authority);
            this.#setVal('docCost', row.cost);
            this.#setVal('docNotes', row.notes);

            this.saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Update Document';
            this.cancelBtn.classList.remove('d-none');
            this.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        async #deleteRow(id) {
            if (!confirm('Delete this document? This cannot be undone.')) return;
            try {
                const row = this.rows.find(r => String(r.document_id) === String(id));
                if (row?.document_file_path) {
                    await this.sb.storage.from(STORAGE_BUCKET).remove([row.document_file_path]);
                }
                const { error } = await this.sb
                    .from(TABLE)                              // ← renamed
                    .delete()
                    .eq('document_id', id);
                if (error) throw error;
                window.showToast?.('Document deleted.', 'success');
                await this.load();
            } catch (err) {
                window.showToast?.(err.message || 'Delete failed', 'error');
            }
        }

        async #viewFile(id) {
            const row = this.rows.find(r => String(r.document_id) === String(id));
            if (!row?.document_file_path) return;
            const { data, error } = await this.sb.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(row.document_file_path, 60 * 5);
            if (error) return window.showToast?.(error.message, 'error');
            window.open(data.signedUrl, '_blank', 'noopener');
        }

        #render() {
            if (!this.rows.length) return this.#renderEmpty();

            const frag = document.createDocumentFragment();
            for (const r of this.rows) {
                const exp = expiryMeta(r.expiry_date);
                const tr = document.createElement('tr');

                tr.innerHTML = `
          <td class="fw-semibold">${escapeHtml(r.document_type || '—')}</td>
          <td class="text-muted small">${escapeHtml(r.document_number || '—')}</td>
          <td class="text-muted small">${escapeHtml(r.issuing_authority || '—')}</td>
          <td class="text-muted small">${fmtDate(r.issue_date)}</td>
          <td><span class="badge ${exp.cls} expiry-chip">${exp.label}</span></td>
          <td class="text-end">${r.cost != null ? '₹' + Number(r.cost).toLocaleString('en-IN') : '—'}</td>
          <td class="text-center">
            ${r.document_file_path
                        ? `<button class="btn btn-sm btn-outline-secondary" data-action="view" data-id="${r.document_id}" title="View file"><i class="bi bi-paperclip"></i></button>`
                        : '<span class="text-muted small">—</span>'}
          </td>
          <td class="text-center">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" data-action="edit"   data-id="${r.document_id}" title="Edit"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-danger"  data-action="delete" data-id="${r.document_id}" title="Delete"><i class="bi bi-trash"></i></button>
            </div>
          </td>
        `;
                frag.appendChild(tr);
            }
            this.tbody.replaceChildren(frag);
        }

        #renderEmpty(msg = 'No documents attached yet.') {
            this.tbody.innerHTML = `
        <tr>
          <td colspan="8" class="vm-empty">
            <i class="bi bi-file-earmark-text"></i>
            ${escapeHtml(msg)}
          </td>
        </tr>`;
        }

        async #uploadFile(file) {
            const ts = Date.now();
            const path = `${this.companyId}/${this.entityType}/${this.entityId}/${ts}_${safeName(file.name)}`;
            const { error } = await this.sb.storage
                .from(STORAGE_BUCKET)
                .upload(path, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            return path;
        }

        #resetForm() {
            this.form.reset();
            this.form.classList.remove('was-validated');
            this.docIdInput.value = '';
            this.saveBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Add Document';
            this.cancelBtn.classList.add('d-none');
        }

        #setVal(id, v) {
            const el = this.root.querySelector('#' + id);
            if (el) el.value = v ?? '';
        }

        #setLoading(on) { this.loader.classList.toggle('d-none', !on); }
        #updateBadge() { if (this.countBadge) this.countBadge.textContent = this.rows.length; }
    }

    // ---- Utilities ------------------------------------------------
    function fmtDate(d) {
        if (!d) return '—';
        return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    window.DocumentsLogsPanel = DocumentsLogsPanel;
})();