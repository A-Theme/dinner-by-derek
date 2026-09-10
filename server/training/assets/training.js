/* Training mode, client side.
 *
 * A separate file from public/admin.js on purpose. The real script posts to
 * /admin/api/suggest, /admin/api/proofread and /admin/api/upload — the last of
 * which writes a file to the server's disk. Pointing training screens at those
 * would put a training gesture on a real code path, which is the one thing
 * this module must never do. So the behaviours are reimplemented here against
 * /admin-training/api/*, and the photo box never leaves the browser at all.
 *
 * ES5-flavoured and framework-free, matching the real script. No inline script
 * anywhere: the site's CSP is script-src 'self' and this file lives inside it.
 */
(function () {
  'use strict';

  var BASE = '/admin-training';

  /* --- Toasts ------------------------------------------------------------ */
  function toast(message, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'bad' ? ' toast--bad' : '');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  /* --- Confirm dialogs ---------------------------------------------------
     Every destructive or outward-facing form carries data-confirm, exactly as
     the real dashboard's do, so the trainee meets the same speed bump. */
  var pending = null;
  var dialog = null;

  function buildDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'tr-dialog';
    var text = document.createElement('p');
    text.setAttribute('data-dialog-text', '');
    var nav = document.createElement('div');
    nav.className = 'tr-dialog__nav';
    var yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn btn--primary';
    yes.textContent = 'Yes, do it';
    var no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn btn--secondary';
    no.textContent = 'Cancel';
    nav.appendChild(yes);
    nav.appendChild(no);
    dialog.appendChild(text);
    dialog.appendChild(nav);
    document.body.appendChild(dialog);

    no.addEventListener('click', function () { pending = null; dialog.close(); });
    yes.addEventListener('click', function () {
      var form = pending;
      pending = null;
      dialog.close();
      if (form) { form.dataset.confirmed = '1'; form.submit(); }
    });
    return dialog;
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.dataset || !form.dataset.confirm) return;
    if (form.dataset.confirmed === '1') return;
    e.preventDefault();
    pending = form;
    var dlg = buildDialog();
    dlg.querySelector('[data-dialog-text]').textContent = form.dataset.confirm;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else if (window.confirm(form.dataset.confirm)) { form.dataset.confirmed = '1'; form.submit(); }
  });

  /* --- Copy buttons ------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.dataset.copy || '';
    var said = btn.dataset.copied || 'Copied.';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(said); },
        function () { toast('Could not copy. Select the text and copy it yourself.', 'bad'); });
    } else {
      toast('Could not copy. Select the text and copy it yourself.', 'bad');
    }
  });

  /* --- Print -------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-print]')) window.print();
  });

  /* --- The walkthrough ----------------------------------------------------
     The panel is server-rendered; this is the part that needs a browser —
     finding the control, opening whatever it is folded inside, and ringing it. */
  (function coach() {
    var panel = document.querySelector('[data-coach-panel]');
    if (!panel) return;
    var key = panel.getAttribute('data-coach-target');
    if (!key) return;
    var target = document.querySelector('[data-coach="' + key.replace(/"/g, '') + '"]');
    if (!target) return;

    /* Open every <details> between the target and the page, or the highlight
       rings a box nobody can see. This Week folds almost everything. */
    var node = target.parentNode;
    while (node && node !== document.body) {
      if (node.tagName === 'DETAILS') node.open = true;
      node = node.parentNode;
    }

    target.classList.add('tr-target');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    } catch (err) {
      target.scrollIntoView();
    }
  }());

  /* --- The item editor ----------------------------------------------------
     Allergen suggestions, tags, and the review tick. Same behaviour as the
     real editor, pointed at the sandbox's own dictionary. */

  /* Each editor's dish photo, in document order, collected for the single
     paste handler registered after the loop. */
  var pasteTargets = [];

  document.querySelectorAll('[data-editor]').forEach(function (ed) {
    var desc = ed.querySelector('[data-description]');
    var nameEl = ed.querySelector('[data-item-name]');
    var box = ed.querySelector('[data-suggestions]');
    var list = ed.querySelector('[data-sugg-list]');
    var tags = ed.querySelector('[data-tags]');
    var hiddenA = ed.querySelector('[data-allergens]');
    var hiddenD = ed.querySelector('[data-dismissed]');
    var ack = ed.querySelector('[data-ack]');
    var timer = null;

    if (!hiddenA || !hiddenD) return;

    function accepted() { try { return JSON.parse(hiddenA.value || '[]'); } catch (e) { return []; } }
    function dismissed() { try { return JSON.parse(hiddenD.value || '[]'); } catch (e) { return []; } }

    /* Mirrors reviewedText() on the server. Both halves, both trimmed. */
    function reviewedText() {
      return (nameEl ? nameEl.value : '').trim() + '\n' + (desc ? desc.value : '').trim();
    }

    function renderTags() {
      if (!tags) return;
      tags.innerHTML = '';
      accepted().forEach(function (a) {
        var s = document.createElement('span');
        s.className = 'tag';
        s.textContent = a + ' ';
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = '✕';
        b.setAttribute('aria-label', 'Remove ' + a);
        b.addEventListener('click', function () {
          hiddenA.value = JSON.stringify(accepted().filter(function (x) { return x !== a; }));
          renderTags();
          suggest();
        });
        s.appendChild(b);
        tags.appendChild(s);
      });
    }

    function suggest() {
      if (!desc || !box || !list) return;
      fetch(BASE + '/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameEl ? nameEl.value : '',
          description: desc.value,
          accepted: accepted(),
          dismissed: dismissed()
        })
      }).then(function (r) { return r.json(); }).then(function (data) {
        list.innerHTML = '';
        if (!data || !Array.isArray(data.pending)) { box.hidden = true; return; }
        box.hidden = !data.pending.length;
        data.pending.forEach(function (p) {
          /* Built as nodes, not as a string: the allergen and its matched terms
             come out of a dictionary the trainee can edit. */
          var w = document.createElement('span');
          w.className = 'sugg';
          var chip = document.createElement('span');
          chip.textContent = p.allergen + ' ';
          var terms = document.createElement('span');
          terms.style.opacity = '.7';
          terms.textContent = '(' + p.terms.join(', ') + ')';
          chip.appendChild(terms);
          w.appendChild(chip);

          var yes = document.createElement('button');
          yes.type = 'button';
          yes.textContent = '✓';
          yes.setAttribute('aria-label', 'Accept ' + p.allergen);
          yes.addEventListener('click', function () {
            var a = accepted();
            a.push(p.allergen);
            hiddenA.value = JSON.stringify(a);
            renderTags();
            suggest();
          });

          var no = document.createElement('button');
          no.type = 'button';
          no.textContent = '✕';
          no.setAttribute('aria-label', 'Dismiss ' + p.allergen);
          no.addEventListener('click', function () {
            var d2 = dismissed();
            d2.push(p.allergen);
            hiddenD.value = JSON.stringify(d2);
            suggest();
          });

          w.appendChild(yes);
          w.appendChild(no);
          list.appendChild(w);
        });
      }).catch(function () { /* suggestions are advisory; silence is fine */ });
    }

    if (desc) {
      /* Editing either half invalidates a previous review, because the
         suggestions are read from both. */
      var edited = function (what) {
        return function () {
          clearTimeout(timer);
          timer = setTimeout(suggest, 400);
          if (ack && ack.checked && reviewedText() !== desc.dataset.ackOf) {
            ack.checked = false;
            toast(what + ' changed — please review the allergens again.', 'bad');
          }
        };
      };
      desc.addEventListener('input', edited('Description'));
      if (nameEl) nameEl.addEventListener('input', edited('Name'));
      suggest();
    }

    var add = ed.querySelector('[data-add-allergen]');
    if (add) {
      add.addEventListener('change', function () {
        if (!add.value) return;
        var a = accepted();
        if (a.indexOf(add.value) === -1) a.push(add.value);
        hiddenA.value = JSON.stringify(a);
        add.value = '';
        renderTags();
        suggest();
      });
    }

    renderTags();

    /* --- Photo boxes ------------------------------------------------------
       Nothing is uploaded. The picture is read in the browser and shown, and
       the field carries a sandbox name so the rest of the form behaves as it
       would with a real one. */
    ed.querySelectorAll('[data-photoslot]').forEach(function (slot, slotIndex) {
      var drop = slot.querySelector('[data-drop]');
      var file = slot.querySelector('[data-file]');
      var cam = slot.querySelector('[data-camera]');
      var photo = slot.querySelector('[data-photo]');
      var clear = slot.querySelector('[data-clearphoto]');
      var preview = slot.querySelector('[data-preview]');
      var msg = slot.querySelector('.dz-msg');
      if (!drop || !file || !cam || !photo) return;

      function show(name, dataUrl) {
        photo.value = name;
        if (preview) {
          preview.hidden = false;
          preview.textContent = 'Photo on file: ' + name;
          if (dataUrl) {
            var img = document.createElement('img');
            img.src = dataUrl;
            img.alt = '';
            preview.appendChild(img);
          }
        }
        if (clear) clear.hidden = false;
        if (msg) msg.textContent = 'Added. In training the picture stays in this browser.';
      }

      function take(f) {
        if (!f) return;
        if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name || '')) {
          if (msg) msg.textContent = 'That is not a picture. Try a photo.';
          return;
        }
        var name = 'training-' + Date.now().toString(36) + '.jpg';
        var reader = new FileReader();
        reader.onload = function () { show(name, String(reader.result)); };
        reader.onerror = function () { show(name, null); };
        reader.readAsDataURL(f);
      }

      drop.addEventListener('click', function (e) {
        if (e.target.tagName === 'BUTTON') return;
        file.click();
      });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        take(e.dataTransfer && e.dataTransfer.files[0]);
      });
      file.addEventListener('change', function () { take(file.files[0]); });
      cam.addEventListener('change', function () { take(cam.files[0]); });

      var takeBtn = slot.querySelector('[data-take]');
      var chooseBtn = slot.querySelector('[data-choose]');
      if (takeBtn) takeBtn.addEventListener('click', function () { cam.click(); });
      if (chooseBtn) chooseBtn.addEventListener('click', function () { file.click(); });
      if (clear) {
        clear.addEventListener('click', function () {
          photo.value = '';
          if (preview) { preview.hidden = true; preview.textContent = ''; }
          clear.hidden = true;
          if (msg) msg.textContent = 'Photo removed.';
        });
      }

      /* Paste fills the dish photo and nothing else — the meal-for-one box is
         filled from its own two buttons. Collected here rather than given a
         listener of its own; the handler below the editor loop says why. */
      if (slotIndex === 0) pasteTargets.push({ editor: ed, take: take, msg: msg });
    });
  });

  /* --- One pasted image, one dish ------------------------------------------
   * ONE listener for the page, deliberately.
   *
   * The real dashboard had this registered inside the editor loop, guarded by
   * `slotIndex === 0` — which counts slots within an editor, not editors
   * within a page. This Week draws thirteen editors, so it drew thirteen
   * listeners; the six that sit in plain cards rather than inside a <details>
   * all fired, and a single Ctrl+V set the same photo on six unrelated dishes.
   * It was found and fixed in the real app on 2026-09-09, and the training
   * copy is written the corrected way rather than reproducing the fault.
   *
   * The target is the editor being worked in: the one holding focus, which is
   * the strongest statement anybody makes about which box they mean, and
   * failing that the one last touched. If neither names an editor, nothing
   * happens — no photo is a better answer than six wrong ones, and the two
   * buttons in every box still work.
   */
  var lastEditor = null;
  var noteEditor = function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-editor]');
    if (el) lastEditor = el;
  };
  document.addEventListener('focusin', noteEditor);
  document.addEventListener('click', noteEditor);

  window.addEventListener('paste', function (e) {
    if (!pasteTargets.length) return;
    var items = (e.clipboardData || {}).items || [];
    var file = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === 0) { file = items[i].getAsFile(); break; }
    }
    if (!file) return;

    var active = document.activeElement
      && document.activeElement.closest
      && document.activeElement.closest('[data-editor]');
    var wanted = active || lastEditor;
    if (!wanted) {
      toast('Tap the dish you meant first, then paste.', 'bad');
      return;
    }
    for (var j = 0; j < pasteTargets.length; j++) {
      if (pasteTargets[j].editor === wanted) {
        pasteTargets[j].take(file);
        return;
      }
    }
  });

  /* --- The proofreader ----------------------------------------------------
     Advisory, like the allergen chips. Nothing is applied until a chip is
     tapped, and the field saves exactly as typed either way. */
  document.querySelectorAll('[data-proof]').forEach(function (field) {
    field.setAttribute('spellcheck', 'true');
    field.setAttribute('lang', 'en-CA');

    var box = document.createElement('div');
    box.className = 'suggestions proof';
    box.hidden = true;
    var head = document.createElement('div');
    head.className = 'suggestions__label';
    box.appendChild(head);
    var list = document.createElement('div');
    box.appendChild(list);

    var anchor = field.parentNode && field.parentNode.tagName === 'LABEL' ? field.parentNode : field;
    if (!anchor.parentNode) return;
    anchor.parentNode.insertBefore(box, anchor.nextSibling);

    var timer = null;
    var ignored = {};

    function keyOf(f) { return f.kind + '|' + f.found + '|' + f.suggestion; }

    function apply(f) {
      var text = field.value;
      /* Checked before it is spliced: the findings were computed against the
         text as it was, and the trainee can keep typing while the panel is up. */
      if (text.slice(f.start, f.end) !== f.found) {
        toast('That bit has changed since it was flagged — have another look.', 'bad');
        check();
        return;
      }
      field.value = text.slice(0, f.start) + f.suggestion + text.slice(f.end);
      /* Fired, not assumed: the allergen review is listening for input on this
         field, and a value set from script raises no event of its own. */
      field.dispatchEvent(new Event('input', { bubbles: true }));
      check();
    }

    function render(findings) {
      list.innerHTML = '';
      var live = findings.filter(function (f) { return !ignored[keyOf(f)]; });
      box.hidden = !live.length;
      if (!live.length) return;
      head.textContent = 'Worth a look — the short training version of the proofreader. '
        + 'Nothing changes until you tap ✓.';
      live.slice(0, 6).forEach(function (f) {
        var row = document.createElement('span');
        row.className = 'sugg';
        var label = document.createElement('span');
        var shown = f.found === '' ? 'nothing'
          : (f.kind === 'spacing' ? f.found.replace(/[ \t]/g, '␣') : f.found);
        var to = f.suggestion === '' ? 'nothing'
          : (f.kind === 'spacing' ? f.suggestion.replace(/[ \t]/g, '␣') : f.suggestion);
        label.textContent = shown + ' → ' + to + ' ';
        row.appendChild(label);

        var yes = document.createElement('button');
        yes.type = 'button';
        yes.textContent = '✓';
        yes.setAttribute('aria-label', 'Change ' + shown + ' to ' + to);
        yes.addEventListener('click', function () { apply(f); });

        var no = document.createElement('button');
        no.type = 'button';
        no.textContent = '✕';
        no.setAttribute('aria-label', 'Leave ' + shown + ' as it is');
        no.addEventListener('click', function () { ignored[keyOf(f)] = true; check(); });

        row.appendChild(yes);
        row.appendChild(no);
        list.appendChild(row);
      });
    }

    function check() {
      fetch(BASE + '/api/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: field.value })
      }).then(function (r) { return r.json(); })
        .then(function (d) { render((d && d.findings) || []); })
        .catch(function () { /* advisory */ });
    }

    field.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(check, 500);
    });
    check();
  });

  /* --- Countdowns --------------------------------------------------------- */
  document.querySelectorAll('[data-countdown]').forEach(function (el) {
    var at = new Date(el.getAttribute('data-countdown')).getTime();
    if (!at) return;
    function tick() {
      var left = at - Date.now();
      if (left <= 0) { el.textContent = 'no time'; return; }
      var h = Math.floor(left / 3600000);
      var m = Math.floor((left % 3600000) / 60000);
      el.textContent = h >= 24
        ? Math.floor(h / 24) + ' days ' + (h % 24) + ' hours'
        : h + ' hours ' + m + ' minutes';
    }
    tick();
    setInterval(tick, 30000);
  });

  /* --- Autosave marker ----------------------------------------------------
     The real dashboard posts drafts as you type. Training shows the same
     reassurance without the request: nothing is at stake in a sandbox, and a
     background POST per keystroke is a habit worth not teaching. */
  document.querySelectorAll('form[data-autosave]').forEach(function (form) {
    var flag = form.querySelector('[data-saveflag]');
    if (!flag) return;
    var timer = null;
    form.addEventListener('input', function () {
      flag.textContent = 'Unsaved changes';
      clearTimeout(timer);
      timer = setTimeout(function () {
        flag.textContent = 'Draft kept in this browser — press Save to store it';
      }, 900);
    });
  });
}());
