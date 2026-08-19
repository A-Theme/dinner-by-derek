'use strict';
const express = require('express');
const { db, settings } = require('../db');
const config = require('../config');
const auth = require('../auth');
const T = require('../time');
const M = require('../menu');
const A = require('../allergens');
const D = require('../delivery');
const O = require('../orders');
const FB = require('../facebook');
const mailer = require('../mailer');
const IF = require('../itemform');
const V = require('../views/admin');
const { html, raw, money } = require('../html');

const router = express.Router();
const tz = () => settings.get('timezone', 'America/Toronto');
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(auth.required);

function back(res, req, ok, err) {
  const u = new URL(req.get('referer') || '/admin', config.baseUrl);
  u.searchParams.delete('ok'); u.searchParams.delete('err');
  if (ok) u.searchParams.set('ok', ok);
  if (err) u.searchParams.set('err', err);
  res.redirect(303, u.pathname + u.search);
}

/* ======================= OTHER OPTIONS (level 3) ======================== */
router.get('/other-options', (req, res) => {
  const items = M.standingItems({ activeOnly: false });
  const editing = req.query.edit
    ? db.prepare('SELECT * FROM standing_items WHERE id = ?').get(Number(req.query.edit))
    : null;
  const saved = req.query.saved === '1';
  const savedState = editing ? A.reviewState(editing) : null;
  const blank = {
    name: '', subcategory: 'Mains', description: '', allergens: '[]', dismissed: '[]',
    availability: 'every_service_day', weekdays: '[]', full_on: 1, active: 1,
  };

  const body = html`
    <h1>Other Options</h1>
    <p class="also">These stay on the menu week after week. You never retype them.
      Changes here reach customers <strong>immediately</strong> — there is no publish step.</p>

    <table class="dtable">
      <thead><tr><th>Item</th><th>Available</th><th>Prices</th><th>Status</th><th></th></tr></thead>
      <tbody>
      ${items.map((i) => {
        const wd = i.availability === 'every_service_day' ? 'Every service day'
          : (JSON.parse(i.weekdays || '[]').map((w) => T.WEEKDAY_LABELS[w].slice(0, 3)).join(', ') || 'No days set');
        const prices = [
          i.full_on && i.full_price != null ? `${i.full_label} ${money(i.full_price)}` : null,
          i.single_on && i.single_price != null ? `${i.single_label} ${money(i.single_price)}` : null,
        ].filter(Boolean).join(' · ') || '—';
        return html`<tr>
          <td data-label="Item"><strong>${i.name}</strong><br><span class="variant__label">${i.subcategory}</span></td>
          <td data-label="Available">${wd}</td>
          <td data-label="Prices">${prices}</td>
          <td data-label="Status">
            ${i.active ? V.reviewFlag(i, i.name) : html`<span class="flag flag--warn">Hidden from customers</span>`}
          </td>
          <td data-label="">
            <a class="btn btn--secondary" href="/admin/other-options?edit=${i.id}">Edit</a>
            <form method="post" action="/admin/other-options/${i.id}/duplicate" style="display:inline">
              <button class="btn btn--secondary" type="submit">Duplicate</button></form>
            ${V.confirmForm({
              action: `/admin/other-options/${i.id}/toggle`,
              buttonLabel: i.active ? 'Hide' : 'Show',
              message: i.active
                ? `Hide "${i.name}" from the customer menu right now? Orders that already include it stay exactly as they are.`
                : `Put "${i.name}" back on the customer menu right now?`,
            })}
          </td></tr>`;
      })}
      </tbody>
    </table>

    <div class="card" style="margin-top:var(--dbd-sp-5)">
      <h2>${editing ? `Edit ${editing.name}` : 'Add an item'}</h2>
      ${saved && editing ? html`
        <!-- A confirmation that outlasts a toast. The prices below and in the
             table above are read back from the database, so this says what was
             stored rather than what was typed — and for an item still waiting
             on its allergen review it says the part that matters most, which
             is that customers cannot see any of it yet. -->
        <div class="card card--warn" style="margin-bottom:var(--dbd-sp-4)">
          <strong>Saved.</strong>
          ${savedState.ok
            ? html` These are the prices customers see now.`
            : html` ${A.reviewMessage(editing.name, savedState)}
              <br><strong>Until that is done this item stays off the customer menu</strong>,
              at any price.`}
          <br><span class="variant__label">Stored just now:
            ${editing.full_on && editing.full_price != null
              ? html`${editing.full_label} ${money(editing.full_price)}` : 'no full size'}${
              editing.single_on && editing.single_price != null
                ? html` · ${editing.single_label} ${money(editing.single_price)}` : ''}</span>
        </div>` : ''}
      ${editing ? html`<div class="notice notice--strong">
        Saving changes here updates what customers see straight away, including on the
        week that's already published.</div>` : ''}
      <form method="post" action="/admin/other-options${editing ? `/${editing.id}` : ''}"
            data-confirm="${editing ? 'Save these changes? They appear on the live customer menu immediately. Orders already placed keep the name and price they had when they were ordered.' : 'Add this item to the live menu?'}">
        ${V.itemEditor({ prefix: 'si', item: editing || blank, nameLabel: 'Item name' })}
        <label for="sub">Section</label>
        <select id="sub" name="si_subcategory">
          ${M.SUBCATEGORY_ORDER.map((s) => html`<option value="${s}"${(editing ? editing.subcategory : 'Mains') === s ? ' selected' : ''}>${s}</option>`)}
        </select>
        <fieldset>
          <legend>When it's available</legend>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="radio" name="si_availability" value="every_service_day" style="width:22px;height:22px"
              ${(editing ? editing.availability : 'every_service_day') === 'every_service_day' ? ' checked' : ''}>
            Every service day</label>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="radio" name="si_availability" value="weekdays" style="width:22px;height:22px"
              ${editing && editing.availability === 'weekdays' ? ' checked' : ''}>
            Only certain days</label>
          <div style="margin-top:var(--dbd-sp-2)">
          ${T.WEEKDAYS.map((w) => {
            const on = editing ? JSON.parse(editing.weekdays || '[]').includes(w) : false;
            return html`<label style="display:inline-flex;gap:var(--dbd-sp-2);align-items:center;margin-right:var(--dbd-sp-4)">
              <input type="checkbox" name="si_weekdays" value="${w}" style="width:22px;height:22px"${on ? ' checked' : ''}>
              ${T.WEEKDAY_LABELS[w].slice(0, 3)}</label>`;
          })}</div>
        </fieldset>
        <button class="btn btn--primary" type="submit">${editing ? 'Save changes' : 'Add item'}</button>
        ${editing ? html`<a class="btn btn--secondary" href="/admin/other-options">Cancel</a>` : ''}
      </form>
    </div>`;

  res.type('html').send(String(V.shell({ title: 'Other Options', body, current: 'other' })));
});

function standingFields(body) {
  const it = IF.parse(body, 'si');
  const availability = body.si_availability === 'weekdays' ? 'weekdays' : 'every_service_day';
  return {
    ...it,
    subcategory: M.SUBCATEGORY_ORDER.includes(body.si_subcategory) ? body.si_subcategory : 'Mains',
    availability,
    weekdays: JSON.stringify(IF.arr(body.si_weekdays).map(String)),
  };
}

router.post('/other-options', (req, res) => {
  const f = standingFields(req.body);
  if (!f.name) return back(res, req, null, 'Give the item a name first.');
  db.prepare(`INSERT INTO standing_items
    (name, subcategory, description, photo, halal, allergens, dismissed, ack, ack_of,
     availability, weekdays, full_on, full_label, full_price, full_cap,
     single_on, single_label, single_price, single_cap, sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      (SELECT COALESCE(MAX(sort),0)+1 FROM standing_items))`)
    .run(f.name, f.subcategory, f.description, f.photo, f.halal, f.allergens, f.dismissed,
      f.ack, f.ack_of, f.availability, f.weekdays, f.full_on, f.full_label, f.full_price,
      f.full_cap, f.single_on, f.single_label, f.single_price, f.single_cap);
  res.redirect(303, `/admin/other-options?ok=${encodeURIComponent(`${f.name} added.${f.ack ? '' : ' It stays hidden until you complete its allergen review.'}`)}`);
});

router.post('/other-options/:id', (req, res) => {
  const f = standingFields(req.body);
  db.prepare(`UPDATE standing_items SET name=?, subcategory=?, description=?, photo=?,
    halal=?, allergens=?, dismissed=?, ack=?, ack_of=?, availability=?, weekdays=?,
    full_on=?, full_label=?, full_price=?, full_cap=?, single_on=?, single_label=?,
    single_price=?, single_cap=? WHERE id=?`)
    .run(f.name, f.subcategory, f.description, f.photo, f.halal, f.allergens, f.dismissed,
      f.ack, f.ack_of, f.availability, f.weekdays, f.full_on, f.full_label, f.full_price,
      f.full_cap, f.single_on, f.single_label, f.single_price, f.single_cap,
      Number(req.params.id));
  const item = db.prepare('SELECT * FROM standing_items WHERE id=?').get(Number(req.params.id));
  const st = A.reviewState(item);
  /* Back to the item, not away from it. Landing on the list closed the editor,
     dropped the owner at the top of a table and left a toast at the bottom of
     the screen for three seconds to carry the whole story — including, for an
     unreviewed item, the fact that none of it is visible to customers yet.
     The editor reopens with what was actually stored, so the new prices are on
     screen rather than taken on trust. */
  res.redirect(303, `/admin/other-options?edit=${item.id}&saved=1&ok=${encodeURIComponent(
    st.ok ? `${f.name} updated on the live menu. Existing orders are unchanged.`
      : A.reviewMessage(f.name, st))}`);
});

router.post('/other-options/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const it = db.prepare('SELECT * FROM standing_items WHERE id=?').get(id);
  if (!it) return back(res, req, null, 'That item no longer exists.');
  db.prepare('UPDATE standing_items SET active = NOT active WHERE id=?').run(id);
  back(res, req, it.active
    ? `${it.name} is hidden from customers. You can put it back any time.`
    : `${it.name} is back on the menu.`);
});

router.post('/other-options/:id/duplicate', (req, res) => {
  const it = db.prepare('SELECT * FROM standing_items WHERE id=?').get(Number(req.params.id));
  if (!it) return back(res, req, null, 'That item no longer exists.');
  db.prepare(`INSERT INTO standing_items
    (name, subcategory, description, photo, halal, allergens, dismissed, ack, ack_of,
     availability, weekdays, active, full_on, full_label, full_price, full_cap,
     single_on, single_label, single_price, single_cap, sort)
    VALUES (?,?,?,?,?,?,?,0,NULL,?,?,0,?,?,?,?,?,?,?,?,
      (SELECT COALESCE(MAX(sort),0)+1 FROM standing_items))`)
    .run(`${it.name} (copy)`, it.subcategory, it.description, it.photo, it.halal,
      it.allergens, it.dismissed, it.availability, it.weekdays, it.full_on,
      it.full_label, it.full_price, it.full_cap, it.single_on, it.single_label,
      it.single_price, it.single_cap);
  back(res, req, 'Copied. The copy is hidden until you review its allergens and show it.');
});

/* ============================== ORDERS ================================== */
router.get('/orders', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.date) { where.push('service_date = ?'); args.push(req.query.date); }
  if (req.query.method) { where.push('method = ?'); args.push(req.query.method); }
  if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
  if (req.query.location) { where.push('location_id = ?'); args.push(Number(req.query.location)); }
  if (req.query.q) {
    where.push('(name LIKE ? OR phone LIKE ?)');
    args.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  const sql = `SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE status WHEN 'late_request' THEN 0 ELSE 1 END, service_date DESC, id DESC LIMIT 400`;
  const orders = db.prepare(sql).all(...args);

  const dates = db.prepare('SELECT DISTINCT service_date FROM orders ORDER BY service_date DESC LIMIT 40').all();
  const qs = new URLSearchParams(req.query).toString();

  const body = html`
    <h1>Orders</h1>
    <form method="get" action="/admin/orders" class="card no-print">
      <div class="dl-row">
        <select name="date" style="flex:1 1 150px">
          <option value="">All service days</option>
          ${dates.map((d) => html`<option value="${d.service_date}"${req.query.date === d.service_date ? ' selected' : ''}>${T.fmtDayShort(d.service_date, tz())}</option>`)}
        </select>
        <select name="method" style="flex:1 1 120px">
          <option value="">Pickup and delivery</option>
          <option value="pickup"${req.query.method === 'pickup' ? ' selected' : ''}>Pickup only</option>
          <option value="delivery"${req.query.method === 'delivery' ? ' selected' : ''}>Delivery only</option>
        </select>
        <select name="location" style="flex:1 1 150px">
          <option value="">All locations</option>
          ${M.activeLocations().map((l) => html`<option value="${l.id}"${Number(req.query.location) === l.id ? ' selected' : ''}>${l.name}</option>`)}
        </select>
        <input type="text" name="q" placeholder="Name or phone" value="${req.query.q || ''}" style="flex:1 1 150px">
        <button class="btn btn--secondary" type="submit">Filter</button>
      </div>
      <p class="also">Downloads below use the filters you've set here.</p>
      <div class="dl-row">
        <a class="btn btn--secondary" href="/admin/export/orders.csv?${qs}">Orders CSV</a>
        ${req.query.date ? html`
          <a class="btn btn--secondary" href="/admin/sheet/kitchen/${req.query.date}">Kitchen sheet</a>
          <a class="btn btn--secondary" href="/admin/sheet/pickup/${req.query.date}">Pickup sheet</a>
          <a class="btn btn--secondary" href="/admin/sheet/delivery/${req.query.date}">Delivery run</a>` : ''}
      </div>
    </form>

    ${orders.length ? orders.map((o) => {
      const lines = O.linesOf(o.id);
      return html`<div class="card">
        <div class="dl-row" style="justify-content:space-between;align-items:baseline">
          <div>
            <strong>${o.name}</strong> · ${o.phone}
            ${o.status === 'late_request' ? html`<span class="flag flag--stop"> LATE REQUEST</span>` : ''}
            <br><span class="variant__label">${T.fmtDayLong(o.service_date, tz())} · ${o.ref} · ${o.placed_at} UTC</span>
          </div>
          <div class="tile__n" style="font-size:var(--dbd-step-2)">${money(o.total)}</div>
        </div>

        ${o.allergy_notes ? html`
          <div class="notice notice--strong allergy-note"><strong>Allergy notes:</strong> ${o.allergy_notes}</div>` : ''}

        <ul>${lines.map((l) => html`<li>${l.qty} × ${l.item_name}
          <span class="variant__label">(${l.variant_label}, ${money(l.unit_price)})</span></li>`)}</ul>

        <p class="variant__label">Food ${money(o.subtotal)}${o.method === 'delivery' ? ` · Delivery ${money(o.delivery_fee)}` : ''}
          ${o.payment_method ? html` · Paying by <strong>${O.PAYMENT_LABEL(o.payment_method)}</strong>` : ''}
          ${o.paid ? html` · <span class="flag flag--ok">Paid</span>` : ''}</p>
        <p>${o.method === 'pickup'
          ? html`<strong>Pickup</strong> ${o.location_name}, anytime ${o.pickup_window}`
          : html`<strong>Delivery</strong> ${o.addr_line}${o.addr_unit ? `, ${o.addr_unit}` : ''}, ${o.postal_norm}
              ${o.addr_notes ? html`<br><span class="variant__label">${o.addr_notes}</span>` : ''}`}</p>

        <div class="dl-row no-print">
          ${o.status === 'late_request' ? html`
            <form method="post" action="/admin/orders/${o.id}/decide" style="display:inline">
              <input type="hidden" name="decision" value="confirmed">
              <button class="btn btn--primary" type="submit">Confirm this late order</button></form>
            <form method="post" action="/admin/orders/${o.id}/decide" style="display:inline"
              data-confirm="Decline this late request? ${o.name} will get an email saying you couldn't fit it in.">
              <input type="hidden" name="decision" value="declined">
              <button class="btn btn--secondary" type="submit">Decline</button></form>` : ''}
          <form method="post" action="/admin/orders/${o.id}/flag" style="display:inline">
            <input type="hidden" name="field" value="paid">
            <button class="btn btn--secondary" type="submit">${o.paid ? 'Mark as unpaid' : 'Mark as paid'}</button></form>
          <form method="post" action="/admin/orders/${o.id}/flag" style="display:inline">
            <input type="hidden" name="field" value="fulfilled">
            <button class="btn btn--secondary" type="submit">
              ${o.fulfilled ? 'Undo' : (o.method === 'pickup' ? 'Mark as picked up' : 'Mark as delivered')}</button></form>
        </div>
      </div>`;
    }) : html`<div class="card"><p>No orders match those filters.</p></div>`}`;

  res.type('html').send(String(V.shell({ title: 'Orders', body, current: 'orders' })));
});

router.post('/orders/:id/flag', (req, res) => {
  const field = req.body.field === 'paid' ? 'paid' : 'fulfilled';
  const id = Number(req.params.id);
  db.prepare(`UPDATE orders SET ${field} = NOT ${field} WHERE id = ?`).run(id);
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  back(res, req, field === 'paid'
    ? (o.paid ? 'Marked as paid.' : 'Marked as unpaid again.')
    : (o.fulfilled ? 'Marked as handed over.' : 'Undone.'));
});

router.post('/orders/:id/decide', (req, res) => {
  const id = Number(req.params.id);
  const decision = req.body.decision === 'confirmed' ? 'confirmed' : 'declined';
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (!o) return back(res, req, null, 'That order no longer exists.');
  db.prepare('UPDATE orders SET status=? WHERE id=?').run(decision, id);
  const updated = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  /* Same rule as the order emails: the decision is already recorded, so a
     failure here must not undo it — but the page is about to tell Derek the
     customer has been emailed, and if that turns out to be untrue the log is
     the only place it can say so. */
  mailer.lateDecisionEmail(updated, O.linesOf(id), decision).catch((e) =>
    console.error(`[mail] late-request ${decision} email failed for order ${updated.ref}:`,
      (e && e.message) || e));
  back(res, req, decision === 'confirmed'
    ? `Confirmed. ${o.name} has been emailed.`
    : `Declined. ${o.name} has been emailed.`);
});

/* ======================= LOCATIONS & DELIVERY =========================== */
router.get('/locations', (req, res) => {
  const locs = db.prepare('SELECT * FROM locations ORDER BY sort, id').all();
  const fsas = D.fsaUsage();
  const zones = db.prepare('SELECT * FROM zones ORDER BY name').all();
  // Zones that actually have areas in them. A zone's fee overrides the flat
  // fee, so the Delivery card has to say so rather than let the owner set a
  // price that quietly applies to nothing.
  const zoned = db.prepare(`SELECT z.name, z.fee, COUNT(f.code) n FROM zones z
    JOIN fsas f ON f.zone_id = z.id GROUP BY z.id ORDER BY z.name`).all();

  const body = html`
    <h1>Locations &amp; Delivery</h1>

    <div class="card">
      <h2>Pickup locations</h2>
      ${locs.map((l) => html`
        <form method="post" action="/admin/locations/${l.id}" style="border-bottom:1px solid var(--dbd-rule-olive);padding-bottom:var(--dbd-sp-3);margin-bottom:var(--dbd-sp-3)">
          <input type="text" name="name" value="${l.name}" placeholder="Name">
          <input type="text" name="address" value="${l.address}" placeholder="Full address">
          <input type="text" name="notes" value="${l.notes}" placeholder="Notes, e.g. side door, ring bell">
          <button class="btn btn--secondary" type="submit">Save</button>
          ${V.confirmForm({
            action: `/admin/locations/${l.id}/toggle`,
            buttonLabel: l.active ? 'Stop offering this location' : 'Offer this location again',
            message: l.active
              ? `Stop offering "${l.name}" at checkout? Orders already placed for it keep the address exactly as it was.`
              : `Offer "${l.name}" at checkout again?`,
          })}
          ${l.active ? '' : html`<span class="flag flag--warn">Not offered at checkout</span>`}
        </form>`)}
      <form method="post" action="/admin/locations">
        <h3 class="subhead">Add a location</h3>
        <input type="text" name="name" placeholder="Name" required>
        <input type="text" name="address" placeholder="Full address">
        <input type="text" name="notes" placeholder="Notes">
        <button class="btn btn--primary" type="submit">Add location</button>
      </form>
    </div>

    <div class="card">
      <h2>Pickup window</h2>
      <p class="also">Customers can come any time within this window — there's no time slot to book.</p>
      <form method="post" action="/admin/settings/pickup"
        data-confirm="Change the pickup window? It applies to every future service day. Orders already placed keep the window they were given.">
        <div class="stack2">
          <div><label for="pstart">Starts</label>
            <input type="time" id="pstart" name="pickup_start" value="${settings.get('pickup_start')}"></div>
          <div><label for="pend">Ends</label>
            <input type="time" id="pend" name="pickup_end" value="${settings.get('pickup_end')}"></div>
        </div>
        <button class="btn btn--primary" type="submit">Save pickup window</button>
      </form>
    </div>

    <div class="card">
      <h2>Delivery</h2>
      <form method="post" action="/admin/settings/delivery">
        <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
          <input type="checkbox" name="delivery_enabled" value="1" style="width:22px;height:22px"${settings.getInt('delivery_enabled') ? ' checked' : ''}>
          Offer delivery</label>
        <label for="dfee">Delivery fee</label>
        <input type="text" id="dfee" name="delivery_fee" inputmode="decimal" value="${(settings.getInt('delivery_fee') / 100).toFixed(2)}">
        <label for="dmin">Minimum food subtotal for delivery (0 for none)</label>
        <input type="text" id="dmin" name="delivery_min" inputmode="decimal" value="${(settings.getInt('delivery_min') / 100).toFixed(2)}">
        <label for="dwin">Delivery window shown to customers</label>
        <input type="text" id="dwin" name="delivery_window" value="${settings.get('delivery_window')}">
        <button class="btn btn--primary" type="submit">Save delivery settings</button>
      </form>
      <p class="also">Changing the fee never changes the fee stored on an order that's already in.</p>
      ${zoned.length ? html`
        <div class="notice notice--strong">
          <strong>This fee does not apply to every area.</strong>
          ${zoned.length} postal code${zoned.length === 1 ? ' is' : 's are'} grouped into a zone
          with its own fee, and a zone's fee wins: ${zoned.map((z) => `${z.name} — ${money(z.fee)}`).join(', ')}.
          Those areas are charged the zone fee no matter what you type above.
          Set an area back to <em>Flat fee</em> below to have it follow this box.
        </div>` : ''}
    </div>

    <div class="card">
      <h2>Where we deliver</h2>
      <p class="also">The first three characters of a postal code. Add one here and it works
        immediately — nothing to redeploy.</p>
      <table class="dtable">
        <thead><tr><th>Area</th><th>Zone</th><th>Fee</th><th>Orders</th><th></th></tr></thead>
        <tbody>${fsas.map((f) => html`<tr>
          <td data-label="Area"><strong>${f.code}</strong></td>
          <td data-label="Zone">${f.zone_name || 'Flat fee'}</td>
          <td data-label="Fee">${f.zone_fee != null ? money(f.zone_fee) : money(settings.getInt('delivery_fee'))}</td>
          <td data-label="Orders">${f.uses}</td>
          <td data-label="">${V.confirmForm({
            action: '/admin/fsa/remove',
            buttonLabel: 'Remove',
            hidden: { code: f.code },
            message: `Stop delivering to ${f.code}? ${f.uses} order${f.uses === 1 ? '' : 's'} used it before. Those orders are not changed.`,
          })}</td></tr>`)}</tbody>
      </table>
      <form method="post" action="/admin/fsa/add">
        <div class="dl-row">
          <input type="text" name="code" placeholder="e.g. N2L" maxlength="3" style="flex:1 1 100px" required>
          <select name="zone_id" style="flex:1 1 150px">
            <option value="">Flat fee</option>
            ${zones.map((z) => html`<option value="${z.id}">${z.name} — ${money(z.fee)}</option>`)}
          </select>
          <button class="btn btn--primary" type="submit">Add area</button>
        </div>
      </form>
    </div>`;

  res.type('html').send(String(V.shell({ title: 'Locations & Delivery', body, current: 'locations' })));
});

router.post('/locations', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return back(res, req, null, 'Give the location a name first.');
  db.prepare('INSERT INTO locations (name,address,notes,sort) VALUES (?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM locations))')
    .run(name, String(req.body.address || '').trim(), String(req.body.notes || '').trim());
  back(res, req, `${name} added.`);
});

router.post('/locations/:id', (req, res) => {
  db.prepare('UPDATE locations SET name=?, address=?, notes=? WHERE id=?')
    .run(String(req.body.name || '').trim(), String(req.body.address || '').trim(),
      String(req.body.notes || '').trim(), Number(req.params.id));
  back(res, req, 'Location saved.');
});

router.post('/locations/:id/toggle', (req, res) => {
  db.prepare('UPDATE locations SET active = NOT active WHERE id=?').run(Number(req.params.id));
  back(res, req, 'Location updated. Existing orders are unchanged.');
});

router.post('/fsa/add', (req, res) => {
  const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]\d[A-Z]$/.test(code)) {
    return back(res, req, null, 'That doesn\'t look like the first three characters of a postal code. Try something like N2L.');
  }
  db.prepare('INSERT OR IGNORE INTO fsas (code, zone_id) VALUES (?,?)')
    .run(code, req.body.zone_id ? Number(req.body.zone_id) : null);
  back(res, req, `${code} added. Customers there can order delivery right now.`);
});

router.post('/fsa/remove', (req, res) => {
  db.prepare('DELETE FROM fsas WHERE code=?').run(String(req.body.code || '').toUpperCase());
  back(res, req, 'Area removed.');
});

router.post('/settings/pickup', (req, res) => {
  settings.set('pickup_start', String(req.body.pickup_start || '16:00'));
  settings.set('pickup_end', String(req.body.pickup_end || '19:00'));
  back(res, req, 'Pickup window saved. Future days use the new window; orders already placed keep the window they were given.');
});

router.post('/settings/publishing', (req, res) => {
  settings.set('auto_publish', req.body.auto_publish ? 1 : 0);
  const wd = String(req.body.auto_publish_weekday || 'sat');
  if (T.WEEKDAYS.includes(wd)) settings.set('auto_publish_weekday', wd);
  const t = String(req.body.auto_publish_time || '12:00');
  if (/^\d{1,2}:\d{2}$/.test(t)) settings.set('auto_publish_time', t);

  settings.set('remind_missing_week', req.body.remind_missing_week ? 1 : 0);
  const lead = Math.max(0, Math.min(6, Math.floor(Number(req.body.remind_missing_week_days)) || 0));
  settings.set('remind_missing_week_days', lead);
  // A week already asked about stays asked about: saving this form twice
  // should not send the same reminder twice. A new lead time takes effect
  // from the next week.
  back(res, req, 'Publishing schedule saved.');
});

router.post('/settings/capacity', (req, res) => {
  const n = Math.max(0, Math.floor(Number(req.body.featured_daily_cap)) || 0);
  settings.set('featured_daily_cap', n);
  back(res, req, n === 0
    ? 'Saved. The featured dish now has no daily limit.'
    : `Saved. Up to ${n} of the featured dish a day, unless a day says otherwise.`);
});

router.post('/settings/delivery', (req, res) => {
  settings.set('delivery_enabled', req.body.delivery_enabled ? 1 : 0);
  settings.set('delivery_fee', IF.cents(req.body.delivery_fee) || 0);
  settings.set('delivery_min', IF.cents(req.body.delivery_min) || 0);
  settings.set('delivery_window', String(req.body.delivery_window || '').trim());
  back(res, req, 'Delivery settings saved. Orders already placed keep the fee they were quoted.');
});

/* ============================== SETTINGS ================================= */
router.get('/settings', (req, res) => {
  const conn = FB.connection();
  const terms = A.dictionary();
  const grouped = new Map();
  for (const t of terms) {
    if (!grouped.has(t.allergen)) grouped.set(t.allergen, []);
    grouped.get(t.allergen).push(t.term);
  }

  const body = html`
    <h1>Settings</h1>

    <div class="card">
      <h2>The basics</h2>
      <form method="post" action="/admin/settings">
        <label for="bn">Business name</label>
        <input type="text" id="bn" name="business_name" value="${settings.get('business_name')}">
        <label for="tzs">Time zone</label>
        <input type="text" id="tzs" name="timezone" value="${settings.get('timezone')}">
        <label for="ch">Orders close at (the evening before each service day)</label>
        <input type="time" id="ch" name="cutoff_time"
          value="${String(settings.getInt('cutoff_hour', 22)).padStart(2, '0')}:${String(settings.getInt('cutoff_minute', 0)).padStart(2, '0')}">
        <p class="also">Monday service closes Sunday at this time. There are no same-day orders:
          past this, an order can only arrive as a late request, and only until the time below.</p>
        <label for="lc">Late requests stop at (the morning of each service day)</label>
        <input type="time" id="lc" name="late_cutoff_time"
          value="${String(settings.getInt('late_cutoff_hour', 6)).padStart(2, '0')}:${String(settings.getInt('late_cutoff_minute', 0)).padStart(2, '0')}">
        <p class="also">After this, nothing at all is taken for that day — the order form comes off
          the page and the server refuses it. Set it to when the shopping is done.</p>
        <label for="pay">Payment instructions shown to customers</label>
        <textarea id="pay" name="payment_instructions" rows="3">${settings.get('payment_instructions')}</textarea>
        <label for="oc">How customers reach you</label>
        <input type="text" id="oc" name="owner_contact" value="${settings.get('owner_contact')}">
        <label for="ne">Where new orders are emailed</label>
        <input type="email" multiple id="ne" name="notify_email" value="${settings.get('notify_email')}">
        <p class="also">More than one address is fine — separate them with commas. Everything
          addressed to you goes to all of them: new orders, late requests, a refused publish,
          and the reminder when no week has been built.</p>
        <button class="btn btn--primary" type="submit">Save settings</button>
      </form>
    </div>

    <div class="card">
      <h2>Publishing</h2>
      <p class="also">A finished week can go live on its own, on the weekday before it starts.
        <strong>A scheduled publish never skips the allergen review.</strong> If anything on the
        week still needs reviewing at that moment, nothing is published, you get an email saying
        which dish, and the week goes out by itself as soon as you finish it.</p>
      <form method="post" action="/admin/settings/publishing">
        <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
          <input type="checkbox" name="auto_publish" value="1" style="width:22px;height:22px"${settings.get('auto_publish', '1') === '1' ? ' checked' : ''}>
          Publish a finished week automatically</label>
        <div class="stack2">
          <div>
            <label for="apwd">Day</label>
            <select id="apwd" name="auto_publish_weekday">
              ${T.WEEKDAYS_MON_FIRST.map((w) => html`<option value="${w}"${settings.get('auto_publish_weekday', 'sat') === w ? ' selected' : ''}>${T.WEEKDAY_LABELS[w]}</option>`)}
            </select>
          </div>
          <div>
            <label for="aptime">Time</label>
            <input type="time" id="aptime" name="auto_publish_time" value="${settings.get('auto_publish_time', '12:00')}">
          </div>
        </div>
        <p class="also">That is the ${T.WEEKDAY_LABELS[settings.get('auto_publish_weekday', 'sat')] || 'day'}
          <em>before</em> the week starts, in ${settings.get('timezone')} — so it stays the same
          clock time when the clocks change.</p>

        <fieldset>
          <legend>If no week has been built</legend>
          <p class="also">The schedule can only publish a week that exists. If nothing has been
            started for the week ahead, you get one email — early enough to cook, or to close
            the week on purpose.</p>
          <label style="display:flex;gap:var(--dbd-sp-2);align-items:center">
            <input type="checkbox" name="remind_missing_week" value="1" style="width:22px;height:22px"${settings.get('remind_missing_week', '1') === '1' ? ' checked' : ''}>
            Email me when there's no week built</label>
          <label for="rmwd">How many days before the publish time</label>
          <input type="number" id="rmwd" name="remind_missing_week_days" min="0" max="6" step="1"
            value="${settings.getInt('remind_missing_week_days', 2)}">
          <p class="also">${(() => {
            const wd = settings.get('auto_publish_weekday', 'sat');
            const lead = Math.max(0, Math.min(6, settings.getInt('remind_missing_week_days', 2) || 0));
            const idx = T.WEEKDAYS.indexOf(wd);
            const dayName = idx < 0 ? 'that day' : T.WEEKDAY_LABELS[T.WEEKDAYS[(idx - lead + 7) % 7]];
            return `As things stand: ${dayName} at ${settings.get('auto_publish_time', '12:00')}.`;
          })()} One email a week at most, and none once the week is built or closed.</p>
        </fieldset>

        <button class="btn btn--primary" type="submit">Save publishing schedule</button>
      </form>
    </div>

    <div class="card">
      <h2>How many of the featured dish</h2>
      <p class="also">The most you'll cook of a day's featured dish, counting both sizes
        together — one full size and one meal for one uses two of them. A single day can
        be given its own number in This Week. Set this to 0 for no limit.</p>
      <form method="post" action="/admin/settings/capacity">
        <label for="fcap">Featured dish per day</label>
        <input type="number" id="fcap" name="featured_daily_cap" min="0" step="1"
          value="${settings.get('featured_daily_cap')}">
        <button class="btn btn--primary" type="submit">Save</button>
      </form>
    </div>

    <div class="card">
      <h2>Facebook</h2>
      ${facebookPanel(conn)}
    </div>

    <div class="card">
      <h2>Allergen words</h2>
      <p class="also">These are the words that trigger a suggestion. Suggestions are never
        applied on their own — you always accept or dismiss each one, and you always tick
        the review box before a dish can go live.</p>
      <form method="post" action="/admin/allergen-terms/add">
        <div class="dl-row">
          <input type="text" name="term" placeholder="Word the kitchen uses, e.g. brown butter" style="flex:2 1 200px" required>
          <select name="allergen" style="flex:1 1 150px">
            ${A.HEALTH_CANADA_ORDER.map((a) => html`<option value="${a}">${a}</option>`)}
          </select>
          <button class="btn btn--primary" type="submit">Add word</button>
        </div>
      </form>
      ${[...grouped.entries()].map(([allergen, list]) => html`
        <h3 class="subhead">${allergen} <span class="variant__label">(${list.length} words)</span></h3>
        <!-- The ✕ is the form. It used to be a link that reached across the
             page for a hidden form and submitted it from an onclick, which
             needed script to remove a word and broke without it. -->
        <p>${list.map((t) => html`<form method="post" action="/admin/allergen-terms/remove" class="chip chip--rm">
            <input type="hidden" name="term" value="${t}">
            <input type="hidden" name="allergen" value="${allergen}">
            ${t} <button type="submit" title="Remove ${t}" aria-label="Remove ${t}">✕</button>
          </form>`)}</p>`)}
    </div>

    <div class="card">
      <h2>Backup</h2>
      <p class="also">The backup holds every week, dish, soup, salad, standing item, order,
        allergen word and setting. It never contains your Facebook token or any password.</p>
      <div class="dl-row">
        <a class="btn btn--secondary" href="/admin/export/backup.json">Download full backup</a>
        <a class="btn btn--secondary" href="/admin/export/contacts.csv">Download customer contacts</a>
      </div>
      <h3 class="subhead">Restore</h3>
      <form method="post" action="/admin/restore" enctype="multipart/form-data"
        data-confirm="Restoring replaces everything currently in the app with the contents of that file. Type RESTORE in the box first.">
        <input type="file" name="backup" accept="application/json" required>
        <label for="rc">Type RESTORE to confirm</label>
        <input type="text" id="rc" name="confirm" placeholder="RESTORE">
        <button class="btn btn--secondary" type="submit">Restore from backup</button>
      </form>
    </div>`;

  res.type('html').send(String(V.shell({ title: 'Settings', body, current: 'settings' })));
});

function facebookPanel(conn) {
  const configured = !!(config.facebook.appId && config.facebook.appSecret && config.tokenKey);

  const groupNote = html`<div class="notice notice--strong">
    <strong>Groups can't be posted to automatically.</strong> Facebook shut that off for all
    apps in April 2024. For your group, use <strong>Copy post text</strong> below and paste it
    in yourself — the text and image are exactly what a Page post would get.</div>`;

  if (!configured) {
    return html`
      <p>Facebook publishing isn't set up on this server yet. You can still use
        <strong>Copy post text</strong> on any week — that always works.</p>
      ${groupNote}`;
  }
  if (!conn || !conn.hasToken) {
    return html`
      <p>Connecting lets the app post this week's menu to <strong>one Facebook Page you choose</strong>,
        as you. It can't read your messages, your friends, or anything else, and it never posts
        without you pressing Publish and confirming.</p>
      <p><a class="btn btn--primary" href="/admin/facebook/connect">Connect Facebook</a></p>
      ${groupNote}`;
  }
  return html`
    <p><strong>Connected as ${conn.fb_user_name}</strong><br>
      Posting to <strong>${conn.page_name}</strong><br>
      <span class="variant__label">Connection expires
        ${conn.expires_at ? new Date(conn.expires_at).toISOString().slice(0, 10) : 'unknown'}</span></p>
    ${conn.stale ? html`<div class="notice notice--strong">
      Facebook rejected the last publish. Reconnect to fix it.</div>` : ''}
    ${conn.expiringSoon ? html`<div class="notice notice--strong">
      This connection expires in ${conn.daysToExpiry} day${conn.daysToExpiry === 1 ? '' : 's'}.
      Reconnect now so publishing doesn't fail on a Sunday night.</div>` : ''}
    <div class="dl-row">
      <a class="btn btn--secondary" href="/admin/facebook/connect">Reconnect</a>
      ${V.confirmForm({
        action: '/admin/facebook/disconnect',
        buttonLabel: 'Disconnect',
        message: `Disconnect Facebook? The app forgets the connection and stops being able to post to ${conn.page_name}. Posts already published stay up.`,
      })}
    </div>
    ${groupNote}`;
}

router.post('/settings', (req, res) => {
  const t = String(req.body.cutoff_time || '22:00').split(':');
  const l = String(req.body.late_cutoff_time || '06:00').split(':');
  for (const k of ['business_name', 'timezone', 'payment_instructions', 'owner_contact']) {
    if (req.body[k] !== undefined) settings.set(k, String(req.body[k]).trim());
  }
  // Stored tidy rather than raw: the field takes a comma-separated list, and a
  // trailing comma would otherwise reach nodemailer as an empty recipient.
  if (req.body.notify_email !== undefined) {
    settings.set('notify_email', String(req.body.notify_email)
      .split(',').map((a) => a.trim()).filter(Boolean).join(', '));
  }
  // Number(x) || fallback would turn a legitimate 0 into the fallback, which
  // for an hour is the difference between midnight and six in the morning.
  // The main cutoff used to do exactly that while this note sat underneath it
  // describing the hazard, so a cutoff of 00:30 was stored as 22:30 — and an
  // hour of 99 was stored as 99, which pushes the cutoff days past the day it
  // guards and stops it firing at all. Both go through the same clamp now.
  const hhmm = (parts, hourDefault, minuteDefault) => {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    return [
      Number.isFinite(h) && h >= 0 && h <= 23 ? h : hourDefault,
      Number.isFinite(m) && m >= 0 && m <= 59 ? m : minuteDefault,
    ];
  };
  const [cutoffHour, cutoffMinute] = hhmm(t, 22, 0);
  const [lateHour, lateMinute] = hhmm(l, 6, 0);
  settings.set('cutoff_hour', cutoffHour);
  settings.set('cutoff_minute', cutoffMinute);
  settings.set('late_cutoff_hour', lateHour);
  settings.set('late_cutoff_minute', lateMinute);
  back(res, req, 'Settings saved.');
});

router.post('/allergen-terms/add', (req, res) => {
  const term = String(req.body.term || '').trim().toLowerCase();
  const allergen = String(req.body.allergen || '').trim();
  if (!term || !A.HEALTH_CANADA_ORDER.includes(allergen)) {
    return back(res, req, null, 'Enter a word and pick which allergen it points to.');
  }
  db.prepare('INSERT OR IGNORE INTO allergen_terms (term, allergen) VALUES (?,?)').run(term, allergen);
  back(res, req, `"${term}" now suggests ${allergen} the next time you edit a description.`);
});

router.post('/allergen-terms/remove', (req, res) => {
  db.prepare('DELETE FROM allergen_terms WHERE term=? AND allergen=?')
    .run(String(req.body.term || ''), String(req.body.allergen || ''));
  back(res, req, 'Word removed. Tags already on your dishes are untouched.');
});

module.exports = { router, facebookPanel };
