(function () {
    function clampInt(n, min, max) {
        n = Number.isFinite(n) ? n : 0;
        return Math.max(min, Math.min(max, n));
    }

    function computeQtyClass(qty, okMin, warnMin) {
        if (!Number.isFinite(warnMin)) return 'qty-none';
        if (qty < warnMin) return 'qty-low';
        if (qty < okMin) return 'qty-warn';
        return 'qty-ok';
    }

    function applyQtyChipState(chip, qty) {
        if (!chip) return;

        var okRaw = chip.getAttribute('data-ok-min');
        var warnRaw = chip.getAttribute('data-warn-min');

        var okMin = okRaw !== '' ? parseInt(okRaw, 10) : NaN;
        var warnMin = warnRaw !== '' ? parseInt(warnRaw, 10) : NaN;

        var cls = computeQtyClass(qty, okMin, warnMin);

        chip.textContent = String(qty);
        chip.classList.remove('qty-ok', 'qty-warn', 'qty-low', 'qty-none');
        chip.classList.add(cls);
    }

    // Batch rapid taps per UUID (optimistic updates happen immediately).
    var pendingByUuid = new Map();

    function queueDelta(uuid, delta) {
        var entry = pendingByUuid.get(uuid);
        if (!entry) {
            entry = { delta: 0, timer: null };
            pendingByUuid.set(uuid, entry);
        }

        entry.delta += delta;
        if (entry.timer) return;

        entry.timer = window.setTimeout(function () {
            var payload = pendingByUuid.get(uuid);
            if (!payload) return;
            pendingByUuid.delete(uuid);

            var sendDelta = payload.delta;
            sendDelta = clampInt(sendDelta, -50, 50);
            if (sendDelta === 0) return;

            var body = new URLSearchParams();
            body.set('delta', String(sendDelta));

            fetch('/parts/' + encodeURIComponent(uuid) + '/quantity_delta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                credentials: 'same-origin',
                body: body.toString()
            })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.text();
                })
                .then(function (html) {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(html, 'text/html');
                    var newRow = doc.body && doc.body.firstElementChild;
                    if (!newRow || !newRow.id) return;

                    var oldRow = document.getElementById(newRow.id);
                    if (oldRow && oldRow.parentNode) {
                        oldRow.parentNode.replaceChild(newRow, oldRow);
                    }
                })
                .catch(function () {
                    // Best-effort resync on failure.
                    fetch('/parts/' + encodeURIComponent(uuid) + '/row', { credentials: 'same-origin' })
                        .then(function (r) { return r.ok ? r.text() : ''; })
                        .then(function (html) {
                            if (!html) return;
                            var parser = new DOMParser();
                            var doc = parser.parseFromString(html, 'text/html');
                            var newRow = doc.body && doc.body.firstElementChild;
                            if (!newRow || !newRow.id) return;
                            var oldRow = document.getElementById(newRow.id);
                            if (oldRow && oldRow.parentNode) {
                                oldRow.parentNode.replaceChild(newRow, oldRow);
                            }
                        })
                        .catch(function () { });
                });
        }, 150);
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('button.qty-step');
        if (!btn) return;

        var uuid = btn.getAttribute('data-qty-uuid');
        var deltaRaw = btn.getAttribute('data-qty-delta');
        if (!uuid || !deltaRaw) return;

        var delta = parseInt(deltaRaw, 10);
        if (!Number.isFinite(delta) || delta === 0) return;

        // Prevent any form/button default behavior.
        e.preventDefault();
        e.stopPropagation();

        var row = document.getElementById('row-' + uuid);
        if (!row) return;

        var chip = row.querySelector('.qty-chip[data-qty-chip="1"]') || row.querySelector('.qty-chip');
        if (!chip) return;

        var currentQty = parseInt((chip.textContent || '0').trim(), 10);
        if (!Number.isFinite(currentQty)) currentQty = 0;

        var newQty = Math.max(currentQty + delta, 0);
        applyQtyChipState(chip, newQty);

        queueDelta(uuid, delta);
    }, true);
})();
